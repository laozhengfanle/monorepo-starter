/**
 * 管理端菜单服务
 *
 * 业务能力：
 * - 列表查询（扁平 / 树形）
 * - 菜单选项（扁平，用于角色分配弹窗）
 * - 创建（校验 parent 存在）
 * - 更新
 * - 删除（硬删除，检查无子节点，清理关联表）
 * - 缓存失效（写操作触发）
 * - 审计日志
 */
import { Injectable, ForbiddenException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { AdminPermissionCacheService } from '../admin-permission-cache.service.js';
import { AuditService, AUDIT_ACTIONS } from '../../audit/audit.service.js';
import { buildMenuTree, type FlatMenu, type MenuNode } from '../../../common/utils/build-menu-tree.js';
import { validateMenuPath } from '../../../common/menu/menu-path-validator.js';
import { ERROR_CODES } from '../../../common/errors/error-codes.js';
import type { AdminMenu, AdminMenuNode } from './admin-menu.type.js';
import type { AdminMenuModel, AdminMenuCreateInput } from '../../../../prisma/generated/models/AdminMenu.js';

@Injectable()
export class AdminMenuService {
    private readonly logger = new Logger(AdminMenuService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: AdminPermissionCacheService,
        private readonly auditService: AuditService,
    ) {}

    /**
     * 查询扁平菜单列表（用于菜单管理表格）
     */
    async findAll(): Promise<AdminMenu[]> {
        const menus = await this.prisma.client.adminMenu.findMany({
            orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        });
        return menus.map((m) => this.toAdminMenu(m));
    }

    /**
     * 查询完整菜单树（拼好的树形结构）
     * - 查所有菜单 → buildMenuTree 拼树
     */
    async findTree(): Promise<AdminMenuNode[]> {
        const flatMenus = await this.findAll();
        const tree = buildMenuTree(flatMenus.map((m) => this.toFlatMenu(m)));
        return tree.map((node) => this.toAdminMenuNode(node));
    }

    /**
     * 用 DataLoader 构建菜单树（GraphQL context 集成）
     * - 适用场景：menu.resolver.ts 调用，已注入 dataloader
     * - 与 findTree() 的区别：findTree 用 1 条 SQL 拉全表，findTreeByDataLoader 用 N+1 → 1 批量
     *   当菜单表很大（>1k 行）时，DataLoader 按需加载能减少首次查询的网络/序列化开销
     *   菜单表小（<200 行）时，findTree 反而更快
     * - 复用 findAll() 拿根节点（数据量小），再 dataloader.load(parentId) 逐层拉子节点
     *
     * @param menuLoader MenuDataLoader 实例（GraphQL context.dataloaders.menuByParentId）
     */
    async findTreeByDataLoader(menuLoader: {
        load: (parentId: string | null) => Promise<AdminMenuModel[]>;
    }): Promise<AdminMenuNode[]> {
        /** Step 1: 拉根节点（parentId IS NULL），数据量小，1 条 SQL */
        const roots = await this.findAll();
        const rootNodes = roots.filter((m) => m.parentId === undefined || m.parentId === null);
        if (rootNodes.length === 0) return [];

        /**
         * Step 2: 递归用 dataloader 拉子节点
         * - DataLoader 会把同帧内的 load() 合并成 1 条 SQL
         * - 树深一般 2-3 层，每层 1 条 SQL，远比 N+1 省
         * - loader 返回 Prisma 原始行（AdminMenuModel），递归前通过 toAdminMenu() 转为 GraphQL 类型
         */
        const buildNode = async (menu: AdminMenu): Promise<AdminMenuNode> => {
            const children = await menuLoader.load(menu.id);
            // children 是 Prisma 原始行（AdminMenuModel），转 GraphQL 后递归
            const childMenus = children.map((c) => this.toAdminMenu(c));
            const childNodes = await Promise.all(childMenus.map((c) => buildNode(c)));
            return {
                ...menu,
                // AdminMenu.parentId 是 string | undefined（GraphQL nullable）
                // AdminMenuNode.parentId 来自 AdminMenu，同为 string | undefined
                parentId: menu.parentId ?? undefined,
                createdAt: menu.createdAt,
                updatedAt: menu.updatedAt,
                children: childNodes,
            };
        };

        return Promise.all(rootNodes.map((r) => buildNode(r)));
    }

    /**
     * 扁平选项列表（用于角色分配弹窗中的菜单选择器）
     * - 不需要 children
     */
    async findOptions(): Promise<AdminMenu[]> {
        return this.findAll();
    }

    /**
     * 查询单个菜单
     */
    async findById(id: string): Promise<AdminMenu> {
        const menu = await this.prisma.client.adminMenu.findUnique({ where: { id } });
        if (!menu) {
            throw new NotFoundException('菜单不存在');
        }
        return this.toAdminMenu(menu);
    }

    /**
     * 创建菜单
     * - 如果传了 parentId，校验 parent 存在
     * @param operatorId 操作者账户 ID（用于审计日志）
     */
    async create(
        input: {
            parentId?: string | null;
            name: string;
            type: string;
            path?: string;
            routeName?: string;
            component?: string;
            icon?: string;
            permissionCode?: string;
            sort?: number;
            visible?: boolean;
            keepAlive?: boolean;
            enabled?: boolean;
        },
        operatorId?: string,
    ): Promise<AdminMenu> {
        /**
         * Zod schema 允许 parentId 为 null（前端编辑根菜单时传 null 表示"无父菜单"）
         * Prisma 的 parentId 字段是可选外键，null 和 undefined 语义相同（都不设置父菜单）
         * 这里把 null 统一转为 undefined，让 Prisma 正确处理
         */
        const prismaInput = { ...input, parentId: input.parentId ?? undefined };
        if (prismaInput.parentId) {
            const parent = await this.prisma.rawClient.adminMenu.findUnique({ where: { id: prismaInput.parentId } });
            if (!parent) {
                throw new BadRequestException({ code: 10004, message: '父菜单不存在' });
            }
        }

        /**
         * 菜单 path 白名单校验（防 XSS / 路径穿越 / 伪协议）
         * - 仅当传了 path 时校验（path 是 optional）
         * - 失败抛 10001 INVALID_PARAMS，沿用业务错误码
         */
        if (input.path !== undefined && input.path !== null && input.path !== '') {
            const result = validateMenuPath(input.path);
            if (!result.ok) {
                throw new BadRequestException({
                    code: ERROR_CODES.INVALID_PARAMS,
                    message: `菜单 path 非法: ${result.reason}`,
                });
            }
        }

        const menu = await this.prisma.client.adminMenu.create({ data: prismaInput as AdminMenuCreateInput });

        /**
         * 缓存失效（双保险）：
         * - invalidateMenuStructure()：主动失效，让现有用户立刻看到新菜单
         *   （虽然 create 时新菜单未赋给任何角色，理论上不影响现有权限，
         *   但未来如果有人做「新建菜单时自动赋给指定角色」，下游用户立即能看到）
         * - bumpMenuVersion()：懒失效兜底 ——
         *   主动失效万一漏调（seed / 直 SQL 写入等场景），版本号保证下次读时自动重建
         *   详见 docs/缓存设计.md「声明式失效：数据版本号」一节
         */
        await this.cacheService.invalidateMenuStructure();
        await this.cacheService.bumpMenuVersion();

        /**
         * 写审计日志（统一使用 AuditService）
         * 使用细粒度 MENU_CREATED：审计要能区分"创建菜单"vs"创建角色/账号"
         * 配合 detail.name/type 字段，可还原"创建了什么类型的菜单"
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.MENU_CREATED,
            resourceType: 'admin_menu',
            resourceId: menu.id,
            detail: { name: menu.name, type: menu.type },
        });

        return this.toAdminMenu(menu);
    }

    /**
     * 更新菜单
     * @param operatorId 操作者账户 ID（用于审计日志）
     */
    async update(
        id: string,
        data: {
            parentId?: string | null;
            name?: string;
            type?: string;
            path?: string;
            routeName?: string;
            component?: string;
            icon?: string;
            permissionCode?: string;
            sort?: number;
            visible?: boolean;
            keepAlive?: boolean;
            enabled?: boolean;
        },
        operatorId?: string,
    ): Promise<AdminMenu> {
        const menu = await this.prisma.rawClient.adminMenu.findUnique({ where: { id } });
        if (!menu) {
            throw new NotFoundException('菜单不存在');
        }

        /**
         * Zod schema 允许 parentId 为 null（前端编辑根菜单时传 null 表示"清除父菜单"）
         * Prisma 的 parentId 字段是可选外键，null 和 undefined 语义相同
         * 这里把 null 统一转为 undefined，让 Prisma 正确处理
         */
        const prismaData = { ...data, parentId: data.parentId ?? undefined };

        // 不允许把菜单的 parent 设为自身
        if (prismaData.parentId === id) {
            throw new BadRequestException({ code: 10005, message: '不能将父菜单设置为自己' });
        }

        /**
         * 菜单 path 白名单校验（防 XSS / 路径穿越 / 伪协议）
         * - 仅当 update 数据中含 path 时校验
         * - 失败抛 10001 INVALID_PARAMS
         */
        if (data.path !== undefined && data.path !== null && data.path !== '') {
            const result = validateMenuPath(data.path);
            if (!result.ok) {
                throw new BadRequestException({
                    code: ERROR_CODES.INVALID_PARAMS,
                    message: `菜单 path 非法: ${result.reason}`,
                });
            }
        }

        const updated = await this.prisma.client.adminMenu.update({ where: { id }, data: prismaData });

        /**
         * 缓存失效（双保险）：
         * - invalidateMenuStructure()：主动失效 → 现有用户立刻看到新菜单（icon/name/path 等）
         * - bumpMenuVersion()：懒失效兜底 → 主动失效万一漏调（如 seed/直 SQL），版本号保证自愈
         */
        await this.cacheService.invalidateMenuStructure();
        await this.cacheService.bumpMenuVersion();

        /**
         * 写审计日志（统一使用 AuditService）
         * 使用细粒度 MENU_UPDATED：审计要能回答"谁在何时改了哪个菜单的哪些字段"
         * 配合 detail.changes 记录具体变更内容
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.MENU_UPDATED,
            resourceType: 'admin_menu',
            resourceId: id,
            detail: { changes: data },
        });

        return this.toAdminMenu(updated);
    }

    /**
     * 删除菜单（硬删除）
     * - 检查是否有子节点，有子节点不能删
     * - 清理关联表（角色-菜单、账户-菜单）
     * - 物理删除行 + 缓存失效 + 审计日志
     * @param operatorId 操作者账户 ID（用于审计日志）
     */
    async delete(id: string, operatorId?: string): Promise<{ id: string; deleted: true }> {
        const menu = await this.prisma.client.adminMenu.findUnique({ where: { id } });
        if (!menu) {
            throw new NotFoundException('菜单不存在');
        }

        // 检查是否有子节点
        const childCount = await this.prisma.client.adminMenu.count({ where: { parentId: id } });
        if (childCount > 0) {
            throw new ForbiddenException(`菜单下存在 ${childCount} 个子菜单，请先删除子菜单`);
        }

        // 清理关联表（外键约束 onDelete: Restrict，必须先删关联记录）
        await this.prisma.client.adminRoleMenu.deleteMany({ where: { menuId: id } });
        await this.prisma.client.adminAccountMenu.deleteMany({ where: { menuId: id } });

        // 物理删除
        await this.prisma.client.adminMenu.delete({ where: { id } });

        /**
         * 缓存失效（双保险）：
         * - invalidateMenuStructure()：主动失效 → 现有用户立刻看不到被删菜单
         * - bumpMenuVersion()：懒失效兜底 → 主动失效万一漏调也能自愈
         */
        await this.cacheService.invalidateMenuStructure();
        await this.cacheService.bumpMenuVersion();

        /**
         * 写审计日志：记录被删菜单名（删除后无法再查）
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.MENU_DELETED,
            resourceType: 'admin_menu',
            resourceId: id,
            detail: { name: menu.name },
        });

        return { id, deleted: true };
    }

    /**
     * 按角色 ID 列表查询关联菜单
     */
    async findByRoleIds(roleIds: string[]): Promise<AdminMenu[]> {
        if (roleIds.length === 0) return [];
        const roleMenus = await this.prisma.client.adminRoleMenu.findMany({
            where: {
                roleId: { in: roleIds },
                menu: { enabled: true },
            },
            include: { menu: true },
        });
        return roleMenus.map((rm) => this.toAdminMenu(rm.menu));
    }

    /**
     * 获取当前账户的菜单树 + 权限码（登录后首页加载用）
     * - 委托 AdminPermissionCacheService 处理（含 Redis 二级缓存）
     * - 缓存命中 → 直接返回，未命中 → 重建缓存
     * - 与前端 api/menus.ts 的 `getCurrentUserMenus()` 对应
     */
    async getCurrentAccountMenus(accountId: string): Promise<{ menus: AdminMenuNode[]; permissions: string[] }> {
        const auth = await this.cacheService.getAccountAuth(accountId);
        if (!auth) {
            return { menus: [], permissions: [] };
        }
        // MenuNode → AdminMenuNode（递归），并补齐 GraphQL 必需字段
        // 注意：MenuNode（来自 cache）不含 createdAt/updatedAt，给个兜底值
        const menus = auth.menus.map((n) => this.toAdminMenuNode(n));
        return { menus, permissions: auth.permissions };
    }

    /**
     * 将 Prisma 记录转为 GraphQL AdminMenu
     */
    private toAdminMenu(m: AdminMenuModel): AdminMenu {
        return {
            id: m.id,
            parentId: m.parentId ?? undefined,
            name: m.name,
            type: m.type,
            path: m.path || undefined,
            routeName: m.routeName || undefined,
            component: m.component || undefined,
            icon: m.icon || undefined,
            permissionCode: m.permissionCode || undefined,
            sort: m.sort,
            visible: m.visible,
            keepAlive: m.keepAlive,
            enabled: m.enabled,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
        };
    }

    /**
     * 将 GraphQL AdminMenu 转为 buildMenuTree 所需 FlatMenu
     */
    private toFlatMenu(m: AdminMenu): FlatMenu {
        return {
            id: m.id,
            parentId: m.parentId ?? null,
            name: m.name,
            type: m.type,
            path: m.path,
            routeName: m.routeName,
            component: m.component,
            icon: m.icon,
            permissionCode: m.permissionCode,
            sort: m.sort,
            visible: m.visible,
            keepAlive: m.keepAlive,
            enabled: m.enabled,
        };
    }

    /**
     * 将 MenuNode 转为 GraphQL AdminMenuNode（递归）
     * - MenuNode 来自 build-menu-tree（缺 createdAt/updatedAt）
     * - AdminMenuNode extends AdminMenu，后者两个时间戳是 @Field() 必填
     * - 补 1970 兜底，前端不会拿菜单时间戳显示
     */
    private toAdminMenuNode(n: MenuNode): AdminMenuNode {
        return {
            id: n.id,
            parentId: n.parentId ?? undefined,
            name: n.name,
            type: n.type,
            path: n.path || undefined,
            routeName: n.routeName || undefined,
            component: n.component || undefined,
            activeMenuId: n.activeMenuId || undefined,
            icon: n.icon || undefined,
            permissionCode: n.permissionCode || undefined,
            sort: n.sort,
            visible: n.visible,
            keepAlive: n.keepAlive,
            enabled: n.enabled,
            createdAt: (n as MenuNode & { createdAt?: Date }).createdAt ?? new Date(0),
            updatedAt: (n as MenuNode & { updatedAt?: Date }).updatedAt ?? new Date(0),
            children: n.children.map((c) => this.toAdminMenuNode(c)),
        };
    }
}
