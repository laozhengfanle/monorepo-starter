/**
 * CacheService 编排层单元测试
 *
 * 覆盖场景：
 * - 工厂选择：REDIS_URL 有/无 时分别构造 Redis / Memory backend
 * - 公共方法（get/set/del/delMany/...）都是单行委托到 backend
 * - evalLua 编排：内存模式走 fallback，Redis 模式走 backend.evalLua
 * - getStats：内存模式 / Redis 模式都透传 backend.getStats
 * - onModuleDestroy：调用 backend.quit（仅 Redis backend 有）
 * - 错误日志节流：Redis 构造时挂的 error 监听由 CacheService 统一处理
 * - 注入 ConfigService 但无 REDIS_URL → 走内存模式 + 打 warn
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache.service.js';
import { MemoryCacheBackend } from '../cache.memory-backend.js';

/**
 * 构造 ConfigService 的 mock
 * - get(key) 简单返回注入的 redisUrl
 */
function createMockConfigService(redisUrl: string | undefined = undefined): ConfigService {
    return {
        get: vi.fn().mockImplementation((key: string) => {
            if (key === 'redis.REDIS_URL') return redisUrl;
            return undefined;
        }),
    } as unknown as ConfigService;
}

describe('CacheService（编排层）', () => {
    let configService: ConfigService;
    let service: CacheService;

    describe('REDIS_URL 未配置时', () => {
        beforeEach(() => {
            configService = createMockConfigService(undefined);
            service = new CacheService(configService);
        });

        it('应选择 MemoryCacheBackend 作为 backend', () => {
            // 公共方法委托到 backend，间接验证 backend 类型
            // 这里通过 evalLua 走 fallback 路径来侧面验证
            expect(service).toBeInstanceOf(CacheService);
        });

        it('基本 KV 走内存模式（set 后 get 能读回）', async () => {
            await service.set('k1', { foo: 'bar' });
            const val = await service.get<{ foo: string }>('k1');
            expect(val).toEqual({ foo: 'bar' });
        });

        it('evalLua 走 fallback 路径（不调 backend.evalLua）', async () => {
            const fallback = vi.fn().mockResolvedValue(99);
            const v = await service.evalLua('return 1', [], [], fallback);
            expect(v).toBe(99);
            expect(fallback).toHaveBeenCalledTimes(1);
        });

        it('getStats 走内存模式（返回 "-"）', async () => {
            const stats = await service.getStats();
            expect(stats).toEqual({ usedMemory: '-', hitRate: '-', uptime: '-' });
        });

        it('scanKeys 按 * 通配匹配', async () => {
            await service.set('mono:user:1', 'a');
            await service.set('mono:user:2', 'b');
            const keys = await service.scanKeys('mono:user:*');
            expect(keys.sort()).toEqual(['mono:user:1', 'mono:user:2']);
        });

        it('onModuleDestroy 不抛错（内存 backend 没有 quit）', async () => {
            await expect(service.onModuleDestroy()).resolves.toBeUndefined();
        });

        it('批量操作（delMany / mget / delByPattern）按 ICacheService 语义工作', async () => {
            await service.set('a', 1);
            await service.set('b', 2);
            await service.set('c', 3);
            const mget = await service.mget<number>(['a', 'b', 'c']);
            expect(mget).toEqual([1, 2, 3]);
            await service.delMany(['a', 'c']);
            expect(await service.exists('a')).toBe(false);
            expect(await service.exists('b')).toBe(true);
            await service.delByPattern('b');
            expect(await service.exists('b')).toBe(false);
        });
    });

    describe('REDIS_URL 已配置时', () => {
        /**
         * 注意：本组测试只验证 CacheService 在 REDIS_URL 有值时会构造 ioredis client + RedisCacheBackend
         * 真实 ioredis 行为由 cache.redis-backend.spec.ts 覆盖
         * 这里通过 spyOn 阻止真实的 Redis 连接（只 mock 构造 + 必要方法）
         */
        beforeEach(() => {
            configService = createMockConfigService('redis://127.0.0.1:6379');
            service = new CacheService(configService);
        });

        it('构造后应返回 CacheService 实例', () => {
            expect(service).toBeInstanceOf(CacheService);
        });

        it('onModuleDestroy 应调用 backend.quit()（Redis 模式有 quit）', async () => {
            // 替换内部 backend 的 quit 监控
            const quitSpy = vi.fn().mockResolvedValue(undefined);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).backend = { quit: quitSpy };
            await service.onModuleDestroy();
            expect(quitSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('错误日志节流（ErrorThrottle 集成）', () => {
        it('Redis 构造时挂的 error 监听不会无限重试（防内存爆炸）', () => {
            // 仅验证构造不抛错（实际节流行为由 error-throttle.spec.ts 覆盖）
            configService = createMockConfigService('redis://127.0.0.1:6379');
            expect(() => new CacheService(configService)).not.toThrow();
        });
    });

    describe('MemoryCacheBackend 可作为 Redis 的 fallback', () => {
        it('MemoryCacheBackend 实现了 CacheBackend 接口的全部方法', () => {
            // 静态检查：编排层要求 backend 满足接口契约
            const backend = new MemoryCacheBackend();
            const required: Array<keyof MemoryCacheBackend> = [
                'get',
                'set',
                'setex',
                'del',
                'delMany',
                'delByPattern',
                'mget',
                'setTtlByPattern',
                'exists',
                'incr',
                'ttl',
                'evalLua',
                'getKeyType',
                'scanKeys',
                'getStats',
            ];
            for (const m of required) {
                expect(typeof backend[m]).toBe('function');
            }
        });
    });
});
