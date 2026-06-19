/**
 * usePermission — 权限判断 composable
 *
 * 两层权限：
 *   1. 路由级：accessRouter(route)   → 用户是否能访问该路由
 *   2. 按钮级：hasPermission(code)   → 用户是否有某个操作权限
 *
 * 权限码来源：usePermissionStore，登录后由 /me 接口填充。
 */
import { usePermissionStore } from '@/shared/stores/permission';
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';

export function usePermission() {
    const permissionStore = usePermissionStore();

    /**
     * 检查用户能否访问某个路由
     * 规则：未配置 permissions → 所有人可访问（需满足 requiresAuth）
     *       配置了 permissions → 用户至少拥有其中一个权限码即可
     *
     * 路由级权限校验：遍历 to.matched 链上所有有 permissions 配置的层级，任一不满足则拒绝。
     * 为什么遍历整链：vue-router 4 的 meta 不自动继承，父级 directory 与子级 menu 各自持有自己的
     * meta.permissions。例如「仪表盘目录」无权限码 + 「分析页 menu」有 dashboard:analytics，
     * matched 链里两条都要检查（目录不限制、分析页受限）。
     *
     * 也支持传入 RouteRecordRaw（菜单生成、findFirstPermissionRoute 用），单条匹配。
     */
    function accessRouter(route: RouteLocationNormalized | RouteRecordRaw): boolean {
        // to.matched 是父→子数组；RouteRecordRaw 没 matched，走单条
        const list: Array<{ meta?: { permissions?: string[] } }> =
            'matched' in route && Array.isArray(route.matched) && route.matched.length > 0 ? route.matched : [route];

        for (const r of list) {
            const perms = r.meta?.permissions as string[] | undefined;
            // 未配置 = 不限制（放行继续检查下一级）
            if (!perms || perms.length === 0) continue;
            // 配置了 = 用户必须拥有至少一个，否则 403
            if (!permissionStore.hasAnyPermission(perms)) {
                return false;
            }
        }
        // 所有有 permissions 配置的层级都通过 → 放行
        return true;
    }

    /** 是否拥有某个权限码 */
    function hasPermission(code: string): boolean {
        return permissionStore.hasPermission(code);
    }

    /** 是否拥有任意一个权限码 */
    function hasAnyPermission(codes: string[]): boolean {
        return permissionStore.hasAnyPermission(codes);
    }

    /** 是否拥有全部权限码 */
    function hasAllPermission(codes: string[]): boolean {
        return permissionStore.hasAllPermission(codes);
    }

    /**
     * 从路由列表中找出用户能访问的第一个路由（权限不足时兜底跳转用）
     */
    function findFirstPermissionRoute(routes: RouteRecordRaw[]): { name: string } | null {
        const queue = [...routes];
        while (queue.length) {
            const route = queue.shift()!;
            if (accessRouter(route) && route.name) {
                return { name: route.name as string };
            }
            if (route.children) {
                queue.push(...route.children);
            }
        }
        return null;
    }

    return {
        accessRouter,
        hasPermission,
        hasAnyPermission,
        hasAllPermission,
        findFirstPermissionRoute,
    };
}
