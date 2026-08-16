import { Injectable, Logger } from '@nestjs/common';
import { newId } from '@starter/server-core';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** 审计动作词表 */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_LOCKED: 'login_locked',
  LOGOUT: 'logout',
  PASSWORD_CHANGED: 'password_changed',
  ACCOUNT_CREATED: 'account_created',
  ACCOUNT_UPDATED: 'account_updated',
  ACCOUNT_ENABLED: 'account_enabled',
  ACCOUNT_DISABLED: 'account_disabled',
  ACCOUNT_DELETED: 'account_deleted',
  ACCOUNT_RESTORED: 'account_restored',
  ACCOUNT_HARD_DELETED: 'account_hard_deleted',
  ROLE_CREATED: 'role_created',
  ROLE_UPDATED: 'role_updated',
  ROLE_DELETED: 'role_deleted',
  MENU_CREATED: 'menu_created',
  MENU_UPDATED: 'menu_updated',
  MENU_DELETED: 'menu_deleted',
  PERMISSION_CHANGED: 'permission_changed',
  ACCOUNT_PERMISSION_CHANGED: 'account_permission_changed',
  FILE_UPLOADED: 'file_uploaded',
  FILE_DELETED: 'file_deleted',
  CONFIG_UPDATED: 'config_updated',
  AUDIT_CLEARED: 'audit_cleared',
  DICT_CREATED: 'dict_created',
  DICT_UPDATED: 'dict_updated',
  DICT_DELETED: 'dict_deleted',
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
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 写入审计日志 —— 业务审计容错（fail-open）：
   * create 失败仅 Logger.error，不抛出，避免审计旁路记录失败阻塞/回滚主流程
   * （如登录失败、配置更新、改密等）。
   * 安全敏感路径（登录失败/锁定）保持现状：这些路径在 write 之后才抛 BizException，
   * 审计失败只损失日志本身，不影响既定的安全判定结果（不会把“密码错误”变成 500）。
   */
  async write(entry: AuditEntry): Promise<void> {
    try {
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
    } catch (err) {
      this.logger.error(
        `写入审计日志失败 (action=${entry.action}, accountId=${entry.accountId ?? '-'}): ${
          (err as Error).message
        }`,
      );
    }
  }
}
