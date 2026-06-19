import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    InternalServerErrorException,
    Inject,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../cache/cache.interface.js';
import { CACHE_KEYS } from '../cache/cache-key.constants.js';
// 元数据读取统一走 ReflectorExt 工具类（已封装 getHandler + getClass 两层反射）
import { ReflectorExt } from './reflector-ext.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { aggregatePermissions } from '../utils/aggregate-permissions.js';
import { buildMenuTree, type FlatMenu } from '../utils/build-menu-tree.js';

/** Redis 中缓存的认证数据结构 */
interface AuthCacheData {
    /** 用户角色列表 */
    roles: string[];
    /** 用户权限码列表 */
    permissions: string[];
    /** 用户菜单列表 */
    menus: unknown[];
}

/** 账户级缓存 TTL：30 分钟 */
const ACCOUNT_TTL = 1800;

/**
 * 管理端权限守卫
 * - 配合 @RequireAuth() + @Permission() 装饰器使用（必须在 JwtAuthGuard 之后注册）
 * - 校验流程：@Public() 放行 → 未标 @RequireAuth() 放行 → @LoginOnly() 放行 → 校验权限码
 * - super_admin 角色短路放行；缓存未命中时通过 PrismaService + ICacheService 直接重建
 *   （不依赖 AdminPermissionCacheService，避免 AppModule 循环依赖）
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
    private readonly logger = new Logger(AdminPermissionGuard.name);

    constructor(
        private reflector: Reflector,
        @Inject(CACHE_SERVICE_TOKEN) private cacheService: ICacheService,
        private prisma: PrismaService,
    ) {}

    /** 兼容 HTTP REST / GraphQL：GraphQL 走 GqlExecutionContext 拿 req */
    private getRequest(context: ExecutionContext): Request {
        if (context.getType<string>() === 'graphql') {
            const gqlCtx = GqlExecutionContext.create(context);
            const ctx = gqlCtx.getContext<{ req?: Request }>();
            return ctx.req ?? ({} as Request);
        }
        return context.switchToHttp().getRequest();
    }

    /** 判断当前请求是否放行 */
    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 1. @Public() 路由跳过权限校验（交给 JwtAuthGuard 处理）
        if (ReflectorExt.isPublic(this.reflector, context)) return true;

        // 2. 未标记 @RequireAuth() 的控制器直接放行（member/health/auth 不受影响）
        if (!ReflectorExt.getRequireAuth(this.reflector, context)) return true;

        // 3. @LoginOnly() → 只校验登录态，不校验权限码（适用：当前账户菜单/个人资料）
        if (ReflectorExt.getLoginOnly(this.reflector, context)) return true;

        // 4. @RequireAuth() 但方法无 @Permission() → 403（开发时立刻发现漏了装饰器）
        //    ReflectorExt.getPermissions 已归一化（兼容老装饰器单 string），OR 语义靠下面 some() 实现
        const requiredPermissions = ReflectorExt.getPermissions(this.reflector, context);
        if (requiredPermissions.length === 0) {
            throw new ForbiddenException('权限端点缺少 @Permission() 装饰器');
        }

        // 5. 拿当前用户（由 JwtAuthGuard 注入到 request.user）
        const request = this.getRequest(context);
        const user = request?.user as { accountId: string; userType: string } | undefined;

        // 6. 非管理员直接拒绝
        if (!user || user.userType !== 'admin') {
            throw new ForbiddenException('无权访问');
        }

        // 7. 从 Redis 缓存拿认证数据
        //    Redis 故障时降级为 null → 走 DB 重建（fail-open，不阻塞请求）
        const cacheKey = `${CACHE_KEYS.AUTH_RESULT}:${user.accountId}`;
        let authData: AuthCacheData | string | null = null;
        try {
            authData = await this.cacheService.get<AuthCacheData>(cacheKey);
        } catch (err) {
            this.logger.warn(
                `[AdminPermissionGuard] Redis 读取降级，回退到 DB 重建: accountId=${user.accountId} err=${(err as Error).message}`,
            );
            authData = null;
        }

        // 防御性：缓存数据是字符串（双重序列化）→ 删除并重建
        if (authData && typeof authData === 'string') {
            this.logger.warn(`[AdminPermissionGuard] 检测到异常缓存格式，删除并重建: ${cacheKey}`);
            try {
                await this.cacheService.del(cacheKey);
            } catch {
                /* del 失败不影响 */
            }
            authData = null;
        }

        // 8. 缓存未命中 → 从数据库重建（防止 Redis 宕机导致系统不可用）
        if (!authData) authData = await this._buildAccountAuth(user.accountId);

        // 9. super_admin 角色短路放行
        if (authData?.roles?.includes('super_admin')) return true;

        // 10. 校验权限码（OR 语义：任一所需权限命中即放行）
        if (requiredPermissions.some((p) => authData?.permissions?.includes(p))) return true;

        // 11. 无匹配权限
        throw new ForbiddenException('无权访问');
    }

    /**
     * 缓存未命中时重建账户认证数据
     * - 从数据库查角色/权限/菜单，聚合后写 Redis
     * - 失败抛 500（fail-closed：拒绝访问 + 明确错误信息）
     */
    private async _buildAccountAuth(accountId: string): Promise<AuthCacheData | null> {
        try {
            /** Prisma 查询的角色-菜单关联结构（紧凑写法，避免深层嵌套） */
            const accountRoles = await this.prisma.client.adminAccountRole.findMany({
                where: { accountId },
                include: {
                    role: {
                        select: {
                            code: true,
                            enabled: true,
                            roleMenus: {
                                where: { menu: { enabled: true } },
                                select: {
                                    menu: {
                                        select: {
                                            id: true,
                                            name: true,
                                            path: true,
                                            icon: true,
                                            type: true,
                                            permissionCode: true,
                                            sort: true,
                                            visible: true,
                                            parentId: true,
                                            enabled: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            /** 提取启用的角色码 */
            const roles = accountRoles.filter((ar) => ar.role?.enabled).map((ar) => ar.role.code);

            /** 聚合权限：角色权限 + 账户级 grant/deny 覆盖 */
            const flatMenus: FlatMenu[] = [];
            const rolesForAgg: Array<{ roleMenus: Array<{ menu: { permissionCode: string } }> }> = [];
            const overrides: Array<{ menu: { permissionCode: string }; type: 'grant' | 'deny' }> = [];
            for (const ar of accountRoles) {
                if (!ar.role?.enabled) continue;
                rolesForAgg.push({
                    roleMenus: ar.role.roleMenus.map((rm) => ({
                        menu: { permissionCode: rm.menu.permissionCode },
                    })),
                });
                for (const rm of ar.role.roleMenus) {
                    const rmType = (rm as { type?: string }).type;
                    // overrideType 字段不在 FlatMenu 类型里，运行时需带这个标记给前端做 grant/deny 区分
                    flatMenus.push({
                        ...rm.menu,
                        keepAlive: true,
                        routeName: '',
                        component: '',
                        overrideType: rmType,
                    } as FlatMenu & { overrideType?: string });
                    if (rmType === 'grant' || rmType === 'deny') {
                        overrides.push({
                            menu: { permissionCode: rm.menu.permissionCode },
                            type: rmType,
                        });
                    }
                }
            }
            const permissions = aggregatePermissions(rolesForAgg, overrides);
            const menus = buildMenuTree(flatMenus);
            const authData: AuthCacheData = { roles, permissions, menus };

            /** 写缓存（降级：Redis 故障不阻塞请求，DB 已有数据下次还能查） */
            const cacheKey = `${CACHE_KEYS.AUTH_RESULT}:${accountId}`;
            try {
                await this.cacheService.setex(cacheKey, ACCOUNT_TTL, authData);
            } catch (err) {
                this.logger.warn(
                    `[AdminPermissionGuard] Redis 写入降级（缓存未更新，下次从 DB 重建）: accountId=${accountId} err=${(err as Error).message}`,
                );
            }
            return authData;
        } catch (err) {
            // fail-closed：抛 500 而不是返回 null，避免合法用户被误判为"无权访问"（403）
            this.logger.error(
                `重建账户缓存失败（抛 500 避免误判为权限不足）: accountId=${accountId} err=${(err as Error).message}`,
                (err as Error).stack,
            );
            throw new InternalServerErrorException('系统繁忙，请稍后重试');
        }
    }
}
