import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * JWT 认证守卫（兼容 GraphQL）
 *
 * 解决问题：
 * - 默认 AuthGuard 用 context.switchToHttp().getRequest() 拿 req
 * - GraphQL context 中拿到的不是 Express req，而是 GraphQL wrapper { req, res, timeout }
 * - 修复后：HTTP 走默认逻辑；GraphQL 走 GqlExecutionContext 提取 Express req
 *
 * 工作流程：
 * 1. canActivate 接收 ExecutionContext（可能是 HTTP 或 GraphQL）
 * 2. getRequest 根据上下文类型返回真正的 Express req
 * 3. passport-jwt 拿到正确的 req（带 Authorization 头 + logIn 方法）
 *
 * 与 IsPublic 的协作：
 * - @Public() 装饰器标记的路由完全跳过 JWT 验证
 * - 配合 @Permission() 实现 RBAC（AdminPermissionGuard）
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private readonly reflector: Reflector) {
        super();
    }

    /**
     * 决定是否激活 guard
     * - 如果是 @Public() 路由，直接放行
     * - 否则调用父类的 passport 验证流程
     */
    canActivate(context: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        return super.canActivate(context);
    }

    /**
     * 覆盖父类：返回真正的 Express req
     * - HTTP context：context.switchToHttp().getRequest()
     * - GraphQL context：从 GqlExecutionContext 提取原始 req
     */
    getRequest(context: ExecutionContext) {
        if (context.getType<string>() === 'graphql') {
            const gqlCtx = GqlExecutionContext.create(context);
            const ctx = gqlCtx.getContext<{ req?: unknown }>();
            return ctx.req;
        }
        return context.switchToHttp().getRequest();
    }
}
