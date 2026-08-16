import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import {
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        // terminus 指示器不在单测范围，提供桩
        {
          provide: HealthCheckService,
          useValue: { check: vi.fn<() => unknown>() },
        },
        {
          provide: PrismaHealthIndicator,
          useValue: { pingCheck: vi.fn<() => unknown>() },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: { checkHeap: vi.fn<() => unknown>() },
        },
        { provide: PrismaService, useValue: { client: {} } },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('返回裸健康状态数据', () => {
    const health = controller.check();

    expect(health.status).toBe('ok');
    expect(health.service).toBeTruthy();
    expect(health.version).toBeTruthy();
  });

  it('liveness：进程存活即返回 ok，不依赖外部服务', () => {
    const result = controller.liveness();

    expect(result).toEqual({ status: 'ok' });
  });
});
