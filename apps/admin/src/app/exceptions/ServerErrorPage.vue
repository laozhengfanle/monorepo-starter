<!--
    500 服务器错误

    "返回首页" 仅已登录时显示——未登录状态下首页即登录页，无需此按钮。
-->
<template>
    <div class="flex items-center justify-center h-full">
        <n-result status="500" title="500" description="服务器开了小差，请稍后再试">
            <template v-if="isLoggedIn" #footer>
                <n-button @click="router.push('/')">返回首页</n-button>
            </template>
        </n-result>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ServerErrorPage' });
import { useRouter } from 'vue-router';
import { useAdminStore } from '@/shared/stores/admin';

const router = useRouter();
const isLoggedIn = useAdminStore().isLoggedIn;
</script>
