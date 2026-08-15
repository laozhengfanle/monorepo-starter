import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminMenuController } from './admin-menu.controller.js';
import { AdminMenuResolver } from './admin-menu.resolver.js';
import { AdminMenuService } from './admin-menu.service.js';

/** 菜单/权限点管理模块（菜单与权限同一张表，GraphQL + REST 双协议） */
@Module({
  imports: [AuthModule],
  controllers: [AdminMenuController],
  providers: [AdminMenuService, AdminMenuResolver],
  exports: [AdminMenuService],
})
export class AdminMenuModule {}
