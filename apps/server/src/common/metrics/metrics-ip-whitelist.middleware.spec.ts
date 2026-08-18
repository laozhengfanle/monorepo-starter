import { vi, describe, expect, it } from 'vitest';
import { MetricsIpWhitelistMiddleware } from './metrics-ip-whitelist.middleware.js';

interface FakeRes {
  statusCode?: number;
  body?: unknown;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function makeReq(ip?: string, remoteAddress?: string): Record<string, unknown> {
  return { ip, socket: { remoteAddress } };
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: vi.fn<any>(),
    json: vi.fn<any>(),
  };
  res.status = vi.fn<any>((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn<any>((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

function makeMw(allowedIps?: string): MetricsIpWhitelistMiddleware {
  return new MetricsIpWhitelistMiddleware({
    get: (key: string) =>
      key === 'METRICS_ALLOWED_IPS' ? allowedIps : undefined,
  } as never);
}

describe('MetricsIpWhitelistMiddleware', () => {
  it('未配置 METRICS_ALLOWED_IPS → 仅放行本机 127.0.0.1', () => {
    const next = vi.fn<any>();
    makeMw().use(
      makeReq('127.0.0.1') as never,
      makeRes() as never,
      next as never,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('本机 IPv6 ::1 与 IPv4-mapped（::ffff:127.0.0.1）均放行', () => {
    const next1 = vi.fn<any>();
    makeMw().use(makeReq('::1') as never, makeRes() as never, next1 as never);
    expect(next1).toHaveBeenCalledTimes(1);

    const next2 = vi.fn<any>();
    makeMw().use(
      makeReq('::ffff:127.0.0.1') as never,
      makeRes() as never,
      next2 as never,
    );
    expect(next2).toHaveBeenCalledTimes(1);
  });

  it('默认配置下非本机 IP → 403 拒绝', () => {
    const next = vi.fn<any>();
    const res = makeRes();
    makeMw().use(makeReq('10.0.0.5') as never, res as never, next as never);

    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('配置 METRICS_ALLOWED_IPS → 仅放行列表内 IP（k8s 探针/采集器场景）', () => {
    const mw = makeMw('10.0.0.5, 10.0.0.6');

    const nextOk = vi.fn<any>();
    mw.use(makeReq('10.0.0.6') as never, makeRes() as never, nextOk as never);
    expect(nextOk).toHaveBeenCalledTimes(1);

    // 白名单模式下本机不再默认放行（列表即完整白名单）
    const res = makeRes();
    const nextDenied = vi.fn<any>();
    mw.use(makeReq('127.0.0.1') as never, res as never, nextDenied as never);
    expect(res.statusCode).toBe(403);
    expect(nextDenied).not.toHaveBeenCalled();
  });

  it('req.ip 缺失时回退 socket.remoteAddress', () => {
    const next = vi.fn<any>();
    makeMw().use(
      makeReq(undefined, '127.0.0.1') as never,
      makeRes() as never,
      next as never,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
