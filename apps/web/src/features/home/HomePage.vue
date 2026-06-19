<!--
  HomePage — 首页
  简单的欢迎页面，展示产品介绍和引导信息
  文案硬编码中文（CLAUDE.md 明确禁止 i18n）
-->
<template>
    <div class="max-w-7xl mx-auto px-4 py-12">
        <!-- 欢迎区域 -->
        <div class="text-center mb-12">
            <h1 class="text-3xl font-bold text-gray-900 mb-4">欢迎使用</h1>
            <p class="text-lg text-gray-600 max-w-2xl mx-auto">欢迎登录管理后台，开启高效协作之旅</p>
        </div>

        <!-- 功能卡片区域 -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- 产品卡片 -->
            <n-card hoverable>
                <template #header>
                    <span class="text-lg font-semibold">产品中心</span>
                </template>
                <p class="text-gray-600">浏览平台全部产品与服务</p>
                <template #action>
                    <n-button text type="primary" @click="$router.push('/products')"> 查看更多 → </n-button>
                </template>
            </n-card>

            <!-- VIP 卡片 -->
            <n-card hoverable>
                <template #header>
                    <span class="text-lg font-semibold">开通 VIP</span>
                </template>
                <p class="text-gray-600">解锁全部会员专属内容与特权</p>
                <template #action>
                    <n-button text type="primary" @click="$router.push('/vip')"> 查看更多 → </n-button>
                </template>
            </n-card>

            <!-- 帮助卡片 -->
            <n-card hoverable>
                <template #header>
                    <span class="text-lg font-semibold">帮助中心</span>
                </template>
                <p class="text-gray-600">常见问题与使用指南</p>
                <template #action>
                    <n-button text type="primary" @click="$router.push('/help')"> 查看更多 → </n-button>
                </template>
            </n-card>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * HomePage 组件逻辑
 *
 * 首页展示欢迎信息和功能引导卡片，
 * 引导用户浏览产品、了解 VIP、查看帮助。
 */
</script>
