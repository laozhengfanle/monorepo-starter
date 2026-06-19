/**
 * 401 自动刷新 — 跨 admin / web 共用的 token 刷新逻辑
 *
 * 背景（CRITICAL F3 — web 端缺失 401 自动刷新）：
 *   admin 端已有 `/api/auth/refresh` 机制（`apps/admin/src/shared/request/auth-refresh.ts`），
 *   但 web 端此前没有 401 拦截器。本次抽离到 shared 包，两端共用同一份核心逻辑。
 *
 * 工作原理（httpOnly Cookie + 自动刷新）：
 *   1. 业务请求收到 401 → 调用 `POST /api/auth/refresh`（refresh cookie 由浏览器自动携带）
 *   2. 刷新成功 → 后端通过 Set-Cookie 写入新 access token → 重发原请求
 *   3. 刷新失败 → 触发 `onAuthExpired` 回调（默认 `window.location.replace('/login')`）
 *   4. **in-flight queue**：并发 401 只触发一次 refresh（避免 token 竞态）
 *
 * 用法 1（包装 fetch，web 推荐）：
 *   ```ts
 *   import { create401Refresh } from '@packages/shared';
 *
 *   const refresh = create401Refresh({
 *     onAuthExpired: () => location.replace('/login'),
 *   });
 *   const originalFetch = window.fetch.bind(window);
 *   window.fetch = refresh.wrapFetch(originalFetch);
 *   ```
 *
 * 用法 2（手写 fetch 调用，少用）：
 *   ```ts
 *   const refresh = create401Refresh();
 *   const response = await originalFetch(url, init);
 *   if (response.status === 401) {
 *     const finalResponse = await refresh.handle401(() => originalFetch(url, init));
 *     // ... use finalResponse
 *   }
 *   ```
 *
 * 设计要点：
 *   - 框架无关：纯函数 + Promise，不依赖 Vue / React / axios（任何能调用 fetch 的环境都能用）
 *   - 单一职责：只管 401 → refresh → retry，其他错误码（403/500/...）原样抛出
 *   - 测试友好：`fetcher` 参数可注入 mock fetch，单元测试无需真实后端
 *   - 兼容 admin 旧实现：API 形态与 `apps/admin/src/shared/request/auth-refresh.ts`
 *     中的 `refreshAuthToken()` 保持一致，未来可以平滑迁移
 */

/** 默认 refresh 接口地址（前后端约定：/api/auth/refresh） */
const DEFAULT_REFRESH_URL = '/api/auth/refresh';

/** 刷新请求超时时间（毫秒），10 秒覆盖正常网络抖动 */
const DEFAULT_REFRESH_TIMEOUT_MS = 10_000;

/** 默认登录页路径（onAuthExpired 失败时跳转） */
const DEFAULT_LOGIN_PATH = '/login';

/**
 * 模块级 in-flight Promise 缓存
 *
 * - 同一时刻多次调用 `refreshToken()` 只触发一次实际网络请求
 * - 模块级变量确保所有拦截器实例（即使有多个）也共享去重
 * - Promise resolve 后清空，保证下一次 refresh 是新请求
 */
let inflightRefreshPromise: Promise<boolean> | null = null;

export interface Create401RefreshOptions {
    /** 刷新接口地址，默认 `/api/auth/refresh` */
    refreshUrl?: string;
    /** 刷新请求超时（毫秒），默认 10000 */
    refreshTimeoutMs?: number;
    /** 刷新失败回调，默认 `window.location.replace('/login')` */
    onAuthExpired?: () => void;
    /** 自定义 fetch（用于测试或不同运行时，如 SSR 用 node-fetch） */
    fetcher?: typeof fetch;
    /**
     * 是否对指定请求应用 401 重试
     * - 默认所有非 401 自身（`/api/auth/refresh` 自身不重试）都重试
     * - 可用于排除某些端点（如公开 API、logout 等）
     */
    shouldRetry?: (input: RequestInfo | URL) => boolean;
}

export interface Refresh401Interceptor {
    /**
     * 手动触发一次 token 刷新
     *
     * - 使用 in-flight queue：并发调用会复用同一个 Promise
     * - 成功返回 true，失败返回 false（且已触发 onAuthExpired）
     */
    refreshToken: () => Promise<boolean>;
    /**
     * 处理单个 401 响应
     *
     * - 内部调用 `refreshToken()`，成功则执行 `retryFetch()` 重新发起请求
     * - 失败则触发 `onAuthExpired` 并抛出原错误
     *
     * @param retryFetch 重新发起原请求的函数（确保 headers / body 仍可用）
     * @returns 最终响应（已 refresh 成功后的重试结果）
     */
    handle401: (retryFetch: () => Promise<Response>) => Promise<Response>;
    /**
     * 包装一个 fetch 实现，自动应用 401 → refresh → retry 逻辑
     *
     * 包装后的 fetch 与原 fetch 接口完全一致，调用方无感知
     */
    wrapFetch: (originalFetch: typeof fetch) => typeof fetch;
}

/**
 * 默认 onAuthExpired：硬刷登录页
 *
 * - 使用 `location.replace` 而非 `location.href =` —— replace 不会留下 history，
 *   用户点"后退"不会回到已失效的页面，避免循环
 */
function defaultOnAuthExpired() {
    if (typeof window !== 'undefined' && window.location) {
        window.location.replace(DEFAULT_LOGIN_PATH);
    }
}

/**
 * 默认 shouldRetry：所有非 refresh 自身的请求都重试
 *
 * - 如果原请求就是 refresh 本身（重试循环），不重试
 */
function defaultShouldRetry(input: RequestInfo | URL, refreshUrl: string): boolean {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return !url.includes(refreshUrl);
}

export function create401Refresh(options: Create401RefreshOptions = {}): Refresh401Interceptor {
    const {
        refreshUrl = DEFAULT_REFRESH_URL,
        refreshTimeoutMs = DEFAULT_REFRESH_TIMEOUT_MS,
        onAuthExpired = defaultOnAuthExpired,
        fetcher = globalThis.fetch?.bind(globalThis),
        shouldRetry = (input: RequestInfo | URL) => defaultShouldRetry(input, refreshUrl),
    } = options;

    /**
     * 刷新 token 核心逻辑
     *
     * - 单例 Promise：并发请求复用，避免 token 竞态
     * - 10s 超时：避免后端挂起时所有 401 重试跟着挂起导致应用假死
     * - HTTP 2xx + body.code === 0 才算成功（业务状态码语义）
     */
    async function refreshToken(): Promise<boolean> {
        // 已有 in-flight refresh：复用
        if (inflightRefreshPromise) {
            return inflightRefreshPromise;
        }
        if (!fetcher) {
            // SSR 或没有 fetch 的环境：直接返回 false（外层调用方应处理）
            return false;
        }

        inflightRefreshPromise = (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), refreshTimeoutMs);
            try {
                const response = await fetcher(refreshUrl, {
                    method: 'POST',
                    credentials: 'include',
                    signal: controller.signal,
                });
                if (!response.ok) {
                    return false;
                }
                // 检查业务状态码：HTTP 2xx 但 body.code 非 0 也算失败
                try {
                    const data = await response.clone().json();
                    if (data && typeof data === 'object' && 'code' in data) {
                        return (data as { code: unknown }).code === 0;
                    }
                    // 没有 code 字段视为成功
                    return true;
                } catch {
                    // 响应体不是 JSON（少见），按 HTTP 成功处理
                    return true;
                }
            } catch (err) {
                // 网络错误 / 超时 / abort —— 视为刷新失败
                if (typeof console !== 'undefined') {
                    console.warn('[use401Refresh] token 刷新失败:', err);
                }
                return false;
            } finally {
                clearTimeout(timeoutId);
                inflightRefreshPromise = null;
            }
        })();

        return inflightRefreshPromise;
    }

    /**
     * 处理单个 401 响应：refresh + retry
     *
     * @param retryFetch 重新发起原请求的函数
     * @returns 最终响应（refresh 成功后的重试结果）
     */
    async function handle401(retryFetch: () => Promise<Response>): Promise<Response> {
        const ok = await refreshToken();
        if (!ok) {
            // 刷新失败：触发 onAuthExpired 回调 + 抛出原始 401
            onAuthExpired();
            throw new Error('401: token refresh failed, auth expired');
        }
        // 刷新成功：重发原请求
        return retryFetch();
    }

    /**
     * 包装 fetch：自动应用 401 → refresh → retry
     *
     * 关键设计：必须**先调用原 fetch 拿响应**，拿到 401 后再调用 `refreshToken()`。
     * 顺序不能反 —— 反了就是无脑 refresh，浪费请求。
     */
    function wrapFetch(originalFetch: typeof fetch): typeof fetch {
        return async function fetchWith401(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            // 1. 先发起原请求
            const response = await originalFetch(input, init);

            // 2. 非 401 或不应重试：原样返回
            if (response.status !== 401 || !shouldRetry(input)) {
                return response;
            }

            // 3. 401 → refresh + retry
            return handle401(() => originalFetch(input, init));
        };
    }

    return { refreshToken, handle401, wrapFetch };
}

/**
 * 单次刷新 token 的便利函数（不需要拦截器实例时直接用）
 *
 * - 内部用默认配置（/api/auth/refresh, 10s timeout）
 * - 失败不自动跳转登录页（由调用方决定）
 * - 仍使用模块级 in-flight queue 去重
 */
export async function refreshAuthToken(): Promise<boolean> {
    const interceptor = create401Refresh();
    return interceptor.refreshToken();
}

/**
 * 重置模块级状态（仅供单元测试使用）
 *
 * 单元测试顺序执行时若不重置 inflightRefreshPromise，
 * 前一个测试的挂起 Promise 会污染后续测试
 * 生产环境绝对不要调用
 */
export function __reset401RefreshModuleForTests(): void {
    inflightRefreshPromise = null;
}
