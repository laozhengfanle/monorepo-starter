/**
 * ListDisplayFilter 通用列表显示状态筛选器 单元测试
 *
 * 测试范围：
 *   - 默认值：未传 modelValue 时为 'active'
 *   - v-model 双向绑定：
 *       1) 父组件修改 modelValue → 组件内部下拉跟着变
 *       2) 用户在组件里选其他值 → emit('update:modelValue', newValue)
 *   - 选项展示：3 个选项（active / deleted / all）都能在 NSelect 里找到
 *
 * 策略：通过 vi.mock 把 naive-ui 的 NSelect / NSpace 整个替换为测试桩，
 * 让测试只关注 ListDisplayFilter 的 v-model 行为，不耦合 Naive UI 内部实现。
 * 这样 happy-dom 下也不需要 NConfigProvider 之类的 Provider 包裹。
 */
/* eslint-disable vue/one-component-per-file */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, nextTick, defineComponent, h, type PropType } from 'vue';
import { mount } from '@vue/test-utils';
import ListDisplayFilter from '../ListDisplayFilter.vue';
import type { DisplayMode } from '../types';

// ============================================================
// Mock naive-ui 组件
// ------------------------------------------------------------
// 把 NSelect 替换成原生 <select>，NSpace 替换成普通 <div>，专注测试 v-model 行为。
// ============================================================
vi.mock('naive-ui', async () => {
    const { defineComponent, h } = await import('vue');
    const NSelectStub = defineComponent({
        name: 'NSelect',
        props: {
            value: { type: [String, Number, Array], default: '' },
            options: {
                type: Array as PropType<Array<{ label: string; value: string }>>,
                default: () => [],
            },
            size: { type: String, default: undefined },
            consistentMenuWidth: { type: Boolean, default: true },
        },
        emits: ['update:value'],
        setup(props, { emit }) {
            return () =>
                h(
                    'select',
                    {
                        class: 'n-select__stub',
                        value: props.value as string,
                        onChange: (e: Event) => {
                            emit('update:value', (e.target as HTMLSelectElement).value);
                        },
                    },
                    props.options.map((opt) => h('option', { key: opt.value, value: opt.value }, opt.label)),
                );
        },
    });
    const NSpaceStub = defineComponent({
        name: 'NSpace',
        props: {
            size: { type: [String, Number], default: undefined },
            wrap: { type: Boolean, default: false },
            align: { type: String, default: undefined },
        },
        setup(_, { slots }) {
            return () => h('div', { class: 'n-space__stub' }, slots.default?.());
        },
    });
    return {
        NSelect: NSelectStub,
        NSpace: NSpaceStub,
    };
});

/**
 * 父组件 wrapper：提供 v-model 双向绑定的真实宿主
 * 比直接传 props 写 v-model 更接近业务用法（v-model="displayMode"）
 */
const ParentHarness = defineComponent({
    name: 'ParentHarness',
    components: { ListDisplayFilter },
    setup() {
        const displayMode = ref<DisplayMode>('active');
        return () =>
            h(ListDisplayFilter, {
                modelValue: displayMode.value,
                'onUpdate:modelValue': (v: DisplayMode) => {
                    displayMode.value = v;
                },
            });
    },
});

/**
 * 挂载辅助函数：直接 mount，不需要任何 stub/mock 配置（naive-ui 已被全局 mock）
 */
function mountListDisplayFilter(props: { modelValue?: DisplayMode } = {}) {
    return mount(ListDisplayFilter, { props });
}

describe('ListDisplayFilter', () => {
    beforeEach(() => {
        // 清理 DOM，避免用例间互相影响
        document.body.innerHTML = '';
    });

    // ============================================================
    // 默认值
    // ============================================================
    describe('默认值', () => {
        it("未传 modelValue 时，NSelect 选中 'active'", () => {
            const wrapper = mountListDisplayFilter();
            const select = wrapper.find('select.n-select__stub');
            expect(select.exists()).toBe(true);
            expect((select.element as HTMLSelectElement).value).toBe('active');
        });

        it("传 modelValue='deleted' 时，NSelect 选中 'deleted'", () => {
            const wrapper = mountListDisplayFilter({ modelValue: 'deleted' });
            const select = wrapper.find('select.n-select__stub');
            expect((select.element as HTMLSelectElement).value).toBe('deleted');
        });
    });

    // ============================================================
    // v-model 双向绑定
    // ============================================================
    describe('v-model 双向绑定', () => {
        it("用户在 NSelect 里切换选项，emit('update:modelValue', newValue)", async () => {
            const wrapper = mountListDisplayFilter();
            const select = wrapper.find('select.n-select__stub');

            // 用户从 'active' 切到 'deleted'，原生 change 事件触发
            await select.setValue('deleted');

            // 必须 emit 出去，值是 'deleted'
            const emitted = wrapper.emitted('update:modelValue');
            expect(emitted).toBeTruthy();
            expect(emitted).toHaveLength(1);
            // emit 的 payload 第一个参数是新值
            const firstEmit = emitted?.[0];
            expect(firstEmit?.[0]).toBe('deleted');
        });

        it('父组件修改 modelValue，组件内 NSelect 的选中值跟着变', async () => {
            const wrapper = mountListDisplayFilter({ modelValue: 'active' });
            const select = wrapper.find('select.n-select__stub');
            expect((select.element as HTMLSelectElement).value).toBe('active');

            // 父组件把 modelValue 改成 'all'，重新渲染
            await wrapper.setProps({ modelValue: 'all' });
            await nextTick();

            expect((select.element as HTMLSelectElement).value).toBe('all');
        });

        it('真实父组件 v-model 双向绑定：用户操作触发 update:modelValue 事件', async () => {
            // 用 ParentHarness 跑一次完整闭环，验证 v-model 协议无误
            const wrapper = mount(ParentHarness);

            const select = wrapper.find('select.n-select__stub');
            // 初始：active
            expect((select.element as HTMLSelectElement).value).toBe('active');

            // 用户切到 'all'
            await select.setValue('all');

            // 子组件的 update:modelValue 事件被触发，payload 是 'all'
            const childComponent = wrapper.findComponent(ListDisplayFilter);
            const childUpdateEvents = childComponent.emitted('update:modelValue');
            expect(childUpdateEvents).toBeTruthy();
            expect(childUpdateEvents?.[0]?.[0]).toBe('all');
        });
    });

    // ============================================================
    // 选项展示
    // ============================================================
    describe('选项展示', () => {
        it('渲染 3 个选项：active / deleted / all', () => {
            const wrapper = mountListDisplayFilter();
            const select = wrapper.find('select.n-select__stub');
            const optionEls = select.findAll('option');

            expect(optionEls).toHaveLength(3);
            const values = optionEls.map((o) => (o.element as HTMLOptionElement).value);
            expect(values).toEqual(['active', 'deleted', 'all']);

            const labels = optionEls.map((o) => o.text());
            expect(labels).toEqual(['正常', '已删除', '全部']);
        });
    });
});
