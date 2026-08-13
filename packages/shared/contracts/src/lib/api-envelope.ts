import type { PageMeta } from './pagination.js';

/**
 * 统一的 API 响应外壳（envelope）。
 * 成功与失败通过 success 判别，错误负载始终在 error 字段。
 * 分页响应的元数据放在 meta（分页规则见 pagination.ts）。
 */
export interface ApiError {
  /** 业务错误码，如 'USER_NOT_FOUND'、'VALIDATION_FAILED' */
  code: string;
  /** 用户可读的错误消息 */
  message: string;
  /** 字段级校验错误（ZodError 映射），key 为字段名 */
  details?: Record<string, string[]>;
}

export type ApiEnvelope<T> =
  | { success: true; data: T; error: null; meta?: PageMeta }
  | { success: false; data: null; error: ApiError; meta?: PageMeta };
