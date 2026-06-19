/**
 * CORS 配置构建器单元测试
 *
 * 覆盖 8 个场景（CORS）：
 * 1. dev 模式 + 未配 CORS_ORIGINS → fallback 到默认 Vite 白名单
 * 2. dev 模式 + 已配 CORS_ORIGINS → 使用显式白名单
 * 3. prod 模式 + 未配 CORS_ORIGINS → 白名单为空（所有跨域拒绝）
 * 4. prod 模式 + 已配 CORS_ORIGINS → 使用显式白名单
 * 5. 旧名 ALLOWED_ORIGINS 兼容（fallback 读取）
 * 6. 凭据透传：credentials=true + 合法 origin → 放行
 * 7. 凭据透传：credentials=true + 非法 origin → 拒绝（不能退化为 '*'）
 * 8. 同源请求（无 Origin header，如 curl/服务端调用）→ 放行
 * 9. 预检（preflight）通过白名单 origin → 放行
 *
 * 关键：必须用函数式 origin callback，不能用 '*' + credentials
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    buildCorsOptions,
    parseOrigins,
    resolveCorsWhitelist,
    isProductionEnv,
    type CorsOptionsLike,
} from '../cors.helper.js';

/** 断言 origin callback 行为的小工具：传入 origin，返回是否放行 */
function isAllowed(options: CorsOptionsLike, origin: string | undefined): Promise<boolean> {
    return new Promise((resolveP) => {
        const cb = options.origin as (
            origin: string | undefined,
            callback: (err: Error | null, allow?: boolean | string) => void,
        ) => void;
        cb(origin, (_err, allow) => {
            resolveP(Boolean(allow));
        });
    });
}

describe('parseOrigins', () => {
    it('应正确拆分逗号分隔的 origin 字符串', () => {
        expect(parseOrigins('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('应过滤空字符串和纯空白', () => {
        expect(parseOrigins('a, , b,,c,')).toEqual(['a', 'b', 'c']);
    });

    it('undefined / null / 空字符串应返回空数组', () => {
        expect(parseOrigins(undefined)).toEqual([]);
        expect(parseOrigins(null)).toEqual([]);
        expect(parseOrigins('')).toEqual([]);
    });

    it('应自动 trim 空白', () => {
        expect(parseOrigins('  a  ,  b  ')).toEqual(['a', 'b']);
    });
});

describe('resolveCorsWhitelist', () => {
    it('应优先读取 CORS_ORIGINS', () => {
        const list = resolveCorsWhitelist({
            CORS_ORIGINS: 'https://a.com,https://b.com',
            ALLOWED_ORIGINS: 'https://legacy.com',
        });
        expect(list).toEqual(['https://a.com', 'https://b.com']);
    });

    it('CORS_ORIGINS 未设时应 fallback 到 ALLOWED_ORIGINS', () => {
        const list = resolveCorsWhitelist({
            ALLOWED_ORIGINS: 'https://legacy.com',
        });
        expect(list).toEqual(['https://legacy.com']);
    });

    it('两个都未设时返回空数组', () => {
        expect(resolveCorsWhitelist({})).toEqual([]);
    });
});

describe('isProductionEnv', () => {
    it('NODE_ENV=production → true', () => {
        expect(isProductionEnv({ NODE_ENV: 'production' })).toBe(true);
    });

    it('NODE_ENV=development → false', () => {
        expect(isProductionEnv({ NODE_ENV: 'development' })).toBe(false);
    });

    it('NODE_ENV 未设 → false', () => {
        expect(isProductionEnv({})).toBe(false);
    });
});

describe('buildCorsOptions', () => {
    beforeEach(() => {
        // 测试间无状态污染
    });

    // 场景 1：dev 模式 + 未配 CORS_ORIGINS → fallback 到默认 Vite 白名单
    it('dev 模式 + 未配 CORS_ORIGINS → origin callback 放行默认 Vite 5173/5174', async () => {
        const options = buildCorsOptions({ NODE_ENV: 'development' });
        // 默认 Vite 白名单生效
        expect(await isAllowed(options, 'http://localhost:5173')).toBe(true);
        expect(await isAllowed(options, 'http://localhost:5174')).toBe(true);
        // 其它 origin 拒绝
        expect(await isAllowed(options, 'http://evil.com')).toBe(false);
    });

    // 场景 2：dev 模式 + 已配 CORS_ORIGINS → 使用显式白名单
    it('dev 模式 + 已配 CORS_ORIGINS → 只放行白名单内的 origin', async () => {
        const options = buildCorsOptions({
            NODE_ENV: 'development',
            CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
        });
        expect(await isAllowed(options, 'https://app.example.com')).toBe(true);
        expect(await isAllowed(options, 'https://admin.example.com')).toBe(true);
        // Vite dev 端口 5173 不在显式白名单中 → 拒绝
        expect(await isAllowed(options, 'http://localhost:5173')).toBe(false);
    });

    // 场景 3：prod 模式 + 未配 CORS_ORIGINS → 白名单为空，所有跨域拒绝
    it('prod 模式 + 未配 CORS_ORIGINS → 所有跨域 origin 应被拒绝', async () => {
        const options = buildCorsOptions({ NODE_ENV: 'production' });
        // 即便 Vite dev 端口 5173 也应拒绝（与 dev 模式行为对比）
        expect(await isAllowed(options, 'http://localhost:5173')).toBe(false);
        expect(await isAllowed(options, 'http://localhost:5174')).toBe(false);
        expect(await isAllowed(options, 'https://app.example.com')).toBe(false);
        expect(await isAllowed(options, 'https://evil.com')).toBe(false);
    });

    // 场景 4：prod 模式 + 已配 CORS_ORIGINS → 使用显式白名单
    it('prod 模式 + 已配 CORS_ORIGINS → 只放行白名单内的 origin', async () => {
        const options = buildCorsOptions({
            NODE_ENV: 'production',
            CORS_ORIGINS: 'https://app.example.com',
        });
        expect(await isAllowed(options, 'https://app.example.com')).toBe(true);
        expect(await isAllowed(options, 'https://evil.com')).toBe(false);
        expect(await isAllowed(options, 'http://localhost:5173')).toBe(false);
    });

    // 场景 5：旧名 ALLOWED_ORIGINS 兼容
    it('未设 CORS_ORIGINS 但设了 ALLOWED_ORIGINS → 应使用 ALLOWED_ORIGINS', async () => {
        const options = buildCorsOptions({
            NODE_ENV: 'production',
            ALLOWED_ORIGINS: 'https://legacy.example.com',
        });
        expect(await isAllowed(options, 'https://legacy.example.com')).toBe(true);
        expect(await isAllowed(options, 'https://evil.com')).toBe(false);
    });

    // 场景 6：凭据透传 + 合法 origin
    it('凭据透传：credentials=true + 合法 origin → 配置正确', () => {
        const options = buildCorsOptions({
            NODE_ENV: 'development',
            CORS_ORIGINS: 'https://app.example.com',
        });
        // credentials 必须为 true（cookie 透传必需）
        expect(options.credentials).toBe(true);
        // origin 必须是函数（不能用 '*' + credentials，否则浏览器拒绝）
        expect(typeof options.origin).toBe('function');
        // 必须暴露 x-csrf-token（preflight 通过必需）
        expect(options.allowedHeaders).toContain('x-csrf-token');
        expect(options.allowedHeaders).toContain('x-request-id');
    });

    // 场景 7：同源 / 无 Origin 请求（curl / Postman / 服务端）→ 放行
    it('同源请求（无 Origin header）→ 应放行', async () => {
        const options = buildCorsOptions({ NODE_ENV: 'production' });
        // 即便 prod 模式且未配白名单，origin=undefined 也要放行
        // （curl、Postman、服务端调用都没有 Origin，不能误伤）
        expect(await isAllowed(options, undefined)).toBe(true);
    });

    // 场景 8：preflight（OPTIONS）相关的 methods / allowedHeaders 配置
    it('应配置预检必需的 methods / allowedHeaders', () => {
        const options = buildCorsOptions({ NODE_ENV: 'development' });
        expect(options.methods).toEqual(expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']));
        expect(options.allowedHeaders).toEqual(
            expect.arrayContaining(['Content-Type', 'Accept', 'Authorization', 'x-csrf-token', 'x-request-id']),
        );
        expect(options.exposedHeaders).toEqual(expect.arrayContaining(['x-request-id', 'X-Request-ID']));
        expect(options.maxAge).toBe(86400);
    });

    // 场景 9（额外）：trailing slash / 大小写差异 / 协议差异应严格匹配
    it('origin 严格匹配：尾部斜杠/大小写/协议差异都应拒绝', async () => {
        const options = buildCorsOptions({
            NODE_ENV: 'production',
            CORS_ORIGINS: 'https://app.example.com',
        });
        // 严格匹配（按字符串相等）
        expect(await isAllowed(options, 'https://app.example.com/')).toBe(false); // 多了斜杠
        expect(await isAllowed(options, 'HTTPS://app.example.com')).toBe(false); // 大小写不一致
        expect(await isAllowed(options, 'http://app.example.com')).toBe(false); // 协议不一致
    });

    // 场景 10（额外）：CORS_ORIGINS 空字符串 → 等同于未配
    it('CORS_ORIGINS 为空字符串 → 等同于未配（prod 拒绝 / dev fallback）', async () => {
        const prodOptions = buildCorsOptions({ NODE_ENV: 'production', CORS_ORIGINS: '' });
        expect(await isAllowed(prodOptions, 'http://localhost:5173')).toBe(false);

        const devOptions = buildCorsOptions({ NODE_ENV: 'development', CORS_ORIGINS: '' });
        // dev fallback 仍生效
        expect(await isAllowed(devOptions, 'http://localhost:5173')).toBe(true);
    });
});
