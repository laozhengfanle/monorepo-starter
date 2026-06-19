/**
 * Dashboard API
 *
 * 接口拆分：
 *   - GraphQL：所有 Dashboard 查询（读操作，灵活组合统计/趋势/分布等）
 *   - RESTful：无（Dashboard 纯展示，无写操作）
 *
 * 后端路由对照：
 *   GraphQL query { dashboardStats }           → 统计卡片
 *   GraphQL query { dashboardTrend }           → 趋势数据
 *   GraphQL query { dashboardDistribution }    → 类别分布
 *   GraphQL query { dashboardOperationLogs }   → 操作记录
 *   GraphQL query { dashboardQuickEntries }    → 快捷入口
 *   GraphQL query { dashboardNotices }         → 系统公告
 */
import { gqlQuery } from '@/shared/request/graphql-client';

// ============================================================
// 类型
// ============================================================

/** 统计卡片 */
export interface StatCard {
    label: string;
    value: number;
    trend: number;
}

/** 趋势图数据点(按风险等级拆分的操作量) */
export interface TrendItem {
    label: string;
    /** 高危操作次数 */
    highRisk: number;
    /** 中危操作次数 */
    midRisk: number;
    /** 低危操作次数 */
    lowRisk: number;
}

/** 分布数据 */
export interface DistItem {
    label: string;
    percent: number;
    color: string;
}

/** 操作记录 */
export interface OpLog {
    id: string;
    user: string;
    /** 用户头衔(角色) */
    title: string;
    /** 头像(DiceBear SVG data URI) */
    avatar: string;
    /** 头衔标签类型 */
    titleColor: 'error' | 'warning' | 'info' | 'success' | 'default';
    content: string;
    type: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'reset' | 'export' | 'import' | 'grant' | 'approve';
    /** 业务模块 */
    module: string;
    ip: string;
    time: string;
}

/** 操作记录分页响应 */
export interface OpLogPage {
    list: OpLog[];
    total: number;
    page: number;
    pageSize: number;
}

/** 快捷入口 */
export interface QuickEntry {
    title: string;
    desc: string;
    iconColor: string;
    bgClass: string;
    route: string;
}

/** 系统公告 */
export interface Notice {
    id: string;
    tag: string;
    type: 'info' | 'warning' | 'success';
    title: string;
    time: string;
}

// ============================================================
// GraphQL API（查询操作）
// ============================================================

/** 获取统计卡片数据，走 GraphQL */
export async function getStats(): Promise<StatCard[]> {
    const data = await gqlQuery<{ dashboardStats: StatCard[] }>(
        `
      query DashboardStats {
        dashboardStats { label value trend }
      }
    `,
    );
    return data.dashboardStats;
}

/** 获取趋势数据,走 GraphQL */
export async function getTrendData(range: 'week' | 'month' | 'year'): Promise<TrendItem[]> {
    const data = await gqlQuery<{ dashboardTrend: TrendItem[] }>(
        `
      query DashboardTrend($range: String!) {
        dashboardTrend(range: $range) { label highRisk midRisk lowRisk }
      }
    `,
        { variables: { range } },
    );
    return data.dashboardTrend;
}

/** 获取类别分布，走 GraphQL */
export async function getDistribution(): Promise<DistItem[]> {
    const data = await gqlQuery<{ dashboardDistribution: DistItem[] }>(
        `
      query DashboardDistribution {
        dashboardDistribution { label percent color }
      }
    `,
    );
    return data.dashboardDistribution;
}

/** 获取操作记录(分页),走 GraphQL */
export async function getOperationLogs(page = 1, pageSize = 10): Promise<OpLogPage> {
    const data = await gqlQuery<{ dashboardOperationLogs: OpLogPage }>(
        `
      query DashboardOperationLogs($page: Int!, $pageSize: Int!) {
        dashboardOperationLogs(page: $page, pageSize: $pageSize) {
          list { id user title avatar titleColor content type module ip time }
          total page pageSize
        }
      }
    `,
        { variables: { page, pageSize } },
    );
    return data.dashboardOperationLogs;
}

/** 获取快捷入口，走 GraphQL */
export async function getQuickEntries(): Promise<QuickEntry[]> {
    const data = await gqlQuery<{ dashboardQuickEntries: QuickEntry[] }>(
        `
      query DashboardQuickEntries {
        dashboardQuickEntries { title desc iconColor bgClass route }
      }
    `,
    );
    return data.dashboardQuickEntries;
}

/** 获取系统公告，走 GraphQL */
export async function getNotices(): Promise<Notice[]> {
    const data = await gqlQuery<{ dashboardNotices: Notice[] }>(
        `
      query DashboardNotices {
        dashboardNotices { id tag type title time }
      }
    `,
    );
    return data.dashboardNotices;
}
