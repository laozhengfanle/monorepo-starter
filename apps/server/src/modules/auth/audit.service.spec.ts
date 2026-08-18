import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { BusinessMetrics } from '../../common/metrics/business.metrics.js';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    client: { auditLog: { create: ReturnType<typeof vi.fn<any>> } };
  };
  let metrics: {
    incAuditLogWrite: ReturnType<typeof vi.fn<any>>;
    incAuditLogWriteFailure: ReturnType<typeof vi.fn<any>>;
  };

  beforeEach(async () => {
    prisma = {
      client: {
        auditLog: { create: vi.fn<any>().mockResolvedValue({}) },
      },
    };
    metrics = {
      incAuditLogWrite: vi.fn<any>(),
      incAuditLogWriteFailure: vi.fn<any>(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prisma },
        { provide: BusinessMetrics, useValue: metrics },
      ],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  it('write：成功 → audit_log.create + 成功计数（无失败计数）', async () => {
    await service.write({
      accountId: 'acc-1',
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    });

    expect(prisma.client.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.LOGIN_SUCCESS,
          accountId: 'acc-1',
        }),
      }),
    );
    expect(metrics.incAuditLogWrite).toHaveBeenCalledWith(
      AUDIT_ACTIONS.LOGIN_SUCCESS,
    );
    expect(metrics.incAuditLogWriteFailure).not.toHaveBeenCalled();
  });

  it('write：create 失败 → fail-open（不抛出）+ 失败计数', async () => {
    prisma.client.auditLog.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.write({ action: AUDIT_ACTIONS.LOGIN_FAILED }),
    ).resolves.toBeUndefined();

    // fail-open：审计失败不阻塞主流程，但失败必须可观测
    expect(metrics.incAuditLogWrite).not.toHaveBeenCalled();
    expect(metrics.incAuditLogWriteFailure).toHaveBeenCalledWith(
      AUDIT_ACTIONS.LOGIN_FAILED,
    );
  });

  it('write：resourceType 未传时按 action 自动补全（login_* → auth）', async () => {
    await service.write({ action: AUDIT_ACTIONS.LOGIN_SUCCESS });

    const call = prisma.client.auditLog.create.mock.calls[0]![0] as {
      data: { resourceType?: string };
    };
    expect(call.data.resourceType).toBe('auth');
  });

  it('write：显式 resourceType 不被覆盖（DICT_* 的 sys_dict_item 场景）', async () => {
    await service.write({
      action: AUDIT_ACTIONS.DICT_CREATED,
      resourceType: 'sys_dict_item',
    });

    const call = prisma.client.auditLog.create.mock.calls[0]![0] as {
      data: { resourceType?: string };
    };
    expect(call.data.resourceType).toBe('sys_dict_item');
  });

  it('write：detail 透传为可 JSON 序列化值（不再 as never 逃逸类型）', async () => {
    await service.write({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      detail: { reason: 'wrong_password', nested: { attempts: 3 } },
    });

    const call = prisma.client.auditLog.create.mock.calls[0]![0] as {
      data: { detail?: unknown };
    };
    expect(call.data.detail).toEqual({
      reason: 'wrong_password',
      nested: { attempts: 3 },
    });
  });

  it('write：词表外 action 仅告警不阻断写入', async () => {
    await service.write({ action: 'not_in_vocab' });

    expect(prisma.client.auditLog.create).toHaveBeenCalled();
  });
});
