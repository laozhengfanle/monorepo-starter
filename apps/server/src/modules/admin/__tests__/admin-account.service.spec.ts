/**
 * AdminAccountService 单元测试
 *
 * 覆盖场景（计划要求 ≥ 70% 覆盖率）：
 * - findAll: 分页、关键词搜索、enabled 筛选
 * - findById: 按 profile ID / account ID / 不存在
 * - create: 成功、用户名重复
 * - update: 更新 profile、禁用（含超管保护）
 * - delete: 软删除、最后一个超管保护
 * - assignRoles: 分配角色、移除超管保护
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminAccountService } from '../admin-account/admin-account.service.js';

// ── 辅助工厂 ──

function createMockCacheService() {
    return {
        getAccountAuth: vi.fn(),
        buildAccountAuth: vi.fn(),
        invalidateAccount: vi.fn().mockResolvedValue(undefined),
        invalidateRole: vi.fn(),
        invalidateMenuStructure: vi.fn(),
        updateRoleAccounts: vi.fn(),
    };
}

function createMockAuditService() {
    return {
        record: vi.fn().mockResolvedValue(undefined),
        findAll: vi.fn(),
    };
}

/** 构造一个包含角色的 profile 对象 */
function makeProfile(overrides: Record<string, unknown> = {}) {
    return {
        id: overrides.id ?? 'profile-1',
        accountId: overrides.accountId ?? 'account-1',
        nickname: overrides.nickname ?? '测试账户',
        phone: overrides.phone ?? '',
        email: overrides.email ?? '',
        /**
         * 默认 null（活跃行），可被 deletedAt 覆盖以模拟已软删的记录
         * - null：活跃行
         * - Date：已软删
         */
        deletedAt: overrides.deletedAt === undefined ? null : overrides.deletedAt,
        createdAt: overrides.createdAt ?? new Date('2025-01-01'),
        updatedAt: overrides.updatedAt ?? new Date('2025-06-01'),
        account: {
            id: overrides.accountId ?? 'account-1',
            enabled: overrides.enabled !== undefined ? overrides.enabled : true,
            identities: [
                {
                    identityType: 'username',
                    identifier: overrides.username ?? 'testuser',
                },
            ],
            adminRoles:
                overrides.roles !== undefined
                    ? (overrides.roles as string[]).map((code) => ({
                          role: { code, enabled: true },
                      }))
                    : [{ role: { code: 'editor', enabled: true } }],
        },
    };
}

describe('AdminAccountService', () => {
    let service: AdminAccountService;
    let mockCache: ReturnType<typeof createMockCacheService>;
    let mockAudit: ReturnType<typeof createMockAuditService>;
    let mockPrisma: {
        client: Record<string, any>;
        rawClient: Record<string, any>;
    };

    beforeEach(() => {
        mockCache = createMockCacheService();
        mockAudit = createMockAuditService();
        mockPrisma = {
            client: {
                adminProfile: {
                    findMany: vi.fn(),
                    findUnique: vi.fn(),
                    findFirst: vi.fn(),
                    count: vi.fn(),
                    create: vi.fn(),
                    update: vi.fn(),
                },
                account: {
                    create: vi.fn(),
                    update: vi.fn(),
                },
                accountIdentity: {
                    create: vi.fn(),
                    findFirst: vi.fn(),
                    /**
                     * resetPassword 用：把哈希后的新密码写回 credential
                     * - mock 默认返回带 id 的对象，让 update 之后的链路不再触发 undefined 异常
                     */
                    update: vi.fn(),
                },
                adminAccountRole: {
                    createMany: vi.fn(),
                    deleteMany: vi.fn(),
                    count: vi.fn(),
                },
                adminRole: {
                    findFirst: vi.fn(),
                },
                $transaction: vi.fn(),
            },
            /**
             * rawClient 暴露给：
             * - adminProfile.findUnique/findFirst：找已软删的记录（绕过软删除拦截）
             * - adminProfile.findMany / count：includeDeleted=true 时不过滤 deletedAt
             * - account.findUnique：同上
             * - account.delete：硬删账户（物理 DELETE）
             * - adminAccountMenu.deleteMany / adminAccountRole.deleteMany：硬删级联
             */
            rawClient: {
                adminProfile: {
                    findMany: vi.fn(),
                    findUnique: vi.fn(),
                    findFirst: vi.fn(),
                    count: vi.fn(),
                },
                account: {
                    findUnique: vi.fn(),
                    delete: vi.fn(),
                },
                adminAccountMenu: {
                    deleteMany: vi.fn(),
                },
                adminAccountRole: {
                    deleteMany: vi.fn(),
                },
                /**
                 * rawClient.$transaction：硬删事务，绕开软删除扩展
                 * - service.hardDelete 走 rawClient.$transaction（关键！）
                 * - service.restore 仍走 client.$transaction
                 */
                $transaction: vi.fn(),
            },
        };

        /**
         * tokenBlacklist mock
         * - 默认 revokeAccountTokens → true（撤销成功）
         * - 失败场景可单独 override
         */
        const mockTokenBlacklist = {
            revokeAccountTokens: vi.fn().mockResolvedValue(undefined),
        };

        service = new AdminAccountService(
            mockPrisma as any,
            mockCache as any,
            mockAudit as any,
            {} as any, // systemConfigService（resetPassword 校验密码强度时才用）
            mockTokenBlacklist as any,
        );
    });

    // ── findAll ──

    describe('findAll', () => {
        it('应返回分页结果（默认参数）', async () => {
            mockPrisma.client.adminProfile.count.mockResolvedValue(1);
            mockPrisma.client.adminProfile.findMany.mockResolvedValue([makeProfile()]);

            const result = await service.findAll({ page: 1, pageSize: 20 });

            expect(result.items).toHaveLength(1);
            expect(result.total).toBe(1);
            expect(result.page).toBe(1);
            expect(result.pageSize).toBe(20);
        });

        it('应支持关键词搜索', async () => {
            mockPrisma.client.adminProfile.count.mockResolvedValue(1);
            mockPrisma.client.adminProfile.findMany.mockResolvedValue([makeProfile({ nickname: '张三' })]);

            const result = await service.findAll({ page: 1, pageSize: 20, keyword: '张三' });

            expect(result.items[0].nickname).toBe('张三');
            expect(mockPrisma.client.adminProfile.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        OR: expect.any(Array),
                    }),
                }),
            );
        });

        it('应支持 enabled 筛选', async () => {
            mockPrisma.client.adminProfile.count.mockResolvedValue(0);
            mockPrisma.client.adminProfile.findMany.mockResolvedValue([]);

            await service.findAll({ page: 1, pageSize: 20, enabled: false });

            expect(mockPrisma.client.adminProfile.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        account: { enabled: false },
                    }),
                }),
            );
        });

        it('应正确计算 skip', async () => {
            mockPrisma.client.adminProfile.count.mockResolvedValue(100);
            mockPrisma.client.adminProfile.findMany.mockResolvedValue([]);

            await service.findAll({ page: 3, pageSize: 20 });

            expect(mockPrisma.client.adminProfile.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ skip: 40, take: 20 }),
            );
        });

        it('应在 includeDeleted=false（默认）时用 prisma.client + 过滤 deletedAt: null', async () => {
            mockPrisma.client.adminProfile.count.mockResolvedValue(0);
            mockPrisma.client.adminProfile.findMany.mockResolvedValue([]);

            await service.findAll({ page: 1, pageSize: 20, includeDeleted: false });

            expect(mockPrisma.client.adminProfile.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { deletedAt: null } }),
            );
            expect(mockPrisma.rawClient.adminProfile.findMany).not.toHaveBeenCalled();
        });

        it('应在 includeDeleted=true 时用 rawClient 跳过 deletedAt 过滤', async () => {
            /** 模拟：包含已软删的账户 */
            const profiles = [
                makeProfile({ id: 'p1' }),
                makeProfile({
                    id: 'p2',
                    accountId: 'a2',
                    username: 'deleteduser',
                    deletedAt: new Date('2025-05-01'),
                }),
            ];
            mockPrisma.rawClient.adminProfile.count.mockResolvedValue(2);
            mockPrisma.rawClient.adminProfile.findMany.mockResolvedValue(profiles);

            const result = await service.findAll({ page: 1, pageSize: 20, includeDeleted: true });

            expect(result.items).toHaveLength(2);
            expect(result.items[0]?.deletedAt).toBeNull();
            expect(result.items[1]?.deletedAt).toEqual(new Date('2025-05-01'));
            /** rawClient.findMany 被调用，where 条件不含 deletedAt: null */
            expect(mockPrisma.rawClient.adminProfile.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: {} }),
            );
            expect(mockPrisma.client.adminProfile.findMany).not.toHaveBeenCalled();
        });
    });

    // ── findById ──

    describe('findById', () => {
        it('应按 profile ID 查询成功', async () => {
            // findById 改用 rawClient.findUnique（绕过软删除拦截，可查已软删记录）
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(makeProfile({ id: 'p1' }));

            const result = await service.findById('p1');

            expect(result.id).toBe('account-1');
            expect(result.username).toBe('testuser');
        });

        it('应回退到 account ID 查询', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(null);
            mockPrisma.rawClient.adminProfile.findFirst.mockResolvedValue(makeProfile({ accountId: 'a1' }));

            const result = await service.findById('a1');

            expect(result.id).toBe('a1');
        });

        it('应在账户不存在时抛出 NotFoundException', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(null);
            mockPrisma.rawClient.adminProfile.findFirst.mockResolvedValue(null);

            await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    // ── create ──

    describe('create', () => {
        const input = { username: 'newuser', nickname: '新账户', roleIds: [] };

        it('应成功创建账户', async () => {
            /**
             * 预查撞活跃：null
             * 预查撞已删除：null
             */
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(null);

            // Mock $transaction
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    account: {
                        create: vi.fn().mockResolvedValue({ id: 'acc-new', userType: 'admin', enabled: true }),
                    },
                    accountIdentity: {
                        create: vi.fn().mockResolvedValue({ id: 'ident-new' }),
                    },
                    adminProfile: {
                        create: vi.fn().mockResolvedValue({
                            id: 'profile-new',
                            accountId: 'acc-new',
                            nickname: '新账户',
                            phone: '',
                            email: '',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        }),
                    },
                    adminAccountRole: {
                        createMany: vi.fn().mockResolvedValue({ count: 0 }),
                    },
                };
                return cb(tx);
            });

            // Mock findById 调用（create 最后返回 this.findById → rawClient.findUnique）
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(
                makeProfile({
                    id: 'profile-new',
                    accountId: 'acc-new',
                    username: 'newuser',
                    nickname: '新账户',
                    roles: [],
                }),
            );

            const result = await service.create(input);

            expect(result.username).toBe('newuser');
            expect(mockCache.invalidateAccount).toHaveBeenCalledWith('acc-new');
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'account_created',
                    resourceType: 'admin_account',
                }),
            );
        });

        it('应在用户名重复（撞活跃）时抛出 ConflictException', async () => {
            /**
             * 预查撞活跃：返回有相同 username 的 identity
             * → 抛 ConflictException
             */
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({ id: 'existing' });

            await expect(service.create(input)).rejects.toThrow();
        });
    });

    // ── update ──

    describe('update', () => {
        it('应成功更新 nickname', async () => {
            // update() 中 findUnique 改用 rawClient
            mockPrisma.rawClient.adminProfile.findUnique
                .mockResolvedValueOnce(makeProfile()) // update() 中第一次 findUnique
                .mockResolvedValueOnce(makeProfile({ nickname: '新昵称' })); // findById 中的 findUnique
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminProfile: { update: vi.fn().mockResolvedValue({}) },
                    account: { update: vi.fn().mockResolvedValue({}) },
                };
                return cb(tx);
            });

            const result = await service.update('profile-1', { nickname: '新昵称' });

            expect(result.nickname).toBe('新昵称');
            expect(mockCache.invalidateAccount).toHaveBeenCalled();
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'account_updated',
                    resourceType: 'admin_account',
                }),
            );
        });

        it('应在禁用最后一个超管时抛出 ForbiddenException', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(makeProfile({ roles: ['super_admin'] }));
            // 让 $transaction 执行回调，tx 中的 count 返回 1（当前是超管且唯一活跃超管）
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminProfile: { update: vi.fn().mockResolvedValue({}) },
                    account: { update: vi.fn().mockResolvedValue({}) },
                    adminAccountRole: {
                        // 第一次 count: hasSuperAdminRoleInTx → 是超管 (1)
                        // 第二次 count: activeSuperAdminCount → 仅 1 个活跃超管
                        count: vi
                            .fn()
                            .mockResolvedValueOnce(1) // is super admin
                            .mockResolvedValueOnce(1), // active super admin count
                    },
                };
                return cb(tx);
            });

            await expect(service.update('profile-1', { enabled: false })).rejects.toThrow(ForbiddenException);
        });

        it('应在账户不存在时抛出 NotFoundException', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(null);
            mockPrisma.rawClient.adminProfile.findFirst.mockResolvedValue(null);

            await expect(service.update('nonexistent', { nickname: 'x' })).rejects.toThrow(NotFoundException);
        });
    });

    // ── delete ──

    describe('delete', () => {
        it('应成功软删除账户', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(makeProfile({ roles: ['editor'] }));
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminProfile: { update: vi.fn().mockResolvedValue({}) },
                    account: { update: vi.fn().mockResolvedValue({}) },
                    adminAccountRole: {
                        count: vi.fn().mockResolvedValue(0), // 非超管
                    },
                    adminRole: {
                        findFirst: vi.fn().mockResolvedValue({ id: 'role-super', code: 'super_admin' }),
                    },
                };
                return cb(tx);
            });

            const result = await service.delete('profile-1');

            expect(result.deleted).toBe(true);
            expect(mockCache.invalidateAccount).toHaveBeenCalled();
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'account_deleted',
                    resourceType: 'admin_account',
                }),
            );
        });

        it('应在账户不存在时抛出 NotFoundException', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(null);
            mockPrisma.rawClient.adminProfile.findFirst.mockResolvedValue(null);

            await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);
        });

        /**
         * 软删账户时撤销该账号所有 token
         * - 即使 JWT 还有效（7d），account.tokenVersion 自增后旧 token 立即失效
         */
        it('软删账户时应撤销该账号所有 token', async () => {
            const mockTokenBlacklist = {
                revokeAccountTokens: vi.fn().mockResolvedValue(undefined),
            };
            const localService = new AdminAccountService(
                mockPrisma as any,
                mockCache as any,
                mockAudit as any,
                {} as any,
                mockTokenBlacklist as any,
            );
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(
                makeProfile({ accountId: 'a1', roles: ['editor'] }),
            );
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminProfile: { update: vi.fn().mockResolvedValue({}) },
                    account: { update: vi.fn().mockResolvedValue({}) },
                    adminAccountRole: { count: vi.fn().mockResolvedValue(0) },
                    adminRole: { findFirst: vi.fn().mockResolvedValue(null) },
                };
                return cb(tx);
            });

            await localService.delete('profile-1');

            /** 应调 revokeAccountTokens(accountId, 'account_deleted') */
            expect(mockTokenBlacklist.revokeAccountTokens).toHaveBeenCalledWith('a1', 'account_deleted');
        });
    });

    // ── hardDelete (彻底删除) ──

    describe('hardDelete', () => {
        it('应成功彻底删除已软删的账户（事务内清掉所有级联表）', async () => {
            // hardDelete 用 rawClient.findUnique 找已软删的 profile
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(
                makeProfile({ accountId: 'a1', deletedAt: new Date('2025-05-01') }),
            );

            /**
             * 关键：hardDelete 走 rawClient.$transaction（绕开软删除扩展）
             * - tx.account.delete 是物理 DELETE，不被软删除拦截
             * - 用 capturedTx 持有 tx 引用，测试结束时断言 tx.account.delete 被调过
             */
            let capturedTx: any;
            mockPrisma.rawClient.$transaction.mockImplementation(async (cb: any) => {
                capturedTx = {
                    accountIdentity: {
                        findFirst: vi.fn().mockResolvedValue({ id: 'ident-1', identifier: 'deleteduser' }),
                        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                    },
                    adminAccountMenu: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
                    adminAccountRole: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
                    adminProfile: { delete: vi.fn().mockResolvedValue({}) },
                    /** 断开审计日志外键关联（accountId → NULL） */
                    auditLog: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
                    /** 删除该账户上传的文件记录 */
                    uploadFile: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
                    account: { delete: vi.fn().mockResolvedValue({}) },
                };
                return cb(capturedTx);
            });

            const result = await service.hardDelete('profile-1');

            expect(result.deleted).toBe(true);
            expect(result.id).toBe('profile-1');
            /**
             * 物理删除走 tx.account.delete（事务内，绕开软删除扩展）
             * 注意：mockPrisma.rawClient.account.delete 不会被调
             * 实际调用的是 rawClient.$transaction 回调里的 tx.account.delete
             */
            expect(capturedTx.account.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
            /** 失效缓存 */
            expect(mockCache.invalidateAccount).toHaveBeenCalledWith('a1');
            /** 写审计日志：action = 'account_hard_deleted'，resourceType 改为 admin_account */
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'account_hard_deleted',
                    resourceType: 'admin_account',
                    resourceId: 'profile-1',
                }),
            );
        });

        it('应在删除活跃账户（deletedAt 为 null）时抛出 BadRequestException', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(makeProfile({ deletedAt: null }));

            await expect(service.hardDelete('profile-1')).rejects.toThrow(BadRequestException);
            await expect(service.hardDelete('profile-1')).rejects.toThrow('仅允许彻底删除已软删的记录');
            /** 不应执行任何物理删除 */
            expect(mockPrisma.rawClient.account.delete).not.toHaveBeenCalled();
        });

        it('应在账户不存在时抛出 NotFoundException', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(null);
            mockPrisma.rawClient.adminProfile.findFirst.mockResolvedValue(null);

            await expect(service.hardDelete('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    // ── restore (恢复) ──

    describe('restore', () => {
        it('应成功恢复已软删的账户（无 unique 冲突）', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(
                makeProfile({ accountId: 'a1', deletedAt: new Date('2025-05-01') }),
            );
            /** 唯一冲突预查：取到 identity 但无撞的活跃账户 */
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue({ identifier: 'testuser' });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValueOnce({ identifier: 'testuser' });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValueOnce(null);
            /** 实际恢复：事务内更新 profile + account 的 deletedAt */
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminProfile: { update: vi.fn().mockResolvedValue({}) },
                    account: { update: vi.fn().mockResolvedValue({}) },
                };
                return cb(tx);
            });

            const result = await service.restore('profile-1');

            expect(result.restored).toBe(true);
            expect(result.id).toBe('profile-1');
            /** 失效缓存 */
            expect(mockCache.invalidateAccount).toHaveBeenCalledWith('a1');
            /** 写审计日志：action = 'account_restored'，resourceType 改为 admin_account */
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'account_restored',
                    resourceType: 'admin_account',
                    resourceId: 'profile-1',
                }),
            );
        });

        it('应在恢复活跃账户（deletedAt 为 null）时抛出 BadRequestException', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(makeProfile({ deletedAt: null }));

            await expect(service.restore('profile-1')).rejects.toThrow(BadRequestException);
            await expect(service.restore('profile-1')).rejects.toThrow('仅允许恢复已软删的记录');
        });

        it('应在撞 unique 冲突时抛出 ConflictException', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(
                makeProfile({ accountId: 'a1', deletedAt: new Date('2025-05-01') }),
            );
            /**
             * 第一次 findFirst：取到 identity（identifier='testuser'）
             * 第二次 findFirst：唯一冲突预查，找到同 username 的活跃账户
             * 用 mockResolvedValue（持续）而非 mockResolvedValueOnce，因为 restore 会被调两次
             */
            mockPrisma.client.accountIdentity.findFirst
                .mockResolvedValueOnce({ identifier: 'testuser' })
                .mockResolvedValue({ identifier: 'testuser', accountId: 'a2' });

            await expect(service.restore('profile-1')).rejects.toThrow(ConflictException);
            await expect(service.restore('profile-1')).rejects.toThrow(/已被其他记录占用/);
        });

        it('应在账户不存在时抛出 NotFoundException', async () => {
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(null);
            mockPrisma.rawClient.adminProfile.findFirst.mockResolvedValue(null);

            await expect(service.restore('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    // ── assignRoles ──

    describe('assignRoles', () => {
        it('应成功分配角色', async () => {
            mockPrisma.client.$transaction.mockImplementation(async (cb: any) => {
                const tx = {
                    adminAccountRole: {
                        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
                        createMany: vi.fn().mockResolvedValue({ count: 1 }),
                    },
                    adminRole: {
                        findFirst: vi.fn().mockResolvedValue(null), // 无 super_admin 角色
                    },
                };
                return cb(tx);
            });
            // findById 走 rawClient
            mockPrisma.rawClient.adminProfile.findUnique.mockResolvedValue(makeProfile({ roles: ['editor'] }));

            const result = await service.assignRoles('account-1', ['role-editor']);

            expect(result.roles).toContain('editor');
            expect(mockCache.invalidateAccount).toHaveBeenCalledWith('account-1');
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'role_assigned',
                    resourceType: 'admin_account',
                }),
            );
        });
    });

    // ── resetPassword (重置密码) ──

    describe('resetPassword', () => {
        /**
         * 构造成功路径的 mock 链：
         * - 账户存在且未软删
         * - 存在 username identity（重置密码的前提条件）
         * - update 返回新值
         */
        function setupHappyPath(overrides: { deletedAt?: Date | null; identity?: any } = {}) {
            mockPrisma.rawClient.account.findUnique.mockResolvedValue({
                id: 'account-1',
                userType: 'admin',
                enabled: true,
                deletedAt: overrides.deletedAt === undefined ? null : overrides.deletedAt,
            });
            mockPrisma.client.accountIdentity.findFirst.mockResolvedValue(
                overrides.identity === null
                    ? null
                    : (overrides.identity ?? { id: 'identity-1', identityType: 'username' }),
            );
            mockPrisma.client.accountIdentity.update.mockResolvedValue({
                id: 'identity-1',
                credential: '$2b$10$hashed',
            });
        }

        it('应成功重置密码（写入哈希 + 失效缓存 + 写审计）', async () => {
            setupHappyPath();

            const result = await service.resetPassword('account-1', 'NewPass123', 'operator-1');

            expect(result).toEqual({ id: 'account-1', reset: true });

            /** 1. 校验账户存在走 rawClient（绕开软删除扩展） */
            expect(mockPrisma.rawClient.account.findUnique).toHaveBeenCalledWith({ where: { id: 'account-1' } });
            /** 2. 找 username identity */
            expect(mockPrisma.client.accountIdentity.findFirst).toHaveBeenCalledWith({
                where: { accountId: 'account-1', identityType: 'username' },
            });
            /** 3. 写入新哈希（不验证具体 hash，仅验证 update 被调用且凭据是 bcrypt 格式） */
            const updateArgs = mockPrisma.client.accountIdentity.update.mock.calls[0][0];
            expect(updateArgs.where).toEqual({ id: 'identity-1' });
            expect(updateArgs.data.credential).toMatch(/^\$2[aby]\$/);
            /** 4. 失效账户缓存 */
            expect(mockCache.invalidateAccount).toHaveBeenCalledWith('account-1');
            /** 5. 写审计日志（action = 'reset_password'，detail 不带明文密码） */
            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    accountId: 'operator-1',
                    action: 'reset_password',
                    resourceType: 'admin_account',
                    resourceId: 'account-1',
                    detail: { by: 'operator-1' },
                }),
            );
        });

        it('应在 operatorId 缺省时记录 by=system', async () => {
            setupHappyPath();

            await service.resetPassword('account-1', 'NewPass123');

            expect(mockAudit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    accountId: '',
                    detail: { by: 'system' },
                }),
            );
        });

        /**
         * admin→admin 强制改密时撤销该账号所有 token
         * - 旧测试用的是共享 service 实例，tokenBlacklist mock 在 beforeEach 创建
         * - 共享 mock 会被全局 expect 累加，所以单独验证
         */
        it('重置密码时应撤销该账号所有 token', async () => {
            setupHappyPath();
            const mockTokenBlacklist = (service as any).tokenBlacklist;
            mockTokenBlacklist.revokeAccountTokens.mockClear();

            await service.resetPassword('account-1', 'NewPass123', 'operator-1');

            expect(mockTokenBlacklist.revokeAccountTokens).toHaveBeenCalledWith('account-1', 'password_reset');
        });

        it('应在账户不存在时抛 NotFoundException', async () => {
            mockPrisma.rawClient.account.findUnique.mockResolvedValue(null);

            await expect(service.resetPassword('nonexistent', 'NewPass123')).rejects.toThrow(NotFoundException);
            expect(mockPrisma.client.accountIdentity.update).not.toHaveBeenCalled();
            expect(mockCache.invalidateAccount).not.toHaveBeenCalled();
            expect(mockAudit.record).not.toHaveBeenCalled();
        });

        it('应在账户已软删时抛 NotFoundException（不允许重置已删除账户的密码）', async () => {
            mockPrisma.rawClient.account.findUnique.mockResolvedValue({
                id: 'account-1',
                userType: 'admin',
                enabled: true,
                deletedAt: new Date('2025-05-01'),
            });

            await expect(service.resetPassword('account-1', 'NewPass123')).rejects.toThrow(NotFoundException);
            expect(mockPrisma.client.accountIdentity.findFirst).not.toHaveBeenCalled();
        });

        it('应在缺少 username identity 时抛 BadRequestException（账户未启用密码登录）', async () => {
            setupHappyPath({ identity: null });

            await expect(service.resetPassword('account-1', 'NewPass123')).rejects.toThrow(BadRequestException);
            await expect(service.resetPassword('account-1', 'NewPass123')).rejects.toThrow(
                '该账户未启用用户名登录，无法重置密码',
            );
            expect(mockPrisma.client.accountIdentity.update).not.toHaveBeenCalled();
        });
    });
});
