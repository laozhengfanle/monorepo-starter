/**
 * MeService 集成测试 — 验证「特例授权 grant」在两条路径下都正确合并
 *
 * 业务背景：
 * - 早期 bug：PermissionDataLoader 漏查 adminAccountMenu 表，导致 /me 接口返回的
 *   permissions 不含管理员给账户加的特例权限码，前端按钮按 permissions 判断显隐 → 不显示
 * - 修复后：DataLoader 路径 和 CacheService 路径都委托 aggregatePermissions 合并
 *
 * 本测试模拟完整链路：
 * 1. mock Prisma（adminAccountRole / adminAccountMenu / account / accountIdentity）
 * 2. mock AdminPermissionCacheService（按场景返回不同的 authData）
 * 3. 调 getAdminMe(accountId, dataloaders) 走 DataLoader 路径
 * 4. 调 getAdminMe(accountId) 走 Cache 路径
 * 5. 断言两种路径下 permissions 都包含 grant 进去的码
 *
 * 覆盖场景：
 * - 张三原本有 [iam:user:list] 角色权限
 * - 管理员给张三 grant 一个菜单「删除用户」(iam:admin:delete)
 * - 期望 /me 返回的 permissions 包含 [iam:user:list, iam:admin:delete]
 */
import { describe, it, expect, vi } from 'vitest';
import { MeService } from '../me.service.js';
import { PermissionDataLoader } from '../../../common/dataloader/permission.dataloader.js';
import { RoleDataLoader } from '../../../common/dataloader/role.dataloader.js';
import type { DataLoaders } from '../../../common/dataloader/index.js';

describe('MeService — 特例授权（grant）合并验证', () => {
    /**
     * 构造 prisma mock
     * - 模拟张三（accountId='acc-1'）的账户基本信息
     * - 模拟 adminAccountRole.findMany 返回角色权限关联
     * - 模拟 adminAccountMenu.findMany 返回账户级覆盖
     */
    function buildPrismaMock(opts: { roleLinks: any[]; overrideLinks: any[] }) {
        const prisma = {
            client: {
                account: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'acc-1',
                        userType: 'admin',
                        enabled: true,
                        adminProfile: { nickname: '张三', avatar: null },
                    }),
                },
                accountIdentity: {
                    findFirst: vi.fn().mockResolvedValue({
                        identifier: 'zhangsan',
                        identityType: 'username',
                    }),
                },
                adminAccountRole: {
                    findMany: vi.fn().mockResolvedValue(opts.roleLinks),
                },
                memberAccountRole: {
                    // member 角色空（张三只可能是 admin 账户）
                    findMany: vi.fn().mockResolvedValue([]),
                },
                adminAccountMenu: {
                    findMany: vi.fn().mockResolvedValue(opts.overrideLinks),
                },
            },
        } as any;
        return prisma;
    }

    /**
     * 构造 AdminPermissionCacheService mock
     * - 提供 roles / permissions / menus 给 fallback 路径用
     */
    function buildCacheMock(authData: any) {
        return {
            getAccountAuth: vi.fn().mockResolvedValue(authData),
        } as any;
    }

    /**
     * 构造 DataLoaders mock
     * - 直接返回预计算好的结果（绕开 DataLoader batch 调度，聚焦逻辑）
     * - 这里我们让 permissionDataLoader 用真实的 PrismaService（mock 的），
     *   这样能验证 DataLoader 内部确实查了 adminAccountMenu 并合并
     */
    function buildDataLoaders(prisma: any): DataLoaders {
        // 真实 PermissionDataLoader / RoleDataLoader 用 mock 的 prisma 跑
        // 这样能验证 DataLoader 内部确实查了 adminAccountMenu 并合并
        return {
            permissionsByAccountId: new PermissionDataLoader(prisma),
            rolesByAccountId: new RoleDataLoader(prisma),
            // 其余 loader 这里不用，stub 掉
            menusByRoleId: { load: vi.fn() } as any,
        } as unknown as DataLoaders;
    }

    it('场景1：DataLoader 路径 — 张三有角色权限 + grant 的码应出现在 permissions 里', async () => {
        // 准备：张三有 1 个角色（带 iam:user:list 权限）+ 1 个 grant（iam:admin:delete）
        const roleLinks = [
            {
                accountId: 'acc-1',
                role: {
                    enabled: true,
                    roleMenus: [{ menu: { enabled: true, permissionCode: 'iam:user:list' } }],
                },
            },
        ];
        const overrideLinks = [
            {
                accountId: 'acc-1',
                type: 'grant',
                menu: { enabled: true, permissionCode: 'iam:admin:delete' },
            },
        ];
        const prisma = buildPrismaMock({ roleLinks, overrideLinks });
        const cacheMock = buildCacheMock({ roles: ['admin'], permissions: [], menus: [] });
        const service = new MeService(prisma, cacheMock);
        const dataloaders = buildDataLoaders(prisma);

        const result = await service.getAdminMe('acc-1', dataloaders);

        // 断言：permissions 包含角色权限 + grant 进来的码
        expect(result.permissions).toContain('iam:user:list');
        expect(result.permissions).toContain('iam:admin:delete');
        // 关键：dataloader 路径下确实调了 adminAccountMenu.findMany
        expect(prisma.client.adminAccountMenu.findMany).toHaveBeenCalled();
    });

    it('场景2：Cache 路径 — 张三有角色权限 + grant 的码也应出现在 permissions 里（fallback 兜底）', async () => {
        // 准备 cache 返回的 authData 包含合并后的完整 permissions
        const cacheMock = buildCacheMock({
            roles: ['admin'],
            permissions: ['iam:user:list', 'iam:admin:delete'], // cache 已含 grant
            menus: [],
        });
        const prisma = buildPrismaMock({ roleLinks: [], overrideLinks: [] });
        const service = new MeService(prisma, cacheMock);

        // 不传 dataloaders → 走 cache fallback 路径
        const result = await service.getAdminMe('acc-1');

        expect(result.permissions).toContain('iam:user:list');
        expect(result.permissions).toContain('iam:admin:delete');
    });

    it('场景3：deny 覆盖 — 角色有的权限被 deny 后应被移除', async () => {
        // 张三角色有 [iam:user:list, iam:role:list]，deny 移除 iam:user:list
        const roleLinks = [
            {
                accountId: 'acc-1',
                role: {
                    enabled: true,
                    roleMenus: [
                        { menu: { enabled: true, permissionCode: 'iam:user:list' } },
                        { menu: { enabled: true, permissionCode: 'iam:role:list' } },
                    ],
                },
            },
        ];
        const overrideLinks = [
            {
                accountId: 'acc-1',
                type: 'deny',
                menu: { enabled: true, permissionCode: 'iam:user:list' },
            },
        ];
        const prisma = buildPrismaMock({ roleLinks, overrideLinks });
        const cacheMock = buildCacheMock({ roles: ['admin'], permissions: [], menus: [] });
        const service = new MeService(prisma, cacheMock);
        const dataloaders = buildDataLoaders(prisma);

        const result = await service.getAdminMe('acc-1', dataloaders);

        // deny 后只剩 role:list
        expect(result.permissions).toContain('iam:role:list');
        expect(result.permissions).not.toContain('iam:user:list');
    });

    it('场景4：未授权 grant（菜单已禁用）— 不应出现在 permissions 里', async () => {
        const roleLinks = [
            {
                accountId: 'acc-1',
                role: {
                    enabled: true,
                    roleMenus: [{ menu: { enabled: true, permissionCode: 'iam:user:list' } }],
                },
            },
        ];
        // 菜单被禁用 → grant 应被忽略
        const overrideLinks = [
            {
                accountId: 'acc-1',
                type: 'grant',
                menu: { enabled: false, permissionCode: 'iam:admin:delete' },
            },
        ];
        const prisma = buildPrismaMock({ roleLinks, overrideLinks });
        const cacheMock = buildCacheMock({ roles: ['admin'], permissions: [], menus: [] });
        const service = new MeService(prisma, cacheMock);
        const dataloaders = buildDataLoaders(prisma);

        const result = await service.getAdminMe('acc-1', dataloaders);

        expect(result.permissions).toContain('iam:user:list');
        expect(result.permissions).not.toContain('iam:admin:delete'); // 禁用菜单的 grant 忽略
    });
});
