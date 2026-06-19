/**
 * WebSocket 握手鉴权单元测试
 *
 * 覆盖场景：
 * 1. 有效 token（accessToken cookie）→ 返回 WsClientData
 * 2. 缺失 token（无 cookie + 无 auth）→ AUTH_MISSING
 * 3. 过期 token（jwt.verifyAsync 抛 TokenExpiredError）→ AUTH_EXPIRED
 * 4. cookie 解析失败（malformed）→ 视为无 cookie → AUTH_MISSING
 * 5. jti 在黑名单 → AUTH_REVOKED
 * 6. tokenVersion 不一致 → AUTH_EXPIRED
 * 7. auth 模式（io({ auth: { token } })）也能通过
 * 8. refreshToken cookie 也能用
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyWsHandshake, parseCookieHeader, pickWsToken, WsAuthException, type WsAuthDeps } from '../ws-auth.guard';

function createMockDeps(overrides: Partial<WsAuthDeps> = {}): WsAuthDeps {
    return {
        jwtService: {
            verifyAsync: vi.fn().mockResolvedValue({
                sub: 'acc-1',
                userType: 'admin',
                jti: 'jti-1',
                tokenVersion: 0,
            }),
        },
        configService: {
            get: vi.fn().mockImplementation((key: string) => {
                if (key === 'auth.JWT_ISSUER') return 'monorepo-server';
                if (key === 'auth.JWT_AUDIENCE') return 'monorepo-app';
                return undefined;
            }),
        },
        tokenBlacklist: {
            isRevoked: vi.fn().mockResolvedValue(false),
        },
        prisma: {
            client: {
                account: {
                    findUnique: vi.fn().mockResolvedValue({ tokenVersion: 0 }),
                },
            },
        },
        ...overrides,
    };
}

function createHandshake(opts: { cookie?: string; auth?: Record<string, unknown> } = {}): {
    headers: Record<string, string>;
    auth: Record<string, unknown>;
} {
    const headers: Record<string, string> = {};
    if (opts.cookie) headers['cookie'] = opts.cookie;
    return { headers, auth: opts.auth ?? {} };
}

describe('parseCookieHeader', () => {
    it('解析标准 cookie 头（多个 cookie 用 ; 分隔）', () => {
        const result = parseCookieHeader('accessToken=abc123; refreshToken=xyz789; theme=dark');
        expect(result).toEqual({
            accessToken: 'abc123',
            refreshToken: 'xyz789',
            theme: 'dark',
        });
    });

    it('URL 解码 value（处理 JWT 中可能的特殊字符）', () => {
        const result = parseCookieHeader('token=hello%20world');
        expect(result['token']).toBe('hello world');
    });

    it('空 / undefined → 返回空字典', () => {
        expect(parseCookieHeader(undefined)).toEqual({});
        expect(parseCookieHeader('')).toEqual({});
        expect(parseCookieHeader(null)).toEqual({});
    });

    it('跳过格式错误的项（无 = 号）', () => {
        const result = parseCookieHeader('valid=ok; broken_no_eq; another=good');
        expect(result).toEqual({ valid: 'ok', another: 'good' });
    });
});

describe('pickWsToken', () => {
    it('优先 accessToken', () => {
        expect(pickWsToken({ accessToken: 'a', refreshToken: 'r' })).toBe('a');
    });

    it('没有 accessToken 时 fallback 到 refreshToken', () => {
        expect(pickWsToken({ refreshToken: 'r' })).toBe('r');
    });

    it('都没有时返回 undefined', () => {
        expect(pickWsToken({})).toBeUndefined();
        expect(pickWsToken({ theme: 'dark' })).toBeUndefined();
    });
});

describe('verifyWsHandshake', () => {
    let deps: WsAuthDeps;

    beforeEach(() => {
        vi.clearAllMocks();
        deps = createMockDeps();
    });

    it('有效 accessToken cookie → 返回 WsClientData（accountId/userType/jti/tokenVersion）', async () => {
        const handshake = createHandshake({ cookie: 'accessToken=valid.token.value' });

        const data = await verifyWsHandshake(handshake, deps);

        expect(data.accountId).toBe('acc-1');
        expect(data.userType).toBe('admin');
        expect(data.jti).toBe('jti-1');
        expect(data.tokenVersion).toBe(0);
        /** jwt.verifyAsync 应被调用，并传入 issuer/audience */
        expect(deps.jwtService.verifyAsync).toHaveBeenCalledWith(
            'valid.token.value',
            expect.objectContaining({
                algorithms: ['HS256'],
                issuer: 'monorepo-server',
                audience: 'monorepo-app',
            }),
        );
        /** jti 在黑名单？查（防回归：必须传 accountId 把 jti='*' 限定到本账号） */
        expect(deps.tokenBlacklist.isRevoked).toHaveBeenCalledWith('jti-1', 'acc-1');
        /** tokenVersion 一致性？查 */
        expect(deps.prisma.client.account.findUnique).toHaveBeenCalledWith({
            where: { id: 'acc-1' },
            select: { tokenVersion: true },
        });
    });

    it('缺失 token（无 cookie + 无 auth）→ 抛 WsAuthException(AUTH_MISSING)', async () => {
        const handshake = createHandshake(); // 空

        await expect(verifyWsHandshake(handshake, deps)).rejects.toMatchObject({
            name: 'WsAuthException',
            code: 'AUTH_MISSING',
        });
        expect(deps.jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('cookie 解析失败（malformed）→ 视为无 cookie → AUTH_MISSING', async () => {
        // 全部是 "broken_no_eq" 这种无 = 号的项目
        const handshake = createHandshake({ cookie: 'broken_no_eq' });

        await expect(verifyWsHandshake(handshake, deps)).rejects.toMatchObject({
            code: 'AUTH_MISSING',
        });
        expect(deps.jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('jwt.verifyAsync 抛 TokenExpiredError → 抛 WsAuthException(AUTH_EXPIRED)', async () => {
        const expiryDeps = createMockDeps({
            jwtService: {
                verifyAsync: vi.fn().mockRejectedValue(new Error('jwt expired')),
            },
        });
        const handshake = createHandshake({ cookie: 'accessToken=expired.token' });

        await expect(verifyWsHandshake(handshake, expiryDeps)).rejects.toMatchObject({
            name: 'WsAuthException',
            code: 'AUTH_EXPIRED',
        });
    });

    it('jwt.verifyAsync 抛非过期异常（签名错误）→ 抛 WsAuthException(AUTH_INVALID)', async () => {
        const invalidDeps = createMockDeps({
            jwtService: {
                verifyAsync: vi.fn().mockRejectedValue(new Error('invalid signature')),
            },
        });
        const handshake = createHandshake({ cookie: 'accessToken=bad.token' });

        await expect(verifyWsHandshake(handshake, invalidDeps)).rejects.toMatchObject({
            name: 'WsAuthException',
            code: 'AUTH_INVALID',
        });
    });

    it('jti 在黑名单 → 抛 WsAuthException(AUTH_REVOKED)', async () => {
        const revokedDeps = createMockDeps({
            tokenBlacklist: {
                isRevoked: vi.fn().mockResolvedValue(true),
            },
        });
        const handshake = createHandshake({ cookie: 'accessToken=valid.token' });

        await expect(verifyWsHandshake(handshake, revokedDeps)).rejects.toMatchObject({
            name: 'WsAuthException',
            code: 'AUTH_REVOKED',
        });
    });

    it('payload.tokenVersion !== account.tokenVersion → 抛 WsAuthException(AUTH_EXPIRED)', async () => {
        // payload.tokenVersion=0，但 account.tokenVersion=5（说明 token 签发后被踢下线过）
        const mismatchDeps = createMockDeps({
            prisma: {
                client: {
                    account: {
                        findUnique: vi.fn().mockResolvedValue({ tokenVersion: 5 }),
                    },
                },
            },
        });
        const handshake = createHandshake({ cookie: 'accessToken=valid.token' });

        await expect(verifyWsHandshake(handshake, mismatchDeps)).rejects.toMatchObject({
            name: 'WsAuthException',
            code: 'AUTH_EXPIRED',
        });
    });

    it('account 不存在（DB 查不到）→ 抛 WsAuthException(AUTH_INVALID)', async () => {
        const noAccountDeps = createMockDeps({
            prisma: {
                client: {
                    account: {
                        findUnique: vi.fn().mockResolvedValue(null),
                    },
                },
            },
        });
        const handshake = createHandshake({ cookie: 'accessToken=valid.token' });

        await expect(verifyWsHandshake(handshake, noAccountDeps)).rejects.toMatchObject({
            name: 'WsAuthException',
            code: 'AUTH_INVALID',
        });
    });

    it('socket.io 客户端 auth 模式（handshake.auth.token）也能用', async () => {
        const handshake = createHandshake({ auth: { token: 'auth.mode.token' } });

        const data = await verifyWsHandshake(handshake, deps);

        expect(data.accountId).toBe('acc-1');
        expect(deps.jwtService.verifyAsync).toHaveBeenCalledWith(
            'auth.mode.token',
            expect.objectContaining({ algorithms: ['HS256'] }),
        );
    });

    it('refreshToken cookie 也能通过（无 accessToken 时）', async () => {
        const handshake = createHandshake({ cookie: 'refreshToken=refresh.token' });

        const data = await verifyWsHandshake(handshake, deps);

        expect(data.accountId).toBe('acc-1');
        expect(deps.jwtService.verifyAsync).toHaveBeenCalledWith(
            'refresh.token',
            expect.objectContaining({ algorithms: ['HS256'] }),
        );
    });

    it('payload 缺 sub 或 userType → 抛 WsAuthException(AUTH_INVALID)', async () => {
        const badPayloadDeps = createMockDeps({
            jwtService: {
                verifyAsync: vi.fn().mockResolvedValue({ jti: 'xxx' }), // 缺 sub/userType
            },
        });
        const handshake = createHandshake({ cookie: 'accessToken=bad.payload' });

        await expect(verifyWsHandshake(handshake, badPayloadDeps)).rejects.toMatchObject({
            name: 'WsAuthException',
            code: 'AUTH_INVALID',
        });
    });

    it('payload 无 jti（兼容老 token）→ 跳过黑名单检查', async () => {
        const noJtiDeps = createMockDeps({
            jwtService: {
                verifyAsync: vi.fn().mockResolvedValue({
                    sub: 'acc-1',
                    userType: 'admin',
                    tokenVersion: 0,
                    // jti 未设置
                }),
            },
        });
        const handshake = createHandshake({ cookie: 'accessToken=old.token' });

        const data = await verifyWsHandshake(handshake, noJtiDeps);

        expect(data.accountId).toBe('acc-1');
        expect(data.jti).toBeUndefined();
        /** 不应查黑名单（没 jti 没意义） */
        expect(noJtiDeps.tokenBlacklist.isRevoked).not.toHaveBeenCalled();
    });
});
