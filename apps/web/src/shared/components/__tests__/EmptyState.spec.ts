/**
 * EmptyState 组件 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EmptyState from '../EmptyState.vue';

describe('EmptyState 组件 (web)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

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
    });

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
    });
});
