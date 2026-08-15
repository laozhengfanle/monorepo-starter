import { z } from 'zod';

/**
 * 缓存管理（Redis 运行时数据）契约
 * - 无 DB 表，操作 CacheService 的运行时 KV
 * - 权限点：config:cache:view（列表/详情/统计）/ config:cache:delete（删除类）
 */

/** 缓存 key 项（列表/详情） */
export const CacheKeySchema = z.object({
  key: z.string(),
  /** Redis TYPE：string / hash / list / set / zset / stream */
  type: z.string(),
  /** TTL 秒：-1 永不过期 / -2 不存在 */
  ttl: z.number().int(),
  /** 值（JSON 字符串或原文） */
  value: z.string().nullable(),
  /** 展示用大小（字符串 length，非真实字节数） */
  size: z.number().int().nonnegative(),
});

export type CacheKey = z.infer<typeof CacheKeySchema>;

/** 缓存统计（Redis INFO 解析，失败降级 '-'） */
export const CacheStatsSchema = z.object({
  /** 已用内存，如 "1.23 MB" */
  usedMemory: z.string(),
  /** 命中率，如 "87.50%" */
  hitRate: z.string(),
  /** 运行时长，如 "3 天 5 小时" */
  uptime: z.string(),
});

export type CacheStats = z.infer<typeof CacheStatsSchema>;

/** 批量删除结果 */
export const DeleteCacheKeysResultSchema = z.object({
  /** 实际删除数 */
  deletedCount: z.number().int().nonnegative(),
  /** 请求的 key 列表 */
  keys: z.array(z.string()),
});

export type DeleteCacheKeysResult = z.infer<typeof DeleteCacheKeysResultSchema>;
