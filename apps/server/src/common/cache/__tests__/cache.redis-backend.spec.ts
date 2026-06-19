/**
 * RedisCacheBackend 单元测试
 *
 * 覆盖场景：
 * - get / set / setex / del / delMany：转发到 ioredis 对应命令
 * - get 遇到非 JSON 原始字符串（如 Lua SET 的 'used'）：降级返回原值
 * - mget 同样处理非 JSON 值
 * - delByPattern / setTtlByPattern：内部用 SCAN 游标遍历（不调 KEYS *）
 * - exists / incr / ttl：直接转发
 * - evalLua：转发到 redis.eval
 * - getKeyType：调用 TYPE 命令，失败时返回 'unknown'
 * - scanKeys：游标分批 SCAN
 * - getStats：解析 INFO 输出为 { usedMemory / hitRate / uptime }，失败时降级
 * - quit：关闭 Redis 连接
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisCacheBackend } from '../cache.redis-backend.js';
import type { Redis } from 'ioredis';

/**
 * 构造 ioredis 的 mock（只覆盖本测试用到的命令）
 * - 返回值用 Promise 包裹（ioris 是 async）
 * - 通过 vi.fn() 让单测可断言"调了哪个命令 / 调了几次"
 */
function createMockRedis(): {
    [K in keyof Pick<
        Redis,
        | 'get'
        | 'set'
        | 'setex'
        | 'del'
        | 'mget'
        | 'exists'
        | 'incr'
        | 'ttl'
        | 'type'
        | 'scan'
        | 'eval'
        | 'info'
        | 'pipeline'
        | 'quit'
    >]: ReturnType<typeof vi.fn>;
} {
    return {
        get: vi.fn(),
        set: vi.fn(),
        setex: vi.fn(),
        del: vi.fn(),
        mget: vi.fn(),
        exists: vi.fn(),
        incr: vi.fn(),
        ttl: vi.fn(),
        type: vi.fn(),
        scan: vi.fn(),
        eval: vi.fn(),
        info: vi.fn(),
        pipeline: vi.fn(),
        quit: vi.fn(),
    };
}

describe('RedisCacheBackend', () => {
    let mockRedis: ReturnType<typeof createMockRedis>;
    let backend: RedisCacheBackend;

    beforeEach(() => {
        mockRedis = createMockRedis();
        backend = new RedisCacheBackend(mockRedis as unknown as Redis);
    });

    describe('get', () => {
        it('命中 JSON 字符串 → JSON.parse 后返回', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));
            const val = await backend.get<{ foo: string }>('k1');
            expect(val).toEqual({ foo: 'bar' });
            expect(mockRedis.get).toHaveBeenCalledWith('k1');
        });

        it('未命中 → 返回 null', async () => {
            mockRedis.get.mockResolvedValue(null);
            const val = await backend.get('k1');
            expect(val).toBeNull();
        });

        it('遇到非 JSON 原始字符串（Lua 写入的 "used" 等）→ 降级返回原值', async () => {
            mockRedis.get.mockResolvedValue('used'); // 合法字符串但不是 JSON
            const val = await backend.get<string>('k1');
            expect(val).toBe('used');
        });
    });

    describe('set', () => {
        it('ttl 不传 → 调 SET', async () => {
            await backend.set('k1', { a: 1 });
            expect(mockRedis.set).toHaveBeenCalledWith('k1', JSON.stringify({ a: 1 }));
            expect(mockRedis.setex).not.toHaveBeenCalled();
        });

        it('ttl 有值 → 调 SETEX', async () => {
            await backend.set('k1', 'v', 60);
            expect(mockRedis.setex).toHaveBeenCalledWith('k1', 60, JSON.stringify('v'));
            expect(mockRedis.set).not.toHaveBeenCalled();
        });
    });

    describe('setex / del / delMany', () => {
        it('setex 走 redis.setex', async () => {
            await backend.setex('k1', 60, 'v1');
            expect(mockRedis.setex).toHaveBeenCalledWith('k1', 60, JSON.stringify('v1'));
        });

        it('del 走 redis.del', async () => {
            await backend.del('k1');
            expect(mockRedis.del).toHaveBeenCalledWith('k1');
        });

        it('delMany 空数组 → 不调 redis.del', async () => {
            await backend.delMany([]);
            expect(mockRedis.del).not.toHaveBeenCalled();
        });

        it('delMany 非空 → 一次 redis.del(...keys) 原子操作', async () => {
            await backend.delMany(['a', 'b', 'c']);
            expect(mockRedis.del).toHaveBeenCalledWith('a', 'b', 'c');
        });
    });

    describe('delByPattern', () => {
        it('扫描后批量删除', async () => {
            mockRedis.scan.mockResolvedValue(['0', ['a', 'b']]);
            await backend.delByPattern('mono:*');
            expect(mockRedis.del).toHaveBeenCalledWith('a', 'b');
        });

        it('扫描结果为空 → 不调 del', async () => {
            mockRedis.scan.mockResolvedValue(['0', []]);
            await backend.delByPattern('mono:*');
            expect(mockRedis.del).not.toHaveBeenCalled();
        });
    });

    describe('mget', () => {
        it('按顺序返回值（未命中为 null）', async () => {
            mockRedis.mget.mockResolvedValue([JSON.stringify(1), null, JSON.stringify('x')]);
            const result = await backend.mget<number | string>(['a', 'b', 'c']);
            expect(result).toEqual([1, null, 'x']);
        });

        it('非 JSON 值降级为原字符串', async () => {
            mockRedis.mget.mockResolvedValue(['raw-string']);
            const result = await backend.mget<string>(['a']);
            expect(result).toEqual(['raw-string']);
        });

        it('空数组不调 redis.mget', async () => {
            const result = await backend.mget<string>([]);
            expect(result).toEqual([]);
            expect(mockRedis.mget).not.toHaveBeenCalled();
        });
    });

    describe('setTtlByPattern', () => {
        it('扫描后用 pipeline 批量 expire', async () => {
            mockRedis.scan.mockResolvedValue(['0', ['a', 'b']]);
            // pipeline 链式调用：pipeline.expire(...).expire(...).exec()
            const exec = vi.fn().mockResolvedValue([]);
            const expire = vi.fn().mockReturnThis();
            mockRedis.pipeline.mockReturnValue({ expire, exec } as never);

            await backend.setTtlByPattern('mono:*', 60);
            expect(expire).toHaveBeenCalledWith('a', 60);
            expect(expire).toHaveBeenCalledWith('b', 60);
            expect(exec).toHaveBeenCalled();
        });
    });

    describe('exists / incr / ttl', () => {
        it('exists 返回布尔值', async () => {
            mockRedis.exists.mockResolvedValue(1);
            expect(await backend.exists('k1')).toBe(true);
            mockRedis.exists.mockResolvedValue(0);
            expect(await backend.exists('k1')).toBe(false);
        });

        it('incr 转发到 redis.incr', async () => {
            mockRedis.incr.mockResolvedValue(5);
            expect(await backend.incr('k1')).toBe(5);
        });

        it('ttl 转发到 redis.ttl', async () => {
            mockRedis.ttl.mockResolvedValue(60);
            expect(await backend.ttl('k1')).toBe(60);
        });
    });

    describe('evalLua', () => {
        it('转发到 redis.eval，结果转 number', async () => {
            mockRedis.eval.mockResolvedValue(42);
            const v = await backend.evalLua('return 1', ['k1'], [10]);
            expect(v).toBe(42);
            // 第一个数字参数是 keys.length
            expect(mockRedis.eval).toHaveBeenCalledWith('return 1', 1, 'k1', 10);
        });
    });

    describe('getKeyType', () => {
        it('成功时返回 TYPE 结果', async () => {
            mockRedis.type.mockResolvedValue('hash');
            expect(await backend.getKeyType('k1')).toBe('hash');
        });

        it('失败时降级为 "unknown"（不让 stats 接口 500）', async () => {
            mockRedis.type.mockRejectedValue(new Error('connection lost'));
            expect(await backend.getKeyType('k1')).toBe('unknown');
        });
    });

    describe('scanKeys', () => {
        it('游标分批收集所有匹配 key', async () => {
            // 第一次游标 '0' → 匹配 ['a', 'b'] + 下一个游标 '5'
            // 第二次游标 '5' → 匹配 ['c'] + 游标 '0' 结束
            mockRedis.scan.mockResolvedValueOnce(['5', ['a', 'b']]).mockResolvedValueOnce(['0', ['c']]);
            const keys = await backend.scanKeys('mono:*', 100);
            expect(keys).toEqual(['a', 'b', 'c']);
            expect(mockRedis.scan).toHaveBeenCalledTimes(2);
        });

        it('单次扫描完结（游标直接到 0）', async () => {
            mockRedis.scan.mockResolvedValueOnce(['0', ['a']]);
            const keys = await backend.scanKeys('mono:*');
            expect(keys).toEqual(['a']);
            expect(mockRedis.scan).toHaveBeenCalledTimes(1);
        });
    });

    describe('getStats', () => {
        it('成功解析 INFO 文本 → 返回 usedMemory / hitRate / uptime', async () => {
            mockRedis.info.mockResolvedValue(
                [
                    '# Server',
                    'redis_version:7.2.0',
                    'uptime_in_seconds:90061', // 1 天 1 小时 1 分 1 秒
                    '# Memory',
                    'used_memory:1048576', // 1 MB
                    '# Stats',
                    'keyspace_hits:80',
                    'keyspace_misses:20',
                ].join('\n'),
            );
            const stats = await backend.getStats();
            expect(stats.usedMemory).toBe('1 MB');
            expect(stats.hitRate).toBe('80.00%');
            expect(stats.uptime).toContain('天');
        });

        it('没有命中样本 → hitRate 返回 "-"', async () => {
            mockRedis.info.mockResolvedValue('used_memory:0\nuptime_in_seconds:0');
            const stats = await backend.getStats();
            expect(stats.hitRate).toBe('-');
        });

        it('INFO 抛错 → 降级返回 "-"（不让接口 500）', async () => {
            mockRedis.info.mockRejectedValue(new Error('redis down'));
            const stats = await backend.getStats();
            expect(stats).toEqual({ usedMemory: '-', hitRate: '-', uptime: '-' });
        });
    });

    describe('quit', () => {
        it('关闭 Redis 连接', async () => {
            await backend.quit();
            expect(mockRedis.quit).toHaveBeenCalled();
        });
    });
});
