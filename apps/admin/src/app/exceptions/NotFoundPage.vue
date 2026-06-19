<!--
    404 页面未找到

    "返回首页" 仅已登录时显示——未登录状态下首页即登录页，无需此按钮。
-->
<template>
    <div class="flex items-center justify-center h-full">
        <n-result status="404" title="页面走丢了" description="您访问的页面不存在或已被移除">
            <template v-if="isLoggedIn" #footer>
                <n-button @click="router.push('/')">返回首页</n-button>
            </template>
        </n-result>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'NotFoundPage' });
import { useRouter } from 'vue-router';
import { useAdminStore } from '@/shared/stores/admin';

const router = useRouter();
const isLoggedIn = useAdminStore().isLoggedIn;
</script>
