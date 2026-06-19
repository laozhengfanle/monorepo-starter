/**
 * 定时任务模块（SchedulerModule）
 *
 * 职责：
 * - 注册并启用 NestJS 调度器（@nestjs/schedule）
 * - 挂载所有定时任务类（CleanupTask / MonitorTask）
 * - 不导出任何 Provider（任务类内部自治，外部无需调用）
 *
 * 调度器使用：
 * - ScheduleModule.forRoot() 启动 cron 任务调度循环
 * - 任务类用 @Injectable() 标记为 Provider
 * - 任务方法用 @Cron('cron 表达式') 或 @Cron(CronExpression.XXX) 注解
 *
 * 注意事项：
 * - 任务方法抛错不能挂掉主进程 → 任务内部必须 try/catch 包裹
 * - 默认 5 个并发 cron 任务，超过会等待（NestJS Schedule 默认）
 * - 长任务用 waitForCompletion: true 防止重叠执行
 */
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupTask } from './cleanup.task.js';
import { MonitorTask } from './monitor.task.js';
import { RedisLockModule } from '../common/redis/redis-lock.module.js';

@Module({
    imports: [
        /**
         * 启动 @nestjs/schedule 调度器
         * - 不传 options 时使用默认配置
         * - 必须在所有使用 @Cron / @Interval / @Timeout 装饰器的模块之前导入
         */
        ScheduleModule.forRoot(),
        /**
         * Redis 分布式锁模块 — 提供 RedisLockService 给 Cron 任务做跨实例互斥
         * - 多实例部署时（K8s replicas > 1）防止同一 Cron 任务重复执行
         */
        RedisLockModule,
    ],
    providers: [
        /** 数据清理任务（每日凌晨 3 点 + 每 10 分钟缓存预热） */
        CleanupTask,
        /** 系统监控任务（每 30 秒采集一次指标） */
        MonitorTask,
    ],
})
export class SchedulerModule {}
