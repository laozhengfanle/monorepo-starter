import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

/**
 * GraphQL 兼容的限流守卫。
 * @nestjs/throttler 的 ThrottlerGuard 默认用 switchToHttp() 取 req/res，
 * GraphQL 上下文下需经 GqlExecutionContext 取 context.req。
 * （这是 throttler 官方提供的扩展点 getRequestResponse 的标准覆写，见官方文档）
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected override getRequestResponse(
    context: ExecutionContext,
  ): { req: Request; res: Response } {
    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      return {
        req: gqlCtx.getContext().req,
        res: gqlCtx.getContext().res,
      };
    }
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
