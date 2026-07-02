/**
 * menuToRoutes — 服务端菜单树 → Vue Router 路由
 *
 * 转换规则：
 *   directory → 空父路由（component = MAIN_LAYOUT），仅用于菜单分组
 *   menu      → 内部路径 → 实际路由，component 从 componentMap 查找
 *            → 外部链接 → 不产生路由，单独收集，菜单点击时新窗口打开
 *   button   → 不产生路由，仅收集权限码
 *
 * 注意：后端 getCurrentUserMenus() 已过滤 button，此模块仍兼容含 button 的完整树。
 *
 * 重要：node.type 的取值必须与后端 AdminMenu 表 type 字段（admin-menu.schema.ts）
 * 完全一致 —— 之前版本用 'folder'，已统一为 'directory'，任何不一致会导致
 * switch 静默不命中，整棵菜单树被丢弃（典型症状：侧边栏空白 + 所有动态页 404）。
 *
 * XSS 防护：
 *   - node.icon 仅作为字符串存入 route.meta，最终由 useMenuTree.ts
 *     调用 resolveIcon() 查表渲染为 Vue 组件
 *   - 严禁 v-html 渲染 menu.icon：恶意菜单下发 <script>...</script> 会执行 JS
 *   - 当前已统一通过 iconMap + resolveIcon() 安全渲染（见 @/shared/utils/icon-resolver）
 */
import type { RouteRecordRaw } from 'vue-router';
import type { MenuNode } from '@/features/iam/menus/types';
import { MAIN_LAYOUT } from '@/app/router/constants';

// ============================================================
// 组件映射表 — 服务端返回的 component 字符串 → 实际 Vue 组件
// 新增页面时在这里注册
// ============================================================
const componentMap: Record<string, () => Promise<unknown>> = {
    'iam/admins': () => import('@/features/iam/admins/AdminsPage.vue'),
    'iam/admin-detail': () => import('@/features/iam/admins/AdminDetailPage.vue'),
    'iam/roles': () => import('@/features/iam/roles/RolesPage.vue'),
    'iam/menus': () => import('@/features/iam/menus/MenusPage.vue'),
    'config/admin': () => import('@/features/config/settings/SettingsPage.vue'),
    'config/logs': () => import('@/features/config/logs/LogsPage.vue'),
    'account/profile': () => import('@/features/account/ProfilePage.vue'),
    'account/settings': () => import('@/features/account/AccountSettingsPage.vue'),
    'config/sms-provider': () => import('@/features/config/sms-provider/SmsProviderPage.vue'),
    'config/sms-credential': () => import('@/features/config/sms-provider/SmsCredentialPage.vue'),
    'config/storage-driver': () => import('@/features/config/storage-driver/StorageDriverPage.vue'),
    'config/mail-service': () => import('@/features/config/mail-service/MailServicePage.vue'),
    'config/mail-credential': () => import('@/features/config/mail-service/MailCredentialPage.vue'),
    'config/oauth': () => import('@/features/config/oauth/OauthPage.vue'),
    'config/turnstile': () => import('@/features/config/turnstile/TurnstilePage.vue'),
    'config/cache': () => import('@/features/config/cache/CachePage.vue'),
    // 仪表盘 — 由后端菜单表 permissionCode 驱动权限（dashboard:welcome / dashboard:analytics）
    'dashboard/welcome': () => import('@/features/dashboard/WelcomePage.vue'),
    'dashboard/analysis': () => import('@/features/dashboard/AnalysisPage.vue'),
    // 功能演示 — 基座组件展示用
    'playground/editor': () => import('@/features/playground/EditorPlaygroundPage.vue'),
};

function resolveComponent(key: string): (() => Promise<unknown>) | undefined {
    return componentMap[key];
}

function isExternal(path: string): boolean {
    // 仅允许 http / https 协议，拒绝 javascript: / data: / vbscript: 等危险伪协议
    return /^https?:\/\//.test(path);
}

/** 安全拼接路径片段，始终返回以 / 开头的绝对路径 */
function joinPath(parent: string, child: string): string {
    let result = parent ? parent + '/' + child : child;
    result = result.replace(/\/+/g, '/');
    return result.startsWith('/') ? result : '/' + result;
}

export interface ExternalMenu {
    routeName: string;
    name: string;
    path: string;
    icon?: string;
    sort?: number;
    hideInMenu?: boolean;
}

interface ConvertResult {
    routes: RouteRecordRaw[];
    externalMenus: ExternalMenu[];
    buttonPermissions: string[];
}

/**
 * 克隆节点并替换 children（保留 discriminated union 类型）
 */
function cloneWithChildren(node: MenuNode, children: MenuNode[]): MenuNode {
    return { ...node, children } as MenuNode;
}

/**
 * 归一化：无论后端返扁平数组还是树形，统一转成树形结构
 *
 * 判断规则：
 *   - 任意节点有 children → 认定是树形，直接返回
 *   - 全部节点无 children → 认定是扁平数组，用 parentId 重建树
 */
function ensureTree(menus: MenuNode[]): MenuNode[] {
    if (menus.some((m) => m.children && m.children.length > 0)) {
        return menus;
    }

    const map = new Map<string, MenuNode>();
    const roots: MenuNode[] = [];

    for (const node of menus) {
        map.set(node.id, cloneWithChildren(node, []));
    }

    for (const node of map.values()) {
        const pid = node.parentId;
        if (pid !== undefined && pid !== null && map.has(pid)) {
            const parent = map.get(pid)!;
            if (!parent.children) parent.children = [];
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

/**
 * 菜单树 → 路由数组 + 外部链接列表 + 按钮权限码
 */
export function menuToRoutes(menus: MenuNode[]): ConvertResult {
    const tree = ensureTree(menus);
    const routes: RouteRecordRaw[] = [];
    const externalMenus: ExternalMenu[] = [];
    const buttonPermissions: string[] = [];

    // 建 id → routeName 映射（仅 PageNode 有 routeName）
    const idToRouteName = new Map<string, string>();
    function collectIds(nodes: MenuNode[]) {
        for (const node of nodes) {
            if (node.type === 'menu') {
                idToRouteName.set(node.id, node.routeName);
            }
            if (node.children) collectIds(node.children);
        }
    }
    collectIds(tree);

    function walk(nodes: MenuNode[], parentPath = ''): RouteRecordRaw[] {
        const result: RouteRecordRaw[] = [];

        const sorted = [...nodes].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

        for (const node of sorted) {
            // enabled === false → 彻底不可用，不注册路由
            if (node.enabled === false) continue;

            switch (node.type) {
                case 'directory': {
                    // 目录节点：在 router 里注册一个空父路由，children 由子节点填充。
                    // path 使用绝对路径（joinPath 确保以 / 开头），便于子路由以相对路径挂载。
                    const childParentPath = parentPath
                        ? joinPath(parentPath, node.path || '')
                        : node.path
                          ? joinPath('', node.path)
                          : '';
                    const children = node.children ? walk(node.children, childParentPath) : [];
                    if (children.length > 0) {
                        // 找第一个非 directory 的子节点作为 redirect 目标，避免跳转到空内容区
                        const firstLeaf = children.find((c) => !c.children || c.children.length === 0);
                        // directory 路由需要 name，否则 n-menu 的 key 为空字符串，
                        // 导致菜单高亮/展开时 findAncestorKeys 无法正确回溯父级
                        const folderRouteName = `Folder_${node.path || node.id}`;
                        result.push({
                            path: node.path ? joinPath('', node.path) : '',
                            name: folderRouteName,
                            component: MAIN_LAYOUT,
                            redirect: firstLeaf ? { name: firstLeaf.name as string } : undefined,
                            meta: {
                                title: node.name,
                                icon: node.icon,
                                order: node.sort,
                                hideInMenu: node.visible === false,
                            },
                            children,
                        });
                    }
                    break;
                }

                case 'menu': {
                    // 外部链接 → 不产生路由，单独收集
                    if (isExternal(node.path || '')) {
                        externalMenus.push({
                            routeName: node.routeName,
                            name: node.name,
                            path: node.path!,
                            icon: node.icon,
                            sort: node.sort,
                        });
                        break;
                    }

                    const componentPath = node.component || '';
                    const component = resolveComponent(componentPath);

                    if (!component) {
                        console.warn(`[menuToRoutes] 组件 "${componentPath}" 未注册，跳过路由 "${node.routeName}"`);
                        break;
                    }

                    // activeMenuId → activeMenu 解析
                    const resolvedActiveMenu =
                        node.activeMenuId !== undefined ? idToRouteName.get(node.activeMenuId) : undefined;

                    // 子路由使用相对路径（与静态路由一致），避免 router.addRoute
                    // 注册时绝对路径子路由无法正确嵌套在父级 <router-view> 中渲染
                    // meta.permissions 注入：菜单表 permissionCode → 路由级权限码
                    // - 有 permissionCode → 路由层强制校验（usePermission.accessRouter）
                    // - 无 permissionCode → 放行（如公共页面 / Naive UI 演示页）
                    // - 配合后端 AdminPermissionGuard 形成"前后端双层防御"：
                    //   路由级挡住 UI 入口，API 级挡住数据请求
                    result.push({
                        path: parentPath ? node.path || '' : node.path ? joinPath('', node.path) : '',
                        name: node.routeName,
                        component,
                        meta: {
                            title: node.name,
                            icon: node.icon,
                            order: node.sort,
                            hideInMenu: node.visible === false,
                            ignoreCache: !(node.keepAlive ?? true),
                            activeMenu: resolvedActiveMenu,
                            permissions: node.permissionCode ? [node.permissionCode] : undefined,
                        },
                    });
                    break;
                }

                case 'button': {
                    // permissionCode 在 ButtonNode 上为必填
                    buttonPermissions.push(node.permissionCode);
                    break;
                }
            }
        }
        return result;
    }

    routes.push(...walk(tree));

    return { routes, externalMenus, buttonPermissions };
}

export { componentMap };
