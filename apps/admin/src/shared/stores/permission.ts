/**
 * Permission Store — 权限/菜单/动态路由核心
 *
 * 登录后由 /me 接口回填权限码和菜单树，generateRoutes() 将菜单转换为
 * Vue Router 动态路由并注入。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { RouteRecordRaw } from 'vue-router';
import type { MenuNode } from '@/features/iam/menus/types';
import { menuToRoutes, type ExternalMenu } from '@/app/router/menu-to-routes';
import router from '@/app/router';

export const usePermissionStore = defineStore('permission', () => {
    // ---- 状态 ----
    const permissions = ref<string[]>([]);
    const menus = ref<MenuNode[]>([]);
    const dynamicRoutes = ref<RouteRecordRaw[]>([]);
    const externalMenus = ref<ExternalMenu[]>([]);
    const isReady = ref(false);
    /** 是否超级管理员（后端 guard 直接放行，前端也需同步放行） */
    const isSuperAdmin = ref(false);

    // ---- 权限码 Set（O(1) 查找，computed 自动追踪 permissions 变化） ----
    const permissionSet = computed(() => new Set(permissions.value));

    function hasPermission(code: string): boolean {
        // super_admin 直接放行，与后端 AdminPermissionGuard 行为一致
        if (isSuperAdmin.value) return true;
        return permissionSet.value.has(code);
    }

    /** 递归统计菜单树节点总数 */
    const menuCount = computed(() => {
        function count(nodes: MenuNode[]): number {
            return nodes.reduce((sum, n) => sum + 1 + count(n.children || []), 0);
        }
        return count(menus.value);
    });

    function hasAnyPermission(codes: string[]): boolean {
        // super_admin 直接放行，与后端 AdminPermissionGuard 行为一致
        if (isSuperAdmin.value) return true;
        return codes.some((c) => permissionSet.value.has(c));
    }

    function hasAllPermission(codes: string[]): boolean {
        // super_admin 直接放行，与后端 AdminPermissionGuard 行为一致
        if (isSuperAdmin.value) return true;
        return codes.every((c) => permissionSet.value.has(c));
    }

    // ---- 核心：从菜单树生成路由并注入 ----
    // menuList 接受完整 MenuNode[]（兼容含 button 的树），内部 button 的权限码会自动合并
    function generateRoutes(menuList: MenuNode[], permList: string[], roles?: string[]) {
        // 先清除旧的动态路由（支持重复调用，如菜单管理页修改后刷新）
        dynamicRoutes.value.forEach((route) => {
            if (route.name) {
                router.removeRoute(route.name as string);
            }
        });
        dynamicRoutes.value = [];

        permissions.value = permList;
        menus.value = menuList;
        // super_admin 标记：与后端 AdminPermissionGuard 行为一致，直接放行所有权限
        isSuperAdmin.value = roles?.includes('super_admin') ?? false;

        const { routes, externalMenus: extMenus, buttonPermissions } = menuToRoutes(menuList);

        // 外部链接存储（不注入路由）
        externalMenus.value = extMenus;

        // 按钮权限码合并到权限池（后端可能已包含，用 Set 去重）
        if (buttonPermissions.length > 0) {
            const merged = new Set([...permList, ...buttonPermissions]);
            permissions.value = [...merged];
        }

        // 过滤掉与已有静态路由重名的路由，避免冲突
        const existingNames = new Set(
            router
                .getRoutes()
                .map((r) => r.name)
                .filter(Boolean),
        );
        const newRoutes = routes.filter((route) => {
            const name = route.name as string | undefined;
            if (!name) return true; // 无 name 的路由，正常注入
            if (existingNames.has(name)) {
                console.warn(`[permissionStore] 路由 "${name}" 已存在，跳过注入`);
                return false;
            }
            return true;
        });
        dynamicRoutes.value = newRoutes;

        // 注入动态路由
        newRoutes.forEach((route) => {
            router.addRoute(route);
        });

        isReady.value = true;
    }

    // ---- 重置 ----
    function reset() {
        dynamicRoutes.value.forEach((route) => {
            if (route.name) {
                router.removeRoute(route.name as string);
            }
        });
        dynamicRoutes.value = [];
        externalMenus.value = [];
        permissions.value = [];
        menus.value = [];
        isSuperAdmin.value = false;
        isReady.value = false;
    }

    return {
        permissions,
        menus,
        menuCount,
        dynamicRoutes,
        externalMenus,
        isReady,
        isSuperAdmin,
        permissionSet,
        hasPermission,
        hasAnyPermission,
        hasAllPermission,
        generateRoutes,
        reset,
    };
});
