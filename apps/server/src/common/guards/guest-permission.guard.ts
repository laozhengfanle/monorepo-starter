/**
 * 游客权限守卫
 * - 用于无需 JWT 认证的公开端点，但需要按游客角色做权限控制
 * - 直接从 Redis 读取 guest 角色的权限缓存
 * - 没有 @Permission() → 放行
 * - 有 @Permission() → 检查 guest 角色是否包含该权限码
 *
 * 使用场景：
 * - 公开页面需要按角色控制某些功能的可见性
 * - 游客可访问公开内容，但不能访问 VIP 内容
 *
 * 注意：
 * - 此守卫不需要 JWT，不依赖 request.user
 * - 直接读取 Redis 中 guest 角色的权限缓存
 * - 缓存未命中时通过 MemberRoleService 重建
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../cache/cache.interface.js';
import { CACHE_KEYS } from '../cache/cache-key.constants.js';
import { PERMISSION_KEY } from '../decorators/permission.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { MemberRoleService } from '../../modules/member/member-role/member-role.service.js';

/** 游客角色码 */
const GUEST_ROLE_CODE = 'guest';

@Injectable()
export class GuestPermissionGuard implements CanActivate {
    private readonly logger = new Logger(GuestPermissionGuard.name);

    constructor(
        private reflector: Reflector,
        @Inject(CACHE_SERVICE_TOKEN) private cacheService: ICacheService,
        private memberRoleService: MemberRoleService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        /** 1. 非 @Public() 端点 → 放行（由 MemberPermissionGuard 处理） */
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!isPublic) {
            return true;
        }

        /** 2. @Public() 端点但没有 @Permission() → 放行（完全公开） */
        const requiredPermission = this.reflector.getAllAndOverride<string | string[]>(PERMISSION_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredPermission) {
            return true;
        }

        /** 3. 从 Redis 读取 guest 角色的权限缓存 */
        const cacheKey = `${CACHE_KEYS.ROLE_PERM}:member:${GUEST_ROLE_CODE}`;
        let guestPermissions = await this.cacheService.get<{ permissions: string[] }>(cacheKey);

        /** 4. 缓存未命中时通过 MemberRoleService 重建（内部会写缓存） */
        if (!guestPermissions) {
            const permissions = await this.memberRoleService.getRolePermissions(GUEST_ROLE_CODE);
            guestPermissions = { permissions };
        }

        /** 5. 检查 guest 角色是否包含该权限码（支持 OR 语义：数组任一匹配即通过） */
        const requiredList = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
        const hasPermission = requiredList.some((perm) => guestPermissions?.permissions?.includes(perm));
        if (hasPermission) {
            return true;
        }

        /** 6. 游客无此权限，拒绝访问 */
        throw new ForbiddenException('游客无权访问此内容');
    }
}
