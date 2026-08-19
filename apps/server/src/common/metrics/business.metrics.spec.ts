import { describe, expect, it } from 'vitest';
import { Counter } from 'prom-client';
import { BusinessMetrics } from './business.metrics.js';

/** 从 Counter 读取指定 label 组合的当前值（prom-client 15.x：hashMap 按 label 名排序拼接 key） */
function counterValue(
  counter: Counter<string>,
  labels: Record<string, string>,
): number {
  const key = Object.keys(labels)
    .sort()
    .map((k) => `${k}:${labels[k]},`)
    .join('');
  const entry = (
    counter as unknown as { hashMap: Record<string, { value: number }> }
  ).hashMap[key];
  return entry?.value ?? 0;
}

describe('BusinessMetrics', () => {
  it('登录失败计数按原因累加', () => {
    const metrics = new BusinessMetrics();
    metrics.incLoginFailure('invalid_credentials');
    metrics.incLoginFailure('invalid_credentials');

    expect(
      counterValue(metrics.loginFailures, { reason: 'invalid_credentials' }),
    ).toBe(2);
  });

  it('限流拦截计数按 route + reason 累加', () => {
    const metrics = new BusinessMetrics();
    metrics.incRateLimitBlocked('graphql:Login', 'throttled');
    metrics.incRateLimitBlocked('graphql:Login', 'throttled');
    metrics.incRateLimitBlocked('POST:/api/upload', 'throttled');

    expect(
      counterValue(metrics.rateLimitBlocked, {
        route: 'graphql:Login',
        reason: 'throttled',
      }),
    ).toBe(2);
    expect(
      counterValue(metrics.rateLimitBlocked, {
        route: 'POST:/api/upload',
        reason: 'throttled',
      }),
    ).toBe(1);
  });

  it('审计写入计数按动作累加', () => {
    const metrics = new BusinessMetrics();
    metrics.incAuditLogWrite('login_success');
    metrics.incAuditLogWrite('login_success');
    metrics.incAuditLogWrite('config:update');

    expect(
      counterValue(metrics.auditLogWrites, { action: 'login_success' }),
    ).toBe(2);
    expect(
      counterValue(metrics.auditLogWrites, { action: 'config:update' }),
    ).toBe(1);
  });

  it('审计写入失败计数按动作累加（审计旁路失败可观测）', () => {
    const metrics = new BusinessMetrics();
    metrics.incAuditLogWriteFailure('login_failed');
    metrics.incAuditLogWriteFailure('login_failed');

    expect(
      counterValue(metrics.auditLogWriteFailures, { action: 'login_failed' }),
    ).toBe(2);
    // 与成功计数相互独立
    expect(
      counterValue(metrics.auditLogWrites, { action: 'login_failed' }),
    ).toBe(0);
  });

  it('缓存命中率 Gauge 可设置 0~1 值', () => {
    const metrics = new BusinessMetrics();
    metrics.setCacheHitRatio('account:', 0.87);

    expect(
      counterValue(metrics.cacheHitRatio as unknown as Counter<string>, {
        key_prefix: 'account:',
      }),
    ).toBeCloseTo(0.87);
  });

  it('登录锁定计数按原因累加', () => {
    const metrics = new BusinessMetrics();
    metrics.incLoginLockout('threshold_exceeded');
    metrics.incLoginLockout('threshold_exceeded');
    metrics.incLoginLockout('manual');

    expect(
      counterValue(metrics.loginLockouts, { reason: 'threshold_exceeded' }),
    ).toBe(2);
    expect(counterValue(metrics.loginLockouts, { reason: 'manual' })).toBe(1);
  });

  it('活跃连接数 Gauge 直接设置绝对值', () => {
    const metrics = new BusinessMetrics();
    metrics.setActiveConnections(7);
    metrics.setActiveConnections(3);

    expect(
      counterValue(metrics.activeConnections as unknown as Counter<string>, {}),
    ).toBe(3);
  });

  it('重复实例化不报重复注册错误（getOrCreate 语义）', () => {
    // 两个实例指向同一个默认注册表时，不应抛 Duplicate metric name 错误
    const metrics1 = new BusinessMetrics();
    const metrics2 = new BusinessMetrics();
    metrics1.incLoginFailure('a');
    metrics2.incLoginFailure('b');

    expect(counterValue(metrics1.loginFailures, { reason: 'a' })).toBe(1);
    expect(counterValue(metrics2.loginFailures, { reason: 'b' })).toBe(1);
  });
});
