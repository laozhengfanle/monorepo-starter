import {
    Catch,
    ExceptionFilter,
    HttpException,
    ArgumentsHost,
    Logger,
    BadRequestException,
    UnauthorizedException,
    ForbiddenException,
    NotFoundException,
    HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { GraphQLError } from 'graphql';

/**
 * 统一全局异常过滤器
 *
 * 处理 REST 和 GraphQL 两种请求类型的异常：
 * - HTTP 请求：返回 JSON 格式的业务错误响应（生产环境脱敏）
 * - GraphQL 请求：转换为带业务错误码的 GraphQLError
 *
 * 错误码映射：
 * | NestJS 异常             | REST 行为                  | GraphQL code |
 * |-------------------------|---------------------------|:------------:|
 * | BadRequestException     | 400 + 业务错误码           | 10001        |
 * | UnauthorizedException   | 401 + 业务错误码           | 20003        |
 * | ForbiddenException      | 403 + 业务错误码           | 22001        |
 * | NotFoundException       | 404 + 业务错误码           | 10002        |
 * | 其他 HttpException      | 保留 HTTP 状态码           | HTTP 状态码  |
 * | 未知异常 (500)          | { code: 50000, 脱敏消息 }  | 10999        |
 *
 * 注册方式：在 AppModule 中通过 APP_FILTER 全局注册
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const contextType = host.getType<string>();

        if (contextType === 'graphql') {
            return this.handleGraphQL(exception);
        }

        // HTTP (REST) 请求处理
        this.handleHttp(exception, host);
    }

    // ── HTTP 处理 ──

    private handleHttp(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        // 所有异常完整记录到服务端日志（内部排查用）
        this.logger.error(exception);

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const res = exception.getResponse() as Record<string, unknown>;

            /**
             * code 字段类型规整
             * - 业务抛的 code 是 number（10001 / 20003 / 22001 ...）→ 直接用
             * - 没传 code 的 HttpException（如 ThrottlerException）→ 用 HTTP 状态码查表
             *   映射为字符串业务码（保持 GraphQL / REST 两侧的 code 都是字符串业务码）
             */
            const businessCode = typeof res?.code === 'number' ? res.code : Number(this.getBusinessCode(status));
            response.status(status).json({
                code: businessCode,
                message: (res?.message as string) || exception.message || 'Error',
            });
        } else {
            // 非 HttpException → 500 内部错误，生产环境脱敏
            response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                code: 10999,
                message: 'Internal server error',
            });
        }
    }

    // ── GraphQL 处理 ──

    private handleGraphQL(exception: unknown): GraphQLError {
        // 已经是 GraphQLError（Apollo 内部或 ZodArgsPipe 转换后）→ 直接返回
        if (exception instanceof GraphQLError) {
            return exception;
        }

        // BadRequestException → 参数验证失败
        if (exception instanceof BadRequestException) {
            const response = exception.getResponse() as {
                code?: number;
                message?: string;
                data?: unknown;
            };
            /**
             * extensions.code 必须是字符串业务码
             * - 业务抛的 code 是 number（10001）→ String() 转成 '10001'
             * - 业务没传 code → 落回 '10001'（BadRequest 的默认业务码）
             * - 用 ?? 而不是 ||：避免合法 code 0 被误判为 fallback
             */
            const code = typeof response.code === 'number' ? String(response.code) : (response.code ?? '10001');
            return new GraphQLError(response.message || '参数验证失败', {
                extensions: {
                    code,
                    fields: response.data ?? null,
                },
            });
        }

        // UnauthorizedException → 未认证
        if (exception instanceof UnauthorizedException) {
            return new GraphQLError(this.getHttpMessage(exception, '未认证'), {
                extensions: { code: '20003', fields: null },
            });
        }

        // ForbiddenException → 无权限
        if (exception instanceof ForbiddenException) {
            return new GraphQLError(this.getHttpMessage(exception, '无权限'), {
                extensions: { code: '22001', fields: null },
            });
        }

        // NotFoundException → 资源不存在
        if (exception instanceof NotFoundException) {
            return new GraphQLError(this.getHttpMessage(exception, '资源不存在'), {
                extensions: { code: '10002', fields: null },
            });
        }

        // 其他 HttpException（如 ThrottlerException 429）
        if (this.isHttpException(exception)) {
            const status = exception.getStatus();
            /**
             * 用 getBusinessCode 把 HTTP 状态码映射为字符串业务码
             * - 429 → '10999'（限流）
             * - 500 → '10999'（兜底）
             * - 其他 → 表里没有也走 '10999'
             * - 避免把 HTTP 状态码作为业务码直接返回（数字 vs 字符串混用会让前端类型判断变难）
             */
            return new GraphQLError(this.getHttpMessage(exception, `HTTP ${status}`), {
                extensions: { code: this.getBusinessCode(status), fields: null },
            });
        }

        // 未知异常 → 兜底，不泄露内部信息
        this.logger.error('Unhandled GraphQL error', exception instanceof Error ? exception.stack : exception);
        return new GraphQLError('GraphQL internal error', {
            extensions: { code: '10999', fields: null },
        });
    }

    /**
     * HTTP 状态码 → 字符串业务码 映射表
     * - 用于兜底：业务没传 code 时根据 HTTP 状态码自动选择
     * - 400 → '10001' 参数错误
     * - 401 → '20003' 未认证
     * - 403 → '22001' 无权限
     * - 404 → '10002' 资源不存在
     * - 429 → '10999' 限流（暂用通用码，避免新增业务码）
     * - 500 / 其他 → '10999' 通用兜底
     * - 返回类型固定为 string，避免 REST 返回 number / GraphQL 返回 string 的混乱
     */
    private getBusinessCode(httpStatus: number): string {
        const map: Record<number, string> = {
            400: '10001',
            401: '20003',
            403: '22001',
            404: '10002',
            429: '10999',
            500: '10999',
        };
        return map[httpStatus] ?? '10999';
    }

    /** 安全提取 HttpException 的业务消息 */
    private getHttpMessage(exception: HttpException, fallback: string): string {
        const response = exception.getResponse();
        if (typeof response === 'string') return response;
        if (typeof response === 'object' && response !== null && 'message' in response) {
            const msg = (response as { message?: unknown }).message;
            if (typeof msg === 'string') return msg;
            if (Array.isArray(msg) && msg.length > 0) return String(msg[0]);
        }
        return fallback;
    }

    /** 类型守卫：判断是否为 HttpException */
    private isHttpException(exception: unknown): exception is HttpException {
        return (
            typeof exception === 'object' &&
            exception !== null &&
            'getStatus' in exception &&
            typeof (exception as { getStatus?: unknown }).getStatus === 'function'
        );
    }
}
