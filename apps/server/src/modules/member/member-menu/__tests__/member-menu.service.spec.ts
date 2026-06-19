/**
 * MemberMenuService 单元测试
 *
 * 覆盖场景：
 * - getRoleMenuTree：缓存命中 / 缓存未命中从 DB 重建 / 角色不存在返回空数组
 * - findAll：查全部 C 端菜单
 * - delete：成功删除（含 FK 清理）/ 菜单不存在抛 NotFoundException / 有子菜单抛 BadRequestException
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MemberMenuService } from '../member-menu.service.js';

describe('MemberMenuService', () => {
    let service: MemberMenuService;
    let mockPrisma: { client: Record<string, any>; rawClient: Record<string, any> };
    let mockCache: { get: ReturnType<typeof vi.fn>; setex: ReturnType<typeof vi.fn> };
    let mockAudit: { record: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockCache = { get: vi.fn(), setex: vi.fn() };

        mockAudit = { record: vi.fn().mockResolvedValue(undefined) };

        mockPrisma = {
            client: {
                memberMenu: {
                    findMany: vi.fn(),
                    findUnique: vi.fn(),
                    count: vi.fn(),
                    delete: vi.fn(),
                },
                memberRole: {
                    findUnique: vi.fn(),
                },
                memberRoleMenu: { deleteMany: vi.fn() },
                memberAccountMenu: { deleteMany: vi.fn() },
            },
            rawClient: {},
        };

        service = new MemberMenuService(mockPrisma as any, mockCache as any, mockAudit as any);
    });

    // ── getRoleMenuTree ──

    describe('getRoleMenuTree', () => {
        it('缓存命中时直接返回菜单树', async () => {
            const cached = [{ id: 'm-1', name: '首页', children: [] }];
            mockCache.get.mockResolvedValue(cached);

            const result = await service.getRoleMenuTree('vip');
            expect(result).toEqual(cached);
            expect(mockPrisma.client.memberRole.findUnique).not.toHaveBeenCalled();
        });

        it('缓存未命中时从 DB 重建并写入缓存', async () => {
            mockCache.get.mockResolvedValue(null);
            mockPrisma.client.memberRole.findUnique.mockResolvedValue({
                code: 'vip',
                roleMenus: [
                    {
                        menu: {
                            id: 'm-1',
                            parentId: null,
                            name: '首页',
                            type: 'menu',
                            path: '/home',
                            routeName: 'Home',
                            icon: 'home',
                            permissionCode: null,
                            sort: 1,
                            visible: true,
                            keepAlive: false,
                            enabled: true,
                        },
                    },
                ],
            });

            const result = await service.getRoleMenuTree('vip');
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({ id: 'm-1', name: '首页' });
            expect(mockCache.setex).toHaveBeenCalled();
        });

        it('角色不存在时返回空数组', async () => {
            mockCache.get.mockResolvedValue(null);
            mockPrisma.client.memberRole.findUnique.mockResolvedValue(null);

            const result = await service.getRoleMenuTree('nonexistent');
            expect(result).toEqual([]);
        });
    });

    // ── findAll ──

    describe('findAll', () => {
        it('应返回所有 C 端菜单按 sort + createdAt 排序', async () => {
            const mockMenus = [
                { id: 'm-1', name: '首页' },
                { id: 'm-2', name: 'VIP' },
            ];
            mockPrisma.client.memberMenu.findMany.mockResolvedValue(mockMenus);

            const result = await service.findAll();
            expect(result).toEqual(mockMenus);
            expect(mockPrisma.client.memberMenu.findMany).toHaveBeenCalledWith({
                orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
            });
        });
    });

    // ── delete ──

    describe('delete', () => {
        it('成功删除菜单并清理 FK 关联表', async () => {
            mockPrisma.client.memberMenu.findUnique.mockResolvedValue({ id: 'm-1', name: '旧菜单' });
            mockPrisma.client.memberMenu.count.mockResolvedValue(0);

            const result = await service.delete('m-1', 'op-1');
            expect(result).toEqual({ id: 'm-1', deleted: true });
            expect(mockPrisma.client.memberRoleMenu.deleteMany).toHaveBeenCalledWith({ where: { menuId: 'm-1' } });
            expect(mockPrisma.client.memberAccountMenu.deleteMany).toHaveBeenCalledWith({ where: { menuId: 'm-1' } });
        });

        it('菜单不存在应抛 NotFoundException', async () => {
            mockPrisma.client.memberMenu.findUnique.mockResolvedValue(null);

            await expect(service.delete('m-unknown')).rejects.toThrow(NotFoundException);
        });

        it('有子菜单时应抛 BadRequestException', async () => {
            mockPrisma.client.memberMenu.findUnique.mockResolvedValue({ id: 'm-1', name: '父菜单' });
            mockPrisma.client.memberMenu.count.mockResolvedValue(3);

            await expect(service.delete('m-1')).rejects.toThrow(BadRequestException);
            await expect(service.delete('m-1')).rejects.toThrow('3 个子菜单');
        });
    });
});
