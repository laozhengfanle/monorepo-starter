/**
 * 缓存管理 GraphQL Resolver
 *
 * Query:
 * - cacheKeys(pattern, offset, limit): 按 pattern 分页列出 key 列表
 * - cacheKey(key): 查询单个 key 完整信息
 * - cacheStats: 缓存服务聚合统计
 *
 * Mutation:
 * - deleteCacheKey(key): 删除单个 key
 * - deleteCacheKeys(keys): 批量删除多个 key
 * - clearCacheByPattern(pattern): 按 pattern 批量删除
 *
 * 权限码：
 * - config:cache:view  → 所有 Query
 * - config:cache:delete → 所有 Mutation
 *
 * 安全：
 * - pattern='*' 在 clearCacheByPattern 中被拒绝（防止误操作清空整个 db）
 * - 批量删除的 key 列表上限 1000 条（防止单次请求拖垮 Redis）
 */
import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { AdminPermissionGuard } from '../../../common/guards/admin-permission.guard.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import { GraphQLError } from 'graphql';
import { CacheKey, CacheStats, DeleteCacheKeysResult } from './cache-admin.type.js';
import { CacheAdminService } from './cache-admin.service.js';

/** 单次批量删除上限 */
const MAX_BATCH_DELETE = 1000;

@Resolver()
@RequireAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class CacheAdminResolver {
    constructor(private readonly adminService: CacheAdminService) {}

    // ============================================================
    // Query
    // ============================================================

    /**
     * 按 pattern 分页列出缓存 key
     *
     * - pattern: SCAN MATCH 模式（默认 '*' 列出全部）
     * - offset:  跳过前 N 条（默认 0）
     * - limit:   返回条数（默认 50，上限 500）
     *
     * 权限：config:cache:view
     */
    @Query(() => [CacheKey], { description: '按 pattern 分页列出缓存 key' })
    @Permission('config:cache:view')
    async cacheKeys(
        @Args('pattern', { type: () => String, nullable: true, defaultValue: '*' }) pattern: string,
        @Args('offset', { type: () => Int, nullable: true, defaultValue: 0 }) offset: number,
        @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
    ): Promise<CacheKey[]> {
        const { items } = await this.adminService.listKeys(pattern, offset, limit);
        return items;
    }

    /**
     * 按 pattern 分页列出缓存 key（带 total）
     *
     * - 单独拆一个 Query 是因为 n-data-table 服务端分页需要 total
     * - 与 cacheKeys 配合使用：cacheKeys 拿 items，cacheKeyTotal 拿 total
     *
     * 权限：config:cache:view
     */
    @Query(() => Int, { description: '按 pattern 分页时的 total 数量' })
    @Permission('config:cache:view')
    async cacheKeyTotal(
        @Args('pattern', { type: () => String, nullable: true, defaultValue: '*' }) pattern: string,
    ): Promise<number> {
        const { total } = await this.adminService.listKeys(pattern, 0, 1);
        return total;
    }

    /**
     * 查询单个 key 的完整信息
     *
     * 权限：config:cache:view
     */
    @Query(() => CacheKey, { description: '查询单个 key 的完整信息' })
    @Permission('config:cache:view')
    async cacheKey(@Args('key', { type: () => String, nullable: false }) key: string): Promise<CacheKey> {
        return this.adminService.getValue(key);
    }

    /**
     * 缓存服务聚合统计
     *
     * - 内存模式 / Redis 不可用时，usedMemory/hitRate/uptime 返回 "-"
     * - 用于页面顶部 3 个统计卡片
     *
     * 权限：config:cache:view
     */
    @Query(() => CacheStats, { description: '缓存服务运行统计' })
    @Permission('config:cache:view')
    async cacheStats(): Promise<CacheStats> {
        return this.adminService.getStats();
    }

    // ============================================================
    // Mutation
    // ============================================================

    /**
     * 删除单个 key
     *
     * @returns true = 已删除；false = key 不存在
     *
     * 权限：config:cache:delete
     */
    @Mutation(() => Boolean, { description: '删除单个缓存 key' })
    @Permission('config:cache:delete')
    async deleteCacheKey(@Args('key', { type: () => String, nullable: false }) key: string): Promise<boolean> {
        return this.adminService.deleteOne(key);
    }

    /**
     * 批量删除多个 key
     *
     * - 上限 1000 条/次（防止单次请求拖垮 Redis）
     * - 返回实际删除的 key 列表，便于前端展示"已删除以下 N 条"
     *
     * 权限：config:cache:delete
     */
    @Mutation(() => DeleteCacheKeysResult, { description: '批量删除缓存 key' })
    @Permission('config:cache:delete')
    async deleteCacheKeys(
        @Args('keys', { type: () => [String], nullable: false }) keys: string[],
    ): Promise<DeleteCacheKeysResult> {
        if (keys.length > MAX_BATCH_DELETE) {
            throw new GraphQLError(`单次最多删除 ${MAX_BATCH_DELETE} 个 key，当前传入 ${keys.length} 个。请分批操作。`);
        }
        return this.adminService.deleteMany(keys);
    }

    /**
     * 按 pattern 批量删除
     *
     * 安全：禁止 pattern='*' / pattern='?*' / pattern='*?' 等会清空整个 db 的危险 pattern
     *      （用正则匹配：pattern 中不含具体字符即拒绝）
     *
     * 权限：config:cache:delete
     */
    @Mutation(() => Int, { description: '按 pattern 批量删除缓存 key，返回删除数量' })
    @Permission('config:cache:delete')
    async clearCacheByPattern(
        @Args('pattern', { type: () => String, nullable: false }) pattern: string,
    ): Promise<number> {
        this.assertSafePattern(pattern);
        const result = await this.adminService.deleteByPattern(pattern);
        return result.deletedCount;
    }

    /**
     * 校验 pattern 是否安全（不允许"全匹配"类危险 pattern）
     *
     * 规则：
     *   - 不允许只含通配符（*、?、[]）的 pattern
     *   - 至少要有 1 个具体字符（字母/数字/下划线/冒号/点/连字符等）
     *   - 不允许以 * 开头（避免误操作清整个 db）
     *
     * 例：
     *   ✓  'mono:auth:*'         // 安全
     *   ✓  'mono:user:1'         // 安全
     *   ✗  '*'                    // 危险
     *   ✗  '?*'                   // 危险
     *   ✗  '*'                    // 危险
     *   ✗  '*:login:*'            // 危险
     */
    private assertSafePattern(pattern: string): void {
        if (!pattern || pattern.trim() === '') {
            throw new GraphQLError('pattern 不能为空');
        }
        // 去掉所有通配符后必须还有具体字符
        const stripped = pattern.replace(/[*?[\]]/g, '');
        if (stripped === '') {
            throw new GraphQLError('pattern 不能只含通配符（如 "*"），请指定具体前缀');
        }
        // 不允许以 * 开头
        if (pattern.startsWith('*')) {
            throw new GraphQLError('pattern 不能以 * 开头，会匹配到所有 key');
        }
    }
}
