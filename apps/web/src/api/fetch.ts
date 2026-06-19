/**
 * 统一 fetch 封装 — 自动注入 CSRF token + 处理 401 自动刷新
 *
 * 背景（CRITICAL F3 / F4 修复）：
 *   web 端此前直接使用全局 fetch / graphql-request，没有：
 *   1. 401 自动刷新（用户体验差，每次 token 过期都要手动重新登录）
 *   2. CSRF token 注入（httpOnly Cookie 鉴权下的 CSRF 风险）
 *
 * 设计：
 *   - 模块初始化时通过 `installGlobalFetch()` 替换 window.fetch
 *   - 业务代码继续用 fetch 即可，无感知
 *   - 同时也导出 `createApiFetch()` 给 GraphQL / axios 等需要包装的场景
 *
 * 行为：
 *   - GET / HEAD / OPTIONS：不注入 CSRF token（CSRF token 只对写操作有意义）
 *   - POST / PUT / PATCH / DELETE：自动注入 X-CSRF-Token header
 *   - 401：调用 /api/auth/refresh，成功则重发原请求，失败则跳转登录页
 *
 * 注意：
 *   - 替换 window.fetch 必须在 main.ts 早期完成（早于任何业务请求）
 *   - graphql-request 内部用的是 fetch，但我们替换 window.fetch 也会生效
 *   - 如果传入自定义 fetch 实现（如 mock），用 `createApiFetch()` 单独包装
 */
import { create401Refresh, type Refresh401Interceptor } from '@packages/shared';
import { CSRF_HEADER, getCsrfHeaderValue, useCsrfToken } from './csrf';

/** 写方法集合：需要 CSRF token 注入的 HTTP 方法 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 401 refresh 拦截器实例（全局单例） */
let refreshInterceptor: Refresh401Interceptor | null = null;

/**
 * 初始化 fetch 包装（应用启动时调用一次）
 *
 * - 创建 401 refresh 拦截器
 * - 包装 window.fetch，注入 CSRF token + 401 处理
 *
 * @param options 401 拦截器配置
 */
export function installGlobalFetch(options?: { onAuthExpired?: () => void }): void {
    // 避免重复包装
    if ((window.fetch as unknown as { __wrappedByCsrf401?: boolean }).__wrappedByCsrf401) {
        return;
    }

    // 创建 401 refresh 拦截器（带 in-flight dedup）
    refreshInterceptor = create401Refresh({
        onAuthExpired:
            options?.onAuthExpired ??
            (() => {
                // 默认行为：硬刷登录页
                window.location.replace('/login');
            }),
    });

    // 保存原始 fetch
    const originalFetch = window.fetch.bind(window);

    // 包装 fetch：自动注入 CSRF + 401 处理
    const wrappedFetch = createApiFetch(originalFetch, refreshInterceptor);

    // 标记已包装（防重复）
    (wrappedFetch as unknown as { __wrappedByCsrf401: boolean }).__wrappedByCsrf401 = true;
    window.fetch = wrappedFetch;

    // 启动时预热 CSRF token（避免第一个写操作时多一次往返）
    // dev 环境后端可能没有 CSRF 中间件，失败时仅 warn 不抛错
    useCsrfToken().catch((err) => {
        if (typeof console !== 'undefined') {
            console.warn('[api] CSRF token 预热失败（非阻塞）:', err);
        }
    });
}

/**
 * 创建一个带 CSRF + 401 处理的 fetch 实现
 *
 * 用法 1（包装全局 fetch，推荐）：
 *   installGlobalFetch();
 *   const data = await fetch('/api/users').then(r => r.json());
 *
 * 用法 2（包装自定义 fetch，如测试或 SSR）：
 *   const apiFetch = createApiFetch(myFetch, myRefreshInterceptor);
 *   const data = await apiFetch('/api/users');
 *
 * @param originalFetch 原始 fetch
 * @param refreshInterceptor 401 refresh 拦截器（默认使用全局单例）
 */
export function createApiFetch(
    originalFetch: typeof fetch,
    refreshInterceptorInstance?: Refresh401Interceptor,
): typeof fetch {
    const refresh = refreshInterceptorInstance ?? refreshInterceptor;
    if (!refresh) {
        throw new Error('[api] refresh interceptor 未初始化：必须先调用 installGlobalFetch() 或传入实例');
    }
    // 先包装 401 处理（顺序：CSRF 注入 → 401 处理 → 原始 fetch）
    const fetchWith401 = refresh.wrapFetch(originalFetch);

    return async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        // GET / HEAD / OPTIONS 不需要 CSRF token，原样传递
        const method = (init?.method ?? 'GET').toUpperCase();
        if (!WRITE_METHODS.has(method)) {
            return fetchWith401(input, init);
        }

        // 写方法：注入 X-CSRF-Token header
        const csrfToken = getCsrfHeaderValue();
        if (csrfToken) {
            // 命中缓存：直接合并 header
            return fetchWith401(input, mergeHeader(init, CSRF_HEADER, csrfToken));
        }

        // 无缓存：先异步拿 token 再发起请求
        // 这种情况较少见（应用启动时已预热）
        try {
            const freshToken = await useCsrfToken();
            return fetchWith401(input, mergeHeader(init, CSRF_HEADER, freshToken));
        } catch (err) {
            // 拿 CSRF token 失败：仍发起请求，后端会返回 403
            // 这种情况下业务请求会失败，但不会让 fetch 抛错
            if (typeof console !== 'undefined') {
                console.warn('[api] 获取 CSRF token 失败:', err);
            }
            return fetchWith401(input, init);
        }
    };
}

/**
 * 合并 init.headers 与新 header
 *
 * - 保留原有 headers
 * - 如果新 header 已存在则覆盖
 */
function mergeHeader(init: RequestInit | undefined, name: string, value: string): RequestInit {
    const headers = new Headers(init?.headers);
    headers.set(name, value);
    return { ...init, headers };
}

/** 仅供单元测试使用：重置模块级单例 */
export function __resetApiModuleForTests(): void {
    refreshInterceptor = null;
    // 注意：window.fetch 不会被还原（测试间通过 unmount + 单独 fetch 包装处理）
}
