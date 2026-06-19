/**
 * 登录态守卫（Vue Router 5 返回值模式）
 *
 * 逻辑：
 *   有 token？
 *   ├─ 是 → 有管理员信息？
 *   │   ├─ 是 → 根路由跳首页，其余放行
 *   │   └─ 无 → 调 /me → generateRoutes → 重定向到目标页
 *   └─ 否 → 是白名单页面？
 *       ├─ 是 → 放行
 *       └─ 否 → 跳 /login（只有非禁跳页面才带 ?redirect=xxx）
 *
 * 失败短路（防 getMe 反复触发）：
 *   - meFailed 标记：getMe() 401 失败后置 true，下一次守卫直接跳登录页、不再调 getMe
 *   - 避免命中后端节流器（20 req/10s）+ 控制台被 [Guard] 警告刷屏
 *   - resetMePromise()（login/logout 流程）会同时重置该标记
 */
import type { Router } from 'vue-router';
import { useAdminStore } from '@/shared/stores/admin';
import type { MeResponse } from '@/api';
import { WHITE_LIST, REDIRECT_BAN_LIST, DEFAULT_ROUTE_NAME } from '@/app/router/constants';

let mePromise: Promise<MeResponse> | null = null;

/**
 * getMe() 失败标记 — 置 true 后，守卫不再尝试 getMe()，直接走登录页
 *
 * 为什么需要这个标记（而不是只靠 adminStore.isLoggedIn）：
 *   - isLoggedIn 是初始化时从 localStorage.auth_status 读出来的 ref，401 不会自动更新
 *   - 我们在 catch 里调 markLoggedOut() 让 isLoggedIn 翻 false，但标记仍有用作"双保险"：
 *     如果 markLoggedOut 因为某种原因没生效（比如 store 未注册），也不会触发更多 getMe
 *   - 同时用作"是否已经打印过警告"的开关（避免控制台被同一条警告刷屏）
 */
let meFailed = false;

/** 重置 mePromise 缓存 + 失败标记 — 供 logout()/login() 成功后调用，确保下次守卫走新的 /me 请求 */
export function resetMePromise() {
    mePromise = null;
    meFailed = false;
}

function loginRedirect(to: { name?: string | symbol | null }) {
    const name = to.name as string | undefined;
    if (name && !REDIRECT_BAN_LIST.includes(name)) {
        return { name: 'LoginPage', query: { redirect: name } };
    }
    return { name: 'LoginPage' };
}

export default function setupAdminLoginInfoGuard(router: Router) {
    router.beforeEach(async (to, _from) => {
        const adminStore = useAdminStore();

        if (adminStore.isLoggedIn) {
            if (adminStore.adminInfo) {
                if (to.name === 'Root') {
                    return { name: DEFAULT_ROUTE_NAME };
                }
                // 已登录 + 路由已加载 + 匹配不到 → 可能是 hash 输错，跳 404
                if (to.name === 'NotFoundPage') {
                    return true;
                }
                return true;
            }

            // 已经失败过一次：不再调 getMe()，直接跳登录页
            // 防止节流器被打爆（throttler 默认 20 req/10s）
            if (meFailed) {
                return loginRedirect(to);
            }

            if (!mePromise) {
                mePromise = adminStore.getMe();
            }

            try {
                await mePromise;
                if (to.name === 'Root') {
                    return { name: DEFAULT_ROUTE_NAME };
                }
                // 动态路由刚就绪，NotFoundPage 表示刷新前 URL 匹配不到已过时路由
                // 用 hash 中的原始路径重新导航，让新路由表重新匹配
                if (to.name === 'NotFoundPage') {
                    const hashPath = window.location.hash.slice(1) || '/';
                    return { path: hashPath, replace: true };
                }
                return { ...to, replace: true };
            } catch {
                // 401/20003 失败：graphql-client.ts 已经 handleAuthExpired() 硬跳登录页了，
                // 这里的 catch 走不到（window.location.replace 中断 JS 执行）。
                // 保留这段兜底是为了：
                //   1) 防御性：万一 handleAuthExpired 因为某种原因没生效，仍能 markLoggedOut
                //   2) 路由层保险：meFailed 标记后下次守卫直接早退，不再发请求
                // 故意不 console.warn：登录过期是预期行为，不需要污染控制台
                adminStore.markLoggedOut();
                meFailed = true;
                mePromise = null;
                return loginRedirect(to);
            }
        }

        if (WHITE_LIST.includes(to.name as string)) {
            return true;
        }

        return loginRedirect(to);
    });
}
