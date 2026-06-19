/**
 * 认证 REST API（BFF 层 — 会员端）
 *
 * 后端路由对照：
 *   POST /member/auth/sms/send  → 发送短信验证码
 *   POST /member/auth/sms/login → 短信验证码登录
 *   POST /auth/logout           → 登出（Clear-Cookie）
 *
 * Token 策略：
 *   - httpOnly Cookie 由后端管理，前端不持有 token 值
 *   - credentials: 'include' 确保跨域请求也携带 Cookie
 */

// ============================================================
// RESTful API
// ============================================================

/**
 * 发送短信验证码
 *
 * @param phone 手机号码
 * @param purpose 用途（如 'login'、'register'）
 * @param turnstileToken Cloudflare Turnstile 验证 token（可选，后端按需校验）
 */
export async function sendSmsCode(phone: string, purpose: string, turnstileToken?: string): Promise<void> {
    const response = await fetch('/api/member/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, purpose, turnstileToken }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || '发送验证码失败');
    }
}

/**
 * 短信验证码登录
 *
 * 登录成功后，后端通过 Set-Cookie 写入 httpOnly Cookie。
 * 前端无需手动存储 token。
 *
 * @param phone 手机号码
 * @param code 短信验证码（6 位数字）
 * @param turnstileToken Cloudflare Turnstile 验证 token（可选，后端按需校验）
 */
export async function smsLogin(phone: string, code: string, turnstileToken?: string): Promise<void> {
    const response = await fetch('/api/member/auth/sms/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, code, turnstileToken }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || '登录失败');
    }
}

/**
 * 退出登录
 *
 * 清除前端登录状态和用户信息。
 * 后端 Cookie 由后端接口清除。
 *
 * 注意：路径必须是 /api/auth/logout，而不是 /api/member/auth/logout
 * 因为 server 端 logout 端点只在共享的 AuthController（/auth/*）中，admin 和 web 端共用
 */
export async function logout(): Promise<void> {
    await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
    });
}
