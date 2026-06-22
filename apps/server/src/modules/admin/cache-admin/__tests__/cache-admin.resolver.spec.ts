/**
 * CacheAdminResolver 单元测试
 *
 * 覆盖场景：
 * - Query: cacheKeys / cacheKeyTotal / cacheKey / cacheStats 透传 service
 * - Mutation: deleteCacheKey / deleteCacheKeys / clearCacheByPattern
 * - clearCacheByPattern 安全校验：拒绝只含通配符 / 以 * 开头的 pattern
 * - deleteCacheKeys 批量上限保护（> 1000 拒绝）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphQLError } from 'graphql';
import { CacheAdminResolver } from '../cache-admin.resolver.js';

function createMockService(): any {
    return {
        listKeys: vi.fn(),
        getValue: vi.fn(),
        deleteOne: vi.fn(),
        deleteMany: vi.fn(),
        deleteByPattern: vi.fn(),
        getStats: vi.fn(),
    };
}

describe('CacheAdminResolver', () => {
    let resolver: CacheAdminResolver;
    let service: ReturnType<typeof createMockService>;

    beforeEach(() => {
        service = createMockService();
        resolver = new CacheAdminResolver(service as any);
    });

    // ─────────────────────────────────────────
    // Query
    // ─────────────────────────────────────────
    describe('cacheKeys', () => {
        it('应透传 pattern/offset/limit 到 service.listKeys', async () => {
            service.listKeys.mockResolvedValue({ items: [{ key: 'a' }], total: 1 });
            const result = await resolver.cacheKeys('mono:*', 0, 50);
            expect(service.listKeys).toHaveBeenCalledWith('mono:*', 0, 50);
            expect(result).toEqual([{ key: 'a' }]);
        });
    });

    describe('cacheKeyTotal', () => {
        it('应只取 total 字段（items 用 limit=1 减少开销）', async () => {
            service.listKeys.mockResolvedValue({ items: [], total: 42 });
            const total = await resolver.cacheKeyTotal('mono:*');
            expect(total).toBe(42);
            // 验证传 limit=1（减少数据回传）
            expect(service.listKeys).toHaveBeenCalledWith('mono:*', 0, 1);
        });
    });

    describe('cacheKey', () => {
        it('应透传 key 到 service.getValue', async () => {
            service.getValue.mockResolvedValue({ key: 'k1', value: 'v1' });
            const result = await resolver.cacheKey('k1');
            expect(service.getValue).toHaveBeenCalledWith('k1');
            expect(result).toEqual({ key: 'k1', value: 'v1' });
        });
    });

    describe('cacheStats', () => {
        it('应透传到底层 service.getStats', async () => {
            service.getStats.mockResolvedValue({ usedMemory: '1 MB', hitRate: '80%', uptime: '1h' });
            const result = await resolver.cacheStats();
            expect(result).toEqual({ usedMemory: '1 MB', hitRate: '80%', uptime: '1h' });
        });
    });

    // ─────────────────────────────────────────
    // Mutation
    // ─────────────────────────────────────────
    describe('deleteCacheKey', () => {
        it('已存在时返回 true', async () => {
            service.deleteOne.mockResolvedValue(true);
            const result = await resolver.deleteCacheKey('k1');
            expect(result).toBe(true);
            expect(service.deleteOne).toHaveBeenCalledWith('k1');
        });

        it('不存在时返回 false', async () => {
            service.deleteOne.mockResolvedValue(false);
            const result = await resolver.deleteCacheKey('not:exists');
            expect(result).toBe(false);
        });
    });

    describe('deleteCacheKeys', () => {
        it('应透传 keys 到 service.deleteMany', async () => {
            service.deleteMany.mockResolvedValue({ deletedCount: 2, keys: ['a', 'b'] });
            const result = await resolver.deleteCacheKeys(['a', 'b', 'c']);
            expect(service.deleteMany).toHaveBeenCalledWith(['a', 'b', 'c']);
            expect(result).toEqual({ deletedCount: 2, keys: ['a', 'b'] });
        });

        it('超过 1000 条应抛错', async () => {
            const keys = Array.from({ length: 1001 }, (_, i) => `k${i}`);
            await expect(resolver.deleteCacheKeys(keys)).rejects.toThrow(GraphQLError);
            expect(service.deleteMany).not.toHaveBeenCalled();
        });

        it('恰好 1000 条应通过', async () => {
            service.deleteMany.mockResolvedValue({ deletedCount: 0, keys: [] });
            const keys = Array.from({ length: 1000 }, (_, i) => `k${i}`);
            await expect(resolver.deleteCacheKeys(keys)).resolves.toBeDefined();
        });
    });

    describe('clearCacheByPattern', () => {
        it('正常 pattern 应调用 service.deleteByPattern', async () => {
            service.deleteByPattern.mockResolvedValue({ deletedCount: 5 });
            const result = await resolver.clearCacheByPattern('mono:auth:*');
            expect(service.deleteByPattern).toHaveBeenCalledWith('mono:auth:*');
            expect(result).toBe(5);
        });

        it('pattern = "*" 应被拒绝（只含通配符）', async () => {
            await expect(resolver.clearCacheByPattern('*')).rejects.toThrow(GraphQLError);
            expect(service.deleteByPattern).not.toHaveBeenCalled();
        });

        it('pattern = "?" 应被拒绝（只含通配符）', async () => {
            await expect(resolver.clearCacheByPattern('?')).rejects.toThrow(GraphQLError);
        });

        it('pattern = "*:login:*" 应被拒绝（以 * 开头）', async () => {
            await expect(resolver.clearCacheByPattern('*:login:*')).rejects.toThrow(GraphQLError);
        });

        it('空 pattern 应被拒绝', async () => {
            await expect(resolver.clearCacheByPattern('')).rejects.toThrow(GraphQLError);
            await expect(resolver.clearCacheByPattern('   ')).rejects.toThrow(GraphQLError);
        });

        it('合法 pattern 应通过（含通配符但有具体前缀）', async () => {
            service.deleteByPattern.mockResolvedValue({ deletedCount: 0 });
            await expect(resolver.clearCacheByPattern('mono:auth:login:*')).resolves.toBe(0);
            await expect(resolver.clearCacheByPattern('mono:user:1')).resolves.toBe(0);
        });
    });
});
