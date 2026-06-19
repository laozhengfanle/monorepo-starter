/**
 * 缓存服务编排层
 *
 * 职责：
 * - 持有 CacheBackend 实例（构造时根据 REDIS_URL 选 MemoryCacheBackend 或 RedisCacheBackend）
 * - 维护 Redis 客户端的生命周期（onModuleDestroy 调用 backend.quit）
 * - 统一节流 Redis 的 error 事件（避免重连风暴把日志 + 内存撑爆）
 * - 对外暴露与 ICacheService 完全一致的 API，所有方法都是单行委托
 *
 * 拆分前 cache.service.ts 375 行，每个方法都做 `if (this.redis) ... else memoryStore` 分支
 * 拆分后 4 个文件：接口 / 内存 / Redis / 编排（本文件）
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { ICacheService, ICacheStats } from './cache.interface.js';
import type { CacheBackend } from './cache-backend.js';
import { MemoryCacheBackend } from './cache.memory-backend.js';
import { RedisCacheBackend } from './cache.redis-backend.js';
import { ErrorThrottle } from '../utils/error-throttle.js';

@Injectable()
export class CacheService implements ICacheService, OnModuleDestroy {
    private readonly logger = new Logger(CacheService.name);
    /** 当前生效的后端实现（Redis 或内存） */
    private readonly backend: CacheBackend;

    /**
     * 错误日志节流器
     * - ioredis 默认会无限重连，每次重连失败都 emit 'error' 事件
     * - 不节流 → 日志爆炸 + 内存累积（开发机 8GB 被占满的根因）
     * - 同质错误在 30s 窗口内只记一次 warn，且只记 message 摘要不打印 err 对象
     */
    private readonly errorThrottle: ErrorThrottle;

    constructor(private readonly configService: ConfigService) {
        this.errorThrottle = new ErrorThrottle({ logger: this.logger, context: 'CacheService' });

        const redisUrl = this.configService.get<string>('redis.REDIS_URL');
        if (redisUrl) {
            // maxRetriesPerRequest=1 + enableOfflineQueue=false → 失败快速抛出，让 RedisDegradationService 接管
            // 避免业务请求被 ioredis 内部重试阻塞数十秒
            const redis = new Redis(redisUrl, {
                maxRetriesPerRequest: 1,
                enableOfflineQueue: false,
                // 重连退避：200ms → 400ms → ... → 上限 2s
                retryStrategy: (times) => Math.min(times * 200, 2000),
            });
            redis.on('connect', () => {
                this.errorThrottle.reset(); // 重连成功后允许立即打印新错误
                this.logger.log('Redis connected');
            });
            redis.on('error', (err) => this.errorThrottle.log(err, 'Redis'));
            this.backend = new RedisCacheBackend(redis, { logger: this.logger });
        } else {
            this.backend = new MemoryCacheBackend();
            this.logger.warn('REDIS_URL not set, using in-memory cache (not suitable for production)');
        }
    }

    async onModuleDestroy() {
        if (this.backend.quit) {
            await this.backend.quit();
            this.logger.log('Cache backend connection closed');
        }
    }

    // ===== ICacheService 公共方法（全部为对 backend 的单行委托）=====

    get<T>(key: string): Promise<T | null> {
        return this.backend.get<T>(key);
    }
    set(key: string, value: unknown, ttl?: number): Promise<void> {
        return this.backend.set(key, value, ttl);
    }
    del(key: string): Promise<void> {
        return this.backend.del(key);
    }
    delMany(keys: string[]): Promise<void> {
        return this.backend.delMany(keys);
    }
    delByPattern(pattern: string): Promise<void> {
        return this.backend.delByPattern(pattern);
    }
    mget<T>(keys: string[]): Promise<(T | null)[]> {
        return this.backend.mget<T>(keys);
    }
    setTtlByPattern(pattern: string, ttl: number): Promise<void> {
        return this.backend.setTtlByPattern(pattern, ttl);
    }
    exists(key: string): Promise<boolean> {
        return this.backend.exists(key);
    }
    incr(key: string): Promise<number> {
        return this.backend.incr(key);
    }
    setex(key: string, ttl: number, value: unknown): Promise<void> {
        return this.backend.setex(key, ttl, value);
    }
    ttl(key: string): Promise<number> {
        return this.backend.ttl(key);
    }
    getKeyType(key: string): Promise<string> {
        return this.backend.getKeyType(key);
    }
    scanKeys(pattern: string, count?: number): Promise<string[]> {
        return this.backend.scanKeys(pattern, count);
    }

    getStats(): Promise<ICacheStats> {
        // 内存 / Redis 两个 backend 都实现了 getStats，这里兜底一下极端情况
        if (!this.backend.getStats) {
            return Promise.resolve({ usedMemory: '-', hitRate: '-', uptime: '-' });
        }
        return this.backend.getStats();
    }

    /**
     * evalLua 编排（特殊处理）
     * - 内存 backend 没有 Lua 能力（抛错），走 fallback 路径（与原行为一致）
     * - Redis backend 直接执行 Lua 脚本
     */
    async evalLua(
        script: string,
        keys: string[],
        args: (string | number)[],
        fallback: () => Promise<number>,
    ): Promise<number> {
        if (this.backend instanceof MemoryCacheBackend) {
            return fallback();
        }
        return this.backend.evalLua(script, keys, args);
    }
}
