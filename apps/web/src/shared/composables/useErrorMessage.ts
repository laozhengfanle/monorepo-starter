/**
 * 错误码 → 中文消息 Composable
 *
 * 设计目的：
 *   替换前端硬编码的错误中文字符串，统一从 @packages/shared 错误码字典（ERROR_CODES）查表。
 *   - 后端抛 BusinessException(code, message) 时，前端拿到 code 后用本 composable 拿到友好中文
 *   - 未知 code 兜底：返回原始 message 或通用兜底文案
 *   - 与后端字典保持一致：spec 强调"必须从 shared 包导入对比"
 *
 * 使用示例：
 * ```ts
 * const { t } = useErrorMessage();
 *
 * try {
 *   await api.createAccount(input);
 * } catch (err) {
 *   const code = err.extensions?.code;
 *   const message = t(code); // "用户名已存在"
 *   showError(message);
 * }
 * ```
 *
 * 与 graphql-client.ts / error-handler.ts 的关系：
 *   - error-handler.ts：负责"解析错误对象 → 提取 code"
 *   - useErrorMessage：负责"code → 友好中文"
 *   - 两者组合：parseGraphQLError + t(code)
 */
import { ERROR_CODES, getErrorCodeInfo } from '@packages/shared';
import type { ErrorCodeInfo } from '@packages/shared';

/** 默认兜底文案（未知 code 时返回） */
const FALLBACK_MESSAGE = '操作失败，请稍后重试';

/**
 * 把数字或字符串 code 查表成 ErrorCodeInfo
 * - 与 getErrorCodeInfo 的区别：本函数额外保证"未找到时返回 null 而不是 undefined"
 * - 便于调用方使用 `info?.message ?? FALLBACK` 模式
 */
function lookup(code: number | string | null | undefined): ErrorCodeInfo | null {
    if (code === null || code === undefined || code === '') return null;
    return getErrorCodeInfo(code);
}

/**
 * useErrorMessage composable
 *
 * @returns 含 `t(code)` 方法的对象，传入错误码返回中文 message
 */
export function useErrorMessage(): { t: (code: number | string | null | undefined, fallback?: string) => string } {
    /**
     * t: translate，错误码 → 中文消息
     *
     * @param code 错误码（数字或字符串）
     * @param fallback 可选自定义兜底文案（覆盖默认"FALLBACK_MESSAGE"）
     * @returns 友好中文消息
     *
     * 注意：本 composable 不持有任何响应式状态（错误码字典是常量），
     *      所以多次调用 `useErrorMessage()` 不会产生额外的内存开销。
     */
    function t(code: number | string | null | undefined, fallback?: string): string {
        const info = lookup(code);
        if (info) {
            return info.message;
        }
        return fallback ?? FALLBACK_MESSAGE;
    }

    return { t };
}

/**
 * 纯函数版：直接传入 code 拿 message
 * - 适合不依赖 composable 上下文的场景（错误处理工具、单元测试、SSR）
 * - 行为与 useErrorMessage().t(code) 完全一致
 *
 * @param code 错误码
 * @param fallback 自定义兜底文案
 */
export function translateErrorCode(code: number | string | null | undefined, fallback?: string): string {
    const info = lookup(code);
    if (info) return info.message;
    return fallback ?? FALLBACK_MESSAGE;
}

/**
 * 暴露 ERROR_CODES 字典（只读），方便 UI 层渲染错误码下拉选项
 * - 仅 re-export，调用方不需要从 @packages/shared 重复引入
 */
export { ERROR_CODES };
