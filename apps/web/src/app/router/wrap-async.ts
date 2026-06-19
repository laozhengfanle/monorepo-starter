/**
 * async-component 包装工具（web 端）
 *
 * 把异步组件用 ErrorBoundary 包裹，防止子组件渲染错误导致 SPA 白屏。
 */
import { defineAsyncComponent, h, defineComponent, ref } from 'vue';
import type { AsyncComponentLoader, Component } from 'vue';
import ErrorBoundary from '@/shared/components/ErrorBoundary.vue';

export function wrapAsync(loader: AsyncComponentLoader): Component {
    const AsyncInner = defineAsyncComponent({
        loader,
        delay: 200,
        timeout: 30_000,
        onError(error, _retry, fail) {
            fail();

            console.error('[wrapAsync] 异步组件加载失败:', error);
        },
    });

    const Wrapped = defineComponent({
        name: 'ErrorBoundaryWrapped',
        setup() {
            const retryKey = ref(0);
            function onRetry() {
                retryKey.value += 1;
            }
            return () =>
                h(
                    ErrorBoundary,
                    { onRetry },
                    {
                        default: () => h(AsyncInner, { key: retryKey.value }),
                    },
                );
        },
    });

    return Wrapped;
}

export function wrapSync(Component: Component): () => unknown {
    return () => h(ErrorBoundary, null, { default: () => h(Component) });
}
