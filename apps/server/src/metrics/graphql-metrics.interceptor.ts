import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable, tap } from 'rxjs';
import { GraphqlMetrics } from './collectors/graphql.metrics.js';

/**
 * GraphQL 指标埋点 Interceptor
 *
 * 触发条件：
 * - 仅当 context 类型为 'graphql'（通过 GqlExecutionContext.create() 提取 info）
 * - HTTP 请求走 HttpMetricsMiddleware，GraphQL 请求走本 Interceptor，互不交叉
 *
 * 标签取值：
 * - operation_name — info.fieldName（resolver 方法名，如 'me' / 'login' / 'adminAccounts'）
 * - operation_type — info.operation.operation（'query' / 'mutation' / 'subscription'）
 * - code — err.extensions.code（业务错误码）或 'UNKNOWN'
 *
 * 关于错误埋点：
 * - success 路径（tap.next）：仅记录耗时
 * - error 路径（tap.error）：同时记录耗时 + 错误计数
 *   - 注意：tap.error 不会阻止错误继续冒泡到 GlobalExceptionFilter，所以 GraphQL 错误响应不受影响
 *   - 不使用 catchError，因为需要在原 error 流中记录，catchError 会吞噬错误
 */
@Injectable()
export class GraphqlMetricsInterceptor implements NestInterceptor {
    constructor(private readonly graphqlMetrics: GraphqlMetrics) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        // 非 GraphQL 上下文直接跳过（HTTP 走 HttpMetricsMiddleware）
        if (context.getType<string>() !== 'graphql') {
            return next.handle();
        }

        // 提取 GraphQL info（fieldName / operation）
        const gqlCtx = GqlExecutionContext.create(context);
        const info = gqlCtx.getInfo<{
            fieldName?: string;
            operation?: { operation?: string };
        } | null>();
        const operationName = info?.fieldName ?? 'unknown';
        const operationType = info?.operation?.operation ?? 'unknown';

        const start = Date.now();
        return next.handle().pipe(
            tap({
                next: () => {
                    this.graphqlMetrics.queryDuration.observe(
                        { operation_name: operationName, operation_type: operationType },
                        Date.now() - start,
                    );
                },
                error: (err: { extensions?: { code?: string } }) => {
                    const code = err?.extensions?.code ?? 'UNKNOWN';
                    this.graphqlMetrics.queryErrors.inc({ operation_name: operationName, code });
                    this.graphqlMetrics.queryDuration.observe(
                        { operation_name: operationName, operation_type: operationType },
                        Date.now() - start,
                    );
                },
            }),
        );
    }
}
