import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

/** 审计日志保留天数（合规要求：审计日志保留 90 天） */
const AUDIT_LOG_RETENTION_DAYS = 90;

/** token 撤销记录：原 token 过期后再留 7 天兜底清理 */
const TOKEN_REVOCATION_GRACE_DAYS = 7;

/** 一天的毫秒数 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 数据清理任务
 *
 * 职责：
 * - 定期清理过期数据，防止数据库无限增长
 *
 * 调度策略：
 * - cleanupExpiredData：每日凌晨 3 点（cron: 0 3 * * *）
 *   - 删除超过 90 天的 audit_log（审计合规：保留窗口内即可）
 *   - 删除 expiresAt 已过 7 天的 token_revocation（黑名单记录过期后无保留价值）
 *
 * 设计原则：
 * - 每个清理动作独立 try/catch → 单个失败不影响整体
 * - 失败时仅打日志，不抛出（不能让定时任务挂掉主进程）
 * - 用 Logger 输出清理数量，便于运维观察
 */
@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'cleanup-expired-data' })
  async cleanupExpiredData(): Promise<void> {
    this.logger.log('开始清理过期数据…');

    // 1. 清理过期审计日志
    await this.cleanupAuditLogs();

    // 2. 清理过期 token 撤销记录
    await this.cleanupTokenRevocations();

    this.logger.log('过期数据清理完成');
  }

  /** 清理超过保留期的审计日志 */
  private async cleanupAuditLogs(): Promise<void> {
    try {
      const cutoff = new Date(
        Date.now() - AUDIT_LOG_RETENTION_DAYS * ONE_DAY_MS,
      );
      const result = await this.prisma.client.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(
          `已清理 ${result.count} 条过期审计日志（>${AUDIT_LOG_RETENTION_DAYS} 天）`,
        );
      }
    } catch (err) {
      this.logger.error(
        `清理审计日志失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** 清理已过期的 token 撤销记录（原 token 过期 + 宽限期） */
  private async cleanupTokenRevocations(): Promise<void> {
    try {
      const cutoff = new Date(
        Date.now() - TOKEN_REVOCATION_GRACE_DAYS * ONE_DAY_MS,
      );
      const result = await this.prisma.client.tokenRevocation.deleteMany({
        where: { expiresAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`已清理 ${result.count} 条过期 token 撤销记录`);
      }
    } catch (err) {
      this.logger.error(
        `清理 token 撤销记录失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
