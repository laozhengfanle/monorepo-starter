/**
 * Cron 任务分布式锁装饰器
 *
 * 用途：
 * - 多实例部署（K8s replicas > 1）时防止 Cron 任务重复执行
 * - 在方法上同时使用 @Cron('cron expr') 和 @CronWithLock('taskName', 90000)
 *   → 任务执行时自动 acquire 锁，未抢到锁的实例 skip
 *
 * 实现：
 * - 用 method decorator 包装原方法
 * - 包装函数执行前调用 RedisLockService.acquire，未抢到锁则 log warn + return
 * - 抢到锁后执行原方法 + 异常处理 + finally release
 * - 锁 key 形如 `cron:lock:{taskName}:{minuteSlot}`，minuteSlot = 分钟时间戳（90s TTL 防跨分钟）
 *
 * 注意：
 * - 与 @Cron 装饰器组合使用（@CronWithLock 在外层，@Cron 在内层）
 *   但 NestJS 的 @Cron 是 class-level 装饰器，所以实际是 @CronWithLock 包裹方法
 * - 长任务（>90s）需自行实现定时 extend 续期（暂未提供，文档中说明）
 */
import { Logger } from '@nestjs/common';
import type { RedisLockService } from '../redis/redis-lock.service.js';

const logger = new Logger('CronWithLock');

/**
 * @CronWithLock 装饰器工厂
 * @param taskName 任务标识（用于锁 key）
 * @param ttlMs 锁 TTL 毫秒（默认 90000 = 90s）
 * @returns method decorator
 *
 * 用法：
 * ```typescript
 * @Cron('0 3 * * *')
 * @CronWithLock('cleanup-old-data', 90000)
 * async cleanupOldData() { ... }
 * ```
 */
export function CronWithLock(taskName: string, ttlMs: number = 90_000): MethodDecorator {
    return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (this: { redisLockService?: RedisLockService }, ...args: unknown[]) {
            // 注入的 RedisLockService 必须在 class 构造时声明为属性
            const lockService = this.redisLockService;
            if (!lockService) {
                // 缺少 RedisLockService 时应显式报错，防止多实例环境下重复执行
                throw new Error(`[${taskName}] RedisLockService 未注入，无法获取分布式锁（多实例部署下禁止直接执行）`);
            }

            // 锁 key：cron:lock:{taskName}:{minuteSlot}，minuteSlot 让不同时间窗口互不干扰
            const minuteSlot = Math.floor(Date.now() / 60_000);
            const lockKey = `cron:lock:${taskName}:${minuteSlot}`;

            const owner = await lockService.acquire(lockKey, ttlMs);
            if (!owner) {
                logger.warn(`[${taskName}] 未抢到分布式锁，跳过本次执行（其他实例正在跑）`);
                return { skipped: true, reason: 'lock_not_acquired' };
            }

            logger.log(`[${taskName}] 已获取分布式锁，开始执行任务`);
            try {
                return await originalMethod.apply(this, args);
            } catch (err) {
                logger.error(`[${taskName}] 任务执行失败: ${(err as Error).message}`);
                throw err;
            } finally {
                await lockService.release(lockKey, owner);
                logger.log(`[${taskName}] 已释放分布式锁`);
            }
        };

        return descriptor;
    };
}
