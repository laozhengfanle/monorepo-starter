/**
 * zod-form-rules 工具函数单元测试
 *
 * 测试范围：
 *   - zodToFormRules：FieldRuleSet → Naive UI FormRules 转换
 *   - zodToPopoverRules：FieldRuleSet → FieldRulePopover RuleItem[] 转换
 */
import { describe, it, expect } from 'vitest';
import { zodToFormRules, zodToPopoverRules } from '@/shared/utils/zod-form-rules';
import type { FieldRuleSet } from '@packages/shared';
import type { FormItemRule } from 'naive-ui';

describe('zodToFormRules', () => {
    it('必填字符串字段：生成 required 规则', () => {
        const rulesMap: Record<string, FieldRuleSet> = {
            username: { required: true },
        };

        const result = zodToFormRules(rulesMap);

        // 应生成一条 required 规则
        // 将 FormRules 收窄为数组形式以便索引断言
        const typed = result as unknown as Record<string, FormItemRule[]>;
        expect(typed.username).toHaveLength(1);
        expect(typed.username[0]).toEqual({
            required: true,
            message: '请输入username',
            trigger: 'blur',
        });
    });

    it('可选字段：不生成 required 规则', () => {
        const rulesMap: Record<string, FieldRuleSet> = {
            nickname: { required: false },
        };

        const result = zodToFormRules(rulesMap);

        // 可选字段不应生成任何规则
        expect(result.nickname).toHaveLength(0);
    });

    it('minLength / maxLength 规则', () => {
        const rulesMap: Record<string, FieldRuleSet> = {
            password: { required: true, minLength: 6, maxLength: 20 },
        };

        const result = zodToFormRules(rulesMap);

        // 应生成 3 条规则：required + min + max
        expect(result.password).toHaveLength(3);
        expect(result.password).toContainEqual({
            required: true,
            message: '请输入password',
            trigger: 'blur',
        });
        expect(result.password).toContainEqual({
            min: 6,
            message: '至少 6 个字符',
            trigger: 'blur',
        });
        expect(result.password).toContainEqual({
            max: 20,
            message: '最多 20 个字符',
            trigger: 'blur',
        });
    });

    it('pattern 规则', () => {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const rulesMap: Record<string, FieldRuleSet> = {
            email: { required: true, pattern: emailPattern },
        };

        const result = zodToFormRules(rulesMap);

        // 应生成 required + pattern 两条规则
        expect(result.email).toHaveLength(2);
        expect(result.email).toContainEqual({
            pattern: emailPattern,
            message: '格式不正确',
            trigger: 'blur',
        });
    });

    it('pattern 规则使用 ruleSet.message 作为提示', () => {
        const pattern = /^\d+$/;
        const rulesMap: Record<string, FieldRuleSet> = {
            code: { required: false, pattern, message: '只能输入数字' },
        };

        const result = zodToFormRules(rulesMap);

        // pattern 规则应使用自定义 message
        const typed = result as unknown as Record<string, FormItemRule[]>;
        expect(typed.code).toHaveLength(1);
        expect(typed.code[0]).toEqual({
            pattern,
            message: '只能输入数字',
            trigger: 'blur',
        });
    });

    it('fieldLabels 选项：用中文名称生成提示消息', () => {
        const rulesMap: Record<string, FieldRuleSet> = {
            username: { required: true },
            email: { required: true, pattern: /@/ },
        };

        const result = zodToFormRules(rulesMap, {
            fieldLabels: { username: '用户名', email: '邮箱' },
        });

        // required 规则应使用中文 label
        // 将 FormRules 收窄为数组形式以便索引断言
        const typed = result as unknown as Record<string, FormItemRule[]>;
        expect(typed.username[0]).toEqual({
            required: true,
            message: '请输入用户名',
            trigger: 'blur',
        });
        expect(typed.email[0]).toEqual({
            required: true,
            message: '请输入邮箱',
            trigger: 'blur',
        });
    });

    it('数值 min / max 规则', () => {
        const rulesMap: Record<string, FieldRuleSet> = {
            age: { required: true, min: 0, max: 150 },
        };

        const result = zodToFormRules(rulesMap);

        // 应生成 required + min + max 三条规则
        expect(result.age).toHaveLength(3);
        expect(result.age).toContainEqual({
            type: 'number' as const,
            min: 0,
            message: '最小值 0',
            trigger: 'blur',
        });
        expect(result.age).toContainEqual({
            type: 'number' as const,
            max: 150,
            message: '最大值 150',
            trigger: 'blur',
        });
    });

    it('空 rulesMap 返回空对象', () => {
        const result = zodToFormRules({});
        expect(result).toEqual({});
    });
});

describe('zodToPopoverRules', () => {
    it('必填 + minLength + maxLength 组合规则', () => {
        const ruleSet: FieldRuleSet = {
            required: true,
            minLength: 2,
            maxLength: 20,
        };

        const result = zodToPopoverRules(ruleSet);

        // 应生成 3 条规则
        expect(result).toHaveLength(3);

        // 必填规则
        expect(result[0].label).toBe('必填');
        expect(result[0].check('hello')).toBe(true);
        expect(result[0].check('')).toBe(false);
        expect(result[0].check(null)).toBe(false);
        expect(result[0].check(undefined)).toBe(false);

        // 最小长度规则
        expect(result[1].label).toBe('至少 2 个字符');
        expect(result[1].check('ab')).toBe(true);
        expect(result[1].check('a')).toBe(false);

        // 最大长度规则
        expect(result[2].label).toBe('最多 20 个字符');
        expect(result[2].check('a'.repeat(20))).toBe(true);
        expect(result[2].check('a'.repeat(21))).toBe(false);
    });

    it('可选字段：不生成必填规则', () => {
        const ruleSet: FieldRuleSet = {
            required: false,
            maxLength: 100,
        };

        const result = zodToPopoverRules(ruleSet);

        // 不应有"必填"规则，只有 maxLength 规则
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe('最多 100 个字符');
    });

    it('enumValues 规则', () => {
        const ruleSet: FieldRuleSet = {
            required: true,
            enumValues: ['admin', 'editor', 'viewer'],
        };

        const result = zodToPopoverRules(ruleSet);

        // 应生成必填 + enumValues 两条规则
        expect(result).toHaveLength(2);

        // 枚举值规则
        const enumRule = result[1];
        expect(enumRule.label).toBe('可选值: admin/editor/viewer');
        // 值在枚举列表中
        expect(enumRule.check('admin')).toBe(true);
        expect(enumRule.check('editor')).toBe(true);
        // 值不在枚举列表中
        expect(enumRule.check('superadmin')).toBe(false);
        // 空值视为通过（非必填场景下允许不选）
        expect(enumRule.check('')).toBe(true);
    });

    it('pattern 规则', () => {
        const ruleSet: FieldRuleSet = {
            required: false,
            pattern: /^\d+$/,
        };

        const result = zodToPopoverRules(ruleSet);

        expect(result).toHaveLength(1);
        expect(result[0].label).toBe('格式正确');
        // 匹配正则
        expect(result[0].check('123')).toBe(true);
        // 不匹配正则
        expect(result[0].check('abc')).toBe(false);
        // 空值视为通过
        expect(result[0].check('')).toBe(true);
    });

    it('数值 min / max 规则', () => {
        const ruleSet: FieldRuleSet = {
            required: true,
            min: 1,
            max: 100,
        };

        const result = zodToPopoverRules(ruleSet);

        // 必填 + min + max
        expect(result).toHaveLength(3);

        // 最小值规则
        expect(result[1].label).toBe('最小值 1');
        expect(result[1].check(1)).toBe(true);
        expect(result[1].check(0)).toBe(false);

        // 最大值规则
        expect(result[2].label).toBe('最大值 100');
        expect(result[2].check(100)).toBe(true);
        expect(result[2].check(101)).toBe(false);
    });

    it('空规则集返回空数组', () => {
        const ruleSet: FieldRuleSet = { required: false };
        const result = zodToPopoverRules(ruleSet);
        expect(result).toEqual([]);
    });
});
