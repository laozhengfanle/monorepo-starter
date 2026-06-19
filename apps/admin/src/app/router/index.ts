import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { FORBIDDEN_ROUTE, LOGIN_ROUTE, NOT_FOUND_ROUTE, REDIRECT_ROUTE, SERVER_ERROR_ROUTE } from './constants';
import { appRoutes } from './routes';
import createRouteGuard from './guard';

const routes: RouteRecordRaw[] = [
    // 根路由由守卫决定跳转目标（登录态 → 首页动态路由，未登录 → login）
    {
        path: '/',
        name: 'Root',
        // 空组件占位，守卫会立即重定向
        component: () => import('@/app/layouts/MainLayout.vue'),
    },
    LOGIN_ROUTE,
    ...appRoutes,
    REDIRECT_ROUTE,
    FORBIDDEN_ROUTE,
    SERVER_ERROR_ROUTE,
    NOT_FOUND_ROUTE,
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
    scrollBehavior() {
        return { top: 0 };
    },
});

createRouteGuard(router);

export default router;
