import type { RouteRecordRaw } from 'vue-router';
import { DOC_LAYOUT } from '@/app/router/constants';
import { wrapAsync } from '@/app/router/wrap-async';

/**
 * 文档路由
 * - 单个动态路由 /docs/:slug?，由 DocPage.vue 根据 slug 参数加载对应的 .md 文件
 * - slug 为空时显示占位提示，引导用户从侧边栏选择
 * - hideInMenu: 不在侧边栏主菜单中显示（通过左下角辅助菜单进入）
 * - 所有 .md 文件自动出现在 DocLayout 的侧边栏导航中，无需手动注册路由
 */
export default {
    path: '/docs',
    name: 'Docs',
    component: DOC_LAYOUT,
    redirect: { name: 'DocPage' },
    meta: {
        title: '文档',
        icon: 'tabler:FileText',
        hideInMenu: true,
    },
    children: [
        {
            path: ':slug?',
            name: 'DocPage',
            component: wrapAsync(() => import('@/features/docs/DocPage.vue')),
            meta: {
                title: '文档内容',
            },
        },
    ],
} as RouteRecordRaw;
