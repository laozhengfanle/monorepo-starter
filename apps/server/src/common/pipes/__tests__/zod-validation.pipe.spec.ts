import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from '../zod-validation.pipe.js';

// 测试用的 Zod Schema
const TestSchema = z
    .object({
        username: z.string().min(3, '用户名至少 3 个字符').max(50),
        password: z
            .string()
            .min(8, '密码至少 8 位')
            .regex(/[a-zA-Z]/, '密码必须包含字母')
            .regex(/[0-9]/, '密码必须包含数字'),
        email: z.string().email('邮箱格式不正确').optional(),
    })
    .strict();

type TestInput = z.infer<typeof TestSchema>;

// ── ZodValidationPipe 测试 ──
describe('ZodValidationPipe', () => {
    /** 有效输入 → 返回验证后的数据 */
    it('应通过合法输入并返回验证后的数据', () => {
        const pipe = new ZodValidationPipe(TestSchema);
        const input = {
            username: 'admin01',
            password: 'pass1234',
        };

        const result = pipe.transform(input);
        expect(result).toEqual(input);
        expect(result.username).toBe('admin01');
        expect(result.password).toBe('pass1234');
    });

    /** 有效输入带可选字段 */
    it('应通过带可选字段的合法输入', () => {
        const pipe = new ZodValidationPipe(TestSchema);
        const input = {
            username: 'admin01',
            password: 'pass1234',
            email: 'admin@example.com',
        };

        const result = pipe.transform(input);
        expect(result).toEqual(input);
    });

    /** 缺失必填字段 → BadRequestException */
    it('应拒绝缺失必填字段的输入并抛出 BadRequestException', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        expect(() => pipe.transform({})).toThrow(BadRequestException);

        try {
            pipe.transform({});
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestException);
            const response = (error as BadRequestException).getResponse() as {
                code: number;
                message: string;
                data: unknown[];
            };
            expect(response.code).toBe(10001);
            expect(response.message).toBe('参数验证失败');
            expect(Array.isArray(response.data)).toBe(true);
            expect(response.data.length).toBeGreaterThan(0);
        }
    });

    /** 字段格式错误 → BadRequestException with field errors */
    it('应拒绝格式错误的字段并返回字段级错误', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        try {
            pipe.transform({
                username: 'ab', // 太短
                password: 'short', // 缺数字 + 太短
            });
            // 不应到达这里
            expect(true).toBe(false);
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestException);
            const response = (error as BadRequestException).getResponse() as {
                code: number;
                message: string;
                data: { field: string; message: string }[];
            };
            expect(response.code).toBe(10001);
            expect(response.message).toBe('参数验证失败');

            const fields = response.data.map((e) => e.field);
            expect(fields).toContain('username');
            expect(fields).toContain('password');

            // 验证错误消息有意义
            for (const item of response.data) {
                expect(item.message.length).toBeGreaterThan(0);
            }
        }
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式参数污染防护）', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        try {
            pipe.transform({
                username: 'admin01',
                password: 'pass1234',
                extraField: 'should-be-rejected',
            });
            expect(true).toBe(false);
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestException);
            const response = (error as BadRequestException).getResponse() as {
                code: number;
                message: string;
                data: { field: string; message: string }[];
            };
            expect(response.code).toBe(10001);
            // strict 模式下未识别字段的 error path 为空数组，field 为空字符串
            const strictError = response.data.find((e: { field: string; message: string }) =>
                e.message.toLowerCase().includes('unrecognized'),
            );
            expect(strictError).toBeDefined();
        }
    });

    /** undefined 输入 */
    it('应拒绝 undefined 输入', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
    });

    /** null 输入 */
    it('应拒绝 null 输入', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        expect(() => pipe.transform(null)).toThrow(BadRequestException);
    });

    /** 基础类型输入（非对象） */
    it('应拒绝基础类型输入（应为对象）', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        expect(() => pipe.transform('string')).toThrow(BadRequestException);
        expect(() => pipe.transform(12345)).toThrow(BadRequestException);
        expect(() => pipe.transform(true)).toThrow(BadRequestException);
        expect(() => pipe.transform([])).toThrow(BadRequestException);
    });

    /** uuid schema 验证 */
    it('应正确验证 UUID 字符串', () => {
        const uuidSchema = z.string().uuid('无效的 UUID 格式');
        const pipe = new ZodValidationPipe(uuidSchema);

        // 有效 UUID
        const validId = '550e8400-e29b-41d4-a716-446655440000';
        expect(pipe.transform(validId)).toBe(validId);

        // 无效 UUID
        try {
            pipe.transform('not-a-uuid');
            expect(true).toBe(false);
        } catch (error) {
            const response = (error as BadRequestException).getResponse() as {
                code: number;
                data: { field: string; message: string }[];
            };
            expect(response.code).toBe(10001);
            expect(response.data[0].message).toContain('UUID');
        }
    });

    /** 对不同 schema 实例复用 pipe */
    it('应对不同 schema 正确隔离验证规则', () => {
        const strictSchema = z.object({ name: z.string() }).strict();
        const passthroughSchema = z.object({ name: z.string() }).passthrough();

        const strictPipe = new ZodValidationPipe(strictSchema);
        const passthroughPipe = new ZodValidationPipe(passthroughSchema);

        // strict pipe 拒绝多余字段
        expect(() => strictPipe.transform({ name: 'test', extra: true })).toThrow(BadRequestException);

        // passthrough pipe 放行多余字段
        const result = passthroughPipe.transform({ name: 'test', extra: true });
        expect(result.name).toBe('test');
    });

    /** 类型安全：返回类型应为 T */
    it('应返回正确类型的验证数据', () => {
        const pipe = new ZodValidationPipe<TestInput>(TestSchema);
        const input = { username: 'admin01', password: 'pass1234' };

        const result = pipe.transform(input);
        // 类型检查：result 应具有 TestInput 的所有字段
        expect(typeof result.username).toBe('string');
        expect(typeof result.password).toBe('string');
    });

    /** 边界值：username 正好 3 个字符 */
    it('应通过边界值（字段长度为最小值）', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        const result = pipe.transform({
            username: 'abc', // 正好 3 字符
            password: 'pass1234',
        });
        expect(result.username).toBe('abc');
    });

    /** 边界值：password 正好 8 位 */
    it('应通过边界值（密码正好 8 位）', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        const result = pipe.transform({
            username: 'admin01',
            password: 'abcd1234', // 正好 8 位且含字母+数字
        });
        expect(result.password).toBe('abcd1234');
    });

    /** 错误响应结构完整性 */
    it('错误响应应包含完整的 code、message、data 字段', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        try {
            pipe.transform({});
        } catch (error) {
            const response = (error as BadRequestException).getResponse() as Record<string, unknown>;

            // 验证结构
            expect(response).toHaveProperty('code');
            expect(response).toHaveProperty('message');
            expect(response).toHaveProperty('data');

            // 验证值类型
            expect(typeof response.code).toBe('number');
            expect(response.code).toBe(10001);
            expect(typeof response.message).toBe('string');
            expect(Array.isArray(response.data)).toBe(true);

            // data 数组中的每个元素应有 field 和 message
            const data = response.data as unknown[];
            if (data.length > 0) {
                const item = data[0] as Record<string, unknown>;
                expect(item).toHaveProperty('field');
                expect(item).toHaveProperty('message');
            }
        }
    });

    /** 空字符串字段拒绝 */
    it('应拒绝空字符串的必填字段', () => {
        const pipe = new ZodValidationPipe(TestSchema);

        try {
            pipe.transform({
                username: '',
                password: 'pass1234',
            });
            expect(true).toBe(false);
        } catch (error) {
            const response = (error as BadRequestException).getResponse() as {
                code: number;
                data: { field: string }[];
            };
            const usernameErrors = response.data.filter((e) => e.field === 'username');
            expect(usernameErrors.length).toBeGreaterThan(0);
        }
    });
});
