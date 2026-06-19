<!--
    403 禁止访问

    "返回首页" 仅已登录时显示——未登录状态下首页即登录页，无需此按钮。
-->
<template>
    <div class="flex items-center justify-center h-full">
        <n-result status="403" title="403" description="您没有权限访问此页面">
            <template v-if="isLoggedIn" #footer>
                <n-button @click="router.push('/')">返回首页</n-button>
            </template>
        </n-result>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ForbiddenPage' });
import { useRouter } from 'vue-router';
import { useAdminStore } from '@/shared/stores/admin';

const router = useRouter();
const isLoggedIn = useAdminStore().isLoggedIn;
</script>
