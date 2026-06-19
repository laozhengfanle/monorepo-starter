import type { RouteRecordRaw } from 'vue-router';
import { MAIN_LAYOUT } from '@/app/router/constants';
import { wrapAsync } from '@/app/router/wrap-async';

/**
 * 仪表盘路由 — 静态注册
 * 登录就能访问（个人门面页），不进 seed 菜单表
 *
 * 子组件用 wrapAsync() 包裹 ErrorBoundary
 */
export default {
    path: '/dashboard',
    name: 'Dashboard',
    component: MAIN_LAYOUT,
    redirect: { name: 'DashboardWelcomePage' },
    meta: {
        title: '仪表盘',
        icon: 'tabler:Dashboard',
    },
    children: [
        {
            path: 'welcome',
            name: 'DashboardWelcomePage',
            component: wrapAsync(() => import('@/features/dashboard/WelcomePage.vue')),
            meta: { title: '欢迎页' },
        },
        {
            path: 'analysis',
            name: 'DashboardAnalysisPage',
            component: wrapAsync(() => import('@/features/dashboard/AnalysisPage.vue')),
            meta: { title: '分析页' },
        },
    ],
} as RouteRecordRaw;
