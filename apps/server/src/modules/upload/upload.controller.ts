import {
  Body,
  Controller,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import type { UploadResult } from '@starter/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UploadService } from './upload.service.js';

/** 单文件大小上限：10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 文件上传端点：
 * - POST /upload：multipart 单文件，memoryStorage 读 Buffer → 存储驱动落盘（默认本地 uploads/）
 * - 需 JWT 认证；文件大小 ≤ 10MB
 * - folder 表单字段可选（avatars / logos / files，默认 files），白名单由存储驱动校验
 * - 静态访问：/uploads/{folder}/{storedName}（见 app-setup 的 express.static）
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
      storage: memoryStorage(),
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
    @Body() body: { folder?: string },
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<UploadResult> {
    return this.uploadService.save(file, user.accountId, body.folder ?? 'files', {
      ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
