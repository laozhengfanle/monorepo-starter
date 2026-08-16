import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_LABELS,
} from '../auth/audit.constants.js';
import type {
  DashboardDistItemType,
  DashboardOpLogPageType,
  DashboardOpLogType,
  DashboardStatType,
  DashboardTrendItemType,
} from './dashboard.type.js';

/** 操作记录里 action → 前端标签类型（对标老项目 typeStyle 的细分） */
const ACTION_TYPE_MAP: Record<string, string> = {
  [AUDIT_ACTIONS.LOGIN_SUCCESS]: 'login',
  [AUDIT_ACTIONS.LOGIN_FAILED]: 'login',
  [AUDIT_ACTIONS.LOGIN_LOCKED]: 'login',
  [AUDIT_ACTIONS.LOGOUT]: 'logout',
  [AUDIT_ACTIONS.PASSWORD_CHANGED]: 'reset',
  [AUDIT_ACTIONS.TOKEN_REFRESHED]: 'login',
  [AUDIT_ACTIONS.TOKEN_REUSED]: 'reset',
  [AUDIT_ACTIONS.ACCOUNT_CREATED]: 'create',
  [AUDIT_ACTIONS.ACCOUNT_UPDATED]: 'update',
  [AUDIT_ACTIONS.ACCOUNT_ENABLED]: 'update',
  [AUDIT_ACTIONS.ACCOUNT_DISABLED]: 'update',
  [AUDIT_ACTIONS.ACCOUNT_DELETED]: 'delete',
  [AUDIT_ACTIONS.ACCOUNT_RESTORED]: 'create',
  [AUDIT_ACTIONS.ACCOUNT_HARD_DELETED]: 'delete',
  [AUDIT_ACTIONS.ROLE_ASSIGNED]: 'grant',
  [AUDIT_ACTIONS.ROLE_REVOKED]: 'grant',
  [AUDIT_ACTIONS.ACCOUNT_PERMISSION_CHANGED]: 'grant',
  [AUDIT_ACTIONS.ROLE_CREATED]: 'create',
  [AUDIT_ACTIONS.ROLE_UPDATED]: 'update',
  [AUDIT_ACTIONS.ROLE_DELETED]: 'delete',
  [AUDIT_ACTIONS.PERMISSION_CHANGED]: 'grant',
  [AUDIT_ACTIONS.MENU_CREATED]: 'create',
  [AUDIT_ACTIONS.MENU_UPDATED]: 'update',
  [AUDIT_ACTIONS.MENU_DELETED]: 'delete',
  [AUDIT_ACTIONS.FILE_UPLOADED]: 'import',
  [AUDIT_ACTIONS.FILE_DELETED]: 'delete',
  [AUDIT_ACTIONS.CONFIG_UPDATED]: 'update',
  [AUDIT_ACTIONS.AUDIT_CLEARED]: 'delete',
  [AUDIT_ACTIONS.DICT_CREATED]: 'create',
  [AUDIT_ACTIONS.DICT_UPDATED]: 'update',
  [AUDIT_ACTIONS.DICT_DELETED]: 'delete',
};

/**
 * 仪表盘数据服务（只读聚合，BFF 规范：GraphQL 数据网关）：
 * - 统计卡片：account/admin_role/admin_menu 计数 + 近 7 日 audit_log 数（含较上周趋势）
 * - 敏感操作趋势：audit_log 按 周/月/年 聚合，按风险等级（高/中/低）拆分
 * - 操作分布：audit_log 按 action 分组取 Top N（中文标签来自 audit_action 字典词表）
 * - 操作记录：audit_log 分页（操作者/内容/模块/IP/时间）
 *
 * 风险分级（安全语义）：
 * - 高危：锁定/重用令牌/删账号/硬删/改密/权限变更/角色分配/清审计 —— 直接影响安全边界
 * - 中危：登录失败/状态切换/角色与菜单增删改/配置变更/字典变更 —— 业务变更
 * - 低危：登录成功/登出/刷新令牌/创建/上传 —— 常规事件
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 风险分级 ──
  private readonly HIGH_RISK = new Set<string>([
    AUDIT_ACTIONS.LOGIN_LOCKED,
    AUDIT_ACTIONS.TOKEN_REUSED,
    AUDIT_ACTIONS.PASSWORD_CHANGED,
    AUDIT_ACTIONS.ACCOUNT_DELETED,
    AUDIT_ACTIONS.ACCOUNT_HARD_DELETED,
    AUDIT_ACTIONS.ROLE_ASSIGNED,
    AUDIT_ACTIONS.ROLE_REVOKED,
    AUDIT_ACTIONS.PERMISSION_CHANGED,
    AUDIT_ACTIONS.ACCOUNT_PERMISSION_CHANGED,
    AUDIT_ACTIONS.AUDIT_CLEARED,
  ]);
  private readonly MID_RISK = new Set<string>([
    AUDIT_ACTIONS.LOGIN_FAILED,
    AUDIT_ACTIONS.ACCOUNT_UPDATED,
    AUDIT_ACTIONS.ACCOUNT_ENABLED,
    AUDIT_ACTIONS.ACCOUNT_DISABLED,
    AUDIT_ACTIONS.ACCOUNT_RESTORED,
    AUDIT_ACTIONS.ROLE_CREATED,
    AUDIT_ACTIONS.ROLE_UPDATED,
    AUDIT_ACTIONS.ROLE_DELETED,
    AUDIT_ACTIONS.MENU_CREATED,
    AUDIT_ACTIONS.MENU_UPDATED,
    AUDIT_ACTIONS.MENU_DELETED,
    AUDIT_ACTIONS.FILE_DELETED,
    AUDIT_ACTIONS.CONFIG_UPDATED,
    AUDIT_ACTIONS.DICT_CREATED,
    AUDIT_ACTIONS.DICT_UPDATED,
    AUDIT_ACTIONS.DICT_DELETED,
  ]);

  /** 统计卡片：管理员/角色/菜单/近7日操作数（含较上周趋势，上周为 0 时从无到有计 100%） */
  async getStats(): Promise<DashboardStatType[]> {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const [
      adminCount,
      adminCountPrev,
      roleCount,
      roleCountPrev,
      menuCount,
      menuCountPrev,
      opsCount,
      opsCountPrev,
    ] = await Promise.all([
      // 当前启用且未软删的管理员
      this.prisma.client.account.count({ where: { userType: 'admin', deletedAt: null } }),
      // 上周（7 天前已创建且未软删）
      this.prisma.client.account.count({
        where: { userType: 'admin', deletedAt: null, createdAt: { lte: weekAgo } },
      }),
      this.prisma.client.adminRole.count(),
      this.prisma.client.adminRole.count({ where: { createdAt: { lte: weekAgo } } }),
      this.prisma.client.adminMenu.count(),
      this.prisma.client.adminMenu.count({ where: { createdAt: { lte: weekAgo } } }),
      this.prisma.client.auditLog.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.client.auditLog.count({
        where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
      }),
    ]);

    return [
      { label: '管理员', value: adminCount, trend: this.calcTrend(adminCount, adminCountPrev) },
      { label: '角色', value: roleCount, trend: this.calcTrend(roleCount, roleCountPrev) },
      { label: '菜单项', value: menuCount, trend: this.calcTrend(menuCount, menuCountPrev) },
      { label: '近7日操作', value: opsCount, trend: this.calcTrend(opsCount, opsCountPrev) },
    ];
  }

  private calcTrend(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  /** 敏感操作趋势：按周/月/年聚合 audit_log，按风险等级拆分 */
  async getTrend(range: 'week' | 'month' | 'year'): Promise<DashboardTrendItemType[]> {
    const now = new Date();
    const buckets = new Map<string, { highRisk: number; midRisk: number; lowRisk: number }>();

    const addBucket = (key: string): { highRisk: number; midRisk: number; lowRisk: number } => {
      let b = buckets.get(key);
      if (!b) {
        b = { highRisk: 0, midRisk: 0, lowRisk: 0 };
        buckets.set(key, b);
      }
      return b;
    };

    if (range === 'year') {
      for (let m = 0; m < 12; m++) addBucket(`${m + 1}月`);
    } else if (range === 'month') {
      for (let d = 1; d <= now.getDate(); d++) addBucket(`${now.getMonth() + 1}/${d}`);
    } else {
      const dow = (now.getDay() + 6) % 7; // 周一=0
      const monday = new Date(now);
      monday.setDate(now.getDate() - dow);
      monday.setHours(0, 0, 0, 0);
      for (let d = 0; d < 7; d++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + d);
        addBucket(`${day.getMonth() + 1}/${day.getDate()}`);
      }
    }

    const since =
      range === 'year'
        ? new Date(now.getFullYear(), 0, 1)
        : range === 'month'
          ? new Date(now.getFullYear(), now.getMonth(), 1)
          : (() => {
              const dow = (now.getDay() + 6) % 7;
              const monday = new Date(now);
              monday.setDate(now.getDate() - dow);
              monday.setHours(0, 0, 0, 0);
              return monday;
            })();

    const logs = await this.prisma.client.auditLog.findMany({
      where: { createdAt: { gte: since } },
      select: { action: true, createdAt: true },
    });

    for (const log of logs) {
      const key =
        range === 'year'
          ? `${log.createdAt.getMonth() + 1}月`
          : `${log.createdAt.getMonth() + 1}/${log.createdAt.getDate()}`;
      const bucket = buckets.get(key);
      if (!bucket) continue; // month 模式下今天之后不存在（日志不可能晚于 now）
      if (this.HIGH_RISK.has(log.action)) bucket.highRisk++;
      else if (this.MID_RISK.has(log.action)) bucket.midRisk++;
      else bucket.lowRisk++;
    }

    return [...buckets.entries()].map(([label, v]) => ({ label, ...v }));
  }

  /** 操作类型分布：audit_log 按 action 分组取 Top 6，中文标签来自审计词表 */
  async getDistribution(): Promise<DashboardDistItemType[]> {
    const rows = await this.prisma.client.auditLog.groupBy({
      by: ['action'],
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
      take: 6,
    });
    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];
    const total = rows.reduce((sum, r) => sum + r['_count'].action, 0);
    return rows.map((r, i) => ({
      label: AUDIT_ACTION_LABELS[r.action as keyof typeof AUDIT_ACTION_LABELS] ?? r.action,
      percent: total > 0 ? Math.round((r['_count'].action / total) * 100) : 0,
      color: colors[i % colors.length],
    }));
  }

  /** 最近操作记录（分页） */
  async getOperationLogs(page: number, pageSize: number): Promise<DashboardOpLogPageType> {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(50, Math.max(1, pageSize));
    const [total, rows] = await Promise.all([
      this.prisma.client.auditLog.count(),
      this.prisma.client.auditLog.findMany({
        skip: (safePage - 1) * safeSize,
        take: safeSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // 批量 join 操作者用户名
    const accountIds = [...new Set(rows.map((r) => r.accountId).filter(Boolean))] as string[];
    let userMap = new Map<string, string>();
    if (accountIds.length > 0) {
      const identities = await this.prisma.client.accountIdentity.findMany({
        where: { accountId: { in: accountIds }, identityType: 'username' },
        select: { accountId: true, identifier: true },
      });
      userMap = new Map(identities.map((i) => [i.accountId, i.identifier]));
    }

    const list: DashboardOpLogType[] = rows.map((r, index) => ({
      seq: (safePage - 1) * safeSize + index + 1,
      user: r.accountId ? (userMap.get(r.accountId) ?? '未知用户') : '系统',
      content: AUDIT_ACTION_LABELS[r.action as keyof typeof AUDIT_ACTION_LABELS] ?? r.action,
      module:
        (r.resourceType &&
          AUDIT_RESOURCE_LABELS[r.resourceType as keyof typeof AUDIT_RESOURCE_LABELS]) ||
        r.resourceType ||
        '系统',
      type: ACTION_TYPE_MAP[r.action] ?? 'approve',
      ip: r.ip ?? '',
      time: this.formatTime(r.createdAt),
    }));

    return { list, total, page: safePage, pageSize: safeSize };
  }

  private formatTime(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
