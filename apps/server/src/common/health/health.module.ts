import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';

/**
 * 健康检查模块
 * - 提供 /health、/health/liveness、/health/readiness 三个端点
 * - 供 Docker/K8s 探针使用
 * - PrismaService 由全局 PrismaModule 提供，此处无需重复注册
 */
@Module({
    imports: [TerminusModule],
    controllers: [HealthController],
})
export class HealthModule {}
