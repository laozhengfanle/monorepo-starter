import {
  Controller,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MaxFileSizeValidator } from '@nestjs/common';
import { ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { UploadResult } from '@starter/contracts';
import { newId } from '@starter/server-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UploadService } from './upload.service.js';

/** 上传目录（env UPLOAD_DIR 可覆盖，默认仓库根 uploads/） */
const UPLOAD_DIR = resolve(process.env['UPLOAD_DIR'] ?? 'uploads');
/** 单文件大小上限：10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 确保上传目录存在（diskStorage 不自动创建）
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * 文件上传端点（阶段 3）：
 * - POST /upload：multipart 单文件，diskStorage 存本地 uploads/，记录元数据到 UploadFile 表
 * - 需 JWT 认证；文件大小 ≤ 10MB
 * - 静态访问：/uploads/{storedName}（见 app-setup 的 express.static）
 */
@ApiTags('upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: '上传成功返回文件信息' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        // UUIDv7 文件名 + 原扩展名，防冲突且时间有序
        filename: (_req, file, callback) => {
          callback(null, `${newId()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE })],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ): Promise<UploadResult> {
    return this.uploadService.save(file, user.accountId);
  }
}
