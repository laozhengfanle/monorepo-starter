import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PinoLogger } from 'nestjs-pino';
import { Observable, tap } from 'rxjs';

/**
 * 全局请求/响应日志拦截器
 *
 * 作用：
 * - 记录每个请求 method / url / latencyMs / requestId
 * - 成功 → info 级别
 * - 失败（next.handle 抛错）→ error 级别，并把 err 对象传给 PinoLogger 自动序列化 stack
 *
 * GraphQL 兼容：
 * - GraphQL 请求也走 NestJS 的 Interceptor 链
 * - context.switchToHttp().getRequest() 在 GraphQL context 中不可用
 * - 改用 GqlExecutionContext.create(context).getContext().req 拿原始 Express req
 * - 拿不到 req 时退化为 'GRAPHQL' / 'anonymous'，不抛错
 *
 * DI 选型：
 * - 用 `@Inject(PinoLogger)` 直接注入 nestjs-pino 暴露的 PinoLogger provider
 * - **不要**用 `@InjectPinoLogger(contextName)`：那个装饰器在 nestjs-pino v4 会生成
 *   `PinoLogger:<contextName>` 的 custom token，AppModule 里要提供额外 provider 才能解析
 *   我们这里只想要一个全局 PinoLogger，直接拿默认实例即可
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    constructor(
        @Inject(PinoLogger)
        private readonly logger: PinoLogger,
    ) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const start = Date.now();
        const isGraphQL = context.getType<string>() === 'graphql';

        // 兼容 GraphQL：从 GqlExecutionContext 取原始 req
        const gqlCtx = isGraphQL ? GqlExecutionContext.create(context).getContext() : null;
        const req = (gqlCtx?.req ?? context.switchToHttp().getRequest?.()) as
            | { method?: string; url?: string; id?: string; body?: { operationName?: string } }
            | undefined;

        // GraphQL 没 method/url，operationName 是 GraphQL 唯一的"端点标识"
        const method = req?.method ?? 'GRAPHQL';
        const url = isGraphQL ? (req?.body?.operationName ?? 'anonymous') : req?.url;
        const requestId = req?.id;

        return next.handle().pipe(
            tap({
                next: () => {
                    const latencyMs = Date.now() - start;
                    this.logger.info({ requestId, method, url, latencyMs }, 'request completed');
                },
                error: (err: unknown) => {
                    const latencyMs = Date.now() - start;
                    this.logger.error({ requestId, method, url, latencyMs, err }, 'request failed');
                },
            }),
        );
    }
}
