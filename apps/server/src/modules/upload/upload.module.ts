import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UploadController } from './upload.controller.js';
import { UploadService } from './upload.service.js';

/** 文件上传模块（本地磁盘存储 + UploadFile 元数据） */
@Module({
  imports: [AuthModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
