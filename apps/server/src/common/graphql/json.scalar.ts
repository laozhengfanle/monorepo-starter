import { Scalar, CustomScalar } from '@nestjs/graphql';
import type { ValueNode } from 'graphql';

/**
 * GraphQL JSON 自定义 Scalar（任意 JSON 值：对象/数组/标量）
 * - @Scalar('JSON', () => Object) 包装为可在 @Field/@Args 引用的 class
 * - 安全边界在 service 层 Zod schema（拒绝非对象值）
 */
@Scalar('JSON', () => Object)
export class JsonScalar implements CustomScalar<unknown, unknown> {
  description = '任意 JSON 值（对象 / 数组 / 字符串 / 数字 / 布尔 / null）';

  parseValue(value: unknown): unknown {
    return value;
  }

  serialize(value: unknown): unknown {
    return value;
  }

  parseLiteral(ast: ValueNode): unknown {
    return JSON.parse(JSON.stringify(ast));
  }
}
