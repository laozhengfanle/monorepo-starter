/**
 * MemoryCacheBackend 单元测试
 *
 * 覆盖场景：
 * - 基本 KV：get / set / del 读写一致
 * - TTL：set 时指定 ttl，过期后 get 返回 null
 * - delMany：批量删除
 * - delByPattern：按通配符模式删除
 * - mget：批量读取，未命中的 key 返回 null
 * - setTtlByPattern：按模式重置 TTL
 * - exists / incr / ttl / setex 各方法语义
 * - evalLua：内存模式抛错（编排层走 fallback）
 * - getKeyType：固定返回 'string'
 * - scanKeys：按模式匹配
 * - getStats：内存模式固定返回 '-'
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryCacheBackend } from '../cache.memory-backend.js';

describe('MemoryCacheBackend', () => {
    let backend: MemoryCacheBackend;

    beforeEach(() => {
        backend = new MemoryCacheBackend();
    });

    describe('基本 KV 语义', () => {
        it('set 后 get 能读回（无 TTL）', async () => {
            await backend.set('k1', { foo: 'bar' });
            const val = await backend.get<{ foo: string }>('k1');
            expect(val).toEqual({ foo: 'bar' });
        });

        it('get 一个不存在的 key 返回 null', async () => {
            const val = await backend.get('missing');
            expect(val).toBeNull();
        });

        it('set 后 del 再 get 返回 null', async () => {
            await backend.set('k1', 'v1');
            await backend.del('k1');
            const val = await backend.get('k1');
            expect(val).toBeNull();
        });

        it('del 一个不存在的 key 不抛错', async () => {
            await expect(backend.del('not-exist')).resolves.toBeUndefined();
        });
    });

    describe('TTL 过期', () => {
        /**
         * 测试用的"虚拟时间"工具：把 Date.now() 暂时往后拨，让过期判断可重现
         */
        it('ttl=1s 的 key，过期后 get 返回 null', async () => {
            vi.useFakeTimers();
            try {
                vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
                await backend.set('k1', 'v1', 1);
                expect(await backend.get('k1')).toBe('v1');

                // 推进 2 秒，触发 TTL 过期
                vi.setSystemTime(new Date('2026-01-01T00:00:02Z'));
                expect(await backend.get('k1')).toBeNull();
            } finally {
                vi.useRealTimers();
            }
        });

        it('expiresAt=0 的 key 永不过期', async () => {
            await backend.set('k1', 'v1'); // 不传 ttl
            vi.useFakeTimers();
            try {
                vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
                // 即使 4 年后也还能读到
                expect(await backend.get('k1')).toBe('v1');
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('delMany', () => {
        it('批量删除传入的多个 key', async () => {
            await backend.set('a', 1);
            await backend.set('b', 2);
            await backend.set('c', 3);
            await backend.delMany(['a', 'c']);
            expect(await backend.get('a')).toBeNull();
            expect(await backend.get('b')).toBe(2);
            expect(await backend.get('c')).toBeNull();
        });

        it('空数组不抛错', async () => {
            await expect(backend.delMany([])).resolves.toBeUndefined();
        });
    });

    describe('delByPattern', () => {
        it('按 * 通配符批量删除', async () => {
            await backend.set('mono:user:1', 'a');
            await backend.set('mono:user:2', 'b');
            await backend.set('mono:role:1', 'c');
            await backend.delByPattern('mono:user:*');
            expect(await backend.get('mono:user:1')).toBeNull();
            expect(await backend.get('mono:user:2')).toBeNull();
            // role 不应被误删
            expect(await backend.get('mono:role:1')).toBe('c');
        });
    });

    describe('mget', () => {
        it('按顺序返回每个 key 的值（未命中为 null）', async () => {
            await backend.set('a', 1);
            await backend.set('c', 3);
            const result = await backend.mget<number>(['a', 'b', 'c']);
            expect(result).toEqual([1, null, 3]);
        });

        it('空数组返回空数组', async () => {
            const result = await backend.mget<number>([]);
            expect(result).toEqual([]);
        });
    });

    describe('setTtlByPattern', () => {
        it('按模式重置 TTL', async () => {
            vi.useFakeTimers();
            try {
                vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
                await backend.set('mono:x:1', 'v1'); // 无 TTL
                await backend.set('mono:x:2', 'v2');
                await backend.setTtlByPattern('mono:x:*', 60);
                // ttl 应该返回约 60
                expect(await backend.ttl('mono:x:1')).toBeGreaterThan(0);
                expect(await backend.ttl('mono:x:1')).toBeLessThanOrEqual(60);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('exists / incr / ttl / setex', () => {
        it('exists 反映当前 key 是否存在', async () => {
            expect(await backend.exists('a')).toBe(false);
            await backend.set('a', 1);
            expect(await backend.exists('a')).toBe(true);
        });

        it('incr 不存在 key 时从 0 开始', async () => {
            const v = await backend.incr('counter');
            expect(v).toBe(1);
        });

        it('incr 存在 key 时 +1', async () => {
            await backend.set('counter', 10);
            const v = await backend.incr('counter');
            expect(v).toBe(11);
        });

        it('ttl 对不存在的 key 返回 -2', async () => {
            expect(await backend.ttl('nope')).toBe(-2);
        });

        it('ttl 对无 TTL 的 key 返回 -1', async () => {
            await backend.set('forever', 'v');
            expect(await backend.ttl('forever')).toBe(-1);
        });

        it('setex 等价于 set(key, value, ttl)', async () => {
            await backend.setex('a', 60, 'v1');
            expect(await backend.get('a')).toBe('v1');
            expect(await backend.ttl('a')).toBeGreaterThan(0);
        });
    });

    describe('evalLua', () => {
        it('内存模式不支持 → 抛错（编排层走 fallback）', async () => {
            await expect(backend.evalLua('return 1', [], [])).rejects.toThrow(/does not support Lua/);
        });
    });

    describe('getKeyType', () => {
        it('内存模式固定返回 "string"', async () => {
            expect(await backend.getKeyType('any')).toBe('string');
        });
    });

    describe('scanKeys', () => {
        it('按 * 模式匹配', async () => {
            await backend.set('mono:user:1', 'a');
            await backend.set('mono:user:2', 'b');
            await backend.set('mono:role:1', 'c');
            const keys = await backend.scanKeys('mono:user:*');
            expect(keys.sort()).toEqual(['mono:user:1', 'mono:user:2']);
        });
    });

    describe('getStats', () => {
        it('内存模式返回 "-" 占位（无运行时长/已用内存/命中率概念）', async () => {
            const stats = await backend.getStats();
            expect(stats).toEqual({ usedMemory: '-', hitRate: '-', uptime: '-' });
        });
    });
});
