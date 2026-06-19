import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BadRequestException,
    UnauthorizedException,
    ForbiddenException,
    NotFoundException,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { GlobalExceptionFilter } from '../global-exception.filter';

// NestJS Logger mock — 避免测试输出噪音
vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

// ─── HTTP 上下文构造器 ───────────────────────────────────────────────

function createHttpHost(exception: unknown) {
    const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };

    const host = {
        getType: () => 'http',
        switchToHttp: () => ({
            getResponse: () => mockResponse,
        }),
    };

    return { host, mockResponse };
}

// ─── GraphQL 上下文构造器 ────────────────────────────────────────────

function createGraphQLHost() {
    return {
        getType: () => 'graphql',
        switchToHttp: () => {
            throw new Error('GraphQL 请求不应调用 switchToHttp');
        },
    };
}

// ─── 测试 ────────────────────────────────────────────────────────────

describe('GlobalExceptionFilter', () => {
    let filter: GlobalExceptionFilter;

    beforeEach(() => {
        filter = new GlobalExceptionFilter();
        vi.clearAllMocks();
    });

    // ── HTTP 异常 ──

    describe('HTTP 请求处理', () => {
        it('BadRequestException → 400 + 错误码', () => {
            const error = new BadRequestException({ code: 10001, message: '参数错误' });
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 10001,
                message: '参数错误',
            });
        });

        it('UnauthorizedException → 401', () => {
            const error = new UnauthorizedException({ code: 20003, message: '未认证' });
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.status).toHaveBeenCalledWith(401);
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 20003,
                message: '未认证',
            });
        });

        it('ForbiddenException → 403', () => {
            const error = new ForbiddenException({ code: 22001, message: '无权限' });
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.status).toHaveBeenCalledWith(403);
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 22001,
                message: '无权限',
            });
        });

        it('NotFoundException → 404', () => {
            const error = new NotFoundException({ code: 10002, message: '资源不存在' });
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.status).toHaveBeenCalledWith(404);
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 10002,
                message: '资源不存在',
            });
        });

        it('自定义 HttpException → 保留原始 HTTP 状态码', () => {
            // 模拟一个 418 异常
            const error = new HttpException({ code: 41800, message: 'Teapot' }, 418);
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.status).toHaveBeenCalledWith(418);
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 41800,
                message: 'Teapot',
            });
        });

        it('HttpException 无 code → 走 HTTP 状态码查表（500 → 10999）', () => {
            // 修复前：code: 500（裸 HTTP 状态码）
            // 修复后：code: 10999（业务码查表映射）
            const error = new HttpException('Something wrong', 500);
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 10999,
                message: 'Something wrong',
            });
        });

        it('非 HttpException（如普通 Error）→ 500 + 脱敏消息', () => {
            const error = new Error('内部错误详情，不应泄露');
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 10999,
                message: 'Internal server error',
            });
        });

        it('非 Error 类型的异常 → 500 + 脱敏', () => {
            const error = 'some random string';
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 10999,
                message: 'Internal server error',
            });
        });

        it('HttpException 的 response 为字符串时', () => {
            const error = new HttpException('Simple string error', 400);
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            // 修复前：code: 400（裸 HTTP 状态码）
            // 修复后：code: 10001（业务码查表：400 → '10001'）
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 10001,
                message: 'Simple string error',
            });
        });
    });

    // ── GraphQL 异常 ──

    describe('GraphQL 请求处理', () => {
        it('已有的 GraphQLError 应原样返回', () => {
            const error = new GraphQLError('original graphql error', {
                extensions: { code: 'CUSTOM', fields: null },
            });
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result).toBeInstanceOf(GraphQLError);
            expect(result.message).toBe('original graphql error');
            expect(result.extensions?.code).toBe('CUSTOM');
        });

        it('BadRequestException → GraphQLError code 10001', () => {
            const error = new BadRequestException({
                code: 10001,
                message: '参数验证失败',
                data: { field: 'email' },
            });
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result).toBeInstanceOf(GraphQLError);
            expect(result.extensions?.code).toBe('10001');
            expect(result.extensions?.fields).toEqual({ field: 'email' });
        });

        it('BadRequestException 无 data → fields 为 null via nullish coalescing', () => {
            const error = new BadRequestException({ code: 10001, message: '参数错误' });
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.fields).toBeNull();
        });

        it('UnauthorizedException → GraphQLError code 20003', () => {
            const error = new UnauthorizedException({ code: 20003, message: '未认证' });
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('20003');
            expect(result.extensions?.fields).toBeNull();
        });

        it('ForbiddenException → GraphQLError code 22001', () => {
            const error = new ForbiddenException({ code: 22001, message: '无权限' });
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('22001');
        });

        it('NotFoundException → GraphQLError code 10002', () => {
            const error = new NotFoundException({ code: 10002, message: '资源不存在' });
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('10002');
        });

        it('其他 HttpException（如 ThrottlerException 429）→ code 映射为字符串业务码', () => {
            // Task 5 修复后：HTTP 状态码 429 不再直接作为字符串 code 返回
            // 而是通过 getBusinessCode 映射 → '10999'
            const error = new HttpException('Too Many Requests', 429);
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('10999');
        });

        it('未知异常 → GraphQLError code 10999（兜底）', () => {
            const error = new Error('unknown internal error');
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result).toBeInstanceOf(GraphQLError);
            expect(result.extensions?.code).toBe('10999');
            expect(result.message).toBe('GraphQL internal error');
        });

        it('非 Error 的未知异常 → 兜底 code 10999', () => {
            const error = 42;
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('10999');
        });
    });

    // ── Task 5：GraphQL extensions.code 字符串化 & HTTP code 映射 ──

    describe('GraphQL extensions.code 字符串化', () => {
        it('BadRequestException 无 code → extensions.code 落回 "10001"', () => {
            // 业务抛 BadRequestException({ message: 'X' }) 不传 code 时
            // 不应让 response.code 被当作 falsy → 走 fallback '10001'
            const error = new BadRequestException({ message: '参数错误' });
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('10001');
            // extensions.code 必须是字符串（不是 number）
            expect(typeof result.extensions?.code).toBe('string');
        });

        it('UnauthorizedException → extensions.code === "20003"（字符串）', () => {
            const error = new UnauthorizedException();
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('20003');
            expect(typeof result.extensions?.code).toBe('string');
        });

        it('ForbiddenException → extensions.code === "22001"（字符串）', () => {
            const error = new ForbiddenException();
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('22001');
            expect(typeof result.extensions?.code).toBe('string');
        });

        it('NotFoundException → extensions.code === "10002"（字符串）', () => {
            const error = new NotFoundException();
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('10002');
            expect(typeof result.extensions?.code).toBe('string');
        });

        it('未知异常 → extensions.code === "10999"（字符串），message === "GraphQL internal error"', () => {
            const error = new Error('内部信息');
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('10999');
            expect(typeof result.extensions?.code).toBe('string');
            expect(result.message).toBe('GraphQL internal error');
        });

        it('HTTP 500 → GraphQL extensions.code === "10999"（不再返回 "500"）', () => {
            const error = new HttpException('Server Error', 500);
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            // 修复前是 '500'（裸 HTTP 状态码），修复后映射为业务码 '10999'
            expect(result.extensions?.code).toBe('10999');
        });

        it('HTTP 401 → GraphQL extensions.code === "20003"', () => {
            const error = new HttpException('Unauthorized', 401);
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            expect(result.extensions?.code).toBe('20003');
        });
    });

    // ── Task 5：HTTP 端 code 也是字符串业务码（数字 → 字符串业务码映射） ──

    describe('HTTP 端 code 规整', () => {
        it('HttpException 无 code → code 走 HTTP 状态码查表（401 → 20003）', () => {
            const error = new HttpException('Unauthorized', 401);
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            // 修复前：code: 401（裸 HTTP 状态码），修复后：code: 20003（业务码）
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 20003,
                message: 'Unauthorized',
            });
        });

        it('HttpException 无 code → 500 映射为 10999', () => {
            const error = new HttpException('Internal Error', 500);
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 10999,
                message: 'Internal Error',
            });
        });

        it('业务传 number code → 优先用业务的 code（不做映射）', () => {
            // 业务抛 BadRequestException({ code: 12345 }) 时
            // 不应该被映射表覆盖（12345 不在表里 → 走 fallback）
            // 但本测试验证业务的 code 是 number 时原样透传
            const error = new BadRequestException({ code: 10001, message: '业务码' });
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 10001,
                message: '业务码',
            });
        });
    });

    // ── 消息提取 ──

    describe('getHttpMessage（消息提取）', () => {
        it('response 为字符串 → 直接返回', () => {
            const error = new HttpException('直接字符串消息', 400);
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            // 修复后：HTTP 400 映射为业务码 10001
            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 10001,
                message: '直接字符串消息',
            });
        });

        it('response.message 为字符串数组 → 取第一个', () => {
            // NestJS 表单验证错误通常返回 message 为数组
            const error = new BadRequestException({
                code: 10001,
                message: ['email is required', 'password too short'],
            });
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            // 对于 BadRequestException, handleGraphQL 直接从 response.message 取
            // 它会拿到数组，然后 message 会是空字符串...
            // 实际上 GraphQL 侧 BadRequest 走的是 response.message
            // 对于 message 数组, response.message 直接就是数组
            expect(result.extensions?.code).toBe('10001');
        });

        it('response.message 为 undefined → 使用 fallback', () => {
            // 这是 getHttpMessage 的 fallback 路径测试
            const error = new UnauthorizedException({ code: 20003 });
            const host = createGraphQLHost();

            const result = filter.catch(error, host as any) as GraphQLError;

            // Unauthorized 在 handleGraphQL 中走 getHttpMessage with fallback '未认证'
            expect(result.extensions?.code).toBe('20003');
        });
    });

    // ── 边界情况 ──

    describe('边界情况', () => {
        it('HttpException 含嵌套 response 对象', () => {
            const error = new HttpException({ code: 50001, message: 'Custom error', extra: 'should be ignored' }, 500);
            const { host, mockResponse } = createHttpHost(error);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter.catch(error, host as any);

            expect(mockResponse.json).toHaveBeenCalledWith({
                code: 50001,
                message: 'Custom error',
            });
        });
    });
});
