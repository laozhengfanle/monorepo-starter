/**
 * C端菜单服务
 * - 查询 C端功能菜单树
 * - 用于前端动态路由渲染
 * - 带缓存，减少 DB 查询
 * - 管理端可调用的增/删方法（service 层）
 */
import { BadRequestException, Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../../common/cache/cache.interface.js';
import { CACHE_KEYS } from '../../../common/cache/cache-key.constants.js';
import { buildMenuTree, type FlatMenu } from '../../../common/utils/build-menu-tree.js';
import { AuditService, AUDIT_ACTIONS } from '../../audit/audit.service.js';

/** 菜单缓存 TTL：30 分钟 */
const MENU_TTL = 1800;

@Injectable()
export class MemberMenuService {
    private readonly logger = new Logger(MemberMenuService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(CACHE_SERVICE_TOKEN) private cacheService: ICacheService,
        private readonly auditService: AuditService,
    ) {}

    /**
     * 获取角色的菜单树（带缓存）
     * - 先查 Redis 缓存，miss 时从 DB 重建
     * - 返回构建好的菜单树
     */
    async getRoleMenuTree(roleCode: string) {
        const cacheKey = `${CACHE_KEYS.ROLE_MENUS}:member:${roleCode}`;
        let menus = await this.cacheService.get<unknown[]>(cacheKey);

        if (!menus) {
            menus = await this._buildRoleMenuTree(roleCode);
        }

        return menus;
    }

    /**
     * 查询所有 C 端菜单（管理端视图）
     */
    async findAll() {
        return this.prisma.client.memberMenu.findMany({
            orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        });
    }

    /**
     * 删除 C 端菜单（硬删除）
     * - 检查是否有子节点，有子节点不能删
     * - 清理关联表后物理删除
     */
    async delete(id: string, operatorId?: string) {
        const menu = await this.prisma.client.memberMenu.findUnique({ where: { id } });
        if (!menu) {
            throw new NotFoundException('菜单不存在');
        }
        const childCount = await this.prisma.client.memberMenu.count({
            where: { parentId: id },
        });
        if (childCount > 0) {
            throw new BadRequestException(`菜单下存在 ${childCount} 个子菜单，请先删除子菜单`);
        }
        // 清理关联表（外键约束 onDelete: Restrict）
        await this.prisma.client.memberRoleMenu.deleteMany({ where: { menuId: id } });
        await this.prisma.client.memberAccountMenu.deleteMany({ where: { menuId: id } });
        await this.prisma.client.memberMenu.delete({ where: { id } });
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.MENU_DELETED,
            resourceType: 'member_menu',
            resourceId: id,
            detail: { name: menu.name },
        });
        return { id, deleted: true };
    }

    /**
     * 缓存未命中时重建角色菜单树
     * - 查询角色关联的所有菜单
     * - 构建树形结构
     * - 写入 Redis 缓存
     */
    private async _buildRoleMenuTree(roleCode: string) {
        const role = await this.prisma.client.memberRole.findUnique({
            where: { code: roleCode },
            include: {
                roleMenus: {
                    where: { menu: { enabled: true } },
                    select: {
                        menu: {
                            select: {
                                id: true,
                                parentId: true,
                                name: true,
                                type: true,
                                path: true,
                                routeName: true,
                                icon: true,
                                permissionCode: true,
                                sort: true,
                                visible: true,
                                keepAlive: true,
                                enabled: true,
                            },
                        },
                    },
                },
            },
        });

        if (!role) {
            return [];
        }

        /** 将菜单转为扁平列表并构建树 */
        const flatMenus: FlatMenu[] = role.roleMenus.map((rm) => ({
            id: rm.menu.id,
            parentId: rm.menu.parentId,
            name: rm.menu.name,
            type: rm.menu.type,
            path: rm.menu.path || undefined,
            routeName: rm.menu.routeName || undefined,
            icon: rm.menu.icon || undefined,
            permissionCode: rm.menu.permissionCode || undefined,
            sort: rm.menu.sort,
            visible: rm.menu.visible,
            keepAlive: rm.menu.keepAlive,
            enabled: rm.menu.enabled,
        }));

        const tree = buildMenuTree(flatMenus);

        /** 写入缓存 */
        const cacheKey = `${CACHE_KEYS.ROLE_MENUS}:member:${roleCode}`;
        await this.cacheService.setex(cacheKey, MENU_TTL, tree);

        return tree;
    }
}
