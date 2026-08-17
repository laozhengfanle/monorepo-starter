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
 * 上传扩展名白名单（小写、不含点）。
 * 安全：svg/html/js 等可被浏览器同源执行的脚本/文档类型一律不在白名单内 → 明确拒绝，
 * 防止通过 /uploads 静态服务实现存储型 XSS。
 */
export const ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif', // 图片
  'txt', // 纯文本
  'pdf',
  'doc',
  'docx', // 文档
  'xls',
  'xlsx', // 表格
  'zip', // 压缩包
] as const;

/** 扩展名 → 允许的 MIME 类型（controller 校验 mimetype 与扩展名一致，防伪装） */
export const EXTENSION_MIME_TYPES: Readonly<Record<string, readonly string[]>> =
  {
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    gif: ['image/gif'],
    txt: ['text/plain'],
    pdf: ['application/pdf'],
    doc: ['application/msword'],
    docx: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    xls: ['application/vnd.ms-excel'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    zip: ['application/zip'],
  };

/** 全部允许的 MIME 类型（FileTypeValidator 白名单用） */
export const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
  ...new Set(Object.values(EXTENSION_MIME_TYPES).flat()),
];

/** 从原始文件名取白名单内的安全扩展名（如 'jpg'；无扩展名/非白名单返回 ''） */
export function extractSafeExtension(originalName: string): string {
  const idx = originalName.lastIndexOf('.');
  if (idx <= 0 || idx === originalName.length - 1) {
    return '';
  }
  const ext = originalName.slice(idx + 1).toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.includes(ext) ? ext : '';
}

/** MIME 类型是否与该扩展名匹配（防伪装；容忍 'text/plain; charset=utf-8' 形式的参数） */
export function mimeTypeMatchesExtension(
  mimeType: string,
  ext: string,
): boolean {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return (EXTENSION_MIME_TYPES[ext] ?? []).includes(normalized);
}

/**
 * 本地磁盘存储驱动（默认）
 * - 上传：UUID 重命名 + writeFile 到 {rootDir}/{folder}/
 * - 删除：unlink（不存在的文件不报错）
 * - 拼接 URL：{publicBaseUrl}/{folder}/{storedName}
 *
 * 安全：
 * - 文件夹白名单（avatars/logos/files），不接收用户输入
 * - 扩展名白名单（ALLOWED_UPLOAD_EXTENSIONS）：svg/html/js 等脚本类型明确拒绝
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
    this.rootDir = resolve(
      configService.get<string>('UPLOAD_DIR') ?? 'uploads',
    );
    this.publicBaseUrl = (
      configService.get<string>('STORAGE_PUBLIC_BASE_URL') ?? '/uploads'
    ).replace(/\/$/, '');
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
        this.logger.warn(
          `删除本地文件失败 ${filePath}: ${(err as Error).message}`,
        );
      }
    }
  }

  getUrl(storedName: string, folder: string): string {
    assertStorageFolder(folder);
    return `${this.publicBaseUrl}/${folder}/${storedName}`;
  }

  /** 取白名单内安全扩展名（'.jpg' 带点形式；非白名单/无扩展名返回 ''，svg/html/js 等脚本类型明确拒绝） */
  private extractExt(originalName: string): string {
    const ext = extractSafeExtension(originalName);
    return ext ? `.${ext}` : '';
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
