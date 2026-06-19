/**
 * 权限守卫（Vue Router 5 返回值模式）
 *
 * 在登录态守卫之后执行。检查：
 *   1. 动态路由是否已加载
 *   2. 目标路由是否存在
 *   3. 用户是否有权限访问目标路由
 *
 * 行为：
 *   - 路由不存在（to.matched.length === 0）→ 404
 *   - 路由存在但无权限（accessRouter 返回 false）→ 403
 *   这两种场景要区分对待，避免把「无权访问」误报成「页面不存在」。
 */
import type { Router } from 'vue-router';
import { usePermissionStore } from '@/shared/stores/permission';
import { useAdminStore } from '@/shared/stores/admin';
import { usePermission } from '@/shared/composables/usePermission';
import { WHITE_LIST } from '@/app/router/constants';

export default function setupPermissionGuard(router: Router) {
    router.beforeEach(async (to, _from) => {
        const permissionStore = usePermissionStore();
        const adminStore = useAdminStore();
        const { accessRouter } = usePermission();

        if (WHITE_LIST.includes(to.name as string)) {
            return true;
        }

        // 未登录时重定向到登录页（此守卫在 adminLoginInfo 之后执行，
        // 到达此处说明用户未登录且访问非白名单页面，必须拦截）
        if (!adminStore.isLoggedIn) {
            return { name: 'LoginPage' };
        }

        if (permissionStore.isReady) {
            // 路由存在 + 有权限 → 放行
            if (to.matched.length > 0 && accessRouter(to)) {
                return true;
            }
            // 路由存在 + 无权限 → 403
            if (to.matched.length > 0) {
                return { name: 'ForbiddenPage' };
            }
            // 路由不存在 → 404
            return { name: 'NotFoundPage' };
        }

        // 动态路由未加载 → 放行（由 adminLoginInfo 守卫兜底）
        return true;
    });
}
