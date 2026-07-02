<!--
    富文本编辑器（wangEditor v5 受控组件）

    设计要点：
    1. v-model:html 双向绑定：父组件只关心 HTML 字符串
    2. 内部用 ref 存编辑器实例，onChange 时同步父组件
    3. 上传走 customUpload hook（不走 uploadImgServer），复用 /api/upload/file
    4. XSS 防护：每次 emit 前用 DOMPurify 白名单清洗
    5. 暗黑模式：监听 useSettingsStore.resolvedTheme，动态切换 .dark class

    使用：
      <RichEditor v-model:html="form.content" placeholder="请输入内容" />

    props:
      html             — 父组件传入的 HTML 字符串
      placeholder      — 编辑器空提示
      minHeight        — 最小高度（默认 300px）
      disabled         — 只读
      customUpload     — 自定义上传函数（不传则用默认 uploadFile）
-->
<template>
    <div class="rich-editor" :class="{ 'rich-editor--dark': isDark }">
        <!-- 工具栏容器（wangEditor 必填） -->
        <Toolbar class="rich-editor__toolbar" :editor="editorRef" :default-config="toolbarConfig" :mode="mode" />
        <!-- 编辑器容器 -->
        <Editor
            v-model="htmlValue"
            class="rich-editor__editor"
            :style="{ minHeight: minHeight + 'px' }"
            :default-config="editorConfig"
            :mode="mode"
            @on-created="onCreated"
            @on-change="onChange"
            @on-destroyed="onDestroyed"
            @custom-paste="onCustomPaste"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onBeforeUnmount, computed, nextTick } from 'vue';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import { Boot, type IEditorConfig, type IToolbarConfig, type IDomEditor } from '@wangeditor/editor';
import { uploadFile } from '@/api/bff/uploads';
import { useMessage } from 'naive-ui';
import { useSettingsStore } from '@/shared/stores/settings';
import { sanitizeRichHtml } from '@/shared/utils/sanitize-html';

// ====================== 类型定义 ======================
interface Props {
    /** 双向绑定的 HTML 内容 */
    html: string;
    /** 占位提示 */
    placeholder?: string;
    /** 最小高度（px） */
    minHeight?: number;
    /** 是否禁用 */
    disabled?: boolean;
    /** 自定义上传函数（默认走 /api/upload/file） */
    customUpload?: (file: File) => Promise<string>;
}

interface Emits {
    /** 内容变化时（已清洗） */
    (e: 'update:html', value: string): void;
    /** 编辑器失焦 */
    (e: 'blur'): void;
    /** 编辑器获得焦点 */
    (e: 'focus'): void;
}

const props = withDefaults(defineProps<Props>(), {
    placeholder: '请输入内容...',
    minHeight: 300,
    disabled: false,
    customUpload: undefined,
});
const emit = defineEmits<Emits>();

// ====================== 状态 ======================
const message = useMessage();
const settings = useSettingsStore();
// 暗黑模式：以 app settings 为准（settings store 监听 resolvedTheme 后会自动给 <html> 加 .dark）
// 不直接用 useDark()，因为 useDark 读的是 <html class="dark">，会和 settings 的 watchEffect 形成重复同步
const isDark = computed(() => (settings.resolvedTheme === null ? false : settings.resolvedTheme.name === 'dark'));
const editorRef = shallowRef<InstanceType<typeof Editor> | null>(null);
// 本地 HTML 镜像（v-model 绑定到 wangEditor 的 defaultHtml）
const htmlValue = ref<string>(props.html || '');
// mode: 'default' / 'simple'，默认用 default（功能完整）
const mode = 'default';

// 工具栏配置：核心按钮 + 上传 + 撤销/重做 + 全屏
const toolbarConfig: Partial<IToolbarConfig> = {
    toolbarKeys: [
        'bold',
        'underline',
        'italic',
        'through',
        'code',
        'sub',
        'sup',
        '|',
        'headerSelect',
        'fontSize',
        'fontFamily',
        '|',
        'color',
        'bgColor',
        '|',
        'clearStyle',
        '|',
        'bulletedList',
        'numberedList',
        'todo',
        '|',
        'justifyLeft',
        'justifyRight',
        'justifyCenter',
        'justifyJustify',
        '|',
        'lineHeight',
        'indent',
        'delIndent',
        '|',
        'insertLink',
        'uploadImage',
        'insertImage',
        '|',
        'blockquote',
        'codeBlock',
        'divider',
        'insertTable',
        '|',
        'undo',
        'redo',
        '|',
        'fullScreen',
    ],
};

// 编辑器配置
const editorConfig: Partial<IEditorConfig> = {
    placeholder: props.placeholder,
    readOnly: props.disabled,
    // 限制最大 10MB（与后端一致）
    maxLength: 0, // 0 表示不限制字符数（产品要求不设上限）
    // 自定义图片上传：走 customUpload hook
    customUpload: handleCustomUpload,
    // 限制粘贴行为：把外部 HTML 走 DOMPurify 清洗后再插入
    customPaste: (editor, event) => {
        const text = event.clipboardData?.getData('text/plain') || '';
        if (text) {
            editor.insertText(text);
        }
        // 阻止默认粘贴（不让带 HTML 结构的富文本直接进入编辑器）
        event.preventDefault();
    },
    MENU_CONF: {
        // 上传图片的配置
        uploadImage: {
            // 单文件大小限制（10MB）
            maxFileSize: 10 * 1024 * 1024,
            // 限制可上传的图片类型
            allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
            // 单次最多上传 1 张
            maxNumberOfFiles: 1,
        },
    },
};

// ====================== 钩子 ======================

/**
 * wangEditor 自定义上传钩子
 *
 * 流程：
 * 1. 拿到当前编辑器实例
 * 2. 通过 props.customUpload 或默认 uploadFile 上传
 * 3. 成功 → editor.insertImg(url) 插入图片
 * 4. 失败 → 提示用户
 */
async function handleCustomUpload(file: File, insertImgFn: (url: string) => void) {
    try {
        const uploader = props.customUpload ?? uploadFile;
        const url = await uploader(file);
        // wangEditor 提供的回调，会把图片插入到光标位置
        insertImgFn(url);
    } catch (err) {
        const msg = err instanceof Error ? err.message : '上传失败';
        message.error(`图片上传失败：${msg}`);
    }
}

/**
 * 粘贴时强制走纯文本（已在 editorConfig.customPaste 实现）
 * 此方法保留以满足 wangEditor 5.x 事件类型
 */
function onCustomPaste(_editor: IDomEditor, _event: ClipboardEvent) {
    // 已经在 editorConfig.customPaste 中处理
}

/**
 * 编辑器实例创建完毕
 */
function onCreated(editor: IDomEditor) {
    editorRef.value = editor as typeof editorRef.value;
}

/**
 * 内容变化时：清洗 + 通知父组件
 */
function onChange(editor: IDomEditor) {
    const rawHtml = editor.getHtml();
    const cleanHtml = sanitizeRichHtml(rawHtml);
    htmlValue.value = cleanHtml;
    emit('update:html', cleanHtml);
}

/**
 * 编辑器销毁：清理引用
 */
function onDestroyed() {
    editorRef.value = null;
}

// ====================== 工具方法 ======================
// sanitizeRichHtml 已抽到 shared/utils/sanitize-html.ts，前后端共用

// ====================== 监听 ======================

// 监听外部传入的 html 变化（例如表单重置）
watch(
    () => props.html,
    (newHtml) => {
        // 只有当外部 HTML 与当前编辑器内容不一致时才覆盖（避免无限循环）
        if (newHtml !== htmlValue.value && editorRef.value) {
            nextTick(() => {
                editorRef.value?.setHtml(newHtml || '');
                htmlValue.value = newHtml || '';
            });
        }
    },
);

// 监听禁用状态
watch(
    () => props.disabled,
    (disabled) => {
        if (editorRef.value) {
            if (disabled) {
                editorRef.value.disable();
            } else {
                editorRef.value.enable();
            }
        }
    },
);

// 清理
onBeforeUnmount(() => {
    if (editorRef.value) {
        editorRef.value.destroy();
        editorRef.value = null;
    }
});

// Boot 注册（wangEditor 5 必须调一次以初始化插件）
// 调用多次是无害的，但放到顶层 guard 避免重复
const BOOT_GUARD = Boot as Record<string, unknown>;
if (!BOOT_GUARD.__richEditorBooted) {
    BOOT_GUARD.__richEditorBooted = true;
    // 这里可以注册自定义插件，当前用默认即可
}
</script>

<style scoped>
/* 确保 wangEditor 内部编辑区域 ≥ 300px，消除 hoverbar 定位警告
   wangEditor 检查的是 .w-e-scroll 的高度，但其 CSS 是 height:100%，
   父元素不设显式高度时百分比会退化为 auto，需直接给 .w-e-scroll 设 min-height */
.rich-editor :deep(.w-e-scroll) {
    min-height: 300px;
}

/* ===== 容器 ===== */
.rich-editor {
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    background-color: #fff;
    overflow: hidden;
    transition: border-color 0.2s;
}
.rich-editor:focus-within {
    border-color: #18a058;
}
.rich-editor--dark {
    background-color: rgb(16, 16, 20);
    border-color: rgb(47, 47, 51);
}

/* ===== 工具栏 / 编辑区 ===== */
.rich-editor__toolbar {
    border-bottom: 1px solid #d9d9d9;
}
.rich-editor--dark .rich-editor__toolbar {
    border-bottom-color: rgb(47, 47, 51);
}

.rich-editor__editor {
    overflow-y: auto;
}

/* ===== 暗黑模式适配（覆盖 wangEditor 默认浅色） ===== */
.rich-editor--dark :deep(.w-e-text-container) {
    background-color: rgb(16, 16, 20);
    color: rgb(229, 229, 229);
}
.rich-editor--dark :deep(.w-e-text-placeholder) {
    color: rgb(102, 102, 102);
}
.rich-editor--dark :deep(.w-e-bar) {
    background-color: rgb(24, 24, 28);
    border-bottom-color: rgb(47, 47, 51);
}
.rich-editor--dark :deep(.w-e-bar-item) button:hover {
    background-color: rgb(47, 47, 51);
}
.rich-editor--dark :deep(.w-e-bar-item) .active {
    background-color: rgb(47, 47, 51);
    color: #18a058;
}
.rich-editor--dark :deep(.w-e-bar-dropdown) {
    background-color: rgb(24, 24, 28);
    border-color: rgb(47, 47, 51);
}
.rich-editor--dark :deep(.w-e-bar-dropdown-item) {
    color: rgb(229, 229, 229);
}
.rich-editor--dark :deep(.w-e-bar-dropdown-item:hover) {
    background-color: rgb(47, 47, 51);
}

/* 表格 / 引用 / 代码块 / 链接 / 列表等基本元素 */
.rich-editor :deep(table) {
    border-collapse: collapse;
}
.rich-editor :deep(th),
.rich-editor :deep(td) {
    border: 1px solid #d9d9d9;
    padding: 4px 8px;
}
.rich-editor--dark :deep(th),
.rich-editor--dark :deep(td) {
    border-color: rgb(47, 47, 51);
}
.rich-editor :deep(blockquote) {
    border-left: 3px solid #d9d9d9;
    padding-left: 12px;
    color: #666;
    margin: 8px 0;
}
.rich-editor--dark :deep(blockquote) {
    border-left-color: rgb(47, 47, 51);
    color: rgb(153, 153, 153);
}
.rich-editor :deep(pre) {
    background-color: #f5f5f5;
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
}
.rich-editor--dark :deep(pre) {
    background-color: rgb(24, 24, 28);
}
.rich-editor :deep(code) {
    background-color: #f5f5f5;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'SFMono-Regular', Consolas, monospace;
}
.rich-editor--dark :deep(code) {
    background-color: rgb(24, 24, 28);
}
.rich-editor :deep(a) {
    color: #18a058;
    text-decoration: underline;
}
</style>
