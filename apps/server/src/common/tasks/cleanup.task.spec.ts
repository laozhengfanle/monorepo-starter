import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { CleanupTask } from './cleanup.task.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('CleanupTask', () => {
  let task: CleanupTask;
  let prisma: {
    client: {
      auditLog: { deleteMany: ReturnType<typeof vi.fn> };
      tokenRevocation: { deleteMany: ReturnType<typeof vi.fn> };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        auditLog: { deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }) },
        tokenRevocation: {
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
        },
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [CleanupTask, { provide: PrismaService, useValue: prisma }],
    }).compile();
    task = moduleRef.get(CleanupTask);
  });

  it('清理过期审计日志与 token 撤销记录', async () => {
    prisma.client.auditLog.deleteMany.mockResolvedValue({ count: 42 });
    prisma.client.tokenRevocation.deleteMany.mockResolvedValue({ count: 7 });

    await task.cleanupExpiredData();

    // 审计日志：cutoff = now - 90 天
    const auditCall = prisma.client.auditLog.deleteMany.mock.calls[0][0] as {
      where: { createdAt: { lt: Date } };
    };
    expect(auditCall.where.createdAt.lt.getTime()).toBeLessThan(Date.now());
    expect(auditCall.where.createdAt.lt.getTime()).toBeGreaterThan(
      Date.now() - 91 * 24 * 60 * 60 * 1000,
    );

    // token 撤销：cutoff = now - 7 天宽限期
    const tokenCall = prisma.client.tokenRevocation.deleteMany.mock
      .calls[0][0] as {
      where: { expiresAt: { lt: Date } };
    };
    expect(tokenCall.where.expiresAt.lt.getTime()).toBeLessThan(Date.now());
  });

  it('单个清理动作失败不影响另一个（独立 try/catch）', async () => {
    prisma.client.auditLog.deleteMany.mockRejectedValue(new Error('db down'));
    prisma.client.tokenRevocation.deleteMany.mockResolvedValue({ count: 3 });

    // 不应抛出（内部已 catch）
    await expect(task.cleanupExpiredData()).resolves.toBeUndefined();
    expect(prisma.client.tokenRevocation.deleteMany).toHaveBeenCalled();
  });

  it('删除数量为 0 时静默通过', async () => {
    await expect(task.cleanupExpiredData()).resolves.toBeUndefined();
  });
});
