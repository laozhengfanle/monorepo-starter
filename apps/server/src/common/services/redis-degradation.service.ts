/**
 * Redis 降级服务
 *
 * 背景：
 * - 认证链 / 限流 / CSRF 都强依赖 Redis
 * - Redis 故障时不能阻塞登录（5xx 错误率 = 0 是基线要求）
 * - 需要在所有 Redis 调用点统一包一层"出错就降级"
 *
 * 设计原则：
 * 1) safeGet<T>(key, fallback)：Redis 抛错时返回 fallback 值，记 warn
 * 2) tryWithFallback<T>(op, fallback)：包裹任意 Redis 操作，错误时跑 fallback
 * 3) 降级策略：fail-open（业务可用性优先于强一致）
 *    - 限流 → 放行（不限流）
 *    - CSRF → 从 cookie 重新读取（前端兜底）
 *    - token 撤销检查 → 视为未撤销（JwtStrategy 还会校验 tokenVersion 第二层防护）
 * 4) 降级发生时：Pino warn（log 里能 grep 到）+ 内存计数器
 *
 * 使用示例：
 * ```ts
 * // 安全读取
 * const value = await redisDegradation.safeGet(key, null);
 * if (value === null) return null;
 *
 * // 包裹任意操作
 * const result = await redisDegradation.tryWithFallback(
 *   () => cacheService.setex(key, ttl, value),
 *   () => { logger.warn(...); return; }
 * );
 * ```
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../cache/cache.interface.js';

/** 降级指标（内存计数） */
interface DegradationMetrics {
    redis_degradation_total: number;
    lastDegradationAt: Date | null;
}

@Injectable()
export class RedisDegradationService {
    private readonly logger = new Logger(RedisDegradationService.name);

    /**
     * 降级指标（内存计数）
     * - 供 ops 脚本读取（grep logs）
     * - 暴露 Prometheus 接入由后续 spec 负责
     */
    private readonly metrics: DegradationMetrics = {
        redis_degradation_total: 0,
        lastDegradationAt: null,
    };

    constructor(@Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService) {}

    /**
     * 安全读取：Redis 抛错时返回 fallback
     *
     * @param key 缓存 key
     * @param fallback 降级值（类型由调用方决定）
     * @returns 缓存值 或 fallback
     */
    async safeGet<T>(key: string, fallback: T): Promise<T> {
        try {
            const value = await this.cacheService.get<T>(key);
            return value === null || value === undefined ? fallback : value;
        } catch (err) {
            this.recordDegradation('safeGet', key, err as Error);
            return fallback;
        }
    }

    /**
     * 包裹任意 Redis 操作：抛错时跑 fallback
     *
     * 用途：包裹 setex / del / evalLua / delByPattern 等副作用操作
     * - fallback 可以是"忽略错误继续走"或"返回特殊值"
     *
     * @param op 主操作（返回 T）
     * @param fallback 降级操作（返回 T）
     * @returns 主操作结果 或 fallback 结果
     */
    async tryWithFallback<T>(op: () => Promise<T>, fallback: () => Promise<T> | T): Promise<T> {
        try {
            return await op();
        } catch (err) {
            this.recordDegradation('tryWithFallback', '<op>', err as Error);
            return await fallback();
        }
    }

    /**
     * 获取降级指标快照
     * - 供 /api/admin/cache/stats 之类的端点消费
     */
    getMetrics(): Readonly<DegradationMetrics> {
        return { ...this.metrics };
    }

    /**
     * 内部：记录一次降级（log + 计数 + 末次时间）
     */
    private recordDegradation(op: string, key: string, err: Error): void {
        this.metrics.redis_degradation_total += 1;
        this.metrics.lastDegradationAt = new Date();

        /**
         * Pino warn 级别 — 运营 grep "redis_degradation" 就能定位降级事件
         * - 输出 err.message 而非 err.stack（生产日志避免 stack 污染）
         * - 同时输出 op / key 便于定位
         */
        this.logger.warn(
            `redis_degradation op=${op} key=${key} err=${err.message} total=${this.metrics.redis_degradation_total}`,
        );
    }
}
