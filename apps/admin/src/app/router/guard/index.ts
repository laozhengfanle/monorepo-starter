/**
 * 路由守卫组装（Vue Router 5 返回值模式）
 *
 * 执行顺序：
 *   1. setupPageGuard      → 广播路由变化事件（菜单高亮、TabBar 用）
 *   2. setupAdminLoginInfoGuard → 登录态检查 + 动态路由注入
 *   3. setupPermissionGuard     → 权限兜底检查
 *   4. setupRecentVisitGuard    → 记录最近访问页面（localStorage 持久化）
 */
import type { Router } from 'vue-router';
import { setRouteEmitter } from '@/app/router/route-listener';
import setupAdminLoginInfoGuard from './adminLoginInfo';
import setupPermissionGuard from './permission';

// 最近访问的 localStorage key 和最大记录数
const RECENT_VISITS_KEY = 'dashboard-recent-visits';
const MAX_RECENT_VISITS = 6;

function setupPageGuard(router: Router) {
    router.beforeEach(async (to) => {
        // 广播路由变化，供菜单、TabBar 等订阅
        setRouteEmitter(to);
        return true;
    });
}

// 全局后置守卫：记录最近访问的页面
function setupRecentVisitGuard(router: Router) {
    router.afterEach((to) => {
        // 排除欢迎页和登录页，不需要记录
        if (to.path === '/dashboard/welcome' || to.path === '/login') return;

        // 读取已有记录
        let list: { title: string; path: string; time: number }[] = [];
        try {
            const raw = localStorage.getItem(RECENT_VISITS_KEY);
            if (raw) list = JSON.parse(raw);
        } catch (err) {
            // 数据损坏时忽略
            console.warn('[RouterGuard] localStorage 数据解析失败:', err);
        }

        // 获取页面标题
        const title = (to.meta?.title as string) || to.name?.toString() || to.path;

        // 去重：同路径移除旧记录
        const filtered = list.filter((v) => v.path !== to.path);

        // 插入到最前面
        filtered.unshift({ title, path: to.path, time: Date.now() });

        // 最多保留 MAX_RECENT_VISITS 条
        localStorage.setItem(RECENT_VISITS_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT_VISITS)));
    });
}

export default function createRouteGuard(router: Router) {
    setupPageGuard(router);
    setupAdminLoginInfoGuard(router);
    setupPermissionGuard(router);
    setupRecentVisitGuard(router);
}
