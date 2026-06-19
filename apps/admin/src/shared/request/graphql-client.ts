/**
 * GraphQL 客户端封装
 *
 * 轻量级 GraphQL 请求工具，基于 fetch 实现。
 * 与 request.ts 共享 Cookie 鉴权策略和 401 重试逻辑。
 *
 * 接口拆分策略（对照后端 NestJS 开发文档）：
 *   - RESTful：仅认证相关（login / refresh / logout），因为涉及 Cookie 和特殊安全处理
 *   - GraphQL：其他所有操作（Query + Mutation），GraphQL 作为主 API 网关
 *
 * Token 策略：
 *   - httpOnly Cookie 由浏览器自动携带，前端无需手动设置 Authorization
 *   - credentials: 'include' 确保跨域请求也携带 Cookie
 *   - 401 时自动调 /auth/refresh 刷新 Cookie，成功后重发原请求
 */

import { removeAuthStatus } from './request';
import { refreshAuthToken } from './auth-refresh';
import { getRequestTimeout } from './request-config';
import { getCsrfToken, clearCsrfToken } from './csrf';
import { handleAuthExpired } from './auth-expired';
import { getErrorCodeInfo } from '@packages/shared';
import { translateErrorCode } from '@/shared/composables/useErrorMessage';

/** GraphQL 端点，从环境变量读取，默认 /graphql */
const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_ENDPOINT || '/graphql';

/** GraphQL 错误 */
export class GraphQLError extends Error {
    /** GraphQL errors 数组 */
    errors: GraphQLErrorItem[];
    /** HTTP 状态码（网络层） */
    status: number;

    constructor(errors: GraphQLErrorItem[], status?: number) {
        super(errors.map((e) => e.message).join('; '));
        this.name = 'GraphQLError';
        this.errors = errors;
        /**
         * 修复：status 用 ?? 而非 || 兜底
         * - 0（网络异常 / 断网）必须保留为 0，不能被当作 falsy 兜底成 200
         * - UI 层通过 status === 0 判断"完全连不上后端"（如 Vite proxy 启动中、用户断网）
         *   vs status >= 500（连上了但服务端出错）
         */
        this.status = status ?? 200;
    }
}

/** GraphQL 单条错误结构 */
export interface GraphQLErrorItem {
    message: string;
    extensions?: {
        code?: string | number;
        fields?: Array<{ field: string; message: string }> | null;
        [key: string]: unknown;
    };
}

/** GraphQL 响应结构 */
interface GraphQLResponse<T = unknown> {
    data?: T;
    errors?: GraphQLErrorItem[];
}

/** GraphQL 请求选项 */
interface GraphQLOptions {
    /** 是否需要认证，默认 true（httpOnly Cookie 模式下始终携带 Cookie） */
    auth?: boolean;
    /** 请求变量 */
    variables?: Record<string, unknown>;
    /** 内部标记：是否为刷新 Token 后的重试请求，防止无限循环 */
    _isRetry?: boolean;
}

/**
 * 发起 GraphQL 请求（Query 或 Mutation）
 *
 * - credentials: 'include' 确保跨域请求也携带 Cookie
 * - httpOnly Cookie 由浏览器自动管理，前端无需手动设置 Authorization
 * - 401 时自动刷新 Token 并重发原请求（仅重试一次）
 *
 * @param document  GraphQL 文档字符串（query 或 mutation）
 * @param options   请求选项
 * @returns 解析后的 data 字段
 * @throws GraphQLError 当响应包含 errors 时
 */
export async function gqlQuery<T = unknown>(document: string, options?: GraphQLOptions): Promise<T> {
    const { auth = true, variables, _isRetry } = options || {};

    // 构建请求头
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // CSRF 防护：mutation 请求必须携带 x-csrf-token header（与 cookie 中 __Host-csrf-token / csrf-token 匹配）
    // 后端 csrf.middleware.ts：query 放行，mutation 校验
    // 检测方式：trim 后看是否以 "mutation" 开头（与后端判断逻辑一致，避免 GraphQL 注释干扰）
    if (document.trimStart().startsWith('mutation')) {
        const csrfToken = await getCsrfToken();
        if (csrfToken) {
            headers['x-csrf-token'] = csrfToken;
        }
    }

    // httpOnly Cookie 模式：浏览器自动携带 Cookie，无需手动设置 Authorization

    // 发起 fetch 请求（credentials: 'include' 确保跨域携带 Cookie）
    // signal 使用 AbortSignal.timeout() 设置超时，超时后会抛出 DOMException(name: 'TimeoutError')
    let response: Response;
    try {
        response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ query: document, variables }),
            signal: AbortSignal.timeout(getRequestTimeout()),
        });
    } catch (e: unknown) {
        // 超时 → 统一抛出 GraphQLError(408)，方便 UI 层展示
        if (e instanceof DOMException && e.name === 'TimeoutError') {
            throw new GraphQLError([{ message: '请求超时，请检查网络后重试' }], 408);
        }
        // 其他网络异常（如断网）
        throw new GraphQLError([{ message: '网络异常，请检查连接' }], 0);
    }

    // CSRF 校验失败（403）：清缓存重试一次
    // 可能场景：登录前缓存了空 token，或后端 cookie 重新签发了
    // 只对 mutation 重试（query 不会触发 CSRF 校验）
    if (response.status === 403 && document.trimStart().startsWith('mutation') && !_isRetry) {
        try {
            const errBody = (await response.clone().json()) as { message?: string };
            if (errBody?.message?.toLowerCase().includes('csrf')) {
                clearCsrfToken();
                return gqlQuery<T>(document, { ...options, _isRetry: true });
            }
        } catch {
            // 解析失败不重试，让后续通用错误处理兜底
        }
    }

    // 401 处理：尝试刷新 Token 并重试
    if (response.status === 401 && auth && !_isRetry) {
        const refreshed = await refreshAuthToken();
        if (refreshed) {
            // 刷新成功，重发原请求
            return gqlQuery<T>(document, { ...options, _isRetry: true });
        }
        // 刷新失败，清除登录状态，跳转登录页
        removeAuthStatus();
        window.location.hash = '#/login';
        // 抛出错误，让调用方能正常退出，而非永远挂起
        // 使用 translateErrorCode(20003) 替代硬编码 "认证已过期，请重新登录"
        throw new GraphQLError([{ message: translateErrorCode(20003), extensions: { code: 20003 } }], 401);
    }

    // 解析响应（处理非 JSON 响应 + 5xx 上游错误）
    // - 旧逻辑：response.json() 抛 SyntaxError 时统一抛"服务器响应格式异常"
    //   → 真实的 502/503/504（Vite dev proxy / 反代瞬时挂掉）被吞，运维无法定位
    // - 新逻辑：先看 response.ok；非 2xx 时按状态码分类处理（5xx 暴露真实 status + 短暂重试）
    let result: GraphQLResponse<T>;
    try {
        // 5xx 短暂重试一次：Vite dev server proxy 偶发 502（首次请求 / HMR 时），
        // 服务端 503（重启中）/ 504（超时）都是常见的瞬时故障，重试一次能消除 90% 误报
        // - 只对非 mutation 重试，避免 mutation 副作用被执行两次
        // - 401/403/4xx 不重试（业务错误，重试无意义）
        if (
            response.status >= 500 &&
            response.status < 600 &&
            !document.trimStart().startsWith('mutation') &&
            !_isRetry
        ) {
            await new Promise((r) => setTimeout(r, 300));
            return gqlQuery<T>(document, { ...options, _isRetry: true });
        }

        result = await response.json();
    } catch {
        // 非 JSON 响应（Vite 502 默认 HTML 页、Nginx 502 错误页等）
        // 暴露真实 status + 响应内容片段，方便排查
        let bodySnippet = '';
        try {
            const text = await response.text();
            bodySnippet = text.slice(0, 120).replace(/\s+/g, ' ');
        } catch {
            // 拿不到 body 也无所谓，至少 status 还在
        }
        const status = response.status;
        const hint =
            status === 502 || status === 504
                ? '（Vite proxy 或反代瞬时不可达）'
                : status === 503
                  ? '（服务暂不可用）'
                  : '';
        throw new GraphQLError(
            [
                {
                    message: `服务器响应格式异常 (HTTP ${status})${hint}${bodySnippet ? ` · ${bodySnippet}` : ''}`,
                },
            ],
            status,
        );
    }

    // 处理 GraphQL 错误
    if (result.errors && result.errors.length > 0) {
        // 未认证（业务码 20003，JwtAuthGuard / 鉴权中间件抛出）：
        // 走 handleAuthExpired() 硬跳登录页（window.location.replace），
        // 这会立即中断当前 JS 执行，调用方的 catch 链不会再跑，
        // 控制台也不会被 [Guard] 警告刷屏
        // - code 可能是 string（NestJS GraphQL filter 序列化为字符串）或 number
        // - 防御性比对：避免 20003 / '20003' 漏判
        // 解析错误信息：优先用后端返回的 message；如果 extensions.code 在前端字典中能找到，
        // 也保留后端 message（业务异常 message 通常是 i18n 友好的，覆盖了默认 message）
        // 兜底场景：后端 message 缺失时用 ERROR_CODES[code]?.message
        const firstError = result.errors[0];
        const code = firstError?.extensions?.code;
        // 防御性拷贝 errors，给 message 兜底
        const errorsWithFallback = result.errors.map((e) => {
            if (e.message && e.message.trim().length > 0) return e;
            const info = getErrorCodeInfo(e.extensions?.code);
            return { ...e, message: info?.message ?? e.message };
        });
        if (code === 20003 || code === '20003') {
            handleAuthExpired();
            // handleAuthExpired 内部用 window.location.replace 跳转，理论上后面的代码不会跑
            // 但保险起见抛一个 throw 让任何 await 链能正常退出
            // 使用 translateErrorCode(20003) 替代硬编码 "认证已过期"
            throw new GraphQLError(
                [{ message: translateErrorCode(20003), extensions: { code: 20003 } }],
                response.status,
            );
        }
        throw new GraphQLError(errorsWithFallback, response.status);
    }

    // 处理 data 为 undefined（GraphQL 规范不允许 data 缺失，但允许 null）
    if (result.data === undefined) {
        throw new GraphQLError([{ message: '响应数据为空' }], response.status);
    }

    return result.data;
}
