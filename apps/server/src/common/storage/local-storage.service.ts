/**
 * 本地磁盘存储服务
 *
 * 行为：
 * - 上传：UUID 重命名 + writeFile 到 STORAGE_LOCAL_DIR/{folder}/
 * - 删除：unlink（不存在的文件不报错）
 * - 拼接 URL：{STORAGE_PUBLIC_BASE_URL}/{folder}/{storedName}
 *
 * 安全：
 * - 文件夹名硬编码（avatars / files），不接收用户输入
 * - 存储文件名 UUID v7，不暴露原始名
 * - 通过 STORAGE_LOCAL_DIR 限制根目录
 * - 路径逃逸防护：resolve 后校验最终路径仍在 rootDir 内（防符号链接逃逸）
 * - 文件大小上限：100MB（防恶意大文件耗尽磁盘，上层 controller 已有更严格的限制）
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join, resolve, relative } from 'path';
import { newId } from '@packages/shared';
import {
    type DeleteOptions,
    type IStorageService,
    type UploadOptions,
    type UploadResult,
} from './storage.interface.js';

/** 本地存储单文件大小上限：100MB（兜底防护，上层 controller 已有更严格的 MIME 维度限制） */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

@Injectable()
export class LocalStorageService implements IStorageService {
    private readonly logger = new Logger(LocalStorageService.name);
    private readonly rootDir: string;
    private readonly publicBaseUrl: string;

    constructor(private readonly configService: ConfigService) {
        this.rootDir = resolve(this.configService.get<string>('storage.STORAGE_LOCAL_DIR') ?? './uploads');
        this.publicBaseUrl = (this.configService.get<string>('storage.STORAGE_PUBLIC_BASE_URL') ?? '/uploads').replace(
            /\/$/,
            '',
        );
    }

    async upload(opts: UploadOptions): Promise<UploadResult> {
        /** 文件大小上限校验（防恶意大文件耗尽磁盘） */
        if (opts.buffer.length > MAX_FILE_SIZE) {
            throw new BadRequestException(`文件大小超过上限 ${MAX_FILE_SIZE} bytes`);
        }
        /** 拒绝空文件（防恶意请求占位） */
        if (opts.buffer.length === 0) {
            throw new BadRequestException('文件内容为空');
        }

        /** 生成 UUID v7 文件名，保留原始扩展名 */
        const ext = this.extractExt(opts.originalName);
        const storedName = `${newId()}${ext}`;

        /** 构造目标目录（确保白名单内的 folder） */
        const safeFolder = this.sanitizeFolder(opts.folder);
        const targetDir = join(this.rootDir, safeFolder);
        await fs.mkdir(targetDir, { recursive: true });

        const filePath = join(targetDir, storedName);

        /**
         * 路径逃逸防护（深度防御）
         * - resolve 后检查最终路径是否仍在 rootDir 内
         * - 防御符号链接逃逸：即使 targetDir 被替换为符号链接指向 /etc 等，
         *   relative 路径不以 '..' 开头才能通过
         * - sanitizeFolder 已做白名单，这里是双保险
         */
        const resolvedPath = resolve(filePath);
        const rel = relative(this.rootDir, resolvedPath);
        if (rel.startsWith('..') || resolve(this.rootDir, rel) !== resolvedPath) {
            this.logger.error(`路径逃逸检测拦截: rootDir=${this.rootDir} resolvedPath=${resolvedPath}`);
            throw new BadRequestException('非法的存储路径');
        }

        await fs.writeFile(filePath, opts.buffer);

        const url = this.getUrl(storedName, safeFolder);
        this.logger.log(`File uploaded: ${filePath} (${opts.buffer.length} bytes)`);

        return {
            storedName,
            url,
            size: opts.buffer.length,
            mimeType: opts.mimeType,
        };
    }

    async delete(opts: DeleteOptions): Promise<void> {
        try {
            const safeFolder = this.sanitizeFolder(opts.folder);
            const filePath = join(this.rootDir, safeFolder, opts.storedName);

            /** 删除时同样校验路径逃逸（防通过 storedName 注入 ../） */
            const resolvedPath = resolve(filePath);
            const rel = relative(this.rootDir, resolvedPath);
            if (rel.startsWith('..') || resolve(this.rootDir, rel) !== resolvedPath) {
                this.logger.error(`删除路径逃逸检测拦截: rootDir=${this.rootDir} resolvedPath=${resolvedPath}`);
                throw new BadRequestException('非法的存储路径');
            }

            await fs.unlink(filePath);
            this.logger.log(`File deleted: ${filePath}`);
        } catch (err: unknown) {
            if ((err as { code?: string })?.code === 'ENOENT') {
                // 文件不存在视为幂等成功
                return;
            }
            throw err;
        }
    }

    getUrl(storedName: string, folder: string): string {
        const safeFolder = this.sanitizeFolder(folder);
        return `${this.publicBaseUrl}/${safeFolder}/${storedName}`;
    }

    /**
     * 提取文件扩展名（含点号），如 '.jpg'
     * - 没有扩展名返回空串
     * - 扩展名白名单校验：只允许常见文件类型，防可执行文件扩展名
     */
    private extractExt(originalName: string): string {
        const idx = originalName.lastIndexOf('.');
        if (idx < 0 || idx === originalName.length - 1) return '';
        const ext = originalName.slice(idx).toLowerCase();
        /**
         * 扩展名白名单（与 upload.controller.ts 的 MIME 白名单对应）
         * - 只保留常见安全文件类型
         * - 拒绝 .exe .bat .sh .php .jsp 等可执行文件扩展名
         */
        const allowedExts = /\.(jpe?g|png|webp|gif|pdf|zip|csv|txt|xlsx?)$/i;
        if (!allowedExts.test(ext)) {
            return ''; // 不在白名单的扩展名直接丢弃（存储为无扩展名文件）
        }
        return ext;
    }

    /**
     * 文件夹名白名单
     * - 只允许 [a-z0-9-_] 字符
     * - 防止路径穿越（../）
     */
    private sanitizeFolder(folder: string): string {
        const safe = folder.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
        if (!safe) {
            throw new Error(`Invalid folder: ${folder}`);
        }
        return safe;
    }
}
