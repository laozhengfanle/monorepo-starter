import type { ArgumentsHost } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationException } from 'nestjs-zod';
import { BizException } from './business.exception.js';
import { AllExceptionsFilter } from './http-exception.filter.js';

interface MockedHost {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

function createMockHost(): MockedHost {
  const send = vi.fn<(payload: unknown) => void>();
  const status = vi
    .fn<(code: number) => { send: typeof send }>()
    .mockReturnValue({ send });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, send };
}

/** 取出最近一次 send 调用的 envelope 负载 */
function lastEnvelope(mocked: MockedHost) {
  return mocked.send.mock.calls.at(-1)?.[0] as {
    success: boolean;
    data: null;
    error: { code: string; message: string; details?: Record<string, string[]> };
  };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('未知异常 → 500 通用 envelope，不泄露内部细节', () => {
    const mocked = createMockHost();

    filter.catch(new Error('secret internal detail'), mocked.host);

    expect(mocked.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const envelope = lastEnvelope(mocked);
    expect(envelope.success).toBe(false);
    expect(envelope.data).toBeNull();
    expect(envelope.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(envelope)).not.toContain('secret internal detail');
  });

  it('ZodError → 422 + 按字段聚合的校验详情', () => {
    const mocked = createMockHost();
    const result = z
      .object({ username: z.string().min(3), email: z.string().email() })
      .safeParse({ username: 'ab', email: 'not-an-email' });

    filter.catch(result.error, mocked.host);

    expect(mocked.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    const envelope = lastEnvelope(mocked);
    expect(envelope.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(envelope.error.details ?? {})).toEqual(['username', 'email']);
    expect(envelope.error.details?.username).toBeDefined();
  });

  it('ZodValidationException（nestjs-zod 管道）→ 422 + 字段级详情', () => {
    const mocked = createMockHost();
    const schema = z.object({ username: z.string().min(3) });
    const parsed = schema.safeParse({ username: 'ab' });
    const exception = new ZodValidationException(parsed.error);

    filter.catch(exception, mocked.host);

    expect(mocked.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    const envelope = lastEnvelope(mocked);
    expect(envelope.error.code).toBe('VALIDATION_FAILED');
    expect(envelope.error.details?.username).toBeDefined();
  });

  it('BizException → 400 + 原样透传业务码与详情', () => {
    const mocked = createMockHost();
    const exception = new BizException({
      code: 'USER_NOT_FOUND',
      message: '用户不存在',
      details: { id: ['未知的 id'] },
    });

    filter.catch(exception, mocked.host);

    expect(mocked.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const envelope = lastEnvelope(mocked);
    expect(envelope.error.code).toBe('USER_NOT_FOUND');
    expect(envelope.error.message).toBe('用户不存在');
    expect(envelope.error.details).toEqual({ id: ['未知的 id'] });
  });

  it('HttpException → 保持原状态码并携带消息', () => {
    const mocked = createMockHost();

    filter.catch(new HttpException('权限不足', HttpStatus.FORBIDDEN), mocked.host);

    expect(mocked.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    const envelope = lastEnvelope(mocked);
    expect(envelope.error.code).toBe('HTTP_403');
    expect(envelope.error.message).toBe('权限不足');
  });

  it('HttpException（对象响应）→ 提取 message 字段', () => {
    const mocked = createMockHost();

    filter.catch(new HttpException({ message: ['字段 A 非法', '字段 B 非法'] }, HttpStatus.BAD_REQUEST), mocked.host);

    expect(mocked.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(lastEnvelope(mocked).error.message).toBe('字段 A 非法; 字段 B 非法');
  });
});
