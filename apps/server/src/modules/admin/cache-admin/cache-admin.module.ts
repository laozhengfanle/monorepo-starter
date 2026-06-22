/**
 * 缓存管理模块
 *
 * - 提供 CacheAdminService（包装 CacheService 做管理语义）
 * - 提供 CacheAdminResolver（GraphQL Query + Mutation）
 *
 * 依赖：CacheModule（@Global）已注入 ICacheService，无需重复 import
 */
import { Module } from '@nestjs/common';
import { CacheAdminService } from './cache-admin.service.js';
import { CacheAdminResolver } from './cache-admin.resolver.js';

@Module({
    providers: [CacheAdminService, CacheAdminResolver],
    exports: [CacheAdminService],
})
export class CacheAdminModule {}
