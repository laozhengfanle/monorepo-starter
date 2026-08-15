import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../common/cache/cache.module.js';
import { GraphQLModule } from '../common/graphql/graphql.module.js';
import { LoggerModule } from '../common/logger/logger.module.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { AuthModule } from '../modules/auth/auth.module.js';
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
    GraphQLModule,
    AuthModule,
    HealthModule,
    UsersModule,
  ],
})
export class AppModule {}
