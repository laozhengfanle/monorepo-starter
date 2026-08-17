import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CacheAdminService } from './cache-admin.service.js';
import {
  CacheKeyType,
  CacheStatsType,
  DeleteCacheKeysResultType,
} from './cache-admin.type.js';

/** 缓存管理 GraphQL Resolver（权限 config:cache:*） */
@Resolver(() => CacheKeyType)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CacheAdminResolver {
  constructor(private readonly cacheAdminService: CacheAdminService) {}

  @Query(() => [CacheKeyType])
  @RequirePermission('config:cache:view')
  async cacheKeys(
    @Args('pattern', { type: () => String, nullable: true, defaultValue: '*' })
    pattern: string,
    @Args('offset', { type: () => Int, nullable: true, defaultValue: 0 })
    offset: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 })
    limit: number,
  ): Promise<CacheKeyType[]> {
    const result = await this.cacheAdminService.listKeys({
      pattern,
      offset,
      limit,
    });
    return result.items as CacheKeyType[];
  }

  /** 单独取 total（与列表分离，避免翻页重拉详情） */
  @Query(() => Int)
  @RequirePermission('config:cache:view')
  async cacheKeyTotal(
    @Args('pattern', { type: () => String, nullable: true, defaultValue: '*' })
    pattern: string,
  ): Promise<number> {
    const result = await this.cacheAdminService.listKeys({
      pattern,
      offset: 0,
      limit: 1,
    });
    return result.total;
  }

  @Query(() => CacheKeyType)
  @RequirePermission('config:cache:view')
  cacheKey(
    @Args('key', { type: () => String }) key: string,
  ): Promise<CacheKeyType> {
    return this.cacheAdminService.getValue(key);
  }

  @Query(() => CacheStatsType)
  @RequirePermission('config:cache:view')
  cacheStats(): Promise<CacheStatsType> {
    return this.cacheAdminService.getStats();
  }

  @Mutation(() => Boolean)
  @RequirePermission('config:cache:delete')
  deleteCacheKey(
    @Args('key', { type: () => String }) key: string,
    @CurrentUser() user: AuthUser,
  ): Promise<boolean> {
    return this.cacheAdminService.delete(key, user.accountId);
  }

  @Mutation(() => DeleteCacheKeysResultType)
  @RequirePermission('config:cache:delete')
  deleteCacheKeys(
    @Args('keys', { type: () => [String] }) keys: string[],
    @CurrentUser() user: AuthUser,
  ): Promise<DeleteCacheKeysResultType> {
    return this.cacheAdminService.deleteKeys(keys, user.accountId);
  }

  @Mutation(() => Int)
  @RequirePermission('config:cache:delete')
  clearCacheByPattern(
    @Args('pattern', { type: () => String }) pattern: string,
    @CurrentUser() user: AuthUser,
  ): Promise<number> {
    return this.cacheAdminService.clearByPattern(pattern, user.accountId);
  }
}
