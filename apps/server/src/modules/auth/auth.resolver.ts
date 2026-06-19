/**
 * 认证模块 GraphQL Resolver
 *
 * 暴露的 Query：
 * - me: 获取当前登录用户信息（按 userType 返回 AdminMe 或 MemberMe）
 *
 * 设计要点：
 * - 使用 @UseGuards(JwtAuthGuard) 强制要求 JWT 认证
 * - 通过 @Context() 拿到 ctx.req.user（含 accountId, userType）
 * - 根据 userType 分发到 MeService 的不同方法
 * - 返回类型用 MeUnion（GraphQL 自动按运行时对象判别具体类型）
 *
 * 注意事项：
 * - MeUnion 的 resolveType 通过 userType 字段判别，所以返回值必须包含该字段
 *   （由 MeService.getAdminMe / getMemberMe 自动设置）
 * - 显式 @UseGuards(JwtAuthGuard) 是双保险：即使 APP_GUARD 被移除，me 端点仍需鉴权
 */
import { UseGuards, UnauthorizedException } from '@nestjs/common';
import { Context, Query, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MeService } from './me.service.js';
import { MeUnion } from './auth.type.js';
import type { DataLoaders } from '../../common/dataloader/index.js';

/**
 * GraphQL 上下文类型（与 graphql.module.ts 的 context 注入对应）
 * - req.user 由 JwtAuthGuard 注入，含 { accountId, userType }
 * - dataloaders 由 GraphQLModule 构造（按请求隔离的 DataLoader 实例集合）
 */
interface GqlContext {
    req: {
        user?: {
            accountId: string;
            userType: string;
        };
    };
    dataloaders?: DataLoaders;
}

@Resolver()
export class AuthResolver {
    constructor(private readonly meService: MeService) {}

    /**
     * 当前用户信息查询
     *
     * 前端用法：
     * ```graphql
     * # Admin 端
     * query {
     *   me {
     *     ... on AdminMe {
     *       accountId
     *       username
     *       nickname
     *       roles
     *       permissions
     *       menus { id name path children { id name } }
     *     }
     *   }
     * }
     *
     * # C 端
     * query {
     *   me {
     *     ... on MemberMe {
     *       accountId
     *       nickname
     *       avatar
     *       roles
     *     }
     *   }
     * }
     * ```
     *
     * 错误码：
     * - 20003: 未携带有效 JWT（由 JwtAuthGuard 抛出）
     * - 10002: 账户不存在或被删除（由 MeService 抛出）
     */
    @Query(() => MeUnion, {
        description: '当前登录用户信息（管理端或 C 端），按 JWT 中的 userType 字段自动判别',
    })
    @UseGuards(JwtAuthGuard)
    async me(@Context() context: GqlContext) {
        /** JWT Guard 已保证 user 存在；TS 不知道，所以加防御性检查 */
        const user = context.req.user;
        if (!user) {
            /**
             * 防御性检查：理论上 JwtAuthGuard 已通过 APP_GUARD 拦截了所有未鉴权请求
             * - 这里用 UnauthorizedException（20003）而不是 Error 抛错
             * - 由 GraphQLExceptionFilter 统一转换为带业务码的 GraphQLError
             */
            throw new UnauthorizedException('未认证');
        }

        const { accountId, userType } = user;
        switch (userType) {
            case 'admin':
                // 把 ctx.dataloaders 传给 service，启用 DataLoader 路径（消除 N+1）
                return this.meService.getAdminMe(accountId, context.dataloaders);
            case 'member':
                return this.meService.getMemberMe(accountId);
            default:
                /**
                 * 未知 userType：JWT 签发时 userType 是 admin 或 member
                 * 出现其他值说明 token 被篡改或代码 bug，统一视为未授权
                 */
                throw new UnauthorizedException(`Unsupported user type: ${userType}`);
        }
    }
}
