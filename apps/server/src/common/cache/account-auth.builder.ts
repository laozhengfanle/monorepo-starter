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
 * Prisma AdminMenu 记录 → FlatMenu（与 build-menu-tree 输入格式对齐）
 * - 内部 helper，避免外部 AdminMenu 转换逻辑重复实现
 * - 字段映射：null → undefined，permissionCode null → undefined
 */
function toFlatMenu(m: {
    id: string;
    parentId: string | null;
    name: string;
    type: string;
    path: string | null;
    routeName: string | null;
    component: string | null;
    icon: string | null;
    permissionCode: string | null;
    sort: number;
    visible: boolean;
    keepAlive: boolean;
    enabled: boolean;
    activeMenuId: string | null;
}): FlatMenu {
    return {
        id: m.id,
        parentId: m.parentId,
        name: m.name,
        type: m.type,
        path: m.path ?? undefined,
        routeName: m.routeName ?? undefined,
        component: m.component ?? undefined,
        icon: m.icon ?? undefined,
        permissionCode: m.permissionCode ?? undefined,
        sort: m.sort,
        visible: m.visible,
        keepAlive: m.keepAlive,
        enabled: m.enabled,
        activeMenuId: m.activeMenuId ?? undefined,
    };
}

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
                    dbFlatMenus.push(toFlatMenu(menu));
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
        let permissions = aggregatePermissions(allRoleMenus, overrides);

        /**
         * 5.5 grant 进去的「可见菜单节点」+ 它们的整棵子树
         *
         * 业务背景：
         * - 早期实现只把 grant 视为「权限码合并」，没动菜单树
         * - 后果：给张三 grant 一个 menu 节点 → 权限码生效，但侧边栏没这个菜单
         *   → 用户根本进不去页面，按钮即使能显示也看不到
         * - 早期 bug：grant button 只合入权限码，不加入菜单树 → 个人中心/侧边栏看不到 button
         *
         * 修复逻辑：
         * - 收集 adminAccountMenu 里 type='grant' 且 menu.type 是 'menu' / 'directory' 的节点
         * - BFS 拉这些节点的整棵子树（menu + directory），全加入扁平菜单
         * - 收集 grant 的 button 节点，加入扁平菜单（button 无子树，只加自己）
         * - BFS 拉祖先链（menu/directory/button 的父链都要拉，否则 buildMenuTree 找不到 parent 变孤儿）
         * - 角色菜单去重后用（set + map 双重去重，避免重复）
         *
         * 边界：
         * - 只拉 enabled 节点（disabled 节点不应出现在用户菜单树里）
         * - 重复 BFS 已访问的 id 跳过（防环 + 防冗余）
         */
        const grantMenuNodes = accountMenus.filter(
            (am) => am.type === 'grant' && (am.menu.type === 'menu' || am.menu.type === 'directory') && am.menu.enabled,
        );
        // grant button 节点：只加自己进菜单树，不拉子树（button 没子节点）
        const grantButtonNodes = accountMenus.filter(
            (am) => am.type === 'grant' && am.menu.type === 'button' && am.menu.enabled,
        );
        if (grantMenuNodes.length > 0 || grantButtonNodes.length > 0) {
            const seenMenuIds = new Set<string>(allFlatMenus.map((m) => m.id));

            /**
             * 第一遍 BFS：拉子树（grant 节点的 menu/directory descendants）
             * - 业务：grant 一个 menu = 该 menu 可见，子 menu/directory 也可见
             * - 不拉 button：button 权限码只通过显式 grant 生效，不因 grant 父 menu 自动获得
             * - 避免"grant 管理员管理 menu → 自动获得删除管理员 button 权限"的问题
             */
            const queue: string[] = [];
            for (const am of grantMenuNodes) {
                if (!seenMenuIds.has(am.menu.id)) {
                    allFlatMenus.push(toFlatMenu(am.menu));
                    seenMenuIds.add(am.menu.id);
                }
                queue.push(am.menu.id);
            }
            while (queue.length > 0) {
                const parentIds = queue.splice(0, queue.length);
                const children = await prisma.client.adminMenu.findMany({
                    where: { parentId: { in: parentIds }, type: { in: ['menu', 'directory'] } },
                });
                for (const child of children) {
                    if (!seenMenuIds.has(child.id)) {
                        seenMenuIds.add(child.id);
                        if (child.enabled) {
                            allFlatMenus.push(toFlatMenu(child));
                        }
                        queue.push(child.id);
                    }
                }
            }

            /**
             * 第二步：grant button 节点加入扁平菜单
             * - 业务：grant 的 button 需要在个人中心/权限列表展示
             * - button 无子树，只加自己
             */
            for (const am of grantButtonNodes) {
                if (!seenMenuIds.has(am.menu.id)) {
                    allFlatMenus.push(toFlatMenu(am.menu));
                    seenMenuIds.add(am.menu.id);
                }
            }

            /**
             * 第三遍 BFS：拉祖先链（grant 节点的所有 ancestors）
             * - 业务：grant 一个深层 menu/button，必须把它的 directory 父链也显示出来
             *   否则 buildMenuTree 找不到 parent，该节点会成为孤儿被丢弃
             * - 例如 grant 了「新增管理员」button，必须把父 menu「管理员管理」拉出来
             * - 已存在的（角色菜单里就有）会通过 seenMenuIds 去重跳过
             * - disabled 祖先也跳过（与子树策略一致：disabled 节点不进用户菜单）
             */
            const ancestorQueue: string[] = [
                ...grantMenuNodes.map((am) => am.menu.parentId),
                ...grantButtonNodes.map((am) => am.menu.parentId),
            ].filter((pid): pid is string => pid !== null && pid !== undefined);
            while (ancestorQueue.length > 0) {
                const parentIds = ancestorQueue.splice(0, ancestorQueue.length);
                const newIds = parentIds.filter((id) => !seenMenuIds.has(id));
                if (newIds.length === 0) continue;
                const parents = await prisma.client.adminMenu.findMany({
                    where: { id: { in: newIds } },
                });
                for (const p of parents) {
                    seenMenuIds.add(p.id);
                    if (p.enabled) {
                        allFlatMenus.push(toFlatMenu(p));
                    }
                    /** 继续向上爬（不管 enabled：父链可能跨多层 disabled 但子节点仍合法） */
                    if (p.parentId) {
                        ancestorQueue.push(p.parentId);
                    }
                }
            }

            /** 重新聚合 permissions（overrides 期间追加了子树 button 权限码） */
            permissions = aggregatePermissions(allRoleMenus, overrides);
        }

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
