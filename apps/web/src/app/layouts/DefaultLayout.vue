<!--
  DefaultLayout — C端默认布局
  包含：顶部导航栏 + 主内容区 + 底部页脚
  适用于：首页、产品、帮助、个人中心、VIP/SVIP 等页面
-->
<template>
    <div class="min-h-screen flex flex-col">
        <!-- 顶部导航栏 -->
        <header class="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
            <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
                <!-- 左侧：Logo + 导航链接 -->
                <div class="flex items-center gap-6">
                    <!-- Logo -->
                    <router-link to="/" class="text-lg font-bold text-gray-800 no-underline"> 会员中心 </router-link>
                    <!-- 导航链接 -->
                    <nav class="hidden sm:flex items-center gap-4">
                        <router-link
                            to="/"
                            class="text-sm text-gray-600 hover:text-gray-900 no-underline transition-colors"
                            active-class="!text-blue-600 font-medium"
                        >
                            首页
                        </router-link>
                        <router-link
                            to="/products"
                            class="text-sm text-gray-600 hover:text-gray-900 no-underline transition-colors"
                            active-class="!text-blue-600 font-medium"
                        >
                            产品
                        </router-link>
                        <router-link
                            to="/help"
                            class="text-sm text-gray-600 hover:text-gray-900 no-underline transition-colors"
                            active-class="!text-blue-600 font-medium"
                        >
                            帮助
                        </router-link>
                    </nav>
                </div>

                <!-- 右侧：登录/用户信息 -->
                <div class="flex items-center gap-3">
                    <!-- 未登录：显示登录按钮 -->
                    <template v-if="!authStore.isLoggedIn">
                        <n-button size="small" type="primary" @click="goLogin"> 登录 </n-button>
                    </template>

                    <!-- 已登录：显示用户信息 -->
                    <template v-else>
                        <n-dropdown :options="userMenuOptions" @select="onUserMenuSelect">
                            <div class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                                <!-- 用户头像 -->
                                <n-avatar v-if="authStore.user?.avatar" :src="authStore.user.avatar" :size="28" round />
                                <n-avatar v-else :size="28" round>
                                    {{ avatarText }}
                                </n-avatar>
                                <!-- 用户昵称 -->
                                <span class="text-sm text-gray-700">
                                    {{ authStore.user?.nickname || '用户' }}
                                </span>
                            </div>
                        </n-dropdown>
                    </template>
                </div>
            </div>
        </header>

        <!-- 主内容区 -->
        <main class="flex-1">
            <router-view />
        </main>

        <!-- 底部页脚 -->
        <footer class="border-t border-gray-200 bg-gray-50 py-6">
            <div class="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
                <p>&copy; {{ currentYear }} 会员中心. All rights reserved.</p>
            </div>
        </footer>
    </div>
</template>

<script setup lang="ts">
/**
 * DefaultLayout 组件逻辑
 *
 * 功能：
 *   - 顶部导航栏：Logo、导航链接（首页/产品/帮助）、登录/用户信息
 *   - 用户下拉菜单：个人中心、VIP 专区、（SVIP 用户才显示）SVIP 专区、退出登录
 *   - 底部页脚：版权信息
 *
 * 关于 SVIP 入口：
 *   SVIP 入口只在角色 === 'svip' 时才插入下拉菜单，普通 vip 和普通用户看不到。
 *   这样做有两个目的：
 *     1. UX：避免给普通用户展示"点进去也进不去"的死路入口
 *     2. 一致性：菜单项是 computed 出来的，跟随 authStore.user.roles 变化自动更新
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/features/auth/store';
import type { DropdownOption } from 'naive-ui';

const router = useRouter();
const authStore = useAuthStore();

/** 当前年份（用于页脚版权信息） */
const currentYear = new Date().getFullYear();

/** 用户头像文字（取昵称首字，无昵称取"用"） */
const avatarText = computed(() => {
    const nickname = authStore.user?.nickname;
    return nickname ? nickname.charAt(0) : '用';
});

/** 当前用户是否 SVIP（取 roles[0] 主角色，严格等值 svip） */
const isSvip = computed(() => authStore.user?.roles?.[0] === 'svip');

/** 用户下拉菜单选项（根据角色动态插入 SVIP 入口） */
const userMenuOptions = computed<DropdownOption[]>(() => {
    // 基础菜单：所有已登录用户都能看到
    const options: DropdownOption[] = [
        { label: '个人中心', key: 'profile' },
        { label: 'VIP 专区', key: 'vip' },
    ];
    // 仅 SVIP 用户才插这条
    if (isSvip.value) {
        options.push({ label: 'SVIP 专属', key: 'svip' });
    }
    options.push({ type: 'divider', key: 'd1' });
    options.push({ label: '退出登录', key: 'logout' });
    return options;
});

/** 跳转到登录页 */
function goLogin() {
    router.push({ name: 'LoginPage' });
}

/** 用户菜单选择处理 */
async function onUserMenuSelect(key: string) {
    switch (key) {
        case 'profile':
            router.push({ name: 'ProfilePage' });
            break;
        case 'vip':
            router.push({ name: 'VipPage' });
            break;
        case 'svip':
            // 仅当角色是 svip 时菜单里才会有这一项，所以这里无需再做校验
            router.push({ name: 'SvipPage' });
            break;
        case 'logout':
            await authStore.logout();
            router.push({ name: 'HomePage' });
            break;
    }
}
</script>
