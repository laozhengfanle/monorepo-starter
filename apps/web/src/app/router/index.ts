/**
 * 路由配置 — C端（会员端）应用
 *
 * 路由结构：
 *   - 公开页面：首页、产品、帮助 → DefaultLayout
 *   - 认证页面：登录 → AuthLayout
 *   - 需登录页面：个人中心 → DefaultLayout + requiresAuth
 *   - VIP 页面：VIP 内容 → DefaultLayout + requiresVip（vip/svip 都能进）
 *   - SVIP 页面：SVIP 独享内容 → DefaultLayout + requiresSvip（必须是 svip）
 *   - VIP 升级页：升级提示 → DefaultLayout + requiresAuth
 *
 * 路由 meta 说明：
 *   - requiresAuth: 需要登录才能访问
 *   - requiresVip: 需要 VIP/SVIP 角色才能访问（vip 或 svip）
 *   - requiresSvip: 必须 SVIP 角色才能访问（严格等值 svip，不含 vip）
 *   - layout: 使用的布局组件名称
 *
 * 所有页面级路由的 component 字段用 wrapAsync() 包裹 ErrorBoundary，
 * 防止子组件渲染错误导致 SPA 白屏
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { setupGuards } from './guards';
import { wrapAsync } from './wrap-async';

/** 路由定义 */
const routes: RouteRecordRaw[] = [
    {
        path: '/',
        component: () => import('@/app/layouts/DefaultLayout.vue'),
        children: [
            {
                path: '',
                name: 'HomePage',
                component: wrapAsync(() => import('@/features/home/HomePage.vue')),
                meta: { title: '首页' },
            },
            {
                path: 'products',
                name: 'ProductsPage',
                component: wrapAsync(() => import('@/features/products/ProductsPage.vue')),
                meta: { title: '产品' },
            },
            {
                path: 'help',
                name: 'HelpPage',
                component: wrapAsync(() => import('@/features/help/HelpPage.vue')),
                meta: { title: '帮助' },
            },
            {
                path: 'profile',
                name: 'ProfilePage',
                component: wrapAsync(() => import('@/features/profile/ProfilePage.vue')),
                meta: { title: '个人中心', requiresAuth: true },
            },
            {
                path: 'vip',
                name: 'VipPage',
                component: wrapAsync(() => import('@/features/vip/VipPage.vue')),
                meta: { title: 'VIP 专区', requiresVip: true },
            },
            {
                // SVIP 专属页面：必须是 svip 角色才能进入
                path: 'svip',
                name: 'SvipPage',
                component: wrapAsync(() => import('@/features/vip/SvipPage.vue')),
                meta: { title: 'SVIP 专区', requiresAuth: true, requiresSvip: true },
            },
            {
                path: 'vip-upgrade',
                name: 'VipUpgradePage',
                component: wrapAsync(() => import('@/features/vip/VipUpgradePage.vue')),
                meta: { title: '升级 VIP', requiresAuth: true },
            },
        ],
    },
    {
        path: '/login',
        component: () => import('@/app/layouts/AuthLayout.vue'),
        children: [
            {
                path: '',
                name: 'LoginPage',
                component: wrapAsync(() => import('@/features/auth/LoginPage.vue')),
                meta: { title: '登录' },
            },
        ],
    },
];

/** 创建路由实例 — 使用 HTML5 History 模式 */
const router = createRouter({
    history: createWebHistory(),
    routes,
    // 路由切换后滚动到页面顶部
    scrollBehavior() {
        return { top: 0 };
    },
});

// 安装路由守卫
setupGuards(router);

export default router;
