/**
 * useMenuTree — 路由 → Naive UI MenuOption[] 转换
 *
 * 数据来源：静态路由（appRoutes）+ 动态路由（permissionStore.dynamicRoutes）
 * 过滤逻辑：权限 → hideInMenu → 排序 → 递归构建菜单树
 *
 * 通过 listenerRouteChange 自动同步菜单高亮和展开状态。
 */
import { h, computed, ref, onUnmounted } from 'vue';
import { useRouter, type RouteRecordRaw } from 'vue-router';
import { NIcon } from 'naive-ui';
import { usePermission } from '@/shared/composables/usePermission';
import { usePermissionStore } from '@/shared/stores/permission';
import { listenerRouteChange } from '@/app/router/route-listener';
import { appRoutes, appExternalMenus } from '@/app/router/routes';
import { DEFAULT_ROUTE_NAME } from '@/app/router/constants';
import { resolveIcon } from '@/shared/utils/icon-resolver';
import type { MenuOption } from 'naive-ui';

// ---- 类型 ----
// MenuOption 是 naive-ui 的联合类型，不能用 extends，用 type 交叉
type AppMenuOption = MenuOption & {
    name?: string;
    path?: string;
    order?: number;
};

// ---- 外部链接判断 ----
const URL_RE = /^https?:\/\//;

// ---- 单条路由 → 菜单项（仅顶级才带图标） ----
function routeToMenuOption(route: RouteRecordRaw, depth = 0): AppMenuOption {
    const icon = depth === 0 ? resolveIcon(route.meta?.icon as string | undefined) : null;
    return {
        label: (route.meta?.title as string) || (route.name as string) || '',
        key: (route.name as string) || '',
        path: route.path,
        name: (route.name as string) || undefined,
        icon: icon ? () => h(NIcon, null, { default: () => h(icon) }) : undefined,
    } as AppMenuOption;
}

export default function useMenuTree() {
    const router = useRouter();
    const permissionStore = usePermissionStore();
    const { accessRouter } = usePermission();

    // ---- 全量路由（静态 + 动态） ----
    // 静态路由作为骨架（path、component、routeName 稳定）
    // 动态路由提供权限码、菜单元数据（meta.permissions、meta.icon、meta.title 等）
    // 同名 route 以动态 meta 覆盖静态 meta（保证菜单表权限码生效）
    const allRoutes = computed<RouteRecordRaw[]>(() => {
        const dynamic = permissionStore.dynamicRoutes;
        // routeName → dynamic route 索引（O(1) 查找）
        const dynamicByName = new Map<string, RouteRecordRaw>();
        for (const r of dynamic) {
            if (r.name) dynamicByName.set(r.name as string, r);
        }

        // 合并：同名 route 用 dynamic 覆盖 static（保留 static 的 path/component）
        const merged = [...appRoutes].map((route) => {
            const dyn = route.name ? dynamicByName.get(route.name as string) : undefined;
            if (!dyn) return route;
            return {
                ...route,
                meta: { ...route.meta, ...dyn.meta },
            };
        });

        // 追加 dynamic 中新出现的 route（不在 static 里的）
        const staticNames = new Set(appRoutes.map((r) => r.name).filter(Boolean));
        const newDynamic = dynamic.filter((r) => r.name && !staticNames.has(r.name as string));

        return [...merged, ...newDynamic];
    });

    // ---- 菜单树（路由 + 外部链接） ----
    const menuTree = computed<AppMenuOption[]>(() => {
        // 浅拷贝数组后排序，避免修改原数组
        const copy = [...allRoutes.value].sort(
            (a, b) => ((a.meta?.order as number) ?? 0) - ((b.meta?.order as number) ?? 0),
        );

        function travel(routes: RouteRecordRaw[], depth: number): AppMenuOption[] {
            const collector: AppMenuOption[] = [];

            for (const route of routes) {
                // 权限过滤
                if (!accessRouter(route)) continue;

                // 深层 hideInMenu 过滤
                if (depth > 0 && route.meta?.hideInMenu) continue;

                // 根级 hideInMenu：叶子节点直接跳过
                if (depth === 0 && route.meta?.hideInMenu && (!route.children || route.children.length === 0)) continue;

                // 无子节点 → 叶子菜单项（子节点不带图标）
                if (!route.children || route.children.length === 0) {
                    collector.push(routeToMenuOption(route, depth));
                    continue;
                }

                // 有子节点 → 递归
                const children = travel(route.children, depth + 1);

                if (children.length > 0) {
                    // 根级 hideInMenu 目录（即使有可见子节点也隐藏整个目录）
                    if (depth === 0 && route.meta?.hideInMenu) continue;
                    const parentIcon = resolveIcon(route.meta?.icon as string | undefined);
                    collector.push({
                        label: (route.meta?.title as string) || route.name || '',
                        key: (route.name as string) || '',
                        icon: parentIcon ? () => h(NIcon, null, { default: () => h(parentIcon) }) : undefined,
                        children,
                    });
                } else {
                    // 子节点全被过滤后，父节点自身如果是 hideInMenu 也隐藏
                    if (depth === 0 && route.meta?.hideInMenu) continue;
                    collector.push(routeToMenuOption(route, depth));
                }
            }
            return collector;
        }

        const routeMenus = travel(copy, 0);

        // 追加外部链接菜单（静态配置 + 后端动态，不通过路由，直接新窗口打开）
        const allExtMenus = [...appExternalMenus, ...permissionStore.externalMenus];
        const extMenus: AppMenuOption[] = allExtMenus
            .filter((m) => !m.hideInMenu)
            .map((m) => {
                const extIcon = resolveIcon(m.icon);
                return {
                    label: m.name,
                    key: m.routeName,
                    path: m.path,
                    name: m.routeName,
                    order: m.sort,
                    icon: extIcon ? () => h(NIcon, null, { default: () => h(extIcon) }) : undefined,
                };
            })
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        return [...routeMenus, ...extMenus];
    });

    // ---- 预建 parentKey Map：O(depth) 祖先查找，替代 O(tree) 递归遍历 ----
    const parentMap = computed(() => {
        const map = new Map<string, string>();
        function walk(nodes: AppMenuOption[], parentKey?: string) {
            for (const node of nodes) {
                const key = node.key as string;
                if (parentKey) map.set(key, parentKey);
                if (node.children) {
                    walk(node.children as AppMenuOption[], key);
                }
            }
        }
        walk(menuTree.value);
        return map;
    });

    function findAncestorKeys(target: string): string[] | null {
        const map = parentMap.value;
        if (!map.has(target)) return null;
        const ancestors: string[] = [];
        let key: string | undefined = target;
        while (key) {
            const parent = map.get(key);
            if (!parent) break;
            ancestors.unshift(parent);
            key = parent;
        }
        return ancestors.length > 0 ? ancestors : null;
    }

    // ---- 菜单状态 ----
    const openKeys = ref<string[]>([]);
    const selectedKey = ref<string>(DEFAULT_ROUTE_NAME);

    // ---- 路由变化 → 自动同步菜单状态 ----
    const unsubRoute = listenerRouteChange((newRoute) => {
        const { hideInMenu, activeMenu } = newRoute.meta;
        const target = (activeMenu || newRoute.name) as string;

        if (target && (!hideInMenu || activeMenu)) {
            const ancestors = findAncestorKeys(target);
            if (ancestors) {
                openKeys.value = [...new Set(ancestors)];
            }
            selectedKey.value = target;
        }
    });

    onUnmounted(() => {
        unsubRoute();
    });

    // ---- 菜单点击 → 导航 ----
    function onMenuClick(key: string, item: AppMenuOption) {
        const targetPath = item.path;
        if (targetPath && URL_RE.test(targetPath)) {
            window.open(targetPath, '_blank', 'noopener,noreferrer');
            return;
        }
        if (key) {
            router.push({ name: key });
        }
        selectedKey.value = key;
    }

    return {
        menuTree,
        openKeys,
        selectedKey,
        onMenuClick,
    };
}
