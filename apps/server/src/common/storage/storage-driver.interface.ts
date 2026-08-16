/**
 * 存储驱动接口 —— 统一的文件存储抽象（本地磁盘 / OSS / COS / S3 可插拔）。
 * controller / resolver 不关心底层实现，只依赖此接口。
 */

/** 文件上传入参 */
export interface StorageUploadInput {
  /** 原始文件名（含扩展名，用于取扩展名） */
  originalName: string;
  /** MIME 类型 */
  mimeType: string;
  /** 文件二进制内容 */
  buffer: Buffer;
  /** 目标文件夹（白名单：avatars / logos / files 等） */
  folder: string;
}

/** 文件上传结果 */
export interface StorageUploadResult {
  /** 存储后的文件名（UUID 重命名，防冲突） */
  storedName: string;
  /** 公开访问 URL（local: /uploads/{folder}/{storedName}；云: 签名/公开 URL） */
  url: string;
  /** 文件字节数 */
  size: number;
}

/** 文件删除入参 */
export interface StorageDeleteInput {
  /** 存储的文件名 */
  storedName: string;
  /** 所在文件夹 */
  folder: string;
}

/** 存储驱动（STORE_DRIVER_TOKEN 注入；工厂按 system_config.storage.driver 选择实现） */
export interface StorageDriver {
  /** 驱动标识（local / oss / cos / s3） */
  readonly name: string;

  /** 上传：UUID 重命名 + 写入存储 + 返回 URL */
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;

  /** 删除：已删除/不存在视为幂等，不抛错 */
  delete(input: StorageDeleteInput): Promise<void>;

  /** 拼接公开访问 URL（云驱动可能生成签名 URL） */
  getUrl(storedName: string, folder: string): string;
}

/** 存储驱动注入 Token */
export const STORAGE_DRIVER_TOKEN = Symbol('STORAGE_DRIVER');

/** 存储文件夹白名单（防路径逃逸 / 任意写入） */
export const STORAGE_FOLDERS = ['avatars', 'logos', 'files'] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

/** 校验文件夹是否在白名单内（非法抛错） */
export function assertStorageFolder(folder: string): asserts folder is StorageFolder {
  if (!(STORAGE_FOLDERS as readonly string[]).includes(folder)) {
    throw new Error(`非法存储文件夹: ${folder}`);
  }
}
