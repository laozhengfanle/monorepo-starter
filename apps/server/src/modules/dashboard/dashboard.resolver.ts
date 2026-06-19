/**
 * Dashboard GraphQL Resolver — 6 个只读 Query
 *
 * 权限码（2026-06 新增 dashboard:* 体系）：
 * - dashboard:welcome     欢迎页权限（基础，welcome + analysis 共有 stats 走 OR）
 * - dashboard:analytics   分析页权限（高级，仅 trend/distribution/operationLogs）
 *
 * 为什么 stats 用 OR 语义：
 *   - 4 个 stat 卡片是 welcome 页的核心内容（必须可访问）
 *   - analysis 页同样展示这 4 个 stat
 *   - 任意一个权限即可通过，避免给 welcome 用户加 analytics 权限
 *
 * 历史：
 *   - 之前用 @Permission('iam:admin:view') 是硬编码"借来的"权限码，导致 guest 角色进任何 dashboard 页面都 403
 *   - 现在改为 dashboard:* 系列，UI 端可通过角色管理灵活分配，不再硬编码
 */
import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { AdminPermissionGuard } from '../../common/guards/admin-permission.guard.js';
import { RequireAuth } from '../../common/decorators/require-auth.decorator.js';
import { LoginOnly } from '../../common/decorators/login-only.decorator.js';
import { Permission } from '../../common/decorators/permission.decorator.js';
import { DashboardService } from './dashboard.service.js';
import { StatCard, TrendItem, DistItem, PaginatedOperationLog, QuickEntry, Notice } from './dashboard.type.js';

@Resolver()
@RequireAuth()
@UseGuards(JwtAuthGuard, AdminPermissionGuard)
export class DashboardResolver {
    constructor(private readonly dashboardService: DashboardService) {}

    /**
     * 仪表盘统计卡片（4 个数字）
     * - welcome 页和 analysis 页都用
     * - 任意一个 dashboard 权限即可访问（OR）
     */
    @Query(() => [StatCard])
    @Permission('dashboard:welcome', 'dashboard:analytics')
    async dashboardStats() {
        return this.dashboardService.getStats();
    }

    /**
     * 仪表盘趋势数据（按天/周/月）
     * - 仅 analysis 页用，要求 dashboard:analytics
     */
    @Query(() => [TrendItem])
    @Permission('dashboard:analytics')
    async dashboardTrend(@Args('range', { type: () => String, defaultValue: 'week' }) range: string) {
        return this.dashboardService.getTrend(range);
    }

    /**
     * 仪表盘分布数据（如角色分布、状态分布）
     * - 仅 analysis 页用，要求 dashboard:analytics
     */
    @Query(() => [DistItem])
    @Permission('dashboard:analytics')
    async dashboardDistribution() {
        return this.dashboardService.getDistribution();
    }

    /**
     * 仪表盘最近操作日志（分页）
     * - 仅 analysis 页用，要求 dashboard:analytics
     */
    @Query(() => PaginatedOperationLog)
    @Permission('dashboard:analytics')
    async dashboardOperationLogs(
        @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
        @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
    ) {
        return this.dashboardService.getOperationLogs(page, pageSize);
    }

    /**
     * 仪表盘快捷入口
     * - welcome 页用，所有登录用户可见，无权限点击后前端路由守卫跳 403
     */
    @Query(() => [QuickEntry])
    @LoginOnly()
    async dashboardQuickEntries() {
        return this.dashboardService.getQuickEntries();
    }

    /**
     * 仪表盘公告/通知
     * - welcome 页用，要求 dashboard:welcome
     */
    @Query(() => [Notice])
    @Permission('dashboard:welcome')
    async dashboardNotices() {
        return this.dashboardService.getNotices();
    }
}
