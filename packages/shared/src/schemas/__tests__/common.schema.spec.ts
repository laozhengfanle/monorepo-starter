import { describe, it, expect } from 'vitest';
import { PaginationSchema, UuidSchema, EmptyObjectSchema, ErrorResponseSchema } from '../common.schema.js';

// ── PaginationSchema 测试 ──
describe('PaginationSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的分页参数', () => {
        const result = PaginationSchema.safeParse({ page: 1, pageSize: 20 });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.page).toBe(1);
            expect(result.data.pageSize).toBe(20);
        }
    });

    /** 默认值生效 */
    it('应为空对象提供默认分页值', () => {
        const result = PaginationSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.page).toBe(1);
            expect(result.data.pageSize).toBe(20);
        }
    });

    /** page 最小值 1 */
    it('应拒绝 page 小于 1', () => {
        const cases = [0, -1, -100];
        for (const page of cases) {
            const result = PaginationSchema.safeParse({ page, pageSize: 20 });
            expect(result.success).toBe(false);
        }
    });

    /** pageSize 最小值 1 */
    it('应拒绝 pageSize 小于 1', () => {
        const cases = [0, -1, -100];
        for (const pageSize of cases) {
            const result = PaginationSchema.safeParse({ page: 1, pageSize });
            expect(result.success).toBe(false);
        }
    });

    /** pageSize 最大值 100 */
    it('应拒绝 pageSize 超过 100', () => {
        const result = PaginationSchema.safeParse({ page: 1, pageSize: 101 });
        expect(result.success).toBe(false);
    });

    /** pageSize 边界值：1 和 100 */
    it('应通过 pageSize 边界值 1 和 100', () => {
        expect(PaginationSchema.safeParse({ pageSize: 1 }).success).toBe(true);
        expect(PaginationSchema.safeParse({ pageSize: 100 }).success).toBe(true);
    });

    /** coercion：字符串数字自动转换 */
    it('应将字符串数字强制转换为 number', () => {
        const result = PaginationSchema.safeParse({ page: '3', pageSize: '50' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.page).toBe(3);
            expect(result.data.pageSize).toBe(50);
        }
    });

    /** 非数字字符串拒绝 */
    it('应拒绝非数字字符串', () => {
        const result = PaginationSchema.safeParse({ page: 'abc', pageSize: 20 });
        expect(result.success).toBe(false);
    });
});

// ── UuidSchema 测试 ──
describe('UuidSchema', () => {
    /** 有效 UUID v4 */
    it('应通过合法的 UUID v4', () => {
        const result = UuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
        expect(result.success).toBe(true);
    });

    /** 有效 UUID v7 */
    it('应通过合法的 UUID v7', () => {
        const result = UuidSchema.safeParse('018f3c3c-9c9c-7e5b-a1e3-8c8f3b5ab123');
        expect(result.success).toBe(true);
    });

    /** 无效 UUID 格式 */
    it('应拒绝非 UUID 字符串', () => {
        const cases = ['not-a-uuid', '12345', '', '550e8400-e29b-41d4-a716'];
        for (const value of cases) {
            const result = UuidSchema.safeParse(value);
            expect(result.success).toBe(false);
        }
    });

    /** 非字符串类型拒绝 */
    it('应拒绝非字符串类型', () => {
        expect(UuidSchema.safeParse(12345).success).toBe(false);
        expect(UuidSchema.safeParse(null).success).toBe(false);
        expect(UuidSchema.safeParse(undefined).success).toBe(false);
        expect(UuidSchema.safeParse({}).success).toBe(false);
    });
});

// ── EmptyObjectSchema 测试 ──
describe('EmptyObjectSchema', () => {
    /** undefined 通过（optional） */
    it('应通过 undefined 输入', () => {
        const result = EmptyObjectSchema.safeParse(undefined);
        expect(result.success).toBe(true);
    });

    /** 空对象通过 */
    it('应通过空对象', () => {
        const result = EmptyObjectSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    /** 非空对象应通过（不 strict） */
    it('应通过非空对象', () => {
        const result = EmptyObjectSchema.safeParse({ anything: 'value' });
        expect(result.success).toBe(true);
    });
});

// ── ErrorResponseSchema 测试 ──
describe('ErrorResponseSchema', () => {
    /** 标准错误响应 */
    it('应通过标准错误响应结构', () => {
        const result = ErrorResponseSchema.safeParse({
            code: 10001,
            message: '参数验证失败',
            data: null,
        });
        expect(result.success).toBe(true);
    });

    /** data 为对象 */
    it('应通过 data 为对象的错误响应', () => {
        const result = ErrorResponseSchema.safeParse({
            code: 10002,
            message: '资源不存在',
            data: { id: 'missing-id' },
        });
        expect(result.success).toBe(true);
    });

    /** data 为数组 */
    it('应通过 data 为数组的错误响应', () => {
        const result = ErrorResponseSchema.safeParse({
            code: 10001,
            message: '参数验证失败',
            data: [{ field: 'username', message: '不能为空' }],
        });
        expect(result.success).toBe(true);
    });

    /** 缺失 code 拒绝 */
    it('应拒绝缺失 code 字段', () => {
        const result = ErrorResponseSchema.safeParse({ message: 'error' });
        expect(result.success).toBe(false);
    });

    /** 缺失 message 拒绝 */
    it('应拒绝缺失 message 字段', () => {
        const result = ErrorResponseSchema.safeParse({ code: 500 });
        expect(result.success).toBe(false);
    });

    /** code 非数字拒绝 */
    it('应拒绝 code 为非数字', () => {
        const result = ErrorResponseSchema.safeParse({
            code: '10001',
            message: 'error',
            data: null,
        });
        expect(result.success).toBe(false);
    });
});
