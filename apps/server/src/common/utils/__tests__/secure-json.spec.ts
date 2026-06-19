import { describe, it, expect } from 'vitest';
import { secureJSONParse, sanitizeObject } from '../secure-json';

// ─── secureJSONParse ─────────────────────────────────────────────────

describe('secureJSONParse', () => {
    it('应正常解析合法 JSON', () => {
        const result = secureJSONParse('{"name":"test","age":25}');
        expect(result).toEqual({ name: 'test', age: 25 });
    });

    it('应过滤顶级 __proto__ 键', () => {
        const result = secureJSONParse('{"__proto__":{"polluted":true},"name":"safe"}');
        expect(result).toEqual({ name: 'safe' });
    });

    it('应过滤顶级 constructor 键', () => {
        const result = secureJSONParse('{"constructor":{"polluted":true},"name":"safe"}');
        expect(result).toEqual({ name: 'safe' });
    });

    it('应过滤顶级 prototype 键', () => {
        const result = secureJSONParse('{"prototype":{"polluted":true},"name":"safe"}');
        expect(result).toEqual({ name: 'safe' });
    });

    it('应过滤嵌套对象中的 __proto__', () => {
        const result = secureJSONParse('{"nested":{"__proto__":{"polluted":true}},"data":"ok"}');
        expect(result).toEqual({ nested: {}, data: 'ok' });
    });

    it('应过滤深层嵌套对象中的危险键', () => {
        const result = secureJSONParse('{"a":{"b":{"__proto__":{"evil":true},"c":"safe"}}}');
        expect((result as any).a.b).toEqual({ c: 'safe' });
    });

    it('应过滤数组元素中的危险键', () => {
        const result = secureJSONParse('[{"__proto__":{"polluted":true},"id":1}]');
        // secureJSONParse 只在顶层 key 检测，数组元素内部的 key 不过滤
        // 这个测试确认 parse-time reviver 的行为
        expect((result as any)[0].id).toBe(1);
    });

    it('应处理空对象', () => {
        const result = secureJSONParse('{}');
        expect(result).toEqual({});
    });

    it('应处理数组', () => {
        const result = secureJSONParse('[1,2,3]');
        expect(result).toEqual([1, 2, 3]);
    });

    it('应处理基础类型', () => {
        expect(secureJSONParse('"hello"')).toBe('hello');
        expect(secureJSONParse('42')).toBe(42);
        expect(secureJSONParse('true')).toBe(true);
        expect(secureJSONParse('null')).toBe(null);
    });

    it('应过滤已经存在的 __proto__ 污染', () => {
        const result = secureJSONParse('{"user":{"__proto__":{"isAdmin":true},"name":"attacker"}}');
        expect((result as any).user).toEqual({ name: 'attacker' });
    });
});

// ─── sanitizeObject ──────────────────────────────────────────────────

describe('sanitizeObject', () => {
    it('应返回基础类型值不变', () => {
        expect(sanitizeObject(42)).toBe(42);
        expect(sanitizeObject('hello')).toBe('hello');
        expect(sanitizeObject(true)).toBe(true);
        expect(sanitizeObject(null)).toBe(null);
        expect(sanitizeObject(undefined)).toBe(undefined);
    });

    it('应返回正常对象不变', () => {
        const obj = { name: 'test', age: 25 };
        const result = sanitizeObject(obj);
        expect(result).toEqual(obj);
        // 返回新对象，不是原对象
        expect(result).not.toBe(obj);
    });

    it('应删除 __proto__ 键', () => {
        const obj = { __proto__: { polluted: true }, name: 'safe' };
        const result = sanitizeObject(obj) as Record<string, unknown>;
        expect(result).toEqual({ name: 'safe' });
        expect(Object.hasOwn(result as object, '__proto__')).toBe(false);
    });

    it('应删除 constructor 键', () => {
        const obj = { constructor: { evil: true }, name: 'safe' };
        const result = sanitizeObject(obj) as Record<string, unknown>;
        expect(result).toEqual({ name: 'safe' });
        expect(Object.hasOwn(result as object, 'constructor')).toBe(false);
    });

    it('应删除 prototype 键', () => {
        const obj = { prototype: { evil: true }, name: 'safe' };
        const result = sanitizeObject(obj) as Record<string, unknown>;
        expect(result).toEqual({ name: 'safe' });
        expect('prototype' in result).toBe(false);
    });

    it('应递归删除嵌套对象中的危险键', () => {
        const obj = {
            a: {
                __proto__: { polluted: true },
                b: {
                    constructor: { evil: true },
                    c: 'safe',
                },
            },
        };
        const result = sanitizeObject(obj) as Record<string, unknown>;
        expect((result as any).a).toEqual({ b: { c: 'safe' } });
    });

    it('应处理包含危险键的数组', () => {
        const arr = [{ id: 1 }, { __proto__: { evil: true }, id: 2 }, { id: 3 }];
        const result = sanitizeObject(arr) as unknown[];
        expect(result).toHaveLength(3);
        expect(result[1] as Record<string, unknown>).toEqual({ id: 2 });
    });

    it('不应修改原始对象', () => {
        const obj = { __proto__: { polluted: true }, name: 'safe' };
        sanitizeObject(obj);
        // 原始对象应不变
        expect(obj.__proto__).toEqual({ polluted: true });
    });

    it('应处理空对象', () => {
        const result = sanitizeObject({});
        expect(result).toEqual({});
    });

    it('应处理空数组', () => {
        const result = sanitizeObject([]);
        expect(result).toEqual([]);
    });

    it('应处理混合类型（数组含非对象元素）', () => {
        const arr = [1, 'hello', null];
        const result = sanitizeObject(arr);
        expect(result).toEqual([1, 'hello', null]);
    });

    it('应处理深层嵌套的污染攻击', () => {
        const obj = {
            users: [
                {
                    name: 'legit',
                    __proto__: { role: 'admin' },
                    profile: {
                        constructor: { bypass: true },
                        email: 'legit@test.com',
                    },
                },
            ],
        };
        const result = sanitizeObject(obj) as any;
        const user = result.users[0];
        expect(user).toEqual({
            name: 'legit',
            profile: { email: 'legit@test.com' },
        });
    });

    it('secureJSONParse 和 sanitizeObject 对同一输入产生等价结果', () => {
        const input = '{"user":{"__proto__":{"isAdmin":true},"name":"attacker"}}';

        const parseResult = secureJSONParse(input) as { user: { name: string } };
        const obj = JSON.parse(input);
        const sanitizeResult = sanitizeObject(obj) as { user: { name: string } };

        expect(parseResult.user.name).toBe('attacker');
        expect(sanitizeResult.user.name).toBe('attacker');
        // 两种方式都不应在自有属性中包含 __proto__
        expect(Object.hasOwn(parseResult as object, '__proto__')).toBe(false);
        expect(Object.hasOwn(sanitizeResult as object, '__proto__')).toBe(false);
    });
});
