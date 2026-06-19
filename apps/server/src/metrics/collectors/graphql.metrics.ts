import { Inject, Injectable, Optional } from '@nestjs/common';
import { Counter, Histogram, register as defaultRegistry, type Registry } from 'prom-client';

/**
 * 从 Registry 中获取已注册的指标（按名称），不存在则创建新的
 * 解决：NestJS 测试多次实例化时 defaultRegistry 重复注册报错
 */
function getOrCreateCounter<T extends string>(
    opts: ConstructorParameters<typeof Counter<T>>[0],
    reg: Registry,
): Counter<T> {
    const existing = reg.getSingleMetric(opts.name) as Counter<T> | undefined;
    return existing ?? new Counter({ ...opts, registers: [reg] });
}

function getOrCreateHistogram<T extends string>(
    opts: ConstructorParameters<typeof Histogram<T>>[0],
    reg: Registry,
): Histogram<T> {
    const existing = reg.getSingleMetric(opts.name) as Histogram<T> | undefined;
    return existing ?? new Histogram({ ...opts, registers: [reg] });
}

/**
 * GraphQL 指标 Collector
 *
 * 指标设计：
 * - graphql_query_duration_ms{operation_name, operation_type} — Histogram，单次 GraphQL 操作耗时
 * - graphql_query_errors_total{operation_name, code} — Counter，错误次数（按 GraphQL 业务错误码分桶）
 *
 * 桶位选择（10ms ~ 5s）：
 * - 内部管理端 query 正常 50-200ms
 * - 复杂 query（如 Dashboard 聚合）500-1000ms
 * - 超过 5s 视为异常，需要查慢查询 / N+1
 *
 * 关于 operation_name：
 * - 优先取 GraphQL info.fieldName（resolver 方法名）
 * - fallback 'unknown'（批处理 / 内省场景拿不到 field name）
 *
 * 关于 code：
 * - 取 GraphQL error extensions.code（业务错误码，由 GraphQLExceptionFilter / ZodArgsPipe 写入）
 * - fallback 'UNKNOWN'（非 GraphQLError 或缺 extensions）
 */
@Injectable()
export class GraphqlMetrics {
    /** GraphQL 查询耗时直方图（毫秒） */
    public readonly queryDuration: Histogram<string>;
    /** GraphQL 错误计数（按 operation_name + 业务错误码） */
    public readonly queryErrors: Counter<string>;

    constructor(@Optional() @Inject('PROMETHEUS_REGISTRY') registry?: Registry) {
        const reg = registry ?? defaultRegistry;

        this.queryDuration = getOrCreateHistogram(
            {
                name: 'graphql_query_duration_ms',
                help: 'GraphQL query duration in milliseconds, labeled by operation_name and operation_type',
                labelNames: ['operation_name', 'operation_type'] as const,
                buckets: [10, 50, 100, 500, 1000, 5000],
            },
            reg,
        );

        this.queryErrors = getOrCreateCounter(
            {
                name: 'graphql_query_errors_total',
                help: 'Total GraphQL errors, labeled by operation_name and business error code',
                labelNames: ['operation_name', 'code'] as const,
            },
            reg,
        );
    }
}
