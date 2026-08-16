import { Scalar, CustomScalar } from '@nestjs/graphql';
import type { ValueNode } from 'graphql';
import { valueFromASTUntyped } from 'graphql';

/**
 * GraphQL JSON 自定义 Scalar（任意 JSON 值：对象/数组/标量）
 * - @Scalar('JSON', () => Object) 包装为可在 @Field/@Args 引用的 class
 * - parseValue：处理 variables 中的 JSON 值（已是 JS 对象，原样返回）
 * - serialize：把 DB / service 返回的对象序列化（已是 JS 对象，原样返回）
 * - parseLiteral：处理 query 内联的 JSON 字面量 → 用 graphql 官方 valueFromASTUntyped
 *   还原为实际 JS 值（旧实现 JSON.stringify(ast) 返回 AST 结构，是 bug）
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

  parseLiteral(
    ast: ValueNode,
    variables?: Record<string, unknown> | null,
  ): unknown {
    // valueFromASTUntyped 支持变量引用与内联字面量，还原为实际 JS 值
    return valueFromASTUntyped(ast, variables ?? undefined);
  }
}
