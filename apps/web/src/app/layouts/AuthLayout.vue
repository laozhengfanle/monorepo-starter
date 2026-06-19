<!--
  AuthLayout — 认证页面布局
  居中卡片样式，适用于登录页等认证相关页面
-->
<template>
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <!-- 居中卡片容器 -->
        <div class="w-full max-w-md px-4">
            <router-view />
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * AuthLayout 组件逻辑
 *
 * 简洁的居中布局，用于登录等认证页面。
 * 子路由（如 LoginPage）会在卡片容器内渲染。
 */
</script>
