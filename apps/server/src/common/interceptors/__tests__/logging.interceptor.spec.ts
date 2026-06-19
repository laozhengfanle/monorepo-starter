import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import { LoggingInterceptor } from '../logging.interceptor';
import type { PinoLogger } from 'nestjs-pino';

/**
 * LoggingInterceptor 单元测试
 *
 * 覆盖场景：
 * 1. Happy path：next.handle() 返回正常值 → logger.info 被调 + 含 requestId/latencyMs
 * 2. Error path：next.handle() 抛错 → logger.error 被调
 * 3. HTTP context：method / url 从 req 来
 * 4. GraphQL context：method = 'GRAPHQL'，url = operationName
 * 5. 缺失 req（极端 case）：不抛错，url = 'anonymous'
 */
describe('LoggingInterceptor', () => {
    /** mock PinoLogger：只关心 info / error 是否被调 + 参数 */
    const buildLogger = () =>
        ({
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            trace: vi.fn(),
            fatal: vi.fn(),
            setContext: vi.fn(),
            assign: vi.fn(),
        }) as unknown as PinoLogger;

    /** 构造一个 mock ExecutionContext */
    const buildContext = (overrides: {
        type?: 'http' | 'graphql';
        req?: {
            method?: string;
            url?: string;
            id?: string;
            body?: { operationName?: string };
        };
    }): ExecutionContext => {
        const type = overrides.type ?? 'http';
        const req = overrides.req ?? {};
        // GqlExecutionContext.create() 需要 getArgs() 返回 [root, args, context, info] 4 元素
        // context（第 3 个元素）会作为 getContext() 的返回值，我们把 req 放进去
        return {
            getType: () => type,
            getClass: () => class MockController {},
            getHandler: () => () => {},
            getArgs: () => [{}, {}, { req }, {}],
            switchToHttp: () => ({
                getRequest: () => req,
                getResponse: () => ({}),
                getNext: () => () => {},
            }),
        } as unknown as ExecutionContext;
    };

    let logger: PinoLogger;
    let interceptor: LoggingInterceptor;

    beforeEach(() => {
        logger = buildLogger();
        interceptor = new LoggingInterceptor(logger);
    });

    // ─── 1. Happy path ───
    it('happy path：next 正常返回 → logger.info 被调且含 requestId/latencyMs', async () => {
        const ctx = buildContext({
            type: 'http',
            req: { method: 'GET', url: '/api/auth/me', id: 'req-123' },
        });
        const next: CallHandler = { handle: () => of({ ok: true }) };

        const result = await new Promise((resolve, reject) => {
            interceptor.intercept(ctx, next).subscribe({
                next: resolve,
                error: reject,
            });
        });

        // next 的返回值原样透传
        expect(result).toEqual({ ok: true });
        // logger.info 被调一次，error 没被调
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();

        // 验证 info 收到的参数：含 requestId / method / url / latencyMs
        const [payload, message] = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0]!;
        expect(payload).toMatchObject({
            requestId: 'req-123',
            method: 'GET',
            url: '/api/auth/me',
        });
        expect(typeof payload.latencyMs).toBe('number');
        expect(payload.latencyMs).toBeGreaterThanOrEqual(0);
        expect(message).toBe('request completed');
    });

    // ─── 2. Error path ───
    it('error path：next 抛错 → logger.error 被调且 err 被透传', async () => {
        const ctx = buildContext({
            type: 'http',
            req: { method: 'POST', url: '/api/auth/login', id: 'req-456' },
        });
        const err = new Error('Invalid credentials');
        const next: CallHandler = { handle: () => throwError(() => err) };

        await new Promise((resolve) => {
            interceptor.intercept(ctx, next).subscribe({
                next: resolve,
                // 错误必须被 swallow，LoggingInterceptor 不应改变 rxjs 流向
                error: () => resolve(undefined),
            });
        });

        // error 被调一次，info 没被调
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.info).not.toHaveBeenCalled();

        // 验证 error 收到的参数：含 err 对象 + requestId
        const [payload, message] = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0]!;
        expect(payload).toMatchObject({
            requestId: 'req-456',
            method: 'POST',
            url: '/api/auth/login',
            err,
        });
        expect(typeof payload.latencyMs).toBe('number');
        expect(message).toBe('request failed');
    });

    // ─── 3. GraphQL context：method/url 退化为 GRAPHQL/operationName ───
    it('GraphQL context：method=GRAPHQL，url=operationName', async () => {
        const ctx = buildContext({
            type: 'graphql',
            req: { id: 'req-gql-1', body: { operationName: 'GetMe' } },
        });
        const next: CallHandler = { handle: () => of('gql-result') };

        await new Promise((resolve, reject) => {
            interceptor.intercept(ctx, next).subscribe({ next: resolve, error: reject });
        });

        expect(logger.info).toHaveBeenCalledTimes(1);
        const [payload] = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0]!;
        expect(payload).toMatchObject({
            requestId: 'req-gql-1',
            method: 'GRAPHQL',
            url: 'GetMe',
        });
    });

    // ─── 4. 缺失 req：url 退化为 'anonymous'，不抛错 ───
    it('GraphQL 缺失 operationName 时：url 退化为 anonymous，logger 仍被调', async () => {
        const ctx = buildContext({
            type: 'graphql',
            req: { id: 'req-gql-2' }, // 没有 body.operationName
        });
        const next: CallHandler = { handle: () => of(null) };

        await new Promise((resolve, reject) => {
            interceptor.intercept(ctx, next).subscribe({ next: resolve, error: reject });
        });

        expect(logger.info).toHaveBeenCalledTimes(1);
        const [payload] = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0]!;
        expect(payload.url).toBe('anonymous');
    });
});
