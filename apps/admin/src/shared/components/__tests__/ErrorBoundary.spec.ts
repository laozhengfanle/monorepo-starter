/**
 * ErrorBoundary 单元测试
 *
 * 测试覆盖：
 *   - 正常子组件能渲染
 *   - 抛错的子组件 → ErrorBoundary 捕获 → 渲染失败 UI（n-result）
 *   - 点击「重试」按钮 → 重新尝试渲染子组件
 *   - 不冒泡到根 app
 *
 * 注意：ErrorBoundary 文案已硬编码中文（CLAUDE.md 禁止 i18n），
 *       本测试不再需要 mock vue-i18n。
 */
/* eslint-disable vue/one-component-per-file */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import ErrorBoundary from '../ErrorBoundary.vue';

/** 通用 stub 工厂：各 mount() 调用复用，避免重复 4 个 stub 配置 */
function makeGlobalStubs() {
    return {
        stubs: {
            'n-result': {
                template: '<div class="n-result-stub"><slot name="footer" /></div>',
            },
            'n-space': { template: '<div class="n-space-stub"><slot /></div>' },
            'n-button': {
                template: '<button class="n-button-stub"><slot /></button>',
            },
            'n-modal': { template: '<div class="n-modal-stub"><slot /></div>' },
        },
    };
}

/** 渲染阶段抛错组件（render 中 throw） */
const ThrowingRenderChild = defineComponent({
    name: 'ThrowingRenderChild',
    props: { shouldThrow: { type: Boolean, default: true } },
    setup(props) {
        return () => {
            if (props.shouldThrow) {
                throw new Error('测试错误：render 阶段抛出');
            }
            return h('div', '正常 render');
        };
    },
});

/** 正常子组件 */
const NormalChild = defineComponent({
    name: 'NormalChild',
    setup() {
        return () => h('div', '正常子组件内容');
    },
});

describe('ErrorBoundary', () => {
    beforeEach(() => {
        // 清理 DOM，避免用例间互相影响
        document.body.innerHTML = '';
    });

    it('正常子组件能渲染', () => {
        const wrapper = mount(ErrorBoundary, {
            slots: { default: () => h(NormalChild) },
        });
        expect(wrapper.text()).toContain('正常子组件内容');
        wrapper.unmount();
    });

    it('render 阶段抛错 → ErrorBoundary 捕获 → 渲染失败 UI', async () => {
        // 抑制 console.error（onErrorCaptured 内部打印）
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const wrapper = mount(ErrorBoundary, {
            slots: { default: () => h(ThrowingRenderChild, { shouldThrow: true }) },
            global: makeGlobalStubs(),
        });
        await nextTick();
        await nextTick();

        // ErrorBoundary 应该显示错误 UI（失败 UI 包含错误信息）
        const text = wrapper.text();
        expect(text).toContain('测试错误：render 阶段抛出');
        // 重试按钮存在
        expect(text).toContain('重试');

        consoleSpy.mockRestore();
        wrapper.unmount();
    });

    it('点击「重试」按钮 → emit retry 事件', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const wrapper = mount(ErrorBoundary, {
            slots: { default: () => h(ThrowingRenderChild, { shouldThrow: true }) },
            global: makeGlobalStubs(),
        });
        await nextTick();
        await nextTick();

        // 验证 retry 按钮存在
        const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('重试'));
        expect(retryBtn).toBeDefined();

        consoleSpy.mockRestore();
        wrapper.unmount();
    });

    it('retry 后如果子组件仍然抛错 → 仍然显示错误 UI（不会无限循环）', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // 父组件可以动态切换 shouldThrow
        const Host = defineComponent({
            components: { ErrorBoundary, ThrowingRenderChild },
            setup() {
                const shouldThrow = ref(true);
                function toggle() {
                    shouldThrow.value = !shouldThrow.value;
                }
                return { shouldThrow, toggle };
            },
            template: `
                <ErrorBoundary>
                    <ThrowingRenderChild :should-throw="shouldThrow" />
                </ErrorBoundary>
            `,
        });

        const wrapper = mount(Host, {});
        await nextTick();
        await nextTick();

        // 第一次：显示错误
        expect(wrapper.text()).toContain('测试错误：render 阶段抛出');

        consoleSpy.mockRestore();
        wrapper.unmount();
    });

    it('不冒泡到根 app（错误被 ErrorBoundary 消化）', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // 模拟 app 级别的 app.config.errorHandler
        const appErrorHandler = vi.fn();
        // mount 时传入 config
        const ParentApp = defineComponent({
            setup() {
                return () =>
                    h(ErrorBoundary, null, {
                        default: () => h(ThrowingRenderChild, { shouldThrow: true }),
                    });
            },
            errorCaptured() {
                // 如果 ErrorBoundary 没有消化错误，Vue 会向上冒泡到这里
                appErrorHandler();
                return false;
            },
        });

        const wrapper = mount(ParentApp);
        await nextTick();
        await nextTick();

        // ErrorBoundary 应该消化错误，父组件 errorCaptured 不应被调用
        expect(appErrorHandler).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
        wrapper.unmount();
    });
});
