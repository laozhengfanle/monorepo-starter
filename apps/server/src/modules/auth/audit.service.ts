import { Injectable } from '@nestjs/common';
import { newId } from '@starter/server-core';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** 审计动作词表（登录相关） */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_LOCKED: 'login_locked',
  LOGOUT: 'logout',
} as const;

export interface AuditEntry {
  accountId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  detail?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * 安全审计：写入 audit_log 表（异步不阻塞主流程）。
 * 阶段 3 精简版：登录成功/失败/锁定/登出；后续扩展业务操作审计。
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(entry: AuditEntry): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        id: newId(),
        accountId: entry.accountId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        detail: entry.detail as never,
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
    });
  }
}
