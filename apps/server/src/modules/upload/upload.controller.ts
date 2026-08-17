import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
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
import { clientInfo } from '../auth/auth.service.js';
import { UploadService } from './upload.service.js';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  extractSafeExtension,
  mimeTypeMatchesExtension,
} from '../../common/storage/local-storage.driver.js';

/** 单文件大小上限：10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 文件上传端点：
 * - POST /upload：multipart 单文件，memoryStorage 读 Buffer → 存储驱动落盘（默认本地 uploads/）
 * - 需 JWT 认证；文件大小 ≤ 10MB；MIME 白名单（image/*、pdf、doc/docx、xls/xlsx、zip、txt）
 * - 防伪装：mimetype 必须与扩展名一致（扩展名白名单，svg/html/js 明确拒绝）
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
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          // MIME 白名单：只允许常见图片/文档/表格/压缩包，svg/html/js 等脚本类型拒绝
          // FileTypeValidator.fileType 接受 string|RegExp，数组转成正则匹配任意白名单项
          new FileTypeValidator({
            fileType: new RegExp(
              `^(?:${ALLOWED_UPLOAD_MIME_TYPES.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
            ),
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() body: { folder?: string },
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<UploadResult> {
    // 防伪装：mimetype 必须与扩展名一致（mimetype 是客户端声明的，不可全信；
    // 扩展名也必须在白名单内，否则拒绝——svg/html/js 无对应白名单扩展名）
    const ext = extractSafeExtension(file.originalname);
    if (!ext || !mimeTypeMatchesExtension(file.mimetype, ext)) {
      throw new BadRequestException('文件扩展名与类型不匹配或类型不被允许');
    }
    return this.uploadService.save(
      file,
      user.accountId,
      body.folder ?? 'files',
      clientInfo(req),
    );
  }
}
