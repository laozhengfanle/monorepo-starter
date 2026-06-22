/**
 * 缓存管理 GraphQL ObjectType
 *
 * 用途：管理后台"缓存管理"页面，展示当前缓存里的 key 列表 + 统计信息
 *
 * 设计：
 * - CacheKey：一行缓存记录（key + 类型 + TTL + 序列化后的值）
 * - CacheStats：聚合统计（已用内存 / 命中率 / 运行时长）
 * - DeleteCacheKeysResult：批量删除结果（删除条数 + 命中的 key 列表，便于 UI 反馈）
 *
 * 注意：value 字段是 string（JSON 序列化后的字符串），不在 GraphQL 层做 JSON.parse —
 *       前端按需 parse 后渲染，避免 GraphQLJSONObject 在某些客户端（移动端）兼容性差。
 */
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

// ============================================================
// 单条缓存 key
// ============================================================

/**
 * 缓存 key 详情
 *
 * - key: 完整 key 字符串（带前缀，如 mono:auth:login:user-1）
 * - type: Redis TYPE 命令返回值（string / hash / list / set / zset / stream / none / unknown）
 * - ttl: 剩余过期时间（秒）；-1 表示无 TTL（永不过期），-2 表示 key 不存在
 * - value: 已序列化的值（JSON 字符串）；null 表示 key 不存在或值为空
 * - size: 字符串长度（字节近似值），用于前端展示"占用大小"
 */
@ObjectType('CacheKey', { description: '缓存 key 详情' })
export class CacheKey {
    @Field(() => ID, { description: '缓存 key 字符串' })
    key!: string;

    @Field(() => String, { description: '数据类型（Redis TYPE 返回值）' })
    type!: string;

    @Field(() => Int, { description: '剩余 TTL（秒）；-1 = 永不过期；-2 = 已过期/不存在' })
    ttl!: number;

    @Field(() => String, {
        nullable: true,
        description: '缓存值（JSON 字符串形式）；null = 空值/不可序列化',
    })
    value!: string | null;

    @Field(() => Int, { description: '值字节长度（字符串 length；仅作 UI 展示，非精确字节数）' })
    size!: number;
}

// ============================================================
// 缓存服务统计
// ============================================================

/**
 * 缓存服务聚合统计
 *
 * - 内存模式 / Redis 不可用时，三个字段都返回 "-"
 * - 用于页面顶部的 3 个统计卡片
 */
@ObjectType('CacheStats', { description: '缓存服务运行统计' })
export class CacheStats {
    @Field(() => String, { description: '已用内存（人类可读，如 "1.23 MB"）；无 Redis 时返回 "-"' })
    usedMemory!: string;

    @Field(() => String, { description: '命中率（百分比字符串，如 "87.50%"）；无命中样本时返回 "-"' })
    hitRate!: string;

    @Field(() => String, { description: '运行时长（人类可读，如 "3 天 5 小时"）；无 Redis 时返回 "-"' })
    uptime!: string;
}

// ============================================================
// 批量删除结果
// ============================================================

/**
 * 批量删除缓存 key 的结果
 *
 * - deletedCount: 实际删除的 key 数量（可能 < requestedCount，取决于并发失效）
 * - keys: 被成功删除的 key 列表（供前端展示"已删除以下 key"）
 */
@ObjectType('DeleteCacheKeysResult', { description: '批量删除缓存 key 的结果' })
export class DeleteCacheKeysResult {
    @Field(() => Int, { description: '实际删除的 key 数量' })
    deletedCount!: number;

    @Field(() => [String], { description: '被成功删除的 key 列表' })
    keys!: string[];
}
