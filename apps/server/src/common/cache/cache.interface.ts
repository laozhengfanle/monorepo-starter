/** Redis INFO 关键字段的精简视图，供管理后台展示用 */
export interface ICacheStats {
    /** 已用内存（人类可读，如 "1.23 MB"）；无 Redis 时返回 "-" */
    usedMemory: string;
    /** 命中率（百分比字符串，如 "87.50%"）；无命中样本时返回 "-" */
    hitRate: string;
    /** 运行时长（人类可读，如 "3 天 5 小时"）；无 Redis 时返回 "-" */
    uptime: string;
}

/** 缓存服务接口 - 基于 ioredis 封装，补充权限场景需要的批量操作 */
export interface ICacheService {
    /** 读取缓存 */
    get<T>(key: string): Promise<T | null>;

    /** 写入缓存，ttl 单位秒 */
    set(key: string, value: unknown, ttl?: number): Promise<void>;

    /** 删除缓存 */
    del(key: string): Promise<void>;

    /** 批量删除（一次 DEL 多个 key，Redis 原子操作） */
    delMany(keys: string[]): Promise<void>;

    /** 按模式批量删除（使用 SCAN，不用 KEYS *） */
    delByPattern(pattern: string): Promise<void>;

    /** 批量读取 */
    mget<T>(keys: string[]): Promise<(T | null)[]>;

    /** 按模式批量设置 TTL（防雪崩用） */
    setTtlByPattern(pattern: string, ttl: number): Promise<void>;

    /** 检查 key 是否存在 */
    exists(key: string): Promise<boolean>;

    /** 计数器 +1（用于限流计数） */
    incr(key: string): Promise<number>;

    /** 写入缓存并设置 TTL（原子操作） */
    setex(key: string, ttl: number, value: unknown): Promise<void>;

    /** 获取 key 剩余 TTL（秒） */
    ttl(key: string): Promise<number>;

    /**
     * 执行 Lua 脚本（原子操作）
     * - Redis 模式：直接 eval
     * - 内存模式：执行传入的 fallback 函数
     * - 用于解决 incr + setex 竞态等需要原子性的场景
     */
    evalLua(
        script: string,
        keys: string[],
        args: (string | number)[],
        fallback: () => Promise<number>,
    ): Promise<number>;

    /**
     * 获取缓存服务运行统计
     * - Redis 模式：从 INFO 命令取 used_memory / uptime_in_seconds / keyspace_hits/misses
     * - 内存模式：返回 "-"（内存模式没有这些概念）
     * - 用于管理后台"缓存管理"页面的统计卡片
     */
    getStats(): Promise<ICacheStats>;

    /**
     * 获取指定 key 的数据类型（string / hash / list / set / zset / stream / none）
     * - Redis 模式：调用 TYPE 命令
     * - 内存模式：所有 key 都视作 string
     * - 用于管理后台"缓存管理"页面的"类型"列
     */
    getKeyType(key: string): Promise<string>;

    /**
     * 按模式扫描所有匹配的 key
     * - Redis 模式：使用 SCAN 命令遍历
     * - 内存模式：遍历 Map keys 匹配
     * - 用于管理后台"缓存管理"页面的 key 列表
     */
    scanKeys(pattern: string, count?: number): Promise<string[]>;
}

/** 缓存服务注入 Token — 用于 NestJS DI */
export const CACHE_SERVICE_TOKEN = 'ICacheService';
