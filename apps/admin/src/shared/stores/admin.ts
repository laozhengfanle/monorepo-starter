/**
 * Admin Store — 当前管理员认证与信息管理
 *
 * 登录流程：
 *   login() → 调登录接口（后端 Set-Cookie 写入 httpOnly Cookie）
 *          → 标记登录状态 → 调 /me 获取管理员信息 + 菜单 + 权限码
 *          → adminStore 存管理员信息 → permissionStore.generateRoutes() 注入动态路由
 *
 * 登出流程：
 *   logout() → 调登出接口（后端 Clear-Cookie）→ 清登录状态 → 清管理员信息
 *          → permissionStore.reset() 移除动态路由
 *
 * Token 策略：
 *   - httpOnly Cookie 由后端管理，前端不持有 token 值
 *   - localStorage 仅存储登录状态标志（auth_status），不含 token
 *   - 页面刷新后通过 auth_status 判断是否需要重新获取管理员信息
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login as loginApi, getMe as getMeApi, logout as logoutApi } from '@/api';
import type { LoginParams, AdminInfo, MeResponse } from '@/api';
import { setAuthStatus, removeAuthStatus, hasAuthStatus } from '@/shared/request/request';
import { usePermissionStore } from './permission';
import { useTabBarStore } from './tabBar';
import { useSettingsStore } from './settings';
// 跨层导入：store 引用 router guard 中的 mePromise 重置函数。
// 这是打破分层原则的例外——logout 时需清空 guard 层的 mePromise 缓存，
// 确保下次登录时守卫走新的 /me 请求。避免 guard ↔ store 之间的循环依赖。
import { resetMePromise } from '@/app/router/guard/adminLoginInfo';

export const useAdminStore = defineStore('admin', () => {
    // ---- 状态 ----
    /** 是否已登录（基于 httpOnly Cookie + localStorage 标志） */
    const isLoggedIn = ref<boolean>(hasAuthStatus());
    const adminInfo = ref<AdminInfo | null>(null);

    const adminName = computed(() => adminInfo.value?.name ?? '');
    const adminAvatar = computed(() => adminInfo.value?.avatar ?? '/hero.png');

    // ---- 登录 ----
    async function login(params: LoginParams) {
        // 登录成功后，后端通过 Set-Cookie 写入 httpOnly Cookie
        await loginApi(params);
        // 前端仅标记登录状态
        isLoggedIn.value = true;
        setAuthStatus();
        // 获取管理员信息
        await getMe();
        // 重新加载管理员偏好（admin_preferences key 不在公开配置白名单内，登录后才有权限拉到）
        // 引导阶段用 publicConfigs 加载的偏好不完整，需要补一次
        const settingsStore = useSettingsStore();
        await settingsStore.reloadAdminPreferences();
    }

    // ---- 获取管理员信息 ----
    async function getMe(): Promise<MeResponse> {
        const data = await getMeApi();
        adminInfo.value = data.admin;

        const permissionStore = usePermissionStore();
        permissionStore.generateRoutes(data.menus, data.permissions, data.roles);

        return data;
    }

    // ---- 登出 ----
    async function logout() {
        try {
            // 后端清除 httpOnly Cookie
            await logoutApi();
        } finally {
            const permissionStore = usePermissionStore();
            const tabBarStore = useTabBarStore();
            permissionStore.reset();
            tabBarStore.resetTabList();
            adminInfo.value = null;
            isLoggedIn.value = false;
            removeAuthStatus();
            resetMePromise();
        }
    }

    /**
     * 标记为已登出（仅前端态，不调后端登出接口）
     *
     * 用途：路由守卫捕获到 getMe() 401 失败时调用，让 isLoggedIn 立即从 true 翻到 false，
     * 避免后续路由跳转再次触发 getMe() —— 否则会反复命中后端节流器（20 req/10s），
     * 同时控制台会被 [Guard] 获取用户信息失败 警告刷屏。
     *
     * 与 logout() 的区别：
     *   - logout() 走「完整登出流程」：调登出接口、清菜单、清 tabBar、清登录状态
     *   - markLoggedOut() 只更新「登录状态 + 管理员信息」，不调后端（refresh 已经失败过）、
     *     不清权限/菜单/tabBar（让用户跳到登录页后能立即看到干净的界面，登录成功后会被覆盖）
     */
    function markLoggedOut() {
        adminInfo.value = null;
        isLoggedIn.value = false;
    }

    /**
     * 更新管理员信息（前端态）
     *
     * 用途：账号设置页面编辑昵称/邮箱/手机号时调用，立即反映到导航栏和 ProfilePage。
     *
     * 注意：当前仅更新前端内存态，不持久化到后端（修改接口尚未接入）。
     * 后端 API 接入后，应在此处追加 PATCH /admin/me 调用并刷新 adminInfo。
     *
     * @param patch 要更新的字段（Partial<AdminInfo>）
     */
    function updateAdminInfo(patch: Partial<AdminInfo>) {
        if (!adminInfo.value) return;
        adminInfo.value = { ...adminInfo.value, ...patch };
    }

    return {
        isLoggedIn,
        adminInfo,
        adminName,
        adminAvatar,
        login,
        getMe,
        logout,
        markLoggedOut,
        updateAdminInfo,
    };
});
