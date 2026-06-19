/**
 * 认证 REST API（BFF 层）
 *
 * 后端路由对照：
 *   POST /admin/auth/login  → 登录（Set-Cookie + CSRF token 回传）
 *   POST /auth/refresh      → 刷新 Token（Set-Cookie）
 *   POST /auth/logout       → 登出（Clear-Cookie）
 *
 * Token 策略：
 *   - 登录成功后，后端通过 Set-Cookie 写入 httpOnly Cookie
 *   - 前端不持有 token 值，所有请求自动携带 Cookie
 *   - 刷新 Token 同理，后端通过 Set-Cookie 更新 Cookie
 *   - 登出时后端清除 Cookie
 */
import { post } from '@/shared/request/request';
import { setCsrfToken, clearCsrfToken } from '@/shared/request/csrf';

// ============================================================
// 类型
// ============================================================
export interface LoginParams {
    username: string;
    password: string;
    /**
     * Cloudflare Turnstile 一次性 token
     * - 后端 AdminLoginSchema.turnstileToken 是 optional
     * - 未配 Turnstile / 关闭时：不传（undefined → JSON.stringify 跳过该字段）
     * - 启用 + 后端校验：必传（getToken() 返回值）
     */
    turnstileToken?: string;
}

// ============================================================
// RESTful API
// ============================================================

/**
 * 登录
 *
 * 后端通过 Set-Cookie 写入 httpOnly Cookie，
 * 前端无需处理 token，仅标记登录状态。
 *
 * 后端登录响应里 data.csrfToken 是 CSRF 防护用的 token，
 * 通过 Set-Cookie 写入 __Host-csrf-token / csrf-token 后，前端缓存到内存，
 * 后续所有 GraphQL mutation 都通过 x-csrf-token header 携带。
 */
export async function login(params: LoginParams): Promise<void> {
    const resp = await post<{
        code: number;
        data: { mustChangePassword?: boolean; csrfToken?: string };
    }>('/admin/auth/login', params);
    if (resp?.data?.csrfToken) {
        setCsrfToken(resp.data.csrfToken);
    }
}

/**
 * 刷新 Token
 *
 * 后端通过 Set-Cookie 更新 httpOnly Cookie，
 * 前端无需处理 token。
 */
export async function refreshToken(): Promise<void> {
    await post('/auth/refresh');
}

/**
 * 登出
 *
 * 后端清除 httpOnly Cookie。
 * 前端同步清掉 CSRF token 缓存，避免登出后旧 token 仍能通过本地缓存校验。
 */
export async function logout(): Promise<void> {
    await post('/auth/logout');
    // 清 CSRF token 缓存，避免登出后旧 token 仍能通过本地缓存校验
    clearCsrfToken();
}
