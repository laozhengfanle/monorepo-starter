<!--
    ErrorBoundary 组件

    捕获子组件渲染过程中的错误，避免整个 SPA 崩溃白屏。

    实现原理：
    - Vue 3 的 onErrorCaptured 钩子 + ref state 控制渲染
    - 一旦捕获到 error，渲染 Naive UI <n-result> 友好页面 + "重试"按钮
    - 重试时清空 error state + 卸载子组件 → 强制重新渲染

    用法（router 中包裹异步组件）：
        <ErrorBoundary>
            <component :is="asyncComponent" />
        </ErrorBoundary>

    与传统 class component error boundary 的差异：
    - React 的 ErrorBoundary 是 class component 模式（getDerivedStateFromError / componentDidCatch）
    - Vue 3 直接用 setup() + onErrorCaptured 即可
    - 不会捕获事件处理器 / 异步代码中的错误（这些要用 try-catch + global error handler）
-->
<template>
    <div class="error-boundary">
        <!-- 错误态：渲染友好失败 UI -->
        <div v-if="error" class="error-boundary__fallback flex items-center justify-center h-full">
            <n-result status="error" :title="finalTitle" :description="error.message">
                <template #footer>
                    <n-space>
                        <n-button type="primary" @click="retry">{{ finalRetryText }}</n-button>
                        <n-button v-if="showDetails" @click="showStack = true">
                            {{ finalDetailsText }}
                        </n-button>
                    </n-space>
                </template>
            </n-result>
        </div>

        <!-- 调试模式：可展开看堆栈 -->
        <n-modal v-model:show="showStack" preset="card" title="错误堆栈" style="max-width: 800px">
            <pre v-if="error?.stack" class="text-xs whitespace-pre-wrap">{{ error.stack }}</pre>
            <pre v-else-if="error" class="text-xs whitespace-pre-wrap">(无堆栈信息)</pre>
        </n-modal>

        <!-- 正常态：渲染子组件 -->
        <div v-if="!error" class="error-boundary__content">
            <slot />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onErrorCaptured } from 'vue';

/**
 * ErrorBoundary Props
 * - title: 错误标题（默认"页面加载失败"）
 * - retryText: 重试按钮文案（默认"重试"）
 * - showDetails: 是否显示"查看堆栈"按钮（默认 false，生产环境应关闭）
 * - detailsText: 堆栈按钮文案
 */
interface Props {
    title?: string;
    retryText?: string;
    showDetails?: boolean;
    detailsText?: string;
}

const props = withDefaults(defineProps<Props>(), {
    title: '',
    retryText: '',
    showDetails: false,
    detailsText: '',
});

/** 抛出 retry 事件（外部可监听，强制重新加载异步组件） */
const emit = defineEmits<{
    (e: 'retry'): void;
}>();

/** 兜底默认值（CLAUDE.md 明确禁止 i18n，所有文案硬编码中文） */
const finalTitle = computed(() => props.title || '页面加载失败');
const finalRetryText = computed(() => props.retryText || '重试');
const finalDetailsText = computed(() => props.detailsText || '查看堆栈');

/** 捕获到的错误对象 */
const error = ref<Error | null>(null);
/** 堆栈 modal 显示 */
const showStack = ref(false);

/**
 * Vue 3 错误捕获钩子
 * - 捕获子组件渲染过程抛出的错误
 * - 同步处理后返回 false：阻止错误继续向上冒泡到根 app
 */
onErrorCaptured((err: unknown) => {
    // 类型归一：Vue 抛出的可能不是 Error 子类
    const normalized = err instanceof Error ? err : new Error(String(err));
    error.value = normalized;

    // 控制台打印（开发调试用）

    console.error('[ErrorBoundary] 捕获到子组件错误:', normalized);

    // 返回 false：阻止错误冒泡到根 app（避免整个应用崩溃）
    return false;
});

/**
 * 重试：清空 error + emit retry 事件让外层强制重新挂载子组件
 * - 子组件自身的状态由外层 wrapAsync 通过 :key 重新挂载来重置
 */
function retry() {
    error.value = null;
    emit('retry');
}
</script>

<style scoped>
.error-boundary {
    width: 100%;
    height: 100%;
}
.error-boundary__fallback {
    min-height: 320px;
    padding: 24px;
}
</style>
