import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminMenuResolver } from './admin-menu.resolver.js';
import { AdminMenuService } from './admin-menu.service.js';

/** 菜单/权限点管理模块（菜单与权限同一张表，GraphQL 数据网关） */
@Module({
  imports: [AuthModule],
  providers: [AdminMenuService, AdminMenuResolver],
  exports: [AdminMenuService],
})
export class AdminMenuModule {}
