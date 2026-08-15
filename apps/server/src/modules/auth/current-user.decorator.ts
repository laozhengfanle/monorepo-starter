import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { AuthUser } from './auth.types.js';

/**
 * 当前登录用户装饰器：从 request.user 取值。
 * - REST：switchToHttp().getRequest()
 * - GraphQL：GqlExecutionContext 取 req
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const type = context.getType<string>();
    const req =
      type === 'graphql'
        ? GqlExecutionContext.create(context).getContext().req
        : context.switchToHttp().getRequest();
    return req.user as AuthUser;
  },
);
