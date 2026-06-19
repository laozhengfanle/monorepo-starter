/**
 * AuditService 单元测试
 *
 * 覆盖场景：
 * - record: 成功写入 / 失败不阻塞（降级打日志）
 * - findAll: 分页 / 多维筛选 / 空结果
 * - findAll: 批量关联 account_identity 取 username，拼成 accountUsername 字段
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditService } from '../audit.service.js';

describe('AuditService', () => {
    let service: AuditService;
    let mockPrisma: { client: Record<string, any> };

    beforeEach(() => {
        mockPrisma = {
            client: {
                auditLog: {
                    create: vi.fn(),
                    findMany: vi.fn(),
                    count: vi.fn(),
                },
                accountIdentity: {
                    findMany: vi.fn(),
                },
            },
        };

        service = new AuditService(mockPrisma as any);
    });

    // ── record ──

    describe('record', () => {
        it('应成功写入审计日志', async () => {
            mockPrisma.client.auditLog.create.mockResolvedValue({ id: 'log-1' });

            await service.record({
                accountId: 'acc-1',
                action: 'user_created',
                resourceType: 'admin_user',
                resourceId: 'user-1',
                ip: '127.0.0.1',
                userAgent: 'test-agent',
                detail: { username: 'newuser' },
            });

            expect(mockPrisma.client.auditLog.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    accountId: 'acc-1',
                    action: 'user_created',
                    resourceType: 'admin_user',
                    resourceId: 'user-1',
                    ip: '127.0.0.1',
                    userAgent: 'test-agent',
                    detail: { username: 'newuser' },
                }),
            });
        });

        it('应在写入失败时不抛出异常（降级打日志）', async () => {
            mockPrisma.client.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

            // record 不应抛出异常
            await expect(
                service.record({
                    accountId: 'acc-1',
                    action: 'login_failed',
                }),
            ).resolves.toBeUndefined();
        });

        it('应处理可选字段为 null', async () => {
            mockPrisma.client.auditLog.create.mockResolvedValue({ id: 'log-2' });

            await service.record({
                accountId: 'acc-2',
                action: 'logout',
            });

            expect(mockPrisma.client.auditLog.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    resourceType: null,
                    resourceId: null,
                    ip: null,
                    userAgent: null,
                    detail: null,
                }),
            });
        });
    });

    // ── findAll ──

    describe('findAll', () => {
        it('应返回分页结果', async () => {
            mockPrisma.client.auditLog.count.mockResolvedValue(50);
            mockPrisma.client.auditLog.findMany.mockResolvedValue([
                { id: 'log-1', action: 'user_created', createdAt: new Date() },
            ]);

            const result = await service.findAll({ page: 1, pageSize: 20 });

            expect(result.total).toBe(50);
            expect(result.items).toHaveLength(1);
            expect(result.page).toBe(1);
            expect(result.pageSize).toBe(20);
        });

        it('应支持 accountId 筛选', async () => {
            mockPrisma.client.auditLog.count.mockResolvedValue(10);
            mockPrisma.client.auditLog.findMany.mockResolvedValue([]);

            await service.findAll({ page: 1, pageSize: 20, accountId: 'acc-1' });

            expect(mockPrisma.client.auditLog.count).toHaveBeenCalledWith({
                where: { accountId: 'acc-1' },
            });
        });

        it('应支持 action 筛选', async () => {
            mockPrisma.client.auditLog.count.mockResolvedValue(5);
            mockPrisma.client.auditLog.findMany.mockResolvedValue([]);

            await service.findAll({ page: 1, pageSize: 20, action: 'login_failed' });

            expect(mockPrisma.client.auditLog.count).toHaveBeenCalledWith({
                where: { action: 'login_failed' },
            });
        });

        it('应支持日期范围筛选', async () => {
            mockPrisma.client.auditLog.count.mockResolvedValue(3);
            mockPrisma.client.auditLog.findMany.mockResolvedValue([]);
            const start = new Date('2025-01-01');
            const end = new Date('2025-12-31');

            await service.findAll({ page: 1, pageSize: 20, startDate: start, endDate: end });

            expect(mockPrisma.client.auditLog.count).toHaveBeenCalledWith({
                where: { createdAt: { gte: start, lte: end } },
            });
        });

        it('应正确计算 skip', async () => {
            mockPrisma.client.auditLog.count.mockResolvedValue(100);
            mockPrisma.client.auditLog.findMany.mockResolvedValue([]);

            await service.findAll({ page: 3, pageSize: 20 });

            expect(mockPrisma.client.auditLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 40, take: 20 }),
            );
        });

        // ── accountUsername 关联查询 ──

        it('应批量查 account_identity 并把 username 拼到每条 log', async () => {
            mockPrisma.client.auditLog.count.mockResolvedValue(2);
            mockPrisma.client.auditLog.findMany.mockResolvedValue([
                { id: 'log-1', accountId: 'acc-1', action: 'login_success', createdAt: new Date() },
                { id: 'log-2', accountId: 'acc-2', action: 'role_created', createdAt: new Date() },
            ]);
            mockPrisma.client.accountIdentity.findMany.mockResolvedValue([
                { accountId: 'acc-1', identifier: 'root' },
                { accountId: 'acc-2', identifier: 'admin' },
            ]);

            const result = await service.findAll({ page: 1, pageSize: 20 });

            // 验证 findMany 用 identityType='username' 过滤
            expect(mockPrisma.client.accountIdentity.findMany).toHaveBeenCalledWith({
                where: { accountId: { in: ['acc-1', 'acc-2'] }, identityType: 'username' },
                select: { accountId: true, identifier: true },
            });
            // 验证 items 上有 accountUsername 字段
            expect(result.items[0]).toMatchObject({ id: 'log-1', accountUsername: 'root' });
            expect(result.items[1]).toMatchObject({ id: 'log-2', accountUsername: 'admin' });
        });

        it('accountId 为空时 accountUsername 应为 null', async () => {
            mockPrisma.client.auditLog.count.mockResolvedValue(1);
            mockPrisma.client.auditLog.findMany.mockResolvedValue([
                { id: 'log-1', accountId: null, action: 'system_event', createdAt: new Date() },
            ]);
            // accountId 全是 null，identityType 不应被查
            mockPrisma.client.accountIdentity.findMany.mockResolvedValue([]);

            const result = await service.findAll({ page: 1, pageSize: 20 });

            expect(mockPrisma.client.accountIdentity.findMany).not.toHaveBeenCalled();
            expect(result.items[0]).toMatchObject({ id: 'log-1', accountUsername: null });
        });

        it('accountId 在 identity 表找不到时 accountUsername 应为 null', async () => {
            mockPrisma.client.auditLog.count.mockResolvedValue(1);
            mockPrisma.client.auditLog.findMany.mockResolvedValue([
                { id: 'log-1', accountId: 'acc-ghost', action: 'unknown', createdAt: new Date() },
            ]);
            // 模拟 identity 表里没有这个 acc-ghost
            mockPrisma.client.accountIdentity.findMany.mockResolvedValue([]);

            const result = await service.findAll({ page: 1, pageSize: 20 });

            expect(result.items[0]).toMatchObject({ id: 'log-1', accountUsername: null });
        });
    });
});
