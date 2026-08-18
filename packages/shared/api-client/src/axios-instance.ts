import { create } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import type { ApiEnvelope } from '@starter/contracts';

/** API 客户端错误：由 envelope 的 error 字段构造，携带业务错误码与字段级详情 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(
    code: string,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.details = details;
  }
}

// 请求路径统一为相对路径 '/api/...'（见 orval.config.ts 的 baseUrl）：
// 开发环境由 Vite 代理转发到后端（见 apps/admin/vite.config.mts），
// 生产环境由网关/Nginx 重写，客户端不硬编码服务端地址。
// withCredentials：P1-7 改造后凭证走 httpOnly cookie，生成客户端同样依赖浏览器自动携带。
const http = create({ baseURL: '', withCredentials: true });

/**
 * Orval 自定义 mutator：响应约定——
 * - 成功响应：直接返回领域数据（后端与 OpenAPI spec 一致，不做包裹）；
 * - 失败响应：后端统一返回 `{ success: false, error: { code, message, details } }` envelope，
 *   此处解包并抛出携带业务码的 ApiClientError。
 *
 * 兼容性：若响应带 success 字段且为 true（旧的 envelope 成功格式），自动解包 data。
 */
export const customInstance = async <T>(
  config: AxiosRequestConfig,
): Promise<T> => {
  const response = await http.request<ApiEnvelope<T> | T>(config);
  const body = response.data;

  if (body !== null && typeof body === 'object' && 'success' in body) {
    const envelope = body as ApiEnvelope<T>;
    if (!envelope.success) {
      throw new ApiClientError(
        envelope.error.code,
        envelope.error.message,
        envelope.error.details,
      );
    }
    // 兼容旧格式：success: true 的 envelope 成功响应解包 data
    return envelope.data;
  }

  return body as T;
};
