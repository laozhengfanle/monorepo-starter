<!--
  通用「列表显示状态」筛选器
  ==========================

  提供一个下拉选择，让用户切换列表里要展示的记录：
    - 正常   (active)  默认值，只展示未删除的记录
    - 已删除 (deleted)  展示软删除的记录（用于「恢复 / 彻底删除」操作）
    - 全部   (all)     同时展示正常 + 已删除

  通过 v-model 与父组件双向绑定（父组件再把结果映射到后端 includeDeleted 参数）。
  组件本身只负责「选哪个」，不发请求、不做业务过滤，保持纯净。

  用法：
    <ListDisplayFilter v-model="displayMode" />
    ...
    const includeDeleted = computed(() => displayMode.value !== 'active');
    loadData({ includeDeleted: includeDeleted.value });
-->
<template>
    <n-select :value="modelValue" :options="options" :consistent-menu-width="false" @update:value="onChange" />
</template>

<script setup lang="ts">
/**
 * 组件名：ListDisplayFilter
 * 用于 KeepAlive / devtools 识别（项目里其他页面组件也都用 defineOptions 设置 name）
 */
defineOptions({ name: 'ListDisplayFilter' });

import { NSelect, type SelectOption } from 'naive-ui';
import type { DisplayMode } from './types';

/**
 * Props：通过 v-model 接收父组件传入的当前显示模式
 *
 * 默认值 'active'：最常见的诉求是「看正常数据」，避免一进列表就被一堆已删除行刷屏。
 */
withDefaults(
    defineProps<{
        /**
         * 当前显示模式（v-model 绑定值）
         * - 父组件必须传 DisplayMode 联合类型里的一个值
         * - 不传时取默认 'active'
         */
        modelValue?: DisplayMode;
    }>(),
    {
        modelValue: 'active',
    },
);

/**
 * Emits：子组件值变化时通过 'update:modelValue' 通知父组件
 *
 * Vue 3 标准 v-model 协议：父组件写 v-model 会被编译成
 *   :model-value="displayMode"  @update:model-value="displayMode = $event"
 */
const emit = defineEmits<{
    (e: 'update:modelValue', value: DisplayMode): void;
}>();

/**
 * 下拉选项（label / value 一一对应）
 * 用 readonly 防止运行期被改坏
 */
const options: SelectOption[] = [
    { label: '正常', value: 'active' },
    { label: '已删除', value: 'deleted' },
    { label: '全部', value: 'all' },
];

/**
 * NSelect 选中项变更处理
 * 透传到父组件，让父组件决定要不要重新发请求
 */
function onChange(value: DisplayMode) {
    emit('update:modelValue', value);
}
</script>
