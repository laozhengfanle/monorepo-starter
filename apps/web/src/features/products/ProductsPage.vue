<!--
  ProductsPage — 产品页
  展示产品列表（占位页面）
  文案硬编码中文（CLAUDE.md 明确禁止 i18n）
-->
<template>
    <div class="max-w-7xl mx-auto px-4 py-12">
        <h1 class="text-2xl font-bold text-gray-900 mb-6">产品中心</h1>
        <n-empty description="暂无数据">
            <template #extra>
                <n-button @click="$router.push('/')"> 返回首页 </n-button>
            </template>
        </n-empty>
    </div>
</template>

<script setup lang="ts">
/**
 * ProductsPage 组件逻辑
 *
 * 产品列表占位页面，后续接入真实产品数据。
 */
</script>
