/**
 * MemberProfileService 单元测试
 *
 * 覆盖场景：
 * - findByAccountId：正常返回 / profile 不存在抛 NotFoundException
 * - update：部分字段更新 / 空 input 不调 DB write
 * - findAll：分页查询（includeDeleted=false 默认; includeDeleted=true 含已删）
 * - hardDelete：仅允许已软删记录 / 不存在抛 NotFoundException / 未软删抛 BadRequestException
 * - restore：正常恢复 / 已活跃抛 BadRequestException / 手机号冲突抛 BadRequestException
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MemberProfileService } from '../member-profile.service.js';

describe('MemberProfileService', () => {
    let service: MemberProfileService;
    let mockPrisma: { client: Record<string, any>; rawClient: Record<string, any> };
    let mockAudit: { record: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockAudit = { record: vi.fn().mockResolvedValue(undefined) };

        mockPrisma = {
            client: {
                memberProfile: {
                    findFirst: vi.fn(),
                    findMany: vi.fn(),
                    count: vi.fn(),
                    update: vi.fn(),
                    delete: vi.fn(),
                },
                accountIdentity: {
                    findFirst: vi.fn(),
                    findMany: vi.fn(),
                    deleteMany: vi.fn(),
                },
                account: {
                    update: vi.fn(),
                    delete: vi.fn(),
                },
                memberAccountMenu: { deleteMany: vi.fn() },
                memberAccountRole: { deleteMany: vi.fn() },
                $transaction: vi.fn(async (cb: Function) => cb(mockPrisma.client)),
            },
            rawClient: {
                memberProfile: {
                    findUnique: vi.fn(),
                    findFirst: vi.fn(),
                },
            },
        };

        service = new MemberProfileService(mockPrisma as any, mockAudit as any);
    });

    // ── findByAccountId ──

    describe('findByAccountId', () => {
        it('应返回未软删除的 profile', async () => {
            mockPrisma.client.memberProfile.findFirst.mockResolvedValue({
                id: 'p-1',
                accountId: 'acc-1',
                nickname: '测试用户',
            });

            const result = await service.findByAccountId('acc-1');
            expect(result.nickname).toBe('测试用户');
            expect(mockPrisma.client.memberProfile.findFirst).toHaveBeenCalledWith({
                where: { accountId: 'acc-1', deletedAt: null },
            });
        });

        it('profile 不存在应抛 NotFoundException', async () => {
            mockPrisma.client.memberProfile.findFirst.mockResolvedValue(null);

            await expect(service.findByAccountId('acc-unknown')).rejects.toThrow(NotFoundException);
        });
    });

    // ── update ──

    describe('update', () => {
        it('应只更新传入的字段', async () => {
            mockPrisma.client.memberProfile.findFirst.mockResolvedValue({ id: 'p-1', accountId: 'acc-1' });
            // findByAccountId 第二次调用返回更新后的
            mockPrisma.client.memberProfile.findFirst
                .mockResolvedValueOnce({ id: 'p-1', accountId: 'acc-1' })
                .mockResolvedValueOnce({ id: 'p-1', accountId: 'acc-1', nickname: '新昵称' });

            const result = await service.update('acc-1', { nickname: '新昵称' });
            expect(result.nickname).toBe('新昵称');
            expect(mockPrisma.client.memberProfile.update).toHaveBeenCalledWith(
                expect.objectContaining({ data: { nickname: '新昵称' } }),
            );
        });

        it('空 input 不调 DB write', async () => {
            mockPrisma.client.memberProfile.findFirst.mockResolvedValue({ id: 'p-1', accountId: 'acc-1' });

            await service.update('acc-1', {});
            expect(mockPrisma.client.memberProfile.update).not.toHaveBeenCalled();
        });
    });

    // ── findAll ──

    describe('findAll', () => {
        it('includeDeleted=false 时只返回活跃记录', async () => {
            mockPrisma.client.memberProfile.count.mockResolvedValue(5);
            mockPrisma.client.memberProfile.findMany.mockResolvedValue([{ id: 'p-1' }]);

            const result = await service.findAll({ page: 1, pageSize: 10 });
            expect(result.total).toBe(5);
            expect(mockPrisma.client.memberProfile.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { deletedAt: null } }),
            );
        });

        it('includeDeleted=true 时使用 rawClient 含已删记录', async () => {
            // rawClient 需要 mock findMany / count
            mockPrisma.rawClient.memberProfile = {
                findMany: vi.fn().mockResolvedValue([{ id: 'p-1', deletedAt: new Date() }]),
                count: vi.fn().mockResolvedValue(1),
            };

            const result = await service.findAll({ page: 1, pageSize: 10, includeDeleted: true });
            expect(result.total).toBe(1);
            expect(result.items[0].deletedAt).toBeTruthy();
        });
    });

    // ── hardDelete ──

    describe('hardDelete', () => {
        it('仅允许彻底删除已软删的记录，未软删抛 BadRequestException', async () => {
            mockPrisma.rawClient.memberProfile.findUnique.mockResolvedValue({
                id: 'p-1',
                accountId: 'acc-1',
                deletedAt: null,
            });

            await expect(service.hardDelete('p-1')).rejects.toThrow(BadRequestException);
        });

        it('记录不存在应抛 NotFoundException', async () => {
            mockPrisma.rawClient.memberProfile.findUnique.mockResolvedValue(null);
            mockPrisma.rawClient.memberProfile.findFirst.mockResolvedValue(null);

            await expect(service.hardDelete('unknown')).rejects.toThrow(NotFoundException);
        });

        it('已软删记录应成功硬删', async () => {
            mockPrisma.rawClient.memberProfile.findUnique.mockResolvedValue({
                id: 'p-1',
                accountId: 'acc-1',
                deletedAt: new Date(),
            });
            // transaction mock 已在 beforeEach 绑定
            const result = await service.hardDelete('p-1', 'op-1');
            expect(result.deleted).toBe(true);
            expect(mockPrisma.client.$transaction).toHaveBeenCalled();
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'account_hard_deleted', resourceType: 'member_user' }),
            );
        });
    });

    // ── restore ──

    describe('restore', () => {
        it('已软删记录应成功恢复', async () => {
            mockPrisma.rawClient.memberProfile.findUnique.mockResolvedValue({
                id: 'p-1',
                accountId: 'acc-1',
                deletedAt: new Date(),
            });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(null);
            mockPrisma.client.memberProfile.update.mockResolvedValue({});
            mockPrisma.client.account.update.mockResolvedValue({});

            const result = await service.restore('p-1', 'op-1');
            expect(result.restored).toBe(true);
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'account_restored', resourceType: 'member_user' }),
            );
        });

        it('未软删的记录应抛 BadRequestException', async () => {
            mockPrisma.rawClient.memberProfile.findUnique.mockResolvedValue({
                id: 'p-1',
                accountId: 'acc-1',
                deletedAt: null,
            });

            await expect(service.restore('p-1')).rejects.toThrow(BadRequestException);
        });

        it('手机号冲突应抛 BadRequestException', async () => {
            mockPrisma.rawClient.memberProfile.findUnique.mockResolvedValue({
                id: 'p-1',
                accountId: 'acc-1',
                deletedAt: new Date(),
            });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({
                identityType: 'phone',
                identifier: '13800000000',
            });
            // 冲突：另一个活跃账号用了同一手机号
            mockPrisma.client.accountIdentity.findFirst
                .mockResolvedValueOnce({ identityType: 'phone', identifier: '13800000000' })
                .mockResolvedValueOnce({ identityType: 'phone', identifier: '13800000000' });

            await expect(service.restore('p-1')).rejects.toThrow(BadRequestException);
        });
    });
});
