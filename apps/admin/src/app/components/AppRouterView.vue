<template>
    <router-view />
</template>

<script setup lang="ts">
defineOptions({ name: 'AppRouterView' });
import { useLoadingBar } from 'naive-ui';
import { useRouter } from 'vue-router';

const router = useRouter();
const loadingBar = useLoadingBar();

/**
 * 在组件内注册路由守卫以控制加载进度条。
 *
 * 这是 UI 层关注点（进度条是 naive-ui 组件），放在 router 初始化
 * 文件中反而会导致 router → naive-ui 的不必要耦合。
 * 组件卸载时守卫不会自动移除，但 AppRouterView 是根级组件不会卸载。
 */
router.beforeEach(() => {
    loadingBar.start();
});

router.afterEach(() => {
    loadingBar.finish();
});
</script>
