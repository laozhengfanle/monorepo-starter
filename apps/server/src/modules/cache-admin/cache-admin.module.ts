import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CacheAdminController } from './cache-admin.controller.js';
import { CacheAdminResolver } from './cache-admin.resolver.js';
import { CacheAdminService } from './cache-admin.service.js';

/** 缓存管理模块（Redis 运行时数据，GraphQL + REST 双协议，权限 config:cache:*） */
@Module({
  imports: [AuthModule],
  controllers: [CacheAdminController],
  providers: [CacheAdminService, CacheAdminResolver],
  exports: [CacheAdminService],
})
export class CacheAdminModule {}
