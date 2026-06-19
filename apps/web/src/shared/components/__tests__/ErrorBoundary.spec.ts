/**
 * ErrorBoundary 单元测试（C 端）
 *
 * 注意：ErrorBoundary 文案已硬编码中文（CLAUDE.md 禁止 i18n），
 *       本测试不再需要 mock vue-i18n。
 */
/* eslint-disable vue/one-component-per-file */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import ErrorBoundary from '../ErrorBoundary.vue';

/** Naive UI 组件 stub（happy-dom 下不挂载 Provider，用 stub 代替） */
function makeGlobalStubs() {
    return {
        stubs: {
            'n-result': {
                props: ['status', 'title', 'description'],
                template: '<div class="n-result-stub">{{ description }}<slot name="footer" /></div>',
            },
            'n-space': { template: '<div class="n-space-stub"><slot /></div>' },
            'n-button': {
                template: '<button class="n-button-stub"><slot /></button>',
            },
            'n-modal': { template: '<div class="n-modal-stub"><slot /></div>' },
        },
    };
}

const ThrowingRenderChild = defineComponent({
    name: 'ThrowingRenderChild',
    setup() {
        return () => {
            throw new Error('测试错误：render 阶段抛出');
        };
    },
});

const NormalChild = defineComponent({
    name: 'NormalChild',
    setup() {
        return () => h('div', '正常子组件内容');
    },
});

describe('ErrorBoundary (web)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('正常子组件能渲染', () => {
        const wrapper = mount(ErrorBoundary, {
            slots: { default: () => h(NormalChild) },
        });
        expect(wrapper.text()).toContain('正常子组件内容');
        wrapper.unmount();
    });

    it('render 抛错 → 渲染失败 UI + 重试按钮', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const wrapper = mount(ErrorBoundary, {
            slots: { default: () => h(ThrowingRenderChild) },
            global: makeGlobalStubs(),
        });
        await nextTick();
        await nextTick();

        const text = wrapper.text();
        expect(text).toContain('测试错误：render 阶段抛出');
        expect(text).toContain('重试');

        consoleSpy.mockRestore();
        wrapper.unmount();
    });
});
