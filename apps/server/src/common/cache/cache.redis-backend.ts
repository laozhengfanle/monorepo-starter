/**
 * Redis 缓存后端（ioredis 实现）
 *
 * 与原 cache.service.ts Redis 分支的差异：
 * - 移除了 `if (this.redis)` 分支（构造时已确定是 redis backend）
 * - 移除了 onModuleDestroy（编排层负责）
 * - 移除了错误事件监听（编排层 CacheService 用 ErrorThrottle 统一处理）
 * - 移除了格式化逻辑（getStats 内置，保留 Redis 专属的 helper）
 *
 * 设计要点：
 * - delByPattern / setTtlByPattern 内部用 SCAN（生产安全，不用 KEYS *）
 * - get / mget 对 Lua 写入的原始字符串做降级（JSON.parse 失败时返回原值）
 * - getStats 内部捕获错误，避免 stats 接口 500
 */
import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { CacheBackend } from './cache-backend.js';
import type { ICacheStats } from './cache.interface.js';

/** Redis 后端实现 */
export class RedisCacheBackend implements CacheBackend {
    /** logger 用于 getStats 等内部 catch 时的 warn */
    private readonly logger: Logger;

    constructor(
        private readonly redis: Redis,
        options?: { logger?: Logger },
    ) {
        this.logger = options?.logger ?? new Logger(RedisCacheBackend.name);
    }

    /**
     * 统一降级包装：Redis 操作失败时返回安全默认值
     *
     * 背景：开发环境不装 Redis 是常态，但 REDIS_URL 配置了却被拒绝连接时，
     * cache 写操作不应 500。所有 Redis 调用都走此 helper，失败时返回 fallback
     * 并记 warn 日志（运营 grep "redis_degradation" 可定位）。
     *
     * @param opName 操作名（仅用于日志）
     * @param op Redis 操作
     * @param fallback 降级返回值
     */
    private async safe<T>(opName: string, op: () => Promise<T>, fallback: T): Promise<T> {
        try {
            return await op();
        } catch (err) {
            this.logger.warn(
                `redis_degradation op=${opName} fallback=${JSON.stringify(fallback)} err=${(err as Error).message}`,
            );
            return fallback;
        }
    }

    async get<T>(key: string): Promise<T | null> {
        return this.safe(
            'get',
            async () => {
                const val = await this.redis.get(key);
                if (val === null) return null;
                try {
                    return JSON.parse(val) as T;
                } catch {
                    this.logger.warn(`Cache key "${key}" 的值不是合法 JSON，返回原始字符串`);
                    return val as unknown as T;
                }
            },
            null,
        );
    }

    async set(key: string, value: unknown, ttl?: number): Promise<void> {
        return this.safe(
            'set',
            async () => {
                const serialized = JSON.stringify(value);
                if (ttl) {
                    await this.redis.setex(key, ttl, serialized);
                } else {
                    await this.redis.set(key, serialized);
                }
            },
            undefined,
        );
    }

    async setex(key: string, ttl: number, value: unknown): Promise<void> {
        return this.safe(
            'setex',
            async () => {
                await this.redis.setex(key, ttl, JSON.stringify(value));
            },
            undefined,
        );
    }

    async del(key: string): Promise<void> {
        return this.safe(
            'del',
            async () => {
                await this.redis.del(key);
            },
            undefined,
        );
    }

    async delMany(keys: string[]): Promise<void> {
        if (keys.length === 0) return;
        return this.safe(
            'delMany',
            async () => {
                await this.redis.del(...keys);
            },
            undefined,
        );
    }

    async delByPattern(pattern: string): Promise<void> {
        return this.safe(
            'delByPattern',
            async () => {
                const keys = await this.scanKeys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            },
            undefined,
        );
    }

    async mget<T>(keys: string[]): Promise<(T | null)[]> {
        if (keys.length === 0) return [];
        return this.safe(
            'mget',
            async () => {
                const values = await this.redis.mget(...keys);
                return values.map((v) => {
                    if (v === null) return null;
                    try {
                        return JSON.parse(v) as T;
                    } catch {
                        this.logger.warn(`mget 遇到非 JSON 值，返回原始字符串`);
                        return v as unknown as T;
                    }
                });
            },
            [] as (T | null)[],
        );
    }

    async setTtlByPattern(pattern: string, ttl: number): Promise<void> {
        return this.safe(
            'setTtlByPattern',
            async () => {
                const keys = await this.scanKeys(pattern);
                if (keys.length > 0) {
                    const pipeline = this.redis.pipeline();
                    keys.forEach((key) => pipeline.expire(key, ttl));
                    await pipeline.exec();
                }
            },
            undefined,
        );
    }

    async exists(key: string): Promise<boolean> {
        return this.safe('exists', async () => (await this.redis.exists(key)) === 1, false);
    }

    async incr(key: string): Promise<number> {
        return this.safe('incr', async () => this.redis.incr(key), 0);
    }

    async ttl(key: string): Promise<number> {
        return this.safe('ttl', async () => this.redis.ttl(key), -2);
    }

    async evalLua(script: string, keys: string[], args: (string | number)[]): Promise<number> {
        return this.safe(
            'evalLua',
            async () => {
                const result = await this.redis.eval(script, keys.length, ...keys, ...args);
                return Number(result);
            },
            0,
        );
    }

    /**
     * 获取 key 的数据类型
     * - TYPE 命令返回 string / hash / list / set / zset / stream / none
     * - 失败时返回 "unknown"，避免阻断 stats 接口
     */
    async getKeyType(key: string): Promise<string> {
        try {
            return await this.redis.type(key);
        } catch {
            return 'unknown';
        }
    }

    /**
     * SCAN 匹配 key（生产安全，不用 KEYS *）
     * - 用游标分批遍历，每次 COUNT 100
     * - 全部 key 收集到数组里返回
     */
    async scanKeys(pattern: string, count?: number): Promise<string[]> {
        const keys: string[] = [];
        let cursor = '0';
        do {
            const [next, matched] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', count ?? 100);
            cursor = next;
            keys.push(...matched);
        } while (cursor !== '0');
        return keys;
    }

    /**
     * 获取 Redis 实例统计（用于管理后台缓存管理页面）
     * - 解析 INFO all 文本，提取 used_memory / uptime_in_seconds / keyspace_hits / keyspace_misses
     * - 命中率 = hits / (hits + misses)，没有样本时返回 "-"
     * - 失败（Redis 不可用）时降级为 "-"，不让 stats 接口 500
     */
    async getStats(): Promise<ICacheStats> {
        try {
            // INFO all 返回多行文本（key:value 形式），按行解析
            const info = await this.redis.info();
            const parsed = this.parseRedisInfo(info);

            return {
                usedMemory: this.formatBytes(Number(parsed.used_memory ?? 0)),
                hitRate: this.formatHitRate(Number(parsed.keyspace_hits ?? 0), Number(parsed.keyspace_misses ?? 0)),
                uptime: this.formatUptime(Number(parsed.uptime_in_seconds ?? 0)),
            };
        } catch (err) {
            // Redis 临时不可用不能让 stats 接口整体 500，降级为 "-"
            this.logger.warn(`getStats 失败，降级返回 "-": ${(err as Error).message}`);
            return { usedMemory: '-', hitRate: '-', uptime: '-' };
        }
    }

    /** 关闭 Redis 连接 */
    async quit(): Promise<void> {
        try {
            await this.redis.quit();
        } catch (err) {
            // 关闭时 Redis 可能从未连接成功（socket 不可写），忽略错误
            this.logger.warn(`Redis quit 失败（忽略，进程已在关闭中）: ${(err as Error).message}`);
        }
    }

    /**
     * 解析 Redis INFO 文本为键值对
     * - INFO 返回格式：
     *     # Server
     *     redis_version:7.2.0
     *     # Memory
     *     used_memory:1234567
     * - 以 '#' 开头的行是段落标题，跳过
     * - 解析失败时返回空对象
     */
    private parseRedisInfo(info: string): Record<string, string> {
        const result: Record<string, string> = {};
        for (const rawLine of info.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const idx = line.indexOf(':');
            if (idx <= 0) continue;
            const key = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            result[key] = value;
        }
        return result;
    }

    /**
     * 命中率格式化
     * - 总样本 = hits + misses
     * - 没有样本时返回 "-"
     * - 有样本时返回保留 2 位小数的百分比，如 "87.50%"
     */
    private formatHitRate(hits: number, misses: number): string {
        const total = hits + misses;
        if (total === 0) return '-';
        const rate = (hits / total) * 100;
        return `${rate.toFixed(2)}%`;
    }

    /**
     * 运行时长格式化（秒 → 人类可读）
     * - < 60s          : "X 秒"
     * - < 3600s        : "X 分 Y 秒"
     * - < 86400s       : "X 小时 Y 分"
     * - >= 86400s      : "X 天 Y 小时"
     */
    private formatUptime(seconds: number): string {
        if (!seconds || seconds <= 0) return '-';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (days > 0) return `${days} 天 ${hours} 小时`;
        if (hours > 0) return `${hours} 小时 ${minutes} 分`;
        if (minutes > 0) return `${minutes} 分 ${secs} 秒`;
        return `${secs} 秒`;
    }

    /**
     * 字节数 → 人类可读字符串（如 "1.23 MB"）
     * - used_memory 是字节数，转 KB/MB/GB 展示更直观
     */
    private formatBytes(bytes: number): string {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
