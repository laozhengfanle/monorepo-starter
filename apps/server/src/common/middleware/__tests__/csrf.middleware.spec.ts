/**
 * CSRF 中间件单元测试
 *
 * 覆盖场景：
 * - 异长 token：cookieToken 长度 64 / headerToken 长度 1 → 403（不抛 RangeError）
 * - 长度相同但内容不同 → 403
 * - 两者完全相同 → next() 被调用
 * - 缺少 cookieToken 或 headerToken → 403
 * - GET / HEAD / OPTIONS 跳过校验
 * - 豁免路径（/api/auth/login 等）跳过校验
 * - SSE 例外：query 参数 + 专用 cookie
 *   - SSE 请求带 ?csrf=xxx 校验通过
 *   - SSE 请求缺 query 拒绝
 *   - 伪造 cookie 拒绝
 *   - 普通 POST 仍走 header 路径
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
    csrfGuard,
    csrfTokenHandler,
    issueCsrfCookie,
    issueSseCsrfCookie,
    getCsrfCookieName,
    getCsrfCookieSecure,
    getSseCsrfCookieName,
    getSseCsrfCookieSecure,
} from '../csrf.middleware';

/**
 * 构造 mock ConfigService — 默认模拟 dev 环境
 * - CSRF_COOKIE_SECURE=false → cookie name = csrf-token, secure = false
 * - COOKIE_SECURE=false → 业务 cookie secure = false
 */
function createMockConfigService(overrides: Record<string, any> = {}): ConfigService {
    const defaults: Record<string, any> = {
        'auth.CSRF_COOKIE_SECURE': false,
        'auth.COOKIE_SECURE': false,
    };
    const map = { ...defaults, ...overrides };
    return {
        get: vi.fn().mockImplementation((key: string) => map[key]),
    } as unknown as ConfigService;
}

/** 构造 mock express 中间件参数 */
function createMocks(
    method: string,
    path: string,
    opts: {
        cookies?: Record<string, string>;
        headers?: Record<string, string>;
        body?: any;
        query?: Record<string, string>;
    } = {},
) {
    const req = {
        method,
        path,
        cookies: opts.cookies ?? {},
        headers: opts.headers ?? {},
        body: opts.body,
        query: opts.query ?? {},
    };
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        cookie: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();
    return { req, res, next };
}

describe('CSRF 中间件', () => {
    let configService: ConfigService;

    beforeEach(() => {
        configService = createMockConfigService();
        vi.clearAllMocks();
    });

    // ── 工厂函数 ──

    describe('getCsrfCookieName 工厂', () => {
        it('CSRF_COOKIE_SECURE=false → 返回 dev cookie 名 csrf-token', () => {
            const name = getCsrfCookieName(configService);
            expect(name).toBe('csrf-token');
        });

        it('CSRF_COOKIE_SECURE=true → 返回 __Host-csrf-token', () => {
            const cs = createMockConfigService({ 'auth.CSRF_COOKIE_SECURE': true });
            const name = getCsrfCookieName(cs);
            expect(name).toBe('__Host-csrf-token');
        });
    });

    describe('getCsrfCookieSecure 工厂', () => {
        it('CSRF_COOKIE_SECURE=false → 返回 false', () => {
            expect(getCsrfCookieSecure(configService)).toBe(false);
        });

        it('CSRF_COOKIE_SECURE=true → 返回 true', () => {
            const cs = createMockConfigService({ 'auth.CSRF_COOKIE_SECURE': true });
            expect(getCsrfCookieSecure(cs)).toBe(true);
        });
    });

    describe('issueCsrfCookie 工厂', () => {
        it('调用后应在 res 上写入 httpOnly + sameSite=strict 的 cookie', () => {
            const issue = issueCsrfCookie(configService);
            const { res } = createMocks('POST', '/api/admin/foo');

            const token = issue(res);

            // 返回 token 是 64 字符 hex
            expect(token).toMatch(/^[0-9a-f]{64}$/);
            expect(res.cookie).toHaveBeenCalledWith(
                'csrf-token',
                token,
                expect.objectContaining({
                    httpOnly: true,
                    sameSite: 'strict',
                    secure: false,
                    path: '/',
                }),
            );
        });

        it('CSRF_COOKIE_SECURE=true 时 secure 标志应为 true', () => {
            const cs = createMockConfigService({ 'auth.CSRF_COOKIE_SECURE': true });
            const issue = issueCsrfCookie(cs);
            const { res } = createMocks('POST', '/api/admin/foo');

            const token = issue(res);

            expect(res.cookie).toHaveBeenCalledWith(
                '__Host-csrf-token',
                token,
                expect.objectContaining({ secure: true }),
            );
        });
    });

    // ── 核心安全：timingSafeEqual 长度校验 ──

    describe('csrfGuard 异长 token 处理（防 RangeError）', () => {
        it('cookieToken 长度 64 / headerToken 长度 1 → 403（不抛异常）', () => {
            const guard = csrfGuard(configService);
            const cookieToken = 'a'.repeat(64);
            const headerToken = 'a';
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                cookies: { 'csrf-token': cookieToken },
                headers: { 'x-csrf-token': headerToken },
            });

            // 不应抛 RangeError，应正常返回 403
            expect(() => guard(req, res, next)).not.toThrow();

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'CSRF token mismatch' }));
            expect(next).not.toHaveBeenCalled();
        });

        it('cookieToken 长度 1 / headerToken 长度 64 → 403', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                cookies: { 'csrf-token': 'a' },
                headers: { 'x-csrf-token': 'a'.repeat(64) },
            });

            expect(() => guard(req, res, next)).not.toThrow();

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('空字符串 vs 正常长度 → 403', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                cookies: { 'csrf-token': '' },
                headers: { 'x-csrf-token': 'a'.repeat(64) },
            });

            expect(() => guard(req, res, next)).not.toThrow();

            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe('csrfGuard 同长但内容不同', () => {
        it('两个 token 长度都是 64 但内容不同 → 403', () => {
            const guard = csrfGuard(configService);
            const cookieToken = 'a'.repeat(64);
            const headerToken = 'b'.repeat(64);
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                cookies: { 'csrf-token': cookieToken },
                headers: { 'x-csrf-token': headerToken },
            });

            guard(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'CSRF token mismatch' }));
            expect(next).not.toHaveBeenCalled();
        });

        it('两个 token 长度都是 64 且只有 1 位不同 → 403', () => {
            const guard = csrfGuard(configService);
            const token = 'a'.repeat(64);
            const tampered = 'a'.repeat(63) + 'b';
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                cookies: { 'csrf-token': token },
                headers: { 'x-csrf-token': tampered },
            });

            guard(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('csrfGuard token 完全匹配', () => {
        it('两个 token 完全相同 → next() 被调用', () => {
            const guard = csrfGuard(configService);
            const token = 'a'.repeat(64);
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                cookies: { 'csrf-token': token },
                headers: { 'x-csrf-token': token },
            });

            guard(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('生成的真实 token 与自身比对 → next()', () => {
            const issue = issueCsrfCookie(configService);
            const guard = csrfGuard(configService);

            // 先获取 token
            const { res: res1 } = createMocks('POST', '/api/admin/foo');
            const token = issue(res1);
            expect(token).toMatch(/^[0-9a-f]{64}$/);

            // 用该 token 访问受保护端点
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                cookies: { 'csrf-token': token },
                headers: { 'x-csrf-token': token },
            });
            guard(req, res, next);
            expect(next).toHaveBeenCalledWith();
        });
    });

    // ── 缺失 token 场景 ──

    describe('csrfGuard 缺失 token', () => {
        it('缺少 cookieToken → 403 missing', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                headers: { 'x-csrf-token': 'a'.repeat(64) },
            });

            guard(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'CSRF token missing' }));
        });

        it('缺少 headerToken → 403 missing', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                cookies: { 'csrf-token': 'a'.repeat(64) },
            });

            guard(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'CSRF token missing' }));
        });

        it('两者都缺 → 403 missing', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/admin/foo');

            guard(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'CSRF token missing' }));
        });
    });

    // ── 豁免规则 ──

    describe('csrfGuard 豁免规则', () => {
        it('GET 请求跳过校验', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('GET', '/api/admin/foo');

            guard(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('HEAD 请求跳过校验', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('HEAD', '/api/admin/foo');

            guard(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('OPTIONS 请求跳过校验（CORS preflight）', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('OPTIONS', '/api/admin/foo');

            guard(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('/api/auth/login 豁免（登录端点）', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/auth/login');

            guard(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('/api/admin/auth/login 豁免', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/admin/auth/login');

            guard(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });

        it('/api/auth/refresh 豁免', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/auth/refresh');

            guard(req, res, next);

            expect(next).toHaveBeenCalledWith();
        });
    });

    // ── csrfTokenHandler ──

    describe('csrfTokenHandler', () => {
        it('没有 cookie 时下发新 token + 设置 cookie', () => {
            const handler = csrfTokenHandler(configService);
            const { req, res } = createMocks('GET', '/api/auth/csrf-token');

            handler(req, res);

            expect(res.cookie).toHaveBeenCalledWith(
                'csrf-token',
                expect.stringMatching(/^[0-9a-f]{64}$/),
                expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
            );
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ token: expect.stringMatching(/^[0-9a-f]{64}$/) }),
            );
        });

        it('已有 cookie 时直接返回 cookie 中的 token（不重新生成）', () => {
            const handler = csrfTokenHandler(configService);
            const existingToken = 'a'.repeat(64);
            const { req, res } = createMocks('GET', '/api/auth/csrf-token', {
                cookies: { 'csrf-token': existingToken },
            });

            handler(req, res);

            expect(res.cookie).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ token: existingToken });
        });

        it('生产环境使用 __Host- 前缀', () => {
            const cs = createMockConfigService({ 'auth.CSRF_COOKIE_SECURE': true });
            const handler = csrfTokenHandler(cs);
            const { req, res } = createMocks('GET', '/api/auth/csrf-token');

            handler(req, res);

            expect(res.cookie).toHaveBeenCalledWith(
                '__Host-csrf-token',
                expect.any(String),
                expect.objectContaining({ secure: true }),
            );
        });
    });

    // ── SSE 例外 ──
    // - EventSource 不支持自定义 header → CSRF token 走 query 参数
    // - cookie 用专用 `__Host-sse-csrf` / `sse-csrf`（SameSite=None）

    describe('getSseCsrfCookieName 工厂', () => {
        it('CSRF_COOKIE_SECURE=false → 返回 dev cookie 名 sse-csrf', () => {
            const name = getSseCsrfCookieName(configService);
            expect(name).toBe('sse-csrf');
        });

        it('CSRF_COOKIE_SECURE=true → 返回 __Host-sse-csrf', () => {
            const cs = createMockConfigService({ 'auth.CSRF_COOKIE_SECURE': true });
            const name = getSseCsrfCookieName(cs);
            expect(name).toBe('__Host-sse-csrf');
        });
    });

    describe('getSseCsrfCookieSecure 工厂', () => {
        it('CSRF_COOKIE_SECURE=false → 返回 false（dev 仍可用 HTTP）', () => {
            expect(getSseCsrfCookieSecure(configService)).toBe(false);
        });

        it('CSRF_COOKIE_SECURE=true → 返回 true（生产 HTTPS）', () => {
            const cs = createMockConfigService({ 'auth.CSRF_COOKIE_SECURE': true });
            expect(getSseCsrfCookieSecure(cs)).toBe(true);
        });
    });

    describe('issueSseCsrfCookie 工厂', () => {
        it('调用后应在 res 上写 sse-csrf cookie（SameSite=none, dev 模式 secure=false）', () => {
            const issue = issueSseCsrfCookie(configService);
            const { res } = createMocks('POST', '/api/some/sse');

            const token = issue(res);

            expect(token).toMatch(/^[0-9a-f]{64}$/);
            expect(res.cookie).toHaveBeenCalledWith(
                'sse-csrf',
                token,
                expect.objectContaining({
                    httpOnly: true,
                    sameSite: 'none',
                    secure: false,
                    path: '/',
                }),
            );
        });

        it('生产环境使用 __Host-sse-csrf + secure=true', () => {
            const cs = createMockConfigService({ 'auth.CSRF_COOKIE_SECURE': true });
            const issue = issueSseCsrfCookie(cs);
            const { res } = createMocks('POST', '/api/some/sse');

            const token = issue(res);

            expect(res.cookie).toHaveBeenCalledWith(
                '__Host-sse-csrf',
                token,
                expect.objectContaining({ sameSite: 'none', secure: true }),
            );
        });
    });

    describe('csrfGuard SSE 例外（query + 专用 cookie）', () => {
        const sseToken = 'a'.repeat(64);

        it('SSE 请求带 ?csrf=xxx + sse-csrf cookie 一致 → next()', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/some/sse/stream', {
                cookies: { 'sse-csrf': sseToken },
                headers: { accept: 'text/event-stream' },
                query: { csrf: sseToken },
            });

            guard(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('SSE 请求缺 ?csrf → 403 missing', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/some/sse/stream', {
                cookies: { 'sse-csrf': sseToken },
                headers: { accept: 'text/event-stream' },
                // 缺 query
            });

            guard(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'SSE CSRF token missing' }));
            expect(next).not.toHaveBeenCalled();
        });

        it('SSE 请求 ?csrf 与 sse-csrf cookie 不一致 → 403 mismatch（防 token 伪造）', () => {
            const guard = csrfGuard(configService);
            const cookieToken = sseToken;
            const queryToken = 'b'.repeat(64);
            const { req, res, next } = createMocks('POST', '/api/some/sse/stream', {
                cookies: { 'sse-csrf': cookieToken },
                headers: { accept: 'text/event-stream' },
                query: { csrf: queryToken },
            });

            guard(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'SSE CSRF token mismatch' }));
            expect(next).not.toHaveBeenCalled();
        });

        it('SSE 请求完全无 cookie → 403 missing', () => {
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/some/sse/stream', {
                headers: { accept: 'text/event-stream' },
                query: { csrf: sseToken },
            });

            guard(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'SSE CSRF token missing' }));
        });

        it('普通 POST（不带 accept=text/event-stream）→ 仍走 header 路径，忽略 query', () => {
            // 模拟普通 POST 请求：
            // - 没有 Accept: text/event-stream 头
            // - 有 query 参数 csrf（仅 SSE 场景才用）
            // - 应该有 x-csrf-token header + csrf-token cookie
            const guard = csrfGuard(configService);
            const { req, res, next } = createMocks('POST', '/api/admin/foo', {
                cookies: { 'csrf-token': sseToken },
                headers: { 'x-csrf-token': sseToken },
                query: { csrf: 'b'.repeat(64) }, // 故意不同，确认不影响
            });

            guard(req, res, next);

            // 仍走 header 路径，校验通过
            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });
    });
});
