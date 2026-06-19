/**
 * MemberRoleService 单元测试
 *
 * 覆盖场景：
 * - getRolePermissions：Redis 命中 / miss 从 DB 重建 / 角色不存在返回空数组
 * - getAggregatedPermissions：多角色权限码去重合并
 * - findAll：查全部角色
 * - create：成功创建 / 撞 unique 抛 ConflictException / 并发 P2002 抛 ConflictException
 * - delete：成功删除（含 FK 清理）/ 角色不存在抛 NotFoundException
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../../prisma/generated/client.js';
import { MemberRoleService } from '../member-role.service.js';

/** Prisma P2002 错误工厂 */
function p2002(target?: string[]) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target },
    });
}

describe('MemberRoleService', () => {
    let service: MemberRoleService;
    let mockPrisma: { client: Record<string, any>; rawClient: Record<string, any> };
    let mockCache: { get: ReturnType<typeof vi.fn>; setex: ReturnType<typeof vi.fn> };
    let mockAudit: { record: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockCache = { get: vi.fn(), setex: vi.fn() };

        mockAudit = { record: vi.fn().mockResolvedValue(undefined) };

        mockPrisma = {
            client: {
                memberRole: {
                    findUnique: vi.fn(),
                    findMany: vi.fn(),
                    create: vi.fn(),
                    delete: vi.fn(),
                    findFirst: vi.fn(),
                },
                memberRoleMenu: { deleteMany: vi.fn() },
                memberAccountRole: { deleteMany: vi.fn() },
                $transaction: vi.fn(async (cb: Function) => cb(mockPrisma.client)),
            },
            rawClient: {},
        };

        service = new MemberRoleService(mockPrisma as any, mockCache as any, mockAudit as any);
    });

    // ── getRolePermissions ──

    describe('getRolePermissions', () => {
        it('缓存命中时直接返回权限码列表', async () => {
            mockCache.get.mockResolvedValue({ permissions: ['read', 'write'] });

            const result = await service.getRolePermissions('vip');
            expect(result).toEqual(['read', 'write']);
            expect(mockCache.get).toHaveBeenCalledWith('mono:role:permission:member:vip');
            expect(mockPrisma.client.memberRole.findUnique).not.toHaveBeenCalled();
        });

        it('缓存未命中时从 DB 重建并写入缓存', async () => {
            mockCache.get.mockResolvedValue(null);
            mockPrisma.client.memberRole.findUnique.mockResolvedValue({
                code: 'vip',
                roleMenus: [
                    { menu: { permissionCode: 'member:vip:view' } },
                    { menu: { permissionCode: 'member:vip:edit' } },
                    { menu: { permissionCode: null } }, // 无权限码的菜单
                ],
            });

            const result = await service.getRolePermissions('vip');
            expect(result).toEqual(['member:vip:view', 'member:vip:edit']);
            expect(mockCache.setex).toHaveBeenCalledWith('mono:role:permission:member:vip', 1800, {
                permissions: ['member:vip:view', 'member:vip:edit'],
            });
        });

        it('角色不存在时返回空数组', async () => {
            mockCache.get.mockResolvedValue(null);
            mockPrisma.client.memberRole.findUnique.mockResolvedValue(null);

            const result = await service.getRolePermissions('nonexistent');
            expect(result).toEqual([]);
        });
    });

    // ── getAggregatedPermissions ──

    describe('getAggregatedPermissions', () => {
        it('应合并多个角色的权限码并去重', async () => {
            mockCache.get
                .mockResolvedValueOnce({ permissions: ['a', 'b'] })
                .mockResolvedValueOnce({ permissions: ['b', 'c'] });

            const result = await service.getAggregatedPermissions(['role1', 'role2']);
            expect(result).toEqual(['a', 'b', 'c']);
        });
    });

    // ── findAll ──

    describe('findAll', () => {
        it('应返回所有角色按 createdAt 倒序', async () => {
            const mockRoles = [
                { id: '1', code: 'vip' },
                { id: '2', code: 'svip' },
            ];
            mockPrisma.client.memberRole.findMany.mockResolvedValue(mockRoles);

            const result = await service.findAll();
            expect(result).toEqual(mockRoles);
            expect(mockPrisma.client.memberRole.findMany).toHaveBeenCalledWith({
                orderBy: { createdAt: 'desc' },
            });
        });
    });

    // ── create ──

    describe('create', () => {
        const input = { name: 'VIP', code: 'vip' };

        it('成功创建角色并写审计日志', async () => {
            mockPrisma.client.memberRole.findFirst.mockResolvedValue(null);
            mockPrisma.client.memberRole.create.mockResolvedValue({ id: 'r-1', ...input });

            const result = await service.create(input, 'op-1');
            expect(result.id).toBe('r-1');
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'role_created', resourceType: 'member_role' }),
            );
        });

        it('撞 unique（活）应抛 ConflictException', async () => {
            mockPrisma.client.memberRole.findFirst.mockResolvedValue({ id: 'r-old', code: 'vip' });

            await expect(service.create(input)).rejects.toThrow(ConflictException);
        });

        it('并发 P2002（code 冲突）应抛 ConflictException', async () => {
            mockPrisma.client.memberRole.findFirst.mockResolvedValue(null);
            mockPrisma.client.memberRole.create.mockRejectedValue(p2002(['code']));

            await expect(service.create(input)).rejects.toThrow(ConflictException);
        });

        it('非 P2002 错误应透传', async () => {
            mockPrisma.client.memberRole.findFirst.mockResolvedValue(null);
            mockPrisma.client.memberRole.create.mockRejectedValue(new Error('DB down'));

            await expect(service.create(input)).rejects.toThrow('DB down');
        });
    });

    // ── delete ──

    describe('delete', () => {
        it('成功删除角色并清理 FK 关联表', async () => {
            mockPrisma.client.memberRole.findUnique.mockResolvedValue({ id: 'r-1', code: 'vip' });

            const result = await service.delete('r-1', 'op-1');
            expect(result).toEqual({ id: 'r-1', deleted: true });
            expect(mockPrisma.client.memberRoleMenu.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'r-1' } });
            expect(mockPrisma.client.memberAccountRole.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'r-1' } });
        });

        it('角色不存在应抛 NotFoundException', async () => {
            mockPrisma.client.memberRole.findUnique.mockResolvedValue(null);

            await expect(service.delete('r-unknown')).rejects.toThrow(NotFoundException);
        });
    });
});
