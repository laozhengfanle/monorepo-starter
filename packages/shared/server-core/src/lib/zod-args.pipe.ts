import { PipeTransform } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import type { ZodSchema } from 'zod';
import { formatZodError } from './format-zod-error.js';

/**
 * Zod 验证管道 —— 用于 GraphQL @Args 装饰器。
 *
 * 契约层核心（方案 1）：zod schema 是唯一事实来源，本管道对 @Args 输入做运行时校验，
 * 失败时抛带业务码 + 字段级详情的 GraphQLError（由 GraphQL formatError 统一映射）。
 *
 * 用法：
 * ```ts
 * @Mutation(() => UserType)
 * async createUser(
 *   @Args('input', { type: () => CreateUserInputType }, new ZodArgsPipe(CreateUserSchema))
 *   input: CreateUserInputType,
 * ) { ... }
 * ```
 */
export class ZodArgsPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new GraphQLError('参数验证失败', {
        extensions: {
          code: 'VALIDATION_FAILED',
          fields: formatZodError(result.error),
        },
      });
    }
    return result.data;
  }
}
