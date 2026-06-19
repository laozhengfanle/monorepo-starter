/**
 * 安全 JSON 解析 — 原型链污染防护（parse-time reviver）
 *
 * 适用场景：代码中手动 JSON.parse 用户输入，无 express.json() 前置解析时使用。
 *
 * 注意：主请求链路（REST + GraphQL）不走此函数，而是用 express.json() + sanitizeObject()。
 * 原因：JSON.parse 使用 [[DefineOwnProperty]] 而非 [[Set]]，不会触发原型污染；
 * 真正的危险在于后续 deep merge / Object.assign / for...in 赋值。
 * parse-time reviver 和 post-parse 递归删除安全效果完全等价，
 * 而 express.json() 底层依赖 raw-body / iconv-lite，在生产边界情况下更可靠。
 *
 * 安全日志策略：
 * - 静默丢弃危险 key，不记录 key 名（防日志注入：攻击者可构造恶意 key 名注入日志）
 * - 不用 console.warn（不进 Pino 日志流，运维难监控）
 * - 安全防护函数的最佳实践：对攻击者不返回任何反馈
 */
export function secureJSONParse(str: string): unknown {
    return JSON.parse(str, (key: string, value: unknown) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            /** 静默丢弃：不记录 key 名（防日志注入），不给攻击者任何反馈 */
            return undefined;
        }
        return value;
    });
}

/**
 * 递归清理对象中的原型链污染键
 *
 * JSON.parse 本身不会触发原型污染（使用 [[DefineOwnProperty]] 而非 [[Set]]），
 * 但后续 deep merge / Object.assign / for...in 赋值等操作会触发 __proto__ 访问器的 setter。
 * 此函数在 express.json() 解析后、业务代码处理前递归删除危险键，
 * 安全效果与 parse-time reviver 等价——中间件同步执行，无竞争窗口。
 *
 * 安全日志策略：
 * - 静默丢弃危险 key，不记录 key 名（防日志注入）
 * - 返回新对象，不修改原始对象
 */
export function sanitizeObject(obj: unknown): unknown {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject);

    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            /** 静默丢弃：不记录 key 名（防日志注入），不给攻击者任何反馈 */
            continue;
        }
        clean[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
    }
    return clean;
}
