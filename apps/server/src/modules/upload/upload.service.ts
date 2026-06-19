/**
 * 上传服务
 *
 * 业务能力：
 * - 处理上传请求：调用 storage + 写 upload_file 表
 * - 查询文件列表（分页 + 筛选 + includeDeleted）
 * - 软删除
 * - 硬删（hardDelete）+ 恢复（restore）
 */
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../prisma/generated/client.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { STORAGE_SERVICE_TOKEN, type IStorageService } from '../../common/storage/storage.interface.js';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service.js';

export interface UploadFileItem {
    id: string;
    accountId: string;
    originalName: string;
    storedName: string;
    mimeType: string;
    size: number;
    storage: string;
    folder: string;
    url: string;
    /** 软删除时间：null=活跃行；非空=已软删 */
    deletedAt: Date | null;
    createdAt: Date;
}

export interface QueryUploadInput {
    page: number;
    pageSize: number;
    mimeType?: string;
    folder?: string;
    accountId?: string;
    /**
     * 是否包含已软删除的文件
     * - false（默认）：只返回未软删除的文件
     * - true：返回所有行（含已软删的）
     */
    includeDeleted?: boolean;
}

@Injectable()
export class UploadService {
    private readonly logger = new Logger(UploadService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(STORAGE_SERVICE_TOKEN) private readonly storageService: IStorageService,
        private readonly configService: ConfigService,
        private readonly auditService: AuditService,
    ) {}

    /**
     * 上传文件
     * - 调用 storage service 写入文件
     * - 写 upload_file 表记录元数据
     * - 返回上传结果
     */
    async upload(opts: {
        accountId: string;
        folder: string;
        originalName: string;
        mimeType: string;
        buffer: Buffer;
    }): Promise<UploadFileItem> {
        /** 1. 调用 storage service 写文件 */
        const result = await this.storageService.upload({
            accountId: opts.accountId,
            folder: opts.folder,
            originalName: opts.originalName,
            mimeType: opts.mimeType,
            buffer: opts.buffer,
        });

        /** 2. 写 upload_file 表 */
        const file = await this.prisma.client.uploadFile.create({
            data: {
                accountId: opts.accountId,
                originalName: opts.originalName,
                storedName: result.storedName,
                mimeType: result.mimeType,
                size: BigInt(result.size),
                storage: this.configService.get<string>('storage.STORAGE_DRIVER') || 'local',
                folder: opts.folder,
                url: result.url,
            } as unknown as Prisma.UploadFileUncheckedCreateInput,
        });

        /**
         * 写审计日志：action = 'file_uploaded'
         * - resourceType 仍为 'upload_file'，用 action 区分上传/软删/硬删/恢复
         */
        await this.auditService.record({
            accountId: opts.accountId,
            action: AUDIT_ACTIONS.FILE_UPLOADED,
            resourceType: 'upload_file',
            resourceId: file.id,
            detail: { originalName: opts.originalName, mimeType: opts.mimeType },
        });

        return this.toUploadFileItem(file);
    }

    /**
     * 分页查询文件
     * - includeDeleted=false（默认）：只返回未软删除的文件
     * - includeDeleted=true：返回所有行（含已软删除的）
     */
    async findAll(
        query: QueryUploadInput,
    ): Promise<{ items: UploadFileItem[]; total: number; page: number; pageSize: number }> {
        const { page, pageSize, mimeType, folder, accountId, includeDeleted = false } = query;
        const skip = (page - 1) * pageSize;

        const where: Prisma.UploadFileWhereInput = {
            ...(includeDeleted ? {} : { deletedAt: null }),
            ...(mimeType ? { mimeType: { contains: mimeType } } : {}),
            ...(folder ? { folder } : {}),
            ...(accountId ? { accountId } : {}),
        };

        /**
         * includeDeleted=true 时 rawClient.uploadFile.findMany / count 绕开软删除扩展
         * - rawClient.findMany 不会自动加 deleted_at: null 条件 → 查到包含已软删的
         */
        const client = includeDeleted ? this.prisma.rawClient : this.prisma.client;
        const [total, files] = await Promise.all([
            client.uploadFile.count({ where }),
            client.uploadFile.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        return {
            items: files.map((f) => this.toUploadFileItem(f)),
            total,
            page,
            pageSize,
        };
    }

    /**
     * 软删除
     */
    async delete(id: string, operatorId?: string): Promise<{ id: string; deleted: true }> {
        const file = await this.prisma.rawClient.uploadFile.findUnique({ where: { id } });
        if (!file) {
            throw new NotFoundException('文件不存在');
        }

        await this.prisma.client.uploadFile.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        /** 同步删除物理文件（失败不阻塞，物理文件丢失不影响 DB 软删除） */
        try {
            await this.storageService.delete({ storedName: file.storedName, folder: file.folder });
        } catch (err) {
            this.logger.warn(`物理文件删除失败 (DB 已软删除): ${String(err)}`);
        }

        /** 写审计日志：action = 'file_deleted' */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.FILE_DELETED,
            resourceType: 'upload_file',
            resourceId: id,
            detail: { originalName: file.originalName },
        });

        return { id, deleted: true };
    }

    /**
     * 彻底删除文件（硬删）
     * - 前置校验：行存在 + deletedAt IS NOT NULL
     * - 实际删除：prisma.rawClient.uploadFile.delete（绕开软删除扩展，物理删除行）
     * - 物理文件已在软删时被清理，此处不重复删除
     * - 写审计日志：action = 'file_hard_deleted'
     */
    async hardDelete(id: string, operatorId?: string): Promise<{ id: string; deleted: true }> {
        /** 1. 校验行存在（绕过软删除拦截以查到已软删的记录） */
        const file = await this.prisma.rawClient.uploadFile.findUnique({ where: { id } });
        if (!file) {
            throw new NotFoundException('文件不存在');
        }
        /** 2. 仅允许彻底删除已软删的记录 */
        if (file.deletedAt === null) {
            throw new BadRequestException('仅允许彻底删除已软删的记录');
        }

        /** 3. 物理删除（rawClient 绕开软删除拦截） */
        await this.prisma.rawClient.uploadFile.delete({ where: { id } });

        /** 写审计日志：action = 'file_hard_deleted' */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.FILE_HARD_DELETED,
            resourceType: 'upload_file',
            resourceId: id,
            detail: { originalName: file.originalName, storedName: file.storedName },
        });

        return { id, deleted: true };
    }

    /**
     * 恢复已软删除的文件（把 deletedAt 置为 NULL）
     * - 前置校验：行存在 + deletedAt IS NOT NULL
     * - 注意：恢复后文件 URL 可能已失效（物理文件已在软删时清理）
     * - 写审计日志：action = 'file_restored'
     */
    async restore(id: string, operatorId?: string): Promise<{ id: string; deleted: false; restored: true }> {
        /** 1. 校验行存在 */
        const file = await this.prisma.rawClient.uploadFile.findUnique({ where: { id } });
        if (!file) {
            throw new NotFoundException('文件不存在');
        }
        /** 2. 仅允许恢复已软删的记录 */
        if (file.deletedAt === null) {
            throw new BadRequestException('仅允许恢复已软删的记录');
        }

        /** 3. 实际恢复 */
        await this.prisma.client.uploadFile.update({ where: { id }, data: { deletedAt: null } });

        /**
         * 写审计日志：action = 'file_restored'
         * - 配合 detail.originalName 记录被恢复的文件名
         * - 提示：物理文件可能已丢失（软删时清理），前端应检查 URL 是否可访问
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.FILE_RESTORED,
            resourceType: 'upload_file',
            resourceId: id,
            detail: { originalName: file.originalName, storedName: file.storedName },
        });

        return { id, deleted: false, restored: true };
    }

    /**
     * 将 Prisma 记录转为 API 模型
     * - deletedAt 直接透传：null=活跃行；非空=已软删
     */
    private toUploadFileItem(f: Prisma.UploadFileModel): UploadFileItem {
        return {
            id: f.id,
            accountId: f.accountId,
            originalName: f.originalName,
            storedName: f.storedName,
            mimeType: f.mimeType,
            size: typeof f.size === 'bigint' ? Number(f.size) : f.size,
            storage: f.storage,
            folder: f.folder,
            url: f.url,
            deletedAt: f.deletedAt ?? null,
            createdAt: f.createdAt,
        };
    }
}
