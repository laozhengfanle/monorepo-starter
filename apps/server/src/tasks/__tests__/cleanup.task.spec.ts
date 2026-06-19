/**
 * CleanupTask 单元测试
 *
 * 覆盖场景：
 * - cleanupOldData：删除超过 90 天的 audit_log
 * - cleanupOldData：保留不到 90 天的 audit_log
 * - cleanupOldData：删除超过 30 天的 verification_code
 * - cleanupOldData：保留不到 30 天的 verification_code
 * - 异常处理：DB 抛错时不应让任务抛出异常
 *
 * 测试策略：
 * - mock PrismaService（client + rawClient）和 ICacheService
 * - 用 vi.fn() 验证 deleteMany 调用参数
 * - 验证 deleteMany 的 where.createdAt.lt 与「当前时间 - N 天」一致
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CleanupTask } from '../cleanup.task.js';

describe('CleanupTask', () => {
    let task: CleanupTask;
    let mockPrisma: {
        client: Record<string, any>;
        rawClient: Record<string, any>;
    };
    let mockRedisLock: Record<string, any>;

    beforeEach(() => {
        // mock PrismaService，包含 client（带扩展）和 rawClient（不带软删除）
        mockPrisma = {
            client: {
                auditLog: {
                    deleteMany: vi.fn(),
                    findMany: vi.fn(),
                    count: vi.fn(),
                },
                verificationCode: {
                    deleteMany: vi.fn(),
                    findMany: vi.fn(),
                    count: vi.fn(),
                },
                adminRole: {
                    findMany: vi.fn(),
                },
                account: {
                    findUnique: vi.fn(),
                },
            },
            rawClient: {
                auditLog: {
                    deleteMany: vi.fn(),
                },
                verificationCode: {
                    deleteMany: vi.fn(),
                },
                account: {
                    findUnique: vi.fn(),
                },
            },
        };

        // mock RedisLockService — 单实例测试中始终返回 owner（模拟未竞争场景）
        mockRedisLock = {
            acquire: vi.fn().mockResolvedValue('test-owner-uuid'),
            release: vi.fn().mockResolvedValue(true),
            extend: vi.fn().mockResolvedValue(true),
            isLocked: vi.fn().mockResolvedValue(false),
        };

        task = new CleanupTask(mockPrisma as any, mockRedisLock as any);
    });

    // ── audit_log 清理 ──

    describe('cleanupOldData - audit_log', () => {
        it('应调用 rawClient.auditLog.deleteMany 删除超过 90 天的记录', async () => {
            mockPrisma.rawClient.auditLog.deleteMany.mockResolvedValue({ count: 5 });
            mockPrisma.rawClient.verificationCode.deleteMany.mockResolvedValue({ count: 0 });

            const before = Date.now();
            await task.cleanupOldData();
            const after = Date.now();

            // 验证调用了 rawClient（而非 client）以绕过软删除扩展
            expect(mockPrisma.rawClient.auditLog.deleteMany).toHaveBeenCalledTimes(1);
            expect(mockPrisma.client.auditLog.deleteMany).not.toHaveBeenCalled();

            // 验证 where 条件：createdAt < 当前时间 - 90 天
            const call = mockPrisma.rawClient.auditLog.deleteMany.mock.calls[0][0];
            expect(call.where.createdAt.lt).toBeInstanceOf(Date);

            // 验证 cutoff 时间在「90 天前 ±几秒」范围内
            const cutoffMs = call.where.createdAt.lt.getTime();
            const expectedMin = before - 90 * 24 * 60 * 60 * 1000 - 100; // 留 100ms 余量
            const expectedMax = after - 90 * 24 * 60 * 60 * 1000 + 100;
            expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
            expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
        });

        it('应在 audit_log deleteMany 返回 count=5 时记录日志（验证参数）', async () => {
            mockPrisma.rawClient.auditLog.deleteMany.mockResolvedValue({ count: 5 });
            mockPrisma.rawClient.verificationCode.deleteMany.mockResolvedValue({ count: 0 });

            await task.cleanupOldData();

            // 验证 deleteMany 接收了 where 条件
            expect(mockPrisma.rawClient.auditLog.deleteMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        createdAt: expect.objectContaining({
                            lt: expect.any(Date),
                        }),
                    }),
                }),
            );
        });
    });

    // ── verification_code 清理 ──

    describe('cleanupOldData - verification_code', () => {
        it('应调用 rawClient.verificationCode.deleteMany 删除超过 30 天的记录', async () => {
            mockPrisma.rawClient.auditLog.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.rawClient.verificationCode.deleteMany.mockResolvedValue({ count: 3 });

            const before = Date.now();
            await task.cleanupOldData();
            const after = Date.now();

            expect(mockPrisma.rawClient.verificationCode.deleteMany).toHaveBeenCalledTimes(1);
            expect(mockPrisma.client.verificationCode.deleteMany).not.toHaveBeenCalled();

            const call = mockPrisma.rawClient.verificationCode.deleteMany.mock.calls[0][0];
            expect(call.where.createdAt.lt).toBeInstanceOf(Date);

            const cutoffMs = call.where.createdAt.lt.getTime();
            const expectedMin = before - 30 * 24 * 60 * 60 * 1000 - 100;
            const expectedMax = after - 30 * 24 * 60 * 60 * 1000 + 100;
            expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
            expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
        });
    });

    // ── 集成场景：审计 + 验证码 一起清理 ──

    describe('cleanupOldData - 集成', () => {
        it('应依次清理 audit_log 和 verification_code', async () => {
            mockPrisma.rawClient.auditLog.deleteMany.mockResolvedValue({ count: 10 });
            mockPrisma.rawClient.verificationCode.deleteMany.mockResolvedValue({ count: 5 });

            await task.cleanupOldData();

            // 两个表都被清理
            expect(mockPrisma.rawClient.auditLog.deleteMany).toHaveBeenCalledTimes(1);
            expect(mockPrisma.rawClient.verificationCode.deleteMany).toHaveBeenCalledTimes(1);
        });

        it('应区分 90 天 vs 30 天的 cutoff 时间', async () => {
            mockPrisma.rawClient.auditLog.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.rawClient.verificationCode.deleteMany.mockResolvedValue({ count: 0 });

            await task.cleanupOldData();

            const auditCall = mockPrisma.rawClient.auditLog.deleteMany.mock.calls[0][0];
            const codeCall = mockPrisma.rawClient.verificationCode.deleteMany.mock.calls[0][0];

            // audit_log 的 cutoff 应早于 verification_code 的 cutoff（90 天 vs 30 天）
            // 即 auditCutoffMs < codeCutoffMs（更早的时间戳更小）
            expect(auditCall.where.createdAt.lt.getTime()).toBeLessThan(codeCall.where.createdAt.lt.getTime());
        });
    });

    // ── 异常处理 ──

    describe('cleanupOldData - 异常处理', () => {
        it('audit_log deleteMany 抛错时不应让任务挂掉（应继续清理 verification_code）', async () => {
            mockPrisma.rawClient.auditLog.deleteMany.mockRejectedValue(new Error('DB connection lost'));
            mockPrisma.rawClient.verificationCode.deleteMany.mockResolvedValue({ count: 2 });

            // 不应抛出异常
            await expect(task.cleanupOldData()).resolves.toBeUndefined();

            // verification_code 仍被清理（异常隔离）
            expect(mockPrisma.rawClient.verificationCode.deleteMany).toHaveBeenCalledTimes(1);
        });

        it('verification_code deleteMany 抛错时不应让任务挂掉', async () => {
            mockPrisma.rawClient.auditLog.deleteMany.mockResolvedValue({ count: 1 });
            mockPrisma.rawClient.verificationCode.deleteMany.mockRejectedValue(new Error('Timeout'));

            // 不应抛出异常
            await expect(task.cleanupOldData()).resolves.toBeUndefined();
        });

        it('两步都抛错时也不应让任务挂掉', async () => {
            mockPrisma.rawClient.auditLog.deleteMany.mockRejectedValue(new Error('err1'));
            mockPrisma.rawClient.verificationCode.deleteMany.mockRejectedValue(new Error('err2'));

            // 不应抛出异常
            await expect(task.cleanupOldData()).resolves.toBeUndefined();
        });
    });
});
