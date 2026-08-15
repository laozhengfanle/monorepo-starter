import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { BizException } from '@starter/server-core';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';
import { SystemConfigService } from '../system-config/system-config.service.js';

/** Cloudflare siteverify 端点 */
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Turnstile token 已用标记缓存 TTL（秒）— 5 分钟，与 token 有效期一致 */
const TURNSTILE_USED_TTL = 300;
/** Cloudflare 官方测试密钥（对任何 token 永远 success） */
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';
/** system_config 里 Turnstile 配置的 key */
const TURNSTILE_CONFIG_KEY = 'turnstile.config';
/** dev 模式本地 bypass token 前缀（localhost widget 加载失败时前端约定生成） */
const LOCAL_DEV_BYPASS_PREFIX = 'LOCAL_DEV_BYPASS_';

/** turnstile.config 解析后的形状 */
interface TurnstileConfigShape {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
}

/**
 * Turnstile 人机验证服务
 * - 配置来源优先级：system_config.turnstile.config（enabled + secretKey）→ 环境变量 TURNSTILE_SECRET_KEY → 跳过
 * - 校验：测试密钥快速通道 → dev bypass → Redis 防重放 → Cloudflare siteverify
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(
    @Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  /** 读取当前生效的 Turnstile 配置（页面读写走 system_config，此处供 verify 解析） */
  async getConfig(): Promise<TurnstileConfigShape> {
    const fromDb = await this.systemConfig.getValue<Partial<TurnstileConfigShape>>(TURNSTILE_CONFIG_KEY);
    const envSecret = process.env['TURNSTILE_SECRET_KEY'];
    return {
      enabled: fromDb?.enabled ?? false,
      siteKey: fromDb?.siteKey ?? '',
      secretKey: fromDb?.secretKey || envSecret || '',
    };
  }

  /**
   * 校验 Turnstile token
   * - 未启用（enabled=false 且无 env secret）→ 直接放行（开发环境友好）
   * - 启用但缺 token → 抛 20007
   * - 测试密钥 / dev bypass / siteverify 校验
   */
  async verify(token: string | undefined, ip?: string): Promise<void> {
    const config = await this.getConfig();
    const secret = config.secretKey;
    if (!config.enabled || !secret) {
      // 未配置 → 跳过验证
      return;
    }

    // 缺 token → 拒绝
    if (!token) {
      throw new BizException({ code: 'TURNSTILE_FAILED', message: '人机验证失败，请重试' });
    }

    // 测试密钥快速通道
    if (secret === TURNSTILE_TEST_SECRET) {
      return;
    }

    // dev 模式本地 bypass（生产拒绝）
    const isDev = process.env['NODE_ENV'] !== 'production';
    if (token.startsWith(LOCAL_DEV_BYPASS_PREFIX)) {
      if (isDev) {
        this.logger.warn('Turnstile: dev 模式本地 bypass token 放行');
        return;
      }
      throw new BizException({ code: 'TURNSTILE_FAILED', message: '人机验证失败，请重试' });
    }

    // 防重放：5 分钟内同一 token 只允许验证一次
    const usedKey = `turnstile:used:${token}`;
    if (await this.cache.exists(usedKey)) {
      throw new BizException({ code: 'TURNSTILE_FAILED', message: '人机验证失败，请重试' });
    }

    const body = new URLSearchParams({ secret, response: token });
    if (ip) {
      body.set('remoteip', ip);
    }
    let ok = false;
    try {
      const res = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      const json = (await res.json()) as { success?: boolean };
      ok = json.success === true;
    } catch (err) {
      this.logger.error(`Turnstile siteverify 请求失败: ${(err as Error).message}`);
    }
    if (!ok) {
      throw new BadRequestException('人机验证失败，请重试');
    }
    await this.cache.setex(usedKey, TURNSTILE_USED_TTL, true);
  }
}
