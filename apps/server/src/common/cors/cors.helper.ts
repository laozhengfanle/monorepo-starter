/**
 * CORS 配置构建器
 *
 * 设计要点：
 * - 业务规则 vs Express 集成分离：buildCorsOptions 是纯函数（输入 env，输出 options 对象）
 *   main.ts 直接调用，避免在 main.ts 内部写难测试的 if/else 分支
 * - 必须使用函数式 origin callback（不能用 `*` + credentials）：
 *   1) credentials=true 时 origin 必须是函数（Express CORS 规范）
 *   2) 函数式 origin 才能按请求 origin 动态判断白名单
 * - dev 模式兜底：未配 CORS_ORIGINS 时默认放行 Vite dev server（5173/5174）
 * - prod 模式兜底：未配 CORS_ORIGINS 时拒绝所有跨域（callback 返回 false）
 */

/** CORS origin callback 类型（与 cors 包内部的 CorsOptions['origin'] 等价，避免引入 @types/cors 依赖） */
export type CorsOriginCallback = (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean | string) => void,
) => void;

/** CORS options 最小子集（不引入完整 CorsOptions 类型，保持 helper 零依赖） */
export interface CorsOptionsLike {
    origin: CorsOriginCallback | boolean | string | string[];
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
    /** 内部标记：测试可断言用（cors 包会忽略未知字段） */
    __whitelist?: ReadonlyArray<string>;
    __isProd?: boolean;
}

/** 默认的 dev 模式白名单（Vite admin/web dev server） */
const DEFAULT_DEV_ORIGINS: ReadonlyArray<string> = ['http://localhost:5173', 'http://localhost:5174'];

/**
 * 解析 origin 字符串（逗号分隔）→ 数组
 * - 过滤空字符串、纯空白
 * - 自动 trim 空白
 * - 与原 ALLOWED_ORIGINS 实现保持完全一致的解析语义
 *
 * @param raw - 原始字符串（可能是 undefined）
 * @returns trim 后的 origin 数组
 */
export function parseOrigins(raw: string | undefined | null): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/**
 * 解析 CORS 白名单
 * 优先读 CORS_ORIGINS（新名），fallback 读 ALLOWED_ORIGINS（旧名兼容）
 *
 * @param env - 环境变量（支持 Partial<NodeJS.ProcessEnv> 便于测试）
 * @returns trim 后的 origin 数组
 */
export function resolveCorsWhitelist(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string[] {
    const raw = env.CORS_ORIGINS ?? env.ALLOWED_ORIGINS;
    return parseOrigins(raw);
}

/**
 * 判定当前是否生产环境
 * - 与 main.ts / GraphQLModule 保持完全一致的判断逻辑
 * - 集中在一处便于测试和未来扩展（如 'staging' 单独处理）
 */
export function isProductionEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): boolean {
    return env.NODE_ENV === 'production';
}

/**
 * 构造 CORS options 对象
 *
 * 关键安全设计：
 * 1) origin 必须是函数（不能是 '*'）：当 credentials=true 时 CORS 规范要求 origin 是函数
 * 2) dev 模式：未配 CORS_ORIGINS 时 fallback 到 DEFAULT_DEV_ORIGINS
 * 3) prod 模式：未配 CORS_ORIGINS 时返回 false（拒绝所有跨域 → 浏览器 CORS 报错）
 * 4) 配置了 CORS_ORIGINS 时：按白名单逐项匹配（大小写敏感 + 尾部斜杠严格匹配）
 *
 * @param env - 环境变量（支持 Partial 便于测试）
 * @returns CORS options，可直接传给 app.enableCors()
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv | Record<string, string | undefined>): CorsOptionsLike {
    const isProd = isProductionEnv(env);
    const whitelist = resolveCorsWhitelist(env);

    /**
     * origin 决策逻辑：
     * - isProd 且白名单为空 → 一律拒绝（false）→ 浏览器 CORS 报错
     * - 白名单非空 → origin 在白名单内回显，否则拒绝
     * - dev 模式且白名单为空 → 用 DEFAULT_DEV_ORIGINS 作为白名单
     */
    const effectiveWhitelist: ReadonlyArray<string> =
        whitelist.length > 0 ? whitelist : isProd ? [] : DEFAULT_DEV_ORIGINS;

    return {
        /**
         * 函数式 origin callback：
         * - 第一个参数是请求携带的 Origin header（可能 undefined，如 server-to-server 请求）
         * - 第二个参数是 done(err, allow) 风格的回调
         * - allow=true → 放行（callback 第二参数回显 origin 或 true）
         * - allow=false → 拒绝（callback 第二参数传 false，浏览器收到不带 ACAO 头的响应即触发 CORS 错）
         */
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
            /**
             * 同源请求（无 Origin header）放行：
             * - curl / Postman / 服务端调用都没有 Origin，浏览器 fetcher 才有
             * - 同源场景：origin === undefined → 直接 callback(null, true)
             */
            if (!origin) {
                callback(null, true);
                return;
            }

            /**
             * prod 模式未配白名单 → 一律拒绝
             * - 这正是 spec.md 要求的「prod 模式空配置 → 拒绝所有跨域（不再 fallback 到 *）」
             */
            if (effectiveWhitelist.length === 0) {
                callback(null, false);
                return;
            }

            if (effectiveWhitelist.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(null, false);
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        /**
         * allowedHeaders 必须包含自定义头 x-csrf-token，否则浏览器 preflight 会拒绝
         * （Chromium 严格模式：Access-Control-Allow-Headers 缺哪个头，发请求时就拒绝哪个）
         */
        allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'x-csrf-token', 'x-request-id'],
        exposedHeaders: ['x-request-id', 'X-Request-ID'],
        credentials: true,
        maxAge: 86400,
        // 测试可断言用：cors 包会忽略未知字段
        __whitelist: effectiveWhitelist,
        __isProd: isProd,
    };
}
