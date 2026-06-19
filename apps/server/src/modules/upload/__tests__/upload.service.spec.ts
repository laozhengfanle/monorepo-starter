/**
 * UploadService 单元测试
 *
 * 覆盖场景（目标 ≥ 70% 覆盖率）：
 * - upload: 成功、UUID 重命名（由 storage 层处理）、DB 记录创建、mimeType/size 映射
 * - findAll: 分页、mimeType 筛选、folder 筛选、accountId 筛选、排序、软删除排除
 * - delete: 成功软删除、文件不存在抛 NotFoundException、物理文件删除失败不阻塞
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { UploadService } from '../upload.service.js';
import { STORAGE_SERVICE_TOKEN } from '../../common/storage/storage.interface.js';

// ── 辅助工厂 ──

function createMockStorageService() {
    return {
        upload: vi.fn(),
        delete: vi.fn(),
        getUrl: vi.fn(),
    };
}

function createMockConfigService() {
    return {
        get: vi.fn((key: string) => {
            if (key === 'storage.STORAGE_DRIVER') return 'local';
            return undefined;
        }),
    };
}

function createMockAuditService() {
    return {
        record: vi.fn().mockResolvedValue(undefined),
        findAll: vi.fn(),
    };
}

/** 构造一个 upload_file 记录（Prisma 层原始形状） */
function makeUploadFileRecord(overrides: Record<string, unknown> = {}) {
    return {
        id: overrides.id ?? 'file-001',
        accountId: overrides.accountId ?? 'account-1',
        originalName: overrides.originalName ?? 'photo.jpg',
        storedName: overrides.storedName ?? '550e8400-e29b-41d4-a716-446655440000.jpg',
        mimeType: overrides.mimeType ?? 'image/jpeg',
        size: overrides.size ?? BigInt(102400),
        storage: overrides.storage ?? 'local',
        folder: overrides.folder ?? 'avatars',
        url: overrides.url ?? '/uploads/avatars/550e8400-e29b-41d4-a716-446655440000.jpg',
        createdAt: overrides.createdAt ?? new Date('2025-06-01T00:00:00Z'),
        updatedAt: overrides.updatedAt ?? new Date('2025-06-01T00:00:00Z'),
        deletedAt: overrides.deletedAt ?? (overrides.deletedAt === undefined ? null : overrides.deletedAt),
    };
}

describe('UploadService', () => {
    let service: UploadService;
    let mockStorage: ReturnType<typeof createMockStorageService>;
    let mockConfig: ReturnType<typeof createMockConfigService>;
    let mockAudit: ReturnType<typeof createMockAuditService>;
    let mockPrisma: {
        client: Record<string, any>;
        rawClient: Record<string, any>;
    };

    beforeEach(() => {
        mockStorage = createMockStorageService();
        mockConfig = createMockConfigService();
        mockAudit = createMockAuditService();
        mockPrisma = {
            client: {
                uploadFile: {
                    create: vi.fn(),
                    findMany: vi.fn(),
                    findUnique: vi.fn(),
                    count: vi.fn(),
                    update: vi.fn(),
                    delete: vi.fn(),
                },
            },
            /**
             * rawClient 暴露给：
             * - uploadFile.findUnique：找已软删的记录（绕过软删除拦截）
             * - uploadFile.findMany / count：includeDeleted=true 时不过滤 deletedAt
             * - uploadFile.delete：硬删文件（物理 DELETE）
             * - uploadFile.update：恢复（reset deletedAt）
             */
            rawClient: {
                uploadFile: {
                    findMany: vi.fn(),
                    findUnique: vi.fn(),
                    count: vi.fn(),
                    delete: vi.fn(),
                    update: vi.fn(),
                },
                $transaction: vi.fn(),
            },
        };

        service = new UploadService(mockPrisma as any, mockStorage as any, mockConfig as any, mockAudit as any);
    });

    // ── upload ──

    describe('upload', () => {
        const uploadOpts = {
            accountId: 'account-1',
            folder: 'avatars',
            originalName: 'photo.jpg',
            mimeType: 'image/jpeg',
            buffer: Buffer.from('fake-image-binary'),
        };

        it('应成功上传文件并返回 UploadFileItem', async () => {
            const storedName = '550e8400-e29b-41d4-a716-446655440000.jpg';
            mockStorage.upload.mockResolvedValue({
                storedName,
                url: '/uploads/avatars/' + storedName,
                size: 102400,
                mimeType: 'image/jpeg',
            });
            mockPrisma.client.uploadFile.create.mockResolvedValue(makeUploadFileRecord({ storedName }));

            const result = await service.upload(uploadOpts);

            expect(result.id).toBe('file-001');
            expect(result.originalName).toBe('photo.jpg');
            expect(result.storedName).toBe(storedName);
            expect(result.mimeType).toBe('image/jpeg');
            expect(result.size).toBe(102400);
            expect(result.url).toBe('/uploads/avatars/' + storedName);
            expect(result.folder).toBe('avatars');
            expect(result.storage).toBe('local');
        });

        it('应调用 storageService.upload 并传入正确参数', async () => {
            mockStorage.upload.mockResolvedValue({
                storedName: 'uuid-renamed.jpg',
                url: '/uploads/avatars/uuid-renamed.jpg',
                size: 5000,
                mimeType: 'image/jpeg',
            });
            mockPrisma.client.uploadFile.create.mockResolvedValue(makeUploadFileRecord());

            await service.upload(uploadOpts);

            expect(mockStorage.upload).toHaveBeenCalledWith({
                accountId: 'account-1',
                folder: 'avatars',
                originalName: 'photo.jpg',
                mimeType: 'image/jpeg',
                buffer: uploadOpts.buffer,
            });
        });

        it('应创建 DB 记录（包含 BigInt size 和 storage driver 配置）', async () => {
            mockStorage.upload.mockResolvedValue({
                storedName: 'uuid-renamed.jpg',
                url: '/uploads/avatars/uuid-renamed.jpg',
                size: 204800,
                mimeType: 'image/png',
            });
            mockPrisma.client.uploadFile.create.mockResolvedValue(makeUploadFileRecord());

            await service.upload(uploadOpts);

            expect(mockPrisma.client.uploadFile.create).toHaveBeenCalledWith({
                data: {
                    accountId: 'account-1',
                    originalName: 'photo.jpg',
                    storedName: 'uuid-renamed.jpg',
                    mimeType: 'image/png',
                    size: BigInt(204800),
                    storage: 'local',
                    folder: 'avatars',
                    url: '/uploads/avatars/uuid-renamed.jpg',
                },
            });
        });

        it('应在 ConfigService 返回 undefined 时回退到 local', async () => {
            mockConfig.get.mockReturnValue(undefined);
            mockStorage.upload.mockResolvedValue({
                storedName: 'fallback-test.jpg',
                url: '/uploads/avatars/fallback-test.jpg',
                size: 200,
                mimeType: 'image/jpeg',
            });
            mockPrisma.client.uploadFile.create.mockResolvedValue(makeUploadFileRecord());

            await service.upload(uploadOpts);

            expect(mockPrisma.client.uploadFile.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ storage: 'local' }),
                }),
            );
        });

        it('应使用 ConfigService 读取 storage driver 名称', async () => {
            mockConfig.get.mockReturnValue('s3');
            mockStorage.upload.mockResolvedValue({
                storedName: 's3-file.jpg',
                url: 'https://s3.example.com/avatars/s3-file.jpg',
                size: 100,
                mimeType: 'image/jpeg',
            });
            mockPrisma.client.uploadFile.create.mockResolvedValue(makeUploadFileRecord());

            await service.upload(uploadOpts);

            expect(mockConfig.get).toHaveBeenCalledWith('storage.STORAGE_DRIVER');
            expect(mockPrisma.client.uploadFile.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ storage: 's3' }),
                }),
            );
        });
    });

    // ── findAll ──

    describe('findAll', () => {
        it('应返回分页结果（默认查询）', async () => {
            const records = [makeUploadFileRecord()];
            mockPrisma.client.uploadFile.count.mockResolvedValue(1);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue(records);

            const result = await service.findAll({ page: 1, pageSize: 20 });

            expect(result.items).toHaveLength(1);
            expect(result.items[0].id).toBe('file-001');
            expect(result.total).toBe(1);
            expect(result.page).toBe(1);
            expect(result.pageSize).toBe(20);
        });

        it('应正确计算 skip 和 take', async () => {
            mockPrisma.client.uploadFile.count.mockResolvedValue(100);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue([]);

            await service.findAll({ page: 3, pageSize: 10 });

            expect(mockPrisma.client.uploadFile.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 20, take: 10 }),
            );
        });

        it('应按 createdAt DESC 排序', async () => {
            mockPrisma.client.uploadFile.count.mockResolvedValue(0);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue([]);

            await service.findAll({ page: 1, pageSize: 20 });

            expect(mockPrisma.client.uploadFile.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
            );
        });

        it('应支持 mimeType 筛选（contains）', async () => {
            mockPrisma.client.uploadFile.count.mockResolvedValue(0);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue([]);

            await service.findAll({ page: 1, pageSize: 20, mimeType: 'image/' });

            expect(mockPrisma.client.uploadFile.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        mimeType: { contains: 'image/' },
                    }),
                }),
            );
        });

        it('应支持 folder 精确筛选', async () => {
            mockPrisma.client.uploadFile.count.mockResolvedValue(0);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue([]);

            await service.findAll({ page: 1, pageSize: 20, folder: 'documents' });

            expect(mockPrisma.client.uploadFile.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ folder: 'documents' }),
                }),
            );
        });

        it('应支持 accountId 筛选', async () => {
            mockPrisma.client.uploadFile.count.mockResolvedValue(0);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue([]);

            await service.findAll({ page: 1, pageSize: 20, accountId: 'account-2' });

            expect(mockPrisma.client.uploadFile.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ accountId: 'account-2' }),
                }),
            );
        });

        it('应始终排除软删除记录（deletedAt: null）', async () => {
            mockPrisma.client.uploadFile.count.mockResolvedValue(0);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue([]);

            await service.findAll({ page: 1, pageSize: 20 });

            expect(mockPrisma.client.uploadFile.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ deletedAt: null }),
                }),
            );
            expect(mockPrisma.client.uploadFile.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ deletedAt: null }),
                }),
            );
        });

        it('应支持组合筛选', async () => {
            mockPrisma.client.uploadFile.count.mockResolvedValue(2);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue([
                makeUploadFileRecord({ id: 'f1', mimeType: 'image/png' }),
                makeUploadFileRecord({ id: 'f2', mimeType: 'image/jpeg' }),
            ]);

            const result = await service.findAll({
                page: 1,
                pageSize: 20,
                mimeType: 'image/',
                folder: 'avatars',
                accountId: 'account-1',
            });

            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(2);
        });

        it('应将 Prisma 记录中的 size 转为 Number（当 size 为 BigInt 时）', async () => {
            const records = [makeUploadFileRecord({ size: BigInt(204800) })];
            mockPrisma.client.uploadFile.count.mockResolvedValue(1);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue(records);

            const result = await service.findAll({ page: 1, pageSize: 20 });

            expect(result.items[0].size).toBe(204800);
            expect(typeof result.items[0].size).toBe('number');
        });

        it('应返回空结果', async () => {
            mockPrisma.client.uploadFile.count.mockResolvedValue(0);
            mockPrisma.client.uploadFile.findMany.mockResolvedValue([]);

            const result = await service.findAll({ page: 1, pageSize: 20 });

            expect(result.items).toHaveLength(0);
            expect(result.total).toBe(0);
        });
    });

    // ── delete ──

    describe('delete', () => {
        it('应成功软删除文件并同步删除物理文件', async () => {
            const record = makeUploadFileRecord();
            mockPrisma.rawClient.uploadFile.findUnique.mockResolvedValue(record);
            mockPrisma.client.uploadFile.update.mockResolvedValue({
                ...record,
                deletedAt: new Date(),
            });
            mockStorage.delete.mockResolvedValue(undefined);

            const result = await service.delete('file-001');

            expect(result).toEqual({ id: 'file-001', deleted: true });
            expect(mockPrisma.rawClient.uploadFile.findUnique).toHaveBeenCalledWith({
                where: { id: 'file-001' },
            });
            expect(mockPrisma.client.uploadFile.update).toHaveBeenCalledWith({
                where: { id: 'file-001' },
                data: { deletedAt: expect.any(Date) },
            });
            expect(mockStorage.delete).toHaveBeenCalledWith({
                storedName: record.storedName,
                folder: record.folder,
            });
        });

        it('应在文件不存在时抛出 NotFoundException', async () => {
            mockPrisma.rawClient.uploadFile.findUnique.mockResolvedValue(null);

            await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);

            expect(mockPrisma.client.uploadFile.update).not.toHaveBeenCalled();
            expect(mockStorage.delete).not.toHaveBeenCalled();
        });

        it('应在物理文件删除失败时不阻塞（catch 吞掉异常）', async () => {
            mockPrisma.rawClient.uploadFile.findUnique.mockResolvedValue(makeUploadFileRecord());
            mockPrisma.client.uploadFile.update.mockResolvedValue({
                ...makeUploadFileRecord(),
                deletedAt: new Date(),
            });
            mockStorage.delete.mockRejectedValue(new Error('磁盘空间不足'));

            // 不应抛出异常
            const result = await service.delete('file-001');

            expect(result).toEqual({ id: 'file-001', deleted: true });
            expect(mockPrisma.client.uploadFile.update).toHaveBeenCalled();
            expect(mockStorage.delete).toHaveBeenCalled();
        });

        it('应在物理文件删除失败时记录警告日志', async () => {
            const warnSpy = vi.spyOn(service['logger'], 'warn').mockImplementation(() => {});
            mockPrisma.rawClient.uploadFile.findUnique.mockResolvedValue(makeUploadFileRecord());
            mockPrisma.client.uploadFile.update.mockResolvedValue({
                ...makeUploadFileRecord(),
                deletedAt: new Date(),
            });
            mockStorage.delete.mockRejectedValue(new Error('Connection refused'));

            await service.delete('file-001');

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('物理文件删除失败'));
            warnSpy.mockRestore();
        });
    });
});
