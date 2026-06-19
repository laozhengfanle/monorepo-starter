import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { CacheModule } from './common/cache/cache.module.js';
import { SmsModule } from './common/sms/sms.module.js';
import { EmailModule } from './common/email/email.module.js';
import { OAuthModule } from './common/oauth/oauth.module.js';
import { ServicesModule } from './common/services/services.module.js';
import { StorageModule } from './common/storage/storage.module.js';
import { HealthModule } from './common/health/health.module.js';
import { DocsModule } from './modules/docs/docs.module.js';
import { LoggerModule } from './common/logger/logger.module.js';
import { AuditBatchService } from './common/audit/audit-batch.service.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { AccountModule } from './modules/account/account.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { UploadModule } from './modules/upload/upload.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { GraphQLModule } from './modules/graphql/graphql.module.js';
import { SchedulerModule } from './tasks/scheduler.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { HttpMetricsInterceptor } from './metrics/http-metrics.interceptor.js';
import { GraphqlMetricsInterceptor } from './metrics/graphql-metrics.interceptor.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { AdminPermissionGuard } from './common/guards/admin-permission.guard.js';
import { GqlAwareThrottlerGuard } from './common/guards/gql-aware-throttler.guard.js';
import databaseConfig from './common/config/database.config.js';
import authConfig from './common/config/auth.config.js';
import redisConfig from './common/config/redis.config.js';
import storageConfig from './common/config/storage.config.js';
import oauthConfig from './common/config/oauth.config.js';

@Module({
    imports: [
        /**
         * Phase 9 全局日志模块（@Global）
         * - 必须在 imports 数组**第一位**，原因：
         *   其它模块（Throttler / JwtAuthGuard / GlobalExceptionFilter 等）
         *   在初始化时可能调用 Logger，LoggerModule 必须先就绪
         * - 包装 nestjs-pino，dev 用 pino-pretty，prod 输出 JSON
         */
        LoggerModule,
        /** 配置管理 — Zod 校验 fail-fast，按域拆分 */
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
            load: [databaseConfig, authConfig, redisConfig, storageConfig, oauthConfig],
        }),
        /** HTTP 限流 — 全局默认 100 次/60 秒，登录端点单独覆盖 */
        ThrottlerModule.forRoot([
            {
                name: 'short',
                ttl: 1000,
                limit: 3,
            },
            {
                name: 'medium',
                ttl: 10000,
                limit: 20,
            },
            {
                name: 'long',
                ttl: 60000,
                limit: 100,
            },
        ]),
        /** Prisma 全局模块 — 数据库连接 */
        PrismaModule,
        /** 缓存全局模块 — Redis / 内存缓存 */
        CacheModule,
        /** 存储全局模块 — 本地 / S3 存储驱动 */
        StorageModule,
        /** 账户全局模块 — 账户 CRUD */
        AccountModule,
        /**
         * Phase 8 短信模块（@Global）
         * - SmsService 由 SMS 验证码发送 / 校验 + Provider 切换
         * - 任何模块都可直接注入 SmsService
         */
        SmsModule,
        /**
         * 邮件模块（@Global）
         * - EmailService 由邮件验证码 + 任意通知发送
         * - 当前仅 mock provider
         */
        EmailModule,
        /**
         * Phase 8 第三方登录模块（@Global）
         * - OAuthService / OAuthController 集中处理微信 / Apple 登录
         * - state 一次性消费 + bind / unbind 安全检查
         */
        OAuthModule,
        /**
         * 通用服务模块（@Global）— TokenBlacklistService / RedisDegradationService
         * - 提供 token 撤销中心 + Redis 降级（safeGet / tryWithFallback）
         * - 任何模块可注入，不需额外 import
         */
        ServicesModule,
        /** 健康检查模块 */
        HealthModule,
        /** 文档模块 — /api/docs 文件列表 + /api/docs/:slug 内容读取 */
        DocsModule,
        /** 认证模块 — 登录 / 刷新 / 登出 */
        AuthModule,
        /** 管理端模块 — 角色 / 菜单 / 权限缓存 */
        AdminModule,
        /** 上传模块 — 头像 / 文件上传 */
        UploadModule,
        /** 审计全局模块 — 敏感操作日志 */
        AuditModule,
        /** Dashboard 模块 — 统计图表数据 */
        DashboardModule,
        /** GraphQL API 网关 — 所有数据查询走 /graphql */
        GraphQLModule,
        /**
         * Phase 9 Prometheus 监控模块
         * - 暴露 /metrics 端点（仅内网可访问，由 MetricsIpGuard 保护）
         * - 4 个 collector：HTTP / GraphQL / DB / 业务
         * - HttpMetricsInterceptor / GraphqlMetricsInterceptor 通过下面的 APP_INTERCEPTOR 注册为全局
         */
        MetricsModule,
        /** 定时任务模块 — 启用 @nestjs/schedule，注册 CleanupTask / MonitorTask */
        SchedulerModule,
    ],
    providers: [
        /**
         * 审计日志批量写入服务
         * - 提供给 AuditService 和其他业务服务调用
         * - 50 条/5s 批量写入 audit_log
         * - onApplicationShutdown 自动 flush + 失败回滚到 logs/audit-fallback.ndjson
         */
        AuditBatchService,
        /**
         * 全局限流守卫 — 兼容 GraphQL context
         * - 默认 ThrottlerGuard 在 GraphQL 中访问 req.ip 会抛 TypeError
         * - 用 GqlAwareThrottlerGuard 同时支持 HTTP + GraphQL
         */
        { provide: APP_GUARD, useClass: GqlAwareThrottlerGuard },
        /** 全局 JWT 守卫 — 所有路由默认需要认证，@Public() 跳过 */
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        /** 全局管理员权限守卫 — 校验 RBAC 权限，@Permission() 标记所需权限码 */
        { provide: APP_GUARD, useClass: AdminPermissionGuard },
        /**
         * 统一全局异常过滤器 — REST + GraphQL 异常脱敏
         * - HTTP 请求：返回 JSON 格式业务错误码（生产环境脱敏）
         * - GraphQL 请求：转换为带业务错误码的 GraphQLError
         * - 合并原 GlobalExceptionFilter + GraphQLExceptionFilter，解决双 @Catch() re-throw 冲突
         */
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        /**
         * Phase 9 全局请求/响应日志拦截器
         * - 记录 method / url / latencyMs / requestId
         * - 成功 → info 级别；失败 → error 级别
         * - 兼容 GraphQL context（从 GqlExecutionContext 取 operationName）
         */
        { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
        /**
         * Phase 9 Prometheus 指标 Interceptor（全局）
         * - HttpMetricsInterceptor：HTTP 请求耗时 / 计数 / inFlight（自动跳过 GraphQL 上下文）
         * - GraphqlMetricsInterceptor：GraphQL operation 耗时 / 错误数（自动跳过 HTTP 上下文）
         * - 与 LoggingInterceptor 互不干扰：日志记 method/url/statusCode/latencyMs，指标同名埋点但用于 Prometheus
         */
        { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
        { provide: APP_INTERCEPTOR, useClass: GraphqlMetricsInterceptor },
    ],
})
export class AppModule {}
