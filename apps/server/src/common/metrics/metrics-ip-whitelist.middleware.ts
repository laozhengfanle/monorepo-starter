import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

/** 未配置 METRICS_ALLOWED_IPS 时仅放行本机回环地址 */
const LOCALHOST_IPS = new Set(['127.0.0.1', '::1']);

/** 归一化 IP：剥离 IPv4-mapped IPv6 前缀（::ffff:127.0.0.1 → 127.0.0.1） */
function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * /metrics 访问白名单中间件（运维安全）：
 * - METRICS_ALLOWED_IPS（逗号分隔）配置时仅放行列表内 IP —— k8s 探针 / Prometheus
 *   采集器可配置 Pod IP / Node IP / 采集器出口 IP；
 * - 未配置时仅放行本机回环（127.0.0.1 / ::1），杜绝公网裸奔（/metrics 暴露进程与
 *   业务指标属于信息泄露面）。
 * 注：req.ip 依赖 trust proxy 配置，未开启时即直连地址，均不可被客户端伪造。
 */
@Injectable()
export class MetricsIpWhitelistMiddleware implements NestMiddleware {
  private readonly allowedIps: string[];

  constructor(configService: ConfigService) {
    const raw = configService.get<string>('METRICS_ALLOWED_IPS');
    this.allowedIps = raw
      ? raw
          .split(',')
          .map((ip) => normalizeIp(ip.trim()))
          .filter(Boolean)
      : [];
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const remote = normalizeIp(req.ip ?? req.socket.remoteAddress ?? '');
    const allowed =
      this.allowedIps.length > 0
        ? this.allowedIps.includes(remote)
        : LOCALHOST_IPS.has(remote);
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    next();
  }
}
