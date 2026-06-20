/**
 * 账户认证数据构建器（Guard 和 CacheService 共同复用）
 *
 * 背景：
 * - AdminPermissionGuard 在 AppModule 全局注册，无法注入 AdminModule 的 AdminPermissionCacheService
 * - 早期 Guard 自行实现了一份简化的 _buildAccountAuth，但漏查了 adminAccountMenu 表，
 *   导致账户级 grant/deny 特例授权在缓存 miss 重建时丢失
 * - 抽出此纯函数后，Guard 和 CacheService 都通过同一份实现，避免再次走偏
 *
 * 行为：
 * - 与 admin-permission-cache.service.ts 原 buildAccountAuth 行为完全一致
 * - 包含：查角色 → 查账户覆盖 → 角色级 L1 缓存命中判定 → 聚合权限 → 构建菜单树 → 写账户级缓存
 *
 * 错误处理：
 * - 任何 DB / Redis 异常都会被捕获并返回 { authData: null, roleCodes: [] }
 * - 由调用方决定是拒绝访问（Guard）还是抛错（Service）
 */
import { Logger } from '@nestjs/common';
import { CACHE_KEYS } from './cache-key.constants.js';
import type { ICacheService } from './cache.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { aggregatePermissions } from '../utils/aggregate-permissions.js';
import { buildMenuTree, type FlatMenu, type MenuNode } from '../utils/build-menu-tree.js';

/**
 * 账户认证缓存数据结构
 * - roles：账户拥有的角色编码列表
 * - permissions：聚合后的权限码列表（角色权限 + grant - deny）
 * - menus：构建好的菜单树
 */
export interface AuthCacheData {
    roles: string[];
    permissions: string[];
    menus: MenuNode[];
}

/** 角色级缓存 TTL：30 分钟 */
export const ROLE_TTL = 1800;
/** 账户级缓存 TTL：30 分钟 */
export const ACCOUNT_TTL = 1800;

/** 角色级缓存 key 中的用户类型段（admin / member） */
export type BuilderUserType = 'admin' | 'member';

/** buildAccountAuth 函数入参 */
export interface BuildAccountAuthParams {
    /** PrismaService 实例（带扩展的 client） */
    prisma: PrismaService;
    /** 缓存服务（ICacheService） */
    cacheService: ICacheService;
    /** 目标账户 ID */
    accountId: string;
    /**
     * 角色级缓存 key 使用的 userType 段
     * - 'admin' → mono:role:permission:admin:{code} / mono:role:menus:admin:{code}
     * - 'member' → mono:role:permission:member:{code} / mono:role:menus:member:{code}
     * - 默认 'admin'，因为目前只有 Guard 和 AdminCacheService 调用
     */
    userType?: BuilderUserType;
    /** 日志上下文名（用于区分调用方来源，默认 AccountAuthBuilder） */
    logContext?: string;
}

/** buildAccountAuth 函数返回值 */
export interface BuildAccountAuthResult {
    /** 构建好的认证数据；任何异常时返回 null */
    authData: AuthCacheData | null;
    /** 涉及的角色编码列表（用于角色级失效等场景；异常时返回空数组） */
    roleCodes: string[];
}

/**
 * 重建账户认证数据（Guard 和 CacheService 共同复用）
 *
 * 步骤：
 * 1. 查询账户角色（含角色菜单，只查启用角色）
 * 2. 查询账户级权限覆盖（grant/deny）— 修复点：早期 Guard 完全没查这张表
 * 3. 逐角色读取角色级 L1 缓存，miss 时从 DB 重建并回填
 * 4. 聚合权限码：角色权限 + grant 追加 - deny 移除
 * 5. 扁平菜单去重（按 id）+ 构建菜单树
 * 6. 写入账户级 L2 缓存（30 分钟 TTL）
 *
 * 注意：不会更新 role→account 映射（Lua 原子追加），那是 CacheService 的额外职责，
 * Guard 调用方不需要管理这个映射。
 */
export async function buildAccountAuth(params: BuildAccountAuthParams): Promise<BuildAccountAuthResult> {
    const { prisma, cacheService, accountId, userType = 'admin', logContext = 'AccountAuthBuilder' } = params;
    const logger = new Logger(logContext);

    try {
        /** 1. 查询账户角色（含角色菜单，只查启用角色） */
        const accountRoles = await prisma.client.adminAccountRole.findMany({
            where: { accountId, role: { enabled: true } },
            include: {
                role: {
                    include: {
                        roleMenus: {
                            include: {
                                menu: true,
                            },
                        },
                    },
                },
            },
        });

        /** 2. 查询账户级权限覆盖（grant/deny） */
        const accountMenus = await prisma.client.adminAccountMenu.findMany({
            where: { accountId },
            include: { menu: true },
        });

        /** 3. 收集角色编码 + 准备角色级缓存 key 列表 */
        const roleCodes: string[] = [];
        /** 角色聚合输入：每个角色包含自己的 roleMenus（仅有 permissionCode 即可） */
        const allRoleMenus: Array<{ roleMenus: Array<{ menu: { permissionCode: string } }> }> = [];
        /** 扁平菜单（多角色合并） */
        const allFlatMenus: FlatMenu[] = [];

        const permKeys: string[] = [];
        const menusKeys: string[] = [];
        for (const ar of accountRoles) {
            const role = ar.role;
            roleCodes.push(role.code);
            permKeys.push(`${CACHE_KEYS.ROLE_PERM}:${userType}:${role.code}`);
            menusKeys.push(`${CACHE_KEYS.ROLE_MENUS}:${userType}:${role.code}`);
        }

        /** 4. 批量读取角色级 L1 缓存（一次 mget 替代 N 次 get，减少 Redis 往返） */
        const [cachedPerms, cachedMenus] = await Promise.all([
            cacheService.mget<string[]>(permKeys),
            cacheService.mget<FlatMenu[]>(menusKeys),
        ]);

        for (let i = 0; i < accountRoles.length; i++) {
            const role = accountRoles[i].role;
            let cachedPermissions = cachedPerms[i];
            let cachedFlatMenus = cachedMenus[i];

            /** 角色缓存未命中，从 DB 数据构建并回填 */
            if (cachedPermissions == null || cachedFlatMenus == null) {
                const dbPermissions: string[] = [];
                const dbFlatMenus: FlatMenu[] = [];

                for (const rm of role.roleMenus) {
                    const menu = rm.menu;
                    if (menu.permissionCode) {
                        dbPermissions.push(menu.permissionCode);
                    }
                    dbFlatMenus.push({
                        id: menu.id,
                        parentId: menu.parentId,
                        name: menu.name,
                        type: menu.type,
                        path: menu.path ?? undefined,
                        routeName: menu.routeName ?? undefined,
                        component: menu.component ?? undefined,
                        icon: menu.icon ?? undefined,
                        permissionCode: menu.permissionCode ?? undefined,
                        sort: menu.sort,
                        visible: menu.visible,
                        keepAlive: menu.keepAlive,
                        enabled: menu.enabled,
                        activeMenuId: menu.activeMenuId ?? undefined,
                    });
                }

                cachedPermissions = [...new Set(dbPermissions)];
                cachedFlatMenus = dbFlatMenus;

                /** 写入角色级 L1 缓存（30 分钟 TTL） */
                await cacheService.setex(permKeys[i], ROLE_TTL, cachedPermissions);
                await cacheService.setex(menusKeys[i], ROLE_TTL, cachedFlatMenus);
            }

            /** 把角色级权限码转换成 aggregatePermissions 期望的格式 */
            allRoleMenus.push({
                roleMenus: cachedPermissions.map((code) => ({
                    menu: { permissionCode: code },
                })),
            });

            allFlatMenus.push(...cachedFlatMenus);
        }

        /** 5. 聚合权限码：角色权限 + grant 追加 - deny 移除 */
        const overrides = accountMenus.map((am) => ({
            menu: { permissionCode: am.menu.permissionCode ?? '' },
            type: am.type as 'grant' | 'deny',
        }));
        const permissions = aggregatePermissions(allRoleMenus, overrides);

        /** 6. 扁平菜单按 id 去重（多角色关联同一菜单只保留一份） */
        const uniqueFlatMenus = [...new Map(allFlatMenus.map((m) => [m.id, m])).values()];

        /** 7. 构建菜单树 */
        const menus = buildMenuTree(uniqueFlatMenus);

        /** 8. 组装认证数据 */
        const authData: AuthCacheData = {
            roles: roleCodes,
            permissions,
            menus,
        };

        /** 9. 写入账户级 L2 缓存（30 分钟 TTL） */
        const authCacheKey = `${CACHE_KEYS.AUTH_RESULT}:${accountId}`;
        await cacheService.setex(authCacheKey, ACCOUNT_TTL, authData);

        return { authData, roleCodes };
    } catch (err) {
        /** 异常时不抛出，返回 null，让调用方决定降级策略（Guard 拒绝访问 / Service 上抛） */
        logger.error(`重建账户认证数据失败: accountId=${accountId}`, err);
        return { authData: null, roleCodes: [] };
    }
}
