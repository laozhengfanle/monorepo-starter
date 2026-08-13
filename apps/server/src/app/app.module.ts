import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/env.validation.js';
import { HealthModule } from '../health/health.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', 'apps/server/.env'],
    }),
    HealthModule,
    UsersModule,
  ],
})
export class AppModule {}
