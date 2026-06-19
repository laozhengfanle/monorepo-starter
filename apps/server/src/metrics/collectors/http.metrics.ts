import { Inject, Injectable, Optional } from '@nestjs/common';
import { Counter, Gauge, Histogram, register as defaultRegistry, type Registry } from 'prom-client';

/**
 * 从 Registry 中获取已注册的指标（按名称），不存在则创建新的
 * 解决：NestJS 测试多次实例化 HttpMetrics 时 defaultRegistry 重复注册报错
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

function getOrCreateGauge<T extends string>(opts: ConstructorParameters<typeof Gauge<T>>[0], reg: Registry): Gauge<T> {
    const existing = reg.getSingleMetric(opts.name) as Gauge<T> | undefined;
    return existing ?? new Gauge({ ...opts, registers: [reg] });
}

/**
 * HTTP 指标 Collector
 *
 * 指标设计：
 * - http_requests_total{method, route, status_code} — Counter，请求总数，按 method/route/status 分桶
 * - http_request_duration_ms{method, route} — Histogram，请求耗时（毫秒），桶位覆盖 10ms ~ 5s
 * - http_requests_in_flight — Gauge，当前在飞请求数
 *
 * 桶位选择依据（生产 HTTP API 经验值）：
 * - 10ms / 50ms / 100ms：覆盖健康内部 API
 * - 500ms / 1000ms：一般 BFF / 中等复杂查询
 * - 5000ms：异常慢请求告警阈值
 *
 * 关于 Registry 注入：
 * - 默认情况直接用 prom-client 全局 register（@willsoto/nestjs-prometheus 也读这个 register）
 * - 测试场景可传入独立 Registry 隔离断言
 */
@Injectable()
export class HttpMetrics {
    /** 请求总数（按 method / route / status_code 标签） */
    public readonly requestsTotal: Counter<string>;
    /** 请求耗时直方图（毫秒，按 method / route 标签） */
    public readonly requestDuration: Histogram<string>;
    /** 当前在飞请求数（无标签，全局唯一） */
    public readonly inFlight: Gauge<string>;

    constructor(@Optional() @Inject('PROMETHEUS_REGISTRY') registry?: Registry) {
        // 测试环境可能传入独立 Registry；运行时全局 register 由 prom-client 提供
        const reg = registry ?? defaultRegistry;

        this.requestsTotal = getOrCreateCounter(
            {
                name: 'http_requests_total',
                help: 'Total HTTP requests, labeled by method, route, and status code',
                labelNames: ['method', 'route', 'status_code'] as const,
            },
            reg,
        );

        this.requestDuration = getOrCreateHistogram(
            {
                name: 'http_request_duration_ms',
                help: 'HTTP request duration in milliseconds, labeled by method and route',
                labelNames: ['method', 'route'] as const,
                buckets: [10, 50, 100, 500, 1000, 5000],
            },
            reg,
        );

        this.inFlight = getOrCreateGauge(
            {
                name: 'http_requests_in_flight',
                help: 'Number of HTTP requests currently in flight',
            },
            reg,
        );
    }
}
