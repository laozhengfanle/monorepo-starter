/**
 * EmptyState 组件 单元测试
 *
 * 测试范围：
 *   - title 渲染正确
 *   - action slot 内容渲染
 *   - icon / description 显示与隐藏
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EmptyState from '../EmptyState.vue';

describe('EmptyState 组件', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    // ============================================================
    // title 渲染
    // ============================================================
    describe('title 渲染', () => {
        it('title prop 正确渲染到 h3 元素', () => {
            const wrapper = mount(EmptyState, {
                props: { title: '暂无数据' },
            });
            const title = wrapper.find('h3.empty-state__title');
            expect(title.exists()).toBe(true);
            expect(title.text()).toBe('暂无数据');
        });

        it('不传 title 时不渲染 h3', () => {
            const wrapper = mount(EmptyState);
            const title = wrapper.find('h3.empty-state__title');
            expect(title.exists()).toBe(false);
        });

        it('title 默认为空字符串', () => {
            const wrapper = mount(EmptyState);
            const title = wrapper.find('h3.empty-state__title');
            expect(title.exists()).toBe(false);
        });
    });

    // ============================================================
    // action slot 渲染
    // ============================================================
    describe('action slot', () => {
        it('action slot 内容被渲染到 .empty-state__action 容器', () => {
            const wrapper = mount(EmptyState, {
                props: { title: '暂无数据' },
                slots: {
                    action: '<button class="retry-btn">重试</button>',
                },
            });
            const actionContainer = wrapper.find('.empty-state__action');
            expect(actionContainer.exists()).toBe(true);
            const button = actionContainer.find('button.retry-btn');
            expect(button.exists()).toBe(true);
            expect(button.text()).toBe('重试');
        });

        it('未提供 action slot 时不渲染 .empty-state__action 容器', () => {
            const wrapper = mount(EmptyState, {
                props: { title: '暂无数据' },
            });
            const actionContainer = wrapper.find('.empty-state__action');
            expect(actionContainer.exists()).toBe(false);
        });

        it('action slot 支持复杂内容（多个按钮）', () => {
            const wrapper = mount(EmptyState, {
                props: { title: '暂无数据' },
                slots: {
                    action: `
                        <button class="btn-1">按钮 1</button>
                        <button class="btn-2">按钮 2</button>
                    `,
                },
            });
            const actionContainer = wrapper.find('.empty-state__action');
            expect(actionContainer.find('button.btn-1').exists()).toBe(true);
            expect(actionContainer.find('button.btn-2').exists()).toBe(true);
        });
    });

    // ============================================================
    // icon / description
    // ============================================================
    describe('icon 和 description', () => {
        it('默认 icon = 📭', () => {
            const wrapper = mount(EmptyState);
            const icon = wrapper.find('.empty-state__icon');
            expect(icon.exists()).toBe(true);
            expect(icon.text()).toBe('📭');
        });

        it('自定义 icon 生效', () => {
            const wrapper = mount(EmptyState, {
                props: { icon: '🔍' },
            });
            const icon = wrapper.find('.empty-state__icon');
            expect(icon.text()).toBe('🔍');
        });

        it('description 渲染到 p.empty-state__description', () => {
            const wrapper = mount(EmptyState, {
                props: { description: '请稍后再试' },
            });
            const desc = wrapper.find('p.empty-state__description');
            expect(desc.exists()).toBe(true);
            expect(desc.text()).toBe('请稍后再试');
        });
    });
});
