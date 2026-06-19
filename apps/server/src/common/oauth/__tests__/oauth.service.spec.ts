/**
 * OAuthService 单元测试
 *
 * 覆盖场景：
 * - state 校验：生成 / 一次性消费 / 过期
 * - bindOAuth：成功 / 已被其他账户占用 (40003) / 已绑定当前账户 (40004)
 * - unbindOAuth：成功 / 仅剩一个 identity 不能解绑 (40005) / 未绑定该 provider
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OAuthService } from '../oauth.service.js';
import { WechatWebProvider } from '../providers/wechat-web.provider.js';
import { WechatMiniprogramProvider } from '../providers/wechat-miniprogram.provider.js';
import { AppleProvider } from '../providers/apple.provider.js';
import { ERROR_CODES } from '../../errors/error-codes.js';

/** 内存 Mock cache */
function createMockCache() {
    const store = new Map<string, string>();
    return {
        get: vi.fn().mockImplementation(async (key: string) => store.get(key) ?? null),
        setex: vi.fn().mockImplementation(async (key: string, ttl: number, value: string) => {
            store.set(key, value);
        }),
        del: vi.fn().mockImplementation(async (key: string) => {
            store.delete(key);
        }),
        exists: vi.fn().mockImplementation(async (key: string) => store.has(key)),
    };
}

/** mock Prisma */
function createMockPrisma() {
    const identities: any[] = [];
    return {
        client: {
            accountIdentity: {
                findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
                    /**
                     * 模拟 Prisma 的 findFirst：
                     * - 支持 identityType / identifier / accountId 过滤
                     * - 支持 NOT.accountId（排除当前账户）
                     */
                    return (
                        identities.find((i) => {
                            if (where.identityType && i.identityType !== where.identityType) return false;
                            if (where.identifier && i.identifier !== where.identifier) return false;
                            if (where.accountId !== undefined && i.accountId !== where.accountId) return false;
                            if (where.NOT?.accountId !== undefined && i.accountId === where.NOT.accountId) return false;
                            return true;
                        }) ?? null
                    );
                }),
                findMany: vi.fn().mockImplementation(async ({ where, select }: any) => {
                    const filtered = identities.filter(
                        (i) => where.accountId === undefined || i.accountId === where.accountId,
                    );
                    return select ? filtered.map((i) => ({ id: i.id, identityType: i.identityType })) : filtered;
                }),
                create: vi.fn().mockImplementation(async ({ data }: any) => {
                    const id = `id-${identities.length + 1}`;
                    identities.push({ id, ...data });
                    return identities[identities.length - 1];
                }),
                delete: vi.fn().mockImplementation(async ({ where }: any) => {
                    const idx = identities.findIndex((i) => i.id === where.id);
                    if (idx >= 0) identities.splice(idx, 1);
                }),
            },
        },
        _identities: identities,
    };
}

/** mock AccountService */
function createMockAccountService() {
    return {
        createMemberAccount: vi.fn().mockImplementation(async (id: string, nick?: string) => {
            return { id: `acc-${id}`, nickname: nick ?? null };
        }),
    };
}

describe('OAuthService', () => {
    let service: OAuthService;
    let mockCache: ReturnType<typeof createMockCache>;
    let mockPrisma: ReturnType<typeof createMockPrisma>;
    let mockAccount: ReturnType<typeof createMockAccountService>;

    /** mock ConfigService（redirectUri 白名单） */
    function createMockConfig() {
        return {
            get: vi.fn().mockReturnValue('localhost'),
        };
    }

    beforeEach(() => {
        mockCache = createMockCache();
        mockPrisma = createMockPrisma();
        mockAccount = createMockAccountService();
        const mockConfig = createMockConfig();
        const wechatWeb = new WechatWebProvider({ get: () => undefined } as any);
        const wechatMp = new WechatMiniprogramProvider();
        const apple = new AppleProvider({ get: () => undefined } as any);
        service = new OAuthService(
            mockCache as any,
            mockPrisma as any,
            mockAccount as any,
            mockConfig as any,
            wechatWeb,
            wechatMp,
            apple,
        );
    });

    // ── state 校验 ──

    describe('generateState / verifyState', () => {
        const TEST_REDIRECT = 'http://localhost:5173/member/auth/callback';

        it('生成的 state 应能通过 verifyState（一次性消费，provider + redirectUri 绑定）', async () => {
            const state = await service.generateState('wechat-web', TEST_REDIRECT);
            expect(state).toHaveLength(64); // 32 字节 hex = 64 字符
            // 第一次 verifyState 应通过，返回 redirectUri
            const result = await service.verifyState(state, 'wechat-web');
            expect(result.redirectUri).toBe(TEST_REDIRECT);
            // 第二次 verifyState 应失败（一次性消费）
            await expect(service.verifyState(state, 'wechat-web')).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_STATE_INVALID },
            });
        });

        it('不存在的 state 应抛 40002', async () => {
            await expect(service.verifyState('non-existent-state', 'wechat-web')).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_STATE_INVALID },
            });
        });

        it('provider 不匹配应抛 40002', async () => {
            const state = await service.generateState('wechat-web', TEST_REDIRECT);
            await expect(service.verifyState(state, 'apple')).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_STATE_INVALID },
            });
        });

        it('redirectUri 不在白名单应抛 40002', async () => {
            await expect(service.generateState('wechat-web', 'https://evil.com/steal')).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_STATE_INVALID },
            });
        });
    });

    // ── findOrCreateByWechat ──

    describe('findOrCreateByWechat', () => {
        it('openid 已存在时直接返回现有账户', async () => {
            mockPrisma._identities.push({
                id: 'id-1',
                accountId: 'acc-existing',
                identityType: 'wechat-web',
                identifier: 'wx-open-1',
            });
            const result = await service.findOrCreateByWechat('wechat-web', {
                openId: 'wx-open-1',
                unionId: 'u-1',
            });
            expect(result.isNewUser).toBe(false);
            expect(result.accountId).toBe('acc-existing');
        });

        it('openid 不存在但 unionid 存在时返回 unionid 对应账户', async () => {
            mockPrisma._identities.push({
                id: 'id-1',
                accountId: 'acc-union',
                identityType: 'wechat-unionid',
                identifier: 'u-1',
            });
            const result = await service.findOrCreateByWechat('wechat-web', {
                openId: 'wx-open-new',
                unionId: 'u-1',
            });
            expect(result.isNewUser).toBe(false);
            expect(result.accountId).toBe('acc-union');
        });

        it('openid 和 unionid 都不存在时创建新账户', async () => {
            const result = await service.findOrCreateByWechat('wechat-web', {
                openId: 'wx-open-brand-new',
                unionId: 'u-new',
            });
            expect(result.isNewUser).toBe(true);
            expect(mockAccount.createMemberAccount).toHaveBeenCalled();
        });
    });

    // ── bindOAuth ──

    describe('bindOAuth', () => {
        it('成功绑定：openid 空闲 + 当前账户未绑定', async () => {
            const result = await service.bindOAuth('acc-1', 'wechat-web', {
                openId: 'wx-new-open',
            });
            expect(result.success).toBe(true);
            expect(mockPrisma._identities.length).toBe(1);
        });

        it('openid 已被其他账户占用应抛 40003', async () => {
            mockPrisma._identities.push({
                id: 'id-1',
                accountId: 'acc-other',
                identityType: 'wechat-web',
                identifier: 'wx-taken',
            });
            await expect(service.bindOAuth('acc-1', 'wechat-web', { openId: 'wx-taken' })).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_BIND_CONFLICT },
            });
        });

        it('当前账户已绑定该 provider 应抛 40004', async () => {
            mockPrisma._identities.push({
                id: 'id-1',
                accountId: 'acc-1',
                identityType: 'wechat-web',
                identifier: 'wx-self',
            });
            await expect(service.bindOAuth('acc-1', 'wechat-web', { openId: 'wx-self' })).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_ALREADY_BOUND },
            });
        });
    });

    // ── unbindOAuth ──

    describe('unbindOAuth', () => {
        it('账户只剩 1 个 identity 时不能解绑（40005）', async () => {
            mockPrisma._identities.push({
                id: 'id-1',
                accountId: 'acc-1',
                identityType: 'wechat-web',
                identifier: 'wx-only',
            });
            await expect(service.unbindOAuth('acc-1', 'wechat-web')).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_LAST_IDENTITY },
            });
        });

        it('账户有多个 identity 时可正常解绑', async () => {
            mockPrisma._identities.push(
                { id: 'id-1', accountId: 'acc-1', identityType: 'wechat-web', identifier: 'wx-1' },
                { id: 'id-2', accountId: 'acc-1', identityType: 'apple', identifier: 'apple-1' },
            );
            const result = await service.unbindOAuth('acc-1', 'wechat-web');
            expect(result.success).toBe(true);
            expect(mockPrisma._identities.length).toBe(1);
            expect(mockPrisma._identities[0].identityType).toBe('apple');
        });

        it('未绑定该 provider 时应抛 40009', async () => {
            mockPrisma._identities.push(
                { id: 'id-1', accountId: 'acc-1', identityType: 'wechat-web', identifier: 'wx-1' },
                { id: 'id-2', accountId: 'acc-1', identityType: 'apple', identifier: 'apple-1' },
            );
            await expect(service.unbindOAuth('acc-1', 'google')).rejects.toMatchObject({
                response: { code: 40009 },
            });
        });
    });
});
