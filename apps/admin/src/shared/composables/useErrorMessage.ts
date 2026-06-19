/**
 * 错误码 → 中文消息 Composable（管理端）
 *
 * 与 web 端 useErrorMessage 行为完全一致，只是放在 admin 包下。
 * - 重复定义而不是 re-export 自 web 包的原因：
 *   1. admin / web 是两个独立的前端 SPA（不同 vite.config、不同的依赖 bundle）
 *   2. 跨 workspace import（admin/src -> web/src）会破坏构建隔离
 *   3. 两个 composable 都从 @packages/shared 读同一份字典（SSOT）
 *   4. 如果有差异，复制比跨包依赖更可控
 *
 * 使用示例：
 * ```ts
 * const { t } = useErrorMessage();
 * const message = t(21001); // "用户名已存在"
 * ```
 */
import { ERROR_CODES, getErrorCodeInfo } from '@packages/shared';
import type { ErrorCodeInfo } from '@packages/shared';

/** 默认兜底文案（未知 code 时返回） */
const FALLBACK_MESSAGE = '操作失败，请稍后重试';

/** 内部查表函数：与 web 端实现一致 */
function lookup(code: number | string | null | undefined): ErrorCodeInfo | null {
    if (code === null || code === undefined || code === '') return null;
    return getErrorCodeInfo(code);
}

/**
 * useErrorMessage composable（admin 版）
 *
 * @returns 含 `t(code)` 方法的对象，传入错误码返回中文 message
 */
export function useErrorMessage(): {
    t: (code: number | string | null | undefined, fallback?: string) => string;
} {
    /**
     * t: translate，错误码 → 中文消息
     *
     * @param code 错误码（数字或字符串）
     * @param fallback 自选自定义兑底文案
     * @returns 友好中文消息
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
 * 纯函数版：与 useErrorMessage().t(code) 等价
 * 适合错误处理工具、单元测试、不依赖 composable 上下文的场景
 */
export function translateErrorCode(code: number | string | null | undefined, fallback?: string): string {
    const info = lookup(code);
    if (info) return info.message;
    return fallback ?? FALLBACK_MESSAGE;
}

/** 暴露 ERROR_CODES 字典，方便 UI 层渲染错误码下拉选项 */
export { ERROR_CODES };
