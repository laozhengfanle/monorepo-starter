import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';
import { CACHE_KEYS } from '../../common/cache/cache-key.constants.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { aggregatePermissions } from '../../common/utils/aggregate-permissions.js';
import { buildMenuTree, FlatMenu, MenuNode } from '../../common/utils/build-menu-tree.js';

/**
 * 账户认证缓存数据结构
 * - roles：账户拥有的角色编码列表
 * - permissions：聚合后的权限码列表
 * - menus：构建好的菜单树
 * - menuVersion：缓存被构建时的菜单数据版本号
 *   - 读时与「当前版本号」（mono:data:menu_version）比对
 *   - 不一致 → 视为脏数据 → 删账户级缓存 → 重建（懒失效）
 *   - 这是「声明式失效」的最后兜底，详见 docs/缓存设计.md
 */
export interface AuthCacheData {
    roles: string[];
    permissions: string[];
    menus: MenuNode[];
    menuVersion: number;
}

/** 角色级缓存 TTL：30 分钟（与缓存设计.md 一致） */
const ROLE_TTL = 1800;
/** 账户级缓存 TTL：30 分钟 */
const ACCOUNT_TTL = 1800;
/** 防雪崩缩短 TTL：5 分钟 */
const AVALANCHE_TTL = 300;

/**
 * 管理端权限缓存服务 — Redis 二级缓存
 *
 * 二级缓存设计：
 * - Level 1（角色级）：权限码集合、扁平菜单列表、账户 ID 列表
 * - Level 2（账户级）：聚合后的认证数据（角色 + 权限 + 菜单树）
 *
 * 缓存失效策略：
 * - 角色变更 → 失效角色级缓存 + 级联失效该角色下所有账户缓存
 * - 菜单结构变更 → 批量失效所有角色级缓存 + 账户缓存缩短 TTL 防雪崩
 * - 账户权限变更 → 仅失效该账户缓存
 *
 * ⚠️ 所有角色/菜单/账户的写操作必须通过 Service 层（AdminRoleService / AdminAccountService / AdminMenuService），
 * 直接操作 DB（Prisma / SQL）不会触发缓存失效，会导致脏读。
 * 如果确实需要直写 DB，写完后必须手动调用对应的 invalidate*() 方法或清除 Redis 对应 key。
 */
@Injectable()
export class AdminPermissionCacheService {
    private readonly logger = new Logger(AdminPermissionCacheService.name);

    constructor(
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly prisma: PrismaService,
    ) {}

    /**
     * 构造认证数据缓存 Key
     * - 格式：mono:auth:{accountId}
     */
    private authKey(accountId: string): string {
        return `${CACHE_KEYS.AUTH_RESULT}:${accountId}`;
    }

    /**
     * 获取当前菜单数据版本号
     * - 读 mono:data:menu_version（无 key 时返回 0）
     * - 与 AuthCacheData.menuVersion 比对决定是否走懒失效
     */
    async getCurrentMenuVersion(): Promise<number> {
        const v = await this.cacheService.get<number>(CACHE_KEYS.MENU_VERSION);
        return v ?? 0;
    }

    /**
     * 菜单数据版本号 +1（懒失效触发器）
     * - 由 AdminMenuService.create/update/delete 调
     * - INCR 原子，O(1)
     * - 下次 getAccountAuth 发现版本不一致 → 自动重建（不需要命令式 del）
     *
     * 注意：bump 是「最终保险」，不要去掉 invalidateMenuStructure()，
     * 主动失效能让用户在下一次请求就看到新数据（无延迟），
     * bump 只是保证「万一有人忘了调 invalidate，30 分钟内也能自愈」
     */
    async bumpMenuVersion(): Promise<number> {
        const next = await this.cacheService.incr(CACHE_KEYS.MENU_VERSION);
        this.logger.log(`菜单版本号已 bump → ${next}`);
        return next;
    }

    /**
     * 构造角色权限码缓存 Key
     * - 格式：mono:role:permission:admin:{roleCode}
     */
    private rolePermKey(roleCode: string): string {
        return `${CACHE_KEYS.ROLE_PERM}:admin:${roleCode}`;
    }

    /**
     * 构造角色菜单缓存 Key
     * - 格式：mono:role:menus:admin:{roleCode}
     */
    private roleMenusKey(roleCode: string): string {
        return `${CACHE_KEYS.ROLE_MENUS}:admin:${roleCode}`;
    }

    /**
     * 构造角色账户映射缓存 Key
     * - 格式：mono:role:accounts:admin:{roleCode}
     */
    private roleAccountsKey(roleCode: string): string {
        return `${CACHE_KEYS.ROLE_ACCOUNTS}:admin:${roleCode}`;
    }

    /**
     * 获取账户认证缓存数据
     * - 命中 → 检查菜单版本号 → 一致则返回，不一致则删除并重建（懒失效）
     * - 未命中 → 调用 buildAccountAuth 重建缓存
     *
     * 懒失效（lazy invalidation）：
     *   - 这是「声明式失效」的核心：写路径不记得调 invalidateMenuStructure 也无所谓
     *   - 只要 AdminMenuService 调了 bumpMenuVersion()，所有账户级缓存下次访问时
     *     自动发现版本不一致 → 删除并重建
     *   - 详见 docs/缓存设计.md「声明式失效：数据版本号」一节
     */
    async getAccountAuth(accountId: string): Promise<AuthCacheData | null> {
        const cacheKey = this.authKey(accountId);
        const cached = await this.cacheService.get<AuthCacheData>(cacheKey);
        if (cached) {
            // 版本号比对：缓存构建时的 menuVersion vs 当前版本号
            // - 一致 → 缓存有效，直接返回（快路径）
            // - 不一致 → 缓存脏了，删掉并走重建
            // - 旧缓存（无 menuVersion 字段）→ 视为 0，与非零当前版本比对必失败 → 自动重建
            const currentVersion = await this.getCurrentMenuVersion();
            if (cached.menuVersion !== currentVersion) {
                this.logger.log(
                    `账户缓存菜单版本不一致 (cached=${cached.menuVersion}, current=${currentVersion})，触发懒失效: accountId=${accountId}`,
                );
                await this.cacheService.del(cacheKey);
                return this.buildAccountAuth(accountId);
            }
            return cached;
        }
        // 缓存未命中，重建账户认证数据
        return this.buildAccountAuth(accountId);
    }

    /**
     * 构建并缓存账户认证数据
     *
     * 流程：
     * 1. 查询账户角色及角色菜单
     * 2. 查询账户额外权限覆盖
     * 3. 逐角色读取角色级缓存，miss 时从 DB 重建
     * 4. 聚合权限码 + 构建菜单树
     * 5. 写入账户级缓存（30 分钟 TTL）
     * 6. 更新角色 → 账户映射
     */
    async buildAccountAuth(accountId: string): Promise<AuthCacheData> {
        // 查询账户角色（含角色菜单，只查启用角色，与 Guard 的 _buildAccountAuth 保持一致）
        const accountRoles = await this.prisma.client.adminAccountRole.findMany({
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

        // 查询账户额外权限覆盖
        const accountMenus = await this.prisma.client.adminAccountMenu.findMany({
            where: { accountId },
            include: { menu: true },
        });

        // 收集所有角色编码
        const roleCodes: string[] = [];
        // 收集所有角色的菜单数据（用于聚合权限和构建菜单树）
        const allRoleMenus: Array<{ roleMenus: Array<{ menu: { permissionCode: string } }> }> = [];
        // 收集所有扁平菜单（用于构建菜单树）
        const allFlatMenus: FlatMenu[] = [];

        // 批量构建缓存 key 列表
        const permKeys: string[] = [];
        const menusKeys: string[] = [];

        for (const ar of accountRoles) {
            const role = ar.role;
            roleCodes.push(role.code);
            permKeys.push(this.rolePermKey(role.code));
            menusKeys.push(this.roleMenusKey(role.code));
        }

        // 批量读取角色级缓存（一次 mget 替代 N 次 get，减少 Redis 往返）
        const [cachedPerms, cachedMenus] = await Promise.all([
            this.cacheService.mget<string[]>(permKeys),
            this.cacheService.mget<FlatMenu[]>(menusKeys),
        ]);

        for (let i = 0; i < accountRoles.length; i++) {
            const role = accountRoles[i].role;
            let cachedPermissions = cachedPerms[i];
            let cachedFlatMenus = cachedMenus[i];

            // 角色缓存未命中，从 DB 数据构建并写入缓存
            if (cachedPermissions === null || cachedFlatMenus === null) {
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

                // 写入角色级缓存（TTL 30 分钟）
                await this.cacheService.setex(permKeys[i], ROLE_TTL, cachedPermissions);
                await this.cacheService.setex(menusKeys[i], ROLE_TTL, cachedFlatMenus);
            }

            allRoleMenus.push({
                roleMenus: cachedPermissions.map((code) => ({
                    menu: { permissionCode: code },
                })),
            });

            allFlatMenus.push(...cachedFlatMenus);
        }

        // 聚合权限码：角色权限 + 账户覆盖（grant 追加，deny 移除）
        const overrides = accountMenus.map((am) => ({
            menu: { permissionCode: am.menu.permissionCode ?? '' },
            type: am.type as 'grant' | 'deny',
        }));
        const permissions = aggregatePermissions(allRoleMenus, overrides);

        // 扁平菜单去重（按 id）
        const uniqueFlatMenus = [...new Map(allFlatMenus.map((m) => [m.id, m])).values()];

        // 构建菜单树
        const menus = buildMenuTree(uniqueFlatMenus);

        // 组装认证数据（嵌入当前菜单版本号，用于读时校验）
        const currentMenuVersion = await this.getCurrentMenuVersion();
        const authData: AuthCacheData = {
            roles: roleCodes,
            permissions,
            menus,
            menuVersion: currentMenuVersion,
        };

        // 写入账户级缓存（30 分钟 TTL）
        const authCacheKey = this.authKey(accountId);
        await this.cacheService.setex(authCacheKey, ACCOUNT_TTL, authData);

        // 更新每个角色的账户映射（用于角色变更时级联失效，使用原子操作）
        for (const roleCode of roleCodes) {
            await this.addAccountToRole(roleCode, accountId);
        }

        this.logger.log(
            `账户认证缓存已构建: accountId=${accountId}, roles=[${roleCodes.join(',')}], menuVersion=${currentMenuVersion}`,
        );
        return authData;
    }

    /**
     * 失效单个账户的认证缓存
     * - 用于账户权限变更场景
     */
    async invalidateAccount(accountId: string): Promise<void> {
        const cacheKey = this.authKey(accountId);
        await this.cacheService.del(cacheKey);
        this.logger.log(`账户认证缓存已失效: accountId=${accountId}`);
    }

    /**
     * 失效角色级缓存 + 级联失效该角色下所有账户缓存
     * - 用于角色权限变更场景
     *
     * 流程：
     * 1. 删除角色权限码缓存
     * 2. 删除角色菜单缓存
     * 3. 读取该角色下的账户 ID 列表
     * 4. 批量删除这些账户的认证缓存
     */
    async invalidateRole(roleCode: string): Promise<void> {
        // 删除角色级缓存
        await this.cacheService.del(this.rolePermKey(roleCode));
        await this.cacheService.del(this.roleMenusKey(roleCode));

        // 读取该角色关联的账户 ID 列表
        const accountsCacheKey = this.roleAccountsKey(roleCode);
        const accountIds: string[] | null = await this.cacheService.get<string[]>(accountsCacheKey);

        if (accountIds && accountIds.length > 0) {
            // 批量删除关联账户的认证缓存（一次 DEL 多个 key）
            await this.cacheService.delMany(accountIds.map((id) => this.authKey(id)));
            this.logger.log(`角色缓存已失效: roleCode=${roleCode}, 级联失效 ${accountIds.length} 个账户缓存`);
        } else {
            this.logger.log(`角色缓存已失效: roleCode=${roleCode}, 无关联账户`);
        }
    }

    /**
     * 失效所有角色级缓存 + 账户缓存缩短 TTL 防雪崩
     * - 用于菜单结构变更场景（如菜单新增、删除、排序调整）
     *
     * 防雪崩策略：
     * - 角色级缓存直接删除
     * - 账户级缓存不立即删除，而是缩短 TTL 到 5 分钟
     * - 避免大量请求同时穿透到 DB
     */
    async invalidateMenuStructure(): Promise<void> {
        // 批量删除管理端角色级权限码缓存
        await this.cacheService.delByPattern(`${CACHE_KEYS.ROLE_PERM}:admin:*`);
        // 批量删除管理端角色级菜单缓存
        await this.cacheService.delByPattern(`${CACHE_KEYS.ROLE_MENUS}:admin:*`);
        // 账户级缓存缩短 TTL 到 5 分钟，防止缓存雪崩
        await this.cacheService.setTtlByPattern(`${CACHE_KEYS.AUTH_RESULT}:*`, AVALANCHE_TTL);

        this.logger.log('菜单结构变更，已失效所有角色级缓存，账户级缓存 TTL 缩短至 5 分钟');
    }

    /**
     * 更新角色的账户映射
     * - 用于角色分配/取消分配账户时更新映射关系
     * - 先删除旧映射，再写入新映射
     */
    async updateRoleAccounts(roleCode: string, accountIds: string[]): Promise<void> {
        const cacheKey = this.roleAccountsKey(roleCode);
        // 先删除旧映射
        await this.cacheService.del(cacheKey);
        // 写入新映射
        if (accountIds.length > 0) {
            await this.cacheService.setex(cacheKey, ROLE_TTL, accountIds);
        }
        this.logger.log(`角色账户映射已更新: roleCode=${roleCode}, accountCount=${accountIds.length}`);
    }

    /**
     * Lua 脚本：原子追加账户 ID 到角色映射
     * KEYS[1] = 角色账户映射 key
     * ARGV[1] = 要添加的 accountId
     * ARGV[2] = TTL（秒）
     * 返回：映射中的账户总数
     *
     * 注意：不使用 cjson（Redis 可能未编译），改用字符串操作
     */
    private static readonly SADD_ACCOUNT_LUA = `
        local current = redis.call('GET', KEYS[1])
        local accountId = ARGV[1]
        local ttl = ARGV[2]

        if current == false then
            -- 不存在的 key，创建新数组
            redis.call('SETEX', KEYS[1], ttl, '["' .. accountId .. '"]')
            return 1
        end

        -- 检查是否已包含此 accountId（纯文本匹配，禁用模式）
        if string.find(current, '"' .. accountId .. '"', 1, true) then
            -- 已存在，计数当前条目
            local _, count = string.gsub(current, '"([^"]*)"', '')
            return count
        end

        -- 追加：去掉末尾 ']'，补逗号+新ID+']'
        local updated = string.sub(current, 1, -2) .. ',"' .. accountId .. '"]'
        redis.call('SETEX', KEYS[1], ttl, updated)
        local _, count = string.gsub(updated, '"([^"]*)"', '')
        return count
    `;

    /**
     * 将账户 ID 添加到角色的账户映射中（内部方法）
     * - 使用 Lua 脚本保证 read→append→write 的原子性
     * - 防并发场景下追加丢失
     */
    private async addAccountToRole(roleCode: string, accountId: string): Promise<void> {
        const cacheKey = this.roleAccountsKey(roleCode);
        await this.cacheService.evalLua(
            AdminPermissionCacheService.SADD_ACCOUNT_LUA,
            [cacheKey],
            [accountId, ROLE_TTL],
            async () => {
                // 内存 fallback：单线程无竞态
                const existing: string[] | null = await this.cacheService.get<string[]>(cacheKey);
                const accountIds = existing ? [...existing, accountId] : [accountId];
                const uniqueIds = [...new Set(accountIds)];
                await this.cacheService.setex(cacheKey, ROLE_TTL, uniqueIds);
                return uniqueIds.length;
            },
        );
    }
}
