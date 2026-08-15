import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminRoleController } from './admin-role.controller.js';
import { AdminRoleResolver } from './admin-role.resolver.js';
import { AdminRoleService } from './admin-role.service.js';

/** 角色管理模块（角色 CRUD + 权限点分配） */
@Module({
  imports: [AuthModule],
  controllers: [AdminRoleController],
  providers: [AdminRoleService, AdminRoleResolver],
})
export class AdminRoleModule {}
