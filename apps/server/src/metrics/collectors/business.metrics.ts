import { Inject, Injectable, Optional } from '@nestjs/common';
import { Counter, Gauge, register as defaultRegistry, type Registry } from 'prom-client';

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

function getOrCreateGauge<T extends string>(opts: ConstructorParameters<typeof Gauge<T>>[0], reg: Registry): Gauge<T> {
    const existing = reg.getSingleMetric(opts.name) as Gauge<T> | undefined;
    return existing ?? new Gauge({ ...opts, registers: [reg] });
}

/**
 * 业务指标 Collector（事件触发型）
 *
 * 设计原则：
 * - 本类只定义指标结构 + 提供 inc/set 业务语义方法
 * - 实际埋点由调用方在事件发生时触发（auth.service / throttler guard / cache service 等）
 * - spec 9.6 范围内只提供 collector，不集成埋点（避免触碰现有业务模块代码）
 *
 * 指标清单：
 * - login_failures_total{reason}      — 登录失败计数（按原因：密码错误 / 账户不存在 / 已锁定 等）
 * - rate_limit_exceeded_total{limit}  — 限流触发计数（按限流器名称：short/medium/long）
 * - rate_limit_blocked_total{route,reason} — 限流拦截计数（按路由+原因）
 *   - 与 rate_limit_exceeded_total 的区别：route label 让 Grafana 能按端点分组
 *   - rate_limit_exceeded_total 保留作为粗粒度指标（无 route 维度，避免高基数）
 * - cache_hit_ratio{key_prefix}       — 缓存命中率（0~1，由调用方周期性计算后 set）
 *
 * 调用方集成示例（auth.service.ts 登录失败分支）：
 *   this.businessMetrics.incLoginFailure('invalid_password');
 *
 * 调用方集成示例（gql-aware-throttler.guard.ts 拒绝分支）：
 *   this.businessMetrics.incRateLimit('short');
 *   this.businessMetrics.incRateLimitBlocked('graphql:Login', 'short');
 *
 * 调用方集成示例（cache.service.ts 后台任务）：
 *   const ratio = hits / (hits + misses);
 *   this.businessMetrics.setCacheHitRatio('user:', ratio);
 */
@Injectable()
export class BusinessMetrics {
    /** 登录失败计数（按失败原因） */
    public readonly loginFailures: Counter<string>;
    /** 限流触发计数（按限流器名称） */
    public readonly rateLimitExceeded: Counter<string>;
    /**
     * 限流拦截计数（按路由+原因）
     * - GqlAwareThrottlerGuard 用 @InjectMetric 注入此计数器
     * - route label 已归一化（graphql:OpName 或 method:path/seg1/seg2），高基数受控
     */
    public readonly rateLimitBlocked: Counter<string>;
    /** 缓存命中率（0~1） */
    public readonly cacheHitRatio: Gauge<string>;

    constructor(@Optional() @Inject('PROMETHEUS_REGISTRY') registry?: Registry) {
        const reg = registry ?? defaultRegistry;

        this.loginFailures = getOrCreateCounter(
            {
                name: 'login_failures_total',
                help: 'Total login failures, labeled by failure reason',
                labelNames: ['reason'] as const,
            },
            reg,
        );

        this.rateLimitExceeded = getOrCreateCounter(
            {
                name: 'rate_limit_exceeded_total',
                help: 'Total rate-limit rejections, labeled by throttler name',
                labelNames: ['limit'] as const,
            },
            reg,
        );

        this.rateLimitBlocked = getOrCreateCounter(
            {
                name: 'rate_limit_blocked_total',
                help: 'Total rate-limit rejections, labeled by route and throttler name (route is normalized: graphql:OpName or method:path/seg/seg)',
                labelNames: ['route', 'reason'] as const,
            },
            reg,
        );

        this.cacheHitRatio = getOrCreateGauge(
            {
                name: 'cache_hit_ratio',
                help: 'Cache hit ratio (0~1) sampled by background task, labeled by key prefix',
                labelNames: ['key_prefix'] as const,
            },
            reg,
        );
    }

    /**
     * 记录一次登录失败
     * - reason 取值建议：invalid_password / user_not_found / account_locked / captcha_failed / oauth_failed
     */
    incLoginFailure(reason: string): void {
        this.loginFailures.inc({ reason });
    }

    /**
     * 记录一次限流拒绝
     * - limit 取值建议：short / medium / long（对应 ThrottlerModule.forRoot 的三个限流器）
     */
    incRateLimit(limit: string): void {
        this.rateLimitExceeded.inc({ limit });
    }

    /**
     * 记录一次限流拒绝（带 route 维度）
     * - GqlAwareThrottlerGuard 拒绝时调用
     * - route 必须是已归一化的字符串（graphql:OpName 或 method:path/seg/seg）
     *   - 调用方负责归一化，本方法不做强制校验
     *   - 防止高基数 label 把 Prometheus 内存撑爆
     * - reason 取值建议：short / medium / long
     */
    incRateLimitBlocked(route: string, reason: string): void {
        this.rateLimitBlocked.inc({ route, reason });
    }

    /**
     * 上报某 key 前缀的缓存命中率
     * - ratio 必须 ∈ [0, 1]，调用方负责合法性（避免 NaN / 负数污染指标）
     */
    setCacheHitRatio(keyPrefix: string, ratio: number): void {
        this.cacheHitRatio.set({ key_prefix: keyPrefix }, ratio);
    }
}
