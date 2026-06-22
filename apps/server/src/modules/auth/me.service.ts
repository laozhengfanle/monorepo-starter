/**
 * MeService — 当前用户信息服务
 *
 * 职责：
 * - 根据 userType 字段分别获取管理端 / C 端「我」的数据
 * - 管理端：复用 AdminPermissionCacheService 的角色 + 权限 + 菜单树缓存
 * - C 端：从数据库查询 member_profile 和 member 角色
 *
 * 拆分理由：
 * - Resolver 只负责参数解析和权限控制
 * - Service 负责数据组装（多表 JOIN、字段映射等）
 * - 方便未来加单元测试（mock 掉 Prisma 和 CacheService 即可）
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AdminPermissionCacheService } from '../admin/admin-permission-cache.service.js';
import { MenuTreeNode, type AdminMe, type MemberMe } from './auth.type.js';
import type { DataLoaders } from '../../common/dataloader/index.js';

/**
 * 把 AdminPermissionCacheService 返回的菜单节点转换为 GraphQL MenuTreeNode
 * - 字段对齐：parentId 从 string | null 转为 string | undefined（GraphQL nullable 约定）
 * - 这是 GraphQL ObjectType 与内部数据类型的边界转换，业务其他地方无感
 */
/** 内部菜单节点类型（用于 toMenuTreeNode 参数，避免 any） */
type InternalMenuNode = {
    id: string;
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
    activeMenuId?: string;
    children?: InternalMenuNode[];
};

function toMenuTreeNode(node: InternalMenuNode): MenuTreeNode {
    return {
        id: node.id,
        parentId: node.parentId ?? undefined,
        name: node.name ?? '',
        type: node.type ?? 'menu',
        path: node.path ?? undefined,
        routeName: node.routeName ?? undefined,
        component: node.component ?? undefined,
        icon: node.icon ?? undefined,
        permissionCode: node.permissionCode ?? undefined,
        sort: node.sort ?? 0,
        visible: node.visible ?? true,
        keepAlive: node.keepAlive ?? true,
        enabled: node.enabled ?? true,
        activeMenuId: node.activeMenuId ?? undefined,
        children: (node.children ?? []).map((c) => toMenuTreeNode(c)),
    };
}

@Injectable()
export class MeService {
    private readonly logger = new Logger(MeService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly adminPermissionCache: AdminPermissionCacheService,
    ) {}

    /**
     * 获取管理端「我」数据
     * @param accountId 账户 ID（来自 JWT payload.sub）
     * @param dataloaders 可选 DataLoader 集合（GraphQL context.dataloaders）
     *                    - 传入时：用 dataloader 批量查 roles + permissions（消除 N+1）
     *                    - 不传时：回退到 cache service（向后兼容）
     * @returns AdminMe 对象（含 userType 判别字段）
     * @throws NotFoundException 账户不存在或已被删除
     */
    async getAdminMe(accountId: string, dataloaders?: DataLoaders): Promise<AdminMe> {
        /** 1-2. 并行查询：账户+profile 和 用户名（两次查询无依赖，可并行） */
        const [account, usernameIdentity] = await Promise.all([
            this.prisma.client.account.findUnique({
                where: { id: accountId },
                include: {
                    adminProfile: true,
                },
            }),
            this.prisma.client.accountIdentity.findFirst({
                where: {
                    accountId,
                    identityType: 'username',
                },
            }),
        ]);

        if (!account || account.userType !== 'admin') {
            throw new NotFoundException('账户不存在');
        }
        /** 用户名理论上必填，缺失说明数据异常 */
        if (!usernameIdentity) {
            throw new NotFoundException('账户未设置用户名');
        }

        /**
         * 3. 获取角色 / 权限 / 菜单
         * - 优先 DataLoader：同帧多次 load 自动 batch（消除 N+1）
         *   - 业务场景：批量查多个账户 / 同一请求查多种关联数据
         * - fallback Cache：单账户 / 缓存命中 → 复用 Redis 二级缓存
         *
         * DataLoader 与 cache 共存原因：
         * - cache 提供菜单树（dataloader 不存完整树）
         * - dataloader 提供实时的 role / permission 集合
         * - 在 dataloader 路径下，菜单仍走 cache（树结构成本高、不在 batch 受益范围）
         */
        let roles: string[];
        let permissions: string[];
        let menus: MenuTreeNode[];

        if (dataloaders) {
            // DataLoader 路径：roles / permissions 用 batch
            const [rolesBundle, perms] = await Promise.all([
                dataloaders.rolesByAccountId.load(accountId),
                dataloaders.permissionsByAccountId.load(accountId),
            ]);
            roles = rolesBundle.adminRoles;
            permissions = perms;
            // 菜单树仍走 cache（保持原本行为，菜单树是 dloaders 之外的能力）
            const authData = await this.adminPermissionCache.getAccountAuth(accountId);
            menus = (authData?.menus ?? []).map((m) => toMenuTreeNode(m as unknown as InternalMenuNode));
        } else {
            // 原有路径：完全走 cache（行为完全一致）
            const authData = await this.adminPermissionCache.getAccountAuth(accountId);
            roles = authData?.roles ?? [];
            permissions = authData?.permissions ?? [];
            menus = (authData?.menus ?? []).map((m) => toMenuTreeNode(m as unknown as InternalMenuNode));
        }

        /**
         * 4. 组装返回结果
         * - nickname 优先取 profile.nickname，若为空则回退到 username
         * - 菜单树来自缓存的 buildMenuTree 结果，需要转换为 GraphQL 类型
         *   （parentId 由 null 转 undefined，对齐 GraphQL nullable 约定）
         */
        const result = {
            userType: 'admin' as const,
            accountId,
            username: usernameIdentity.identifier,
            nickname: account.adminProfile?.nickname || usernameIdentity.identifier,
            avatar: account.adminProfile?.avatar || undefined,
            roles,
            permissions,
            menus,
        };

        return result;
    }

    /**
     * 获取 C 端「我」数据
     * @param accountId 账户 ID（来自 JWT payload.sub）
     * @returns MemberMe 对象（含 userType 判别字段）
     * @throws NotFoundException 账户不存在或被删除
     */
    async getMemberMe(accountId: string): Promise<MemberMe> {
        /** 1-2. 并行查询：账户+profile 和 成员角色（两次查询无依赖，可并行） */
        const [account, memberRoles] = await Promise.all([
            this.prisma.client.account.findUnique({
                where: { id: accountId },
                include: {
                    memberProfile: true,
                },
            }),
            this.prisma.client.memberAccountRole.findMany({
                where: { accountId },
                include: {
                    role: {
                        select: { code: true },
                    },
                },
            }),
        ]);

        if (!account || account.userType !== 'member') {
            throw new NotFoundException('账户不存在');
        }
        const roleCodes = memberRoles.map((mr) => mr.role.code);

        /**
         * 3. 组装返回结果
         * - nickname / avatar 来自 member_profile（可能为空，保持 nullable）
         * - 角色列表即使为空也返回空数组，保证前端数据结构稳定
         */
        return {
            userType: 'member',
            accountId,
            nickname: account.memberProfile?.nickname || undefined,
            avatar: account.memberProfile?.avatar || undefined,
            roles: roleCodes,
        };
    }
}
