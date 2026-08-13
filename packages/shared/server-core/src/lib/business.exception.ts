/** 业务异常负载：业务错误码 + 用户可读消息 + 可选的字段级详情 */
export interface BizErrorPayload {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

/**
 * 业务异常：由 AllExceptionsFilter 映射为 HTTP 400 + envelope 响应。
 * 业务层遇到可预期的失败时抛出，携带面向使用者的错误信息。
 */
export class BizException extends Error {
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(payload: BizErrorPayload) {
    super(payload.message);
    this.name = 'BizException';
    this.code = payload.code;
    this.details = payload.details;
  }
}
