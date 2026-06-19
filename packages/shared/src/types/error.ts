/**
 * 共享类型定义
 *
 * 错误码元信息：用于 ERROR_CODES 字典的 type 约束。
 */
export interface ErrorCodeInfo {
    /** 错误码（数字） */
    code: number;
    /** 兜底消息（中英文字典可覆盖） */
    message: string;
    /** 大类：通用/认证/业务/系统 */
    category:
        | 'validation'
        | 'rate-limit'
        | 'not-found'
        | 'conflict'
        | 'common'
        | 'system'
        | 'auth'
        | 'user'
        | 'permission';
    /** 详细说明（开发者/日志用） */
    description: string;
}
