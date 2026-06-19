/**
 * OAuth 一次性消费 & bind 流程测试
 *
 * 设计目的：
 * - Task 3.3 要求的"oauth.resolver.spec.ts 或 oauth.service.spec.ts"主目标场景：
 *   - state 一次性消费：第一次消费成功，第二次消费失败
 *   - 重复消费拒绝：state 已用 → 抛错
 *   - bind 流程：成功绑定 + 已被其他账户占用 + 当前账户已绑定
 * - 现有 oauth.service.spec.ts 已覆盖完整方法集；本文件作为"流程视角"的补充，
 *   用更接近用户的语言（按业务动作组织 it 块）描述同一组保证。
 *
 * 覆盖场景：
 * - state 生成后第一次 verifyState 返回 redirectUri
 * - 同一 state 第二次 verifyState 抛 40002（一次性消费）
 * - bindOAuth 成功路径
 * - bindOAuth 已被其他账户占用抛 40003
 * - bindOAuth 当前账户已绑定抛 40004
 *
 * 注意：项目实际 oauth 模块位于 src/common/oauth/，非 src/modules/oauth/；
 *      实际 API 为 OAuthService.verifyState / bindOAuth，故按真实 API 编写。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OAuthService } from '../oauth.service.js';
import { WechatWebProvider } from '../providers/wechat-web.provider.js';
import { WechatMiniprogramProvider } from '../providers/wechat-miniprogram.provider.js';
import { AppleProvider } from '../providers/apple.provider.js';
import { ERROR_CODES } from '../../errors/error-codes.js';

/**
 * 内存 Mock cache（模拟 Redis 行为）
 * - 用 Map 存储 key/value
 * - get 返回字符串（与生产 ICacheService.get<T> 行为一致）
 */
function createMockCache() {
    const store = new Map<string, string>();
    return {
        get: vi.fn().mockImplementation(async (key: string) => store.get(key) ?? null),
        setex: vi.fn().mockImplementation(async (key: string, _ttl: number, value: string) => {
            store.set(key, value);
        }),
        del: vi.fn().mockImplementation(async (key: string) => {
            store.delete(key);
        }),
    };
}

/**
 * Mock Prisma client（模拟 accountIdentity 表的增删查）
 * - findFirst: 支持 identityType / identifier / accountId / NOT.accountId 过滤
 * - findMany: 支持 accountId 过滤
 * - create: 推入 identities 数组并返回新记录
 * - delete: 按 id 删除
 */
function createMockPrisma() {
    const identities: any[] = [];
    return {
        client: {
            accountIdentity: {
                findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
                    return (
                        identities.find((i) => {
                            if (where.identityType && i.identityType !== where.identityType) return false;
                            if (where.identifier && i.identifier !== where.identifier) return false;
                            if (where.accountId !== undefined && i.accountId !== where.accountId) return false;
                            if (where.NOT?.accountId !== undefined && i.accountId === where.NOT.accountId) {
                                return false;
                            }
                            return true;
                        }) ?? null
                    );
                }),
                findMany: vi.fn().mockImplementation(async ({ where }: any) => {
                    return identities.filter((i) => where.accountId === undefined || i.accountId === where.accountId);
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

/** Mock AccountService（createMemberAccount 用于自动注册新账户） */
function createMockAccountService() {
    return {
        createMemberAccount: vi.fn().mockImplementation(async (id: string, nick?: string) => {
            return { id: `acc-${id}`, nickname: nick ?? null };
        }),
    };
}

/** Mock ConfigService（redirectUri 白名单 → localhost） */
function createMockConfig() {
    return {
        get: vi.fn().mockReturnValue('localhost'),
    };
}

describe('OAuth 一次性消费 & bind 流程', () => {
    let service: OAuthService;
    let mockCache: ReturnType<typeof createMockCache>;
    let mockPrisma: ReturnType<typeof createMockPrisma>;
    let mockAccount: ReturnType<typeof createMockAccountService>;

    beforeEach(() => {
        mockCache = createMockCache();
        mockPrisma = createMockPrisma();
        mockAccount = createMockAccountService();
        const mockConfig = createMockConfig();

        // 三个 provider 用真实实例（其方法在测 OAuth 流程时不会被触发）
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

    // ── state 一次性消费 ──

    describe('state 一次性消费', () => {
        const TEST_REDIRECT = 'http://localhost:5173/member/auth/callback';

        it('第一次消费 state 应成功并返回 redirectUri', async () => {
            // 生成 state
            const state = await service.generateState('wechat-web', TEST_REDIRECT);
            expect(state).toHaveLength(64); // 32 字节 hex = 64 字符

            // 第一次 verifyState 成功
            const result = await service.verifyState(state, 'wechat-web');
            expect(result.redirectUri).toBe(TEST_REDIRECT);
        });

        it('第二次消费同一 state 应抛 40002（拒绝重放）', async () => {
            const state = await service.generateState('wechat-web', TEST_REDIRECT);

            // 第一次消费
            await service.verifyState(state, 'wechat-web');

            // 关键断言：第二次必须拒绝
            await expect(service.verifyState(state, 'wechat-web')).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_STATE_INVALID },
            });
        });

        it('从未生成过的 state 应直接抛 40002（拒绝伪造）', async () => {
            // 没有调过 generateState，直接 verifyState
            await expect(service.verifyState('totally-fake-state', 'wechat-web')).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_STATE_INVALID },
            });
        });
    });

    // ── bind 流程 ──

    describe('bindOAuth 流程', () => {
        it('openid 空闲 + 当前账户未绑定时应成功创建 identity', async () => {
            const result = await service.bindOAuth('acc-1', 'wechat-web', { openId: 'wx-new' });

            // 关键断言：返回 success + identityId，且 prisma 收到 1 条新记录
            expect(result.success).toBe(true);
            expect(result.identityId).toBeTruthy();
            expect(mockPrisma._identities).toHaveLength(1);
            expect(mockPrisma._identities[0]).toMatchObject({
                accountId: 'acc-1',
                identityType: 'wechat-web',
                identifier: 'wx-new',
                verified: true,
            });
        });

        it('openid 已被其他账户绑定时应抛 40003（bind 冲突）', async () => {
            // 预置：其他账户已占用了这个 openid
            mockPrisma._identities.push({
                id: 'id-existing',
                accountId: 'acc-other',
                identityType: 'wechat-web',
                identifier: 'wx-taken',
            });

            // acc-1 想绑定同一个 openid → 拒绝
            await expect(service.bindOAuth('acc-1', 'wechat-web', { openId: 'wx-taken' })).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_BIND_CONFLICT },
            });
            // 关键断言：不能新增任何 identity
            expect(mockPrisma._identities).toHaveLength(1);
        });

        it('当前账户已绑定该 provider 时应抛 40004（重复 bind）', async () => {
            // 预置：acc-1 已绑定 wechat-web
            mockPrisma._identities.push({
                id: 'id-self',
                accountId: 'acc-1',
                identityType: 'wechat-web',
                identifier: 'wx-self',
            });

            // acc-1 再次绑定 wechat-web → 拒绝
            await expect(service.bindOAuth('acc-1', 'wechat-web', { openId: 'wx-other' })).rejects.toMatchObject({
                response: { code: ERROR_CODES.OAUTH_ALREADY_BOUND },
            });
            // 关键断言：identity 数量不变
            expect(mockPrisma._identities).toHaveLength(1);
        });
    });
});
