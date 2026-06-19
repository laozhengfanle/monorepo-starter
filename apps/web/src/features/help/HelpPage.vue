<!--
  HelpPage — 帮助页
  展示帮助信息（占位页面）
  文案硬编码中文（CLAUDE.md 明确禁止 i18n）
-->
<template>
    <div class="max-w-7xl mx-auto px-4 py-12">
        <h1 class="text-2xl font-bold text-gray-900 mb-6">帮助中心</h1>
        <n-empty description="暂无数据">
            <template #extra>
                <n-button @click="$router.push('/')"> 返回首页 </n-button>
            </template>
        </n-empty>
    </div>
</template>

<script setup lang="ts">
/**
 * HelpPage 组件逻辑
 *
 * 帮助中心占位页面，后续接入真实帮助内容。
 */
</script>
