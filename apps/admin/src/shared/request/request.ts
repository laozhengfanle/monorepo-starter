/**
 * HTTP 请求封装
 *
 * 基于 fetch 的轻量级请求工具，统一处理：
 *   - 基础 URL 拼接
 *   - JSON 序列化 / 反序列化
 *   - credentials: 'include'（自动携带 httpOnly Cookie）
 *   - 401 自动刷新 Token 并重发原请求
 *   - 错误响应处理
 *
 * Token 策略：
 *   - 登录成功后，后端通过 Set-Cookie 写入 httpOnly Cookie
 *   - 前端不持有 token 值，所有请求自动携带 Cookie
 *   - 前端仅在 localStorage 存储登录状态标志（不含 token）
 *   - 401 时自动调 /auth/refresh 刷新 Cookie，成功后重发原请求
 *
 * CSRF 防护说明：
 *   - 当前使用 httpOnly Cookie + credentials: 'include' 进行鉴权
 *   - httpOnly Cookie 无法被 JavaScript 读取，但浏览器会自动携带
 *   - 这意味着恶意网站可以构造跨站请求（CSRF 攻击）
 *   - SameSite=Strict Cookie 属性可防止跨站发送，但浏览器兼容性不一致
 *   - 接入真实后端时，后端应实现以下防护之一：
 *     1. CSRF Token：后端下发 token，前端在请求头中携带
 *     2. Double Submit Cookie：Cookie 中存 token，请求头中携带相同值
 *     3. SameSite=Strict：设置 Cookie 的 SameSite 属性为 Strict
 *
 * 所有 API 请求通过 Vite proxy（开发期）转发到 NestJS 后端（http://localhost:3000）。
 */

import { refreshAuthToken } from './auth-refresh';
import { getRequestTimeout, BASE_URL } from './request-config';
import { getCsrfToken, clearCsrfToken } from './csrf';
import { translateErrorCode } from '@/shared/composables/useErrorMessage';
// 统一日志出口：替代直接 log 调用，详见 utils/logger.ts
import logger from '../utils/logger';
/** 登录状态在 localStorage 中的 key（仅存标志，不含 token） */
const AUTH_STATUS_KEY = 'auth_status';

/**
 * 标记已登录（仅存标志，不存 token）
 *
 * ⚠️ 安全说明：此标志不是鉴权凭据，仅用于 UX 优化（页面刷新后判断是否需要重新获取 /me）。
 * 实际鉴权完全依赖 httpOnly Cookie（由后端管理），即使此标志被伪造，
 * 后续 /me 请求会因 Cookie 无效而返回 401，自动清除登录状态。
 */
export function setAuthStatus(): void {
    localStorage.setItem(AUTH_STATUS_KEY, '1');
}

/** 标记未登录 */
export function removeAuthStatus(): void {
    localStorage.removeItem(AUTH_STATUS_KEY);
}

/** 检查是否曾经登录（仅用于页面刷新后恢复状态，实际鉴权依赖 Cookie） */
export function hasAuthStatus(): boolean {
    return localStorage.getItem(AUTH_STATUS_KEY) === '1';
}
/** 自定义 API 错误，后端返回非 2xx 时抛出 */
export class ApiError extends Error {
    /** HTTP 状态码 */
    status: number;
    /** 后端返回的错误体（如果有） */
    body: unknown;

    constructor(status: number, message: string, body?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

/** 通用请求选项 */
interface RequestOptions extends Omit<RequestInit, 'body'> {
    /** 请求体，会自动 JSON.stringify */
    body?: unknown;
    /** 是否需要认证，默认 true（httpOnly Cookie 模式下始终携带 Cookie） */
    auth?: boolean;
    /** 内部标记：是否为刷新 Token 后的重试请求，防止无限循环 */
    _isRetry?: boolean;
}

/**
 * 处理 401 响应：尝试刷新 Token 并重发原请求
 *
 * @returns 重试后的响应，或 null（刷新失败，需要重新登录）
 */
async function handle401<T>(path: string, options: RequestOptions): Promise<{ result: T } | null> {
    // 防止无限循环：重试请求不再触发刷新
    if (options._isRetry) {
        return null;
    }

    // 尝试刷新 Token
    const refreshed = await refreshAuthToken();
    if (!refreshed) {
        return null;
    }

    // 刷新成功，重发原请求
    const retryOptions: RequestOptions = { ...options, _isRetry: true };
    const result = await requestInner<T>(path, retryOptions);
    return { result };
}

/**
 * 内部请求实现（不含 401 重试逻辑，由 request 调用）
 */
async function requestInner<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, auth: _auth = true, headers: customHeaders, ...rest } = options;

    // 构建请求头
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((customHeaders as Record<string, string>) || {}),
    };

    // httpOnly Cookie 模式：浏览器自动携带 Cookie，无需手动设置 Authorization
    // _auth 保留仅为解构时排除，避免传入 fetch

    /**
     * CSRF 防护：写请求（POST/PUT/PATCH/DELETE）必须携带 x-csrf-token header
     * - 后端校验 cookie 中的 csrf-token 与 header 中的值是否一致（Double Submit Cookie）
     * - GET 请求不需要 CSRF token（安全操作，不修改数据）
     */
    const method = (rest.method || 'GET').toUpperCase();
    const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isWriteMethod) {
        const csrfToken = await getCsrfToken();
        if (csrfToken) {
            headers['x-csrf-token'] = csrfToken;
        }
    }

    // 发起 fetch 请求（credentials: 'include' 确保跨域携带 Cookie）
    // signal 使用 AbortSignal.timeout() 设置超时，超时后会抛出 DOMException(name: 'TimeoutError')
    let response: Response;
    try {
        response = await fetch(`${BASE_URL}${path}`, {
            ...rest,
            headers,
            credentials: 'include',
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(getRequestTimeout()),
        });
    } catch (e: unknown) {
        // 超时或网络中断 → 统一抛出 ApiError(408)，方便 UI 层展示
        if (e instanceof DOMException && e.name === 'TimeoutError') {
            throw new ApiError(408, '请求超时，请检查网络后重试');
        }
        // 其他网络异常（如断网）
        throw new ApiError(0, '网络异常，请检查连接');
    }

    // 处理非 2xx 响应
    if (!response.ok) {
        let errorBody: unknown;
        try {
            errorBody = await response.json();
        } catch (err) {
            // 响应体不是 JSON，忽略解析错误
            logger.warn('[Request] 响应体 JSON 解析失败', { error: err });
        }
        /**
         * 错误消息优先级：
         *   1. 后端返回的 message（业务异常通常是 i18n 友好的）
         *   2. 后端返回的 code 查 ERROR_CODES 字典（message 缺失时兜底）
         *   3. HTTP statusText
         */
        const body = errorBody as { message?: string; code?: number | string } | undefined;
        const message =
            body?.message || (body?.code !== undefined ? translateErrorCode(body.code) : null) || response.statusText;
        throw new ApiError(response.status, message, errorBody);
    }

    // 204 No Content 不解析 JSON
    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

/**
 * 发起 HTTP 请求
 *
 * - credentials: 'include' 确保跨域请求也携带 Cookie
 * - httpOnly Cookie 由浏览器自动管理，前端无需手动设置 Authorization 头
 * - 401 时自动刷新 Token 并重发原请求（仅重试一次）
 *
 * @param path   请求路径（会自动拼接 BASE_URL）
 * @param options 请求选项
 * @returns 解析后的 JSON 响应
 * @throws ApiError 当响应状态码非 2xx 时
 */
export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    try {
        return await requestInner<T>(path, options);
    } catch (error) {
        // 401 且需要认证 → 尝试刷新 Token 并重试
        if (error instanceof ApiError && error.status === 401 && options.auth !== false) {
            const retryResult = await handle401<T>(path, options);
            if (retryResult) {
                return retryResult.result;
            }
            // 刷新失败，清除登录状态，跳转登录页
            removeAuthStatus();
            window.location.hash = '#/login';
        }
        /**
         * 403 CSRF token 校验失败 → 清除缓存并重试一次
         * - CSRF token 可能因 cookie 过期而失效，重新获取后重试
         * - 仅重试一次，防止无限循环
         */
        if (
            error instanceof ApiError &&
            error.status === 403 &&
            !options._isRetry &&
            (error.body as { message?: string })?.message?.includes('CSRF')
        ) {
            clearCsrfToken();
            const retryResult = await requestInner<T>(path, { ...options, _isRetry: true });
            return retryResult;
        }
        throw error;
    }
}

/** GET 请求快捷方法 */
export function get<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' });
}

/** POST 请求快捷方法 */
export function post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', body });
}

/** PUT 请求快捷方法 */
export function put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'PUT', body });
}

/** PATCH 请求快捷方法 */
export function patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'PATCH', body });
}

/** DELETE 请求快捷方法 */
export function del<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' });
}
