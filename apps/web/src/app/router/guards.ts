/**
 * 路由守卫 — C端（会员端）应用
 *
 * 守卫逻辑：
 *   1. requiresAuth 但未登录 → 重定向到 /login，并携带 redirect 参数
 *   2. requiresVip 但角色不是 vip/svip → 重定向到 /vip-upgrade
 *   3. requiresSvip 但角色不是 svip（严格） → 重定向到 /vip-upgrade
 *   4. 已登录用户访问 /login → 重定向到首页
 *
 * 三种守卫的关系（重点，新手必读）：
 *   - requiresAuth：最宽松，只看是否登录
 *   - requiresVip：登录 + 角色是 vip 或 svip（vip.includes('vip') 匹配两个值）
 *   - requiresSvip：登录 + 角色严格等于 svip（vip 不行）
 *
 * 为什么要分 requiresVip 和 requiresSvip？
 *   SVIP 页面是"仅 SVIP 可见"的高级功能。如果只复用 requiresVip，
 *   普通 VIP 用户也能进，达不到"独享"效果。所以单独再加一道
 *   严格等值校验：必须 === 'svip' 才能通过。
 *
 * Token 策略：
 *   - 使用 httpOnly Cookie 鉴权，前端不存储 token
 *   - 通过 authStore.isLoggedIn 判断登录状态
 *   - 页面刷新后需调 fetchUser() 恢复登录状态
 */
import type { Router } from 'vue-router';
import { useAuthStore } from '@/features/auth/store';

/**
 * 安装路由守卫
 *
 * @param router Vue Router 实例
 */
export function setupGuards(router: Router) {
    router.beforeEach(async (to, _from) => {
        const authStore = useAuthStore();

        // 页面刷新后，如果 localStorage 标记为已登录，尝试恢复用户信息
        // 仅在首次导航时执行（authStore.user 为空但 isLoggedIn 为 true 的情况）
        if (authStore.isLoggedIn && !authStore.user) {
            try {
                await authStore.fetchUser();
            } catch {
                // 恢复失败（Cookie 过期等），清除登录状态
                authStore.isLoggedIn = false;
            }
        }

        // 已登录用户访问登录页 → 重定向到首页
        if (to.name === 'LoginPage' && authStore.isLoggedIn) {
            return { name: 'HomePage' };
        }

        // 需要登录但未登录 → 重定向到登录页，携带 redirect 参数
        if (to.meta.requiresAuth && !authStore.isLoggedIn) {
            return {
                name: 'LoginPage',
                query: { redirect: to.fullPath },
            };
        }

        // 需要 VIP 角色但不是 VIP/SVIP → 重定向到升级页
        // 注意：这里用 some + === 'vip' / === 'svip'，目的是兼容"角色数组里多个值"的情况
        // 举个例子：用户 roles = ['member', 'vip']，some 匹配 'vip'，通过
        if (to.meta.requiresVip) {
            const roles = authStore.user?.roles || [];
            const isVip = roles.some((role) => role === 'vip' || role === 'svip');
            if (!isVip) {
                return { name: 'VipUpgradePage' };
            }
        }

        // 需要 SVIP 角色（严格）但不是 SVIP → 重定向到升级页
        // 关键：这里用 === 'svip' 严格等值，而不是 includes('vip')。
        // 原因：vip 用户能进 requiresVip 的页面，但**不能**进 requiresSvip 的页面。
        // 如果复用 includes('vip')，普通 vip 也会被放进来，违背"SVIP 独享"的语义。
        // 注意：和 requiresVip 不同，我们只看第一个角色（后端角色是单一主角色）
        if (to.meta.requiresSvip) {
            const userRole = authStore.user?.roles?.[0];
            if (userRole !== 'svip') {
                return { name: 'VipUpgradePage' };
            }
        }

        // 放行
        return true;
    });
}
