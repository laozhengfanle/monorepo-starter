import type { ExternalMenu } from '@/app/router/menu-to-routes';

/**
 * Naive UI 官网（外部链接菜单）
 *
 * 外部链接不产生 Vue Router 路由，仅作为菜单项显示在侧边栏，
 * 点击后在新窗口打开。
 */
const NAIVE_UI: ExternalMenu = {
    routeName: 'NaiveUIWebsite',
    name: 'Naive UI',
    path: 'https://www.naiveui.com',
    icon: 'tabler:Link',
    sort: 8,
    hideInMenu: true,
};

export default NAIVE_UI;
