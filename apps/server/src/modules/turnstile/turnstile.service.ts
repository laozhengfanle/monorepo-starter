/**
 * Turnstile 人机验证服务
 *
 * ## 业务背景
 * - 解决安全防护.md §15 "P1：Turnstile 人机验证未集成" 的问题
 * - 攻击场景：暴力破解管理员登录 / 短信轰炸（高频请求触发短信费用）
 * - Cloudflare Turnstile 是 Cloudflare 提供的"隐形 CAPTCHA"，无需用户交互验证
 * - 前端嵌入 widget → 拿到一次性 token → 后端调用 siteverify 校验
 *
 * ## 工作流程
 * 1. 前端用 useTurnstile 渲染 Cloudflare widget
 * 2. 用户提交表单时，前端调用 turnstile.getToken() 拿到一次性 token
 * 3. 前端把 token 放在 body.turnstileToken 一并提交
 * 4. 后端 Controller 调本服务 verify(token, ip)
 * 5. 本服务：
 *    a) 检查 token 是否已经被消费（防重放，Redis 5 分钟去重）
 *    b) 调用 Cloudflare https://challenges.cloudflare.com/turnstile/v0/siteverify
 *    c) 验证成功 → 写 Redis 标记 token 已用，TTL 5 分钟
 *
 * ## 配置优先级（spec Task 7 "Turnstile 配置真正生效"）
 * 1. system_config.turnstile.config（前端 TurnstilePage 保存的，运行时可改）
 * 2. TURNSTILE_SECRET_KEY 环境变量（部署期配置，向后兼容）
 * 3. 都没有 → 跳过验证（开发环境友好；生产必须配）
 *
 * 配置缓存：
 * - 1 分钟内存 LRU，避免每次登录都查 DB
 * - 1 分钟而非 system_config 的 30 分钟 Redis 缓存：让"前端改完立即生效"更接近实时
 *   （写 system_config 后最长 1 分钟内全节点生效）
 *
 * ## 5 分钟去重的原因
 * - Turnstile token 是一次性的，Cloudflare 端本身也只允许验证一次
 * - 但攻击者抓包后可能重放同一个 token 多次
 * - Redis 5 分钟 TTL 与 Turnstile 默认 token 有效期一致（300s）
 * - 超过 5 分钟后 token 即使被重放也无法成功（Cloudflare 端会拒绝）
 *
 * ## IP 透传的原因
 * - Cloudflare 官方建议透传 remoteip，可辅助检测异常地理位置
 * - 不影响验证结果（只作为参考信号），但能提升风控准确度
 *
 * ## 测试密钥旁路
 * - Cloudflare 官方测试 secret：`1x0000000000000000000000000000000AA`
 * - 该密钥对任何 token 都返回 success，永远通过验证
 * - 项目 .env.example 默认使用此测试密钥，本地开发无需真实 widget 即可调试
 * - 生产环境必须替换为 Cloudflare 控制台获取的真实密钥
 */
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';
import { turnstileVerifyKey } from '../../common/cache/cache-key.constants.js';
import { SystemConfigService } from '../admin/system-config/system-config.service.js';

/** Cloudflare siteverify 端点 */
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Turnstile token 已使用标记的缓存 TTL（秒） — 5 分钟 */
const TURNSTILE_USED_TTL = 300;

/** Cloudflare 官方测试密钥（对任何 token 永远返回 success） */
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';

/** system_config 表里 turnstile 配置的 key（前端 TurnstilePage 写这个 key） */
const TURNSTILE_CONFIG_KEY = 'turnstile.config';

/**
 * turnstile.config 在内存中的缓存时间（毫秒）：5 秒
 *
 * 调整原因：1 分钟太长，一旦管理员误把 secretKey 填错，会导致所有用户被锁死 1 分钟。
 * 改为 5 秒后，"前端保存配置 → 全节点生效" 的最长延迟从 60s 降到 5s，
 * 既能防止每次登录都查 DB（DB QPS 降低 ~12 倍），又能在配置错误时快速恢复。
 */
const TURNSTILE_CONFIG_CACHE_TTL_MS = 5_000;

/**
 * 本地 dev 模式 mock token 前缀（与前端 useTurnstile.ts 约定）
 *
 * 用途：Cloudflare Turnstile 的测试 siteKey（1x000...0AA）在 localhost 上 Cloudflare
 * 会返回 400020（域名不匹配），导致 widget 加载失败。前端 useTurnstile 会在 widget 加载
 * 失败时进入 mock 模式，生成 `LOCAL_DEV_BYPASS_<timestamp>` fake token 传给后端。
 *
 * 后端 verify 在 dev 模式（NODE_ENV !== 'production'）下识别该前缀 → 直接放行 + warn log。
 * 生产环境收到该前缀视为攻击 → 拒绝（20007）。
 */
const LOCAL_DEV_BYPASS_PREFIX = 'LOCAL_DEV_BYPASS_';

/** turnstile.config 内存缓存条目（避免每次登录都查 DB） */
interface TurnstileConfigCacheEntry {
    /** 配置对象（已 JSON.parse），null 表示"已确认 DB 中没有" */
    value: TurnstileConfigShape | null;
    /** 过期时间戳（毫秒） */
    expire: number;
}

/**
 * turnstile.config 解析后的形状
 * - 前端 TurnstilePage 写入的字段
 * - enabled: 总开关（关 = 跳过验证）
 * - siteKey: 前端 widget 用（后端不读，留作配置完整性校验）
 * - secretKey: 后端 verify 用
 */
interface TurnstileConfigShape {
    enabled?: boolean;
    siteKey?: string;
    secretKey?: string;
}

/** siteverify 接口返回的 error-codes 字段类型 */
interface TurnstileVerifyResponse {
    /** 是否验证通过 */
    success: boolean;
    /** 验证时间戳 */
    challenge_ts?: string;
    /** 验证通过时的 hostname */
    hostname?: string;
    /** 错误码列表（如 invalid-input-response、timeout-or-duplicate） */
    'error-codes'?: string[];
}

@Injectable()
export class TurnstileService {
    private readonly logger = new Logger(TurnstileService.name);

    /**
     * turnstile.config 内存缓存
     * - key 固定为 'turnstile.config'（单条配置）
     * - TTL 1 分钟，访问后刷新 expire
     * - 简单 Map 实现，进程内不跨实例同步（多实例部署时各自 1 分钟延迟生效）
     */
    private readonly configCache = new Map<string, TurnstileConfigCacheEntry>();

    constructor(
        private readonly configService: ConfigService,
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly systemConfigService: SystemConfigService,
    ) {}

    /**
     * 验证 Turnstile token
     *
     * ## 设计意图
     *
     * spec 的核心原则是 **"管理员在 system_config 关闭 Turnstile = 完全不验证"**。
     * 因此 verify 的判断顺序必须是：
     *
     * 1. **先 resolveSecret**：没 secret（DB enabled=false / DB 没配 / env 也没有）→ 跳过
     *    - 这是"管理员显式禁用"路径，优先级最高
     *    - 跳过时不要求前端传 token（即前端 enabled=false 时不传 token 也能登录）
     *
     * 2. **有 secret 才校验 token**：缺失 token → 20007
     *    - 这是"管理员启用了验证，但用户没完成验证"路径
     *    - 强制要求前端必须传 token
     *
     * ## 反例（之前错误的顺序）
     *
     * 之前是先看 token（缺失就 20007）再看 secret（没有就跳过）。
     * 这导致 DB enabled=false 时，前端没传 token → 20007，spec 设计的"管理员关闭"完全失效。
     *
     * @param token 前端从 Turnstile widget 获取的一次性 token
     * @param ip 客户端 IP（透传给 Cloudflare，辅助风控）
     */
    async verify(token: string | undefined, ip?: string): Promise<void> {
        /**
         * Step 1：解析有效 secret（按 spec 优先级：system_config → 环境变量 → 跳过）
         *
         * **必须在 token 校验之前**：因为"管理员禁用"应该不要求 token
         * - resolveSecret 返回 null = 管理员在 system_config 显式 disabled，或环境没配 → 跳过验证
         * - resolveSecret 返回 secret = 管理员启用了 Turnstile → 必须走 token 校验
         */
        const secret = await this.resolveSecret();
        if (!secret) {
            // 都没有 → 跳过验证（开发环境友好；生产应在日志里看到告警）
            this.logger.warn('[Turnstile] 未配置 secret（system_config 与 TURNSTILE_SECRET_KEY 都为空），跳过验证');
            return;
        }

        /**
         * Step 1.5：测试密钥快速通道（必须在 token 校验之前）
         * - Cloudflare 官方测试 secret（1x000...0AA）对任何 token 永远返回 success=true
         * - 调 Cloudflare API 纯属浪费（多 100-300ms 网络延迟），且 dev 环境可能网络不通
         * - 不要求 token 也不调 API，直接放行
         * - 生产误配测试密钥也会走此通道（安全无影响：测试密钥本身就让所有 token 通过）
         */
        if (secret === TURNSTILE_TEST_SECRET) {
            this.logger.debug(`[Turnstile] 测试密钥快速通道放行, ip=${ip ?? 'unknown'}`);
            return;
        }

        /**
         * Step 2：缺失 token 拒绝（有 secret 的情况下）
         * - 只在管理员启用了 Turnstile（有 secret）时才检查
         * - 缺失 token → 视为"用户未完成人机验证" → 20007
         */
        if (!token || token.trim() === '') {
            this.logger.warn(`[Turnstile] 拒绝请求：缺失 token, ip=${ip ?? 'unknown'}`);
            throw new BadRequestException({ code: 20007, message: '人机验证失败，请刷新页面重试' });
        }

        /**
         * Step 2.5：识别前端 useTurnstile 的 dev mock token
         *
         * 背景：Cloudflare Turnstile 的测试 siteKey（1x000...0AA）在 localhost 上 Cloudflare
         * 会返回 400020（域名不匹配），widget 加载失败。前端 useTurnstile 在 mock 模式
         * 下会生成 `LOCAL_DEV_BYPASS_<timestamp>` fake token 传给后端。
         *
         * 策略：
         * - dev 模式（NODE_ENV !== 'production'）：识别前缀 → 直接放行 + warn log
         * - 生产环境：视为攻击 → 拒绝（20007），不允许用 fake token 绕过验证
         *
         * 安全分析：dev 模式只在本机跑（localhost:3000），攻击者无法访问。
         *          dev 模式下放行 fake token 不会引入外部攻击面。
         */
        if (token.startsWith(LOCAL_DEV_BYPASS_PREFIX)) {
            if (process.env['NODE_ENV'] === 'production') {
                this.logger.warn(`[Turnstile] 生产环境收到 dev mock token, 拒绝, ip=${ip ?? 'unknown'}`);
                throw new BadRequestException({ code: 20007, message: '人机验证失败，请刷新页面重试' });
            }
            this.logger.warn(`[Turnstile] dev 模式 mock token 直接放行, ip=${ip ?? 'unknown'}`);
            return;
        }

        /**
         * Step 3：防重放 — 同一 token 5 分钟内只允许成功一次
         * - Cloudflare token 本身就是一次性的，但攻击者抓包后可以重放
         * - 这里用 Redis setex 做"已使用"标记
         * - key 包含 token 哈希后内容，避免 key 过长；这里直接用 token（足够短）
         */
        const usedKey = turnstileVerifyKey(token);
        const alreadyUsed = await this.cacheService.exists(usedKey);
        if (alreadyUsed) {
            this.logger.warn(`[Turnstile] 拒绝重放：token 已被使用, ip=${ip ?? 'unknown'}`);
            throw new BadRequestException({ code: 20007, message: '人机验证已过期，请重新验证' });
        }

        /**
         * Step 4：调用 Cloudflare siteverify
         * - 用 application/x-www-form-urlencoded（Cloudflare 官方推荐格式）
         * - 透传 remoteip 提升风控
         */
        const formBody = new URLSearchParams();
        formBody.append('secret', secret);
        formBody.append('response', token);
        if (ip && ip !== 'unknown') {
            formBody.append('remoteip', ip);
        }

        let result: TurnstileVerifyResponse;
        try {
            const res = await fetch(TURNSTILE_VERIFY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formBody.toString(),
            });

            if (!res.ok) {
                this.logger.error(`[Turnstile] Cloudflare API 异常: status=${res.status}`);
                throw new BadRequestException({ code: 20007, message: '人机验证服务异常，请稍后重试' });
            }

            result = (await res.json()) as TurnstileVerifyResponse;
        } catch (err) {
            /**
             * 网络异常或解析异常 → 拒绝请求
             * 安全优先：宁可让用户重试，也不可放过未验证请求
             */
            if (err instanceof BadRequestException) throw err;
            this.logger.error('[Turnstile] 调用 Cloudflare 失败', err);
            throw new BadRequestException({ code: 20007, message: '人机验证服务异常，请稍后重试' });
        }

        /**
         * Step 5：验证结果检查
         * - 测试密钥（1x000...0AA）永远返回 success=true，本地开发无需真实 widget
         * - 真实环境返回 false 通常意味着 token 过期 / 已用 / 用户被判定为机器人
         */
        if (!result.success) {
            this.logger.warn(
                `[Turnstile] 验证失败: errorCodes=${result['error-codes']?.join(',') ?? 'none'}, ip=${ip ?? 'unknown'}`,
            );
            throw new BadRequestException({ code: 20007, message: '人机验证失败，请刷新页面重试' });
        }

        /**
         * Step 6：标记 token 已使用（防重放）
         * - TTL 5 分钟：与 Cloudflare token 默认有效期一致
         * - 即使 Cloudflare 端允许 token 多次验证，本地 Redis 也会拒绝
         */
        await this.cacheService.setex(usedKey, TURNSTILE_USED_TTL, '1');
    }

    /**
     * 解析当前生效的 Turnstile secret（按优先级）
     *
     * 优先级（spec Task 7）：
     * 1. system_config.turnstile.config.enabled=false → 直接返回 null（跳过）
     * 2. system_config.turnstile.config.enabled=true + secretKey → 返回该 secretKey
     * 3. system_config 未配置 / 未启用 → 降级读 TURNSTILE_SECRET_KEY 环境变量
     * 4. 都没有 → 返回 null（verify 跳过）
     *
     * 缓存：1 分钟内存 LRU
     * - 避免每次登录都查 DB
     * - "前端保存 → 立即生效" 最多 1 分钟延迟（可接受）
     */
    private async resolveSecret(): Promise<string | null> {
        const config = await this.getCachedTurnstileConfig();
        if (config) {
            // 路径 A：system_config 有配置
            if (config.enabled === true) {
                if (config.secretKey && config.secretKey.trim() !== '') {
                    return config.secretKey;
                }
                // 启用了但没填 secretKey → 降级到环境变量
                this.logger.warn(
                    '[Turnstile] system_config 中 turnstile.config.enabled=true 但 secretKey 为空，降级读环境变量',
                );
            } else {
                // 显式禁用 → 跳过（不读环境变量，保持"管理员关掉就不验证"语义）
                this.logger.debug('[Turnstile] system_config 中 turnstile.config.enabled=false，跳过验证');
                return null;
            }
        }

        // 路径 B：降级读环境变量（向后兼容 .env.example 默认配置）
        const envSecret = this.configService.get<string>('TURNSTILE_SECRET_KEY');
        return envSecret && envSecret.trim() !== '' ? envSecret : null;
    }

    /**
     * 清除 turnstile.config 内存缓存
     *
     * 供 SystemConfigService 在更新 turnstile.config 后调用，
     * 实现"管理员保存配置 → 立即生效"而非等 5 秒 TTL 过期。
     */
    clearConfigCache(): void {
        this.configCache.delete(TURNSTILE_CONFIG_KEY);
        this.logger.debug('[Turnstile] 内存缓存已清除');
    }

    /**
     * 读 turnstile.config（含 1 分钟内存缓存）
     *
     * 返回：
     * - 配置对象：DB 中存在 turnstile.config 且 JSON 解析成功
     * - null：DB 中没有该 key（命中"不存在"负缓存），或 JSON 解析失败
     */
    private async getCachedTurnstileConfig(): Promise<TurnstileConfigShape | null> {
        const now = Date.now();
        const cached = this.configCache.get(TURNSTILE_CONFIG_KEY);
        if (cached && cached.expire > now) {
            return cached.value;
        }

        // 缓存 miss / 过期 → 查 system_config
        try {
            const raw = await this.systemConfigService.getConfigByKey(TURNSTILE_CONFIG_KEY, true);
            const parsed = this.parseTurnstileConfig(raw);
            // 写入缓存（含"null 也缓存 1 分钟"，避免反复打 DB 确认"没有"）
            this.configCache.set(TURNSTILE_CONFIG_KEY, {
                value: parsed,
                expire: now + TURNSTILE_CONFIG_CACHE_TTL_MS,
            });
            return parsed;
        } catch (err) {
            // 查 DB 失败时降级为"无配置"，让流程走到环境变量分支
            this.logger.warn('[Turnstile] 读 system_config.turnstile.config 失败，降级走环境变量', err);
            return null;
        }
    }

    /**
     * 把 system_config 取出来的 raw value 解析成 TurnstileConfigShape
     * - DB 存的是 JSON 对象（Prisma 解析后是对象）
     * - 兼容历史数据：value 可能是字符串（再次 JSON.parse）
     */
    private parseTurnstileConfig(raw: unknown): TurnstileConfigShape | null {
        if (raw === null || raw === undefined) return null;
        let obj: unknown = raw;
        if (typeof raw === 'string') {
            try {
                obj = JSON.parse(raw);
            } catch {
                return null;
            }
        }
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
        return obj;
    }
}
