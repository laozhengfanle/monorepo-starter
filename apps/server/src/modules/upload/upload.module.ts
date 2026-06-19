/**
 * 上传模块
 * - 注册 UploadService
 * - controller 入口
 */
import { Module } from '@nestjs/common';
import { UploadService } from './upload.service.js';
import { UploadController } from '../../bff/admin/uploads/upload.controller.js';

@Module({
    providers: [UploadService],
    controllers: [UploadController],
    exports: [UploadService],
})
export class UploadModule {}
