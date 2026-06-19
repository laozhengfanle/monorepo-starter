import 'vue-router';

declare module 'vue-router' {
    interface RouteMeta {
        // 页面标题（菜单 + 浏览器 tab）
        title?: string;
        // 菜单图标（Naive UI icon 名）
        icon?: string;
        // 所需权限码，如 ['iam:admin:delete']，空或未设置 = 不校验权限
        permissions?: string[];
        // true = 不在侧边栏显示
        hideInMenu?: boolean;
        // 菜单排序（值越小越靠前）
        order?: number;
        // 指定高亮的菜单项（route.name），用于 hideInMenu 页面
        activeMenu?: string;
        // true = 不被 keep-alive 缓存
        ignoreCache?: boolean;
    }
}
