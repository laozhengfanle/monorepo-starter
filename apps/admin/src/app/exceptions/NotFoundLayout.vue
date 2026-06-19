<template>
    <!--
        NotFoundLayout.vue — 404 动态布局

        根据登录状态切换壳层：
        - 未登录 → GuestLayout（极简顶栏，不暴露后台外壳）
        - 已登录 → MainLayout（保留侧栏 + 顶栏，用户可导航离开）
    -->
    <GuestLayout v-if="!isAuthenticated">
        <router-view />
    </GuestLayout>
    <MainLayout v-else>
        <router-view />
    </MainLayout>
</template>

<script setup lang="ts">
defineOptions({ name: 'NotFoundLayout' });
import GuestLayout from '@/app/layouts/GuestLayout.vue';
import MainLayout from '@/app/layouts/MainLayout.vue';
import { useAdminStore } from '@/shared/stores/admin';

const adminStore = useAdminStore();
const isAuthenticated = adminStore.isLoggedIn;
</script>
