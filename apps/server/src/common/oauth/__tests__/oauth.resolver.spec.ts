/**
 * OAuth state 消费解析测试
 *
 * 用途：
 * - 任务 3 要求 "oauth.resolver.spec.ts" 或等价文件，用于验证 OAuth state
 *   一次性消费 + 异常拒绝两条核心路径
 * - 项目实际 OAuth 模块位于 src/common/oauth/，没有独立的 "Resolver" 类，
 *   state 消费逻辑在 OAuthService.verifyState 内实现；本 spec 直接覆盖该方法
 *
 * 覆盖场景（用户最低要求 2 case）：
 * - 正常路径：第一次 verifyState 成功，返回 redirectUri
 * - 一次性消费：第二次消费同一 state 必须抛 40002（防重放）
 * - 异常拒绝：从未生成过的 state 抛 40002（拒绝伪造）
 *
 * 中文注释：项目用户为新手，按规则统一中文注释
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OAuthService } from '../oauth.service.js';
import { WechatWebProvider } from '../providers/wechat-web.provider.js';
import { WechatMiniprogramProvider } from '../providers/wechat-miniprogram.provider.js';
import { AppleProvider } from '../providers/apple.provider.js';
import { ERROR_CODES } from '../../errors/error-codes.js';

/**
 * 构造一个内存版 Cache mock
 * - 用 Map 模拟 Redis 行为
 * - 暴露 get/setex/del 三个方法，覆盖 verifyState / generateState 全部调用
 */
function createMockCache() {
    // 用 Map 作为 key-value 存储
    const store = new Map<string, string>();
    return {
        get: vi.fn().mockImplementation(async (key: string) => store.get(key) ?? null),
        setex: vi.fn().mockImplementation(async (key: string, _ttl: number, value: string) => {
            // 写入 Map
            store.set(key, value);
        }),
        del: vi.fn().mockImplementation(async (key: string) => {
            // 删除 key
            store.delete(key);
        }),
    };
}

/**
 * 构造一个最简 Prisma mock
 * - 本测试只关心 state 消费链路，不触达 accountIdentity 表
 * - 提供空壳 client.accountIdentity.* 方法即可（即使不被调用，类型上也要存在）
 */
function createMockPrisma() {
    return {
        client: {
            accountIdentity: {
                findFirst: vi.fn(),
                findMany: vi.fn(),
                create: vi.fn(),
                delete: vi.fn(),
            },
        },
    };
}

/** 构造 AccountService mock（verifyState 流程不调用，留空即可） */
function createMockAccountService() {
    return {
        createMemberAccount: vi.fn(),
    };
}

/** 构造 ConfigService mock：redirectUri 白名单只允许 localhost */
function createMockConfig() {
    return {
        get: vi.fn().mockReturnValue('localhost'),
    };
}

describe('OAuth state 消费解析（resolver 视角）', () => {
    // 共享变量
    let service: OAuthService;
    let mockCache: ReturnType<typeof createMockCache>;

    // 测试用合法的 redirectUri（命中白名单 localhost）
    const TEST_REDIRECT = 'http://localhost:5173/member/auth/callback';

    beforeEach(() => {
        // 每个测试前重置 mock，避免上一个测试的状态泄漏
        mockCache = createMockCache();
        const mockPrisma = createMockPrisma();
        const mockAccount = createMockAccountService();
        const mockConfig = createMockConfig();

        /**
         * 三个 Provider 用真实实例（其方法在测 state 流程时不会被触发）
         * - WechatWebProvider / AppleProvider 需要 ConfigService（传 { get: () => undefined } 即可）
         * - WechatMiniprogramProvider 无需构造参数
         */
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

    // ── Case 1: state 一次性消费 ──

    it('state 一次性消费：第一次成功，第二次必须抛 40002', async () => {
        // 1. 生成 state（内部会写 Redis）
        const state = await service.generateState('wechat-web', TEST_REDIRECT);
        // 关键断言：state 长度 64 字符（32 字节 hex）
        expect(state).toHaveLength(64);

        // 2. 第一次 verifyState 应成功，返回原 redirectUri
        const first = await service.verifyState(state, 'wechat-web');
        expect(first.redirectUri).toBe(TEST_REDIRECT);

        // 3. 关键断言：第二次消费同一 state 必须拒绝（防重放）
        await expect(service.verifyState(state, 'wechat-web')).rejects.toMatchObject({
            // 抛 BadRequestException 包装的 40002
            response: { code: ERROR_CODES.OAUTH_STATE_INVALID },
        });

        // 4. 进一步断言：第二次确实又调了 cache.get（即再查一次 Redis）
        //    查不到 null → 进入"state 无效"分支 → 抛 40002
        expect(mockCache.get).toHaveBeenCalledTimes(2);
    });

    // ── Case 2: 异常 state 拒绝 ──

    it('异常 state 拒绝：从未生成过的 state 应直接抛 40002', async () => {
        // 没有调过 generateState，直接拿一个伪造的 state 去 verify
        const fakeState = 'never-generated-fake-state-12345678';

        // 关键断言：必须抛 40002，不能成功
        await expect(service.verifyState(fakeState, 'wechat-web')).rejects.toMatchObject({
            response: { code: ERROR_CODES.OAUTH_STATE_INVALID },
        });

        // 补充断言：cache.del 不应被调用（没有 key 可删）
        expect(mockCache.del).not.toHaveBeenCalled();
    });

    // ── Case 3 (补充): provider 不匹配也应拒绝 ──

    it('provider 不匹配：用 wechat-web 生成的 state 不能用 apple 消费', async () => {
        // 用 wechat-web 生成 state
        const state = await service.generateState('wechat-web', TEST_REDIRECT);

        // 用 apple 去消费 → provider 不匹配 → 抛 40002
        await expect(service.verifyState(state, 'apple')).rejects.toMatchObject({
            response: { code: ERROR_CODES.OAUTH_STATE_INVALID },
        });
    });
});
