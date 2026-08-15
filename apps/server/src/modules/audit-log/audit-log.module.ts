import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogResolver } from './audit-log.resolver.js';
import { AuditLogService } from './audit-log.service.js';

/** 审计日志模块（分页/筛选/清空/导出，GraphQL + REST 双协议，权限 config:audit:*） */
@Module({
  imports: [AuthModule],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogResolver],
  exports: [AuditLogService],
})
export class AuditLogModule {}
