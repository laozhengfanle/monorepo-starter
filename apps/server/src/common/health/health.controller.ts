import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
    HealthCheck,
    HealthCheckService,
    HealthCheckResult,
    MemoryHealthIndicator,
    DiskHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../decorators/public.decorator.js';

/**
 * 健康检查控制器
 * - GET /health — 数据库 + 内存 + 磁盘综合检查
 * - GET /health/liveness — 进程存活检查（K8s livenessProbe）
 * - GET /health/readiness — 数据库就绪检查（K8s readinessProbe）
 * - 跳过限流：K8s 探针高频调用，不应被限流
 */
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private prisma: PrismaService,
        private memory: MemoryHealthIndicator,
        private disk: DiskHealthIndicator,
    ) {}

    /** 综合健康检查：数据库连接 + 内存 + 磁盘 */
    @Get()
    @HealthCheck()
    async check(): Promise<HealthCheckResult> {
        return this.health.check([
            /** 数据库连接检查：通过扩展客户端执行简单 SQL 查询（5 秒超时） */
            async () => {
                try {
                    await Promise.race([
                        this.prisma.client.$queryRaw`SELECT 1`,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('DB_QUERY_TIMEOUT')), 5000)),
                    ]);
                    return { database: { status: 'up' as const } };
                } catch {
                    return { database: { status: 'down' as const } };
                }
            },
            /** 堆内存检查：超过 200MB 告警 */
            () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024),
            /** RSS 内存检查：超过 500MB 告警 */
            () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
            /** 磁盘检查：使用率超过 90% 告警 */
            () => this.disk.checkStorage('storage', { thresholdPercent: 0.9, path: '/' }),
        ]);
    }

    /** 存活检查：只确认进程存活 */
    @Get('liveness')
    liveness() {
        return { status: 'ok' };
    }

    /** 就绪检查：数据库是否可连接 */
    @Get('readiness')
    async readiness() {
        try {
            await this.prisma.client.$queryRaw`SELECT 1`;
            return { status: 'ok', database: { status: 'up' } };
        } catch {
            return { status: 'error', database: { status: 'down' } };
        }
    }
}
