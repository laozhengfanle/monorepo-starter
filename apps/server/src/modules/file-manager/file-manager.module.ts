import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FileManagerResolver } from './file-manager.resolver.js';
import { FileManagerService } from './file-manager.service.js';

/** 文件管理模块（UploadFile 列表/删除，存储驱动统一，权限 config:file:*） */
@Module({
  imports: [AuthModule],
  providers: [FileManagerService, FileManagerResolver],
  exports: [FileManagerService],
})
export class FileManagerModule {}
