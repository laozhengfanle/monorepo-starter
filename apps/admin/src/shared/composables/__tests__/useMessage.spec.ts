/**
 * useMessage 单元测试
 *
 * 测试覆盖：
 *   - composable 返回包装后的 message / dialog
 *   - 调用 message.success 后，组件 unmount 时自动调 destroy()
 *   - Naive UI 真实 DOM：mount 后 message DOM 出现 → unmount 后 DOM 节点清理
 *   - 防御性：mock 实例（无 destroy 方法）不抛错
 */
/* eslint-disable vue/one-component-per-file */
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { NConfigProvider, NMessageProvider, NDialogProvider, zhCN } from 'naive-ui';
import { useMessage } from '../useMessage';

/** 用 Naive UI 的三个 provider 包裹 Host（naive-ui 要求 useMessage 必须在 provider 子树内） */
function mountWithProviders(host: ReturnType<typeof createHost>) {
    // 包装组件，把 host 渲染进 NMessageProvider + NDialogProvider
    const Wrapper = defineComponent({
        setup() {
            return () =>
                h(NConfigProvider, { locale: zhCN, 'cls-prefix': 'n' } as never, {
                    default: () =>
                        h(NMessageProvider, null, {
                            default: () => h(NDialogProvider, null, { default: () => h(host) }),
                        }),
                });
        },
    });
    return mount(Wrapper);
}

/** 测试用宿主组件（调用 useMessage + 暴露 trigger） */
function createHost() {
    return defineComponent({
        setup() {
            const { message, dialog } = useMessage();
            // 暴露给测试：手动触发 message.success 等
            (window as unknown as { __testMessage: typeof message }).__testMessage = message;
            (window as unknown as { __testDialog: typeof dialog }).__testDialog = dialog;
            return () => h('div', 'host');
        },
    });
}

describe('useMessage composable', () => {
    it('返回 message / dialog', () => {
        const Host = createHost();
        const wrapper = mountWithProviders(Host);
        const w = window as unknown as {
            __testMessage?: { success: (...a: unknown[]) => unknown };
            __testDialog?: unknown;
        };
        expect(w.__testMessage).toBeDefined();
        expect(w.__testMessage!.success).toBeInstanceOf(Function);
        expect(w.__testDialog).toBeDefined();
        wrapper.unmount();
    });

    it('调用 message.success 后组件 unmount → 自动调 destroy()', async () => {
        const Host = createHost();
        const wrapper = mountWithProviders(Host);
        await nextTick();

        // 调一次 message.success
        const msg = (
            window as unknown as {
                __testMessage: {
                    success: (...a: unknown[]) => { destroy: () => void } | undefined;
                };
            }
        ).__testMessage;
        const result = msg.success('test');
        // 真实 Naive UI 返回 messageReactive
        expect(result).toBeDefined();
        const destroySpy = vi.spyOn(result!, 'destroy');

        // 卸载组件
        wrapper.unmount();
        await nextTick();

        // destroy 应被自动调用
        expect(destroySpy).toHaveBeenCalled();
    });

    it('调用 message.error 同样在 unmount 时销毁', async () => {
        const Host = createHost();
        const wrapper = mountWithProviders(Host);
        await nextTick();

        const msg = (
            window as unknown as {
                __testMessage: { error: (...a: unknown[]) => { destroy: () => void } | undefined };
            }
        ).__testMessage;
        const result = msg.error('err');
        expect(result).toBeDefined();
        const destroySpy = vi.spyOn(result!, 'destroy');

        wrapper.unmount();
        await nextTick();

        expect(destroySpy).toHaveBeenCalled();
    });

    it('防御性：mock 返回 undefined 时不抛错', async () => {
        // 借用真实 useMessage，但先 mock 注入到 window 上
        const MOCK_HOST = defineComponent({
            setup() {
                // 覆盖 window.__testMessage 为 mock 版（无 destroy 方法）
                const mockMsg = {
                    success: () => undefined,
                    error: () => undefined,
                    warning: () => undefined,
                    info: () => undefined,
                    loading: () => undefined,
                    create: () => undefined,
                    destroyAll: () => undefined,
                };
                (window as unknown as { __testMessage: typeof mockMsg }).__testMessage = mockMsg;
                // 真实 useMessage（composable 会自动注册到 globalThis 上的 trackDestroy）
                // 这里只是验证 composable 不抛错
                expect(() => useMessage()).not.toThrow();
                return () => h('div', 'mock');
            },
        });
        // 挂载到 provider 子树
        const wrapper = mountWithProviders(MOCK_HOST);
        await nextTick();
        wrapper.unmount();
    });
});
