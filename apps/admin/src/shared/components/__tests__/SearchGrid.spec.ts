/**
 * SearchGrid 通用搜索栏栅格组件 单元测试
 *
 * 测试范围：
 *   - 默认值：未传 collapsedRows / cols / xGap / yGap / responsive 时透传 4 个常量默认值
 *     （参考 AdminsPage 的 n-grid 写法）
 *   - props 透传：父组件传 collapsed / collapsedRows / cols / xGap / yGap / responsive 时
 *     全部正确转发给底层 NGrid
 *   - slot 渲染：父组件的子节点（n-gi 等）能正常透传
 *
 * 策略：通过 vi.mock 把 naive-ui 的 NGrid 整个替换为测试桩，
 * 让测试只关注 SearchGrid 的 props 透传行为，不耦合 Naive UI 内部实现。
 * 这样 happy-dom 下也不需要 NConfigProvider 之类的 Provider 包裹。
 */
/* eslint-disable vue/one-component-per-file */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import SearchGrid from '../SearchGrid.vue';

// ============================================================
// Mock naive-ui NGrid
// ------------------------------------------------------------
// 把 NGrid 替换成原生 <div>，把它的 props 写到 dataset 上，
// 这样测试就能精确断言 SearchGrid 透传过去的 props 值。
// ============================================================
vi.mock('naive-ui', async () => {
    const { defineComponent, h } = await import('vue');
    const NGridStub = defineComponent({
        name: 'NGrid',
        props: {
            collapsed: { type: Boolean, default: false },
            collapsedRows: { type: Number, default: 1 },
            cols: { type: [String, Number], default: 1 },
            xGap: { type: [String, Number], default: 0 },
            yGap: { type: [String, Number], default: 0 },
            responsive: { type: String, default: undefined },
        },
        setup(props, { slots }) {
            return () =>
                h(
                    'div',
                    {
                        class: 'n-grid__stub',
                        // 把所有 prop 写到 dataset 上方便测试断言
                        'data-collapsed': String(props.collapsed),
                        'data-collapsed-rows': String(props.collapsedRows),
                        'data-cols': String(props.cols),
                        'data-x-gap': String(props.xGap),
                        'data-y-gap': String(props.yGap),
                        'data-responsive': String(props.responsive),
                    },
                    slots.default?.(),
                );
        },
    });
    return {
        NGrid: NGridStub,
    };
});

/**
 * 挂载辅助函数：直接 mount，不需要任何 stub/mock 配置（naive-ui 已被全局 mock）
 */
function mountSearchGrid(
    props: {
        collapsed?: boolean;
        collapsedRows?: number;
        cols?: string;
        xGap?: number;
        yGap?: number;
        responsive?: 'self' | 'screen';
    } = {},
    slots: { default?: () => unknown } = {},
) {
    return mount(SearchGrid, {
        props: { collapsed: true, ...props },
        slots,
    });
}

/**
 * 父组件 wrapper：模拟真实使用场景（带子节点的 n-gi）
 * 用真实业务写法（slot）测一遍，比直接传字符串 default slot 更接近生产用法
 */
const ParentHarness = defineComponent({
    name: 'ParentHarness',
    components: { SearchGrid },
    setup() {
        return () =>
            h(
                SearchGrid,
                { collapsed: true },
                {
                    default: () => [
                        h('div', { class: 'child-gi-1', key: '1' }, '字段 1'),
                        h('div', { class: 'child-gi-2', key: '2' }, '字段 2'),
                        h('div', { class: 'child-gi-3', key: '3' }, '字段 3'),
                    ],
                },
            );
    },
});

describe('SearchGrid', () => {
    beforeEach(() => {
        // 清理 DOM，避免用例间互相影响
        document.body.innerHTML = '';
    });

    // ============================================================
    // 默认值（参考 AdminsPage 的 4 个常量 props）
    // ============================================================
    describe('默认值', () => {
        it('未传 collapsedRows 时，NGrid 收到默认 2', () => {
            const wrapper = mountSearchGrid();
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-collapsed-rows')).toBe('2');
        });

        it("未传 cols 时，NGrid 收到默认 '1 640:2 1024:3 1536:4'", () => {
            const wrapper = mountSearchGrid();
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-cols')).toBe('1 640:2 1024:3 1536:4');
        });

        it('未传 x-gap 时，NGrid 收到默认 10', () => {
            const wrapper = mountSearchGrid();
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-x-gap')).toBe('10');
        });

        it('未传 y-gap 时，NGrid 收到默认 10', () => {
            const wrapper = mountSearchGrid();
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-y-gap')).toBe('10');
        });

        it("未传 responsive 时，NGrid 收到默认 'self'", () => {
            const wrapper = mountSearchGrid();
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-responsive')).toBe('self');
        });
    });

    // ============================================================
    // props 透传
    // ============================================================
    describe('props 透传', () => {
        it('collapsed=true 透传给 NGrid', () => {
            const wrapper = mountSearchGrid({ collapsed: true });
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-collapsed')).toBe('true');
        });

        it('collapsed=false 透传给 NGrid', () => {
            const wrapper = mountSearchGrid({ collapsed: false });
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-collapsed')).toBe('false');
        });

        it('collapsedRows=1 覆盖默认值，NGrid 收到 1', () => {
            // LogsPage 字段少，传 1
            const wrapper = mountSearchGrid({ collapsedRows: 1 });
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-collapsed-rows')).toBe('1');
        });

        it('cols 透传自定义值，NGrid 收到自定义值', () => {
            const wrapper = mountSearchGrid({ cols: '1 768:2 1280:3' });
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-cols')).toBe('1 768:2 1280:3');
        });

        it('xGap=20 透传给 NGrid', () => {
            const wrapper = mountSearchGrid({ xGap: 20 });
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-x-gap')).toBe('20');
        });

        it('yGap=16 透传给 NGrid', () => {
            const wrapper = mountSearchGrid({ yGap: 16 });
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-y-gap')).toBe('16');
        });

        it("responsive='screen' 覆盖默认 'self'", () => {
            const wrapper = mountSearchGrid({ responsive: 'screen' });
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-responsive')).toBe('screen');
        });

        it('一次性传全部 6 个 props，全部正确透传', () => {
            const wrapper = mountSearchGrid({
                collapsed: false,
                collapsedRows: 3,
                cols: '1 480:2',
                xGap: 24,
                yGap: 24,
                responsive: 'screen',
            });
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.attributes('data-collapsed')).toBe('false');
            expect(grid.attributes('data-collapsed-rows')).toBe('3');
            expect(grid.attributes('data-cols')).toBe('1 480:2');
            expect(grid.attributes('data-x-gap')).toBe('24');
            expect(grid.attributes('data-y-gap')).toBe('24');
            expect(grid.attributes('data-responsive')).toBe('screen');
        });
    });

    // ============================================================
    // slot 渲染
    // ============================================================
    describe('slot 渲染', () => {
        it('父组件传入的子节点能正常透传渲染', () => {
            const wrapper = mount(ParentHarness);
            // 3 个子节点都能在 stub grid 里找到
            expect(wrapper.find('.child-gi-1').exists()).toBe(true);
            expect(wrapper.find('.child-gi-2').exists()).toBe(true);
            expect(wrapper.find('.child-gi-3').exists()).toBe(true);
            // 子节点确实在 .n-grid__stub 内部
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.find('.child-gi-1').exists()).toBe(true);
            expect(grid.find('.child-gi-2').exists()).toBe(true);
            expect(grid.find('.child-gi-3').exists()).toBe(true);
        });

        it('不传 slot 时，NGrid 内部为空', () => {
            const wrapper = mountSearchGrid();
            const grid = wrapper.find('.n-grid__stub');
            expect(grid.element.children).toHaveLength(0);
        });
    });
});
