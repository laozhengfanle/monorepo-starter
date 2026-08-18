import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { BusinessMetrics } from './business.metrics.js';
import { MetricsIpWhitelistMiddleware } from './metrics-ip-whitelist.middleware.js';

/**
 * 业务指标模块（全局）
 *
 * - PrometheusModule：/metrics 端点 + 默认指标（Node.js 运行时指标）
 * - MetricsIpWhitelistMiddleware：/metrics 加 IP 白名单
 *   （METRICS_ALLOWED_IPS 逗号分隔；默认仅本机 127.0.0.1/::1，k8s 探针/采集器可配置）
 * - BusinessMetrics：业务指标收集器（登录失败/限流/审计/上传/缓存命中率）
 *
 * 埋点方式：任何模块注入 BusinessMetrics 后调用语义方法（incLoginFailure 等）。
 * @Global：各业务模块（auth/throttler/audit 等）无需重复 import。
 */
@Global()
@Module({
  imports: [PrometheusModule.register({ path: '/metrics' })],
  providers: [BusinessMetrics, MetricsIpWhitelistMiddleware],
  exports: [BusinessMetrics],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // /metrics 运维端点加 IP 白名单（按路径匹配，覆盖 PrometheusModule 注册的控制器路由）
    consumer.apply(MetricsIpWhitelistMiddleware).forRoutes('/metrics');
  }
}
