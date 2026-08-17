import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/permission.decorator.js';
import { DashboardService } from './dashboard.service.js';
import {
  DashboardDistItemType,
  DashboardOpLogPageType,
  DashboardStatType,
  DashboardTrendItemType,
} from './dashboard.type.js';

/**
 * 仪表盘 GraphQL Resolver（只读聚合，BFF 规范）。
 * 分析区块（趋势/分布/操作记录）复用 config:audit:view 权限 ——
 * 它们本质是审计数据的可视化，与审计日志页同一权限门槛，无需新增权限点。
 * 统计卡片登录即可见（super_admin 自动绕过，普通角色默认无 audit 权限时仅统计可见）。
 */
@Resolver()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  /** 统计卡片（登录可见） */
  @Query(() => [DashboardStatType])
  async dashboardStats(): Promise<DashboardStatType[]> {
    return this.dashboardService.getStats();
  }

  /** 敏感操作趋势（周/月/年）—— 需 config:audit:view */
  @Query(() => [DashboardTrendItemType])
  @RequirePermission('config:audit:view')
  async dashboardTrend(
    @Args('range', { type: () => String, defaultValue: 'week' }) range: string,
  ): Promise<DashboardTrendItemType[]> {
    // 归一化：非法值回退 week（NestJS 对字符串字面量联合的反射推断有怪癖，schema 用 String 更稳）
    const normalized = range === 'month' || range === 'year' ? range : 'week';
    return this.dashboardService.getTrend(normalized);
  }

  /** 操作类型分布 —— 需 config:audit:view */
  @Query(() => [DashboardDistItemType])
  @RequirePermission('config:audit:view')
  async dashboardDistribution(): Promise<DashboardDistItemType[]> {
    return this.dashboardService.getDistribution();
  }

  /** 最近操作记录（分页）—— 需 config:audit:view */
  @Query(() => DashboardOpLogPageType)
  @RequirePermission('config:audit:view')
  async dashboardOperationLogs(
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('pageSize', { type: () => Int, defaultValue: 10 }) pageSize: number,
  ): Promise<DashboardOpLogPageType> {
    return this.dashboardService.getOperationLogs(page, pageSize);
  }
}
