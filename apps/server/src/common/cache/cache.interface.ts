/** CacheService 的依赖注入 token（避免直接依赖类，便于测试替换） */
export const CACHE_SERVICE_TOKEN = Symbol('CACHE_SERVICE');

/** 缓存统计（Redis INFO 解析，失败/内存模式降级 '-'） */
export interface CacheStatsInfo {
  /** 已用内存，如 "1.23 MB" */
  usedMemory: string;
  /** 命中率，如 "87.50%" */
  hitRate: string;
  /** 运行时长，如 "3 天 5 小时" */
  uptime: string;
}

/** 缓存服务接口：认证增强（token 黑名单/登录锁定/refresh 存储）依赖的最小操作集 */
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  /** 写入并设置 TTL（秒） */
  setex(key: string, ttl: number, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  /** 按通配符模式批量删除（如 delByPattern('auth:*')） */
  delByPattern(pattern: string): Promise<void>;
  /** 计数器 +1（首次设置 TTL，防永久键） */
  incr(key: string, ttl: number): Promise<number>;
  exists(key: string): Promise<boolean>;
  // ── 缓存管理（运维侧，config:cache:*）──
  /** 按 Redis MATCH 模式列出全部 key（SCAN 游标，禁 KEYS *；内存模式 Map 遍历+正则） */
  scanKeys(pattern: string): Promise<string[]>;
  /** 查询 key 的 Redis TYPE（string/hash/list/set/zset/stream；内存模式恒为 string） */
  getKeyType(key: string): Promise<string>;
  /** 查询 key 的剩余 TTL（秒）：-1 永不过期 / -2 不存在 */
  ttl(key: string): Promise<number>;
  /** 缓存运行统计（Redis INFO；内存模式返回降级值） */
  getStats(): Promise<CacheStatsInfo>;
}
