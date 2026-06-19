/**
 * 存储服务接口
 * - 抽象统一的文件存储 API，便于切换 local / S3 等驱动
 * - controller / resolver 不关心底层是本地磁盘还是对象存储
 */

/** 文件上传选项 */
export interface UploadOptions {
    /** 原始文件名（含扩展名） */
    originalName: string;
    /** MIME 类型 */
    mimeType: string;
    /** 文件二进制内容（Buffer） */
    buffer: Buffer;
    /** 目标文件夹（如 'avatars', 'files'） */
    folder: string;
    /** 账户 ID（用于审计 + 命名空间） */
    accountId: string;
}

/** 文件上传结果 */
export interface UploadResult {
    /** 存储后的文件名（UUID 重命名） */
    storedName: string;
    /** 公开访问 URL */
    url: string;
    /** 文件字节数 */
    size: number;
    /** MIME 类型 */
    mimeType: string;
}

/** 文件删除选项 */
export interface DeleteOptions {
    /** 存储的文件名 */
    storedName: string;
    /** 所在文件夹 */
    folder: string;
}

/**
 * 存储服务接口
 * - upload: 上传文件
 * - delete: 删除文件
 * - getUrl: 拼接公开访问 URL（某些驱动可能需要生成签名 URL）
 */
export interface IStorageService {
    /**
     * 上传文件
     * - 内部完成：UUID 重命名 + 写入存储 + 返回 URL
     * - Phase 5：本地磁盘（从 buffer 写盘）
     * - Phase 8：S3（从 buffer 直传）
     */
    upload(opts: UploadOptions): Promise<UploadResult>;

    /**
     * 删除文件
     * - 删除失败时不抛错（已删除文件视为幂等）
     */
    delete(opts: DeleteOptions): Promise<void>;

    /**
     * 拼接公开访问 URL
     * - local 驱动：返回 /uploads/{folder}/{storedName}
     * - S3 驱动：返回 https://bucket.s3.region.amazonaws.com/{folder}/{storedName}
     * - 用于 controller 拼接响应 / 渲染到前端
     */
    getUrl(storedName: string, folder: string): string;
}

/** 存储服务注入 Token */
export const STORAGE_SERVICE_TOKEN = 'IStorageService';
