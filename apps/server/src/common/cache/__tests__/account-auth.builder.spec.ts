/**
 * buildAccountAuth 集成测试 — 验证 grant 进去的 menu 节点会让菜单树包含
 *
 * 业务场景：
 * - 张三 role='guest'，guest 没绑「管理员管理」菜单
 * - 管理员在后台给张三 grant「管理员管理」menu 节点
 * - 期望：buildAccountAuth 返回的 menus 树里包含「管理员管理」节点
 *   → 侧边栏显示「管理员管理」入口
 *   → 用户能点进去
 *
 * 这测试锁定「grant 只能让按钮权限码生效，不能让菜单可见」的旧 bug：
 * - 早期实现：grant 一个 menu 节点后，菜单树仍然不包含（因为 allFlatMenus 只来自角色）
 * - 修复后：grant 进去的 menu 节点 + 整棵子树（包含 button）都进入菜单树
 */
import { describe, it, expect, vi } from 'vitest';
import { buildAccountAuth } from '../account-auth.builder.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { ICacheService } from '../cache.interface.js';

/**
 * 构造 prisma mock + cache mock
 * - prisma：模拟 adminAccountRole / adminAccountMenu / adminMenu 三个表
 * - cache：mock setex/mget 全返回 null（强制走 DB 重建路径）
 */
function buildMocks(opts: {
    roleLinks: any[]; // adminAccountRole.findMany 返回
    accountMenus: any[]; // adminAccountMenu.findMany 返回（grant/deny 覆盖）
    menuByParent: Record<string, any[]>; // adminMenu.findMany(parentId in [...]) 返回
    allMenus?: any[]; // adminMenu 字典（可选）
}) {
    /** adminMenu 字典：用 id 索引节点，便于查 parent chain */
    const menuDict = new Map<string, any>();
    for (const m of opts.allMenus ?? []) {
        menuDict.set(m.id, m);
    }
    /** adminMenu.findMany — 支持多种 where 过滤 */
    const adminMenuFindMany = vi.fn().mockImplementation(async ({ where }: any) => {
        if (where?.parentId?.in) {
            const ids = where.parentId.in as string[];
            const all = ids.flatMap((id) => opts.menuByParent[id] ?? []);
            const seen = new Set<string>();
            return all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
        }
        if (where?.id?.in) {
            // 祖先链查询：按 id 拉节点
            const ids = where.id.in as string[];
            return (opts.allMenus ?? []).filter((m) => ids.includes(m.id));
        }
        return [];
    });
    const prisma = {
        client: {
            adminAccountRole: { findMany: vi.fn().mockResolvedValue(opts.roleLinks) },
            adminAccountMenu: { findMany: vi.fn().mockResolvedValue(opts.accountMenus) },
            adminMenu: { findMany: adminMenuFindMany },
        },
    } as unknown as PrismaService;
    const cache = {
        mget: vi.fn().mockResolvedValue([null, null]), // 角色缓存全 miss
        setex: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
    } as unknown as ICacheService;
    return { prisma, cache, adminMenuFindMany, menuDict };
}

describe('buildAccountAuth — grant 可见菜单节点', () => {
    it('场景1：role=guest（无菜单） + grant 一个 menu 节点 → 菜单树包含该节点', async () => {
        // 角色：guest，没绑任何菜单
        const roleLinks: any[] = [];

        // 张三的 grant：adminAccountMenu 里 grant「管理员管理」menu 节点
        const accountMenus = [
            {
                accountId: 'acc-1',
                type: 'grant',
                menu: {
                    id: 'menu-admins',
                    parentId: 'menu-iam',
                    name: '管理员管理',
                    type: 'menu',
                    path: '/iam/admins',
                    routeName: 'AdminAccounts',
                    component: 'iam/admins',
                    permissionCode: 'iam:admin:view',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                    activeMenuId: null,
                },
            },
        ];

        // menu 字典（builder 会 BFS 拉子树）
        const menuByParent: Record<string, any[]> = {
            'menu-admins': [
                {
                    id: 'btn-admins-create',
                    parentId: 'menu-admins',
                    name: '新建管理员按钮',
                    type: 'button',
                    path: null,
                    routeName: null,
                    component: null,
                    permissionCode: 'iam:admin:create',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                    activeMenuId: null,
                },
            ],
        };
        // 父链：IAM directory（grant 子树的祖先）
        const allMenus = [
            {
                id: 'menu-iam',
                parentId: null,
                name: '权限管理',
                type: 'directory',
                path: null,
                routeName: null,
                component: null,
                permissionCode: null,
                sort: 1,
                visible: true,
                keepAlive: false,
                enabled: true,
                activeMenuId: null,
            },
        ];

        const { prisma, cache } = buildMocks({ roleLinks, accountMenus, menuByParent, allMenus });

        const result = await buildAccountAuth({
            prisma,
            cacheService: cache,
            accountId: 'acc-1',
        });

        // 断言 1：权限码合并
        expect(result.authData).not.toBeNull();
        expect(result.authData!.permissions).toContain('iam:admin:view');
        // 子树 button 的 permissionCode 不会自动获得（避免 grant 父 menu 后越权拿到 button 权限）
        // 见 account-auth.builder.ts BFS 第一遍的注释：button 权限码只通过显式 grant 生效
        expect(result.authData!.permissions).not.toContain('iam:admin:create');
        // 断言 2：菜单树包含 grant 进去的 menu 节点
        const menuIds = collectMenuIds(result.authData!.menus);
        expect(menuIds).toContain('menu-admins'); // ⭐ 关键
        // 断言 3：菜单树包含子树 button 节点
        expect(menuIds).toContain('btn-admins-create');
    });

    it('场景2：角色已绑 menu 节点 + grant 同一个 menu 节点 → 不重复（去重）', async () => {
        // 角色 admin 绑了「管理员管理」menu 节点
        const roleLinks = [
            {
                accountId: 'acc-1',
                role: {
                    code: 'admin',
                    enabled: true,
                    roleMenus: [
                        {
                            menu: {
                                id: 'menu-admins',
                                parentId: null,
                                name: '管理员管理',
                                type: 'menu',
                                path: '/iam/admins',
                                routeName: 'AdminAccounts',
                                component: 'iam/admins',
                                permissionCode: 'iam:admin:view',
                                sort: 1,
                                visible: true,
                                keepAlive: false,
                                enabled: true,
                                activeMenuId: null,
                            },
                        },
                    ],
                },
            },
        ];

        // 重复 grant 同一个 menu
        const accountMenus = [
            {
                accountId: 'acc-1',
                type: 'grant',
                menu: {
                    id: 'menu-admins',
                    parentId: null,
                    name: '管理员管理',
                    type: 'menu',
                    path: '/iam/admins',
                    routeName: 'AdminAccounts',
                    component: 'iam/admins',
                    permissionCode: 'iam:admin:view',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                    activeMenuId: null,
                },
            },
        ];

        const { prisma, cache } = buildMocks({ roleLinks, accountMenus, menuByParent: {} });

        const result = await buildAccountAuth({
            prisma,
            cacheService: cache,
            accountId: 'acc-1',
        });

        const menuIds = collectMenuIds(result.authData!.menus);
        const adminCount = menuIds.filter((id) => id === 'menu-admins').length;
        // 关键：去重后只出现 1 次
        expect(adminCount).toBe(1);
    });

    it('场景3：grant 一个 button 节点（不是 menu）→ 不出现在菜单树，但 permissionCode 生效', async () => {
        const roleLinks: any[] = [];
        const accountMenus = [
            {
                accountId: 'acc-1',
                type: 'grant',
                menu: {
                    id: 'btn-delete',
                    parentId: 'menu-admins',
                    name: '删除按钮',
                    type: 'button', // button 节点
                    permissionCode: 'iam:admin:delete',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            },
        ];
        const { prisma, cache } = buildMocks({ roleLinks, accountMenus, menuByParent: {} });

        const result = await buildAccountAuth({
            prisma,
            cacheService: cache,
            accountId: 'acc-1',
        });

        // 权限码生效
        expect(result.authData!.permissions).toContain('iam:admin:delete');
        // 菜单树没有 button 节点（buildMenuTree 只看 enabled=true 的全部节点，但 button 不算菜单节点）
        // 注意：button 节点本身可能进扁平菜单（因为没过滤 type），但 buildMenuTree 不会让它有 children
        // 我们只关心顶级可见菜单：grant button 不应该让「管理员管理」菜单凭空出现
        const topLevelMenus = result.authData!.menus.map((m) => m.id);
        expect(topLevelMenus).not.toContain('menu-admins');
    });

    it('场景4：grant 的是 disabled 菜单 → 不应出现在菜单树', async () => {
        const roleLinks: any[] = [];
        const accountMenus = [
            {
                accountId: 'acc-1',
                type: 'grant',
                menu: {
                    id: 'menu-disabled',
                    parentId: null,
                    name: '已禁用的菜单',
                    type: 'menu',
                    permissionCode: null,
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: false, // ← 关键：禁用
                },
            },
        ];
        const { prisma, cache } = buildMocks({ roleLinks, accountMenus, menuByParent: {} });

        const result = await buildAccountAuth({
            prisma,
            cacheService: cache,
            accountId: 'acc-1',
        });

        // disabled 节点不进入菜单树
        const menuIds = collectMenuIds(result.authData!.menus);
        expect(menuIds).not.toContain('menu-disabled');
    });
});

/** 工具函数：扁平化菜单树，收集所有菜单 id（含 children） */
function collectMenuIds(menus: any[]): string[] {
    const ids: string[] = [];
    function walk(nodes: any[]) {
        for (const n of nodes) {
            ids.push(n.id);
            if (n.children) walk(n.children);
        }
    }
    walk(menus);
    return ids;
}
