import { vi, describe, expect, it, afterEach } from 'vitest';
import type { Options as PinoHttpOptions } from 'pino-http';
import { getPinoConfig, REDACT_PATHS } from './logger.config.js';

const origLogLevel = process.env['LOG_LEVEL'];

/** nestjs-pino 的 Params.pinoHttp 是联合类型，测试里收窄为 PinoHttpOptions 再断言字段 */
function pinoHttpOptions(env: 'dev' | 'prod'): PinoHttpOptions {
  return getPinoConfig(env).pinoHttp as PinoHttpOptions;
}

afterEach(() => {
  if (origLogLevel === undefined) delete process.env['LOG_LEVEL'];
  else process.env['LOG_LEVEL'] = origLogLevel;
});

describe('logger.config', () => {
  it('dev 与 prod 均启用 redact（敏感字段统一脱敏）', () => {
    const dev = pinoHttpOptions('dev');
    const prod = pinoHttpOptions('prod');

    expect(dev.redact).toEqual(
      expect.objectContaining({ paths: REDACT_PATHS, censor: '[REDACTED]' }),
    );
    expect(prod.redact).toEqual(
      expect.objectContaining({ paths: REDACT_PATHS, censor: '[REDACTED]' }),
    );
  });

  it('redact 路径覆盖认证/密码/密钥等敏感字段', () => {
    for (const p of [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.newPassword',
      '*.secretKey',
      '*.accessKey',
      'res.body.accessToken',
      'res.body.refreshToken',
    ]) {
      expect(REDACT_PATHS).toContain(p);
    }
  });

  it('level：LOG_LEVEL 按 Nest 语义映射（log→info / debug→debug）', () => {
    process.env['LOG_LEVEL'] = 'log';
    expect(pinoHttpOptions('prod').level).toBe('info');

    process.env['LOG_LEVEL'] = 'debug';
    expect(pinoHttpOptions('prod').level).toBe('debug');
  });

  it('level：无 LOG_LEVEL 时 dev→debug / prod→info', () => {
    delete process.env['LOG_LEVEL'];

    expect(pinoHttpOptions('dev').level).toBe('debug');
    expect(pinoHttpOptions('prod').level).toBe('info');
  });

  it('genReqId：生成 requestId 并回写 X-Request-ID 响应头', () => {
    const config = pinoHttpOptions('prod');
    const res = { setHeader: vi.fn<any>() };
    const req = { headers: {} };

    const id = config.genReqId?.(req as never, res as never);

    expect(typeof id).toBe('string');
    expect((id as string).length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', id);
  });

  it('genReqId：透传上游 x-request-id（链路追踪）', () => {
    const config = pinoHttpOptions('prod');
    const res = { setHeader: vi.fn<any>() };
    const req = { headers: { 'x-request-id': 'trace-123' } };

    const id = config.genReqId?.(req as never, res as never);

    expect(id).toBe('trace-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'trace-123');
  });
});
