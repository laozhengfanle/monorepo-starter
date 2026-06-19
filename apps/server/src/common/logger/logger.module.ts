import { Global, Module } from '@nestjs/common';
import { LoggerModule as NestPinoLoggerModule } from 'nestjs-pino';
import { getPinoConfig } from './logger.config.js';

/**
 * 全局日志模块（包装 nestjs-pino）
 *
 * 关键点：
 * - @Global()：业务模块无需 import LoggerModule，直接 @InjectPinoLogger 即可
 * - forRootAsync + useFactory：根据 NODE_ENV 切换 dev / prod 配置
 * - 必须在 AppModule 的 imports 数组**第一个**位置（详见 AppModule 注释）
 *   原因：其它模块（如 Throttler / JwtAuthGuard）的 logger 初始化要早于它们自己
 */
@Global()
@Module({
    imports: [
        NestPinoLoggerModule.forRootAsync({
            useFactory: () => getPinoConfig(process.env.NODE_ENV === 'production' ? 'prod' : 'dev'),
        }),
    ],
    // 重新导出 nestjs-pino 模块的 providers（如 PinoLogger），让 @Global 生效
    exports: [NestPinoLoggerModule],
})
export class LoggerModule {}
