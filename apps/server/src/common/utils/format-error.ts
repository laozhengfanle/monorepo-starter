/**
 * 错误摘要格式化工具
 *
 * 用途：
 * - 把任意 Error 压缩成 1 行可读摘要，用于日志
 * - Prisma 错误 / Redis 错误 / HTTP 错误的 message 经常是多行且超长（几十 KB stack + code location），
 *   直接 `${(err as Error).message}` 插值会撑爆日志、撑爆内存
 * - 此工具把 message 截到 200 字符 + 拼上 err.name + err.code（如 'P1001' / 'ECONNREFUSED'），
 *   排查时不用点进 stack 也能拿到关键信息
 *
 * 使用示例：
 * ```ts
 * catch (err) {
 *     logger.error(`[Task] failed: ${formatError(err)}`);
 * }
 * ```
 */

/** 扩展 Error 类型，包含常见的 code / cause 字段 */
interface ExtendedError extends Error {
    code?: string | number;
    cause?: unknown;
}

/**
 * 把任意 Error 压缩成 1 行可读摘要
 * @param err 任意抛出的对象（Error / string / object / null/undefined）
 * @param maxLen message 截短长度（默认 200 字符）
 * @returns 单行字符串，可直接拼到日志里
 */
export function formatError(err: unknown, maxLen = 200): string {
    if (err == null) return 'unknown';
    if (err instanceof Error) {
        const e = err as ExtendedError;
        const code = e.code ? ` [${e.code}]` : '';
        // 取 message 的第一行（去掉堆栈帧等后续多行内容）
        const firstLine = e.message.split('\n')[0]?.slice(0, maxLen) ?? '';
        return `${e.name}${code}: ${firstLine}`;
    }
    // string 特判：直接返回，不要被 JSON.stringify 包成 "..."
    if (typeof err === 'string') return err.slice(0, maxLen);
    // 其他非 Error 对象（number / boolean / object）：尝试 JSON.stringify，失败回退到 String()
    try {
        return JSON.stringify(err).slice(0, maxLen);
    } catch {
        // 循环引用 / BigInt / Symbol 等 JSON.stringify 不支持的情况
        // 用 String() 兜底会产生 [object Object]，但比抛错或返回 undefined 好
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return String(err).slice(0, maxLen);
    }
}
