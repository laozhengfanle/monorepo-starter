/**
 * MeService 单元测试
 *
 * 覆盖场景：
 * - getAdminMe: 成功 / 账户不存在 / userType不匹配 / 缺失用户名
 * - getMemberMe: 成功 / 账户不存在 / userType不匹配
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MeService } from '../me.service.js';

describe('MeService', () => {
    let service: MeService;
    let mockPrisma: { client: Record<string, any> };
    let mockCache: { getAccountAuth: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockCache = {
            getAccountAuth: vi.fn(),
        };
        mockPrisma = {
            client: {
                account: { findUnique: vi.fn() },
                accountIdentity: { findFirst: vi.fn() },
                memberAccountRole: { findMany: vi.fn() },
            },
        };
        service = new MeService(mockPrisma as any, mockCache as any);
    });

    // ── getAdminMe ──

    describe('getAdminMe', () => {
        it('应返回管理员完整信息', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({
                id: 'acc-1',
                userType: 'admin',
                adminProfile: { nickname: '管理员小明' },
            });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({
                identifier: 'xiaoming',
            });
            mockCache.getAccountAuth.mockResolvedValue({
                roles: ['super_admin'],
                permissions: ['iam:admin:list'],
                menus: [],
            });

            const result = await service.getAdminMe('acc-1');

            expect(result.userType).toBe('admin');
            expect(result.accountId).toBe('acc-1');
            expect(result.username).toBe('xiaoming');
            expect(result.nickname).toBe('管理员小明');
            expect(result.roles).toEqual(['super_admin']);
            expect(result.permissions).toEqual(['iam:admin:list']);
        });

        it('nickname为空时应fallback到username', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({
                id: 'acc-2',
                userType: 'admin',
                adminProfile: { nickname: '' },
            });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({
                identifier: 'admin2',
            });
            mockCache.getAccountAuth.mockResolvedValue({
                roles: [],
                permissions: [],
                menus: [],
            });

            const result = await service.getAdminMe('acc-2');

            expect(result.nickname).toBe('admin2');
        });

        it('账户不存在应抛异常', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue(null);

            await expect(service.getAdminMe('nonexistent')).rejects.toThrow(NotFoundException);
        });

        it('userType不是admin应抛异常', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({
                id: 'acc-1',
                userType: 'member',
                adminProfile: null,
            });

            await expect(service.getAdminMe('acc-1')).rejects.toThrow(NotFoundException);
        });

        it('缺失用户名标识应抛异常', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({
                id: 'acc-1',
                userType: 'admin',
                adminProfile: { nickname: 'test' },
            });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(null);

            await expect(service.getAdminMe('acc-1')).rejects.toThrow(NotFoundException);
        });

        it('传入 dataloaders 时应走 dataloader 路径（不读 cache 的 roles/permissions）', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({
                id: 'acc-dl',
                userType: 'admin',
                adminProfile: { nickname: 'dataloader 测试员' },
            });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({
                identifier: 'dl_user',
            });
            // 模拟 dataloader：返回固定结果
            const mockRoleLoader = {
                load: vi.fn().mockResolvedValue({ adminRoles: ['admin', 'editor'], memberRoles: [] }),
            };
            const mockPermLoader = { load: vi.fn().mockResolvedValue(['iam:admin:list', 'iam:user:list']) };
            const mockDataloaders = {
                rolesByAccountId: mockRoleLoader,
                permissionsByAccountId: mockPermLoader,
            } as any;

            const result = await service.getAdminMe('acc-dl', mockDataloaders);

            // dataloader 路径生效：roles 来自 dataloader 而非 cache
            expect(result.roles).toEqual(['admin', 'editor']);
            expect(result.permissions).toEqual(['iam:admin:list', 'iam:user:list']);
            // cache.getAccountAuth 不应被读 roles/permissions（菜单树仍走 cache，所以总调用 1 次）
            // 这里我们不严格断言调用次数，只验证 dataloader.load 被调用
            expect(mockRoleLoader.load).toHaveBeenCalledWith('acc-dl');
            expect(mockPermLoader.load).toHaveBeenCalledWith('acc-dl');
        });

        it('不传 dataloaders 时应走 cache 路径（行为完全一致）', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({
                id: 'acc-cache',
                userType: 'admin',
                adminProfile: { nickname: 'cache 用户' },
            });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({
                identifier: 'cache_user',
            });
            mockCache.getAccountAuth.mockResolvedValue({
                roles: ['super'],
                permissions: ['global:*'],
                menus: [],
            });

            const result = await service.getAdminMe('acc-cache');

            // cache 路径生效
            expect(result.roles).toEqual(['super']);
            expect(result.permissions).toEqual(['global:*']);
            // 验证 cache 被调
            expect(mockCache.getAccountAuth).toHaveBeenCalledWith('acc-cache');
        });
    });

    // ── getMemberMe ──

    describe('getMemberMe', () => {
        it('应返回C端用户信息', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({
                id: 'mem-1',
                userType: 'member',
                memberProfile: { nickname: '用户小红', avatar: '/avatars/1.png' },
            });
            mockPrisma.client.memberAccountRole.findMany.mockResolvedValue([
                { role: { code: 'vip' } },
                { role: { code: 'svip' } },
            ]);

            const result = await service.getMemberMe('mem-1');

            expect(result.userType).toBe('member');
            expect(result.nickname).toBe('用户小红');
            expect(result.avatar).toBe('/avatars/1.png');
            expect(result.roles).toEqual(['vip', 'svip']);
        });

        it('无角色时应返回空数组', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({
                id: 'mem-2',
                userType: 'member',
                memberProfile: { nickname: null, avatar: null },
            });
            mockPrisma.client.memberAccountRole.findMany.mockResolvedValue([]);

            const result = await service.getMemberMe('mem-2');

            expect(result.roles).toEqual([]);
            expect(result.nickname).toBeUndefined();
            expect(result.avatar).toBeUndefined();
        });

        it('userType不是member应抛异常', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({
                id: 'acc-1',
                userType: 'admin',
                memberProfile: null,
            });

            await expect(service.getMemberMe('acc-1')).rejects.toThrow(NotFoundException);
        });
    });
});
