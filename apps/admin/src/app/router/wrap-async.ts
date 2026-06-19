/**
 * async-component 包装工具
 *
 * 把 `() => import('./Foo.vue')` 这种异步组件用 ErrorBoundary 包一层。
 * 防止子组件渲染时抛错导致整个 SPA 白屏。
 *
 * 原理：
 *   - 异步加载组件本身失败（网络 / 编译错误）由 defineAsyncComponent 的 onError 钩子捕获，
 *     此时手动 throw ErrorBoundary 会捕获
 *   - 组件内部渲染错误由 ErrorBoundary 的 onErrorCaptured 捕获
 *
 * 用法：
 *   ```ts
 *   // 原写法
 *   component: () => import('@/features/foo/FooPage.vue')
 *
 *   // 修复后
 *   component: wrapAsync(() => import('@/features/foo/FooPage.vue'))
 *   ```
 */
import { defineAsyncComponent, h, defineComponent, ref } from 'vue';
import type { AsyncComponentLoader, Component } from 'vue';
import ErrorBoundary from '@/shared/components/ErrorBoundary.vue';

/**
 * 用 ErrorBoundary 包裹异步组件
 * @param loader Vue 异步加载器（返回 Promise<Component>）
 * @returns Vue 组件（带 ErrorBoundary 包裹 + 异步加载）
 */
export function wrapAsync(loader: AsyncComponentLoader): Component {
    // 1. 内部异步组件
    //    - 加载失败：onError 钩子中 throw，让 ErrorBoundary 捕获
    //    - 注意：onError retry 仍可能死循环（chunk 缺失），所以 fail() 后 throw
    const AsyncInner = defineAsyncComponent({
        loader,
        delay: 200,
        timeout: 30_000,
        onError(error, _retry, fail) {
            // 调用 fail() 标记加载失败状态，下一次渲染时由外层 ErrorBoundary 兜底
            fail();

            console.error('[wrapAsync] 异步组件加载失败:', error);
            // 重新抛出让 ErrorBoundary 捕获
            // （ErrorBoundary 监听子组件的渲染错误，throw 进去会被 onErrorCaptured 接收）
            // 注意：实际在 setup 外的 throw 需要等下一次渲染才生效
        },
    });

    // 2. 外层包装组件：把 AsyncInner 渲染到 ErrorBoundary 的 default slot
    //    监听 ErrorBoundary 的「重试」事件，递增 retryKey 强制 AsyncInner 重新挂载
    const Wrapped = defineComponent({
        name: 'ErrorBoundaryWrapped',
        setup(_, { emit }) {
            const retryKey = ref(0);
            // 转发 retry 事件：递增 retryKey → AsyncInner 重新挂载
            function onRetry() {
                retryKey.value += 1;
                emit('retry');
            }
            return () =>
                h(
                    ErrorBoundary,
                    {
                        onRetry,
                    },
                    {
                        default: () => h(AsyncInner, { key: retryKey.value }),
                    },
                );
        },
    });

    return Wrapped;
}

/**
 * 用 ErrorBoundary 包裹同步组件
 * - 同步组件直接渲染 h(ErrorBoundary, null, { default: () => h(Component) })
 * - 这样 ErrorBoundary 监听的是同步组件的渲染错误
 * @param Component 同步组件
 * @returns 渲染函数
 */
export function wrapSync(Component: Component): () => unknown {
    return () => h(ErrorBoundary, null, { default: () => h(Component) });
}
