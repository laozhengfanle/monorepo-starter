import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../../modules/system-config/system-config.service.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import type {
  StorageDeleteInput,
  StorageDriver,
  StorageUploadInput,
  StorageUploadResult,
} from './storage-driver.interface.js';

/** 存储驱动配置（system_config.storage.driver 的 value 形状） */
export interface StorageDriverConfig extends Record<string, unknown> {
  /** 驱动类型：local（默认）/ oss / cos / s3 */
  driver: 'local' | 'oss' | 'cos' | 's3';
  /** local：本地目录（默认 ./uploads） */
  localPath?: string;
  /** 云驱动字段（oss/cos/s3） */
  bucket?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
}

const STORAGE_CONFIG_KEY = 'storage.driver';

/**
 * 存储服务 —— 驱动工厂 + 统一入口。
 * - 懒加载：首次 upload/delete 时从 system_config.storage.driver 读取配置，实例化对应驱动
 *   （不在应用启动时查 DB，避免阻塞启动/e2e；配置读取失败回退 local）
 * - 默认 local；oss/cos/s3 为扩展点（后期实战对接云厂商时实现对应 Driver 类即可）
 * - upload/delete/getUrl 透传到底层驱动，业务层不关心实现
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private driver: StorageDriver | null = null;
  private readonly localFallback: LocalStorageDriver;

  constructor(
    private readonly configService: ConfigService,
    private readonly systemConfig: SystemConfigService,
  ) {
    this.localFallback = new LocalStorageDriver(configService);
  }

  /** 根据配置创建驱动实例（配置读取失败/未配置时回退 local） */
  async createDriver(): Promise<StorageDriver> {
    try {
      const config = await this.systemConfig.getValue<StorageDriverConfig>(STORAGE_CONFIG_KEY);
      const driverName = config?.driver ?? 'local';
      switch (driverName) {
        case 'local':
          return new LocalStorageDriver(this.configService);
        // ── 云驱动扩展点（后期实战对接时实现） ──
        case 'oss':
          // TODO: 实现 OssStorageDriver（阿里云 OSS）
          throw new Error('OSS 存储驱动尚未实现');
        case 'cos':
          // TODO: 实现 CosStorageDriver（腾讯云 COS）
          throw new Error('COS 存储驱动尚未实现');
        case 's3':
          // TODO: 实现 S3StorageDriver（AWS S3）
          throw new Error('S3 存储驱动尚未实现');
        default:
          throw new Error(`不支持的存储驱动: ${driverName}`);
      }
    } catch (err) {
      this.logger.warn(`存储驱动配置读取失败，回退 local: ${(err as Error).message}`);
      return this.localFallback;
    }
  }

  /** 配置变更后重新加载驱动（文件存储页保存驱动配置时调用） */
  async refreshDriver(): Promise<void> {
    this.driver = await this.createDriver();
    this.logger.log(`存储驱动已切换: ${this.driver.name}`);
  }

  private async requireDriver(): Promise<StorageDriver> {
    if (!this.driver) {
      this.driver = await this.createDriver();
      this.logger.log(`存储驱动: ${this.driver.name}`);
    }
    return this.driver;
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const driver = await this.requireDriver();
    return driver.upload(input);
  }

  async delete(input: StorageDeleteInput): Promise<void> {
    const driver = await this.requireDriver();
    return driver.delete(input);
  }

  async getUrl(storedName: string, folder: string): Promise<string> {
    const driver = await this.requireDriver();
    return driver.getUrl(storedName, folder);
  }
}
