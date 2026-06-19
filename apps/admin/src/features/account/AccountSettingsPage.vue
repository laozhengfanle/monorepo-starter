<!--
账号设置页面 — 显示当前账号信息（只读）

注意：
- 修改个人资料 / 修改密码功能尚未接入后端 API
- 当前仅显示从 adminStore 同步的账号信息，避免显示半成品表单
- 后续接入后端 API 后再开放编辑功能
-->
<template>
    <n-space vertical :size="gap">
        <n-page-header title="账号设置" subtitle="查看当前账号的基本信息" />

        <n-grid cols="1 1024:2" :x-gap="gap" :y-gap="gap" responsive="screen">
            <n-gi>
                <n-card title="基本信息">
                    <n-descriptions :column="1" bordered>
                        <n-descriptions-item label="头像">
                            <n-avatar :src="avatarPreview" :size="48" round />
                        </n-descriptions-item>
                        <n-descriptions-item label="昵称">
                            {{ profileForm.nickname || '—' }}
                        </n-descriptions-item>
                        <n-descriptions-item label="邮箱">
                            {{ profileForm.email || '—' }}
                        </n-descriptions-item>
                        <n-descriptions-item label="手机号">
                            {{ profileForm.phone || '—' }}
                        </n-descriptions-item>
                    </n-descriptions>
                </n-card>
            </n-gi>

            <n-gi>
                <n-card title="安全设置">
                    <n-descriptions :column="1" bordered>
                        <n-descriptions-item label="角色">
                            {{ adminStore.adminInfo?.role || '—' }}
                        </n-descriptions-item>
                        <n-descriptions-item label="状态">
                            <n-tag :type="adminStore.adminInfo?.status === 1 ? 'success' : 'default'">
                                {{ adminStore.adminInfo?.status === 1 ? '正常' : '禁用' }}
                            </n-tag>
                        </n-descriptions-item>
                        <n-descriptions-item label="最近登录">
                            {{ adminStore.adminInfo?.lastLoginAt || '—' }}
                        </n-descriptions-item>
                    </n-descriptions>
                    <n-alert type="info" :show-icon="false" class="mt-(--gap)">
                        修改密码 / 更新个人资料功能待后端 API 接入后开放
                    </n-alert>
                </n-card>
            </n-gi>
        </n-grid>
    </n-space>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useAdminStore } from '@/shared/stores/admin';
import { useDesignTokens } from '@/shared/composables/useDesignTokens';

defineOptions({ name: 'AccountSettingsPage' });

const { gap } = useDesignTokens();
const adminStore = useAdminStore();

// 头像预览（只读，从 store 读取）
const avatarPreview = ref('');

// 基本信息表单（只读展示用）
const profileForm = reactive({
    nickname: '',
    email: '',
    phone: '',
});

// 页面挂载时从 store 回填当前账号信息
onMounted(() => {
    const info = adminStore.adminInfo;
    if (info) {
        profileForm.nickname = info.name || '';
        profileForm.email = (info.email as string) || '';
        profileForm.phone = (info.phone as string) || '';
        avatarPreview.value = adminStore.adminAvatar;
    }
});
</script>
