import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { newId } from '@starter/server-core';
import {
  assertStorageFolder,
  type StorageDeleteInput,
  type StorageDriver,
  type StorageUploadInput,
  type StorageUploadResult,
} from './storage-driver.interface.js';

/** 本地存储单文件大小上限：100MB（兜底防护；上层 controller 已有更严格限制） */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * 本地磁盘存储驱动（默认）
 * - 上传：UUID 重命名 + writeFile 到 {rootDir}/{folder}/
 * - 删除：unlink（不存在的文件不报错）
 * - 拼接 URL：{publicBaseUrl}/{folder}/{storedName}
 *
 * 安全：
 * - 文件夹白名单（avatars/logos/files），不接收用户输入
 * - 存储文件名 UUID v7，不暴露原始名
 * - 路径逃逸防护：resolve 后校验最终路径仍在 rootDir 内
 * - 文件大小上限 100MB 兜底
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly logger = new Logger(LocalStorageDriver.name);
  private readonly rootDir: string;
  private readonly publicBaseUrl: string;

  constructor(configService: ConfigService) {
    this.rootDir = resolve(configService.get<string>('UPLOAD_DIR') ?? 'uploads');
    this.publicBaseUrl = (configService.get<string>('STORAGE_PUBLIC_BASE_URL') ?? '/uploads').replace(
      /\/$/,
      '',
    );
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    if (input.buffer.length > MAX_FILE_SIZE) {
      throw new Error(`文件大小超过上限 ${MAX_FILE_SIZE} bytes`);
    }
    if (input.buffer.length === 0) {
      throw new Error('文件内容为空');
    }
    assertStorageFolder(input.folder);

    const ext = this.extractExt(input.originalName);
    const storedName = `${newId()}${ext}`;
    const dir = this.resolveSafePath(input.folder);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, storedName), input.buffer);

    return {
      storedName,
      url: this.getUrl(storedName, input.folder),
      size: input.buffer.length,
    };
  }

  async delete(input: StorageDeleteInput): Promise<void> {
    assertStorageFolder(input.folder);
    const filePath = this.resolveSafePath(input.folder, input.storedName);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // 已删除/不存在视为幂等
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`删除本地文件失败 ${filePath}: ${(err as Error).message}`);
      }
    }
  }

  getUrl(storedName: string, folder: string): string {
    assertStorageFolder(folder);
    return `${this.publicBaseUrl}/${folder}/${storedName}`;
  }

  /** 取安全扩展名（'.png'，无则空串） */
  private extractExt(originalName: string): string {
    const idx = originalName.lastIndexOf('.');
    if (idx <= 0 || idx === originalName.length - 1) {
      return '';
    }
    const ext = originalName.slice(idx).toLowerCase();
    // 仅允许常见图片/文件扩展名，防恶意双扩展名
    return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
  }

  /** 拼接并校验路径仍在 rootDir 内（防目录穿越） */
  private resolveSafePath(folder: string, storedName?: string): string {
    const target = storedName
      ? resolve(this.rootDir, folder, storedName)
      : resolve(this.rootDir, folder);
    const rel = relative(this.rootDir, target);
    if (rel.startsWith('..') || resolve(rel) === resolve('..')) {
      throw new Error('非法存储路径');
    }
    return target;
  }
}
