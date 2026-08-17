import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { AuditLogService } from './audit-log.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

function makeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    accountId: 'acc-1',
    action: 'login_success',
    resourceType: 'auth',
    resourceId: null,
    detail: null,
    ip: '1.2.3.4',
    userAgent: 'test',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: {
    client: {
      auditLog: {
        findMany: ReturnType<typeof vi.fn<any>>;
        count: ReturnType<typeof vi.fn<any>>;
        findUnique: ReturnType<typeof vi.fn<any>>;
      };
      accountIdentity: { findMany: ReturnType<typeof vi.fn<any>> };
    };
    rawClient: {
      auditLog: {
        create: ReturnType<typeof vi.fn<any>>;
        deleteMany: ReturnType<typeof vi.fn<any>>;
        delete: ReturnType<typeof vi.fn<any>>;
      };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        auditLog: {
          findMany: vi.fn<any>().mockResolvedValue([makeLogRow()]),
          count: vi.fn<any>().mockResolvedValue(1),
          findUnique: vi.fn<any>().mockResolvedValue(makeLogRow()),
        },
        accountIdentity: {
          findMany: vi
            .fn<any>()
            .mockResolvedValue([{ accountId: 'acc-1', identifier: 'root' }]),
        },
      },
      rawClient: {
        auditLog: {
          create: vi.fn<any>().mockResolvedValue({}),
          deleteMany: vi.fn<any>().mockResolvedValue({ count: 0 }),
          delete: vi.fn<any>().mockResolvedValue({}),
        },
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AuditLogService);
  });

  it('findAll：分页查询 + join 用户名', async () => {
    const result = await service.findAll({ page: 1, pageSize: 10 });

    expect(prisma.client.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result.items[0].accountUsername).toBe('root');
    expect(result.total).toBe(1);
  });

  it('findAll：action/resourceType 过滤进入 where', async () => {
    await service.findAll({
      page: 1,
      pageSize: 10,
      action: 'login_failed',
      resourceType: 'auth',
    });

    const call = prisma.client.auditLog.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.action).toBe('login_failed');
    expect(call.where.resourceType).toBe('auth');
  });

  it('buildWhere：非法 startDate → 抛 INVALID_DATE', async () => {
    await expect(
      service.findAll({ page: 1, pageSize: 10, startDate: 'not-a-date' }),
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });
  });

  it('buildWhere：合法时间区间 → gte/lte', async () => {
    await service.findAll({
      page: 1,
      pageSize: 10,
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-02-01T00:00:00Z',
    });

    const call = prisma.client.auditLog.findMany.mock.calls[0][0] as {
      where: { createdAt: { gte: Date; lte: Date } };
    };
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    expect(call.where.createdAt.lte).toBeInstanceOf(Date);
  });

  it('clear：先 deleteMany 清空，再写 audit_cleared（rawClient，清空动作留痕）', async () => {
    prisma.client.auditLog.count.mockResolvedValue(42);
    prisma.rawClient.auditLog.deleteMany.mockResolvedValue({ count: 42 });

    const result = await service.clear('op-1');

    // 顺序必须：deleteMany 在前、audit_cleared 在后（否则清空记录也会被一并删除）
    const deleteOrder =
      prisma.rawClient.auditLog.deleteMany.mock.invocationCallOrder[0];
    const createOrder =
      prisma.rawClient.auditLog.create.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
    expect(prisma.rawClient.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'audit_cleared',
          accountId: 'op-1',
        }),
      }),
    );
    expect(prisma.rawClient.auditLog.deleteMany).toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 42 });
  });

  it('deleteOne：日志不存在 → 抛 AUDIT_LOG_NOT_FOUND', async () => {
    prisma.client.auditLog.findUnique.mockResolvedValue(null);

    await expect(service.deleteOne('nope')).rejects.toMatchObject({
      code: 'AUDIT_LOG_NOT_FOUND',
    });
  });

  it('exportLogs：上限 10000 条', async () => {
    await service.exportLogs({});

    const call = prisma.client.auditLog.findMany.mock.calls[0][0] as {
      take: number;
    };
    expect(call.take).toBe(10000);
  });
});
