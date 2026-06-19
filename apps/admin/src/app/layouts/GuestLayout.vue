<template>
    <n-layout content-class="h-[100dvh]! flex flex-col overflow-hidden!">
        <LayoutHeader mode="guest" />

        <div class="flex-1 overflow-auto flex flex-col">
            <router-view />
        </div>

        <LayoutFooter v-if="isFooterVisible" />
    </n-layout>
</template>

<script setup lang="ts">
defineOptions({ name: 'GuestLayout' });
import LayoutHeader from './components/LayoutHeader.vue';
import LayoutFooter from './components/LayoutFooter.vue';
import { useSettingsStore } from '@/shared/stores/settings';
import { storeToRefs } from 'pinia';

const { isFooterVisible } = storeToRefs(useSettingsStore());
</script>
