/**
 * CSRF Token 管理
 *
 * 职责：
 * 1. 从后端 /api/auth/csrf-token 获取 token
 * 2. 缓存 token 供请求模块使用
 * 3. 写请求（mutation / POST/PUT/DELETE）自动在 Header 中携带 X-CSRF-Token
 *
 * 工作原理（Double Submit Cookie）：
 * - 后端在 cookie 中设置 __Host-csrf-token（httpOnly，前端无法读取）
 * - 后端同时在 JSON 响应中返回 token 值
 * - 前端将 token 存入内存，后续写请求在 X-CSRF-Token header 中携带
 * - 后端校验 cookie 与 header 中的 token 是否一致
 */

/** CSRF token 缓存（内存中，页面刷新后需重新获取） */
let cachedToken: string | null = null;

/** 是否正在获取 token（防止并发重复请求） */
let fetchingPromise: Promise<string> | null = null;

/**
 * 获取 CSRF token
 *
 * - 首次调用时从后端获取
 * - 后续调用直接返回缓存
 * - 并发调用不会重复请求
 */
export async function getCsrfToken(): Promise<string> {
    // 已缓存，直接返回
    if (cachedToken) {
        return cachedToken;
    }

    // 正在获取中，复用同一个 Promise
    if (fetchingPromise) {
        return fetchingPromise;
    }

    // 发起获取请求
    fetchingPromise = fetchCsrfToken();
    try {
        return await fetchingPromise;
    } finally {
        fetchingPromise = null;
    }
}

/**
 * 清除缓存的 CSRF token
 *
 * 在以下场景调用：
 * - 登出后
 * - CSRF 校验失败（403）后，需要重新获取
 */
export function clearCsrfToken(): void {
    cachedToken = null;
}

/**
 * 直接设置 CSRF token（从登录响应中获取，避免额外请求）
 *
 * 登录响应一次性下发 CSRF token 后调用此方法缓存，
 * 后续写请求无需再调用 GET /api/auth/csrf-token
 */
export function setCsrfToken(token: string): void {
    cachedToken = token;
}

/**
 * 从后端获取 CSRF token
 */
async function fetchCsrfToken(): Promise<string> {
    const response = await fetch('/api/auth/csrf-token', {
        method: 'GET',
        credentials: 'include',
    });

    if (!response.ok) {
        // 获取失败不阻塞主流程（开发环境可能没有后端）
        console.warn('[CSRF] Failed to fetch CSRF token:', response.status);
        return '';
    }

    const data = (await response.json()) as { token?: string };
    cachedToken = data.token || null;
    return cachedToken || '';
}
