import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditLogResolver } from './audit-log.resolver.js';
import { AuditLogService } from './audit-log.service.js';

/** 审计日志模块（分页/筛选/清空/导出，GraphQL 数据网关，权限 config:audit:*） */
@Module({
  imports: [AuthModule],
  providers: [AuditLogService, AuditLogResolver],
  exports: [AuditLogService],
})
export class AuditLogModule {}
