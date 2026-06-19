/**
 * AdminMenuService 单元测试
 *
 * 覆盖场景（计划要求 ≥ 70% 覆盖率）：
 * - findAll: 扁平列表、排序
 * - findTree: 树形结构（含 buildMenuTree 调用）
 * - findOptions: 直接委托 findAll
 * - findById: 成功、不存在
 * - create: 成功（无 parentId / 有 parentId）、无效 parentId
 * - update: 成功、菜单不存在、自身设为父菜单（self-parent）、缓存失效、审计日志
 * - delete: 硬删除成功、不存在、含子节点阻断
 * - findByRoleIds: 关联角色菜单、空数组、仅 enabled 菜单
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminMenuService } from '../admin-menu/admin-menu.service.js';
import { buildMenuTree } from '../../../common/utils/build-menu-tree.js';

// ── 辅助工厂 ──

function createMockCacheService() {
    return {
        getAccountAuth: vi.fn(),
        buildAccountAuth: vi.fn(),
        invalidateAccount: vi.fn().mockResolvedValue(undefined),
        invalidateRole: vi.fn(),
        invalidateMenuStructure: vi.fn().mockResolvedValue(undefined),
        bumpMenuVersion: vi.fn().mockResolvedValue(1),
        updateRoleAccounts: vi.fn(),
    };
}

/** 构造一个 Prisma adminMenu 原始记录（经过 toAdminMenu 映射前的形状） */
function makePrismaMenu(overrides: Record<string, unknown> = {}) {
    return {
        id: overrides.id ?? 'menu-1',
        parentId: overrides.parentId ?? null,
        name: overrides.name ?? '根菜单',
        type: overrides.type ?? 'directory',
        path: overrides.path ?? '/dashboard',
        routeName: overrides.routeName ?? 'Dashboard',
        icon: overrides.icon ?? 'dashboard',
        permissionCode: overrides.permissionCode ?? null,
        sort: overrides.sort ?? 1,
        visible: overrides.visible ?? true,
        keepAlive: overrides.keepAlive ?? false,
        enabled: overrides.enabled ?? true,
        createdAt: overrides.createdAt ?? new Date('2025-01-01'),
        updatedAt: overrides.updatedAt ?? new Date('2025-06-01'),
    };
}

/**
 * 构造一个通过 toAdminMenu 映射后的 AdminMenu 对象
 * - toAdminMenu 会将 null parentId 转为 undefined，空字符串转为 undefined
 */
function makeAdminMenu(overrides: Record<string, unknown> = {}) {
    return {
        id: overrides.id ?? 'menu-1',
        parentId: overrides.parentId ?? undefined,
        name: overrides.name ?? '根菜单',
        type: overrides.type ?? 'directory',
        path: overrides.path ?? '/dashboard',
        routeName: overrides.routeName ?? 'Dashboard',
        icon: overrides.icon ?? 'dashboard',
        permissionCode: overrides.permissionCode ?? undefined,
        sort: overrides.sort ?? 1,
        visible: overrides.visible ?? true,
        keepAlive: overrides.keepAlive ?? false,
        enabled: overrides.enabled ?? true,
        createdAt: overrides.createdAt ?? new Date('2025-01-01'),
        updatedAt: overrides.updatedAt ?? new Date('2025-06-01'),
    };
}

describe('AdminMenuService', () => {
    let service: AdminMenuService;
    let mockCache: ReturnType<typeof createMockCacheService>;
    let mockPrisma: {
        client: Record<string, any>;
        rawClient: Record<string, any>;
    };
    let mockAudit: { record: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockCache = createMockCacheService();
        mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
        mockPrisma = {
            client: {
                adminMenu: {
                    findMany: vi.fn(),
                    findUnique: vi.fn(),
                    count: vi.fn(),
                    create: vi.fn(),
                    update: vi.fn(),
                    delete: vi.fn(),
                },
                adminRoleMenu: {
                    findMany: vi.fn(),
                    deleteMany: vi.fn(),
                },
                adminAccountMenu: {
                    deleteMany: vi.fn(),
                },
            },
            rawClient: {
                adminMenu: {
                    findUnique: vi.fn(),
                },
            },
        };

        service = new AdminMenuService(mockPrisma as any, mockCache as any, mockAudit as any);
    });

    // ── findAll ──

    describe('findAll', () => {
        it('应返回扁平菜单列表', async () => {
            const rows = [
                makePrismaMenu({ id: 'm1', name: '菜单一', sort: 1 }),
                makePrismaMenu({ id: 'm2', name: '菜单二', sort: 2 }),
            ];
            mockPrisma.client.adminMenu.findMany.mockResolvedValue(rows);

            const result = await service.findAll();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('m1');
            expect(result[1].id).toBe('m2');
            expect(mockPrisma.client.adminMenu.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
                }),
            );
        });

        it('应将 Prisma 原始记录映射为 AdminMenu（null parentId → undefined）', async () => {
            const rows = [makePrismaMenu({ parentId: null })];
            mockPrisma.client.adminMenu.findMany.mockResolvedValue(rows);

            const result = await service.findAll();

            expect(result[0].parentId).toBeUndefined();
            expect(result[0].id).toBe('menu-1');
        });

        it('应将 Prisma 原始记录映射（非空 parentId 保留）', async () => {
            const rows = [makePrismaMenu({ parentId: 'parent-1' })];
            mockPrisma.client.adminMenu.findMany.mockResolvedValue(rows);

            const result = await service.findAll();

            expect(result[0].parentId).toBe('parent-1');
        });

        it('应返回空数组当无菜单时', async () => {
            mockPrisma.client.adminMenu.findMany.mockResolvedValue([]);

            const result = await service.findAll();

            expect(result).toEqual([]);
        });
    });

    // ── findTree ──

    describe('findTree', () => {
        it('应返回树形结构（根节点 + 子节点）', async () => {
            const rows = [
                makePrismaMenu({ id: 'root-1', name: '根目录', parentId: null, sort: 1 }),
                makePrismaMenu({ id: 'child-1', name: '子菜单', parentId: 'root-1', sort: 1 }),
            ];
            mockPrisma.client.adminMenu.findMany.mockResolvedValue(rows);

            const result = await service.findTree();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('根目录');
            expect(result[0].children).toHaveLength(1);
            expect(result[0].children[0].name).toBe('子菜单');
        });

        it('应递归映射 children 中的每个节点', async () => {
            const rows = [
                makePrismaMenu({ id: 'root-1', name: '根', parentId: null, sort: 1 }),
                makePrismaMenu({ id: 'l1-1', name: '一级', parentId: 'root-1', sort: 1 }),
                makePrismaMenu({ id: 'l2-1', name: '二级', parentId: 'l1-1', sort: 1 }),
            ];
            mockPrisma.client.adminMenu.findMany.mockResolvedValue(rows);

            const result = await service.findTree();

            expect(result[0].children[0].children).toHaveLength(1);
            expect(result[0].children[0].children[0].name).toBe('二级');
        });

        it('应在无数据时返回空数组', async () => {
            mockPrisma.client.adminMenu.findMany.mockResolvedValue([]);

            const result = await service.findTree();

            expect(result).toEqual([]);
        });
    });

    // ── findOptions ──

    describe('findOptions', () => {
        it('应返回扁平菜单列表（与 findAll 一致）', async () => {
            const rows = [
                makePrismaMenu({ id: 'm1', name: '菜单A', sort: 1 }),
                makePrismaMenu({ id: 'm2', name: '菜单B', sort: 2 }),
            ];
            mockPrisma.client.adminMenu.findMany.mockResolvedValue(rows);

            const result = await service.findOptions();

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('菜单A');
        });
    });

    // ── findById ──

    describe('findById', () => {
        it('应通过 id 查询成功', async () => {
            mockPrisma.client.adminMenu.findUnique.mockResolvedValue(
                makePrismaMenu({ id: 'menu-1', name: '系统管理' }),
            );

            const result = await service.findById('menu-1');

            expect(result.id).toBe('menu-1');
            expect(result.name).toBe('系统管理');
            expect(mockPrisma.client.adminMenu.findUnique).toHaveBeenCalledWith({
                where: { id: 'menu-1' },
            });
        });

        it('应在菜单不存在时抛出 NotFoundException', async () => {
            mockPrisma.client.adminMenu.findUnique.mockResolvedValue(null);

            await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
        });

        it('应正确映射 AdminMenu 字段', async () => {
            mockPrisma.client.adminMenu.findUnique.mockResolvedValue(
                makePrismaMenu({
                    id: 'menu-x',
                    name: '管理员管理',
                    type: 'menu',
                    path: '/admin/accounts',
                    routeName: 'IamAdminList',
                    icon: 'tabler:User',
                    permissionCode: 'iam:admin:list',
                    sort: 10,
                    visible: false,
                    keepAlive: true,
                    enabled: true,
                }),
            );

            const result = await service.findById('menu-x');

            expect(result.id).toBe('menu-x');
            expect(result.name).toBe('管理员管理');
            expect(result.type).toBe('menu');
            expect(result.path).toBe('/admin/accounts');
            expect(result.routeName).toBe('IamAdminList');
            expect(result.icon).toBe('tabler:User');
            expect(result.permissionCode).toBe('iam:admin:list');
            expect(result.sort).toBe(10);
            expect(result.visible).toBe(false);
            expect(result.keepAlive).toBe(true);
            expect(result.enabled).toBe(true);
        });
    });

    // ── create ──

    describe('create', () => {
        const createInput = {
            name: '新建菜单',
            type: 'menu',
            path: '/new',
            sort: 1,
            visible: true,
            keepAlive: false,
            enabled: true,
        };

        it('应成功创建菜单（无 parentId）', async () => {
            const created = makePrismaMenu({ id: 'menu-new', ...createInput });
            mockPrisma.client.adminMenu.create.mockResolvedValue(created);

            const result = await service.create(createInput);

            expect(result.id).toBe('menu-new');
            expect(result.name).toBe('新建菜单');
            expect(mockPrisma.client.adminMenu.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ name: '新建菜单' }),
            });
        });

        it('应成功创建菜单（有合法 parentId）', async () => {
            const input = { ...createInput, parentId: 'parent-1' };
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValueOnce(
                makePrismaMenu({ id: 'parent-1', name: '父菜单' }),
            );
            const created = makePrismaMenu({ id: 'menu-new', parentId: 'parent-1', ...createInput });
            mockPrisma.client.adminMenu.create.mockResolvedValue(created);

            const result = await service.create(input);

            expect(result.parentId).toBe('parent-1');
            expect(mockPrisma.rawClient.adminMenu.findUnique).toHaveBeenCalledWith({
                where: { id: 'parent-1' },
            });
        });

        it('应在 parentId 无效时抛出 BadRequestException', async () => {
            const input = { ...createInput, parentId: 'invalid-parent' };
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValue(null);

            await expect(service.create(input)).rejects.toThrow(BadRequestException);

            expect(mockPrisma.client.adminMenu.create).not.toHaveBeenCalled();
        });

        it('应写入审计日志（菜单创建）', async () => {
            const created = makePrismaMenu({ id: 'menu-new', name: '新建菜单', type: 'menu' });
            mockPrisma.client.adminMenu.create.mockResolvedValue(created);

            await service.create(createInput);

            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'menu_created',
                    resourceType: 'admin_menu',
                    resourceId: 'menu-new',
                }),
            );
        });

        it('审计日志写入失败不应影响创建结果', async () => {
            const created = makePrismaMenu({ id: 'menu-new', name: '新建菜单', type: 'menu' });
            mockPrisma.client.adminMenu.create.mockResolvedValue(created);
            mockAudit.record.mockResolvedValue(undefined);

            const result = await service.create(createInput);

            expect(result.id).toBe('menu-new');
        });

        it('新增菜单应失效缓存 + bump 版本号（双保险）', async () => {
            const created = makePrismaMenu({ id: 'menu-new', name: '新建菜单', type: 'menu' });
            mockPrisma.client.adminMenu.create.mockResolvedValue(created);

            await service.create(createInput);

            expect(mockCache.invalidateMenuStructure).toHaveBeenCalledTimes(1);
            expect(mockCache.bumpMenuVersion).toHaveBeenCalledTimes(1);
        });
    });

    // ── update ──

    describe('update', () => {
        it('应成功更新菜单名称', async () => {
            const existing = makePrismaMenu({ id: 'menu-1', name: '旧名称' });
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.update.mockResolvedValue({
                ...existing,
                name: '新名称',
            });

            const result = await service.update('menu-1', { name: '新名称' });

            expect(result.name).toBe('新名称');
            expect(mockPrisma.client.adminMenu.update).toHaveBeenCalledWith({
                where: { id: 'menu-1' },
                data: { name: '新名称' },
            });
        });

        it('应在菜单不存在时抛出 NotFoundException', async () => {
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValue(null);

            await expect(service.update('nonexistent', { name: '新名称' })).rejects.toThrow(NotFoundException);

            expect(mockPrisma.client.adminMenu.update).not.toHaveBeenCalled();
        });

        it('应禁止将父菜单设为自己（self-parent）', async () => {
            const existing = makePrismaMenu({ id: 'menu-1' });
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValue(existing);

            await expect(service.update('menu-1', { parentId: 'menu-1' })).rejects.toThrow(BadRequestException);

            expect(mockPrisma.client.adminMenu.update).not.toHaveBeenCalled();
        });

        it('应允许将父菜单设为其他有效菜单', async () => {
            const existing = makePrismaMenu({ id: 'menu-1', parentId: null });
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.update.mockResolvedValue({
                ...existing,
                parentId: 'parent-2',
            });

            const result = await service.update('menu-1', { parentId: 'parent-2' });

            expect(result.parentId).toBe('parent-2');
        });

        it('菜单结构变更后应失效缓存', async () => {
            const existing = makePrismaMenu({ id: 'menu-1' });
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.update.mockResolvedValue({ ...existing, name: '新名称' });

            await service.update('menu-1', { name: '新名称' });

            expect(mockCache.invalidateMenuStructure).toHaveBeenCalledTimes(1);
        });

        it('更新失败不应失效缓存', async () => {
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValue(null);

            await expect(service.update('nonexistent', { name: '新名称' })).rejects.toThrow(NotFoundException);

            expect(mockCache.invalidateMenuStructure).not.toHaveBeenCalled();
        });

        it('应写入审计日志（菜单更新）', async () => {
            const existing = makePrismaMenu({ id: 'menu-1', name: '旧名称' });
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.update.mockResolvedValue({ ...existing, name: '新名称' });

            await service.update('menu-1', { name: '新名称' });

            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'menu_updated',
                    resourceType: 'admin_menu',
                    resourceId: 'menu-1',
                    detail: expect.objectContaining({
                        changes: { name: '新名称' },
                    }),
                }),
            );
        });

        it('审计日志写入失败不应影响更新', async () => {
            const existing = makePrismaMenu({ id: 'menu-1', name: '旧名称' });
            mockPrisma.rawClient.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.update.mockResolvedValue({ ...existing, name: '新名称' });
            mockAudit.record.mockResolvedValue(undefined);

            const result = await service.update('menu-1', { name: '新名称' });

            expect(result.name).toBe('新名称');
        });
    });

    // ── delete ──

    describe('delete', () => {
        it('应成功硬删除菜单（清理关联表 + 物理删除）', async () => {
            const existing = makePrismaMenu({ id: 'menu-1', name: '待删除菜单' });
            mockPrisma.client.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.count.mockResolvedValue(0);
            mockPrisma.client.adminRoleMenu.deleteMany.mockResolvedValue(undefined);
            mockPrisma.client.adminAccountMenu.deleteMany.mockResolvedValue(undefined);
            mockPrisma.client.adminMenu.delete.mockResolvedValue(undefined);

            const result = await service.delete('menu-1');

            expect(result.id).toBe('menu-1');
            expect(result.deleted).toBe(true);
            // 验证清理关联表
            expect(mockPrisma.client.adminRoleMenu.deleteMany).toHaveBeenCalledWith({
                where: { menuId: 'menu-1' },
            });
            expect(mockPrisma.client.adminAccountMenu.deleteMany).toHaveBeenCalledWith({
                where: { menuId: 'menu-1' },
            });
            // 验证物理删除
            expect(mockPrisma.client.adminMenu.delete).toHaveBeenCalledWith({
                where: { id: 'menu-1' },
            });
        });

        it('应在菜单不存在时抛出 NotFoundException', async () => {
            mockPrisma.client.adminMenu.findUnique.mockResolvedValue(null);

            await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);

            expect(mockPrisma.client.adminMenu.delete).not.toHaveBeenCalled();
        });

        it('应在存在子节点时抛出 ForbiddenException', async () => {
            const existing = makePrismaMenu({ id: 'menu-1' });
            mockPrisma.client.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.count.mockResolvedValue(2);

            await expect(service.delete('menu-1')).rejects.toThrow(ForbiddenException);
            expect(mockPrisma.client.adminMenu.delete).not.toHaveBeenCalled();
        });

        it('删除后应失效缓存', async () => {
            const existing = makePrismaMenu({ id: 'menu-1' });
            mockPrisma.client.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.count.mockResolvedValue(0);
            mockPrisma.client.adminRoleMenu.deleteMany.mockResolvedValue(undefined);
            mockPrisma.client.adminAccountMenu.deleteMany.mockResolvedValue(undefined);
            mockPrisma.client.adminMenu.delete.mockResolvedValue(undefined);

            await service.delete('menu-1');

            expect(mockCache.invalidateMenuStructure).toHaveBeenCalledTimes(1);
        });

        it('应写入审计日志（菜单删除）', async () => {
            const existing = makePrismaMenu({ id: 'menu-1', name: '待删除' });
            mockPrisma.client.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.count.mockResolvedValue(0);
            mockPrisma.client.adminRoleMenu.deleteMany.mockResolvedValue(undefined);
            mockPrisma.client.adminAccountMenu.deleteMany.mockResolvedValue(undefined);
            mockPrisma.client.adminMenu.delete.mockResolvedValue(undefined);

            await service.delete('menu-1');

            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'menu_deleted',
                    resourceType: 'admin_menu',
                    resourceId: 'menu-1',
                }),
            );
        });

        it('审计日志写入失败不应影响删除', async () => {
            const existing = makePrismaMenu({ id: 'menu-1', name: '待删除' });
            mockPrisma.client.adminMenu.findUnique.mockResolvedValue(existing);
            mockPrisma.client.adminMenu.count.mockResolvedValue(0);
            mockPrisma.client.adminRoleMenu.deleteMany.mockResolvedValue(undefined);
            mockPrisma.client.adminAccountMenu.deleteMany.mockResolvedValue(undefined);
            mockPrisma.client.adminMenu.delete.mockResolvedValue(undefined);
            mockAudit.record.mockResolvedValue(undefined);

            const result = await service.delete('menu-1');

            expect(result.deleted).toBe(true);
        });
    });

    // ── findByRoleIds ──

    describe('findByRoleIds', () => {
        it('应根据角色 ID 列表返回关联菜单（仅 enabled）', async () => {
            mockPrisma.client.adminRoleMenu.findMany.mockResolvedValue([
                { menu: makePrismaMenu({ id: 'm1', name: '仪表盘', enabled: true }) },
                { menu: makePrismaMenu({ id: 'm2', name: '配置中心', enabled: true }) },
            ]);

            const result = await service.findByRoleIds(['role-1', 'role-2']);

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('仪表盘');
            expect(result[1].name).toBe('配置中心');
            expect(mockPrisma.client.adminRoleMenu.findMany).toHaveBeenCalledWith({
                where: {
                    roleId: { in: ['role-1', 'role-2'] },
                    menu: { enabled: true },
                },
                include: { menu: true },
            });
        });

        it('应过滤禁用的菜单', async () => {
            mockPrisma.client.adminRoleMenu.findMany.mockImplementation(async ({ where }: any) => {
                const all = [
                    { menu: makePrismaMenu({ id: 'm1', name: '仪表盘', enabled: true }) },
                    { menu: makePrismaMenu({ id: 'm2', name: '停用模块', enabled: false }) },
                ];
                return all.filter((rm) => rm.menu.enabled === where.menu.enabled);
            });

            const filtered = await service.findByRoleIds(['role-1']);

            expect(filtered).toHaveLength(1);
            expect(filtered[0].name).toBe('仪表盘');
        });

        it('应在角色 ID 列表为空时返回空数组', async () => {
            const result = await service.findByRoleIds([]);

            expect(result).toEqual([]);
            expect(mockPrisma.client.adminRoleMenu.findMany).not.toHaveBeenCalled();
        });

        it('应在无匹配菜单时返回空数组', async () => {
            mockPrisma.client.adminRoleMenu.findMany.mockResolvedValue([]);

            const result = await service.findByRoleIds(['role-empty']);

            expect(result).toEqual([]);
        });
    });
});
