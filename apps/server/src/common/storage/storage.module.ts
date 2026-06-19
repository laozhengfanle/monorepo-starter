/**
 * 存储全局模块
 * - 根据 STORAGE_DRIVER 注入不同的存储实现
 * - 当前仅支持 local（未来可扩展 S3）
 */
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_SERVICE_TOKEN } from './storage.interface.js';
import { LocalStorageService } from './local-storage.service.js';

@Global()
@Module({
    providers: [
        {
            provide: STORAGE_SERVICE_TOKEN,
            useFactory: (configService: ConfigService) => {
                const driver = configService.get<string>('storage.STORAGE_DRIVER') ?? 'local';
                switch (driver) {
                    case 'local':
                        return new LocalStorageService(configService);
                    default:
                        throw new Error(`Unsupported storage driver: ${driver}`);
                }
            },
            inject: [ConfigService],
        },
    ],
    exports: [STORAGE_SERVICE_TOKEN],
})
export class StorageModule {}
