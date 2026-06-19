<script setup lang="ts">
defineOptions({ name: 'RedirectPage' });
/**
 * 重定向页面
 * 用于 TabBar 重新加载：先跳到 /redirect/目标路径，再立即跳回目标路径。
 * Vue Router 会重新创建目标组件，实现“刷新”效果。
 */
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const { path } = route.params;
const cleanPath = Array.isArray(path) ? path.join('/') : String(path || '/');
const targetPath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
router.replace({ path: targetPath, query: route.query });
</script>

<template>
    <div />
</template>
