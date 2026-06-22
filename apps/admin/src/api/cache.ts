/**
 * 缓存管理 API
 *
 * 接口拆分：
 *   - GraphQL Query：list keys / 单个 key / 缓存统计
 *   - GraphQL Mutation：删除单条 / 批量删除 / 按 pattern 清空
 *
 * 后端路由对照：
 *   GraphQL query { cacheKeys(pattern, offset, limit) }        → 分页列出缓存 key
 *   GraphQL query { cacheKeyTotal(pattern) }                   → 上面那个分页的 total
 *   GraphQL query { cacheKey(key) }                            → 查询单个 key 详情
 *   GraphQL query { cacheStats }                               → 缓存服务聚合统计
 *   GraphQL mutation { deleteCacheKey(key) }                   → 删除单个 key
 *   GraphQL mutation { deleteCacheKeys(keys) }                 → 批量删除
 *   GraphQL mutation { clearCacheByPattern(pattern) }          → 按 pattern 清空
 *
 * 权限码：
 *   - config:cache:view → 所有 Query
 *   - config:cache:delete → 所有 Mutation
 */
import { gqlQuery } from '@/shared/request/graphql-client';

// ============================================================
// 类型
// ============================================================

/** 缓存 key 行（前端表格用） */
export interface CacheKeyRow {
    /** 完整 key 字符串 */
    key: string;
    /** Redis TYPE 返回值（string / hash / list / set / zset / stream / none / unknown） */
    type: string;
    /** 剩余 TTL（秒）；-1 = 永不过期；-2 = 已过期/不存在 */
    ttl: number;
    /** 缓存值（JSON 字符串）；null = 空值/不可序列化 */
    value: string | null;
    /** 字符串 length（UI 展示用，非真实字节数） */
    size: number;
}

/** 缓存服务统计 */
export interface CacheStatsRow {
    usedMemory: string;
    hitRate: string;
    uptime: string;
}

/** 批量删除结果 */
export interface DeleteCacheKeysResult {
    deletedCount: number;
    keys: string[];
}

// ============================================================
// GraphQL Query
// ============================================================

/**
 * 按 pattern 分页列出缓存 key
 *
 * @param pattern SCAN MATCH 模式（默认 '*' 列出全部）
 * @param offset  跳过前 N 条（默认 0）
 * @param limit   返回条数（默认 50，后端硬上限 500）
 */
export async function listCacheKeys(params?: {
    pattern?: string;
    offset?: number;
    limit?: number;
}): Promise<CacheKeyRow[]> {
    const data = await gqlQuery<{ cacheKeys: CacheKeyRow[] }>(
        `
            query CacheKeys($pattern: String, $offset: Int, $limit: Int) {
                cacheKeys(pattern: $pattern, offset: $offset, limit: $limit) {
                    key
                    type
                    ttl
                    value
                    size
                }
            }
        `,
        {
            variables: {
                pattern: params?.pattern || '*',
                offset: params?.offset ?? 0,
                limit: params?.limit ?? 50,
            },
        },
    );
    return data.cacheKeys;
}

/**
 * 获取按 pattern 匹配的总条数（用于分页）
 *
 * @param pattern SCAN MATCH 模式
 */
export async function getCacheKeyTotal(pattern?: string): Promise<number> {
    const data = await gqlQuery<{ cacheKeyTotal: number }>(
        `
            query CacheKeyTotal($pattern: String) {
                cacheKeyTotal(pattern: $pattern)
            }
        `,
        { variables: { pattern: pattern || '*' } },
    );
    return data.cacheKeyTotal;
}

/**
 * 查询单个 key 的完整信息
 */
export async function getCacheKey(key: string): Promise<CacheKeyRow> {
    const data = await gqlQuery<{ cacheKey: CacheKeyRow }>(
        `
            query CacheKey($key: String!) {
                cacheKey(key: $key) {
                    key
                    type
                    ttl
                    value
                    size
                }
            }
        `,
        { variables: { key } },
    );
    return data.cacheKey;
}

/**
 * 缓存服务聚合统计（用于页面顶部 3 个统计卡片）
 */
export async function getCacheStats(): Promise<CacheStatsRow> {
    const data = await gqlQuery<{ cacheStats: CacheStatsRow }>(
        `
            query CacheStats {
                cacheStats {
                    usedMemory
                    hitRate
                    uptime
                }
            }
        `,
    );
    return data.cacheStats;
}

// ============================================================
// GraphQL Mutation
// ============================================================

/**
 * 删除单个 key
 *
 * @returns true = 已删除；false = key 不存在
 */
export async function deleteCacheKey(key: string): Promise<boolean> {
    const data = await gqlQuery<{ deleteCacheKey: boolean }>(
        `
            mutation DeleteCacheKey($key: String!) {
                deleteCacheKey(key: $key)
            }
        `,
        { variables: { key } },
    );
    return data.deleteCacheKey;
}

/**
 * 批量删除多个 key（后端硬上限 1000/次）
 */
export async function deleteCacheKeys(keys: string[]): Promise<DeleteCacheKeysResult> {
    const data = await gqlQuery<{ deleteCacheKeys: DeleteCacheKeysResult }>(
        `
            mutation DeleteCacheKeys($keys: [String!]!) {
                deleteCacheKeys(keys: $keys) {
                    deletedCount
                    keys
                }
            }
        `,
        { variables: { keys } },
    );
    return data.deleteCacheKeys;
}

/**
 * 按 pattern 批量删除（危险操作，UI 需二次确认）
 *
 * @returns 实际删除的 key 数量
 *
 * 后端会校验：pattern 不能只含通配符 / 不能以 * 开头
 */
export async function clearCacheByPattern(pattern: string): Promise<number> {
    const data = await gqlQuery<{ clearCacheByPattern: number }>(
        `
            mutation ClearCacheByPattern($pattern: String!) {
                clearCacheByPattern(pattern: $pattern)
            }
        `,
        { variables: { pattern } },
    );
    return data.clearCacheByPattern;
}
