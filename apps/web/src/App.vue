<!--
  App.vue — 根组件
  作为整个应用的壳，只包含一个 <RouterView /> 用于渲染当前路由对应的页面组件。
  具体的页面布局（DefaultLayout / AuthLayout）由各路由的 component 配置加载。
-->
<script setup lang="ts">
/**
 * App.vue 根组件
 *
 * 职责：
 *   - 渲染 <RouterView />：根据当前路由动态加载页面组件
 *   - 不包含任何业务逻辑，只是一个壳
 *
 * 为什么这样设计？
 *   Vue Router 官方推荐把路由对应的"页面"放在 <RouterView /> 中渲染，
 *   这样切换路由时组件会被销毁/重建（或 keep-alive 缓存），符合 SPA 的预期。
 */
import { RouterView } from 'vue-router';
</script>

<template>
    <RouterView />
</template>
