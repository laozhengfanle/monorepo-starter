/**
 * Redis 分布式锁服务
 *
 * 用途：
 * - 防止多实例部署时 Cron 任务重复执行
 * - 实现 SET NX EX 语义 + 释放时校验 owner（防误删别人的锁）
 *
 * 实现策略：
 * - acquire: SET key owner NX EX ttl（原子）
 * - release: Lua 脚本 GET + DEL 校验 owner（原子）
 * - extend: Lua 脚本 GET + PEXPIRE 校验 owner（原子）
 *
 * 降级策略：
 * - 无 REDIS_URL 时（内存模式），用进程内 Map 模拟锁
 * - 同一进程内仍能保证 acquire/release/extend 互斥
 * - 跨进程（多实例）此时无法互斥，需在运维文档标注
 */
import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../cache/cache.interface.js';
import { ErrorThrottle } from '../utils/error-throttle.js';

/** 锁释放 Lua 脚本：仅当 value 与传入 owner 一致时才删除（防误删） */
const RELEASE_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
`;

/** 锁延期 Lua 脚本：仅当 value 与传入 owner 一致时才延期（防误续） */
const EXTEND_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
    return 0
end
`;

/** 内存模式锁条目（fallback 路径） */
interface MemoryLockEntry {
    owner: string;
    expiresAt: number;
}

@Injectable()
export class RedisLockService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisLockService.name);
    private readonly redis: Redis | null;
    private readonly memoryLocks = new Map<string, MemoryLockEntry>();

    /**
     * 错误日志节流器
     * - 与 CacheService 相同：30s 内同质错误只记一次 warn，只传摘要不传整个 err 对象
     * - 防止双连接（CacheService + RedisLockService 各自一个 ioredis client）时的日志双倍 + 内存双倍
     */
    private readonly errorThrottle: ErrorThrottle;

    constructor(
        @Optional() @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService | null,
        @Optional() private readonly configService: ConfigService | null,
    ) {
        this.errorThrottle = new ErrorThrottle({
            logger: this.logger,
            context: 'RedisLockService',
        });
        const redisUrl = configService?.get<string>('redis.REDIS_URL');
        if (redisUrl) {
            this.redis = new Redis(redisUrl, {
                // 单次请求最多重试 1 次 → 失败快速抛出
                maxRetriesPerRequest: 1,
                // 断线期间禁用离线队列
                enableOfflineQueue: false,
                // 退避：200ms → 400ms → ... → 上限 2s
                retryStrategy: (times) => Math.min(times * 200, 2000),
            });
            this.redis.on('connect', () => {
                this.errorThrottle.reset(); // 重连成功后允许立即打印新错误
            });
            this.redis.on('error', (err) => this.errorThrottle.log(err, 'Redis lock client'));
        } else {
            this.redis = null;
            this.logger.warn('REDIS_URL 未配置，RedisLockService 降级为进程内锁（仅限单实例使用）');
        }
    }

    async onModuleDestroy() {
        if (this.redis) {
            await this.redis.quit();
        }
    }

    /**
     * 获取锁（非阻塞）
     * - 返回 owner（成功）或 null（失败：锁被其他进程持有）
     * - owner 是随机 UUID，release/extend 时必须传入同一 owner
     */
    async acquire(key: string, ttlMs: number): Promise<string | null> {
        const owner = randomUUID();
        if (this.redis) {
            // SET key value NX PX ttl — 仅当 key 不存在时设置
            const result = await this.redis.set(key, owner, 'PX', ttlMs, 'NX');
            return result === 'OK' ? owner : null;
        }
        // 内存模式
        const now = Date.now();
        const existing = this.memoryLocks.get(key);
        if (existing && existing.expiresAt > now) {
            return null; // 已被其他请求持有
        }
        this.memoryLocks.set(key, { owner, expiresAt: now + ttlMs });
        return owner;
    }

    /**
     * 释放锁（仅当 owner 匹配时）
     * - 返回 true 表示成功释放，false 表示 owner 不匹配或锁已过期
     */
    async release(key: string, owner: string): Promise<boolean> {
        if (this.redis) {
            const result = (await this.redis.eval(RELEASE_LUA, 1, key, owner)) as number;
            return result === 1;
        }
        // 内存模式
        const entry = this.memoryLocks.get(key);
        if (!entry) return false;
        if (entry.owner !== owner) return false;
        if (entry.expiresAt < Date.now()) {
            this.memoryLocks.delete(key);
            return false;
        }
        this.memoryLocks.delete(key);
        return true;
    }

    /**
     * 延长锁 TTL（仅当 owner 匹配时）
     * - 用于长任务执行期间定期续期，防止锁过期
     */
    async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
        if (this.redis) {
            const result = (await this.redis.eval(EXTEND_LUA, 1, key, owner, String(ttlMs))) as number;
            return result === 1;
        }
        const entry = this.memoryLocks.get(key);
        if (!entry || entry.owner !== owner) return false;
        entry.expiresAt = Date.now() + ttlMs;
        return true;
    }

    /**
     * 检查锁是否被持有（不获取）
     */
    async isLocked(key: string): Promise<boolean> {
        if (this.redis) {
            return (await this.redis.exists(key)) === 1;
        }
        const entry = this.memoryLocks.get(key);
        return !!entry && entry.expiresAt > Date.now();
    }
}
