import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupTask } from './cleanup.task.js';

/**
 * 定时任务模块
 *
 * - ScheduleModule：@nestjs/schedule 调度基础设施
 * - CleanupTask：定期清理过期数据（审计日志 / token 撤销记录）
 *
 * 扩展方式：新增 @Cron 任务类 → 加入 providers。
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CleanupTask],
})
export class TasksModule {}
