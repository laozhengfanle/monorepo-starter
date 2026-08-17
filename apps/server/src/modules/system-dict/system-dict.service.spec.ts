import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { SysDictService } from './system-dict.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

function makeTypeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    code: 'audit_action',
    name: '审计动作',
    remark: null,
    enabled: true,
    sort: 0,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SysDictService', () => {
  let service: SysDictService;
  let prisma: {
    client: {
      sysDictType: {
        findMany: ReturnType<typeof vi.fn<any>>;
        findUnique: ReturnType<typeof vi.fn<any>>;
        create: ReturnType<typeof vi.fn<any>>;
        update: ReturnType<typeof vi.fn<any>>;
        delete: ReturnType<typeof vi.fn<any>>;
      };
      sysDictItem: {
        findMany: ReturnType<typeof vi.fn<any>>;
        create: ReturnType<typeof vi.fn<any>>;
      };
    };
  };
  let audit: { write: ReturnType<typeof vi.fn<any>> };

  beforeEach(async () => {
    prisma = {
      client: {
        sysDictType: {
          findMany: vi.fn<any>().mockResolvedValue([makeTypeRow()]),
          findUnique: vi.fn<any>().mockResolvedValue(makeTypeRow()),
          create: vi.fn<any>().mockResolvedValue(makeTypeRow()),
          update: vi.fn<any>().mockResolvedValue(makeTypeRow()),
          delete: vi.fn<any>().mockResolvedValue(makeTypeRow()),
        },
        sysDictItem: {
          findMany: vi.fn<any>().mockResolvedValue([]),
          create: vi
            .fn<any>()
            .mockResolvedValue({
              id: 'i1',
              dictTypeId: 't1',
              label: 'x',
              value: 'y',
            }),
        },
      },
    };
    audit = { write: vi.fn<any>().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SysDictService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(SysDictService);
  });

  it('listTypes：返回字典类型列表（含 items）', async () => {
    const result = await service.listTypes();

    expect(prisma.client.sysDictType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { items: true } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('audit_action');
  });

  it('createType：创建成功 + 审计 DICT_CREATED', async () => {
    const result = await service.createType(
      { code: 'gender', name: '性别' },
      'op-1',
    );

    expect(prisma.client.sysDictType.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'gender', name: '性别' }),
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.DICT_CREATED,
        accountId: 'op-1',
      }),
    );
    expect(result.code).toBe('audit_action');
  });

  it('createType：唯一约束冲突 → 抛 DICT_CODE_EXISTS', async () => {
    prisma.client.sysDictType.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.createType({ code: 'dup', name: 'x' }, 'op-1'),
    ).rejects.toMatchObject({
      code: 'DICT_CODE_EXISTS',
    });
  });

  it('updateType：类型不存在 → 抛 DICT_TYPE_NOT_FOUND', async () => {
    prisma.client.sysDictType.findUnique.mockResolvedValue(null);

    await expect(
      service.updateType('nope', { name: 'x' }, 'op-1'),
    ).rejects.toMatchObject({
      code: 'DICT_TYPE_NOT_FOUND',
    });
  });

  it('removeType：级联删除 + 审计 DICT_DELETED', async () => {
    const result = await service.removeType('t1', 'op-1');

    expect(prisma.client.sysDictType.delete).toHaveBeenCalledWith({
      where: { id: 't1' },
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.DICT_DELETED,
        resourceId: 't1',
      }),
    );
    expect(result).toEqual({ success: true });
  });

  it('createItem：字典类型不存在 → 抛 DICT_TYPE_NOT_FOUND', async () => {
    prisma.client.sysDictType.findUnique.mockResolvedValue(null);

    await expect(
      service.createItem(
        { dictTypeId: 'nope', label: 'x', value: 'y' },
        'op-1',
      ),
    ).rejects.toMatchObject({ code: 'DICT_TYPE_NOT_FOUND' });
  });
});
