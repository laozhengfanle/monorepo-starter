/**
 * C端角色服务
 * - 查询 C端角色列表（guest/normal/vip/svip）
 * - 查询角色关联的权限码（从 member_role_menu 聚合）
 * - 用于 MemberPermissionGuard 缓存构建
 * - 管理端可调用的增/改/删/硬删/恢复方法（service 层）
 */
import { ConflictException, Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../prisma/generated/client.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../../common/cache/cache.interface.js';
import { CACHE_KEYS } from '../../../common/cache/cache-key.constants.js';
import { AuditService, AUDIT_ACTIONS } from '../../audit/audit.service.js';

/** 角色级缓存 TTL：30 分钟 */
const ROLE_TTL = 1800;

/** 角色权限数据（缓存结构） */
export interface MemberRolePermData {
    /** 权限码列表 */
    permissions: string[];
}

/** 撞 unique 时的统一文案 */
function conflictActiveMessage(code: string): string {
    return `角色编码 ${code} 已被使用`;
}

@Injectable()
export class MemberRoleService {
    private readonly logger = new Logger(MemberRoleService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(CACHE_SERVICE_TOKEN) private cacheService: ICacheService,
        private readonly auditService: AuditService,
    ) {}

    /**
     * 获取角色权限码列表（带缓存）
     * - 先查 Redis 缓存，miss 时从 DB 重建
     * - 用于 MemberPermissionGuard 校验权限
     */
    async getRolePermissions(roleCode: string): Promise<string[]> {
        const cacheKey = `${CACHE_KEYS.ROLE_PERM}:member:${roleCode}`;
        let data = await this.cacheService.get<MemberRolePermData>(cacheKey);

        if (!data) {
            data = await this._buildRolePermissions(roleCode);
        }

        return data?.permissions ?? [];
    }

    /**
     * 获取多个角色的聚合权限码
     * - 合并所有角色的权限码并去重
     */
    async getAggregatedPermissions(roleCodes: string[]): Promise<string[]> {
        const allPermissions = await Promise.all(roleCodes.map((code) => this.getRolePermissions(code)));
        return [...new Set(allPermissions.flat())];
    }

    /**
     * 查询所有 C 端角色（管理端视图）
     */
    async findAll() {
        return this.prisma.client.memberRole.findMany({ orderBy: { createdAt: 'desc' } });
    }

    /**
     * 创建 C 端角色（管理端）
     * - 预查撞 unique：撞活跃 → ConflictException；撞已删除 → ConflictException（含「显示已删除」提示）
     * - prisma.create 包 try/catch：捕获 P2002（处理并发场景下被另一个请求抢先创建的情况）
     * - 写审计日志：action = 'role_created'，resourceType = 'member_role'
     */
    async create(data: { name: string; code: string; description?: string; enabled?: boolean }, operatorId?: string) {
        /** 1. 预查撞 unique */
        const existing = await this.prisma.client.memberRole.findFirst({
            where: { code: data.code },
        });
        if (existing) {
            throw new ConflictException(conflictActiveMessage(data.code));
        }
        /** 2. 实际创建：包 try/catch 处理并发场景下的 P2002 */
        let role;
        try {
            role = await this.prisma.client.memberRole.create({
                data: data as unknown as Prisma.MemberRoleUncheckedCreateInput,
            });
        } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                /** 并发场景：重新做一次预查定位文案 */
                const target = (err.meta as { target?: string[] })?.target;
                if (Array.isArray(target) && target.includes('code')) {
                    throw new ConflictException(conflictActiveMessage(data.code));
                }
                throw new ConflictException('创建角色时发生唯一约束冲突');
            }
            throw err;
        }
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.ROLE_CREATED,
            resourceType: 'member_role',
            resourceId: role.id,
            detail: { code: data.code, name: data.name },
        });
        return role;
    }

    /**
     * 删除 C 端角色（硬删除）
     * - 事务内清理关联表（memberRoleMenu + memberAccountRole）+ 物理删除角色行
     * - 写审计日志：action = 'role_deleted'
     */
    async delete(id: string, operatorId?: string) {
        const role = await this.prisma.client.memberRole.findUnique({ where: { id } });
        if (!role) {
            throw new NotFoundException('角色不存在');
        }
        /** 事务内清理 FK 关联表 + 物理删除角色 */
        await this.prisma.client.$transaction(async (tx) => {
            await tx.memberRoleMenu.deleteMany({ where: { roleId: id } });
            await tx.memberAccountRole.deleteMany({ where: { roleId: id } });
            await tx.memberRole.delete({ where: { id } });
        });
        await this.auditService.record({
            accountId: operatorId || '',
            action: AUDIT_ACTIONS.ROLE_DELETED,
            resourceType: 'member_role',
            resourceId: id,
            detail: { code: role.code },
        });
        return { id, deleted: true };
    }

    /**
     * 缓存未命中时重建角色权限数据
     * - 从 member_role + member_role_menu + member_menu 聚合权限码
     * - 写入 Redis 缓存
     */
    private async _buildRolePermissions(roleCode: string): Promise<MemberRolePermData> {
        /** 查询角色及其关联的菜单权限 */
        const role = await this.prisma.client.memberRole.findUnique({
            where: { code: roleCode },
            include: {
                roleMenus: {
                    where: { menu: { enabled: true } },
                    select: {
                        menu: {
                            select: { permissionCode: true },
                        },
                    },
                },
            },
        });

        if (!role) {
            this.logger.warn(`角色不存在: ${roleCode}`);
            return { permissions: [] };
        }

        /** 聚合权限码 */
        const permissions = role.roleMenus.map((rm) => rm.menu.permissionCode).filter(Boolean);

        const data: MemberRolePermData = { permissions };

        /** 写入缓存 */
        const cacheKey = `${CACHE_KEYS.ROLE_PERM}:member:${roleCode}`;
        await this.cacheService.setex(cacheKey, ROLE_TTL, data);

        return data;
    }
}
