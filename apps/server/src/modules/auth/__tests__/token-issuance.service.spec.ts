/**
 * TokenIssuanceService 单元测试
 *
 * 覆盖场景：
 * - issueTokens: 双Token签发 / Redis写入 / tokenVersion / jti
 * - refresh: 成功 / 过期Token / Reuse Detection / Token不存在
 * - 边界测试：clock skew / signature invalid / payload tampering
 *
 * 历史背景：
 * - 该服务是从 auth.service.ts 拆分出来的（Post-Audit Polish Task 4）
 * - 原 auth.service.spec.ts 中的 issueTokens / refresh 测试已迁移到此处
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { TokenIssuanceService } from '../token-issuance.service.js';

// ── 辅助工厂 ──

function createMockCache() {
    return {
        get: vi.fn(),
        set: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
        delMany: vi.fn(),
        delByPattern: vi.fn(),
        mget: vi.fn(),
        setTtlByPattern: vi.fn(),
        exists: vi.fn(),
        incr: vi.fn(),
        ttl: vi.fn(),
        evalLua: vi.fn(),
    };
}

function createMockJwtService() {
    return {
        signAsync: vi.fn(),
        verifyAsync: vi.fn(),
    };
}

function createMockConfigService() {
    const store = new Map<string, any>();
    store.set('auth.JWT_ACCESS_TTL', 900);
    store.set('auth.JWT_REFRESH_TTL', 604800);
    store.set('auth.JWT_SECRET', 'test-secret-key-for-testing-only');
    store.set('auth.JWT_ISSUER', 'mono');
    store.set('auth.JWT_AUDIENCE', 'mono-app');
    return { get: (key: string) => store.get(key) };
}

function createMockTokenBlacklistService() {
    return {
        revokeAccountTokens: vi.fn().mockResolvedValue(undefined),
        isRevoked: vi.fn().mockResolvedValue(false),
        tryClaimRefreshSlot: vi.fn().mockResolvedValue(true),
    };
}

function createMockPrisma() {
    return {
        client: {
            account: {
                findUnique: vi.fn().mockResolvedValue({ tokenVersion: 0 }),
            },
        },
    };
}

describe('TokenIssuanceService', () => {
    let service: TokenIssuanceService;
    let mockCache: ReturnType<typeof createMockCache>;
    let mockJwt: ReturnType<typeof createMockJwtService>;
    let mockConfig: ReturnType<typeof createMockConfigService>;
    let mockTokenBlacklist: ReturnType<typeof createMockTokenBlacklistService>;
    let mockPrismaClient: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
        mockCache = createMockCache();
        mockJwt = createMockJwtService();
        mockConfig = createMockConfigService();
        mockTokenBlacklist = createMockTokenBlacklistService();
        mockPrismaClient = createMockPrisma();

        service = new TokenIssuanceService(
            mockJwt as any,
            mockConfig as any,
            mockCache as any,
            mockTokenBlacklist as any,
            mockPrismaClient as any,
        );
    });

    // ════════════════════════════════════════════════════════════════
    // issueTokens
    // ════════════════════════════════════════════════════════════════

    describe('issueTokens', () => {
        it('应签发 accessToken 和 refreshToken 并写入 Redis', async () => {
            mockPrismaClient.client.account.findUnique.mockResolvedValue({ tokenVersion: 0 });
            mockJwt.signAsync.mockResolvedValueOnce('access-token-value');
            mockJwt.signAsync.mockResolvedValueOnce('refresh-token-value');

            const result = await service.issueTokens('acc-1', 'admin');

            expect(result.accessToken).toBe('access-token-value');
            expect(result.refreshToken).toBe('refresh-token-value');
            expect(result.expiresIn).toBe(900);
            /** Redis 写入：refresh token hash（active）+ family */
            expect(mockCache.setex).toHaveBeenCalledTimes(2);
            /** signAsync 应传入 tokenVersion + jti */
            expect(mockJwt.signAsync).toHaveBeenCalledWith(
                expect.objectContaining({ sub: 'acc-1', userType: 'admin', tokenVersion: 0 }),
                expect.objectContaining({ expiresIn: 900 }),
            );
        });

        it('签发时应携带 account.tokenVersion', async () => {
            mockPrismaClient.client.account.findUnique.mockResolvedValue({ tokenVersion: 5 });
            mockJwt.signAsync.mockResolvedValue('at');

            await service.issueTokens('acc-1', 'admin');

            /** payload.tokenVersion 应等于 account.tokenVersion */
            const signCall = mockJwt.signAsync.mock.calls[0][0];
            expect(signCall.tokenVersion).toBe(5);
            expect(signCall.jti).toBeDefined();
        });
    });

    // ════════════════════════════════════════════════════════════════
    // refresh
    // CAS 走 tryClaimRefreshSlot，失败 → 20005
    // ════════════════════════════════════════════════════════════════

    describe('refresh', () => {
        const oldToken = 'old-refresh-token';

        it('应成功刷新Token（CAS 成功）', async () => {
            mockJwt.verifyAsync.mockResolvedValue({ sub: 'acc-1', userType: 'admin', jti: 'old-jti' });
            mockTokenBlacklist.isRevoked.mockResolvedValue(false);
            mockTokenBlacklist.tryClaimRefreshSlot.mockResolvedValue(true);
            mockPrismaClient.client.account.findUnique.mockResolvedValue({ tokenVersion: 0 });
            mockJwt.signAsync.mockResolvedValueOnce('new-at').mockResolvedValueOnce('new-rt');

            const result = await service.refresh(oldToken);

            expect(result.accessToken).toBe('new-at');
            expect(result.refreshToken).toBe('new-rt');
            /** CAS 应被调用 */
            expect(mockTokenBlacklist.tryClaimRefreshSlot).toHaveBeenCalledWith('old-jti', expect.any(String));
        });

        it('过期Token应抛异常', async () => {
            mockJwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

            await expect(service.refresh(oldToken)).rejects.toThrow(UnauthorizedException);
        });

        /**
         * CAS 失败 = Reuse Detection
         * - 20005 错误码
         * - 清空该用户所有 refresh token
         */
        it('CAS 失败（Reuse Detection）应抛 20005 并清空该用户所有 refreshToken', async () => {
            mockJwt.verifyAsync.mockResolvedValue({ sub: 'acc-1', userType: 'admin', jti: 'old-jti' });
            mockTokenBlacklist.isRevoked.mockResolvedValue(false);
            mockTokenBlacklist.tryClaimRefreshSlot.mockResolvedValue(false);

            await expect(service.refresh(oldToken)).rejects.toThrow(UnauthorizedException);
            /** 清空该用户所有 refresh token */
            expect(mockCache.delByPattern).toHaveBeenCalledWith(expect.stringContaining('mono:refresh:used:acc-1'));
            expect(mockCache.del).toHaveBeenCalledWith(expect.stringContaining('mono:refresh:family:acc-1'));
        });

        it('Token 已被撤销（jti 在黑名单）应抛 20003', async () => {
            mockJwt.verifyAsync.mockResolvedValue({ sub: 'acc-1', userType: 'admin', jti: 'old-jti' });
            mockTokenBlacklist.isRevoked.mockResolvedValue(true);

            await expect(service.refresh(oldToken)).rejects.toThrow(UnauthorizedException);
            /** 不应进入 CAS 流程 */
            expect(mockTokenBlacklist.tryClaimRefreshSlot).not.toHaveBeenCalled();
        });

        // ════════════════════════════════════════════════════════════════
        // refresh 边界测试
        //
        // 6 个边界场景，全部用真实的 jsonwebtoken 库签发 + 验签
        // （不能再 mock verifyAsync，因为我们要测的就是 JWT 库本身的行为）
        //
        // 独立 describe + beforeAll：避免污染外层用 mock 的测试
        // （外层 refresh 测试用 mockJwt.verifyAsync.mockResolvedValue(...)，不能被真实 JwtService 替换）
        // ════════════════════════════════════════════════════════════════
        describe('边界测试（真实 JWT 签发/验签）', () => {
            /**
             * 构造一个真实签名的 JWT（用 jsonwebtoken 库 + 测试 secret）
             *
             * 注意：jsonwebtoken@9 不允许在 sign options 里传 `iat`（会抛 "iat is not allowed"）
             * 所以 clock skew 改用 nbf 测试（clockTolerance 同时作用于 exp 和 nbf）
             *
             * @param opts.expInPast exp 多少秒前过期（正数=已过期 N 秒）
             * @param opts.nbfInPast nbf 多少秒前生效（用于测试 clock tolerance 对 nbf 的容忍）
             */
            function signTestJwt(
                opts: {
                    expInPast?: number;
                    /** notBefore 相对当前时间的秒数（正数=未来 N 秒，0=现在生效）
                     *  通过 sign options 的 notBefore 字段设置（jsonwebtoken 会自动写入 nbf） */
                    nbfInFuture?: number;
                    jti?: string;
                    sub?: string;
                    userType?: string;
                    tokenVersion?: number;
                    /** 故意改坏 1 个字节的签名（用于 signature invalid 测试） */
                    tamperSignature?: boolean;
                    /** 故意篡改 payload 后再签（用错误 secret 签，用于 tampering 测试） */
                    tamperPayloadWithBadSecret?: { secret: string; newSub: string };
                } = {},
            ) {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
                const secret = 'test-secret-key-for-testing-only';
                const now = Math.floor(Date.now() / 1000);

                const payload: Record<string, unknown> = {
                    sub: opts.sub ?? 'acc-1',
                    userType: opts.userType ?? 'admin',
                    tokenVersion: opts.tokenVersion ?? 0,
                    jti: opts.jti ?? crypto.randomUUID(),
                };

                // exp 直接放进 payload（jsonwebtoken 会保留）
                if (opts.expInPast !== undefined) {
                    payload.exp = now - opts.expInPast;
                } else {
                    // 默认 900s 后过期（与 issueTokens 一致）
                    payload.exp = now + 900;
                }

                const signOpts: import('jsonwebtoken').SignOptions = {
                    algorithm: 'HS256',
                    issuer: 'mono',
                    audience: 'mono-app',
                };

                // nbf 用 sign options 的 notBefore 字段（jsonwebtoken 会自动计算 nbf = now + notBefore）
                // opts.nbfInFuture 表示"nbf 是 X 秒后的时刻"
                if (opts.nbfInFuture !== undefined) {
                    signOpts.notBefore = opts.nbfInFuture;
                }

                let token: string;
                if (opts.tamperPayloadWithBadSecret) {
                    // 用错误 secret 签发，但 sub 改成新值
                    const badPayload = { ...payload, sub: opts.tamperPayloadWithBadSecret.newSub };
                    token = jwt.sign(badPayload, opts.tamperPayloadWithBadSecret.secret, signOpts);
                } else {
                    token = jwt.sign(payload, secret, signOpts);
                }

                if (opts.tamperSignature) {
                    /**
                     * 改 1 字节的 signature
                     * - JWT 格式: header.payload.signature
                     * - signature 是 base64url，取最后一段改 1 字符
                     */
                    const parts = token.split('.');
                    const sig = parts[2]!;
                    // 替换最后 1 个字符（'A' → 'B'，确保还在 base64url 字符集内）
                    const newSig = sig.slice(0, -1) + (sig.slice(-1) === 'A' ? 'B' : 'A');
                    token = `${parts[0]}.${parts[1]}.${newSig}`;
                }

                return token;
            }

            // 用真实 JwtService 替换 mock（仅本 describe 用）
            // 必须用 beforeEach：外层 describe 的 beforeEach 每次会创建新 service 实例
            // 用 beforeAll 会被外层覆盖
            beforeEach(() => {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { JwtService } = require('@nestjs/jwt') as typeof import('@nestjs/jwt');
                const realJwt = new JwtService({
                    secret: 'test-secret-key-for-testing-only',
                    signOptions: { algorithm: 'HS256' },
                });
                // 替换 service.jwtService 为真实 JWT
                (service as unknown as { jwtService: typeof realJwt }).jwtService = realJwt;
            });

            it('边界 1：30s clock skew — nbf 在未来 25s（容差内）应接受', async () => {
                // nbf = now + 25（25s 后才生效），clockTolerance=30 → 应被接受
                // 注：jsonwebtoken 的 clockTolerance 对 nbf 的语义是"允许 nbf 在未来 30s 内"
                //   - 防止客户端/服务器时钟略快导致 token 看起来"未到生效时间"
                const token = signTestJwt({ nbfInFuture: 25 });
                mockTokenBlacklist.isRevoked.mockResolvedValue(false);
                mockTokenBlacklist.tryClaimRefreshSlot.mockResolvedValue(true);
                mockPrismaClient.client.account.findUnique.mockResolvedValue({ tokenVersion: 0 });

                const result = await service.refresh(token);

                expect(result.accessToken).toBeDefined();
                expect(result.refreshToken).toBeDefined();
            });

            it('边界 1 反例：clock skew 超出 30s（nbf 未来 60s）应拒绝', async () => {
                // nbf = now + 60（60s 后才生效），clockTolerance=30 → 应被拒绝
                const token = signTestJwt({ nbfInFuture: 60 });

                await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
            });

            it('边界 2：exp 边缘 — 过期 60s（远大于 30s 容差）应拒绝', async () => {
                // expInPast=60 超过 30s clockTolerance，必定拒绝
                const token = signTestJwt({ expInPast: 60 });

                await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
            });

            it('边界 2 补充：exp 在容差内（expInPast=10）应接受（验证 clock tolerance 对 exp 生效）', async () => {
                // expInPast=10 在 30s clockTolerance 内，应被接受
                const token = signTestJwt({ expInPast: 10 });
                mockTokenBlacklist.isRevoked.mockResolvedValue(false);
                mockTokenBlacklist.tryClaimRefreshSlot.mockResolvedValue(true);
                mockPrismaClient.client.account.findUnique.mockResolvedValue({ tokenVersion: 0 });

                const result = await service.refresh(token);

                expect(result.accessToken).toBeDefined();
            });

            it('边界 3：jti 重复 — jti 已被撤销（isRevoked=true）应拒绝', async () => {
                const jti = 'revoked-jti-123';
                const token = signTestJwt({ jti });
                mockTokenBlacklist.isRevoked.mockResolvedValue(true); // 模拟 jti 在黑名单

                await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
                /** 关键：不应进入 CAS 流程 */
                expect(mockTokenBlacklist.tryClaimRefreshSlot).not.toHaveBeenCalled();
            });

            it('边界 4：payload tampering — sub 改值（用错误 secret 签）签名失败', async () => {
                // 用错误 secret 签发 + sub 改成 acc-2（攻击者想冒充 acc-2）
                const token = signTestJwt({
                    tamperPayloadWithBadSecret: { secret: 'WRONG-SECRET', newSub: 'acc-2' },
                });

                await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
            });

            it('边界 5：signature invalid — 改 1 字节签名，签名失败', async () => {
                const token = signTestJwt({ tamperSignature: true });

                await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
            });

            it('边界 6：跨 family reuse — CAS 失败触发 reuse detection', async () => {
                /**
                 * 场景说明：
                 * - familyA 的 jti 已被并发刷新时标记为 USED
                 * - 攻击者拿到 familyA 的旧 token，再用 familyB 的 jti 走 refresh
                 * - 但实际上，CAS 是基于 oldJti → 标记为 USED
                 *   - 所以正确实现：CAS 失败 → 20005
                 *   - 我们的实现是：mock tryClaimRefreshSlot 返回 false（模拟 CAS 失败）
                 *   - → 触发 reuse detection（清该用户所有 refresh token + 抛 20005）
                 *
                 * 简化测试：直接模拟 CAS 失败，验证清 cache + 抛 20005 的行为
                 */
                const token = signTestJwt({ jti: 'familyA-jti' });
                mockTokenBlacklist.isRevoked.mockResolvedValue(false);
                mockTokenBlacklist.tryClaimRefreshSlot.mockResolvedValue(false); // CAS 失败

                await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);

                /** Reuse detection 兜底：清该用户所有 refresh token + 权限缓存 */
                expect(mockCache.delByPattern).toHaveBeenCalledWith(expect.stringContaining('mono:refresh:used:acc-1'));
                expect(mockCache.del).toHaveBeenCalledWith(expect.stringContaining('mono:refresh:family:acc-1'));
                expect(mockCache.del).toHaveBeenCalledWith(expect.stringContaining('mono:auth:acc-1'));
            });
        });
    });
});
