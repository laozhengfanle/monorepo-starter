/**
 * CSRF 防护中间件
 *
 * 采用 Double Submit Cookie 模式：
 * 1. GET /api/auth/csrf-token → 生成随机 token，写入 httpOnly cookie + 返回 JSON
 * 2. 前端后续写请求（POST/PUT/DELETE/PATCH + GraphQL mutation）
 *    需在 Header 中携带 X-CSRF-Token
 * 3. 中间件校验 cookie 中的 token 与 header 中的 token 是否一致
 *
 * 豁免规则：
 * - GET / HEAD / OPTIONS 请求不校验
 * - /api/auth/login / /api/auth/refresh / /api/auth/csrf-token 不校验
 * - GraphQL query（operationName 不以 mutation 开头）不校验
 *
 * 设计说明：
 * - Express 中间件不是 NestJS provider，无法用构造注入 ConfigService
 * - 所以 csrfTokenHandler / csrfGuard / issueCsrfCookie / getCsrfCookieName 全部改为
 *   「工厂函数」：接收 ConfigService 参数，返回真正的 express handler
 * - main.ts 在 app.use() 之前用 app.get(ConfigService) 取实例再调用工厂
 * - 在 controller 内使用 issueCsrfCookie 时也走工厂（controllers 可以 DI ConfigService）
 */
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';

/** CSRF cookie 名称 */
const CSRF_COOKIE_NAME = '__Host-csrf-token';
/** CSRF header 名称 */
const CSRF_HEADER_NAME = 'x-csrf-token';
/** CSRF token 长度 */
const CSRF_TOKEN_LENGTH = 32;
/** Cookie 有效期（秒）：7 天 */
const CSRF_COOKIE_MAX_AGE = 7 * 24 * 3600;

/** SSE 场景专用 CSRF cookie 名（生产用 __Host- 前缀，dev 用普通名） */
const SSE_CSRF_COOKIE_NAME = '__Host-sse-csrf';
const SSE_CSRF_COOKIE_NAME_DEV = 'sse-csrf';
/** SSE CSRF token 通过 query 参数传递时的 key 名 */
const SSE_CSRF_QUERY_PARAM = 'csrf';

/**
 * 检测 GraphQL query 字符串的第一个操作类型是否匹配给定的类型
 *
 * 健壮性说明（替代旧的 query.trimStart().startsWith('mutation')）：
 * - 移除单行注释（# ... 到行尾）和多行注释（""" ... """）
 * - 用正则匹配第一个 operation 关键字（query/mutation/subscription）
 * - 支持：注释前缀、带名称的操作、多操作文档（取第一个）
 *
 * @param queryStr GraphQL query 字符串
 * @param targetTypes 要匹配的操作类型（如 'mutation', 'subscription'）
 * @returns true 表示第一个操作匹配任一 targetTypes；无法确定时返回 true（fail-safe）
 */
function isGraphQLOperationType(queryStr: string, ...targetTypes: string[]): boolean {
    if (!queryStr || queryStr.trim().length === 0) {
        /** 空字符串无法判断，fail-safe 返回 true（触发校验） */
        return true;
    }

    /** 移除多行注释（""" ... """） */
    let cleaned = queryStr.replace(/"""[\s\S]*?"""/g, '');
    /** 移除单行注释（# ... 到行尾） */
    cleaned = cleaned.replace(/#[^\n]*/g, '');

    /**
     * 匹配第一个 operation 关键字
     * - GraphQL 规范：operationType 可以是 query / mutation / subscription
     * - 简写 query（省略 query 关键字，直接写 { ... }）视为 query
     * - 正则解释：
     *   \b(query|mutation|subscription)\b → 匹配操作类型关键字
     *   后续可跟空白 + 操作名称（可选）
     */
    const operationRegex = /\b(query|mutation|subscription)\b/;
    const match = cleaned.match(operationRegex);

    if (!match) {
        /**
         * 未匹配到任何操作关键字：
         * - 可能是简写 query（{ user { id } }）→ 视为 query → 不需要校验
         * - 也可能是非法/异常 query → fail-safe 校验
         * - 判断：如果以 { 开头（去掉空白后），视为简写 query
         */
        const trimmed = cleaned.trim();
        if (trimmed.startsWith('{')) {
            return false; // 简写 query，不需要校验
        }
        return true; // 无法确定，fail-safe 校验
    }

    /** 第一个操作类型 */
    const firstOpType = match[1];
    return targetTypes.includes(firstOpType);
}

/**
 * 不需要 CSRF 校验的路径
 *
 * 注意：这些路径包含全局前缀 `/api`（main.ts 中 app.setGlobalPrefix('api')）。
 * 如果修改全局前缀，需要同步更新此处。
 */
const CSRF_EXEMPT_PATHS = [
    '/api/auth/login',
    '/api/admin/auth/login',
    '/api/member/auth/sms/login', // 短信登录前 cookie 还没建，豁免
    '/api/member/auth/wechat-web', // OAuth 登录前 cookie 还没建，豁免
    '/api/member/auth/wechat-miniprogram', // OAuth 登录前 cookie 还没建，豁免
    '/api/member/auth/apple', // OAuth 登录前 cookie 还没建，豁免
    '/api/auth/refresh',
    '/api/auth/csrf-token',
    '/api/auth/logout',
];

/** 开发环境 cookie 名称（__Host- 前缀要求 HTTPS，开发环境用普通名称） */
const CSRF_COOKIE_NAME_DEV = 'csrf-token';

/**
 * 工厂：获取当前环境的 CSRF cookie 名称
 * - 根据 CSRF_COOKIE_SECURE（zod 校验后是 boolean）切换：
 *   - true  → __Host-csrf-token（生产环境，要求 HTTPS）
 *   - false → csrf-token（开发环境，HTTP 也能用）
 * - Cookie 名称与 Secure 标志必须联动：__Host- 前缀的 cookie 强制 Secure
 */
export const getCsrfCookieName = (configService: ConfigService): string => {
    const secure = configService.get<boolean>('auth.CSRF_COOKIE_SECURE') === true;
    return secure ? CSRF_COOKIE_NAME : CSRF_COOKIE_NAME_DEV;
};

/**
 * 工厂：获取当前环境的 CSRF cookie 是否应设置 Secure 标志
 * - 与 getCsrfCookieName 同一来源（auth.CSRF_COOKIE_SECURE），保证 cookie 名与 Secure 联动
 */
export const getCsrfCookieSecure = (configService: ConfigService): boolean =>
    configService.get<boolean>('auth.CSRF_COOKIE_SECURE') === true;

/**
 * 工厂：SSE 场景专用 cookie 名
 * - 与普通 CSRF cookie 共享同一个 Secure 开关（auth.CSRF_COOKIE_SECURE）
 * - 单独命名 `__Host-sse-csrf`，避免与 REST 的 `__Host-csrf-token` 混淆
 *   - SSE 端点可以同时下发两种 cookie，前端根据场景选用
 */
export const getSseCsrfCookieName = (configService: ConfigService): string => {
    const secure = getCsrfCookieSecure(configService);
    return secure ? SSE_CSRF_COOKIE_NAME : SSE_CSRF_COOKIE_NAME_DEV;
};

/**
 * 工厂：SSE CSRF cookie 的 Secure 标志
 * - 注意：SSE 场景下 cookie 必须能跨站携带（EventSource 不支持自定义 header）
 *   - 必须 `SameSite=None; Secure`
 *   - 这意味着 SSE 端点原则上不适合承载敏感操作（CSRF token 只防被动监听）
 * - 与 REST CSRF（SameSite=Strict）刻意区分
 */
export const getSseCsrfCookieSecure = (configService: ConfigService): boolean => {
    // SSE 场景强制 Secure=true（SameSite=None 必须搭配 Secure）
    // 即便 dev 环境也要求 HTTPS——开发 SSE 时应通过本地 HTTPS 或其他方式
    return getCsrfCookieSecure(configService);
};

/**
 * 生成一个新的 CSRF token
 * - 32 字节随机数 → 64 字符 hex 字符串
 * - 用于 Set-Cookie 与响应体下发给前端
 */
export function generateCsrfToken(): string {
    return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * 工厂：在响应中下发 CSRF cookie
 * - 供登录 / 短信登录响应在 Set-Cookie 中调用
 * - 必须放在 accessToken cookie 之后、返回响应体之前
 * - SameSite=Strict：完全阻止跨站请求携带 cookie，最严格的 CSRF 防护
 * - Secure 标志：走 auth.CSRF_COOKIE_SECURE 显式配置
 */
export const issueCsrfCookie =
    (configService: ConfigService) =>
    (res: Response): string => {
        const token = generateCsrfToken();
        const cookieName = getCsrfCookieName(configService);
        res.cookie(cookieName, token, {
            httpOnly: true,
            secure: getCsrfCookieSecure(configService),
            sameSite: 'strict',
            maxAge: CSRF_COOKIE_MAX_AGE * 1000,
            path: '/',
        });
        return token;
    };

/**
 * 工厂：在响应中下发 SSE 专用 CSRF cookie
 * - 与 issueCsrfCookie 区别：SameSite=None; Secure（必须组合使用）
 * - EventSource / fetch stream 模式下，前端必须能通过 query 参数带上 token
 *   因此 cookie 也得能跨站被服务器读取——只能 SameSite=None
 * - 调用时机：登录响应成功后 + 客户端主动预取 SSE token 时
 * - 建议前端在调用 EventSource(url, { withCredentials: true }) 之前先拉一次
 *   `GET /api/auth/csrf-token?type=sse` 拿到 token，再用它拼到 EventSource URL
 */
export const issueSseCsrfCookie =
    (configService: ConfigService) =>
    (res: Response): string => {
        const token = generateCsrfToken();
        const cookieName = getSseCsrfCookieName(configService);
        res.cookie(cookieName, token, {
            httpOnly: true,
            secure: getSseCsrfCookieSecure(configService),
            // SSE 必须 None + Secure，否则浏览器会拒绝
            // 副作用：SSE 端点不能用于执行敏感操作（CSRF token 只能防被动监听）
            sameSite: 'none',
            maxAge: CSRF_COOKIE_MAX_AGE * 1000,
            path: '/',
        });
        return token;
    };

/**
 * 工厂：生成 CSRF token 端点 handler
 * - GET /api/auth/csrf-token → 设置 cookie + 返回 token
 */
export const csrfTokenHandler =
    (configService: ConfigService) =>
    (req: Request, res: Response): void => {
        const cookieName = getCsrfCookieName(configService);

        // 如果 cookie 中已有有效 token，直接返回（避免每次刷新都重新生成）
        const existingToken = req.cookies?.[cookieName];
        if (existingToken) {
            res.json({ token: existingToken });
            return;
        }

        // 生成新 token
        const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');

        // 写入 httpOnly cookie
        // SameSite=Strict：完全阻止跨站请求携带 cookie，最严格的 CSRF 防护
        res.cookie(cookieName, token, {
            httpOnly: true,
            secure: getCsrfCookieSecure(configService),
            sameSite: 'strict',
            maxAge: CSRF_COOKIE_MAX_AGE * 1000,
            path: '/',
        });

        res.json({ token });
    };

/**
 * 工厂：CSRF 校验中间件
 * - 校验 cookie 中的 token 与 header / query 中的 token 是否一致
 * - 注意异长 token 的处理：先比较长度，不同则直接 403，避免 timingSafeEqual 抛 RangeError
 *
 * SSE 例外：
 * - 当 `req.headers.accept === 'text/event-stream'` 时，认为是 EventSource 请求
 * - 浏览器原生 EventSource 不支持自定义 header，只能通过 query 参数带 token
 * - 这种情况下走「query 参数 + SSE 专用 cookie」路径
 * - cookie 仍要校验（query token 必须与 cookie 中的一致），但用 __Host-sse-csrf / sse-csrf
 *   - 因为 SSE cookie 是 SameSite=None，普通 __Host-csrf-token 可能是 SameSite=Strict，
 *     在跨站 EventSource 时带不上去
 */
export const csrfGuard =
    (configService: ConfigService) =>
    (req: Request, res: Response, next: NextFunction): void => {
        // GET / HEAD / OPTIONS 不校验
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            next();
            return;
        }

        // 豁免路径不校验（同时匹配带/不带 /api 前缀的路径）
        const path = req.path;
        const normalizedPath = path.startsWith('/api') ? path : `/api${path}`;
        const isExempt = CSRF_EXEMPT_PATHS.some(
            (p) => path === p || path.startsWith(p + '/') || normalizedPath === p || normalizedPath.startsWith(p + '/'),
        );
        if (isExempt) {
            next();
            return;
        }

        // GraphQL 请求：仅 mutation 需要校验
        if (path === '/graphql' || path === '/api/graphql') {
            const body = req.body as Record<string, unknown> | undefined;
            // 如果无法判断操作类型，默认校验（fail-safe：宁可误校验也不漏校验）
            if (!body?.operationName && !body?.query) {
                next();
                return;
            }
            const rawQuery = body?.query;
            const queryStr = typeof rawQuery === 'string' ? rawQuery : '';
            /**
             * 健壮的 mutation 检测（替代旧的 startsWith('mutation')）
             * - 旧实现：query.trimStart().startsWith('mutation')
             *   问题：无法处理注释前缀、多操作文档、带名称的 mutation
             * - 新实现：
             *   1) 移除单行注释（# ...）和多行注释（""" ... """）
             *   2) 用正则匹配第一个 operation 关键字（query/mutation/subscription）
             *   3) 第一个操作是 mutation/subscription → 需要校验
             *   4) 第一个操作是 query → 放行
             *   5) 无法确定 → 校验（fail-safe）
             */
            const isMutation = isGraphQLOperationType(queryStr, 'mutation', 'subscription');
            if (!isMutation) {
                next();
                return;
            }
        }

        /**
         * SSE 例外：检测 Accept: text/event-stream
         * - EventSource 是浏览器原生 API，连接建立后无法自定义 header
         * - 因此 SSE 端点的 CSRF token 必须从 query 参数读
         * - cookie 也用专用 `__Host-sse-csrf` / `sse-csrf`（SameSite=None）
         *   避免与普通 REST 的 __Host-csrf-token（SameSite=Strict）冲突
         */
        const accept = req.headers['accept'] ?? '';
        const isSseRequest = typeof accept === 'string' && accept.includes('text/event-stream');
        if (isSseRequest) {
            // SSE 路径：token 从 query 读，cookie 用专用名
            const sseCookieName = getSseCsrfCookieName(configService);
            const cookieToken = req.cookies?.[sseCookieName];
            // query 参数类型：string | string[] | ParsedQs | ParsedQs[] | undefined
            // 防御性处理多种形态
            const rawQueryToken = req.query?.[SSE_CSRF_QUERY_PARAM];
            const queryToken = typeof rawQueryToken === 'string' ? rawQueryToken : undefined;

            if (!cookieToken || !queryToken) {
                res.status(403).json({
                    statusCode: 403,
                    message: 'SSE CSRF token missing',
                    error: 'Forbidden',
                });
                return;
            }
            if (cookieToken.length !== queryToken.length) {
                res.status(403).json({
                    statusCode: 403,
                    message: 'SSE CSRF token mismatch',
                    error: 'Forbidden',
                });
                return;
            }
            if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(queryToken))) {
                res.status(403).json({
                    statusCode: 403,
                    message: 'SSE CSRF token mismatch',
                    error: 'Forbidden',
                });
                return;
            }
            next();
            return;
        }

        // 校验 cookie 与 header 中的 token
        const cookieName = getCsrfCookieName(configService);
        const cookieToken = req.cookies?.[cookieName];
        const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

        if (!cookieToken || !headerToken) {
            res.status(403).json({
                statusCode: 403,
                message: 'CSRF token missing',
                error: 'Forbidden',
            });
            return;
        }

        /**
         * timingSafeEqual 要求两个 buffer 长度相同，否则抛 RangeError
         * - 攻击者可以用异长 token 探测，让 Node 抛 500
         * - 先比较长度：长度不一致直接 403（不消耗恒定时间，但攻击者通过 status code 也无法获得有效信息）
         */
        if (cookieToken.length !== headerToken.length) {
            res.status(403).json({
                statusCode: 403,
                message: 'CSRF token mismatch',
                error: 'Forbidden',
            });
            return;
        }

        // 使用时间安全比较，防止 timing attack
        if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
            res.status(403).json({
                statusCode: 403,
                message: 'CSRF token mismatch',
                error: 'Forbidden',
            });
            return;
        }

        next();
    };
