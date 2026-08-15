import { Controller, Delete, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { QueryAuditLogsDto } from '@starter/server-core';
import type { AuditLogItem, ClearAuditLogsResult } from '@starter/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AuditLogService } from './audit-log.service.js';

/** 审计日志 REST 端点（权限 config:audit:*） */
@ApiTags('admin-audit-logs')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermission('config:audit:view')
  @ApiOkResponse({ description: '审计日志分页列表（action/resourceType/时间区间筛选）' })
  list(@Query() query: QueryAuditLogsDto): Promise<{
    items: AuditLogItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.auditLogService.findAll(query);
  }

  @Get('export')
  @RequirePermission('config:audit:export')
  @ApiOkResponse({ description: '导出审计日志（全量，上限 10000 条）' })
  export(@Query() query: QueryAuditLogsDto): Promise<AuditLogItem[]> {
    return this.auditLogService.exportLogs(query);
  }

  @Delete()
  @RequirePermission('config:audit:clear')
  @ApiOkResponse({ description: '清空所有审计日志（硬删除，不可恢复）' })
  clear(@CurrentUser() user: AuthUser): Promise<ClearAuditLogsResult> {
    return this.auditLogService.clear(user.accountId);
  }

  @Delete(':id')
  @RequirePermission('config:audit:delete')
  @ApiOkResponse({ description: '删除单条审计日志' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ success: true }> {
    await this.auditLogService.deleteOne(id);
    return { success: true };
  }
}
