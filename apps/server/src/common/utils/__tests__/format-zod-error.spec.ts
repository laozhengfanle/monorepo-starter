import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { formatZodError } from '../format-zod-error.js';

// ── formatZodError 测试 ──
describe('formatZodError', () => {
    /** 正常：将 ZodError 转换为 [{ field, message }] 格式 */
    it('应将单个字段错误转换为 field + message', () => {
        const schema = z.object({ name: z.string().min(1) });
        const result = schema.safeParse({ name: '' });

        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toEqual({
                field: 'name',
                message: expect.any(String),
            });
            expect(errors[0].message.length).toBeGreaterThan(0);
        }
    });

    /** 多个字段错误 → 多个 FieldError */
    it('应处理多个字段错误', () => {
        const schema = z.object({
            username: z.string().min(1),
            password: z.string().min(8),
        });
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            expect(errors.length).toBeGreaterThanOrEqual(2);
            const fields = errors.map((e) => e.field);
            expect(fields).toContain('username');
            expect(fields).toContain('password');
        }
    });

    /** 嵌套路径 → 点号连接 */
    it('应使用点号连接嵌套路径', () => {
        const schema = z.object({
            user: z.object({
                profile: z.object({
                    email: z.string().email(),
                }),
            }),
        });
        const result = schema.safeParse({
            user: { profile: { email: 'not-an-email' } },
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            expect(errors[0].field).toBe('user.profile.email');
        }
    });

    /** 数组索引路径 */
    it('应处理数组索引路径', () => {
        const schema = z.object({
            roleIds: z.array(z.string().uuid()),
        });
        const result = schema.safeParse({
            roleIds: ['not-a-uuid', '550e8400-e29b-41d4-a716-446655440000'],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            // 第一个元素不合法，路径应为 roleIds.0
            expect(errors[0].field).toBe('roleIds.0');
        }
    });

    /** union 类型错误 — field 为空字符串 */
    it('应处理无路径的错误（如 union 类型不匹配）', () => {
        const schema = z.union([z.string().email(), z.number()]);
        const result = schema.safeParse(true);
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            expect(errors.length).toBeGreaterThan(0);
            // union 错误可能 field 为空字符串
            expect(typeof errors[0].field).toBe('string');
            expect(typeof errors[0].message).toBe('string');
        }
    });

    /** strict 模式 — 多余字段错误 */
    it('应识别 strict 模式下多余字段', () => {
        const schema = z.object({ name: z.string() }).strict();
        const result = schema.safeParse({ name: 'test', extra: 'hack' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            // strict 模式下未识别字段的 path 为空数组，field 为空字符串
            const strictError = errors.find((e) => e.message.toLowerCase().includes('unrecognized'));
            expect(strictError).toBeDefined();
            // message 应包含被拒绝的字段名
            expect(strictError!.message).toMatch(/extra/i);
        }
    });

    /** 多个同一字段的错误（min + max 同时触发） */
    it('应处理同一字段的多个约束错误', () => {
        const schema = z.object({
            password: z.string().min(8).max(20),
        });
        const result = schema.safeParse({ password: 'ab' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors[0].field).toBe('password');
        }
    });

    /** 自定义错误消息保留 */
    it('应保留自定义错误消息', () => {
        const customMessage = '手机号格式不正确';
        const schema = z.object({
            phone: z.string().regex(/^1[3-9]\d{9}$/, customMessage),
        });
        const result = schema.safeParse({ phone: '12345' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            expect(errors[0].message).toBe(customMessage);
        }
    });

    /** refine 约束错误 */
    it('应处理 refine 约束错误', () => {
        const schema = z
            .object({
                oldPassword: z.string(),
                newPassword: z.string(),
            })
            .refine((data) => data.oldPassword !== data.newPassword, {
                message: '新旧密码不能相同',
                path: ['newPassword'],
            });
        const result = schema.safeParse({
            oldPassword: 'same123',
            newPassword: 'same123',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            expect(errors[0].field).toBe('newPassword');
            expect(errors[0].message).toBe('新旧密码不能相同');
        }
    });

    /** coercion 类型转换错误 */
    it('应处理 coercion 类型错误', () => {
        const schema = z.object({
            age: z.coerce.number().int().min(0),
        });
        const result = schema.safeParse({ age: 'not-a-number' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            expect(errors.length).toBeGreaterThanOrEqual(1);
            expect(errors[0].field).toBe('age');
        }
    });

    /** 枚举值错误 */
    it('应处理枚举值错误', () => {
        const schema = z.object({
            type: z.enum(['directory', 'menu', 'button']),
        });
        const result = schema.safeParse({ type: 'invalid_type' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const errors = formatZodError(result.error);
            expect(errors[0].field).toBe('type');
            expect(errors[0].message).toMatch(/invalid/i);
        }
    });

    /** ZodError 类型守卫 — 确保不抛异常 */
    it('应对合法输入不抛异常（不会触发此路径，仅验证函数签名安全）', () => {
        // 这是纯函数测试，验证它对各种输入都不会崩溃
        // 实际使用中 formatZodError 只会收到 ZodError
        const error = new z.ZodError([]);
        const result = formatZodError(error);
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(0);
    });
});
