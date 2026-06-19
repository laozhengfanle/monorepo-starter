import type { ZodTypeAny } from 'zod';

/** 字段级规则元数据，前端表单校验和规则弹窗使用 */
export interface FieldRuleSet {
    /** 是否必填（非 optional / 非 nullable） */
    required: boolean;
    /** 最小长度（z.string().min(n)） */
    minLength?: number;
    /** 最大长度（z.string().max(n)） */
    maxLength?: number;
    /** 正则模式（z.string().regex()） */
    pattern?: RegExp;
    /** 最小数值（z.number().min(n)） */
    min?: number;
    /** 最大数值（z.number().max(n)） */
    max?: number;
    /** 枚举值（z.enum()） */
    enumValues?: string[];
    /** Zod schema 中内置的错误消息（取第一个遇到的） */
    message?: string;
}

/**
 * 从 Zod schema 中提取字段级验证规则，供前端表单校验和规则弹窗使用。
 *
 * - 传入 ZodObject 时，返回 Record<string, FieldRuleSet>，每个字段对应一条规则
 * - 传入单个字段 schema 时，返回 FieldRuleSet
 *
 * 支持的 Zod 类型：
 *   ZodString / ZodNumber / ZodEnum / ZodOptional / ZodNullable /
 *   ZodArray / ZodObject / ZodDefault / ZodEffects（.refine() 等会跳过 effect，只提取内部 schema 的规则）
 */
export function zodToRules(schema: ZodTypeAny): FieldRuleSet | Record<string, FieldRuleSet> {
    const def = schema._def;

    // ── ZodObject：遍历 shape，为每个字段递归提取规则 ──
    if (def.typeName === 'ZodObject') {
        const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
        const result: Record<string, FieldRuleSet> = {};
        for (const [key, fieldSchema] of Object.entries(shape)) {
            // 每个字段都是单字段 schema，递归调用提取 FieldRuleSet
            result[key] = extractFieldRules(fieldSchema as ZodTypeAny, true);
        }
        return result;
    }

    // ── 单字段 schema：直接提取规则 ──
    return extractFieldRules(schema, true);
}

/**
 * 递归提取单个字段的验证规则。
 *
 * @param schema   - 当前 Zod schema 节点
 * @param required - 当前字段是否"必填"（遇到 optional/nullable 会变为 false）
 */
function extractFieldRules(schema: ZodTypeAny, required: boolean): FieldRuleSet {
    const def = schema._def;

    switch (def.typeName) {
        // ── ZodOptional：标记为非必填，继续解包内部 schema ──
        case 'ZodOptional':
            return extractFieldRules(def.innerType, false);

        // ── ZodNullable：标记为非必填，继续解包内部 schema ──
        case 'ZodNullable':
            return extractFieldRules(def.innerType, false);

        // ── ZodDefault：解包内部 schema（默认值不影响校验规则） ──
        case 'ZodDefault':
            return extractFieldRules(def.innerType, required);

        // ── ZodEffects（.refine() / .transform() 等）：跳过 effect，只提取内部 schema ──
        case 'ZodEffects':
            return extractFieldRules(def.schema, required);

        // ── ZodString：从 checks 数组中提取 min / max / regex ──
        case 'ZodString': {
            const rules: FieldRuleSet = { required };
            let message: string | undefined;

            for (const check of def.checks ?? []) {
                switch (check.kind) {
                    case 'min':
                        rules.minLength = check.value;
                        // 提取 check 上的错误消息
                        if (check.message && !message) message = String(check.message);
                        break;
                    case 'max':
                        rules.maxLength = check.value;
                        if (check.message && !message) message = String(check.message);
                        break;
                    case 'regex':
                        rules.pattern = check.regex;
                        if (check.message && !message) message = String(check.message);
                        break;
                    // email / url / uuid 等内置校验，暂不提取 pattern（正则由 Zod 内部管理）
                    default:
                        if (check.message && !message) message = String(check.message);
                        break;
                }
            }

            if (message) rules.message = message;
            return rules;
        }

        // ── ZodNumber：从 checks 数组中提取 min / max ──
        case 'ZodNumber': {
            const rules: FieldRuleSet = { required };
            let message: string | undefined;

            for (const check of def.checks ?? []) {
                switch (check.kind) {
                    case 'min':
                        rules.min = check.value;
                        if (check.message && !message) message = String(check.message);
                        break;
                    case 'max':
                        rules.max = check.value;
                        if (check.message && !message) message = String(check.message);
                        break;
                    // int / positive / negative 等校验暂不提取
                    default:
                        if (check.message && !message) message = String(check.message);
                        break;
                }
            }

            if (message) rules.message = message;
            return rules;
        }

        // ── ZodEnum：提取枚举值列表 ──
        case 'ZodEnum': {
            const rules: FieldRuleSet = { required, enumValues: def.values };
            return rules;
        }

        // ── ZodUnion：合并所有 union 成员的规则（取最宽松解释） ──
        case 'ZodUnion': {
            const options: ZodTypeAny[] = def.options ?? [];
            if (options.length === 0) return { required };

            // 提取每个 union 成员的规则
            const memberRules = options.map((opt) => extractFieldRules(opt, required));

            // 如果任一成员是非必填的，整个 union 可视为非必填
            const anyOptional = memberRules.some((r) => !r.required);

            // 合并规则：收集所有 enumValues（用于 z.union([z.enum(...), z.enum(...)]) 等场景）
            const allEnumValues: string[] = [];
            // 取最宽松的 min/max/minLength/maxLength（即最大值范围）
            let mergedMin: number | undefined;
            let mergedMax: number | undefined;
            let mergedMinLength: number | undefined;
            let mergedMaxLength: number | undefined;
            let mergedPattern: RegExp | undefined;
            let mergedMessage: string | undefined;

            for (const rules of memberRules) {
                if (rules.enumValues) allEnumValues.push(...rules.enumValues);
                if (rules.min !== undefined && (mergedMin === undefined || rules.min < mergedMin))
                    mergedMin = rules.min;
                if (rules.max !== undefined && (mergedMax === undefined || rules.max > mergedMax))
                    mergedMax = rules.max;
                if (
                    rules.minLength !== undefined &&
                    (mergedMinLength === undefined || rules.minLength < mergedMinLength)
                )
                    mergedMinLength = rules.minLength;
                if (
                    rules.maxLength !== undefined &&
                    (mergedMaxLength === undefined || rules.maxLength > mergedMaxLength)
                )
                    mergedMaxLength = rules.maxLength;
                // pattern：任意成员的 pattern 都保留（第一个遇到的）
                if (rules.pattern && !mergedPattern) mergedPattern = rules.pattern;
                // message：保留第一个
                if (rules.message && !mergedMessage) mergedMessage = rules.message;
            }

            const merged: FieldRuleSet = { required: !anyOptional };
            if (allEnumValues.length > 0) merged.enumValues = [...new Set(allEnumValues)];
            if (mergedMin !== undefined) merged.min = mergedMin;
            if (mergedMax !== undefined) merged.max = mergedMax;
            if (mergedMinLength !== undefined) merged.minLength = mergedMinLength;
            if (mergedMaxLength !== undefined) merged.maxLength = mergedMaxLength;
            if (mergedPattern) merged.pattern = mergedPattern;
            if (mergedMessage) merged.message = mergedMessage;

            return merged;
        }

        // ── ZodArray：提取数组长度约束 ──
        case 'ZodArray': {
            const rules: FieldRuleSet = { required };

            // Zod v3.25+ 数组长度约束直接放在 _def 上，而非 checks 数组
            if (def.minLength) {
                rules.minLength = def.minLength.value;
                if (def.minLength.message && !rules.message) {
                    rules.message = String(def.minLength.message);
                }
            }
            if (def.maxLength) {
                rules.maxLength = def.maxLength.value;
                if (def.maxLength.message && !rules.message) {
                    rules.message = String(def.maxLength.message);
                }
            }
            if (def.exactLength) {
                rules.minLength = def.exactLength.value;
                rules.maxLength = def.exactLength.value;
                if (def.exactLength.message && !rules.message) {
                    rules.message = String(def.exactLength.message);
                }
            }

            return rules;
        }

        // ── 未知类型：仅返回 required 标记 ──
        default:
            return { required };
    }
}
