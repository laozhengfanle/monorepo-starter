import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AuditLogService } from './audit-log.service.js';
import {
  AuditLogItemType,
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
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, nullable: true, defaultValue: 20 }) pageSize: number,
    @Args('action', { type: () => String, nullable: true }) action?: string,
    @Args('resourceType', { type: () => String, nullable: true }) resourceType?: string,
    @Args('startDate', { type: () => String, nullable: true }) startDate?: string,
    @Args('endDate', { type: () => String, nullable: true }) endDate?: string,
  ): Promise<PaginatedAuditLogsType> {
    const result = await this.auditLogService.findAll({
      page,
      pageSize,
      action: action ?? undefined,
      resourceType: resourceType ?? undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
    });
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
    @Args('action', { type: () => String, nullable: true }) action?: string,
    @Args('resourceType', { type: () => String, nullable: true }) resourceType?: string,
    @Args('startDate', { type: () => String, nullable: true }) startDate?: string,
    @Args('endDate', { type: () => String, nullable: true }) endDate?: string,
  ): Promise<AuditLogItemType[]> {
    return this.auditLogService.exportLogs({
      action: action ?? undefined,
      resourceType: resourceType ?? undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
    });
  }

  @Mutation(() => ClearAuditLogsResultType)
  @RequirePermission('config:audit:clear')
  clearAuditLogs(@CurrentUser() user: AuthUser): Promise<ClearAuditLogsResultType> {
    return this.auditLogService.clear(user.accountId);
  }

  @Mutation(() => Boolean)
  @RequirePermission('config:audit:delete')
  async deleteAuditLog(@Args('id', { type: () => ID }) id: string): Promise<boolean> {
    await this.auditLogService.deleteOne(id);
    return true;
  }
}
