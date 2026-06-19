/**
 * 内存缓存后端（Map 实现）
 *
 * 用途：
 * - 本地开发或 REDIS_URL 未配置时的降级方案
 * - 不适合生产（多进程无法共享、进程重启即丢失、TTL 精度依赖 setTimeout 不存在 → 用 expiresAt 主动检查）
 *
 * 内部数据结构：
 * - Map<key, { value: JSON.stringify 后的字符串, expiresAt: 毫秒时间戳 }>
 * - expiresAt = 0 表示无 TTL
 *
 * 与原 cache.service.ts 内存分支的差异：
 * - 移除了 `if (this.redis) ... else` 分支
 * - 移除了与 ioredis 共享的 JSON 序列化逻辑（编排层负责）
 * - 增加了完整 11 个方法的实现（部分靠 throw + instanceof 在编排层走 fallback）
 */
import type { CacheBackend } from './cache-backend.js';
import type { ICacheStats } from './cache.interface.js';

/** 内存缓存条目 */
interface MemoryEntry {
    /** JSON.stringify 后的字符串（保持和 Redis 分支一致的字符串存储） */
    value: string;
    /** 过期时间戳（毫秒）；0 = 永不过期 */
    expiresAt: number;
}

/** 内存后端实现 */
export class MemoryCacheBackend implements CacheBackend {
    /** 主存储容器 */
    private readonly store = new Map<string, MemoryEntry>();

    /**
     * 检查 key 是否过期，过期则删除并返回 null
     * - 内存模式没有 ioredis 的 TTL 自动清理机制
     * - 用 Date.now() 与 expiresAt 比较实现懒清理
     */
    private getAlive(key: string): MemoryEntry | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry;
    }

    /**
     * 把 pattern（支持 * 通配）转换为正则
     * - '*' → '.*'，其他字符原样转义
     * - 例子："mono:user:*" → /^mono:user:.*$/
     */
    private patternToRegex(pattern: string): RegExp {
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
    }

    async get<T>(key: string): Promise<T | null> {
        const entry = this.getAlive(key);
        if (!entry) return null;
        return JSON.parse(entry.value) as T;
    }

    async set(key: string, value: unknown, ttl?: number): Promise<void> {
        this.store.set(key, {
            value: JSON.stringify(value),
            expiresAt: ttl ? Date.now() + ttl * 1000 : 0,
        });
    }

    async setex(key: string, ttl: number, value: unknown): Promise<void> {
        return this.set(key, value, ttl);
    }

    async del(key: string): Promise<void> {
        this.store.delete(key);
    }

    async delMany(keys: string[]): Promise<void> {
        for (const key of keys) {
            this.store.delete(key);
        }
    }

    async delByPattern(pattern: string): Promise<void> {
        const regex = this.patternToRegex(pattern);
        for (const key of this.store.keys()) {
            if (regex.test(key)) {
                this.store.delete(key);
            }
        }
    }

    async mget<T>(keys: string[]): Promise<(T | null)[]> {
        return keys.map((k) => {
            const entry = this.getAlive(k);
            if (!entry) return null;
            return JSON.parse(entry.value) as T;
        });
    }

    async setTtlByPattern(pattern: string, ttl: number): Promise<void> {
        const regex = this.patternToRegex(pattern);
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (regex.test(key)) {
                entry.expiresAt = now + ttl * 1000;
            }
        }
    }

    async exists(key: string): Promise<boolean> {
        return this.getAlive(key) !== null;
    }

    async incr(key: string): Promise<number> {
        const entry = this.getAlive(key);
        /** 解析当前值（incr 始终走数字） */
        const current = entry ? Number(JSON.parse(entry.value)) : 0;
        const next = current + 1;
        /** 保留原 TTL（如果有） */
        const remainingTtl = entry?.expiresAt
            ? Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000))
            : undefined;
        await this.set(key, next, remainingTtl);
        return next;
    }

    async ttl(key: string): Promise<number> {
        const entry = this.store.get(key);
        if (!entry) return -2;
        if (!entry.expiresAt) return -1;
        const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
        return remaining > 0 ? remaining : -2;
    }

    /**
     * 内存模式不支持 Lua
     * - 编排层 CacheService.evalLua 会在内存分支走 fallback 路径
     * - 这里抛错只是兜底，正常调用不会到这里
     */
    async evalLua(_script: string, _keys: string[], _args: (string | number)[]): Promise<number> {
        throw new Error('MemoryCacheBackend does not support Lua scripts (use orchestrator fallback)');
    }

    /** 内存模式所有 key 都是 string（与 Redis TYPE 保持语义一致） */
    async getKeyType(_key: string): Promise<string> {
        return 'string';
    }

    async scanKeys(pattern: string, _count?: number): Promise<string[]> {
        const regex = this.patternToRegex(pattern);
        const matched: string[] = [];
        for (const key of this.store.keys()) {
            if (regex.test(key)) {
                matched.push(key);
            }
        }
        return matched;
    }

    /** 内存模式没有"运行时长/已用内存/命中率"这些概念，统一返回 "-" */
    async getStats(): Promise<ICacheStats> {
        return { usedMemory: '-', hitRate: '-', uptime: '-' };
    }
}
