import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { HttpMetrics } from './collectors/http.metrics.js';
import { GraphqlMetrics } from './collectors/graphql.metrics.js';
import { DbMetrics } from './collectors/db.metrics.js';
import { BusinessMetrics } from './collectors/business.metrics.js';
import { MetricsController } from './metrics.controller.js';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';
import { GraphqlMetricsInterceptor } from './graphql-metrics.interceptor.js';

/**
 * Prometheus 监控模块（Phase 9.6）
 *
 * 组成：
 * - PrometheusModule.register：注册 prom-client + 默认指标 + /metrics 端点
 * - 自定义 MetricsController 继承 PrometheusController，加 @UseGuards(MetricsIpGuard) 内网白名单
 * - 4 个 collector（HttpMetrics / GraphqlMetrics / DbMetrics / BusinessMetrics）作为 providers 和 exports
 * - HttpMetricsInterceptor / GraphqlMetricsInterceptor 通过 APP_INTERCEPTOR 在 app.module.ts 注册为全局
 *
 * 路径前缀注意：
 * - PrometheusModule.register({ path: '/metrics' }) 通过 Reflect.defineMetadata 写入 controller
 *   直接覆盖 NestJS 全局 prefix 行为，因此 setGlobalPrefix('api', exclude:['graphql']) 不会影响
 *   /metrics 路径（仍为 /metrics 而非 /api/metrics）
 *
 * 不使用 @Global：
 * - 4 个 collector 类是 metrics 子系统内部组件，业务模块（auth/throttler/cache）后续接入时
 *   通过显式 imports MetricsModule 引入，避免污染整个应用 DI 容器
 * - 如果未来要全局使用，可加 @Global() 装饰器
 */
@Module({
    imports: [
        PrometheusModule.register({
            /** 自定义 controller 继承 PrometheusController，用于添加 IP 白名单 guard */
            controller: MetricsController,
            /** 启用 prom-client 默认指标（process_cpu / nodejs_eventloop / ...） */
            defaultMetrics: { enabled: true },
            /** 端点路径，写入 controller 的 path metadata（覆盖 setGlobalPrefix 行为） */
            path: '/metrics',
        }),
    ],
    providers: [
        HttpMetrics,
        GraphqlMetrics,
        DbMetrics,
        BusinessMetrics,
        HttpMetricsInterceptor,
        GraphqlMetricsInterceptor,
    ],
    exports: [
        HttpMetrics,
        GraphqlMetrics,
        DbMetrics,
        BusinessMetrics,
        HttpMetricsInterceptor,
        GraphqlMetricsInterceptor,
    ],
})
export class MetricsModule {}
