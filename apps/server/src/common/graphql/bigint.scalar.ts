import { Scalar, CustomScalar } from '@nestjs/graphql';
import { GraphQLError, type ValueNode } from 'graphql';

/**
 * GraphQL BigInt 自定义 Scalar
 *
 * 用途：表达超出 JS Number 安全整数范围的 64 位整数（如雪花 ID、大金额、时间戳毫秒）。
 *
 * 实现：
 * - 传输层用字符串（GraphQL 规范没有原生 BigInt，JSON 序列化安全）
 * - parseValue：variables 中的值（字符串 / 数字）→ bigint
 * - serialize：DB / service 返回的 bigint / number / string → 字符串输出
 * - parseLiteral：query 内联字面量（Int / String）→ bigint
 */
@Scalar('BigInt', () => String)
export class BigIntScalar implements CustomScalar<unknown, string> {
  description = '64 位整数（超出 Number 安全范围，以字符串传输）';

  parseValue(value: unknown): string {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) {
        throw new GraphQLError(
          'BigInt 值超出 Number 安全整数范围，请用字符串传递',
        );
      }
      return String(value);
    }
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return value;
    throw new GraphQLError(`BigInt 无法解析: ${String(value)}`);
  }

  serialize(value: unknown): string {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    throw new GraphQLError(`BigInt 无法序列化: ${String(value)}`);
  }

  parseLiteral(ast: ValueNode): string {
    if (ast.kind === 'IntValue' || ast.kind === 'StringValue') return ast.value;
    throw new GraphQLError(`BigInt 字面量必须是 Int 或 String: ${ast.kind}`);
  }
}
