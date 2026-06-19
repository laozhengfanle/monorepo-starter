<!--
    Skeleton 组件
    用 Naive UI n-skeleton 封装的骨架屏组件
    替代 n-spin 菊花加载，提供更好的视觉体验

    使用场景：
    - 列表/表格首次加载
    - 详情页加载
    - 卡片加载

    Props:
    - rows: 骨架行数（默认 5）
    - avatar: 是否显示头像（默认 false）
    - paragraph: 是否显示段落（默认 true）
    - width: 容器宽度（默认 100%）
    - height: 容器高度（默认 auto）
-->
<template>
    <div :style="{ width, height }">
        <n-skeleton v-if="avatar" :style="{ marginBottom: '12px' }" :circle="true" size="medium" />
        <n-skeleton v-if="paragraph" :repeat="rows" :sharp="false" size="medium" />
    </div>
</template>

<script setup lang="ts">
/**
 * Skeleton 组件 — 骨架屏
 * 封装 Naive UI n-skeleton，提供统一的项目级加载占位符
 */
import { NSkeleton } from 'naive-ui';

withDefaults(
    defineProps<{
        /** 骨架行数（默认 5） */
        rows?: number;
        /** 是否显示头部头像（默认 false） */
        avatar?: boolean;
        /** 是否显示段落占位（默认 true） */
        paragraph?: boolean;
        /** 容器宽度 */
        width?: string;
        /** 容器高度 */
        height?: string;
    }>(),
    {
        rows: 5,
        avatar: false,
        paragraph: true,
        width: '100%',
        height: 'auto',
    },
);
</script>
