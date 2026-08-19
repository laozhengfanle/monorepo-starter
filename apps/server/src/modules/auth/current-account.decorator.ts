import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { AuthAccount } from './auth.types.js';

/**
 * 当前登录账户装饰器：从 request.account 取值。
 * - REST：switchToHttp().getRequest()
 * - GraphQL：GqlExecutionContext 取 req
 */
export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthAccount => {
    const type = context.getType<string>();
    const req =
      type === 'graphql'
        ? GqlExecutionContext.create(context).getContext().req
        : context.switchToHttp().getRequest();
    return req.account as AuthAccount;
  },
);
