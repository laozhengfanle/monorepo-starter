/**
 * 审计日志 GraphQL Resolver
 *
 * Query:
 * - adminLogs: 分页查询审计日志
 * - exportAuditLogs: 导出审计日志（不分页，全量返回）
 *
 * Mutation:
 * - clearAuditLogs: 清空所有审计日志
 * - deleteAuditLog: 删除单条审计日志
 *
 * 权限码：config:audit:view / config:audit:clear / config:audit:export
 */
import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { AdminPermissionGuard } from '../../../common/guards/admin-permission.guard.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { RequireAuth } from '../../../common/decorators/require-auth.decorator.js';
import { Paginated, type PaginatedType } from '../../graphql/common/pagination.type.js';
import { AuditLog, ClearAuditLogsResult } from './audit-log.type.js';
import { AuditService } from '../../audit/audit.service.js';

const PaginatedAuditLog = Paginated(AuditLog, 'PaginatedAuditLog');

interface AuditLogItem {
    id: string;
    accountId: string | null;
    accountUsername: string | null;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    detail: unknown;
    ip: string | null;
    userAgent: string | null;
    createdAt: Date;
}

interface GraphQLContext {
    req: { user: { accountId: string; userType: string } };
}

@Resolver(() => AuditLog)
@RequireAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class AuditLogResolver {
    constructor(private readonly auditService: AuditService) {}

    @Query(() => PaginatedAuditLog, { description: '分页查询审计日志' })
    @Permission('config:audit:view')
    async adminLogs(
        @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
        @Args('pageSize', { type: () => Int, defaultValue: 20 }) pageSize: number,
        @Args('action', { type: () => String, nullable: true }) action?: string,
        @Args('resourceType', { type: () => String, nullable: true }) resourceType?: string,
        @Args('startDate', { type: () => Date, nullable: true }) startDate?: Date,
        @Args('endDate', { type: () => Date, nullable: true }) endDate?: Date,
    ): Promise<PaginatedType<AuditLog>> {
        const result = await this.auditService.findAll({
            page,
            pageSize,
            action: action ?? undefined,
            resourceType: resourceType ?? undefined,
            startDate: startDate ?? undefined,
            endDate: endDate ?? undefined,
        });

        return {
            items: result.items.map((item: AuditLogItem) => ({
                id: item.id,
                accountId: item.accountId ?? undefined,
                accountUsername: item.accountUsername ?? undefined,
                action: item.action,
                resourceType: item.resourceType ?? undefined,
                resourceId: item.resourceId ?? undefined,
                detail: item.detail ? JSON.stringify(item.detail) : undefined,
                ip: item.ip ?? undefined,
                userAgent: item.userAgent ?? undefined,
                createdAt: item.createdAt,
            })),
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
        };
    }

    /**
     * 清空所有审计日志（硬删除，不可恢复）
     * - 权限码：config:audit:clear
     * - 返回被删除的记录数
     */
    @Mutation(() => ClearAuditLogsResult, { description: '清空所有审计日志' })
    @Permission('config:audit:clear')
    async clearAuditLogs(@Context() ctx: GraphQLContext): Promise<{ deletedCount: number }> {
        return this.auditService.clear(ctx.req.user.accountId);
    }

    /**
     * 删除单条审计日志（硬删除）
     * - 权限码：config:audit:delete
     */
    @Mutation(() => Boolean, { description: '删除单条审计日志' })
    @Permission('config:audit:delete')
    async deleteAuditLog(@Args('id', { type: () => ID, nullable: false }) id: string): Promise<boolean> {
        await this.auditService.deleteOne(id);
        return true;
    }

    /**
     * 导出审计日志（不分页，返回全部匹配记录，上限 10000 条）
     * - 权限码：config:audit:export
     * - 筛选条件与 adminLogs 一致，但不分页
     */
    @Query(() => [AuditLog], { description: '导出审计日志（全量，上限 10000 条）' })
    @Permission('config:audit:export')
    async exportAuditLogs(
        @Args('action', { type: () => String, nullable: true }) action?: string,
        @Args('resourceType', { type: () => String, nullable: true }) resourceType?: string,
        @Args('startDate', { type: () => Date, nullable: true }) startDate?: Date,
        @Args('endDate', { type: () => Date, nullable: true }) endDate?: Date,
    ): Promise<AuditLog[]> {
        const items = await this.auditService.exportLogs({
            action: action ?? undefined,
            resourceType: resourceType ?? undefined,
            startDate: startDate ?? undefined,
            endDate: endDate ?? undefined,
        });

        return items.map((item: AuditLogItem) => ({
            id: item.id,
            accountId: item.accountId ?? undefined,
            accountUsername: item.accountUsername ?? undefined,
            action: item.action,
            resourceType: item.resourceType ?? undefined,
            resourceId: item.resourceId ?? undefined,
            detail: item.detail ? JSON.stringify(item.detail) : undefined,
            ip: item.ip ?? undefined,
            userAgent: item.userAgent ?? undefined,
            createdAt: item.createdAt,
        }));
    }
}
