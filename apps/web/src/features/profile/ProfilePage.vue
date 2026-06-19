<!--
  ProfilePage — 个人中心页
  展示当前登录用户的个人信息（昵称、头像、角色等）
  需要登录才能访问（路由守卫控制）
-->
<template>
    <div class="max-w-3xl mx-auto px-4 py-12">
        <h1 class="text-2xl font-bold text-gray-900 mb-6">个人中心</h1>

        <!-- 用户信息卡片 -->
        <n-card v-if="authStore.user" bordered>
            <div class="flex items-start gap-6">
                <!-- 头像 -->
                <n-avatar v-if="authStore.user.avatar" :src="authStore.user.avatar" :size="72" round />
                <n-avatar v-else :size="72" round>
                    {{ avatarText }}
                </n-avatar>

                <!-- 用户详情 -->
                <div class="flex-1">
                    <h2 class="text-xl font-semibold text-gray-900">
                        {{ authStore.user.nickname || '未设置昵称' }}
                    </h2>
                    <p class="text-sm text-gray-500 mt-1">账户 ID：{{ authStore.user.accountId }}</p>

                    <!-- 角色标签 -->
                    <div class="flex gap-2 mt-3">
                        <n-tag v-for="role in authStore.user.roles" :key="role" :type="roleTagType(role)" size="small">
                            {{ roleLabel(role) }}
                        </n-tag>
                    </div>
                </div>
            </div>
        </n-card>

        <!-- 未获取到用户信息（理论上不会出现，路由守卫会拦截） -->
        <n-empty v-else description="暂无用户信息">
            <template #extra>
                <n-button type="primary" @click="router.push('/login')"> 去登录 </n-button>
            </template>
        </n-empty>
    </div>
</template>

<script setup lang="ts">
/**
 * ProfilePage 组件逻辑
 *
 * 展示当前登录用户的个人信息：
 *   - 头像、昵称
 *   - 账户 ID
 *   - 角色标签（普通会员、VIP、SVIP）
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/features/auth/store';

const authStore = useAuthStore();
const router = useRouter();

/** 用户头像文字（取昵称首字） */
const avatarText = computed(() => {
    const nickname = authStore.user?.nickname;
    return nickname ? nickname.charAt(0) : '用';
});

/**
 * 角色标签类型（Naive UI Tag 的 type 属性）
 *
 * @param role 角色标识
 * @returns Tag 类型
 */
function roleTagType(role: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
    switch (role) {
        case 'svip':
            return 'warning';
        case 'vip':
            return 'success';
        default:
            return 'default';
    }
}

/**
 * 角色标签文字
 *
 * @param role 角色标识
 * @returns 中文标签
 */
function roleLabel(role: string): string {
    switch (role) {
        case 'svip':
            return 'SVIP';
        case 'vip':
            return 'VIP';
        case 'member':
            return '普通会员';
        default:
            return role;
    }
}
</script>
