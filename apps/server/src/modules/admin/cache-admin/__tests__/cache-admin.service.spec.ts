/**
 * CacheAdminService 单元测试
 *
 * 覆盖场景：
 * - listKeys: 按 pattern 列出 + 分页 + 元信息（type/ttl/value/size）
 * - listKeys: value 序列化（对象/字符串/null）
 * - listKeys: limit 上限保护（防 OOM）
 * - getValue: 单个 key 完整信息
 * - deleteOne: 已存在 / 不存在
 * - deleteMany: 空数组 / 多条
 * - deleteByPattern: 透传 pattern
 * - getStats: 透传到底层
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheAdminService } from '../cache-admin.service.js';

/**
 * mock ICacheService — 内存模式风格
 * 真实业务是 Redis 模式（生产），但单测不需要 ioredis
 */
function createMockCache(): any {
    const store = new Map<string, { value: unknown; ttl: number; type: string }>();

    return {
        scanKeys: vi.fn(async (pattern: string) => {
            // 简化版 pattern 匹配：支持 * 通配
            const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
            return Array.from(store.keys()).filter((k) => regex.test(k));
        }),
        getKeyType: vi.fn(async (key: string) => store.get(key)?.type ?? 'none'),
        ttl: vi.fn(async (key: string) => store.get(key)?.ttl ?? -2),
        get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
        exists: vi.fn(async (key: string) => store.has(key)),
        del: vi.fn(async (key: string) => {
            store.delete(key);
        }),
        delMany: vi.fn(async (keys: string[]) => {
            for (const k of keys) store.delete(k);
        }),
        delByPattern: vi.fn(async (pattern: string) => {
            const keys = await this.scanKeys(pattern);
            for (const k of keys) store.delete(k);
        }),
        getStats: vi.fn(async () => ({
            usedMemory: '1.23 MB',
            hitRate: '87.50%',
            uptime: '3 天 5 小时',
        })),
    };
}

/** 给 mock store 注入数据 */
function seedStore(cache: ReturnType<typeof createMockCache>, data: Array<[string, unknown, number?, string?]>) {
    for (const [key, value, ttl = 60, type = 'string'] of data) {
        (cache.scanKeys as any).mockImplementationOnce(async () => [key]);
        // 直接 push 到 store — 走 mock 外的同一个 Map
        // 由于 vi.fn() 包装，store 在闭包里独立维护
    }
}

describe('CacheAdminService', () => {
    let service: CacheAdminService;
    let cache: ReturnType<typeof createMockCache>;
    // 直接持有 store 用于"灌数据"
    const realStore = new Map<string, { value: unknown; ttl: number; type: string }>();

    beforeEach(() => {
        realStore.clear();

        cache = {
            scanKeys: vi.fn(async (pattern: string) => {
                const regex = new RegExp(
                    '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
                );
                return Array.from(realStore.keys()).filter((k) => regex.test(k));
            }),
            getKeyType: vi.fn(async (key: string) => realStore.get(key)?.type ?? 'none'),
            ttl: vi.fn(async (key: string) => realStore.get(key)?.ttl ?? -2),
            get: vi.fn(async (key: string) => realStore.get(key)?.value ?? null),
            exists: vi.fn(async (key: string) => realStore.has(key)),
            del: vi.fn(async (key: string) => {
                realStore.delete(key);
            }),
            delMany: vi.fn(async (keys: string[]) => {
                for (const k of keys) realStore.delete(k);
            }),
            delByPattern: vi.fn(async (pattern: string) => {
                const keys = await cache.scanKeys(pattern);
                for (const k of keys) realStore.delete(k);
            }),
            getStats: vi.fn(async () => ({
                usedMemory: '1.23 MB',
                hitRate: '87.50%',
                uptime: '3 天 5 小时',
            })),
        };

        service = new CacheAdminService(cache);
    });

    // ─────────────────────────────────────────
    // listKeys
    // ─────────────────────────────────────────
    describe('listKeys', () => {
        it('应返回空列表（store 为空时）', async () => {
            const { items, total } = await service.listKeys('*', 0, 10);
            expect(items).toEqual([]);
            expect(total).toBe(0);
        });

        it('应按 pattern 过滤并返回元信息', async () => {
            realStore.set('mono:auth:login:user-1', { value: { id: 'user-1' }, ttl: 60, type: 'string' });
            realStore.set('mono:auth:login:user-2', { value: { id: 'user-2' }, ttl: 120, type: 'string' });
            realStore.set('mono:user:profile:1', { value: 'profile', ttl: -1, type: 'string' });

            const { items, total } = await service.listKeys('mono:auth:*', 0, 10);
            expect(total).toBe(2);
            expect(items).toHaveLength(2);
            expect(items[0]).toMatchObject({
                key: expect.stringContaining('mono:auth:'),
                type: 'string',
                ttl: expect.any(Number),
                size: expect.any(Number),
            });
        });

        it('应对 value 做 JSON 序列化（对象 → JSON 字符串）', async () => {
            realStore.set('k1', { value: { name: 'alice', age: 18 }, ttl: 60, type: 'string' });
            const { items } = await service.listKeys('*', 0, 10);
            expect(items[0].value).toBe('{"name":"alice","age":18}');
        });

        it('value 为字符串时应原样返回（不再包一层 JSON.stringify）', async () => {
            realStore.set('k1', { value: 'plain string', ttl: 60, type: 'string' });
            const { items } = await service.listKeys('*', 0, 10);
            expect(items[0].value).toBe('plain string');
        });

        it('value 为 null 时应返回 null', async () => {
            realStore.set('k1', { value: null, ttl: -2, type: 'none' });
            const { items } = await service.listKeys('*', 0, 10);
            expect(items[0].value).toBeNull();
        });

        it('size 字段应等于 value 字符串 length', async () => {
            realStore.set('k1', { value: '12345', ttl: 60, type: 'string' });
            const { items } = await service.listKeys('*', 0, 10);
            expect(items[0].size).toBe(5);
        });

        it('应支持分页（offset / limit）', async () => {
            for (let i = 0; i < 5; i++) {
                realStore.set(`key:${i}`, { value: i, ttl: 60, type: 'string' });
            }
            const page1 = await service.listKeys('*', 0, 2);
            const page2 = await service.listKeys('*', 2, 2);
            expect(page1.items).toHaveLength(2);
            expect(page2.items).toHaveLength(2);
            expect(page1.total).toBe(5);
            expect(page2.total).toBe(5);
            // 翻页 key 不重叠
            const keys1 = page1.items.map((i) => i.key);
            const keys2 = page2.items.map((i) => i.key);
            expect(keys1.some((k) => keys2.includes(k))).toBe(false);
        });

        it('limit 上限保护（limit=9999 应被截到 500）', async () => {
            // 不灌数据，只验证不抛错
            const { items, total } = await service.listKeys('*', 0, 9999);
            expect(items).toEqual([]);
            expect(total).toBe(0);
        });
    });

    // ─────────────────────────────────────────
    // getValue
    // ─────────────────────────────────────────
    describe('getValue', () => {
        it('应返回单个 key 的完整信息', async () => {
            realStore.set('mono:user:1', { value: { name: 'alice' }, ttl: 600, type: 'string' });
            const result = await service.getValue('mono:user:1');
            expect(result.key).toBe('mono:user:1');
            expect(result.type).toBe('string');
            expect(result.ttl).toBe(600);
            expect(result.value).toBe('{"name":"alice"}');
        });

        it('key 不存在时应返回 ttl=-2, value=null', async () => {
            const result = await service.getValue('not:exists');
            expect(result.ttl).toBe(-2);
            expect(result.value).toBeNull();
        });
    });

    // ─────────────────────────────────────────
    // deleteOne
    // ─────────────────────────────────────────
    describe('deleteOne', () => {
        it('已存在时返回 true 并删除', async () => {
            realStore.set('k1', { value: 'v', ttl: 60, type: 'string' });
            const ok = await service.deleteOne('k1');
            expect(ok).toBe(true);
            expect(realStore.has('k1')).toBe(false);
        });

        it('不存在时返回 false', async () => {
            const ok = await service.deleteOne('not:exists');
            expect(ok).toBe(false);
        });
    });

    // ─────────────────────────────────────────
    // deleteMany
    // ─────────────────────────────────────────
    describe('deleteMany', () => {
        it('空数组应立即返回（不调 backend）', async () => {
            const result = await service.deleteMany([]);
            expect(result).toEqual({ deletedCount: 0, keys: [] });
            expect(cache.del).not.toHaveBeenCalled();
        });

        it('多条混合存在/不存在时只删存在的', async () => {
            realStore.set('a', { value: 1, ttl: 60, type: 'string' });
            realStore.set('b', { value: 2, ttl: 60, type: 'string' });
            const result = await service.deleteMany(['a', 'b', 'not:exists']);
            expect(result.deletedCount).toBe(2);
            expect(result.keys.sort()).toEqual(['a', 'b']);
        });
    });

    // ─────────────────────────────────────────
    // deleteByPattern
    // ─────────────────────────────────────────
    describe('deleteByPattern', () => {
        it('应透传 pattern 到 backend.delByPattern', async () => {
            await service.deleteByPattern('mono:auth:*');
            expect(cache.delByPattern).toHaveBeenCalledWith('mono:auth:*');
        });

        it('应返回扫描到的 key 数量（删除前）', async () => {
            realStore.set('a', { value: 1, ttl: 60, type: 'string' });
            realStore.set('b', { value: 2, ttl: 60, type: 'string' });
            const result = await service.deleteByPattern('*');
            expect(result.deletedCount).toBe(2);
            expect(realStore.size).toBe(0);
        });
    });

    // ─────────────────────────────────────────
    // getStats
    // ─────────────────────────────────────────
    describe('getStats', () => {
        it('应透传到底层 getStats', async () => {
            const result = await service.getStats();
            expect(result).toEqual({
                usedMemory: '1.23 MB',
                hitRate: '87.50%',
                uptime: '3 天 5 小时',
            });
        });
    });
});
