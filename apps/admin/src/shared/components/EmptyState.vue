<!--
    EmptyState 组件
    统一的空状态展示组件，替代页面上的「暂无数据」纯文本

    使用场景：
    - 列表为空
    - 搜索无结果
    - 错误状态展示

    Props:
    - icon: 自定义图标（emoji / 字符串 / 组件）
    - title: 标题文字
    - description: 描述文字

    Slots:
    - action: 操作按钮区（重试、刷新、新建等）
-->
<template>
    <div class="empty-state flex flex-col items-center justify-center py-12 px-4">
        <!-- 图标 -->
        <div v-if="icon" class="empty-state__icon text-6xl mb-4 opacity-50">
            {{ icon }}
        </div>

        <!-- 标题 -->
        <h3 v-if="title" class="empty-state__title text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            {{ title }}
        </h3>

        <!-- 描述 -->
        <p
            v-if="description"
            class="empty-state__description text-sm text-gray-500 dark:text-gray-400 text-center max-w-md mb-4"
        >
            {{ description }}
        </p>

        <!-- 操作按钮 slot -->
        <div v-if="$slots.action" class="empty-state__action">
            <slot name="action" />
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * EmptyState 组件 — 空状态展示
 * 提供统一的视觉风格、图标、标题、描述和操作区
 */
withDefaults(
    defineProps<{
        /** 自定义图标（emoji / 字符串 / 组件） */
        icon?: string;
        /** 标题文字 */
        title?: string;
        /** 描述文字 */
        description?: string;
    }>(),
    {
        icon: '📭',
        title: '',
        description: '',
    },
);
</script>

<style scoped>
/* 让整个空状态区域居中显示 */
.empty-state {
    text-align: center;
    min-height: 200px;
}
</style>
