/**
 * CSRF token 管理（CRITICAL F4 修复 — web 端缺失 CSRF 防护）
 *
 * 背景：
 *   web 端使用 httpOnly Cookie 鉴权（access token 在 Cookie 中，JS 不可访问）。
 *   浏览器在跨站请求时会自动携带 Cookie，导致 CSRF 风险。
 *   后端 NestJS 应用使用 csurf / 自定义 CSRF 中间件校验 CSRF token：
 *   - 客户端从 `GET /api/auth/csrf-token` 拿一个 token
 *   - 写操作（POST/PUT/PATCH/DELETE）必须在 `X-CSRF-Token` header 中携带
 *   - 后端比对 header 中的 token 与 cookie / session 中的 token，匹配才放行
 *
 * 行为：
 *   - `useCsrfToken()` 异步取 token：第一次调会 fetch /api/auth/csrf-token 并缓存
 *   - 缓存有效期 1 小时（避免每个请求都拿新 token；同时也避免被劫持后长期可用）
 *   - `getCsrfHeaderValue()` 同步取缓存的 token（用于 fetch interceptor 注入 header）
 *   - 缓存失效（401 / 后端拒绝）时清空，下次 useCsrfToken() 会重新拿
 *
 * 用法：
 *   ```ts
 *   // 启动时预热（避免第一个写操作时多一次往返）
 *   useCsrfToken().catch(() => undefined);
 *
 *   // fetch interceptor 注入 header
 *   const response = await fetch(url, {
 *     ...init,
 *     headers: { ...init.headers, 'X-CSRF-Token': getCsrfHeaderValue() ?? '' },
 *   });
 *   ```
 */

/** CSRF token 接口地址（前后端约定：/api/auth/csrf-token） */
const CSRF_TOKEN_URL = '/api/auth/csrf-token';

/** CSRF token 缓存有效期：1 小时（毫秒） */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** CSRF header 名称（前后端约定） */
export const CSRF_HEADER = 'X-CSRF-Token';

/** 模块级缓存：避免每个请求都去 /api/auth/csrf-token */
interface CachedCsrf {
    token: string;
    /** 获取时间戳（用于 TTL 校验） */
    fetchedAt: number;
}
let cachedCsrf: CachedCsrf | null = null;

/** 是否有正在进行的 token 获取 Promise（in-flight dedup） */
let inflightFetchPromise: Promise<string> | null = null;

/**
 * 检查缓存是否仍有效
 *
 * - null → 无缓存，需重新获取
 * - 已过期 → 视为无效
 * - 有效 → 返回 true
 */
function isCacheValid(): boolean {
    if (!cachedCsrf) return false;
    return Date.now() - cachedCsrf.fetchedAt < CACHE_TTL_MS;
}

/**
 * 从后端获取 CSRF token
 *
 * - 后端应同时通过 Set-Cookie 写入 csrf_token Cookie（httpOnly=false，前端可读不可写）
 * - 响应体形如 `{ token: "abc123..." }` 或 `{ code: 0, data: { token: "..." } }`
 *
 * @param fetcher 可选：自定义 fetch（用于测试）
 */
async function fetchCsrfToken(fetcher: typeof fetch = globalThis.fetch?.bind(globalThis)): Promise<string> {
    if (!fetcher) {
        throw new Error('CSRF: 没有可用的 fetch 实现');
    }
    const response = await fetcher(CSRF_TOKEN_URL, {
        method: 'GET',
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error(`CSRF: 获取 token 失败 (${response.status})`);
    }
    const body = await response.json();
    // 兼容两种响应体格式：扁平 { token } 或业务封装 { code, data: { token } }
    const token = body?.token ?? (typeof body?.code === 'number' && body.code === 0 ? body.data?.token : undefined);
    if (typeof token !== 'string' || token.length === 0) {
        throw new Error('CSRF: 响应体中未找到 token 字段');
    }
    return token;
}

/**
 * 获取 CSRF token（异步，自动缓存）
 *
 * - 首次调用：触发 fetch 并缓存
 * - 后续调用：命中缓存（1 小时内）直接返回
 * - 并发调用：共享同一个 in-flight Promise
 *
 * @returns CSRF token 字符串
 */
export async function useCsrfToken(): Promise<string> {
    if (isCacheValid() && cachedCsrf) {
        return cachedCsrf.token;
    }
    if (inflightFetchPromise) {
        return inflightFetchPromise;
    }
    inflightFetchPromise = (async () => {
        try {
            const token = await fetchCsrfToken();
            cachedCsrf = { token, fetchedAt: Date.now() };
            return token;
        } finally {
            inflightFetchPromise = null;
        }
    })();
    return inflightFetchPromise;
}

/**
 * 同步获取缓存的 CSRF token（用于 fetch interceptor 中注入 header）
 *
 * - **不会**触发网络请求（fetch interceptor 是同步的）
 * - 如果无缓存返回 null（调用方应 fallback 到异步 useCsrfToken()）
 *
 * 设计原因：
 *   - fetch interceptor 是同步函数，await 改 init 头会破坏 axios 风格
 *   - 实际做法是：应用启动时调用 useCsrfToken() 预热，
 *     interceptor 直接 getCsrfHeaderValue() 同步取
 *   - 取不到（null）时，要么拒绝请求，要么发请求前先 await useCsrfToken()
 */
export function getCsrfHeaderValue(): string | null {
    if (isCacheValid() && cachedCsrf) {
        return cachedCsrf.token;
    }
    return null;
}

/**
 * 清空 CSRF token 缓存
 *
 * 使用场景：
 *   - 后端返回 403 CSRF 校验失败 → 缓存可能与后端不一致，下次重新拿
 *   - 用户登出 → 清空避免下一会话误用
 *   - 单元测试 betweenEach
 */
export function clearCsrfToken(): void {
    cachedCsrf = null;
    inflightFetchPromise = null;
}

/** 仅供单元测试使用：重置模块级缓存 */
export function __resetCsrfModuleForTests(): void {
    cachedCsrf = null;
    inflightFetchPromise = null;
}
