<template>
    <n-layout-footer class="flex items-center justify-center py-4! bg-transparent! px-(--gap)">
        <n-text depth="3">{{ footerText }}</n-text>
        <n-text depth="3" class="ml-2 opacity-60">v{{ version }}</n-text>
    </n-layout-footer>
</template>

<script setup lang="ts">
defineOptions({ name: 'LayoutFooter' });
import { computed } from 'vue';
import { useConfigStore } from '@/shared/stores/config';

const configStore = useConfigStore();

// 优先使用后端配置的页脚文本，回退到环境变量
const footerText = computed(
    () => configStore.systemBasic.footerText || `© 2026 ${import.meta.env.VITE_APP_TITLE}. All rights reserved.`,
);

const version = __APP_VERSION__;
</script>
