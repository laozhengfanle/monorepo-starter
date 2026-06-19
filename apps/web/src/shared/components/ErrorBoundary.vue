<!--
    ErrorBoundary 组件（C 端版）

    捕获子组件错误 + 渲染失败 UI + 重试机制。
    文案硬编码中文（CLAUDE.md 明确禁止 i18n）
-->
<template>
    <div class="error-boundary">
        <div v-if="error" class="error-boundary__fallback flex items-center justify-center h-full">
            <n-result status="error" :title="finalTitle" :description="error.message">
                <template #footer>
                    <n-space>
                        <n-button type="primary" @click="retry">
                            {{ finalRetryText }}
                        </n-button>
                    </n-space>
                </template>
            </n-result>
        </div>
        <div v-else class="error-boundary__content">
            <slot v-if="renderKey >= 0" :key="renderKey" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';

interface Props {
    title?: string;
    retryText?: string;
}

const props = withDefaults(defineProps<Props>(), {
    title: '',
    retryText: '',
});

const finalTitle = props.title || '页面加载失败';
const finalRetryText = props.retryText || '重试';

const error = ref<Error | null>(null);
const renderKey = ref(0);

onErrorCaptured((err: unknown) => {
    const normalized = err instanceof Error ? err : new Error(String(err));
    error.value = normalized;

    console.error('[ErrorBoundary] 捕获到子组件错误:', normalized);
    return false;
});

function retry() {
    error.value = null;
    renderKey.value += 1;
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
