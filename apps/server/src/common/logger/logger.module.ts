import { Global, Module } from '@nestjs/common';
import { LoggerModule as NestPinoLoggerModule } from 'nestjs-pino';
import { getPinoConfig } from './logger.config.js';

/**
 * 全局日志模块（包装 nestjs-pino）。
 * - @Global()：业务模块直接 @InjectPinoLogger 使用，无需 import
 * - 必须在 AppModule 的 imports 数组第一位（其他模块初始化时可能用到 logger）
 */
@Global()
@Module({
  imports: [
    NestPinoLoggerModule.forRootAsync({
      useFactory: () =>
        getPinoConfig(process.env.NODE_ENV === 'production' ? 'prod' : 'dev'),
    }),
  ],
  exports: [NestPinoLoggerModule],
})
export class LoggerModule {}
