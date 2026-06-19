/**
 * Redis 分布式锁模块
 * - 导出 RedisLockService 供 Cron 任务 / 业务代码注入
 * - 模块为普通 Module（非 @Global）以避免污染 DI 容器
 * - 业务模块显式 imports: [RedisLockModule] 即可使用
 */
import { Module } from '@nestjs/common';
import { RedisLockService } from './redis-lock.service.js';

@Module({
    providers: [RedisLockService],
    exports: [RedisLockService],
})
export class RedisLockModule {}
