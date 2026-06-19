import { Inject, Injectable, Optional } from '@nestjs/common';
import { Gauge, Histogram, register as defaultRegistry, type Registry } from 'prom-client';

/**
 * 从 Registry 中获取已注册的指标（按名称），不存在则创建新的
 * 解决：NestJS 测试多次实例化时 defaultRegistry 重复注册报错
 */
function getOrCreateHistogram<T extends string>(
    opts: ConstructorParameters<typeof Histogram<T>>[0],
    reg: Registry,
): Histogram<T> {
    const existing = reg.getSingleMetric(opts.name) as Histogram<T> | undefined;
    return existing ?? new Histogram({ ...opts, registers: [reg] });
}

function getOrCreateGauge<T extends string>(opts: ConstructorParameters<typeof Gauge<T>>[0], reg: Registry): Gauge<T> {
    const existing = reg.getSingleMetric(opts.name) as Gauge<T> | undefined;
    return existing ?? new Gauge({ ...opts, registers: [reg] });
}

/**
 * DB 指标 Collector（Prisma）
 *
 * 指标设计：
 * - db_query_duration_ms{model, action} — Histogram，单条 Prisma 操作耗时
 * - db_connections_active — Gauge，当前活跃查询数（粗略等同于 Prisma $allOperations 入口计数）
 *
 * 集成状态：skipped due to soft-delete extension conflict
 * - Prisma $extends 链式调用在 prisma.service.ts 中已存在（autoId + softDelete 两层）
 * - 再加一层 metrics 扩展会引入额外 $extends 调用栈，需要保证
 *   metrics extension 内部对 model/operation 的访问与现有扩展兼容
 * - 现有 soft-delete extension 内部会调用 extendedClient[modelKey].update（绕过 query hook），
 *   metrics 扩展如果在更外层，会先于 soft-delete 执行，这可能让 metrics 看到 query 完成但实际写入未发生
 *   （soft-delete 改写 delete → update）— 状态不一致会导致指标与实际不符
 * - spec 明确要求「不破坏软删除扩展」，因此本次只提供 collector 类定义，集成由后续 subagent
 *   评估「先 metrics 再 soft-delete」 vs 「先 soft-delete 再 metrics」两种顺序的指标准确性后再接入
 *
 * 当前用法：
 * - 类实例可在其他服务中注入并通过 DbMetrics API 调用（queryDuration / connectionsActive）
 * - 实际 Prisma extension 集成未启用，所以 DB 指标暂时不增长
 * - 保留 class 是为了在 spec 9.6 验证时 collector 仍能 import 成功（类型契约）
 */
@Injectable()
export class DbMetrics {
    /** Prisma 操作耗时直方图（毫秒） */
    public readonly queryDuration: Histogram<string>;
    /** 当前活跃查询数（Prisma 操作进行中） */
    public readonly connectionsActive: Gauge<string>;

    constructor(@Optional() @Inject('PROMETHEUS_REGISTRY') registry?: Registry) {
        const reg = registry ?? defaultRegistry;

        this.queryDuration = getOrCreateHistogram(
            {
                name: 'db_query_duration_ms',
                help: 'Prisma query duration in milliseconds, labeled by model and action',
                labelNames: ['model', 'action'] as const,
                buckets: [1, 5, 10, 50, 100, 500, 1000, 5000],
            },
            reg,
        );

        this.connectionsActive = getOrCreateGauge(
            {
                name: 'db_connections_active',
                help: 'Number of in-flight Prisma queries',
            },
            reg,
        );
    }
}
