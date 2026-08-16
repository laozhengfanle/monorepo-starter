import { describe, expect, it } from 'vitest';
import {
  GraphQLError,
  Kind,
  parse,
  type OperationDefinitionNode,
} from 'graphql';
import { BigIntScalar } from './bigint.scalar.js';

describe('BigIntScalar', () => {
  const scalar = new BigIntScalar();

  it('parseValue：数字 → 字符串', () => {
    expect(scalar.parseValue(42)).toBe('42');
  });

  it('parseValue：bigint → 字符串', () => {
    expect(scalar.parseValue(9007199254740993n)).toBe('9007199254740993');
  });

  it('parseValue：字符串 → 原样返回', () => {
    expect(scalar.parseValue('9223372036854775807')).toBe(
      '9223372036854775807',
    );
  });

  it('parseValue：超出安全整数范围的 number 抛错（防精度丢失）', () => {
    // 9007199254740993 = 2^53 + 1，超出 Number 安全范围
    expect(() => scalar.parseValue(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      GraphQLError,
    );
  });

  it('parseValue：非法字符串抛错', () => {
    expect(() => scalar.parseValue('abc')).toThrow(GraphQLError);
  });

  it('serialize：bigint / number / string 均输出字符串', () => {
    expect(scalar.serialize(9007199254740993n)).toBe('9007199254740993');
    expect(scalar.serialize(123)).toBe('123');
    expect(scalar.serialize('456')).toBe('456');
  });

  /** 解析单字段查询并取第一个参数的值节点 */
  function argValueNode(query: string): unknown {
    const doc = parse(query);
    const op = doc.definitions[0] as OperationDefinitionNode;
    const field = op.selectionSet.selections[0] as {
      arguments?: Array<{ value: unknown }>;
    };
    return field.arguments?.[0]?.value;
  }

  it('parseLiteral：IntValue / StringValue 字面量', () => {
    const intAst = argValueNode('{ f(x: 123) }');
    expect((intAst as { kind: string }).kind).toBe(Kind.INT);
    expect(scalar.parseLiteral(intAst as never)).toBe('123');

    const strAst = argValueNode('{ f(x: "999") }');
    expect(scalar.parseLiteral(strAst as never)).toBe('999');
  });

  it('parseLiteral：其他字面量类型抛错', () => {
    const boolAst = argValueNode('{ f(x: true) }');
    expect(() => scalar.parseLiteral(boolAst as never)).toThrow(GraphQLError);
  });
});
