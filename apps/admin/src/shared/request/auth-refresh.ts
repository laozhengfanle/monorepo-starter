/**
 * 认证刷新共享模块
 *
 * 提取 request.ts 和 graphql-client.ts 共用的 Token 刷新逻辑，
 * 确保并发 401 时只触发一次刷新请求。
 */

import { BASE_URL } from './request-config';

/** 刷新 Token 请求超时时间（毫秒），10 秒足够覆盖正常网络延迟 */
const REFRESH_TIMEOUT_MS = 10_000;

/** 刷新 Token 的 Promise 缓存，防止并发请求同时触发多次刷新 */
let refreshPromise: Promise<boolean> | null = null;

/**
 * 刷新 Token
 *
 * 调用 /auth/refresh 接口，后端通过 Set-Cookie 更新 httpOnly Cookie。
 * 使用单例 Promise 防止并发请求同时触发多次刷新。
 *
 * 内置 10 秒超时控制：如果刷新接口挂起，超时后自动 abort，
 * 避免所有等待刷新的并发请求都跟着挂起导致应用假死。
 *
 * @returns true 刷新成功，false 刷新失败（需要重新登录）
 */
export async function refreshAuthToken(): Promise<boolean> {
    // 如果已有刷新请求正在进行，复用同一个 Promise
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

        try {
            const response = await fetch(`${BASE_URL}/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
                signal: controller.signal,
            });

            if (!response.ok) {
                return false;
            }

            /** 检查业务状态码：后端可能返回 HTTP 2xx 但 body.code 非 0（如"缺少刷新令牌"） */
            try {
                const data = await response.json();
                if (data.code !== 0) {
                    return false;
                }
            } catch {
                /** JSON 解析失败，视为刷新失败 */
                return false;
            }

            return true;
        } catch (err) {
            console.warn('[AuthRefresh] Token 刷新失败:', err);
            return false;
        } finally {
            clearTimeout(timeoutId);
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}
