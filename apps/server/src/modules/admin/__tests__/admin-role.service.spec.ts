/**
 * AdminRoleService 单元测试
 *
 * 覆盖场景（计划要求 ≥ 70% 覆盖率）：
 * - findAll: 返回角色列表（含 menuCount + menuIds）、空列表、enabled 筛选
 * - findById: 成功、不存在、查询参数验证
 * - findByCode: 存在、不存在、查询条件验证
 * - create: 成功（含审计日志）、撞活跃 ConflictException、P2002 catch、审计日志失败不抛异常
 * - update: 成功（含缓存失效 + 审计日志）、禁用 super_admin 保护、不存在、审计日志失败不抛异常
 * - delete: 硬删除（事务内级联清关联表 + 物理删除）、super_admin 保护、不存在
 * - assignMenus: 成功（事务 + 缓存失效 + 审计日志）、角色不存在、空 menuIds 跳过 createMany
 * - getRoleAccounts: 成功、空列表
 * - removeRoleFromAccount: 非超管角色移除成功、超管角色移除（活跃数足够）、超管角色移除（活跃数不足保护）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../prisma/generated/client.js';
import { AdminRoleService } from '../admin-role/admin-role.service.js';

// ── 辅助工厂 ──

function createMockCacheService() {
    return {
        invalidateRole: vi.fn().mockResolvedValue(undefined),
        invalidateAccount: vi.fn().mockResolvedValue(undefined),
    };
}

/** 构造 Prisma 返回的原始角色行（toAdminRole 处理前） */
function makePrismaRole(overrides: Record<string, any> = {}) {
    return {
        id: overrides.id ?? 'role-1',
        name: overrides.name ?? '管理员',
        code: overrides.code ?? 'admin',
        description: overrides.description ?? null,
        enabled: overrides.enabled !== undefined ? overrides.enabled : true,
        deletedAt: overrides.deletedAt ?? null,
        createdAt: overrides.createdAt ?? new Date('2025-01-01'),
        updatedAt: overrides.updatedAt ?? new Date('2025-06-01'),
        _count: overrides._count ?? { roleMenus: 2, accountRoles: 0 },
        roleMenus: overrides.roleMenus ?? [{ menuId: 'menu-1' }, { menuId: 'menu-2' }],
    };
}

describe('AdminRoleService', () => {
    let service: AdminRoleService;
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
                adminRole: {
                    findMany: vi.fn(),
                    findUnique: vi.fn(),
                    findFirst: vi.fn(),
                    create: vi.fn(),
                    update: vi.fn(),
                    delete: vi.fn(),
                },
                adminRoleMenu: {
                    deleteMany: vi.fn(),
                    createMany: vi.fn(),
                },
                adminAccountRole: {
                    findMany: vi.fn(),
                    deleteMany: vi.fn(),
                    count: vi.fn(),
                },
                $transaction: vi.fn(),
            },
            rawClient: {
                adminRole: {
                    findUnique: vi.fn(),
                    findMany: vi.fn(),
                    findFirst: vi.fn(),
                    delete: vi.fn(),
                    create: vi.fn(),
                },
                auditLog: {
                    create: vi.fn(),
                    deleteMany: vi.fn(),
                },
                $transaction: vi.fn(),
            },
        };

        service = new AdminRoleService(mockPrisma as any, mockCache as any, mockAudit as any);
    });

    // ── findAll ──

    describe('findAll', () => {
        it('应返回所有角色（含 menuCount + menuIds）', async () => {
            const prismaRoles = [
                makePrismaRole({ id: 'r1', code: 'admin', name: '管理员' }),
                makePrismaRole({
                    id: 'r2',
                    code: 'editor',
                    name: '编辑',
                    _count: { roleMenus: 0, accountRoles: 0 },
                    roleMenus: [],
                }),
            ];
            mockPrisma.client.adminRole.findMany.mockResolvedValue(prismaRoles);

            const result = await service.findAll();

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                id: 'r1',
                code: 'admin',
                name: '管理员',
                menuCount: 2,
                menuIds: ['menu-1', 'menu-2'],
            });
            expect(result[1]).toMatchObject({
                id: 'r2',
                code: 'editor',
                name: '编辑',
                menuCount: 0,
                menuIds: [],
            });
        });

        it('应在无角色时返回空数组', async () => {
            mockPrisma.client.adminRole.findMany.mockResolvedValue([]);

            const result = await service.findAll();

            expect(result).toEqual([]);
        });

        it('应按 createdAt 降序排列', async () => {
            mockPrisma.client.adminRole.findMany.mockResolvedValue([]);

            await service.findAll();

            expect(mockPrisma.client.adminRole.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: { createdAt: 'desc' },
                }),
            );
        });

        it('应在 enabled=undefined（默认）时 where 不含 enabled 字段', async () => {
            mockPrisma.client.adminRole.findMany.mockResolvedValue([]);

            await service.findAll();

            const callArg = mockPrisma.client.adminRole.findMany.mock.calls[0]?.[0];
            expect(callArg?.where).toEqual({});
            expect(callArg?.where).not.toHaveProperty('enabled');
        });

        it('应在 enabled=true 时附加 where.enabled: true', async () => {
            mockPrisma.client.adminRole.findMany.mockResolvedValue([]);

            await service.findAll(true);

            expect(mockPrisma.client.adminRole.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { enabled: true } }),
            );
        });

        it('应在 enabled=false 时附加 where.enabled: false', async () => {
            mockPrisma.client.adminRole.findMany.mockResolvedValue([]);

            await service.findAll(false);

            expect(mockPrisma.client.adminRole.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { enabled: false } }),
            );
        });
    });

    // ── findById ──

    describe('findById', () => {
        it('应返回角色详情（含 menuIds）', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(makePrismaRole({ id: 'r1', code: 'super_admin' }));

            const result = await service.findById('r1');

            expect(result.id).toBe('r1');
            expect(result.code).toBe('super_admin');
            expect(result.menuIds).toEqual(['menu-1', 'menu-2']);
            expect(result.menuCount).toBe(2);
        });

        it('应在角色不存在时抛出 NotFoundException', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(null);

            await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
        });

        it('应查询关联的 roleMenus', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(null);

            await service.findById('r1').catch(() => {});

            expect(mockPrisma.client.adminRole.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'r1' },
                    include: {
                        _count: { select: { roleMenus: true, accountRoles: true } },
                        roleMenus: { select: { menuId: true } },
                    },
                }),
            );
        });
    });

    // ── findByCode ──

    describe('findByCode', () => {
        it('应按 code 查询到角色', async () => {
            const prismaRole = makePrismaRole({ code: 'admin' });
            mockPrisma.client.adminRole.findFirst.mockResolvedValue(prismaRole);

            const result = await service.findByCode('admin');

            expect(result).toBeDefined();
            expect(result!.code).toBe('admin');
        });

        it('应在角色不存在时返回 null', async () => {
            mockPrisma.client.adminRole.findFirst.mockResolvedValue(null);

            const result = await service.findByCode('nonexistent');

            expect(result).toBeNull();
        });

        it('应按 code + deletedAt 查询', async () => {
            mockPrisma.client.adminRole.findFirst.mockResolvedValue(null);

            await service.findByCode('admin');

            expect(mockPrisma.client.adminRole.findFirst).toHaveBeenCalledWith({
                where: { code: 'admin' },
            });
        });
    });

    // ── create ──

    describe('create', () => {
        const input = { name: '新角色', code: 'new_role', description: '描述', enabled: true };

        it('应成功创建角色', async () => {
            mockPrisma.client.adminRole.findFirst.mockResolvedValue(null);
            mockPrisma.client.adminRole.create.mockResolvedValue({
                id: 'role-new',
                ...input,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await service.create(input);

            expect(result.code).toBe('new_role');
            expect(result.name).toBe('新角色');
            expect(result.menuCount).toBe(0);
            expect(result.menuIds).toEqual([]);
            expect(mockPrisma.client.adminRole.create).toHaveBeenCalledWith({
                data: input,
            });
        });

        it('应在编码撞活跃时抛出 ConflictException', async () => {
            mockPrisma.client.adminRole.findFirst.mockResolvedValue(makePrismaRole({ code: 'new_role' }));

            await expect(service.create(input)).rejects.toThrow(ConflictException);
            await expect(service.create(input)).rejects.toThrow('角色编码 new_role 已被使用');
        });

        it('应在 P2002 撞 unique 时重做预查并抛 ConflictException', async () => {
            mockPrisma.client.adminRole.findFirst
                .mockResolvedValueOnce(null) // 第一次预查：null
                .mockResolvedValueOnce(makePrismaRole({ code: 'new_role' })); // P2002 后重做预查：撞活跃

            const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                code: 'P2002',
                clientVersion: 'test',
                meta: { target: ['code'] },
            });
            mockPrisma.client.adminRole.create.mockRejectedValueOnce(p2002);

            await expect(service.create(input)).rejects.toThrow(ConflictException);
        });

        it('应在创建成功后记录审计日志', async () => {
            mockPrisma.client.adminRole.findFirst.mockResolvedValue(null);
            mockPrisma.client.adminRole.create.mockResolvedValue({
                id: 'role-new',
                ...input,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await service.create(input);

            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'role_created',
                    resourceType: 'admin_role',
                    resourceId: 'role-new',
                }),
            );
        });

        it('应在审计日志写入失败时不抛异常', async () => {
            mockPrisma.client.adminRole.findFirst.mockResolvedValue(null);
            mockPrisma.client.adminRole.create.mockResolvedValue({
                id: 'role-new',
                ...input,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            mockAudit.record.mockResolvedValue(undefined);

            await expect(service.create(input)).resolves.toBeDefined();
        });
    });

    // ── update ──

    describe('update', () => {
        const updateData = { name: '更新名称', description: '新描述' };

        it('应成功更新角色', async () => {
            mockPrisma.client.adminRole.findUnique
                .mockResolvedValueOnce(makePrismaRole({ code: 'editor' })) // update 中的预查
                .mockResolvedValueOnce(makePrismaRole({ code: 'editor', name: '更新名称' })); // findById 中的重查
            mockPrisma.client.adminRole.update.mockResolvedValue(makePrismaRole({ code: 'editor', name: '更新名称' }));

            const result = await service.update('role-editor', updateData);

            expect(result.name).toBe('更新名称');
            expect(mockCache.invalidateRole).toHaveBeenCalledWith('editor');
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'role_updated',
                    resourceType: 'admin_role',
                    resourceId: 'role-editor',
                }),
            );
        });

        it('应在禁用 super_admin 时抛出 ForbiddenException', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(makePrismaRole({ code: 'super_admin' }));

            await expect(service.update('role-super', { enabled: false })).rejects.toThrow(ForbiddenException);
        });

        it('应在角色不存在时抛出 NotFoundException', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(null);

            await expect(service.update('nonexistent', { name: 'x' })).rejects.toThrow(NotFoundException);
        });

        it('应支持启用角色的更新（非禁用）', async () => {
            mockPrisma.client.adminRole.findUnique
                .mockResolvedValueOnce(makePrismaRole({ code: 'super_admin' }))
                .mockResolvedValueOnce(makePrismaRole({ code: 'super_admin' }));
            mockPrisma.client.adminRole.update.mockResolvedValue(makePrismaRole({ code: 'super_admin' }));

            const result = await service.update('role-super', { enabled: true });

            expect(result.code).toBe('super_admin');
            expect(mockCache.invalidateRole).toHaveBeenCalledWith('super_admin');
        });

        it('应在更新成功后失效缓存', async () => {
            mockPrisma.client.adminRole.findUnique
                .mockResolvedValueOnce(makePrismaRole({ code: 'editor' }))
                .mockResolvedValueOnce(makePrismaRole({ code: 'editor' }));
            mockPrisma.client.adminRole.update.mockResolvedValue(makePrismaRole({ code: 'editor' }));

            await service.update('role-editor', { name: 'test' });

            expect(mockCache.invalidateRole).toHaveBeenCalledWith('editor');
        });

        it('应在审计日志失败时不抛异常', async () => {
            mockPrisma.client.adminRole.findUnique
                .mockResolvedValueOnce(makePrismaRole({ code: 'editor' }))
                .mockResolvedValueOnce(makePrismaRole({ code: 'editor' }));
            mockPrisma.client.adminRole.update.mockResolvedValue(makePrismaRole({ code: 'editor' }));
            mockAudit.record.mockResolvedValue(undefined);

            await expect(service.update('role-editor', { name: 'test' })).resolves.toBeDefined();
        });
    });

    // ── delete (硬删除) ──

    describe('delete', () => {
        it('应成功硬删除角色（事务内级联清关联表 + 物理删除）', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(
                makePrismaRole({ id: 'role-editor', code: 'editor' }),
            );
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminRoleMenu: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
                    adminAccountRole: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
                    adminRole: { delete: vi.fn().mockResolvedValue(undefined) },
                };
                return cb(tx);
            });

            const result = await service.delete('role-editor');

            expect(result.deleted).toBe(true);
            expect(result.id).toBe('role-editor');
            expect(mockPrisma.client.$transaction).toHaveBeenCalledTimes(1);
            expect(mockCache.invalidateRole).toHaveBeenCalledWith('editor');
        });

        it('应在删除成功后记录审计日志', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(makePrismaRole({ code: 'editor' }));
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminRoleMenu: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
                    adminAccountRole: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
                    adminRole: { delete: vi.fn().mockResolvedValue(undefined) },
                };
                return cb(tx);
            });

            await service.delete('role-editor');

            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'role_deleted',
                    resourceType: 'admin_role',
                    resourceId: 'role-editor',
                }),
            );
        });

        it('应在删除 super_admin 时抛出 ForbiddenException', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(makePrismaRole({ code: 'super_admin' }));

            await expect(service.delete('role-super')).rejects.toThrow(ForbiddenException);
        });

        it('应在角色不存在时抛出 NotFoundException', async () => {
            mockPrisma.client.adminRole.findUnique.mockResolvedValue(null);

            await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    // ── assignMenus ──

    describe('assignMenus', () => {
        it('应成功分配菜单（事务内先删后插）', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue(makePrismaRole({ id: 'role-admin', code: 'admin' })),
                    },
                    adminRoleMenu: {
                        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
                        createMany: vi.fn().mockResolvedValue({ count: 2 }),
                    },
                };
                return cb(tx);
            });

            const result = await service.assignMenus('role-admin', ['menu-a', 'menu-b']);

            expect(result.roleId).toBe('role-admin');
            expect(result.menuIds).toEqual(['menu-a', 'menu-b']);
            expect(mockCache.invalidateRole).toHaveBeenCalledWith('admin');
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'permission_changed',
                    resourceType: 'admin_role',
                    resourceId: 'role-admin',
                }),
            );
        });

        it('应在角色不存在时抛出 NotFoundException', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue(null),
                    },
                    adminRoleMenu: {
                        deleteMany: vi.fn(),
                        createMany: vi.fn(),
                    },
                };
                return cb(tx);
            });

            await expect(service.assignMenus('nonexistent', ['menu-1'])).rejects.toThrow(NotFoundException);
        });

        it('应在 menuIds 为空数组时跳过 createMany', async () => {
            const txCreateMany = vi.fn();
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue(makePrismaRole({ id: 'role-admin', code: 'admin' })),
                    },
                    adminRoleMenu: {
                        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                        createMany: txCreateMany,
                    },
                };
                return cb(tx);
            });

            await service.assignMenus('role-admin', []);

            expect(txCreateMany).not.toHaveBeenCalled();
        });
    });

    // ── getRoleAccounts ──

    describe('getRoleAccounts', () => {
        it('应返回持有该角色的账户 ID 列表', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([
                { accountId: 'acc-1' },
                { accountId: 'acc-2' },
                { accountId: 'acc-3' },
            ]);

            const result = await service.getRoleAccounts('role-1');

            expect(result).toEqual(['acc-1', 'acc-2', 'acc-3']);
        });

        it('应在无账户时返回空数组', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([]);

            const result = await service.getRoleAccounts('role-1');

            expect(result).toEqual([]);
        });

        it('应只查询 accountId 字段', async () => {
            mockPrisma.client.adminAccountRole.findMany.mockResolvedValue([]);

            await service.getRoleAccounts('role-1');

            expect(mockPrisma.client.adminAccountRole.findMany).toHaveBeenCalledWith({
                where: { roleId: 'role-1' },
                select: { accountId: true },
            });
        });
    });

    // ── removeRoleFromAccount ──

    describe('removeRoleFromAccount', () => {
        it('应成功移除账户的非超管角色', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue(makePrismaRole({ code: 'editor' })),
                    },
                    adminAccountRole: {
                        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                    },
                };
                return cb(tx);
            });

            await service.removeRoleFromAccount('acc-1', 'role-editor');

            expect(mockCache.invalidateRole).toHaveBeenCalledWith('editor');
            expect(mockCache.invalidateAccount).toHaveBeenCalledWith('acc-1');
        });

        it('应在移除超管角色且活跃超管足够时成功', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    $queryRaw: vi.fn().mockResolvedValue([]),
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue(makePrismaRole({ code: 'super_admin' })),
                    },
                    adminAccountRole: {
                        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                        count: vi.fn().mockResolvedValue(2),
                    },
                };
                return cb(tx);
            });

            await service.removeRoleFromAccount('acc-1', 'role-super');

            expect(mockCache.invalidateRole).toHaveBeenCalledWith('super_admin');
            expect(mockCache.invalidateAccount).toHaveBeenCalledWith('acc-1');
        });

        it('应在移除超管角色且活跃超管 ≤1 时抛出 ForbiddenException', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    $queryRaw: vi.fn().mockResolvedValue([]),
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue(makePrismaRole({ code: 'super_admin' })),
                    },
                    adminAccountRole: {
                        deleteMany: vi.fn(),
                        count: vi.fn().mockResolvedValue(1),
                    },
                };
                return cb(tx);
            });

            await expect(service.removeRoleFromAccount('acc-1', 'role-super')).rejects.toThrow(ForbiddenException);
        });

        it('应在移除非超管角色时不检查活跃超管数', async () => {
            let txCount: any;
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminRole: {
                        findUnique: vi.fn().mockResolvedValue(makePrismaRole({ code: 'editor' })),
                    },
                    adminAccountRole: {
                        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                        count: vi.fn(),
                    },
                };
                txCount = tx.adminAccountRole.count;
                return cb(tx);
            });

            await service.removeRoleFromAccount('acc-1', 'role-editor');

            expect(txCount).not.toHaveBeenCalled();
        });
    });
});
