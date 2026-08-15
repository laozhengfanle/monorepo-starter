import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { CacheModule } from '../common/cache/cache.module.js';
import { GraphQLModule } from '../common/graphql/graphql.module.js';
import { LoggerModule } from '../common/logger/logger.module.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { GqlThrottlerGuard } from '../common/throttler/gql-throttler.guard.js';
import { AuthModule } from '../modules/auth/auth.module.js';
import { AdminAccountModule } from '../modules/admin-account/admin-account.module.js';
import { AdminRoleModule } from '../modules/admin-role/admin-role.module.js';
import { UploadModule } from '../modules/upload/upload.module.js';
import { WsModule } from '../modules/ws/ws.module.js';
import { validateEnv } from '../config/env.validation.js';
import { HealthModule } from '../health/health.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [
    // LoggerModule 必须在第一位（其他模块初始化时可能用到 logger）
    LoggerModule,
    PrismaModule,
    CacheModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', 'apps/server/.env'],
    }),
    // 全局限流（官方推荐）：默认 100 次/分钟，按 IP；登录等敏感端点用 @Throttle 单独收紧
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    // Prometheus 监控：默认 /metrics 端点 + 默认指标（官方推荐集成）
    PrometheusModule.register(),
    GraphQLModule,
    AuthModule,
    AdminAccountModule,
    AdminRoleModule,
    UploadModule,
    WsModule,
    HealthModule,
    UsersModule,
  ],
  providers: [
    // 全局限流守卫（GraphQL 兼容）
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
  ],
})
export class AppModule {}
