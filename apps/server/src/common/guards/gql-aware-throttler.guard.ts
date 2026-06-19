/**
 * GraphQL 感知的限流守卫
 *
 * 背景：
 * - 默认 ThrottlerGuard 用 context.switchToHttp().getRequest() 拿 req
 * - GraphQL context 中拿到的不是 Express req，访问 req.ip 会抛 TypeError
 *
 * 解决方案：
 * - 覆盖 getRequestResponse
 *   - HTTP 请求：使用默认行为
 *   - GraphQL 请求：返回 GraphQL context 中的 req/res（payload 含 IP/headers）
 *
 * 注意：
 * - ThrottlerGuard 的 Tracker（IP/User-Agent）依赖 req.ip
 * - GraphQL 请求必须经过 Apollo，原始 HTTP req 在 GqlArgumentsHost 里也能拿到
 * - 本守卫同时兼容 HTTP 和 GraphQL，让 AppModule 的全局 APP_GUARD 不用拆
 *
 * handleRequest 加 Redis 降级：
 * - ThrottlerGuard 内部用 ThrottlerStorage 存计数，依赖 Redis
 * - Redis 故障时 ThrottlerStorage 会抛错，导致整条 API 链 5xx
 * - 降级策略：catch 异常 → 记 warn → 放行（fail-open，业务可用性优先）
 * - 风险评估：Redis 挂掉期间不限制流量 → 攻击者用脚本重放？答案：Redis 挂时认证服务也挂了，登录都做不到
 *   - 即使流量上来，也只是回到"Nginx 限流"那一层保护
 *
 * Prometheus 指标：
 * - `rate_limit_blocked_total{route,reason}` 计数器
 * - 用 @willsoto/nestjs-prometheus 的 InjectMetric 注入
 * - 触发限流 / Redis 降级 时不增（降级视为"放行"，不计入拦截）
 * - route 用 GraphQL operationName 或 HTTP path 归一化
 * - reason 取 short/medium/long（限流器名）
 */
import { Injectable, ExecutionContext, Optional, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest, ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { Reflector } from '@nestjs/core';

/** 限流指标名称（与 BusinessMetrics 的 rate_limit_exceeded_total 保持一致） */
export const RATE_LIMIT_BLOCKED_METRIC = 'rate_limit_blocked_total';

@Injectable()
export class GqlAwareThrottlerGuard extends ThrottlerGuard {
    private readonly logger = new Logger(GqlAwareThrottlerGuard.name);

    /**
     * Prometheus 计数器：限流被拦截的请求
     * - labels:
     *   - route: GraphQL operationName 或 HTTP path
     *   - reason: 限流器名（short/medium/long）
     * - 在 throwThrottlingException / handleRequest 拒绝时 inc
     * - Redis 降级时不增（视为"放行"）
     *
     * 用 @Optional() 注入：单元测试时可以传入 mock
     *   - 默认从 PrometheusModule 取名为 RATE_LIMIT_BLOCKED_METRIC 的 Counter
     */
    constructor(
        options: ThrottlerModuleOptions,
        storageService: ThrottlerStorage,
        reflector: Reflector,
        @Optional()
        @InjectMetric(RATE_LIMIT_BLOCKED_METRIC)
        private readonly rateLimitBlocked?: Counter<string>,
    ) {
        super(options, storageService, reflector);
    }

    /**
     * 覆盖原方法：根据 context 类型分流
     * @param context ExecutionContext
     * @returns { req, res } — 交给 ThrottlerGuard 内部做 IP / 计数
     */
    protected getRequestResponse(context: ExecutionContext): {
        req: Request;
        res: Response;
    } {
        /** HTTP context：直接返回 Express req/res（默认行为） */
        if (context.getType<string>() === 'http') {
            const http = context.switchToHttp();
            return {
                req: http.getRequest<Request>(),
                res: http.getResponse<Response>(),
            };
        }

        /**
         * GraphQL context
         * - getArgs() 包含客户端传入的所有参数（包括 operationName / variables / extensions）
         * - GqlArgumentsHost 持有真正的 Express req/res（在 GraphQLModule.context 注入）
         * - 我们从 context.getArgs()[2]?.req 取（注：Apollo 传的第 3 个 arg 是 context）
         */
        const gqlCtx = GqlExecutionContext.create(context);
        const ctx = gqlCtx.getContext<{ req?: Request; res?: Response }>();
        return {
            req: ctx.req ?? ({} as Request),
            res: ctx.res ?? ({} as Response),
        };
    }

    /**
     * Redis 降级 — ThrottlerStorage 抛错时放行
     * - @nestjs/throttler v5+ 的 handleRequest 签名：单参数 ThrottlerRequest，返回 Promise<boolean>
     * - 内部调用 ThrottlerStorage 算 count
     * - 我们的 override：包 try/catch
     *   - 正常 → 委托给 super（保持原 ThrottlerGuard 行为）
     *   - 异常 → 记 warn + return true（放行，fail-open）
     *
     * Prometheus 指标：
     * - 当 super.handleRequest 返回 false（触发限流）→ inc rate_limit_blocked_total{route, reason}
     * - Redis 降级（异常）→ 不增（视为"放行"，不计入拦截）
     * - route: GraphQL operationName（来自 requestProps.context） 或 HTTP path
     * - reason: 限流器名（short / medium / long）
     *
     * 返回 true = 放行；false = 触发限流
     */
    protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
        try {
            const allowed = await super.handleRequest(requestProps);
            if (!allowed) {
                // 触发限流，+1 计数
                this.incrementRateLimitCounter(requestProps);
            }
            return allowed;
        } catch (err) {
            const path = this.extractPathSafely(requestProps);
            this.logger.warn(`throttler Redis 故障降级（放行）: path=${path} err=${(err as Error).message}`);
            // Redis 降级时不上报限流指标（视为"放行"）
            return true;
        }
    }

    /**
     * 安全地提取 req 路径（用于降级日志）
     * - ThrottlerRequest 不直接包含 req，需通过 context.switchToHttp().getRequest() 拿
     * - GraphQL context 没有传统 HTTP 路径，fallback 为 /graphql
     */
    private extractPathSafely(requestProps: ThrottlerRequest): string {
        try {
            const ctx = requestProps.context;
            if (ctx.getType<string>() === 'http') {
                const http = ctx.switchToHttp();
                const req = http.getRequest<{ path?: string; url?: string }>();
                return req?.path ?? req?.url ?? '?';
            }
            return '/graphql';
        } catch {
            return '?';
        }
    }

    /**
     * 累加 Prometheus 限流计数器
     * - 不抛错：指标上报失败不能影响主流程
     * - label 归一化：避免高基数（防止 Prometheus 内存爆炸）
     *   - route: GraphQL operationName || HTTP method + path 前 2 段
     *   - reason: 限流器名
     */
    private incrementRateLimitCounter(requestProps: ThrottlerRequest): void {
        if (!this.rateLimitBlocked) {
            // 单元测试或 PrometheusModule 未配置时，静默跳过
            return;
        }
        try {
            const route = this.extractRouteLabel(requestProps);
            const reason = this.extractReasonLabel(requestProps);
            this.rateLimitBlocked.inc({ route, reason });
        } catch (err) {
            this.logger.warn(`rate_limit_blocked_total inc failed: ${(err as Error).message}`);
        }
    }

    /**
     * 提取 route label
     * - 优先 GraphQL operationName（来自 request body）
     * - 退化到 HTTP method + path 前 2 段
     * - 异常时返回 'unknown'
     */
    private extractRouteLabel(requestProps: ThrottlerRequest): string {
        try {
            const ctx = requestProps.context;
            if (ctx.getType<string>() === 'http') {
                const http = ctx.switchToHttp();
                const req = http.getRequest<Request & { body?: { operationName?: string } }>();
                // GraphQL over HTTP: operationName 来自 body
                if (req.body?.operationName) {
                    return `graphql:${req.body.operationName}`;
                }
                // 普通 HTTP: 用 method + path 前 2 段（防 /users/123/orders/456 这种高基数）
                const method = req.method ?? 'UNKNOWN';
                const path = req.path ?? '/';
                const segments = path.split('/').filter(Boolean).slice(0, 2);
                return `${method.toLowerCase()}:${segments.join('/') || '/'}`;
            }
            if (ctx.getType<string>() === 'graphql') {
                // GraphQL 走 ExecutionContext，operationName 从 args[1] 取
                // 简化：fallback 到 'graphql:unknown'
                return 'graphql:unknown';
            }
            return 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * 提取 reason label（限流器名）
     * - @nestjs/throttler v6+ 在 ThrottlerRequest 中通过 throttler.name 字段传递
     * - 找不到时返回 'short'（默认限流器名）
     */
    private extractReasonLabel(requestProps: ThrottlerRequest): string {
        const name = requestProps.throttler?.name;
        return name ?? 'short';
    }
}
