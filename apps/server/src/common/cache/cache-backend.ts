/**
 * 缓存后端抽象接口
 *
 * 背景：
 * - CacheService 原本在 get / set / del 等每个方法里都做 `if (this.redis) ... else memoryStore` 分支
 * - 大量重复代码 + 关注点混杂（IO 细节 / 序列化 / TTL 过期 / 业务编排混在一个类里）
 *
 * 设计：
 * - CacheBackend 是底层"键值存储 + 模式匹配 + 计数器"能力的统一抽象
 * - 编排层（CacheService）只做：选 backend、生命周期、错误节流、对外暴露一致 API
 * - 内存 / Redis 两套实现各自独立，遵守同一接口，可独立替换
 *
 * 重要约定：
 * - 所有方法都是 async（即使内存实现也返回 Promise），让调用方代码无差别
 * - 大多数方法都是"通用 KV"语义，不区分 JSON 解析与否（编排层处理序列化）
 * - getStats / quit 标记为可选（某些 backend 可能不支持这些能力）
 */
import type { ICacheStats } from './cache.interface.js';

/** 缓存后端接口 */
export interface CacheBackend {
    /** 读取缓存值（未命中返回 null） */
    get<T>(key: string): Promise<T | null>;

    /** 写入缓存（ttl 可选，单位秒） */
    set(key: string, value: unknown, ttl?: number): Promise<void>;

    /** 写入缓存并设置 TTL（原子操作） */
    setex(key: string, ttl: number, value: unknown): Promise<void>;

    /** 删除单个 key */
    del(key: string): Promise<void>;

    /** 批量删除（一次 DEL 多个 key，Redis 原子操作） */
    delMany(keys: string[]): Promise<void>;

    /** 按模式批量删除（Redis 用 SCAN，内存用 Map 遍历+正则） */
    delByPattern(pattern: string): Promise<void>;

    /** 批量读取 */
    mget<T>(keys: string[]): Promise<(T | null)[]>;

    /** 按模式批量设置 TTL（防雪崩用） */
    setTtlByPattern(pattern: string, ttl: number): Promise<void>;

    /** 检查 key 是否存在 */
    exists(key: string): Promise<boolean>;

    /** 计数器 +1（用于限流计数） */
    incr(key: string): Promise<number>;

    /** 获取 key 剩余 TTL（秒），-1 表示无 TTL，-2 表示 key 不存在 */
    ttl(key: string): Promise<number>;

    /**
     * 执行 Lua 脚本（原子操作）
     * - Redis backend: 用 ioredis.eval 执行
     * - 内存 backend: 通常抛错（编排层 evalLua 会在内存模式走 fallback 路径）
     */
    evalLua(script: string, keys: string[], args: (string | number)[]): Promise<number>;

    /**
     * 获取 key 的数据类型（string / hash / list / set / zset / stream / none）
     * - Redis backend: 调 TYPE 命令
     * - 内存 backend: 固定返回 'string'
     */
    getKeyType(key: string): Promise<string>;

    /**
     * 按模式扫描所有匹配的 key
     * - Redis backend: 使用 SCAN（生产安全，不用 KEYS *）
     * - 内存 backend: 遍历 Map + 正则匹配
     */
    scanKeys(pattern: string, count?: number): Promise<string[]>;

    /** 获取后端运行统计（用于管理后台；可选实现） */
    getStats?(): Promise<ICacheStats>;

    /** 关闭底层连接（仅 Redis 需要；可选实现） */
    quit?(): Promise<void>;
}
