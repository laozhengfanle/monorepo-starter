/**
 * ZodArgsPipe 单元测试
 *
 * 测试目标：
 * - 有效参数通过验证并返回 typed 数据
 * - 无效参数抛出 BadRequestException（10001 + fields）
 * - 各种 Zod schema 类型（object, string, uuid, number, enum）
 *
 * 覆盖率目标：≥ 80%
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { ZodArgsPipe } from '../zod-args.pipe.js';

// ── 测试 Schema ──

const CreateUserSchema = z
    .object({
        username: z.string().min(3, '用户名至少 3 个字符').max(50),
        email: z.string().email('邮箱格式不正确'),
        age: z.number().int().min(0).max(150).optional(),
    })
    .strict();

type CreateUserInput = z.infer<typeof CreateUserSchema>;

const UuidSchema = z.string().uuid('无效的 UUID 格式');

const EnumSchema = z.enum(['admin', 'member', 'partner']);

// ── 测试 ──

describe('ZodArgsPipe', () => {
    // ── 有效参数 ──

    describe('有效参数（应通过验证）', () => {
        it('完整合法对象 — 返回验证后的数据', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            const input = { username: 'johndoe', email: 'john@example.com', age: 25 };

            const result = pipe.transform(input);
            expect(result).toEqual(input);
            expect(result.username).toBe('johndoe');
        });

        it('合法对象（不含可选字段）— 返回验证后的数据', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            const input = { username: 'johndoe', email: 'john@example.com' };

            const result = pipe.transform(input);
            expect(result.username).toBe('johndoe');
            expect(result.email).toBe('john@example.com');
            expect((result as any).age).toBeUndefined();
        });

        it('有效 UUID 字符串 — 原样返回', () => {
            const pipe = new ZodArgsPipe(UuidSchema);
            const id = '550e8400-e29b-41d4-a716-446655440000';

            expect(pipe.transform(id)).toBe(id);
        });

        it('有效 enum 值 — 返回验证后的值', () => {
            const pipe = new ZodArgsPipe(EnumSchema);
            expect(pipe.transform('admin')).toBe('admin');
            expect(pipe.transform('member')).toBe('member');
        });

        it('返回类型应为正确的 TS 类型', () => {
            const pipe = new ZodArgsPipe<CreateUserInput>(CreateUserSchema);
            const input = { username: 'johndoe', email: 'john@example.com' };

            const result = pipe.transform(input);
            expect(typeof result.username).toBe('string');
            expect(typeof result.email).toBe('string');
        });
    });

    // ── 无效参数 ──

    describe('无效参数（应抛出 BadRequestException，code: 10001）', () => {
        /** 辅助函数：断言 transform 抛出 10001 异常 */
        function expectBadRequest(pipe: ZodArgsPipe<any>, value: unknown) {
            expect(() => pipe.transform(value)).toThrow(BadRequestException);
            try {
                pipe.transform(value);
            } catch (error) {
                expect(error).toBeInstanceOf(BadRequestException);
                const response = (error as BadRequestException).getResponse() as {
                    code: number;
                    message: string;
                    data: { field: string; message: string }[];
                };
                expect(response.code).toBe(10001);
                expect(response.message).toBe('参数验证失败');
                expect(Array.isArray(response.data)).toBe(true);
                return response;
            }
            throw new Error('Expected BadRequestException to be thrown');
        }

        it('缺失必填字段 → BadRequestException(10001)', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            const response = expectBadRequest(pipe, { email: 'john@example.com' }); // 缺 username
            expect(response.data.some((e) => e.field === 'username')).toBe(true);
        });

        it('字段格式错误 → BadRequestException(10001) + fields 包含错误字段名', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            const response = expectBadRequest(pipe, {
                username: 'ab', // 太短
                email: 'not-an-email',
            });
            const fields = response.data.map((e) => e.field);
            expect(fields).toContain('username');
            expect(fields).toContain('email');
        });

        it('undefined 输入 → BadRequestException(10001)', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            expectBadRequest(pipe, undefined);
        });

        it('null 输入 → BadRequestException(10001)', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            expectBadRequest(pipe, null);
        });

        it('非对象输入（string） → BadRequestException(10001)', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            expectBadRequest(pipe, 'not-an-object');
        });

        it('非对象输入（number） → BadRequestException(10001)', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            expectBadRequest(pipe, 12345);
        });

        it('数组输入（应为对象）→ BadRequestException(10001)', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            expectBadRequest(pipe, [1, 2, 3]);
        });

        it('无效 UUID → BadRequestException(10001) + 错误消息含 UUID', () => {
            const pipe = new ZodArgsPipe(UuidSchema);
            const response = expectBadRequest(pipe, 'not-a-uuid');
            expect(response.data[0].message).toContain('UUID');
        });

        it('无效 enum 值 → BadRequestException(10001)', () => {
            const pipe = new ZodArgsPipe(EnumSchema);
            expectBadRequest(pipe, 'super_admin');
        });

        /** strict 模式拒绝多余字段 */
        it('strict 模式下多余字段 → BadRequestException(10001)', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            const response = expectBadRequest(pipe, {
                username: 'johndoe',
                email: 'john@example.com',
                hackedField: 'should-be-rejected',
            });
            expect(response.data.some((e) => e.message.includes('Unrecognized'))).toBe(true);
        });

        it('数字字段类型错误 → BadRequestException(10001)', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            const response = expectBadRequest(pipe, {
                username: 'johndoe',
                email: 'john@example.com',
                age: 'not-a-number',
            });
            expect(response.data.some((e) => e.field === 'age')).toBe(true);
        });
    });

    // ── 边界情况 ──

    describe('边界情况', () => {
        it('username 恰好 3 字符（边界最小值）→ 通过', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            const input = { username: 'abc', email: 'a@b.com' };
            expect(pipe.transform(input).username).toBe('abc');
        });

        it('username 恰好 50 字符（边界最大值）→ 通过', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            const username = 'a'.repeat(50);
            const input = { username, email: 'a@b.com' };
            expect(pipe.transform(input).username).toBe(username);
        });

        it('username 51 字符（超出最大值）→ 抛出异常', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            expect(() =>
                pipe.transform({
                    username: 'a'.repeat(51),
                    email: 'a@b.com',
                }),
            ).toThrow(BadRequestException);
        });

        it('空对象 → BadRequestException', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            expect(() => pipe.transform({})).toThrow(BadRequestException);
        });

        it('不同 schema 实例之间验证规则隔离', () => {
            const schemaA = z.object({ name: z.string() }).strict();
            const schemaB = z.object({ name: z.string(), age: z.number() }).strict();

            const pipeA = new ZodArgsPipe(schemaA);
            const pipeB = new ZodArgsPipe(schemaB);

            // pipeA 拒绝 age
            expect(() => pipeA.transform({ name: 'test', age: 25 })).toThrow(BadRequestException);

            // pipeB 接受 age，缺少 age 会失败
            expect(() => pipeB.transform({ name: 'test' })).toThrow(BadRequestException);
            expect(pipeB.transform({ name: 'test', age: 25 })).toEqual({ name: 'test', age: 25 });
        });

        it('passthrough schema 放行多余字段', () => {
            const passthroughSchema = z.object({ name: z.string() }).passthrough();
            const pipe = new ZodArgsPipe(passthroughSchema);

            const result = pipe.transform({ name: 'test', extra: true });
            expect(result.name).toBe('test');
        });
    });

    // ── 错误数据结构完整性 ──

    describe('错误数据结构', () => {
        it('BadRequestException 的 response 包含 code + message + data', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            try {
                pipe.transform({});
                expect.fail('应抛出异常');
            } catch (error) {
                const response = (error as BadRequestException).getResponse() as Record<string, unknown>;
                expect(response).toHaveProperty('code', 10001);
                expect(response).toHaveProperty('message', '参数验证失败');
                expect(response).toHaveProperty('data');
                expect(Array.isArray(response.data)).toBe(true);
            }
        });

        it('data 数组中每个元素含 field 和 message', () => {
            const pipe = new ZodArgsPipe(CreateUserSchema);
            try {
                pipe.transform({ username: 'ab', email: 'bad' });
                expect.fail('应抛出异常');
            } catch (error) {
                const response = (error as BadRequestException).getResponse() as {
                    data: { field: string; message: string }[];
                };
                for (const item of response.data) {
                    expect(item).toHaveProperty('field');
                    expect(item).toHaveProperty('message');
                    expect(typeof item.message).toBe('string');
                    expect(item.message.length).toBeGreaterThan(0);
                }
            }
        });
    });
});
