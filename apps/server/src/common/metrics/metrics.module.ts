import { Global, Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { BusinessMetrics } from './business.metrics.js';

/**
 * 业务指标模块（全局）
 *
 * - PrometheusModule：默认 /metrics 端点 + 默认指标（Node.js 运行时指标）
 * - BusinessMetrics：业务指标收集器（登录失败/限流/审计/上传/缓存命中率）
 *
 * 埋点方式：任何模块注入 BusinessMetrics 后调用语义方法（incLoginFailure 等）。
 * @Global：各业务模块（auth/throttler/audit 等）无需重复 import。
 */
@Global()
@Module({
  imports: [PrometheusModule.register()],
  providers: [BusinessMetrics],
  exports: [BusinessMetrics],
})
export class MetricsModule {}
