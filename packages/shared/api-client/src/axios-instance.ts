import { create } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import type { ApiEnvelope } from '@starter/contracts';

/** API 客户端错误：由 envelope 的 error 字段构造，携带业务错误码与字段级详情 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.details = details;
  }
}

// 相对路径 '/api'：开发环境由 Vite 代理转发（见 apps/web/vite.config.mts），
// 生产环境由网关/Nginx 重写，客户端不硬编码服务端地址。
const http = create({ baseURL: '' });

/**
 * Orval 自定义 mutator：请求走共享 axios 实例，响应解包 envelope，
 * 让生成的 hooks 直接返回领域类型。HTTP 4xx/5xx 时 axios 抛出 AxiosError，
 * 响应体（envelope 错误负载）可从 error.response.data 读取。
 */
export const customInstance = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const response = await http.request<ApiEnvelope<T>>(config);
  const body = response.data;
  if (!body.success) {
    throw new ApiClientError(body.error.code, body.error.message, body.error.details);
  }
  return body.data;
};
