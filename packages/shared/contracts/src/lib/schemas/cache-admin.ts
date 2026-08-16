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

/** 缓存 key 列表查询参数（分页 + 匹配模式） */
export const CacheListQuerySchema = z.object({
  /** 匹配模式（Redis glob，如 admin:session:*），不传默认全量 */
  pattern: z.string().max(200, '匹配模式最多 200 个字符').optional(),
  offset: z.coerce.number().int().min(0).default(0),
  /** 单页上限 500，防止 OOM */
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type CacheListQuery = z.infer<typeof CacheListQuerySchema>;

/** 批量删除缓存 key 入参（单次上限 1000） */
export const DeleteCacheKeysInputSchema = z.object({
  keys: z
    .array(z.string().min(1, 'key 不能为空'))
    .min(1, '至少选择一个 key')
    .max(1000, '单次最多删除 1000 个 key'),
});

export type DeleteCacheKeysInput = z.infer<typeof DeleteCacheKeysInputSchema>;

/** 按模式清空缓存入参 */
export const ClearCachePatternInputSchema = z.object({
  pattern: z.string().min(1, '请输入匹配模式').max(200, '匹配模式最多 200 个字符'),
});

export type ClearCachePatternInput = z.infer<typeof ClearCachePatternInputSchema>;

/** 批量删除结果 */
export const DeleteCacheKeysResultSchema = z.object({
  /** 实际删除数 */
  deletedCount: z.number().int().nonnegative(),
  /** 请求的 key 列表 */
  keys: z.array(z.string()),
});

export type DeleteCacheKeysResult = z.infer<typeof DeleteCacheKeysResultSchema>;
