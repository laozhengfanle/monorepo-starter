import { Injectable, Logger } from '@nestjs/common';
import { newId } from '@starter/server-core';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AUDIT_ACTION_RESOURCE_MAP,
  AUDIT_ACTIONS,
  AUDIT_RESOURCES,
} from './audit.constants.js';

/** 审计动作词表（单一事实源见 audit.constants.ts） */
export { AUDIT_ACTIONS, AUDIT_RESOURCES } from './audit.constants.js';

export interface AuditEntry {
  accountId?: string;
  /** 审计动作（必须 ∈ AUDIT_ACTIONS；新增动作需同步词表与字典） */
  action: string;
  /** 资源类型：缺省时按 AUDIT_ACTION_RESOURCE_MAP 自动补全（DICT_* 的 sys_dict_item 场景需显式传） */
  resourceType?: string;
  resourceId?: string;
  detail?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * 安全审计：写入 audit_log 表（异步不阻塞主流程）。
 * - 动作词表单一事实源：action/resourceType 收敛到 audit.constants.ts（字典由它生成）
 * - 自动补全：未传 resourceType 时按 action 映射补全（如 login_* → auth），杜绝漏填不对称
 * - fail-open 校验：action/resourceType 不在词表内仅 Logger.error，不阻塞主流程
 *   （安全敏感路径如登录失败/锁定：审计失败只损失日志本身，不影响既定安全判定）
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 写入审计日志 —— 业务审计容错（fail-open）：
   * create 失败仅 Logger.error，不抛出，避免审计旁路记录失败阻塞/回滚主流程
   * （如登录失败、配置更新、改密等）。
   */
  async write(entry: AuditEntry): Promise<void> {
    // 动作词表校验（fail-open：仅告警，不阻断写入，保证字典可扩展）
    if (!(Object.values(AUDIT_ACTIONS) as string[]).includes(entry.action)) {
      this.logger.error(
        `审计动作不在词表中 (action=${entry.action})，请同步 audit.constants.ts 与字典 audit_action`,
      );
    }
    // 资源类型自动补全：未传时按 action 映射取默认（如 login_* → auth）
    const resourceType =
      entry.resourceType ??
      AUDIT_ACTION_RESOURCE_MAP[entry.action as keyof typeof AUDIT_ACTION_RESOURCE_MAP];
    if (resourceType && !(Object.values(AUDIT_RESOURCES) as string[]).includes(resourceType)) {
      this.logger.error(
        `审计资源类型不在词表中 (resourceType=${resourceType})，请同步 audit.constants.ts 与字典 audit_resource`,
      );
    }
    try {
      await this.prisma.client.auditLog.create({
        data: {
          id: newId(),
          accountId: entry.accountId,
          action: entry.action,
          resourceType,
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
