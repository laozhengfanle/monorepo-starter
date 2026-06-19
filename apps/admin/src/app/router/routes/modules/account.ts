import type { RouteRecordRaw } from 'vue-router';
import { MAIN_LAYOUT } from '@/app/router/constants';
import { wrapAsync } from '@/app/router/wrap-async';

/**
 * 个人账号路由
 * 2 个子栏目：个人中心、账号设置
 * hideInMenu: 不在侧边栏菜单中显示（通过右下角用户菜单进入）
 *
 * 子组件用 wrapAsync() 包裹 ErrorBoundary
 */
export default {
    path: '/account',
    name: 'Account',
    component: MAIN_LAYOUT,
    redirect: { name: 'AccountProfilePage' },
    meta: {
        title: '个人账号',
        icon: 'tabler:User',
        hideInMenu: true,
    },
    children: [
        {
            path: 'profile',
            name: 'AccountProfilePage',
            component: wrapAsync(() => import('@/features/account/ProfilePage.vue')),
            meta: {
                title: '个人中心',
            },
        },
        {
            path: 'settings',
            name: 'AccountSettingsPage',
            component: wrapAsync(() => import('@/features/account/AccountSettingsPage.vue')),
            meta: {
                title: '账号设置',
            },
        },
    ],
} as RouteRecordRaw;
