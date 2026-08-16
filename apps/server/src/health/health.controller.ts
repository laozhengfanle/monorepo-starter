import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { HealthVo } from '@starter/server-core';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { HealthService } from './health.service.js';

/** 就绪检查内存上限（300MB heap） */
const MAX_HEAP_BYTES = 300 * 1024 * 1024;

/**
 * 健康检查：
 * - GET /health：基础信息（service/version，前端 dashboard 用）
 * - GET /health/liveness：进程存活探活（k8s liveness 探针用，无外部依赖）
 * - GET /health/readiness：terminus 就绪探活（DB + 内存，K8s 就绪探针用）
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly healthCheck: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly memoryIndicator: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOkResponse({ type: HealthVo })
  check(): HealthVo {
    return this.healthService.check();
  }

  /**
   * 存活探针：进程活着即返回 200。
   * 不检查外部依赖（DB/Redis）——依赖挂了不应触发容器重启，
   * 而应由 readiness 摘除流量，等依赖恢复。
   */
  @Get('liveness')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readiness')
  @HealthCheck()
  readiness() {
    return this.healthCheck.check([
      // DB 探活：Prisma 执行 SELECT 1（默认 1000ms 超时）
      () =>
        this.prismaIndicator.pingCheck('database', this.prisma.client, {
          timeout: 1000,
        }),
      // 内存探活：heap 超过 300MB 视为不健康
      () => this.memoryIndicator.checkHeap('memory_heap', MAX_HEAP_BYTES),
    ]);
  }
}
