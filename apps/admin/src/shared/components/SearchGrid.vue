<!--
  通用「搜索栏栅格」组件
  =====================

  Naive UI <n-grid> 的薄包装，统一搜索栏的 4 个常量 props：
    - cols       响应式列数（手机 1 / 平板 2 / 桌面 3 / 大屏 4）
    - x-gap      列间距
    - y-gap      行间距
    - responsive 响应式策略（'self' = 自身断点；'screen' = 视口断点）

  透传 2 个页面相关 prop：
    - collapsed       父组件自己的 isCollapsed ref
    - collapsed-rows  折叠时显示的行数（字段少就传 1）

  抽出来的动机：3 个搜索页（AdminsPage / RolesPage / LogsPage）4/5 个 props 完全相同，
  调一次间距要改 3 处；下一个搜索页必然要继续复制。薄组件可避免这种债务。

  用法：
    <SearchGrid :collapsed="isCollapsed">
      <n-gi>...</n-gi>
      <n-gi>...</n-gi>
    </SearchGrid>
-->
<template>
    <n-grid
        :collapsed="collapsed"
        :cols="cols"
        :collapsed-rows="collapsedRows"
        :x-gap="xGap"
        :y-gap="yGap"
        :responsive="responsive"
    >
        <!-- 默认 slot：透传父组件的 n-gi 子节点 -->
        <slot />
    </n-grid>
</template>

<script setup lang="ts">
/**
 * 组件名：SearchGrid
 * 用于 KeepAlive / devtools 识别（项目里其他页面组件也都用 defineOptions 设置 name）
 */
defineOptions({ name: 'SearchGrid' });

import { NGrid, type GridProps } from 'naive-ui';

/**
 * Props
 * - collapsed       必传：父组件的 isCollapsed ref，控「展开/收起」按钮状态
 * - collapsed-rows  可选：默认 2（参考 AdminsPage），字段少的页面传 1
 * - cols            可选：默认 4 段响应式（手机 1 / 平板 2 / 桌面 3 / 大屏 4）
 * - x-gap           可选：默认 10
 * - y-gap           可选：默认 10
 * - responsive      可选：默认 'self'
 *
 * 设计原则：默认值取「参考 AdminsPage」的 4 个常量 props；剩下 2 个跟页面相关的 props 必传
 * 这样最常见的写法是 1 行（只传 collapsed），复杂场景可覆盖
 */
withDefaults(
    defineProps<{
        /** 是否折叠（必传，父组件用 ref 控制） */
        collapsed: boolean;
        /** 折叠时显示的行数（默认 2） */
        collapsedRows?: number;
        /** 响应式列数配置（默认 "1 640:2 1024:3 1536:4"） */
        cols?: string;
        /** 列间距（默认 10） */
        xGap?: number;
        /** 行间距（默认 10） */
        yGap?: number;
        /** 响应式策略（默认 'self'） */
        responsive?: GridProps['responsive'];
    }>(),
    {
        collapsedRows: 2,
        cols: '1 640:2 1024:3 1536:4',
        xGap: 10,
        yGap: 10,
        responsive: 'self',
    },
);
</script>
