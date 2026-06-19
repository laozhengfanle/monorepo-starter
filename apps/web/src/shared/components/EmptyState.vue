<!--
    EmptyState 组件
    统一的空状态展示组件
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
 * EmptyState 组件 — 空状态展示（web 端）
 */
withDefaults(
    defineProps<{
        icon?: string;
        title?: string;
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
.empty-state {
    text-align: center;
    min-height: 200px;
}
</style>
