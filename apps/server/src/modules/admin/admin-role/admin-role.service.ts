/**
 * 管理端角色服务
 *
 * 业务能力：
 * - 角色增删改查
 * - 菜单分配（事务：先删后插）
 * - super_admin 角色保护
 * - 缓存失效（写操作触发）
 * - 审计日志
 * - 角色删除为硬删除（物理删除行，不做软删除）
 */
import { Injectable, ForbiddenException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { PrismaTx } from '../../../common/prisma/prisma.js';
import { AdminPermissionCacheService } from '../admin-permission-cache.service.js';
import { AuditService, AUDIT_ACTIONS } from '../../audit/audit.service.js';
import type { AdminRole } from './admin-role.type.js';

/** 撞 unique 时的统一文案 */
function conflictActiveMessage(code: string): string {
    return `角色编码 ${code} 已被使用`;
}

@Injectable()
export class AdminRoleService {
    private readonly logger = new Logger(AdminRoleService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: AdminPermissionCacheService,
        private readonly auditService: AuditService,
    ) {}

    /**
     * 查询所有角色（含 menuCount + menuIds）
     * - enabled：可选启用状态筛选
     *   - undefined（默认）：不过滤
     *   - true：只返回 enabled=true 的角色
     *   - false：只返回 enabled=false 的角色（已禁用）
     */
    async findAll(enabled?: boolean): Promise<AdminRole[]> {
        const where: Prisma.AdminRoleWhereInput = {};
        if (enabled !== undefined) {
            where.enabled = enabled;
        }
        const roles = await this.prisma.client.adminRole.findMany({
            where,
            include: {
                _count: { select: { roleMenus: true, accountRoles: true } },
                roleMenus: { select: { menuId: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return roles.map((r) => this.toAdminRole(r));
    }

    /**
     * 查询单个角色（含 menuIds）
     */
    async findById(id: string): Promise<AdminRole> {
        const role = await this.prisma.client.adminRole.findUnique({
            where: { id },
            include: {
                _count: { select: { roleMenus: true, accountRoles: true } },
                roleMenus: { select: { menuId: true } },
            },
        });
        if (!role) {
            throw new NotFoundException('角色不存在');
        }
        return this.toAdminRole(role);
    }

    /**
     * 按 code 查询角色（service 内部 + 控制器复用）
     */
    async findByCode(code: string) {
        return this.prisma.client.adminRole.findFirst({ where: { code } });
    }

    /**
     * 创建角色
     * - 预查撞 unique：撞活跃 → ConflictException
     * - prisma.create 包 try/catch：捕获 P2002（处理并发场景下被另一个请求抢先创建的情况）
     * @param operatorId 操作者账户 ID（用于审计日志）
     */
    async create(
        data: { name: string; code: string; description?: string; enabled?: boolean },
        operatorId?: string,
    ): Promise<AdminRole> {
        /** 1. 预查撞 unique（code 是否已被占用） */
        const existing = await this.findByCode(data.code);
        if (existing) {
            throw new ConflictException(conflictActiveMessage(data.code));
        }

        /** 2. 实际创建：包 try/catch 处理并发场景下的 P2002 */
        let role;
        try {
            role = await this.prisma.client.adminRole.create({ data: data as Prisma.AdminRoleCreateInput });
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                /** 并发场景：另一个请求在我们预查后抢先创建 */
                const target = (err.meta as { target?: string[] })?.target;
                if (Array.isArray(target) && target.includes('code')) {
                    throw new ConflictException(conflictActiveMessage(data.code));
                }
                throw new ConflictException('创建角色时发生唯一约束冲突');
            }
            throw err;
        }

        /**
         * 写审计日志（统一使用 AuditService）
         * 使用细粒度 ROLE_CREATED：审计场景要区分"创建角色"vs"创建账号/菜单"
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.ROLE_CREATED,
            resourceType: 'admin_role',
            resourceId: role.id,
            detail: { code: data.code, name: data.name },
        });

        return this.toAdminRole({ ...role, _count: { roleMenus: 0, accountRoles: 0 }, roleMenus: [] });
    }

    /**
     * 更新角色（super_admin 角色不可禁用）
     * @param operatorId 操作者账户 ID（用于审计日志）
     */
    async update(
        id: string,
        data: { name?: string; description?: string; enabled?: boolean },
        operatorId?: string,
    ): Promise<AdminRole> {
        const role = await this.prisma.client.adminRole.findUnique({ where: { id } });
        if (!role) {
            throw new NotFoundException('角色不存在');
        }
        if (role.code === 'super_admin' && data.enabled === false) {
            throw new ForbiddenException('超级管理员角色不可禁用');
        }

        /**
         * 包 try/catch 处理 P2002：当前 update 接口不直接修改 code，但若未来扩展支持
         * 修改 code，需要按 create 的撞 unique 文案抛 ConflictException
         * 这里是防御性兜底：避免 P2002 冒泡成 10999 错误
         */
        let updated;
        try {
            updated = await this.prisma.client.adminRole.update({ where: { id }, data });
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                const target = (err.meta as { target?: string[] })?.target;
                if (Array.isArray(target) && target.includes('code')) {
                    throw new ConflictException('更新角色时唯一约束冲突');
                }
                throw new ConflictException('更新角色时发生唯一约束冲突');
            }
            throw err;
        }

        /** 失效角色级缓存 + 级联失效账户缓存 */
        await this.cacheService.invalidateRole(updated.code);

        /**
         * 写审计日志（统一使用 AuditService）
         * 使用细粒度 ROLE_UPDATED：审计要能精确还原"谁改了哪个角色的哪些字段"
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.ROLE_UPDATED,
            resourceType: 'admin_role',
            resourceId: id,
            detail: { changes: data },
        });

        return this.findById(id);
    }

    /**
     * 删除角色（硬删除，super_admin 角色不可删除）
     * - 事务内清理关联表（adminRoleMenu + adminAccountRole）+ 物理删除角色行
     * - 缓存失效 + 审计日志
     * @param operatorId 操作者账户 ID（用于审计日志）
     */
    async delete(id: string, operatorId?: string): Promise<{ id: string; deleted: true }> {
        const role = await this.prisma.client.adminRole.findUnique({ where: { id } });
        if (!role) {
            throw new NotFoundException('角色不存在');
        }
        if (role.code === 'super_admin') {
            throw new ForbiddenException('超级管理员角色不可删除');
        }

        /** 事务内清理 FK 关联表 + 物理删除角色 */
        await this.prisma.client.$transaction(async (tx) => {
            await tx.adminRoleMenu.deleteMany({ where: { roleId: id } });
            await tx.adminAccountRole.deleteMany({ where: { roleId: id } });
            await tx.adminRole.delete({ where: { id } });
        });

        /** 失效角色级缓存 + 级联失效账户缓存 */
        await this.cacheService.invalidateRole(role.code);

        /**
         * 写审计日志（统一使用 AuditService）
         * 使用细粒度 ROLE_DELETED：审计要能回答"谁在何时删除了哪个角色"
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.ROLE_DELETED,
            resourceType: 'admin_role',
            resourceId: id,
            detail: { code: role.code },
        });

        return { id, deleted: true };
    }

    /**
     * 分配角色菜单（事务：先删后插）
     * - 完成后失效角色级缓存 + 级联失效账户缓存
     * @param operatorId 操作者账户 ID（用于审计日志）
     */
    async assignMenus(
        roleId: string,
        menuIds: string[],
        operatorId?: string,
    ): Promise<{ roleId: string; menuIds: string[] }> {
        const result = await this.prisma.client.$transaction(async (tx) => {
            const role = await tx.adminRole.findUnique({ where: { id: roleId } });
            if (!role) {
                throw new NotFoundException('角色不存在');
            }
            await tx.adminRoleMenu.deleteMany({ where: { roleId } });
            if (menuIds.length > 0) {
                await tx.adminRoleMenu.createMany({
                    data: menuIds.map((menuId) => ({
                        roleId,
                        menuId,
                    })) as unknown as Prisma.AdminRoleMenuCreateManyInput[],
                    skipDuplicates: true,
                });
            }

            return { _roleCode: role.code };
        });

        /** 失效角色级缓存 */
        await this.cacheService.invalidateRole(result._roleCode);

        /**
         * 写审计日志（统一使用 AuditService）
         * 使用细粒度 PERMISSION_CHANGED（不是 ROLE_UPDATED）：
         * - 分配菜单是"权限变更"（角色 ↔ 菜单关系变更），而非"角色基础信息变更"
         * - 审计场景要能区分"改了角色元数据"vs"改了角色的菜单权限"
         * - detail.menuCount 记录权限范围变化
         */
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.PERMISSION_CHANGED,
            resourceType: 'admin_role',
            resourceId: roleId,
            detail: { menuCount: menuIds.length },
        });

        return { roleId, menuIds };
    }

    /**
     * 获取持有该角色的账户 ID 列表
     */
    async getRoleAccounts(roleId: string): Promise<string[]> {
        const accountRoles = await this.prisma.client.adminAccountRole.findMany({
            where: { roleId },
            select: { accountId: true },
        });
        return accountRoles.map((ar) => ar.accountId);
    }

    /**
     * 查询活跃超管数量（角色已启用 + 账户已启用且未软删除）
     */
    private async activeSuperAdminCount(tx?: PrismaTx): Promise<number> {
        const client = tx || this.prisma.client;
        return client.adminAccountRole.count({
            where: {
                role: { code: 'super_admin', enabled: true },
                account: { enabled: true, deletedAt: null },
            },
        });
    }

    /**
     * 移除账户的 super_admin 角色：事务内检查活跃超管数 ≥ 2，防并发竞态
     */
    async removeRoleFromAccount(accountId: string, roleId: string) {
        const roleCode = await this.prisma.client.$transaction(async (tx) => {
            const role = await tx.adminRole.findUnique({ where: { id: roleId } });
            if (role!.code === 'super_admin') {
                const activeCount = await this.activeSuperAdminCount(tx);
                if (activeCount <= 1) {
                    throw new ForbiddenException('至少保留一个可用的超级管理员账户');
                }
            }
            await tx.adminAccountRole.deleteMany({
                where: { accountId, roleId },
            });
            return role!.code;
        });

        /** 失效角色级缓存 + 该账户缓存 */
        await this.cacheService.invalidateRole(roleCode);
        await this.cacheService.invalidateAccount(accountId);
    }

    /**
     * 将 Prisma 返回的角色记录转换为 GraphQL AdminRole
     */
    private toAdminRole(r: {
        id: string;
        name: string;
        code: string;
        description: string | null;
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
        _count: { roleMenus: number; accountRoles: number } | null;
        roleMenus: Array<{ menuId: string }> | null;
    }): AdminRole {
        return {
            id: r.id,
            name: r.name,
            code: r.code,
            description: r.description || undefined,
            enabled: r.enabled,
            /** 关联菜单数量（从 _count.roleMenus 取值，默认 0） */
            menuCount: r._count?.roleMenus ?? 0,
            /** 关联用户数（从 _count.accountRoles 取值，默认 0） */
            userCount: r._count?.accountRoles ?? 0,
            menuIds: (r.roleMenus ?? []).map((rm: { menuId: string }) => rm.menuId),
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        };
    }
}
