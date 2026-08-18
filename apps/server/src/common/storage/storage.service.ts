import { Injectable, Logger } from '@nestjs/common';
import { BizException } from '@starter/server-core';
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
 *   （不在应用启动时查 DB，避免阻塞启动/e2e）
 * - 默认 local；oss/cos/s3 为扩展点（后期实战对接云厂商时实现对应 Driver 类即可）
 * - 配置读取失败（DB 不可用等）→ 回退 local（fail-open，保持服务可用）；
 *   配置显式指定了未实现的云驱动 → 抛带业务码的 BizException（绝不静默降级到 local，
 *   否则用户以为文件进了 OSS，实际落在本地磁盘，属于数据落位错误）
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

  /** 根据配置创建驱动实例（配置读取失败回退 local；未实现的云驱动抛 BizException） */
  async createDriver(): Promise<StorageDriver> {
    let config: StorageDriverConfig | undefined;
    try {
      config =
        (await this.systemConfig.getValue<StorageDriverConfig>(
          STORAGE_CONFIG_KEY,
        )) ?? undefined;
    } catch (err) {
      // 配置读取失败（DB 不可用/配置表异常）→ 回退 local（fail-open，保持上传可用）
      this.logger.warn(
        `存储驱动配置读取失败，回退 local: ${(err as Error).message}`,
      );
      return this.localFallback;
    }

    const driverName = config?.driver ?? 'local';
    switch (driverName) {
      case 'local':
        return new LocalStorageDriver(this.configService);
      // ── 云驱动扩展点（后期实战对接时实现）──
      // 显式抛 BizException（带业务码），由全局异常过滤器映射为可读错误，
      // 而非裸 Error（500 裸错）或静默回退 local（数据落位错误）
      case 'oss':
        throw new BizException({
          code: 'STORAGE_DRIVER_NOT_IMPLEMENTED',
          message: 'OSS 存储驱动尚未实现，请先切换为 local 或等待云驱动上线',
        });
      case 'cos':
        throw new BizException({
          code: 'STORAGE_DRIVER_NOT_IMPLEMENTED',
          message: 'COS 存储驱动尚未实现，请先切换为 local 或等待云驱动上线',
        });
      case 's3':
        throw new BizException({
          code: 'STORAGE_DRIVER_NOT_IMPLEMENTED',
          message: 'S3 存储驱动尚未实现，请先切换为 local 或等待云驱动上线',
        });
      default:
        throw new BizException({
          code: 'STORAGE_DRIVER_UNSUPPORTED',
          message: `不支持的存储驱动: ${driverName}`,
        });
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
