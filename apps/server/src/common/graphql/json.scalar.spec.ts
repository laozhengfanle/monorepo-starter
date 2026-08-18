import { describe, expect, it } from 'vitest';
import { parse, type OperationDefinitionNode } from 'graphql';
import { JsonScalar } from './json.scalar.js';

/** 解析单字段查询并取第一个参数的值节点 */
function argValueNode(query: string): unknown {
  const doc = parse(query);
  const op = doc.definitions[0] as OperationDefinitionNode;
  const field = op.selectionSet.selections[0] as {
    arguments?: Array<{ value: unknown }>;
  };
  return field.arguments?.[0]?.value;
}

describe('JsonScalar', () => {
  const scalar = new JsonScalar();

  it('parseValue：原样返回任意 JS 值', () => {
    expect(scalar.parseValue({ a: 1 })).toEqual({ a: 1 });
    expect(scalar.parseValue([1, 2])).toEqual([1, 2]);
    expect(scalar.parseValue('str')).toBe('str');
    expect(scalar.parseValue(42)).toBe(42);
    expect(scalar.parseValue(null)).toBeNull();
  });

  it('serialize：原样返回（DB/service 已是 JS 对象）', () => {
    expect(scalar.serialize({ b: 2 })).toEqual({ b: 2 });
    expect(scalar.serialize('x')).toBe('x');
  });

  it('parseLiteral：内联对象字面量还原为 JS 值', () => {
    const ast = argValueNode('{ f(x: { enabled: true, count: 3 }) }');

    expect(scalar.parseLiteral(ast as never)).toEqual({
      enabled: true,
      count: 3,
    });
  });

  it('parseLiteral：字符串字面量', () => {
    const ast = argValueNode('{ f(x: "hello") }');

    expect(scalar.parseLiteral(ast as never)).toBe('hello');
  });

  it('parseLiteral：支持变量引用（带 variables 时解析）', () => {
    const ast = argValueNode('{ f(x: $var) }');

    expect(scalar.parseLiteral(ast as never, { var: { k: 'v' } })).toEqual({
      k: 'v',
    });
  });
});
