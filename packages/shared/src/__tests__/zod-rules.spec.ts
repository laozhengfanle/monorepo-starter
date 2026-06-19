import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToRules } from '../utils/zod-rules.js';

// ── zodToRules 单元测试 ──
describe('zodToRules', () => {
    // ── ZodString：提取 min / max 长度 ──
    it('应从 z.string().min(3).max(50) 提取 minLength 和 maxLength', () => {
        const rules = zodToRules(z.string().min(3).max(50));
        expect(rules).toEqual({
            required: true,
            minLength: 3,
            maxLength: 50,
        });
    });

    // ── ZodString：提取正则模式 ──
    it('应从 z.string().regex() 提取 pattern', () => {
        const pattern = /^[a-z]+$/;
        const rules = zodToRules(z.string().regex(pattern));
        expect(rules).toEqual({
            required: true,
            pattern,
        });
    });

    // ── ZodString：email 校验不抛错（Zod v3.25 中 email 是 ZodString 的 check，不是 ZodEffects） ──
    it('应处理 z.string().email() 而不抛错', () => {
        const rules = zodToRules(z.string().email());
        // email check 不会产生 pattern，但不会报错
        expect(rules).toEqual({
            required: true,
        });
    });

    // ── ZodString：带错误消息 ──
    it('应从 z.string().min() 提取错误消息', () => {
        const rules = zodToRules(z.string().min(1, '至少 1 个字符'));
        expect(rules).toEqual({
            required: true,
            minLength: 1,
            message: '至少 1 个字符',
        });
    });

    // ── ZodString：多个 check 的消息取第一个 ──
    it('应取第一个遇到的错误消息', () => {
        const rules = zodToRules(z.string().min(1, 'min msg').max(50, 'max msg'));
        expect(rules).toEqual({
            required: true,
            minLength: 1,
            maxLength: 50,
            message: 'min msg',
        });
    });

    // ── ZodNumber：提取 min / max ──
    it('应从 z.number().int().min(0).max(100) 提取 min 和 max', () => {
        const rules = zodToRules(z.number().int().min(0).max(100));
        expect(rules).toEqual({
            required: true,
            min: 0,
            max: 100,
        });
    });

    // ── ZodNumber：带错误消息 ──
    it('应从 z.number().min() 提取错误消息', () => {
        const rules = zodToRules(z.number().min(0, '不能为负数'));
        expect(rules).toEqual({
            required: true,
            min: 0,
            message: '不能为负数',
        });
    });

    // ── ZodEnum：提取枚举值 ──
    it('应从 z.enum() 提取 enumValues', () => {
        const rules = zodToRules(z.enum(['a', 'b', 'c']));
        expect(rules).toEqual({
            required: true,
            enumValues: ['a', 'b', 'c'],
        });
    });

    // ── ZodOptional：设置 required=false，保留内部规则 ──
    it('应将 .optional() 标记为 required=false 并保留内部规则', () => {
        const rules = zodToRules(z.string().min(3).max(50).optional());
        expect(rules).toEqual({
            required: false,
            minLength: 3,
            maxLength: 50,
        });
    });

    // ── ZodString.email().optional()：required=false，email 不产生 pattern ──
    it('应处理 z.string().email().optional() 为 required=false', () => {
        const rules = zodToRules(z.string().email().optional());
        expect(rules).toEqual({
            required: false,
        });
    });

    // ── ZodNullable：设置 required=false ──
    it('应将 .nullable() 标记为 required=false', () => {
        const rules = zodToRules(z.string().nullable());
        expect(rules).toEqual({
            required: false,
        });
    });

    // ── ZodDefault：解包内部类型，保留 required ──
    it('应从 .default() 解包内部类型', () => {
        const rules = zodToRules(z.string().min(1).max(50).default('hello'));
        // default 不改变 required 状态，仍然是必填
        expect(rules).toEqual({
            required: true,
            minLength: 1,
            maxLength: 50,
        });
    });

    // ── ZodDefault + ZodNumber：解包并保留数值规则 ──
    it('应从 z.number().min(0).default(5) 提取 min', () => {
        const rules = zodToRules(z.number().min(0).default(5));
        expect(rules).toEqual({
            required: true,
            min: 0,
        });
    });

    // ── ZodEffects (.refine())：跳过 effect，提取内部 schema 规则 ──
    it('应跳过 .refine() 并提取内部 schema 规则', () => {
        const rules = zodToRules(
            z
                .string()
                .min(1)
                .refine((v) => v.startsWith('a')),
        );
        expect(rules).toEqual({
            required: true,
            minLength: 1,
        });
    });

    // ── ZodEffects (.transform())：跳过 effect，提取内部 schema 规则 ──
    it('应跳过 .transform() 并提取内部 schema 规则', () => {
        const rules = zodToRules(
            z
                .string()
                .min(2)
                .transform((v) => v.toUpperCase()),
        );
        expect(rules).toEqual({
            required: true,
            minLength: 2,
        });
    });

    // ── ZodArray：提取 min/max 长度约束 ──
    it('应从 z.array().min().max() 提取 minLength 和 maxLength', () => {
        const rules = zodToRules(z.array(z.string()).min(1).max(10));
        expect(rules).toEqual({
            required: true,
            minLength: 1,
            maxLength: 10,
        });
    });

    // ── ZodArray：无长度约束 ──
    it('应处理无约束的 z.array()', () => {
        const rules = zodToRules(z.array(z.string()));
        expect(rules).toEqual({
            required: true,
        });
    });

    // ── ZodObject：遍历每个字段提取规则 ──
    it('应从 ZodObject 提取所有字段的规则', () => {
        const schema = z.object({
            name: z.string().min(1).max(50),
            age: z.number().min(0).optional(),
        });
        const rules = zodToRules(schema);
        expect(rules).toEqual({
            name: { required: true, minLength: 1, maxLength: 50 },
            age: { required: false, min: 0 },
        });
    });

    // ── ZodObject：包含 enum 字段 ──
    it('应从 ZodObject 中提取 enum 字段的 enumValues', () => {
        const schema = z.object({
            role: z.enum(['admin', 'user', 'guest']),
            name: z.string().min(1),
        });
        const rules = zodToRules(schema);
        expect(rules).toEqual({
            role: { required: true, enumValues: ['admin', 'user', 'guest'] },
            name: { required: true, minLength: 1 },
        });
    });

    // ── ZodObject：包含 .default() 字段 ──
    it('应从 ZodObject 中正确解包 .default() 字段', () => {
        const schema = z.object({
            status: z.string().min(1).default('active'),
        });
        const rules = zodToRules(schema);
        expect(rules).toEqual({
            status: { required: true, minLength: 1 },
        });
    });

    // ── ZodObject：包含 .refine() 字段 ──
    it('应从 ZodObject 中跳过 .refine() 并提取内部规则', () => {
        const schema = z.object({
            password: z
                .string()
                .min(8)
                .refine((v) => /[A-Z]/.test(v)),
        });
        const rules = zodToRules(schema);
        expect(rules).toEqual({
            password: { required: true, minLength: 8 },
        });
    });

    // ── 纯 z.string() 无约束 ──
    it('应处理无约束的 z.string()', () => {
        const rules = zodToRules(z.string());
        expect(rules).toEqual({
            required: true,
        });
    });

    // ── 纯 z.number() 无约束 ──
    it('应处理无约束的 z.number()', () => {
        const rules = zodToRules(z.number());
        expect(rules).toEqual({
            required: true,
        });
    });

    // ── z.coerce.number() 应被识别为 ZodNumber ──
    it('应处理 z.coerce.number()', () => {
        const rules = zodToRules(z.coerce.number().min(0).max(100));
        expect(rules).toEqual({
            required: true,
            min: 0,
            max: 100,
        });
    });

    // ── ZodUnion：合并同类型成员的规则 ──
    it('应从 z.union([z.string().min(1), z.string().min(5)]) 取最宽松的 minLength', () => {
        const rules = zodToRules(z.union([z.string().min(5), z.string().min(1)]));
        expect(rules).toEqual({
            required: true,
            minLength: 1,
        });
    });

    // ── ZodUnion：合并 enum union 的 enumValues ──
    it('应从 z.union([z.enum(["a","b"]), z.enum(["c"])]) 合并 enumValues', () => {
        const rules = zodToRules(z.union([z.enum(['a', 'b']), z.enum(['c'])]));
        expect(rules).toEqual({
            required: true,
            enumValues: ['a', 'b', 'c'],
        });
    });

    // ── ZodUnion：含 optional 成员的 union 整体视为非必填 ──
    it('若任一 union 成员为 optional，整体应视为非必填', () => {
        const rules = zodToRules(z.union([z.string().min(1), z.string().optional()]));
        expect(rules).toEqual({
            required: false,
            minLength: 1,
        });
    });
});
