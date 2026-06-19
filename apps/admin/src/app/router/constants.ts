import type { RouteRecordRaw } from 'vue-router';

/** 主布局（侧边栏 + 顶栏 + 内容区），所有需登录的业务路由父组件都指向它 */
export const MAIN_LAYOUT = () => import('@/app/layouts/MainLayout.vue');

/** 文档布局（侧边栏 + 顶栏 + 可固定 Anchor 的滚动容器），文档类路由使用 */
export const DOC_LAYOUT = () => import('@/app/layouts/DocLayout.vue');

/** 游客布局（无侧边栏），所有无需登录的业务路由父组件都指向它 */
export const GUEST_LAYOUT = () => import('@/app/layouts/GuestLayout.vue');

/** 游客可访问的白名单路由 */
export const WHITE_LIST: string[] = ['LoginPage', 'NotFoundPage', 'ForbiddenPage', 'ServerErrorPage'];

/** 重定向路由名称（用于 tab 页刷新跳转） */
export const REDIRECT_ROUTE_NAME = 'RedirectPage';

/** 默认首页路由名称 */
export const DEFAULT_ROUTE_NAME = 'DashboardWelcomePage';

/** 不允许作为 redirect 目标的路由（白名单 + Redirect 中转页） */
export const REDIRECT_BAN_LIST: string[] = [...WHITE_LIST, REDIRECT_ROUTE_NAME, 'Root'];

/** 404 路由 — 根据登录状态动态切换 GuestLayout / MainLayout */
export const NOT_FOUND_ROUTE: RouteRecordRaw = {
    path: '/:pathMatch(.*)*',
    component: () => import('@/app/exceptions/NotFoundLayout.vue'),
    meta: { hideInMenu: true },
    children: [
        {
            path: '',
            name: 'NotFoundPage',
            component: () => import('@/app/exceptions/NotFoundPage.vue'),
            meta: { title: '404', hideInMenu: true },
        },
    ],
};

/** 403 路由 — 继承 MainLayout */
export const FORBIDDEN_ROUTE: RouteRecordRaw = {
    path: '/403',
    component: MAIN_LAYOUT,
    meta: { hideInMenu: true },
    children: [
        {
            path: '',
            name: 'ForbiddenPage',
            component: () => import('@/app/exceptions/ForbiddenPage.vue'),
            meta: { public: true, title: '403', hideInMenu: true },
        },
    ],
};

/** 500 路由 — 继承 MainLayout */
export const SERVER_ERROR_ROUTE: RouteRecordRaw = {
    path: '/500',
    component: MAIN_LAYOUT,
    meta: { hideInMenu: true },
    children: [
        {
            path: '',
            name: 'ServerErrorPage',
            component: () => import('@/app/exceptions/ServerErrorPage.vue'),
            meta: { public: true, title: '500', hideInMenu: true },
        },
    ],
};

/** 重定向路由（用于 tab 页刷新，参照 arco 的 REDIRECT_MAIN） */
export const REDIRECT_ROUTE: RouteRecordRaw = {
    path: '/redirect',
    name: 'RedirectWrapper',
    component: MAIN_LAYOUT,
    meta: {
        hideInMenu: true,
    },
    children: [
        {
            path: '/redirect/:path(.*)',
            name: REDIRECT_ROUTE_NAME,
            component: () => import('@/app/redirect/RedirectPage.vue'),
            meta: {
                hideInMenu: true,
            },
        },
    ],
};

/** 登录路由 */
export const LOGIN_ROUTE: RouteRecordRaw = {
    path: '/login',
    component: GUEST_LAYOUT,
    meta: {
        title: '登录',
        hideInMenu: true,
    },
    children: [
        {
            path: '',
            name: 'LoginPage',
            component: () => import('@/features/login/LoginPage.vue'),
            meta: {
                title: '登录',
            },
        },
    ],
};
