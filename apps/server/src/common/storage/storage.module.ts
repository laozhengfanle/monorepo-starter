import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';

/**
 * 存储全局模块
 * - StorageService 为驱动工厂（从 system_config.storage.driver 选择 local/oss/cos/s3）
 * - 全局提供，upload 模块 / 文件管理模块直接注入
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
