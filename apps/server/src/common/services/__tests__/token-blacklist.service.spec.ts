/**
 * TokenBlacklistService 单元测试
 *
 * 覆盖场景：
 * 1. revokeAccountTokens → 自增 tokenVersion + 清 Redis（不再写 token_revocation 表）
 * 2. revokeAccountTokens → tokenVersion 自增失败时抛 InternalServerErrorException
 * 3. tryClaimRefreshSlot → Lua CAS 成功（第一次）
 * 4. tryClaimRefreshSlot → Lua CAS 失败（第二次，oldKey 已被标记为 used）
 * 5. tryClaimRefreshSlot → Redis 故障时降级（返回 true + warn）
 * 6. isRevoked → 缓存命中返回 true
 * 7. isRevoked → 缓存 miss → 查 DB 命中 → 写回缓存
 * 8. isRevoked → 缓存 miss → 查 DB miss → 返回 false
 * 9. isRevoked → DB 失败时降级（返回 false + warn）
 * 10. isRevoked → 防回归：query 必须按 accountId 过滤
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TokenBlacklistService } from '../token-blacklist.service.js';
import { RedisDegradationService } from '../redis-degradation.service.js';

// Mock 依赖
const mockCacheService = {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    delByPattern: vi.fn(),
    evalLua: vi.fn(),
};

const mockPrisma = {
    client: {
        tokenRevocation: {
            create: vi.fn(),
            findFirst: vi.fn(),
        },
        account: {
            update: vi.fn(),
            findUnique: vi.fn(),
        },
    },
};

/**
 * RedisDegradationService mock
 * - 默认透传 op 结果（不模拟故障）
 * - 单独测试里可以 override
 */
const mockRedisDegradation = {
    safeGet: vi.fn().mockImplementation(async (_key: string, fallback: any) => fallback),
    tryWithFallback: vi.fn().mockImplementation(async (op: () => Promise<any>, _fb: () => Promise<any>) => op()),
};

describe('TokenBlacklistService', () => {
    let service: TokenBlacklistService;

    beforeEach(() => {
        vi.clearAllMocks();
        /** 重置 mock 默认实现（每次测试重置） */
        (mockRedisDegradation.safeGet as Mock).mockImplementation(async (_key: string, fallback: any) => fallback);
        (mockRedisDegradation.tryWithFallback as Mock).mockImplementation(
            async (op: () => Promise<any>, _fb: () => Promise<any>) => op(),
        );
        service = new TokenBlacklistService(
            mockCacheService as never,
            mockPrisma as never,
            mockRedisDegradation as never,
        );
    });

    describe('revokeAccountTokens', () => {
        it('应自增 tokenVersion + 清 Redis（不再写 token_revocation 表）', async () => {
            mockPrisma.client.account.update.mockResolvedValue({ id: 'acc-1', tokenVersion: 1 });
            mockCacheService.delByPattern.mockResolvedValue(undefined);
            mockCacheService.del.mockResolvedValue(undefined);

            await service.revokeAccountTokens('acc-1', 'password_reset');

            /**
             * 防回归：不要写 token_revocation 表
             * - 旧实现写 `jti='*'` 行会导致登出/重置密码后无法再登录
             *   （新 jti 也会被 `*` 行匹配 → 20003）
             * - 账户级撤销的真正机制是 tokenVersion 自增
             */
            expect(mockPrisma.client.tokenRevocation.create).not.toHaveBeenCalled();

            /** 自增 tokenVersion */
            expect(mockPrisma.client.account.update).toHaveBeenCalledWith({
                where: { id: 'acc-1' },
                data: { tokenVersion: { increment: 1 } },
            });

            /** 清 Redis */
            expect(mockCacheService.delByPattern).toHaveBeenCalled();
            expect(mockCacheService.del).toHaveBeenCalled();
        });

        it('tokenVersion 自增失败时抛 InternalServerErrorException（不继续返回 true）', async () => {
            mockPrisma.client.account.update.mockRejectedValue(new Error('DB down'));
            mockCacheService.delByPattern.mockResolvedValue(undefined);
            mockCacheService.del.mockResolvedValue(undefined);

            await expect(service.revokeAccountTokens('acc-1', 'password_reset')).rejects.toThrow('撤销 token 失败');
        });
    });

    describe('tryClaimRefreshSlot', () => {
        it('第一次调用 → Lua 返回 1 → 返回 true', async () => {
            mockCacheService.evalLua.mockResolvedValue(1);

            const result = await service.tryClaimRefreshSlot('old-jti-1', 'new-jti-1', 900);

            expect(result).toBe(true);
            expect(mockCacheService.evalLua).toHaveBeenCalled();
        });

        it('第二次调用同一 oldJti → Lua 返回 0 → 返回 false', async () => {
            mockCacheService.evalLua.mockResolvedValue(0);

            const result = await service.tryClaimRefreshSlot('old-jti-1', 'new-jti-2', 900);

            expect(result).toBe(false);
        });

        it('evalLua 抛错 → 降级返回 true + warn', async () => {
            mockCacheService.evalLua.mockRejectedValue(new Error('Redis disconnected'));

            const result = await service.tryClaimRefreshSlot('old-jti-1', 'new-jti-1', 900);

            /** 降级为放行（fail-open） */
            expect(result).toBe(true);
        });
    });

    describe('isRevoked', () => {
        it('缓存命中 → 返回 true，不查 DB', async () => {
            (mockRedisDegradation.safeGet as Mock).mockResolvedValue('1');

            const result = await service.isRevoked('jti-1', 'acc-1');

            expect(result).toBe(true);
            expect(mockPrisma.client.tokenRevocation.findFirst).not.toHaveBeenCalled();
        });

        it('缓存 miss + DB 命中 → 返回 true + 写回缓存', async () => {
            (mockRedisDegradation.safeGet as Mock).mockResolvedValue(null);
            mockPrisma.client.tokenRevocation.findFirst.mockResolvedValue({ id: 'rev-1' });
            mockCacheService.setex.mockResolvedValue(undefined);

            const result = await service.isRevoked('jti-1', 'acc-1');

            expect(result).toBe(true);
            expect(mockPrisma.client.tokenRevocation.findFirst).toHaveBeenCalled();
            /**
             * 防回归：query 必须带 accountId 过滤，
             * 否则 jti='*' 会误伤其他账号（详见 isRevoked 实现注释）
             */
            expect(mockPrisma.client.tokenRevocation.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        accountId: 'acc-1',
                    }),
                }),
            );
            /** 写回缓存（短期 O(1) 命中） */
            expect(mockCacheService.setex).toHaveBeenCalled();
        });

        it('缓存 miss + DB miss → 返回 false', async () => {
            (mockRedisDegradation.safeGet as Mock).mockResolvedValue(null);
            mockPrisma.client.tokenRevocation.findFirst.mockResolvedValue(null);

            const result = await service.isRevoked('jti-1', 'acc-1');

            expect(result).toBe(false);
        });

        it('缓存 miss + DB 抛错 → 降级返回 false', async () => {
            (mockRedisDegradation.safeGet as Mock).mockResolvedValue(null);
            mockPrisma.client.tokenRevocation.findFirst.mockRejectedValue(new Error('DB timeout'));

            const result = await service.isRevoked('jti-1', 'acc-1');

            /** fail-open：DB 失败视为未撤销 */
            expect(result).toBe(false);
        });
    });
});
