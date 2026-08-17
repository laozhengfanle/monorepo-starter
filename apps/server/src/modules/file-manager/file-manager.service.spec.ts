import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { FileManagerService } from './file-manager.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    accountId: 'acc-1',
    originalName: 'a.pdf',
    storedName: 'stored-a.pdf',
    mimeType: 'application/pdf',
    size: 100n,
    url: '/uploads/files/stored-a.pdf',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('FileManagerService', () => {
  let service: FileManagerService;
  let prisma: {
    client: {
      $transaction: ReturnType<typeof vi.fn<any>>;
      uploadFile: {
        findMany: ReturnType<typeof vi.fn<any>>;
        count: ReturnType<typeof vi.fn<any>>;
        findUnique: ReturnType<typeof vi.fn<any>>;
        update: ReturnType<typeof vi.fn<any>>;
      };
    };
    rawClient: {
      $transaction: ReturnType<typeof vi.fn<any>>;
      uploadFile: {
        findMany: ReturnType<typeof vi.fn<any>>;
        count: ReturnType<typeof vi.fn<any>>;
      };
    };
  };
  let storage: { delete: ReturnType<typeof vi.fn<any>> };
  let audit: { write: ReturnType<typeof vi.fn<any>> };

  beforeEach(async () => {
    prisma = {
      client: {
        $transaction: vi
          .fn<() => Promise<unknown>>()
          .mockResolvedValue([[makeRow()], 1]),
        uploadFile: {
          findMany: vi
            .fn<() => Promise<unknown>>()
            .mockResolvedValue([makeRow()]),
          count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
          findUnique: vi
            .fn<() => Promise<unknown>>()
            .mockResolvedValue(makeRow()),
          update: vi
            .fn<() => Promise<unknown>>()
            .mockResolvedValue(makeRow({ deletedAt: new Date() })),
        },
      },
      // 绕过软删除扩展的原始客户端（includeDeleted 场景使用）
      rawClient: {
        $transaction: vi
          .fn<() => Promise<unknown>>()
          .mockResolvedValue([[makeRow()], 1]),
        uploadFile: {
          findMany: vi
            .fn<() => Promise<unknown>>()
            .mockResolvedValue([makeRow()]),
          count: vi.fn<() => Promise<number>>().mockResolvedValue(1),
        },
      },
    };
    storage = {
      delete: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    audit = {
      write: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FileManagerService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(FileManagerService);
  });

  it('list：默认排除软删记录（deletedAt=null 条件）', async () => {
    await service.list({ page: 1, pageSize: 10 });

    // findMany 的 where 带 deletedAt=null（软删过滤）
    expect(prisma.client.uploadFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it('list：includeDeleted=true 时不过滤软删', async () => {
    await service.list({ page: 1, pageSize: 10, includeDeleted: true });

    // includeDeleted=true 走 rawClient（绕过软删扩展），where 不含 deletedAt 条件
    const call = prisma.rawClient.uploadFile.findMany.mock.calls[0][0] as {
      where?: Record<string, unknown>;
    };
    expect(call.where?.deletedAt).toBeUndefined();
  });

  it('remove：文件不存在或已软删 → 抛 FILE_NOT_FOUND', async () => {
    prisma.client.uploadFile.findUnique.mockResolvedValue(null);

    await expect(service.remove('nope', 'op-1')).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
    });
  });

  it('remove：物理删除 + 软删元数据 + 审计', async () => {
    await service.remove('file-1', 'op-1');

    // 物理文件删除（从 url 解析 folder）
    expect(storage.delete).toHaveBeenCalledWith({
      storedName: 'stored-a.pdf',
      folder: 'files',
    });
    // 软删元数据
    expect(prisma.client.uploadFile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    // 审计
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.FILE_DELETED,
        accountId: 'op-1',
      }),
    );
  });

  it('folderFromUrl：从 /uploads/{folder}/{storedName} 解析目录', async () => {
    // 通过 remove 间接验证：url 为 /uploads/avatars/xxx.png 时 folder=avatars
    prisma.client.uploadFile.findUnique.mockResolvedValue(
      makeRow({ url: '/uploads/avatars/x.png' }),
    );
    await service.remove('file-1', 'op-1');

    expect(storage.delete).toHaveBeenCalledWith({
      storedName: 'stored-a.pdf',
      folder: 'avatars',
    });
  });
});
