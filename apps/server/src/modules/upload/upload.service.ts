import { Injectable } from '@nestjs/common';
import { newId } from '@starter/server-core';
import type { UploadResult } from '@starter/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

/** 客户端网络信息（审计用，可选） */
export interface UploadClientInfo {
  ip?: string;
  userAgent?: string;
}

/**
 * 上传服务：走存储驱动（默认本地磁盘，可切 OSS/COS/S3）。
 * - multer 用 memoryStorage 拿 Buffer → StorageService.upload 落盘 → UploadFile 表记录元数据
 * - 上传成功写审计 FILE_UPLOADED（资源类型 upload_file）
 */
@Injectable()
export class UploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async save(
    file: Express.Multer.File,
    accountId: string,
    folder = 'files',
    clientInfo?: UploadClientInfo,
  ): Promise<UploadResult> {
    const stored = await this.storage.upload({
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      folder,
    });

    const record = await this.prisma.client.uploadFile.create({
      data: {
        id: newId(),
        accountId,
        originalName: file.originalname,
        storedName: stored.storedName,
        mimeType: file.mimetype,
        size: BigInt(stored.size),
        url: stored.url,
      } as never,
    });

    await this.audit.write({
      accountId,
      action: AUDIT_ACTIONS.FILE_UPLOADED,
      resourceId: record.id,
      detail: {
        fileId: record.id,
        originalName: record.originalName,
        folder,
        size: Number(record.size),
        url: record.url,
      },
      ip: clientInfo?.ip,
      userAgent: clientInfo?.userAgent,
    });

    return {
      id: record.id,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: Number(record.size),
      url: record.url,
    };
  }
}
