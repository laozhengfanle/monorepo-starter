/**
 * Skeleton 组件 单元测试
 *
 * 测试范围：
 *   - rows prop 控制骨架行数
 *   - avatar prop 决定是否显示头像
 *   - 默认值（rows=5, avatar=false, paragraph=true）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Skeleton from '../Skeleton.vue';

// ============================================================
// Mock naive-ui 的 NSkeleton
// ------------------------------------------------------------
// 把 NSkeleton 替换为简单的测试桩：渲染一个 div + data 属性，
// 让测试可以验证 props 是否正确传递。
// ============================================================
vi.mock('naive-ui', async () => {
    const { defineComponent, h } = await import('vue');
    const NSkeletonStub = defineComponent({
        name: 'NSkeleton',
        props: {
            repeat: { type: Number, default: 1 },
            circle: { type: Boolean, default: false },
            sharp: { type: Boolean, default: true },
            size: { type: String, default: 'medium' },
        },
        setup(props, { slots: _slots }) {
            return () => {
                return h('div', {
                    class: 'n-skeleton__stub',
                    'data-repeat': String(props.repeat),
                    'data-circle': String(props.circle),
                });
            };
        },
    });
    return {
        NSkeleton: NSkeletonStub,
    };
});

describe('Skeleton 组件', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    // ============================================================
    // 行数控制
    // ============================================================
    describe('行数控制（rows prop）', () => {
        it('渲染行数正确：rows=3 时只渲染 3 行', () => {
            const wrapper = mount(Skeleton, {
                props: { rows: 3, paragraph: true, avatar: false },
            });
            const bars = wrapper.findAll('div.n-skeleton__stub');
            // avatar=false 时只渲染 1 个 NSkeleton（内含 repeat=3 行）
            expect(bars).toHaveLength(1);
            expect(bars[0].attributes('data-repeat')).toBe('3');
        });

        it('默认 rows=5 渲染 5 行', () => {
            const wrapper = mount(Skeleton);
            const bars = wrapper.findAll('div.n-skeleton__stub');
            expect(bars).toHaveLength(1);
            expect(bars[0].attributes('data-repeat')).toBe('5');
        });

        it('rows=10 渲染 10 行', () => {
            const wrapper = mount(Skeleton, {
                props: { rows: 10 },
            });
            const bars = wrapper.findAll('div.n-skeleton__stub');
            expect(bars[0].attributes('data-repeat')).toBe('10');
        });

        it('paragraph=false 时不渲染段落骨架', () => {
            const wrapper = mount(Skeleton, {
                props: { paragraph: false, avatar: false },
            });
            const bars = wrapper.findAll('div.n-skeleton__stub');
            expect(bars).toHaveLength(0);
        });
    });

    // ============================================================
    // 头像模式
    // ============================================================
    describe('avatar prop', () => {
        it('avatar 模式显示头像（多一个 NSkeleton，circle=true）', () => {
            const wrapper = mount(Skeleton, {
                props: { avatar: true, paragraph: true, rows: 3 },
            });
            const bars = wrapper.findAll('div.n-skeleton__stub');
            // avatar=true + paragraph=true → 2 个 NSkeleton
            expect(bars).toHaveLength(2);
            // 第一个是 avatar（circle=true）
            expect(bars[0].attributes('data-circle')).toBe('true');
            // 第二个是段落
            expect(bars[1].attributes('data-circle')).toBe('false');
            expect(bars[1].attributes('data-repeat')).toBe('3');
        });

        it('默认 avatar=false 不显示头像', () => {
            const wrapper = mount(Skeleton);
            const bars = wrapper.findAll('div.n-skeleton__stub');
            expect(bars).toHaveLength(1);
            expect(bars[0].attributes('data-circle')).toBe('false');
        });

        it('avatar=true 且 paragraph=false 时只显示头像', () => {
            const wrapper = mount(Skeleton, {
                props: { avatar: true, paragraph: false },
            });
            const bars = wrapper.findAll('div.n-skeleton__stub');
            expect(bars).toHaveLength(1);
            expect(bars[0].attributes('data-circle')).toBe('true');
        });
    });
});
