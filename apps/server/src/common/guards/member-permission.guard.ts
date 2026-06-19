/**
 * C端用户权限守卫
 * - 配合 @RequireAuth() + @Permission() 装饰器使用
 * - 必须在 JwtAuthGuard 之后注册（依赖 request.user）
 *
 * 三层逻辑：
 * 1. @Public() 路由直接放行（交给 JwtAuthGuard 处理）
 * 2. 未标记 @RequireAuth() 的控制器直接放行
 * 3. 标记了 @RequireAuth() 但方法无 @Permission() → 403（开发时立刻发现漏了）
 * 4. 标记了 @RequireAuth() 且方法有 @Permission() → 校验权限码
 *    - 非会员直接拒绝
 *    - svip 角色直接放行
 *    - 校验权限码是否在用户权限列表中
 *
 * 缓存策略：
 * - 从 Redis 缓存读取用户认证数据（与 AdminPermissionGuard 一致）
 * - 缓存未命中时通过 MemberRoleService + PrismaService 重建
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../cache/cache.interface.js';
import { CACHE_KEYS } from '../cache/cache-key.constants.js';
import { PERMISSION_KEY } from '../decorators/permission.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { REQUIRE_AUTH_KEY } from '../decorators/require-auth.decorator.js';
import { LOGIN_ONLY_KEY } from '../decorators/login-only.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MemberRoleService } from '../../modules/member/member-role/member-role.service.js';

/** Redis 中缓存的会员认证数据结构 */
interface MemberAuthCacheData {
    /** 用户角色列表 */
    roles: string[];
    /** 用户权限码列表 */
    permissions: string[];
}

/** 账户级缓存 TTL：30 分钟 */
const ACCOUNT_TTL = 1800;

@Injectable()
export class MemberPermissionGuard implements CanActivate {
    private readonly logger = new Logger(MemberPermissionGuard.name);

    constructor(
        private reflector: Reflector,
        @Inject(CACHE_SERVICE_TOKEN) private cacheService: ICacheService,
        private prisma: PrismaService,
        private memberRoleService: MemberRoleService,
    ) {}

    /**
     * 从执行上下文中获取 request 对象
     * - 兼容 HTTP REST 和 GraphQL 两种请求类型
     */
    private getRequest(context: ExecutionContext): Request {
        if (context.getType<string>() === 'graphql') {
            const gqlCtx = GqlExecutionContext.create(context);
            const ctx = gqlCtx.getContext<{ req?: Request }>();
            return ctx.req ?? ({} as Request);
        }
        return context.switchToHttp().getRequest();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        /** 1. @Public() 路由直接放行 */
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }

        /** 2. 未标记 @RequireAuth() 的控制器直接放行 */
        const requireAuth = this.reflector.getAllAndOverride<boolean>(REQUIRE_AUTH_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requireAuth) {
            return true;
        }

        /** 2.5 标记了 @LoginOnly() → 仅校验登录态，不校验权限码 */
        const isLoginOnly = this.reflector.getAllAndOverride<boolean>(LOGIN_ONLY_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isLoginOnly) {
            return true;
        }

        /** 3. 标记了 @RequireAuth() 但方法无 @Permission() 也无 @LoginOnly() → 403
         *    @Permission() 支持多参数 OR 语义（@Permission('a', 'b') 表示任一即可）。
         *    SetMetadata 统一存为 string[]；兼容老装饰器（单 string），运行时归一化。
         */
        const rawPermissions = this.reflector.getAllAndOverride<string | string[]>(PERMISSION_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        const requiredPermissions: string[] = Array.isArray(rawPermissions)
            ? rawPermissions
            : rawPermissions
              ? [rawPermissions]
              : [];
        if (requiredPermissions.length === 0) {
            throw new ForbiddenException('权限端点缺少 @Permission() 装饰器');
        }

        /** 4. 从 request.user 中获取当前用户信息 */
        const request = this.getRequest(context);
        const user = request?.user as { accountId: string; userType: string } | undefined;

        /** 5. 非会员放行给下一个 Guard 处理（不直接拒绝）
         *  - admin 用户已由 AdminPermissionGuard 校验通过，这里必须放行
         *  - 如果直接 throw，会导致 admin 用户被 MemberPermissionGuard 拦截，
         *    即使 AdminPermissionGuard 已经通过 super_admin 角色放行
         */
        if (!user || user.userType !== 'member') {
            return true;
        }

        /** 6. 从 Redis 缓存中获取用户的认证数据 */
        const cacheKey = `${CACHE_KEYS.AUTH_RESULT}:${user.accountId}`;
        let authData = await this.cacheService.get<MemberAuthCacheData>(cacheKey);

        /** 防御性检查：缓存数据格式异常时删除重建 */
        if (authData && typeof authData === 'string') {
            this.logger.warn(`[MemberPermissionGuard] 检测到异常缓存格式，删除并重建: ${cacheKey}`);
            await this.cacheService.del(cacheKey);
            authData = null;
        }

        /** 7. 缓存未命中时重建 */
        if (!authData) {
            authData = await this._buildMemberAuth(user.accountId);
        }

        /** 8. svip 角色直接放行（C端最高权限） */
        if (authData?.roles?.includes('svip')) {
            return true;
        }

        /** 9. 校验权限码是否在用户权限列表中（OR 语义：任一所需权限命中即放行） */
        if (requiredPermissions.some((p) => authData?.permissions?.includes(p))) {
            return true;
        }

        /** 10. 无匹配权限，拒绝访问 */
        throw new ForbiddenException('无权访问');
    }

    /**
     * 缓存未命中时重建会员认证数据
     * - 查询用户的角色列表
     * - 通过 MemberRoleService 聚合权限码
     * - 写入 Redis 缓存
     */
    private async _buildMemberAuth(accountId: string): Promise<MemberAuthCacheData | null> {
        try {
            /** 查询用户的角色列表 */
            const accountRoles = await this.prisma.client.memberAccountRole.findMany({
                where: { accountId },
                include: {
                    role: {
                        select: { code: true, enabled: true },
                    },
                },
            });

            /** 提取启用的角色码列表 */
            const roles = accountRoles.filter((ar) => ar.role?.enabled).map((ar) => ar.role.code);

            /** 通过 MemberRoleService 聚合权限码（带角色级缓存） */
            const permissions = await this.memberRoleService.getAggregatedPermissions(roles);

            const authData: MemberAuthCacheData = { roles, permissions };

            /** 写入 Redis 缓存 */
            const cacheKey = `${CACHE_KEYS.AUTH_RESULT}:${accountId}`;
            await this.cacheService.setex(cacheKey, ACCOUNT_TTL, authData);

            return authData;
        } catch (err) {
            // 缓存重建失败时记录详细错误，返回 null 让调用方返回 403（优雅降级）
            // 与 AdminPermissionGuard 不同：会员端是 C 端，缓存故障不应阻塞用户请求
            this.logger.error(`重建会员缓存失败: ${accountId}`, err);
            return null;
        }
    }
}
