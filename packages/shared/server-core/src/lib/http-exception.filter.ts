import {
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { ApiEnvelope } from '@starter/contracts';
import { ZodError } from 'zod';
import { ZodValidationException } from 'nestjs-zod';
import { BizException } from './business.exception.js';

const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';
const VALIDATION_ERROR_CODE = 'VALIDATION_FAILED';
const VALIDATION_STATUS = HttpStatus.UNPROCESSABLE_ENTITY;
const BIZ_EXCEPTION_STATUS = HttpStatus.BAD_REQUEST;

interface ErrorEnvelope {
  status: number;
  envelope: ApiEnvelope<null>;
}

/**
 * 全局异常过滤器：任何异常统一映射为 envelope 响应。
 * - ZodError        → 422，字段级校验详情
 * - BizException    → 400，业务码与消息透传
 * - HttpException   → 保持原状态码
 * - 其他未知异常      → 500，记录完整日志但响应不泄露内部细节
 *
 * 注：未使用 @Catch() 装饰器——全局注册（useGlobalFilters）不需要它，
 * 且无装饰器才能在 Vitest（esbuild 不支持装饰器）中直接测试。
 */
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const { status, envelope } = this.toEnvelope(exception);
    void response.status(status).send(envelope);
  }

  private toEnvelope(exception: unknown): ErrorEnvelope {
    // nestjs-zod 的校验异常继承自 BadRequestException（状态码 400），
    // 需要先于 HttpException 分支处理，统一映射为 422 + 字段级详情
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      return {
        status: VALIDATION_STATUS,
        envelope: {
          success: false,
          data: null,
          error: {
            code: VALIDATION_ERROR_CODE,
            message: '请求参数校验失败',
            details:
              zodError instanceof ZodError ? this.mapZodDetails(zodError) : undefined,
          },
        },
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: VALIDATION_STATUS,
        envelope: {
          success: false,
          data: null,
          error: {
            code: VALIDATION_ERROR_CODE,
            message: '请求参数校验失败',
            details: this.mapZodDetails(exception),
          },
        },
      };
    }

    if (exception instanceof BizException) {
      return {
        status: BIZ_EXCEPTION_STATUS,
        envelope: {
          success: false,
          data: null,
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details,
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        envelope: {
          success: false,
          data: null,
          error: {
            code: `HTTP_${exception.getStatus()}`,
            message: this.extractHttpMessage(exception),
          },
        },
      };
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      envelope: {
        success: false,
        data: null,
        error: { code: INTERNAL_ERROR_CODE, message: '服务器内部错误' },
      },
    };
  }

  /** 把 Zod 问题列表按字段路径聚合为字段级错误详情 */
  private mapZodDetails(error: ZodError): Record<string, string[]> {
    return error.issues.reduce<Record<string, string[]>>((details, issue) => {
      const key = issue.path.join('.') || '_root';
      return { ...details, [key]: [...(details[key] ?? []), issue.message] };
    }, {});
  }

  private extractHttpMessage(exception: HttpException): string {
    const res = exception.getResponse();
    if (typeof res === 'string') {
      return res;
    }
    const message = (res as { message?: string | string[] }).message;
    if (Array.isArray(message)) {
      return message.join('; ');
    }
    return message ?? exception.message;
  }
}
