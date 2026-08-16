import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import {
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
  type ThrottlerLimitDetail,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { BusinessMetrics } from '../metrics/business.metrics.js';

/**
 * GraphQL 兼容的限流守卫。
 * @nestjs/throttler 的 ThrottlerGuard 默认用 switchToHttp() 取 req/res，
 * GraphQL 上下文下需经 GqlExecutionContext 取 context.req。
 * （这是 throttler 官方提供的扩展点 getRequestResponse 的标准覆写，见官方文档）
 *
 * 增强：限流拦截时上报业务指标（rate_limit_blocked_total{route,reason}），
 * 便于 Grafana 监控哪些路由被限流。
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly metrics: BusinessMetrics,
  ) {
    super(options, storageService, reflector);
  }

  protected override getRequestResponse(context: ExecutionContext): {
    req: Request;
    res: Response;
  } {
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

  /** 限流触发时上报指标（route 归一化，避免高基数） */
  protected override throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const route = this.resolveRoute(context);
    this.metrics.incRateLimitBlocked(route, 'throttled');
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }

  /** 归一化路由标识：graphql:OpName 或 method:path */
  private resolveRoute(context: ExecutionContext): string {
    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const info = gqlCtx.getInfo();
      const opName = info?.operation?.name?.value;
      return opName ? `graphql:${opName}` : 'graphql:anonymous';
    }
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const method = req.method ?? 'UNKNOWN';
    const path = (req.route?.path ?? req.path ?? '').replace(/\/\d+/g, '/:id');
    return `${method}:${path}`;
  }
}
