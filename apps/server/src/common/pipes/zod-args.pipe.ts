/**
 * Zod 验证管道 — 用于 GraphQL @Args 装饰器
 *
 * 解决的问题：
 * - GraphQL 自动根据 @Args() 装饰器推断参数类型（用于生成 schema）
 * - 业务层需要对参数做额外的 Zod 验证（如长度、格式、唯一性等）
 * - 验证失败时统一返回 10001 业务错误码
 *
 * 用法：
 * ```typescript
 * @Mutation(() => AdminAccount)
 * async createAdminAccount(
 *   @Args('input', { type: () => CreateAdminAccountInput }, new ZodArgsPipe(CreateAdminAccountSchema))
 *   input: CreateAdminAccountInput
 * ) {
 *   return this.service.create(input);
 * }
 * ```
 *
 * 设计：
 * - 与 @nestjs/common 的 ValidationPipe 同源（class-validator 风格）
 * - 但走 Zod 验证 + 统一错误码 10001
 * - 返回值 = 验证后的 typed 数据（z.infer 推导）
 */
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { formatZodError } from '../utils/format-zod-error.js';

@Injectable()
export class ZodArgsPipe<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: ZodSchema<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            throw new BadRequestException({
                code: 10001,
                message: '参数验证失败',
                data: formatZodError(result.error),
            });
        }
        return result.data;
    }
}
