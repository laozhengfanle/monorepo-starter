import { Test } from '@nestjs/testing';
import { vi, describe, expect, it, beforeEach } from 'vitest';
import { UploadService } from './upload.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

describe('UploadService', () => {
  let service: UploadService;
  let storage: { upload: ReturnType<typeof vi.fn<any>> };
  let prisma: {
    client: { uploadFile: { create: ReturnType<typeof vi.fn<any>> } };
  };
  let audit: { write: ReturnType<typeof vi.fn<any>> };

  const file = {
    originalname: 'report.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('pdf-bytes'),
    size: 9,
  } as { originalname: string; mimetype: string; buffer: Buffer; size: number };

  beforeEach(async () => {
    storage = {
      upload: vi.fn<any>().mockResolvedValue({
        storedName: 'stored-1.pdf',
        size: 9,
        url: '/uploads/files/stored-1.pdf',
      }),
    };
    prisma = {
      client: {
        uploadFile: {
          create: vi.fn<any>().mockResolvedValue({
            id: 'file-1',
            originalName: 'report.pdf',
            storedName: 'stored-1.pdf',
            mimeType: 'application/pdf',
            size: 9n,
            url: '/uploads/files/stored-1.pdf',
          }),
        },
      },
    };
    audit = { write: vi.fn<any>().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: StorageService, useValue: storage },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(UploadService);
  });

  it('save：调用存储驱动落盘 → 记录 UploadFile 元数据 → 写审计', async () => {
    const result = await service.save(file, 'acc-1', 'files', {
      ip: '1.2.3.4',
    });

    expect(storage.upload).toHaveBeenCalledWith({
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      buffer: file.buffer,
      folder: 'files',
    });
    expect(prisma.client.uploadFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'acc-1',
          storedName: 'stored-1.pdf',
        }),
      }),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.FILE_UPLOADED,
        accountId: 'acc-1',
        ip: '1.2.3.4',
      }),
    );
    expect(result).toEqual({
      id: 'file-1',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      size: 9,
      url: '/uploads/files/stored-1.pdf',
    });
  });

  it('save：folder 缺省为 files', async () => {
    await service.save(file, 'acc-1');

    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'files' }),
    );
  });
});
