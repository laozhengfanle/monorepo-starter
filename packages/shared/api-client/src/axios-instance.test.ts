import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AxiosRequestConfig } from 'axios';

// vi.mock 会被提升到文件顶部，工厂函数只能访问 vi.hoisted 声明的变量
const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn<
    (config: AxiosRequestConfig) => Promise<{ data: unknown }>
  >(),
}));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    // customInstance 内部的共享 axios 实例由 create() 创建，替换为可编程桩
    create: vi.fn<() => { request: typeof requestMock }>(() => ({ request: requestMock })),
  };
});

import { AxiosError } from 'axios';
import { ApiClientError, customInstance } from './axios-instance.js';

describe('customInstance', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('成功响应（裸数据）原样返回领域数据', async () => {
    const user = { id: '1', username: 'alice', email: 'alice@example.com' };
    requestMock.mockResolvedValue({ data: user });

    await expect(customInstance({ url: '/api/users', method: 'GET' })).resolves.toEqual(
      user,
    );
  });

  it('失败 envelope → 抛出携带业务码与详情的 ApiClientError', async () => {
    requestMock.mockResolvedValue({
      data: {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_FAILED',
          message: '请求参数校验失败',
          details: { email: ['无效的邮箱'] },
        },
      },
    });

    const error = await customInstance({
      url: '/api/users',
      method: 'POST',
      data: { email: 'bad' },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    const apiError = error as ApiClientError;
    expect(apiError.code).toBe('VALIDATION_FAILED');
    expect(apiError.message).toBe('请求参数校验失败');
    expect(apiError.details).toEqual({ email: ['无效的邮箱'] });
  });

  it('失败 envelope 无 details 时 details 为 undefined', async () => {
    requestMock.mockResolvedValue({
      data: {
        success: false,
        data: null,
        error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
      },
    });

    const error = await customInstance({ url: '/api/users/1', method: 'GET' }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).details).toBeUndefined();
  });

  it('兼容旧格式：success: true 的 envelope 成功响应解包 data', async () => {
    const user = { id: '1', username: 'alice' };
    requestMock.mockResolvedValue({
      data: { success: true, data: user, error: null },
    });

    await expect(customInstance({ url: '/api/users/1', method: 'GET' })).resolves.toEqual(
      user,
    );
  });

  it('HTTP 非 2xx 时 axios 抛出的 AxiosError 原样向上传播', async () => {
    const axiosError = new AxiosError('Request failed', 'ERR_BAD_REQUEST');
    requestMock.mockRejectedValue(axiosError);

    await expect(customInstance({ url: '/api/users', method: 'GET' })).rejects.toBe(
      axiosError,
    );
  });
});
