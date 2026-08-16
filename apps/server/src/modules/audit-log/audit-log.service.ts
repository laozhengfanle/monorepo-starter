import { Injectable, Logger } from '@nestjs/common';
import { BizException, newId } from '@starter/server-core';
import type { AuditLogItem, AuditLogQuery } from '@starter/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AUDIT_ACTIONS } from '../auth/audit.service.js';

/** 审计日志导出的上限（防止 OOM） */
const EXPORT_LIMIT = 10_000;

/** 审计日志行（含拼装的 username） */
interface AuditLogRow {
  id: string;
  accountId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  detail: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * 审计日志管理服务（audit_log 表）
 * - 分页 + 多维筛选（action / resourceType / 时间区间），批量 join account_identity 拼 username
 * - 清空：rawClient 先写 audit_cleared 再 deleteMany（否则清空操作本身无记录）
 * - 导出：不分页，上限 10000 条
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 分页查询审计日志（倒序） */
  async findAll(query: AuditLogQuery): Promise<{ items: AuditLogItem[]; total: number; page: number; pageSize: number }> {
    const { page, pageSize, action, resourceType, startDate, endDate } = query;
    const where = this.buildWhere({ action, resourceType, startDate, endDate });

    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    const items = await this.attachUsernames(rows);
    return { items, total, page, pageSize };
  }

  /** 导出（不分页，全量匹配，上限 10000 条） */
  async exportLogs(query: Pick<AuditLogQuery, 'action' | 'resourceType' | 'startDate' | 'endDate'>): Promise<AuditLogItem[]> {
    const where = this.buildWhere(query);
    const rows = await this.prisma.client.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
    });
    return this.attachUsernames(rows);
  }

  /** 清空所有审计日志（硬删除）——先 rawClient 写 audit_cleared，再 deleteMany */
  async clear(operatorId: string): Promise<{ deletedCount: number }> {
    const total = await this.prisma.client.auditLog.count();
    // 直写 rawClient：否则会被自己的 deleteMany 一并清掉
    try {
      await this.prisma.rawClient.auditLog.create({
        data: {
          id: newId(),
          accountId: operatorId,
          action: AUDIT_ACTIONS.AUDIT_CLEARED,
          resourceType: 'audit_log',
          detail: { clearedCount: total, clearedAt: new Date().toISOString() } as never,
        },
      });
    } catch (err) {
      this.logger.error(`写 audit_cleared 失败: ${(err as Error).message}`);
    }
    await this.prisma.rawClient.auditLog.deleteMany();
    return { deletedCount: total };
  }

  /** 删除单条审计日志（硬删除） */
  async deleteOne(id: string): Promise<void> {
    const log = await this.prisma.client.auditLog.findUnique({ where: { id } });
    if (!log) {
      throw new BizException({ code: 'AUDIT_LOG_NOT_FOUND', message: '审计日志不存在' });
    }
    await this.prisma.rawClient.auditLog.delete({ where: { id } });
  }

  private buildWhere(filter: Pick<AuditLogQuery, 'action' | 'resourceType' | 'startDate' | 'endDate'>): Record<string, unknown> {
    const { action, resourceType, startDate, endDate } = filter;
    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (resourceType) where.resourceType = resourceType;
    if (startDate || endDate) {
      where.createdAt = {};
      // 防御性校验：入口层（ZodArgsPipe）已按 ISO 校验，这里兜底防止非法字符串 → Invalid Date
      if (startDate) {
        const start = new Date(startDate);
        if (Number.isNaN(start.getTime())) {
          throw new BizException({ code: 'INVALID_DATE', message: 'startDate 不是合法的 ISO 日期' });
        }
        (where.createdAt as Record<string, unknown>).gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) {
          throw new BizException({ code: 'INVALID_DATE', message: 'endDate 不是合法的 ISO 日期' });
        }
        (where.createdAt as Record<string, unknown>).lte = end;
      }
    }
    return where;
  }

  /** 批量 join account_identity 拼 username */
  private async attachUsernames(rows: AuditLogRow[]): Promise<AuditLogItem[]> {
    const accountIds = [...new Set(rows.map((r) => r.accountId).filter(Boolean))] as string[];
    let accountMap = new Map<string, string>();
    if (accountIds.length > 0) {
      const identities = await this.prisma.client.accountIdentity.findMany({
        where: { accountId: { in: accountIds }, identityType: 'username' },
        select: { accountId: true, identifier: true },
      });
      accountMap = new Map(identities.map((i) => [i.accountId, i.identifier]));
    }
    return rows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      accountUsername: r.accountId ? (accountMap.get(r.accountId) ?? null) : null,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      detail: r.detail ? JSON.stringify(r.detail) : null,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
