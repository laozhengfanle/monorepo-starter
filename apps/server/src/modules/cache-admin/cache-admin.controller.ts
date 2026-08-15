import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { CacheKey, CacheStats, DeleteCacheKeysResult } from '@starter/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CacheAdminService } from './cache-admin.service.js';

/** 缓存管理 REST 端点（权限 config:cache:*） */
@ApiTags('admin-cache')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/cache')
export class CacheAdminController {
  constructor(private readonly cacheAdminService: CacheAdminService) {}

  @Get('keys')
  @RequirePermission('config:cache:view')
  @ApiOkResponse({ description: '按 pattern 列出缓存 key（分页，limit ≤ 500）' })
  listKeys(
    @Query('pattern') pattern = '*',
    @Query('offset') offset = '0',
    @Query('limit') limit = '50',
  ): Promise<{ items: CacheKey[]; total: number }> {
    return this.cacheAdminService.listKeys(pattern, Number(offset) || 0, Number(limit) || 50);
  }

  @Get('stats')
  @RequirePermission('config:cache:view')
  @ApiOkResponse({ description: '缓存运行统计（Redis INFO；内存模式降级）' })
  getStats(): Promise<CacheStats> {
    return this.cacheAdminService.getStats();
  }

  @Get('key/:key')
  @RequirePermission('config:cache:view')
  @ApiOkResponse({ description: '查询单个 key 完整信息' })
  getValue(@Param('key') key: string): Promise<CacheKey> {
    return this.cacheAdminService.getValue(key);
  }

  @Delete('key/:key')
  @RequirePermission('config:cache:delete')
  @ApiOkResponse({ description: '删除单个 key（不存在返回 false）' })
  delete(@Param('key') key: string): Promise<boolean> {
    return this.cacheAdminService.delete(key);
  }

  @Delete('keys')
  @RequirePermission('config:cache:delete')
  @ApiOkResponse({ description: '批量删除（body: { keys: string[] }，单次 ≤ 1000）' })
  deleteKeys(@Query('keys') keys: string): Promise<DeleteCacheKeysResult> {
    const list = keys ? keys.split(',').filter(Boolean) : [];
    return this.cacheAdminService.deleteKeys(list);
  }

  @Delete('pattern')
  @RequirePermission('config:cache:delete')
  @ApiOkResponse({ description: '按 pattern 清空（安全校验：拒纯通配符/以 * 开头）' })
  clearByPattern(@Query('pattern') pattern: string): Promise<number> {
    return this.cacheAdminService.clearByPattern(pattern);
  }
}
