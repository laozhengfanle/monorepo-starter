import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { HttpMetrics } from './collectors/http.metrics.js';

/**
 * HTTP 指标埋点 Interceptor
 *
 * 职责：
 * - 每个 HTTP 请求进入时增加 inFlight 计数
 * - controller 处理完成后（next.handle() 完成）记录耗时 + 请求总数 + 减少 inFlight
 *
 * 为什么用 Interceptor 而非 Middleware：
 * - Middleware 通过 NestModule.configure(consumer) 注册，子模块的 forRoutes('*') 不会跨模块生效
 *   （子模块的 configure 仅作用于该模块自己 import 的 routes）
 * - Interceptor 通过 APP_INTERCEPTOR token 注册为全局，零配置生效
 * - Interceptor 同时支持 HTTP 和 GraphQL 上下文分发（用 context.getType() 判断）
 *   - GraphQL 走独立的 GraphqlMetricsInterceptor，本 Interceptor 自动跳过非 http 上下文
 *
 * 标签取值：
 * - method — HTTP 动词（GET / POST / ...）
 * - route — 优先 req.route?.path（路由模板，如 /api/users/:id，避免高基数），
 *           fallback 到 req.path（未匹配路由的请求会得到原始路径）
 * - status_code — res.statusCode（响应时的最终状态码）
 *
 * 与 LoggingInterceptor 的关系：
 * - LoggingInterceptor 记录 method/url/statusCode/latencyMs/requestId（用于日志）
 * - 本 Interceptor 记录同名指标（用于 Prometheus）
 * - 两份独立埋点互不干扰，避免在 LoggingInterceptor 改动时影响指标
 *
 * 关于 tap.next vs res.on('finish')：
 * - 本实现用 tap.next（next.handle() 完成后立即触发），此时 res.statusCode 已设置、controller 已返回
 * - 'finish' 事件会延迟到响应真正 flush 到 socket，inFlight dec 略晚但不影响监控语义
 * - 选用 tap 避免监听 res 事件，防止事件监听器未清理导致内存泄漏
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
    constructor(private readonly httpMetrics: HttpMetrics) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        // 非 HTTP 上下文直接跳过（GraphQL 走 GraphqlMetricsInterceptor）
        if (context.getType<string>() !== 'http') {
            return next.handle();
        }

        const http = context.switchToHttp();
        const req = http.getRequest<Request>();
        const res = http.getResponse<Response>();

        const start = Date.now();
        this.httpMetrics.inFlight.inc();

        return next.handle().pipe(
            tap({
                next: () => this.record(req, res, start),
                error: () => this.record(req, res, start),
            }),
        );
    }

    /**
     * 写入 HTTP 指标（成功 / 失败路径通用）
     * - 减少 inFlight
     * - 累计 requests_total{method, route, status_code}
     * - 记录 request_duration_ms{method, route}
     */
    private record(req: Request, res: Response, start: number): void {
        this.httpMetrics.inFlight.dec();
        const route = req.route?.path ?? req.path;
        const method = req.method;
        const statusCode = String(res.statusCode);
        this.httpMetrics.requestsTotal.inc({ method, route, status_code: statusCode });
        this.httpMetrics.requestDuration.observe({ method, route }, Date.now() - start);
    }
}
