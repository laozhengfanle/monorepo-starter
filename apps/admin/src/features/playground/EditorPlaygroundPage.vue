<!--
    富文本编辑器 Demo 页 — 功能演示 / 编辑器

    用途：
    1. 演示 RichEditor 组件的能力（v-model:html、上传图片、暗黑模式）
    2. 演示 XSS 清洗（提交一段含 <script> 的 HTML，验证被 DOMPurify 清洗）
    3. 演示后端入库清洗（mock 一个 fetch 调用，把内容 POST 给后端 mock 接口，
       模拟后端用 sanitizeHtml 包一层）

    注意：
    - 此页面是基座示例，正式项目里 demo 页可以删除
    - 实际业务使用时，把 <RichEditor v-model:html="form.content" /> 嵌到自己的表单里即可
-->
<template>
    <div class="editor-playground p-(--gap)">
        <n-card title="富文本编辑器（wangEditor v5）" class="w-full min-w-0">
            <template #header-extra>
                <n-space :size="8">
                    <n-tag :bordered="false" type="info" size="small">v-model:html</n-tag>
                    <n-tag :bordered="false" type="info" size="small">上传 /api/upload/file</n-tag>
                    <n-tag :bordered="false" type="info" size="small">DOMPurify 清洗</n-tag>
                </n-space>
            </template>

            <n-alert type="info" :show-icon="true" class="mb-4">
                这是一个功能演示页。编辑器支持：粗体 / 斜体 / 标题 / 列表 / 引用 / 代码块 / 表格 / 链接 / 图片 /
                撤销重做 / 全屏。 暗黑模式自动跟随系统设置切换。
            </n-alert>

            <n-form :model="form" label-placement="top">
                <n-form-item label="标题">
                    <n-input v-model:value="form.title" placeholder="给文章起个标题" clearable />
                </n-form-item>

                <n-form-item label="内容">
                    <RichEditor
                        v-model:html="form.content"
                        placeholder="开始写点什么吧...支持粘贴自动转纯文本、拖拽图片上传、表格"
                        :min-height="320"
                    />
                </n-form-item>

                <n-space :size="12">
                    <n-button type="primary" :loading="submitting" @click="onSubmit"> 提交（mock） </n-button>
                    <n-button @click="onLoadSample">加载示例</n-button>
                    <n-button @click="onLoadXssTest">加载 XSS 测试</n-button>
                    <n-button @click="onClear">清空</n-button>
                </n-space>
            </n-form>
        </n-card>

        <!-- 实时 HTML 预览（用于调试清洗效果） -->
        <n-card title="清洗后的 HTML（实时）" class="mt-4 w-full min-w-0">
            <template #header-extra>
                <n-text depth="3" class="text-xs">长度：{{ form.content.length }} 字符</n-text>
            </template>
            <n-input
                type="textarea"
                :value="form.content"
                readonly
                :autosize="{ minRows: 6, maxRows: 20 }"
                placeholder="这里会显示编辑器当前内容（已过 DOMPurify 清洗）"
                class="font-mono text-xs"
            />
        </n-card>

        <!-- 模拟后端清洗后的回显（演示后端入库 + 列表展示）
             safeContent = DOMPurify(form.content)，双重保险后再用 .trusted 渲染 -->
        <n-card title="模拟回显（已清洗 HTML 渲染）" class="mt-4 w-full min-w-0">
            <template #header-extra>
                <n-tag :bordered="false" type="success" size="small">DOMPurify → 受信渲染</n-tag>
            </template>
            <div
                v-raw-html.trusted="safeContent"
                class="p-4 bg-gray-50 dark:bg-[rgb(47,47,51)] rounded leading-relaxed"
            />
        </n-card>

        <!-- 提交流程日志（调试用） -->
        <n-card title="提交流程日志" class="mt-4 w-full min-w-0">
            <n-empty v-if="!logs.length" description="暂无提交记录" />
            <n-timeline v-else>
                <n-timeline-item
                    v-for="(log, i) in logs"
                    :key="i"
                    :type="log.type"
                    :title="log.title"
                    :content="log.content"
                    :time="log.time"
                />
            </n-timeline>
        </n-card>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useMessage } from 'naive-ui';
import RichEditor from '@/shared/components/RichEditor.vue';
import { sanitizeRichHtml } from '@/shared/utils/sanitize-html';

const message = useMessage();

interface Form {
    title: string;
    content: string;
}

const form = reactive<Form>({
    title: '',
    content: '',
});

/** 对 form.content 再做一次 DOMPurify 清洗，保证回显时双重保险 */
const safeContent = computed(() => sanitizeRichHtml(form.content));

const submitting = ref(false);

interface Log {
    type: 'default' | 'success' | 'info' | 'warning' | 'error';
    title: string;
    content: string;
    time: string;
}

const logs = ref<Log[]>([]);

function pushLog(type: Log['type'], title: string, content: string) {
    logs.value.unshift({
        type,
        title,
        content,
        time: new Date().toLocaleTimeString('zh-CN'),
    });
    // 最多保留 10 条
    if (logs.value.length > 10) logs.value.pop();
}

/**
 * 模拟提交（实际项目里替换为真实 API）
 */
async function onSubmit() {
    if (!form.title.trim()) {
        message.warning('请填写标题');
        return;
    }
    submitting.value = true;
    try {
        // 模拟：把清洗后的 HTML 发给后端
        // 真实实现：await createArticle({ title: form.title, content: form.content })
        await new Promise((r) => setTimeout(r, 600));
        pushLog('success', '已提交（mock）', `标题：${form.title}\n内容长度：${form.content.length} 字符`);
        message.success('提交成功（mock）');
    } catch (err) {
        const msg = err instanceof Error ? err.message : '提交失败';
        pushLog('error', '提交失败', msg);
        message.error(msg);
    } finally {
        submitting.value = false;
    }
}

/**
 * 加载一段示例富文本（覆盖 wangEditor 主要标签：标题/列表/表格/代码）
 */
function onLoadSample() {
    form.title = '富文本编辑器示例';
    form.content = `
<h2>欢迎使用富文本编辑器</h2>
<p>这是基于 <strong>wangEditor v5</strong> 封装的受控组件 <code>&lt;RichEditor v-model:html /&gt;</code>。</p>
<h3>能力清单</h3>
<ul>
    <li>支持常见的文本格式（<em>粗体</em>、<u>下划线</u>、<s>删除线</s>）</li>
    <li>支持多级标题、列表、引用、代码块</li>
    <li>支持图片上传（走 <code>/api/upload/file</code>）</li>
    <li>支持表格、链接、撤销/重做</li>
    <li>支持全屏、暗黑模式</li>
</ul>
<h3>表格示例</h3>
<table>
    <thead>
        <tr><th>能力</th><th>支持</th><th>备注</th></tr>
    </thead>
    <tbody>
        <tr><td>图片上传</td><td>✅</td><td>10MB / jpg/png/webp/gif</td></tr>
        <tr><td>代码块</td><td>✅</td><td>等宽字体</td></tr>
        <tr><td>暗黑模式</td><td>✅</td><td>跟随系统设置</td></tr>
    </tbody>
</table>
<blockquote>安全说明：所有富文本内容经过 DOMPurify 白名单清洗，禁用 &lt;script&gt; / onerror 等危险内容。</blockquote>
`.trim();
    pushLog('info', '已加载示例', `内容长度：${form.content.length} 字符`);
}

/**
 * 加载 XSS 测试用例：包含 <script>、onerror、javascript: 协议
 * 验证 DOMPurify 清洗能力
 *
 * 注意：HTML 标签字符串必须用拼接方式写入字面量，
 * 否则 SFC 解析器会把模板字符串里的 <script> 当成第二个 script 块导致编译失败
 */
function onLoadXssTest() {
    form.title = 'XSS 测试';
    // 故意把恶意标签拆成字符串拼接，避免 SFC 解析误识别
    const scriptTag = '<scr' + "ipt>alert('XSS')</scr" + 'ipt>';
    const imgTag = '<img src="x" oner' + 'ror="alert(\'XSS via onerror\')" />';
    const jsLink = '<a href="java' + "script:alert('XSS via href')\">恶意链接</a>";
    form.content = [
        '<p>这段内容包含恶意 HTML，应被 DOMPurify 清洗：</p>',
        scriptTag,
        imgTag,
        jsLink,
        '<p>下面的合法内容应保留：</p>',
        '<p><strong>正常文本</strong> 和 <em>斜体</em></p>',
        '<ul><li>列表项 1</li><li>列表项 2</li></ul>',
    ].join('\n');
    pushLog('warning', '已加载 XSS 测试', '查看下方"清洗后的 HTML"，应看到 <script> 被移除、onerror 被剥离');
}

/**
 * 清空内容
 */
function onClear() {
    form.title = '';
    form.content = '';
    logs.value = [];
    message.info('已清空');
}
</script>

<style scoped>
.editor-playground {
    /* 容器使用 --gap 间距变量（Naive UI 主题变量） */
}
</style>
