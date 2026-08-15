import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAccountController } from './admin-account.controller.js';
import { AdminAccountResolver } from './admin-account.resolver.js';
import { AdminAccountService } from './admin-account.service.js';

/** 管理端账户模块（Account CRUD + 角色分配） */
@Module({
  imports: [AuthModule],
  controllers: [AdminAccountController],
  providers: [AdminAccountService, AdminAccountResolver],
})
export class AdminAccountModule {}
