import { Injectable } from '@nestjs/common';
import { BizException } from '@starter/server-core';
import type { PaginatedData, UploadFile } from '@starter/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { AuditService, AUDIT_ACTIONS } from '../auth/audit.service.js';

/** Prisma UploadFile 行 → 契约 UploadFile */
function toFile(row: {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: bigint;
  url: string;
  accountId: string;
  createdAt: Date;
  deletedAt: Date | null;
}): UploadFile {
  return {
    id: row.id,
    originalName: row.originalName,
    storedName: row.storedName,
    mimeType: row.mimeType,
    size: Number(row.size),
    url: row.url,
    accountId: row.accountId,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/**
 * 文件管理服务（UploadFile 元数据 + 存储驱动物理文件）
 * - 列表：分页 + 软删过滤（默认不显示已删）
 * - 软删：置 deletedAt + 驱动删物理文件（默认 local 落盘即删；云驱动同样删对象）
 * - 硬删：清元数据行
 * - 审计：FILE_DELETED
 */
@Injectable()
export class FileManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** 文件列表（默认排除已软删；includeDeleted 时含已删） */
  async list(query: {
    page: number;
    pageSize: number;
    includeDeleted?: boolean;
  }): Promise<PaginatedData<UploadFile>> {
    const where: Record<string, unknown> = {};
    if (!query.includeDeleted) {
      where.deletedAt = null;
    }
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.uploadFile.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.uploadFile.count({ where }),
    ]);
    return {
      items: rows.map(toFile),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** 软删文件：物理文件交给驱动删除（默认本地 unlink），元数据置 deletedAt */
  async remove(id: string, operatorId: string): Promise<UploadFile> {
    const file = await this.prisma.client.uploadFile.findUnique({ where: { id } });
    if (!file || file.deletedAt) {
      throw new BizException({ code: 'FILE_NOT_FOUND', message: '文件不存在' });
    }
    // 物理文件删除（幂等：不存在不报错）
    await this.storage.delete({
      storedName: file.storedName,
      folder: this.folderFromUrl(file.url),
    });
    const updated = await this.prisma.client.uploadFile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.write({
      accountId: operatorId,
      action: AUDIT_ACTIONS.FILE_DELETED,
      resourceId: id,
      detail: { originalName: file.originalName },
    });
    return toFile(updated);
  }

  /** 从 url（/uploads/{folder}/{storedName}）解析 folder；解析失败回退 files */
  private folderFromUrl(url: string): string {
    const parts = url.split('/').filter(Boolean);
    // /uploads/folder/storedName → folder = parts[1]
    if (parts.length >= 3 && parts[0] === 'uploads') {
      return parts[1]!;
    }
    return 'files';
  }
}
