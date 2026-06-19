/**
 * Zod 规则适配器 — 将 FieldRuleSet 转换为 Naive UI 表单规则和 FieldRulePopover 规则
 *
 * 两个核心函数：
 *   - zodToFormRules：将 FieldRuleSet 映射表转为 Naive UI FormRules 格式，用于 n-form 校验
 *   - zodToPopoverRules：将单个 FieldRuleSet 转为 FieldRulePopover 的 RuleItem[] 格式，用于规则弹窗实时校验
 *
 * 数据流：Zod Schema → zodToRules() → FieldRuleSet → 本文件适配器 → Naive UI / FieldRulePopover
 */
import type { FormRules } from 'naive-ui';
import type { FieldRuleSet } from '@packages/shared';
import type { RuleItem } from '@/shared/components/FieldRulePopover.vue';

/**
 * 将 FieldRuleSet 映射表转换为 Naive UI FormRules 格式
 *
 * 每个 FieldRuleSet 会展开为一条或多条 Naive UI 表单规则对象（required / min / max / pattern 等）。
 * 可通过 fieldLabels 参数为字段提供中文名称，用于生成"请输入用户名"之类的提示消息。
 *
 * @param rulesMap  - 字段名到 FieldRuleSet 的映射，通常由 zodToRules() 生成
 * @param options   - 可选配置
 * @param options.fieldLabels - 字段中文名称映射，如 { username: '用户名' }；未提供时使用字段 key
 * @returns Naive UI FormRules 对象
 */
export function zodToFormRules(
    rulesMap: Record<string, FieldRuleSet>,
    options?: { fieldLabels?: Record<string, string> },
): FormRules {
    const fieldLabels = options?.fieldLabels ?? {};
    const result: FormRules = {};

    for (const [fieldKey, ruleSet] of Object.entries(rulesMap)) {
        // 获取字段的中文名称，没有则用字段 key
        const label = fieldLabels[fieldKey] ?? fieldKey;
        const rules: FormRules[string] = [];

        // 必填规则
        if (ruleSet.required) {
            rules.push({
                required: true,
                message: ruleSet.message ?? `请输入${label}`,
                trigger: 'blur',
            });
        }

        // 最小长度规则
        if (ruleSet.minLength !== undefined) {
            rules.push({
                min: ruleSet.minLength,
                message: `至少 ${ruleSet.minLength} 个字符`,
                trigger: 'blur',
            });
        }

        // 最大长度规则
        if (ruleSet.maxLength !== undefined) {
            rules.push({
                max: ruleSet.maxLength,
                message: `最多 ${ruleSet.maxLength} 个字符`,
                trigger: 'blur',
            });
        }

        // 正则模式规则
        if (ruleSet.pattern !== undefined) {
            rules.push({
                pattern: ruleSet.pattern,
                message: ruleSet.message ?? '格式不正确',
                trigger: 'blur',
            });
        }

        // 数值最小值规则
        if (ruleSet.min !== undefined) {
            rules.push({
                type: 'number' as const,
                min: ruleSet.min,
                message: `最小值 ${ruleSet.min}`,
                trigger: 'blur',
            });
        }

        // 数值最大值规则
        if (ruleSet.max !== undefined) {
            rules.push({
                type: 'number' as const,
                max: ruleSet.max,
                message: `最大值 ${ruleSet.max}`,
                trigger: 'blur',
            });
        }

        result[fieldKey] = rules;
    }

    return result;
}

/**
 * 将单个 FieldRuleSet 转换为 FieldRulePopover 的 RuleItem[] 格式
 *
 * 每条规则包含一个 label（规则描述）和一个 check 函数（实时校验当前值是否满足）。
 * 用于 FieldRulePopover 组件，在用户输入时实时显示规则满足状态。
 *
 * @param ruleSet - 单个字段的规则集，通常来自 zodToRules() 返回的映射中某个字段
 * @returns RuleItem 数组，可直接传给 FieldRulePopover 的 rules prop
 */
export function zodToPopoverRules(ruleSet: FieldRuleSet): RuleItem[] {
    const rules: RuleItem[] = [];

    // 必填规则：值不能为 undefined、null 或空字符串
    if (ruleSet.required) {
        rules.push({
            label: '必填',
            check: (v) => v !== undefined && v !== null && v !== '',
        });
    }

    // 最小长度规则：字符串长度必须 >= minLength
    if (ruleSet.minLength !== undefined) {
        const min = ruleSet.minLength;
        rules.push({
            label: `至少 ${min} 个字符`,
            check: (v) => typeof v === 'string' && v.length >= min,
        });
    }

    // 最大长度规则：字符串长度必须 <= maxLength
    if (ruleSet.maxLength !== undefined) {
        const max = ruleSet.maxLength;
        rules.push({
            label: `最多 ${max} 个字符`,
            check: (v) => typeof v === 'string' && v.length <= max,
        });
    }

    // 正则模式规则：值为空或匹配 pattern 视为通过
    if (ruleSet.pattern !== undefined) {
        const pattern = ruleSet.pattern;
        rules.push({
            label: '格式正确',
            check: (v) => !v || pattern.test(String(v)),
        });
    }

    // 数值最小值规则
    if (ruleSet.min !== undefined) {
        const min = ruleSet.min;
        rules.push({
            label: `最小值 ${min}`,
            check: (v) => Number(v) >= min,
        });
    }

    // 数值最大值规则
    if (ruleSet.max !== undefined) {
        const max = ruleSet.max;
        rules.push({
            label: `最大值 ${max}`,
            check: (v) => Number(v) <= max,
        });
    }

    // 枚举值规则：值为空或在枚举列表中视为通过
    if (ruleSet.enumValues !== undefined) {
        const values = ruleSet.enumValues;
        rules.push({
            label: `可选值: ${values.join('/')}`,
            check: (v) => !v || values.includes(String(v)),
        });
    }

    return rules;
}
