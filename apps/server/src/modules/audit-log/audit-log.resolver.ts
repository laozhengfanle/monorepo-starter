import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import type { AuditLogQuery } from '@starter/contracts';
import { AuditLogQuerySchema } from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AuditLogService } from './audit-log.service.js';
import {
  AuditLogItemType,
  AuditLogQueryInputType,
  ClearAuditLogsResultType,
  PaginatedAuditLogsType,
} from './audit-log.type.js';

/** 审计日志 GraphQL Resolver（权限 config:audit:*） */
@Resolver(() => AuditLogItemType)
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AuditLogResolver {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Query(() => PaginatedAuditLogsType)
  @RequirePermission('config:audit:view')
  async adminLogs(
    @Args(
      'query',
      { type: () => AuditLogQueryInputType },
      new ZodArgsPipe(AuditLogQuerySchema),
    )
    query: AuditLogQuery,
  ): Promise<PaginatedAuditLogsType> {
    const result = await this.auditLogService.findAll(query);
    return {
      items: result.items as AuditLogItemType[],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  @Query(() => [AuditLogItemType])
  @RequirePermission('config:audit:export')
  async exportAuditLogs(
    @Args(
      'query',
      { type: () => AuditLogQueryInputType },
      new ZodArgsPipe(AuditLogQuerySchema),
    )
    query: AuditLogQuery,
  ): Promise<AuditLogItemType[]> {
    return this.auditLogService.exportLogs({
      action: query.action,
      resourceType: query.resourceType,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Mutation(() => ClearAuditLogsResultType)
  @RequirePermission('config:audit:clear')
  clearAuditLogs(
    @CurrentUser() user: AuthUser,
  ): Promise<ClearAuditLogsResultType> {
    return this.auditLogService.clear(user.accountId);
  }

  @Mutation(() => Boolean)
  @RequirePermission('config:audit:delete')
  async deleteAuditLog(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<boolean> {
    await this.auditLogService.deleteOne(id, user.accountId);
    return true;
  }
}
