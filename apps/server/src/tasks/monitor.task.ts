/**
 * 系统监控任务（MonitorTask）
 *
 * 职责：周期性采集系统关键指标，输出到日志
 *
 * 调度策略：
 * - recordSystemMetrics：每 30 秒（EVERY_30_SECONDS）执行
 *
 * 采集指标：
 * - DB Ping 耗时：执行 SELECT 1，测量往返延迟（反映 DB 性能）
 * - Redis 存活：调用 get 一个肯定不存在的 key（仅 ping，不采集内存）
 *
 * 异常处理：
 * - 单次采集失败仅 logger.error，不抛出（不能让定时任务挂掉主进程）
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../common/cache/cache.interface.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisLockService } from '../common/redis/redis-lock.service.js';
import { CronWithLock } from '../common/middleware/cron-lock.guard.js';
import { formatError } from '../common/utils/format-error.js';

@Injectable()
export class MonitorTask {
    private readonly logger = new Logger(MonitorTask.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly redisLockService: RedisLockService,
    ) {}

    /**
     * 采集系统指标 — 每 30 秒执行
     *
     * 输出：
     * - [Monitor] db_ping_ms=X（X 为 SELECT 1 的往返毫秒数）
     * - [Monitor] redis_status=ok|skipped|error
     *
     * 后续扩展（不在当前范围）：
     * - 接入 Prometheus client
     * - 阈值告警（db_ping_ms > 100 触发告警）
     */
    @Cron(CronExpression.EVERY_30_SECONDS, {
        name: 'record-system-metrics',
    })
    @CronWithLock('record-system-metrics', 25_000)
    async recordSystemMetrics(): Promise<void> {
        /** 1) DB ping 耗时 */
        let dbPingMs: number | null = null;
        let dbError: string | null = null;
        try {
            const t0 = Date.now();
            // 用 $queryRaw 跑 SELECT 1，测量往返延迟
            await this.prisma.client.$queryRaw`SELECT 1`;
            dbPingMs = Date.now() - t0;
        } catch (err) {
            // Prisma 错误的 message 经常是多行且超长，截短 + 拼接 code/name 便于排查
            // 例如 "ECONNREFUSED" / "P1001" 这类标准错误码在 message 里看不到
            dbError = formatError(err);
        }

        if (dbPingMs !== null) {
            this.logger.log(`[Monitor] db_ping_ms=${dbPingMs}`);
        } else {
            this.logger.error(`[Monitor] db_ping_failed error=${dbError}`);
        }

        /** 2) Redis 存活检查（用一个肯定不存在的 key 测连通性） */
        try {
            await this.cacheService.get('__monitor_ping__');
            this.logger.debug('[Monitor] redis_status=ok（仅 ping，未采集内存指标）');
        } catch (err) {
            this.logger.error(`[Monitor] redis_check_failed error=${formatError(err)}`);
        }
    }
}
