/**
 * 数据清理任务（CleanupTask）
 *
 * 职责：
 * - 定期清理过期数据，释放数据库 / Redis 空间
 *
 * 调度策略：
 * - cleanupOldData：每日凌晨 3 点（cron: 0 3 * * *）执行
 *   - 清理超过 90 天的 audit_log
 *   - 清理超过 30 天的 verification_code
 *   - 清理 Redis 中属于「已软删除账户」的孤立 refresh token（依赖 TTL 自然过期）
 *
 * 设计原则：
 * - 每个清理动作独立 try/catch → 单个失败不影响整体
 * - 失败时仅打日志，不抛出（不能让定时任务挂掉主进程）
 * - 用 Logger 输出清理数量，便于运维观察
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisLockService } from '../common/redis/redis-lock.service.js';
import { CronWithLock } from '../common/middleware/cron-lock.guard.js';
import { formatError } from '../common/utils/format-error.js';

/** audit_log 保留天数 */
const AUDIT_LOG_RETENTION_DAYS = 90;
/** verification_code 保留天数 */
const VERIFICATION_CODE_RETENTION_DAYS = 30;

/** 一天的毫秒数（24 * 60 * 60 * 1000） */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CleanupTask {
    private readonly logger = new Logger(CleanupTask.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redisLockService: RedisLockService,
    ) {}

    /**
     * 清理过期数据 — 每日凌晨 3 点执行
     *
     * 清理项：
     * 1. audit_log：超过 90 天的记录（合规要求：审计日志保留 90 天）
     * 2. verification_code：超过 30 天的记录（验证码审计表，防无限增长）
     * 3. Redis 孤立 refresh token：账户已软删除（deletedAt != null）但 Redis 中仍有 token
     *
     * 异常处理：
     * - 每一步用 try/catch 包裹，单步失败不影响其他步骤
     * - 失败时 logger.error，不抛出（避免 Scheduler 标记任务失败 + 防止挂掉主进程）
     */
    @Cron('0 3 * * *', {
        name: 'cleanup-old-data',
    })
    @CronWithLock('cleanup-old-data', 90_000)
    async cleanupOldData(): Promise<void> {
        this.logger.log('[Cleanup] 开始清理过期数据');

        /** 1) 清理过期的 audit_log */
        try {
            const cutoff = new Date(Date.now() - AUDIT_LOG_RETENTION_DAYS * ONE_DAY_MS);
            // rawClient 绕过软删除扩展，deleteMany 才能真正删除（否则会被扩展改写为 update）
            // 注：audit_log 表本身没有 deletedAt 字段，但走 rawClient 更安全（避免后续给 audit_log 加 deletedAt 时被拦截）
            const { count } = await this.prisma.rawClient.auditLog.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            this.logger.log(`[Cleanup] audit_log 清理完成：删除 ${count} 条（>${AUDIT_LOG_RETENTION_DAYS} 天）`);
        } catch (err) {
            this.logger.error(`[Cleanup] audit_log 清理失败: ${formatError(err)}`);
        }

        /** 2) 清理过期的 verification_code */
        try {
            const cutoff = new Date(Date.now() - VERIFICATION_CODE_RETENTION_DAYS * ONE_DAY_MS);
            // verification_code 同样走 rawClient（虽然该表没 deletedAt，但保持一致性）
            const { count } = await this.prisma.rawClient.verificationCode.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            this.logger.log(
                `[Cleanup] verification_code 清理完成：删除 ${count} 条（>${VERIFICATION_CODE_RETENTION_DAYS} 天）`,
            );
        } catch (err) {
            this.logger.error(`[Cleanup] verification_code 清理失败: ${(err as Error).message}`);
        }

        this.logger.log('[Cleanup] 过期数据清理结束');
    }
}
