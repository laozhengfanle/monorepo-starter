import { Injectable } from '@nestjs/common';
import { newId } from '@starter/server-core';
import type { UploadResult } from '@starter/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** 保存上传文件元数据，返回前端可用结果 */
@Injectable()
export class UploadService {
  constructor(private readonly prisma: PrismaService) {}

  async save(file: Express.Multer.File, accountId: string): Promise<UploadResult> {
    const url = `/uploads/${file.filename}`;
    const record = await this.prisma.client.uploadFile.create({
      data: {
        id: newId(),
        accountId,
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: BigInt(file.size),
        url,
      } as never,
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
