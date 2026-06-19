import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema, ZodError } from 'zod';
import { formatZodError, type FieldError } from '../utils/format-zod-error.js';

/**
 * Zod 验证管道
 * - 实现 NestJS PipeTransform 接口
 * - 使用 safeParse 验证输入，失败时抛出 BadRequestException
 * - 错误码 10001（参数验证失败），与错误码.md 一致
 * - 返回格式：{ code: 10001, message: '参数验证失败', data: [{ field, message }] }
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
    constructor(private schema: ZodSchema<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value);

        if (result.success) {
            return result.data;
        }

        /** 格式化 ZodError 为字段级错误列表 */
        const errors: FieldError[] = formatZodError(result.error as ZodError);

        throw new BadRequestException({
            code: 10001,
            message: '参数验证失败',
            data: errors,
        });
    }
}
