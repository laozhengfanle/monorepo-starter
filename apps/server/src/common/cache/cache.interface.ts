/** CacheService 的依赖注入 token（避免直接依赖类，便于测试替换） */
export const CACHE_SERVICE_TOKEN = Symbol('CACHE_SERVICE');

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
}
