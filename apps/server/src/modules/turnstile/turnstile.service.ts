import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BizException } from '@starter/server-core';
import {
  CACHE_SERVICE_TOKEN,
  type ICacheService,
} from '../../common/cache/cache.interface.js';
import { SystemConfigService } from '../system-config/system-config.service.js';

/** Cloudflare siteverify 端点 */
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Turnstile token 已用标记缓存 TTL（秒）— 5 分钟，与 token 有效期一致 */
const TURNSTILE_USED_TTL = 300;
/**
 * Cloudflare 官方测试密钥（对任何 token 恒返回成功/恒返回失败），
 * 生产环境禁止使用（等于关闭验证或全量拦截）。
 */
const TURNSTILE_TEST_SECRETS = [
  '1x0000000000000000000000000000000AA', // 恒成功
  '2x0000000000000000000000000000000AA', // 恒失败
] as const;
/** 测试密钥快速通道（仅非生产；生产在上面已拒绝） */
const TURNSTILE_TEST_SECRET = TURNSTILE_TEST_SECRETS[0];
/** system_config 里 Turnstile 配置的 key */
const TURNSTILE_CONFIG_KEY = 'turnstile.config';
/** dev 模式本地 bypass token 前缀（localhost widget 加载失败时前端约定生成） */
const LOCAL_DEV_BYPASS_PREFIX = 'LOCAL_DEV_BYPASS_';

/**
 * dev 本地 bypass 开关：仅 NODE_ENV=development 且 TURNSTILE_DEV_BYPASS=1/true 时生效。
 * 默认关闭 —— 不再仅凭 NODE_ENV 推断，防止生产误配本地前缀被放行。
 */
function isDevBypassEnabled(): boolean {
  if (process.env['NODE_ENV'] !== 'development') {
    return false;
  }
  const flag = process.env['TURNSTILE_DEV_BYPASS'];
  return flag === '1' || flag === 'true';
}

/** turnstile.config 解析后的形状 */
interface TurnstileConfigShape {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
}

/**
 * Turnstile 人机验证服务
 * - 配置来源优先级：system_config.turnstile.config（enabled + secretKey）→ 环境变量 TURNSTILE_SECRET_KEY → 跳过
 * - 校验顺序：生产禁测试密钥 → 测试密钥快速通道 → dev bypass（显式开关）→ Cloudflare siteverify → setnx 原子防重放
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
    const fromDb =
      await this.systemConfig.getValue<Partial<TurnstileConfigShape>>(
        TURNSTILE_CONFIG_KEY,
      );
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
   * - 生产环境命中 Cloudflare 测试密钥 → 抛配置错误（防「等于没开验证」）
   * - 测试密钥 / dev bypass（显式开关）/ siteverify + setnx 原子防重放
   */
  async verify(token: string | undefined, ip?: string): Promise<void> {
    const config = await this.getConfig();
    const secret = config.secretKey;
    if (!config.enabled || !secret) {
      // 未配置 → 跳过验证
      return;
    }

    // 生产环境禁止使用 Cloudflare 测试密钥（恒成功 = 关闭验证；恒失败 = 全量拦截）
    if (
      process.env['NODE_ENV'] === 'production' &&
      (TURNSTILE_TEST_SECRETS as readonly string[]).includes(secret)
    ) {
      throw new BizException({
        code: 'TURNSTILE_CONFIG_ERROR',
        message:
          '生产环境禁止使用 Turnstile 测试密钥，请配置真实的 Site Secret',
      });
    }

    // 缺 token → 拒绝
    if (!token) {
      throw new BizException({
        code: 'TURNSTILE_FAILED',
        message: '人机验证失败，请重试',
      });
    }

    // 测试密钥快速通道（仅非生产；生产已在上面拒绝）
    if (secret === TURNSTILE_TEST_SECRET) {
      return;
    }

    // dev 本地 bypass：需显式开启 TURNSTILE_DEV_BYPASS（仅 development 生效，默认关闭）
    if (token.startsWith(LOCAL_DEV_BYPASS_PREFIX)) {
      if (isDevBypassEnabled()) {
        this.logger.warn(
          'Turnstile: dev 本地 bypass token 放行（TURNSTILE_DEV_BYPASS 已开启）',
        );
        return;
      }
      throw new BizException({
        code: 'TURNSTILE_FAILED',
        message: '人机验证失败，请重试',
      });
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
      this.logger.error(
        `Turnstile siteverify 请求失败: ${(err as Error).message}`,
      );
    }
    if (!ok) {
      throw new BadRequestException('人机验证失败，请重试');
    }
    // 防重放：setnx 原子认领（对比 exists→setex：并发同 token 只会有一个 setnx 成功，
    // 其余视为重放拒绝，消除「同时 exists=false → 双双通过」的竞态）
    const usedKey = `turnstile:used:${token}`;
    const claimed = await this.cache.setnx(usedKey, true, TURNSTILE_USED_TTL);
    if (!claimed) {
      throw new BizException({
        code: 'TURNSTILE_FAILED',
        message: '人机验证失败，请重试',
      });
    }
  }
}
