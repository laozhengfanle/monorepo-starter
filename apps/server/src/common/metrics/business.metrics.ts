import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  register as defaultRegistry,
  type Registry,
} from 'prom-client';

/**
 * 从 Registry 中获取已注册的指标（按名称），不存在则创建新的
 * 解决：NestJS 测试多次实例化时 defaultRegistry 重复注册报错
 */
function getOrCreateCounter<T extends string>(
  opts: ConstructorParameters<typeof Counter<T>>[0],
  reg: Registry,
): Counter<T> {
  const existing = reg.getSingleMetric(opts.name) as Counter<T> | undefined;
  return existing ?? new Counter({ ...opts, registers: [reg] });
}

function getOrCreateGauge<T extends string>(
  opts: ConstructorParameters<typeof Gauge<T>>[0],
  reg: Registry,
): Gauge<T> {
  const existing = reg.getSingleMetric(opts.name) as Gauge<T> | undefined;
  return existing ?? new Gauge({ ...opts, registers: [reg] });
}

/**
 * 业务指标 Collector（事件触发型）
 *
 * 设计原则：
 * - 本类只定义指标结构 + 提供 inc/set 业务语义方法
 * - 实际埋点由调用方在事件发生时触发（auth.service / throttler guard / cache service 等）
 *
 * 指标清单：
 * - login_failures_total{reason}      — 登录失败计数（按原因：密码错误 / 账户不存在 / 已锁定 等）
 * - login_lockouts_total{reason}      — 登录锁定触发计数
 * - rate_limit_blocked_total{route,reason} — 限流拦截计数（按路由 + 原因）
 * - audit_log_writes_total{action}    — 审计日志写入计数（按动作）
 * - file_uploads_total{category}      — 文件上传计数（按类别）
 * - cache_hit_ratio{key_prefix}       — 缓存命中率（0~1，由调用方周期性计算后 set）
 * - active_connections_total          — 当前活跃 WebSocket 连接数（Gauge）
 */
@Injectable()
export class BusinessMetrics {
  /** 登录失败计数（按失败原因） */
  public readonly loginFailures: Counter<string>;

  /** 登录锁定计数（按原因：连续失败锁定 / 手动锁定） */
  public readonly loginLockouts: Counter<string>;

  /** 限流拦截计数（按路由 + 原因） */
  public readonly rateLimitBlocked: Counter<string>;

  /** 审计日志写入计数（按动作） */
  public readonly auditLogWrites: Counter<string>;

  /** 文件上传计数（按类别） */
  public readonly fileUploads: Counter<string>;

  /** 缓存命中率（0~1） */
  public readonly cacheHitRatio: Gauge<string>;

  /** 当前活跃 WebSocket 连接数 */
  public readonly activeConnections: Gauge<string>;

  constructor() {
    const registry = defaultRegistry;
    this.loginFailures = getOrCreateCounter(
      {
        name: 'login_failures_total',
        help: '登录失败计数（按失败原因）',
        labelNames: ['reason'],
      },
      registry,
    );
    this.loginLockouts = getOrCreateCounter(
      {
        name: 'login_lockouts_total',
        help: '登录锁定触发计数（按原因）',
        labelNames: ['reason'],
      },
      registry,
    );
    this.rateLimitBlocked = getOrCreateCounter(
      {
        name: 'rate_limit_blocked_total',
        help: '限流拦截计数（按路由 + 原因）',
        labelNames: ['route', 'reason'],
      },
      registry,
    );
    this.auditLogWrites = getOrCreateCounter(
      {
        name: 'audit_log_writes_total',
        help: '审计日志写入计数（按动作）',
        labelNames: ['action'],
      },
      registry,
    );
    this.fileUploads = getOrCreateCounter(
      {
        name: 'file_uploads_total',
        help: '文件上传计数（按类别）',
        labelNames: ['category'],
      },
      registry,
    );
    this.cacheHitRatio = getOrCreateGauge(
      {
        name: 'cache_hit_ratio',
        help: '缓存命中率（0~1，按 key 前缀）',
        labelNames: ['key_prefix'],
      },
      registry,
    );
    this.activeConnections = getOrCreateGauge(
      {
        name: 'active_connections_total',
        help: '当前活跃 WebSocket 连接数',
        labelNames: [],
      },
      registry,
    );
  }

  /** 登录失败埋点 */
  incLoginFailure(reason: string): void {
    this.loginFailures.inc({ reason });
  }

  /** 登录锁定埋点 */
  incLoginLockout(reason: string): void {
    this.loginLockouts.inc({ reason });
  }

  /** 限流拦截埋点（route 已归一化，避免高基数） */
  incRateLimitBlocked(route: string, reason: string): void {
    this.rateLimitBlocked.inc({ route, reason });
  }

  /** 审计日志写入埋点 */
  incAuditLogWrite(action: string): void {
    this.auditLogWrites.inc({ action });
  }

  /** 文件上传埋点 */
  incFileUpload(category: string): void {
    this.fileUploads.inc({ category });
  }

  /** 缓存命中率（0~1）上报 */
  setCacheHitRatio(keyPrefix: string, ratio: number): void {
    this.cacheHitRatio.set({ key_prefix: keyPrefix }, ratio);
  }

  /** 活跃连接数（Gauge 直接 set 绝对值） */
  setActiveConnections(count: number): void {
    this.activeConnections.set(count);
  }
}
