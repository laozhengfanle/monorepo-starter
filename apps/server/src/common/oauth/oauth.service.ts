/**
 * 第三方登录业务服务
 *
 * 业务职责：
 * - 状态管理：生成 state（防 CSRF）+ 一次性消费
 * - 登录：根据 provider name 选 Provider → 调 getUserInfo → 查 account_identity → 找不到则 createMemberAccount
 * - 绑定 / 解绑：bindOAuth / unbindOAuth（已登录用户追加 OAuth 登录方式）
 * - Apple 专用：verifyAppleIdentityToken（用 jose 校验 identityToken）
 *
 * 数据模型：
 * - account_identity 复用现有表，identityType 字段记录 provider 名称（'wechat-web' / 'wechat-miniprogram' / 'apple'）
 * - identifier 字段记录 openid / unionid
 * - 微信场景：identifier 优先用 openid（每个应用独立）；同主体多应用可用 unionid 跨应用识别
 *
 * 错误码：
 * - 40002 state 校验失败
 * - 40003 已被其他账号绑定
 * - 40004 已绑定当前账号
 * - 40005 至少保留一种登录方式
 * - 40008 提供方不存在
 * - 40010 Apple identity_token 失败
 */
import { randomBytes } from 'crypto';
import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_KEYS } from '../cache/cache-key.constants.js';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../cache/cache.interface.js';
import { ERROR_CODES } from '../errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../../../prisma/generated/client.js';
import { AccountService } from '../../modules/account/account.service.js';
import type { OAuthProvider, OAuthProviderName, OAuthUserInfo } from './oauth.provider.js';
import { WechatWebProvider } from './providers/wechat-web.provider.js';
import { WechatMiniprogramProvider } from './providers/wechat-miniprogram.provider.js';
import { AppleProvider } from './providers/apple.provider.js';

/** state TTL（10 分钟） */
const STATE_TTL = 600;
/** state 长度（32 字节 → 64 个 hex 字符） */
const STATE_LENGTH = 32;

/** OAuth redirect URI 域名白名单（默认值，会被 env OAUTH_REDIRECT_DOMAINS 覆盖） */
const DEFAULT_ALLOWED_DOMAINS = ['localhost'];

/** state 在 Redis 中存储的结构 */
interface StatePayload {
    provider: OAuthProviderName;
    redirectUri: string;
    nonce: string;
}

/** bind 场景的 userInfo 简化结构（Controller 传入） */
export interface BindUserInfo {
    openId: string;
    unionId?: string;
    nickname?: string;
    avatar?: string;
}

@Injectable()
export class OAuthService {
    private readonly logger = new Logger(OAuthService.name);

    /** Provider 注册表（name → instance） */
    private readonly providers: Map<OAuthProviderName, OAuthProvider>;

    constructor(
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly prisma: PrismaService,
        private readonly accountService: AccountService,
        private readonly configService: ConfigService,
        private readonly wechatWebProvider: WechatWebProvider,
        private readonly wechatMiniprogramProvider: WechatMiniprogramProvider,
        private readonly appleProvider: AppleProvider,
    ) {
        this.providers = new Map();
        this.providers.set('wechat-web', this.wechatWebProvider);
        this.providers.set('wechat-miniprogram', this.wechatMiniprogramProvider);
        this.providers.set('apple', this.appleProvider);
    }

    /**
     * 拿指定 Provider
     * - 找不到 → 抛 40008
     */
    private getProvider(name: OAuthProviderName): OAuthProvider {
        const p = this.providers.get(name);
        if (!p) {
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_PROVIDER_NOT_FOUND,
                message: `OAuth 提供方 ${name} 不存在`,
            });
        }
        return p;
    }

    /**
     * 生成 state（防 CSRF 一次性随机串，绑定 provider + redirectUri）
     * - 32 字节随机 → 64 个 hex 字符
     * - 存 Redis mono:oauth:state:{state} = JSON({provider, redirectUri, nonce})，TTL 10 分钟
     * - nonce 双保险：即使 hex 碰撞也能区分
     *
     * @param provider OAuth 提供方名称
     * @param redirectUri 回调地址（必须通过白名单校验）
     */
    async generateState(provider: OAuthProviderName, redirectUri: string): Promise<string> {
        this.validateRedirectUri(redirectUri, provider);
        const state = randomBytes(STATE_LENGTH).toString('hex');
        const payload: StatePayload = { provider, redirectUri, nonce: randomBytes(16).toString('hex') };
        await this.cacheService.setex(`${CACHE_KEYS.OAUTH_STATE}:${state}`, STATE_TTL, JSON.stringify(payload));
        return state;
    }

    /**
     * 校验 state（一次性消费 + 参数比对）
     * - 不存在或已用过 → 抛 40002
     * - 验证后立即删除（防重放）
     * - 解析 JSON，比对 provider 是否匹配
     *
     * @param state 前端回传的 state
     * @param expectedProvider 预期的 provider（必须匹配）
     * @returns 原始 redirectUri（供调用方审计，不用于重定向）
     */
    async verifyState(state: string, expectedProvider: OAuthProviderName): Promise<{ redirectUri: string }> {
        const key = `${CACHE_KEYS.OAUTH_STATE}:${state}`;
        const raw = await this.cacheService.get<string>(key);
        if (!raw) {
            throw new BadRequestException({ code: ERROR_CODES.OAUTH_STATE_INVALID, message: 'state 无效或已过期' });
        }
        await this.cacheService.del(key);

        let payload: StatePayload;
        try {
            payload = JSON.parse(raw) as StatePayload;
        } catch {
            throw new BadRequestException({ code: ERROR_CODES.OAUTH_STATE_INVALID, message: 'state 格式无效' });
        }

        if (!payload.provider || !payload.redirectUri || !payload.nonce) {
            throw new BadRequestException({ code: ERROR_CODES.OAUTH_STATE_INVALID, message: 'state 数据不完整' });
        }

        if (payload.provider !== expectedProvider) {
            this.logger.warn(`OAuth state provider 不匹配: expected=${expectedProvider} actual=${payload.provider}`);
            throw new BadRequestException({ code: ERROR_CODES.OAUTH_STATE_INVALID, message: 'state 无效或已过期' });
        }

        return { redirectUri: payload.redirectUri };
    }

    /**
     * 校验 redirectUri 是否在白名单域名内
     * - 从 env OAUTH_REDIRECT_DOMAINS（逗号分隔）读取，fallback 到 DEFAULT_ALLOWED_DOMAINS
     * - 解析 URL，取 hostname，比对白名单
     * - 防止攻击者篡改 redirectUri 将 OAuth code 劫持到第三方域名
     */
    private validateRedirectUri(redirectUri: string, provider: OAuthProviderName): void {
        const rawDomains = this.configService.get<string>('oauth.allowedRedirectDomains') ?? '';
        const domains = rawDomains
            ? rawDomains
                  .split(',')
                  .map((d) => d.trim())
                  .filter(Boolean)
            : DEFAULT_ALLOWED_DOMAINS;

        let hostname: string;
        try {
            hostname = new URL(redirectUri).hostname;
        } catch {
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_STATE_INVALID,
                message: `redirectUri 格式无效: ${redirectUri}`,
            });
        }

        const allowed = domains.some((d) => hostname === d || hostname.endsWith('.' + d));
        if (!allowed) {
            this.logger.error(
                `OAuth redirectUri 不在白名单: provider=${provider} hostname=${hostname} allowed=${domains.join(',')}`,
            );
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_STATE_INVALID,
                message: 'redirectUri 不在允许的域名白名单中',
            });
        }
    }

    /**
     * 用 code 换用户信息（Provider 抽象 + 业务封装）
     */
    async fetchUserInfo(providerName: OAuthProviderName, code: string, redirectUri?: string): Promise<OAuthUserInfo> {
        const provider = this.getProvider(providerName);
        const result = await provider.getUserInfo(code, redirectUri);
        return result.userInfo;
    }

    /**
     * 构造授权 URL（web 用）
     */
    getAuthorizationUrl(providerName: OAuthProviderName, state: string, redirectUri: string): string {
        const provider = this.getProvider(providerName);
        return provider.getAuthorizationUrl(state, redirectUri);
    }

    /**
     * 校验 Apple identityToken（专用方法，绕过 OAuthProvider 接口）
     */
    async verifyAppleIdentityToken(identityToken: string): Promise<{ sub: string; email?: string }> {
        try {
            const verified = await this.appleProvider.verifyIdentityToken(identityToken);
            const sub = typeof verified.payload.sub === 'string' ? verified.payload.sub : '';
            const email = typeof verified.payload.email === 'string' ? verified.payload.email : undefined;
            if (!sub) {
                throw new BadRequestException({
                    code: ERROR_CODES.OAUTH_APPLE_IDENTITY_TOKEN_INVALID,
                    message: 'Apple identity_token 缺少 sub 字段',
                });
            }
            return { sub, email };
        } catch (err) {
            if (err instanceof BadRequestException) throw err;
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_APPLE_IDENTITY_TOKEN_INVALID,
                message: `Apple identity_token 校验失败: ${(err as Error).message}`,
            });
        }
    }

    /**
     * 查找或创建 OAuth 用户
     * - 流程：openid 查 identity → unionid 查 identity → 都没有则 createMemberAccount
     * - 返回 accountId + userInfo
     */
    async findOrCreateByWechat(
        providerName: 'wechat-web' | 'wechat-miniprogram',
        userInfo: OAuthUserInfo,
    ): Promise<{ accountId: string; isNewUser: boolean; userInfo: OAuthUserInfo }> {
        const { openId, unionId } = userInfo;
        if (!openId) {
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_INVALID_CODE,
                message: 'OAuth 用户信息缺少 openId',
            });
        }

        /** Step 1：openid 查 identity */
        const byOpenId = await this.prisma.client.accountIdentity.findFirst({
            where: { identityType: providerName, identifier: openId },
        });
        if (byOpenId) {
            return { accountId: byOpenId.accountId, isNewUser: false, userInfo };
        }

        /** Step 2：unionid 查 identity（跨应用场景） */
        if (unionId) {
            const byUnionId = await this.prisma.client.accountIdentity.findFirst({
                where: { identityType: 'wechat-unionid', identifier: unionId },
            });
            if (byUnionId) {
                return { accountId: byUnionId.accountId, isNewUser: false, userInfo };
            }
        }

        /** Step 3：找不到则创建新账户（自动注册） */
        const account = await this.accountService.createMemberAccount(openId, userInfo.nickname);
        return { accountId: account.id, isNewUser: true, userInfo };
    }

    /**
     * 查找或创建 Apple 用户
     * - 类似 findOrCreateByWechat，但 identityType 固定为 'apple'
     */
    async findOrCreateByApple(
        sub: string,
        email: string | undefined,
    ): Promise<{ accountId: string; isNewUser: boolean }> {
        const bySub = await this.prisma.client.accountIdentity.findFirst({
            where: { identityType: 'apple', identifier: sub },
        });
        if (bySub) {
            return { accountId: bySub.accountId, isNewUser: false };
        }
        const account = await this.accountService.createMemberAccount(sub, email ? email.split('@')[0] : undefined);
        return { accountId: account.id, isNewUser: true };
    }

    /**
     * 绑定 OAuth 到当前账户
     * - 流程：检查已占用 → 检查已绑定 → 创建 identity
     * - 抛 40003 / 40004
     */
    async bindOAuth(
        accountId: string,
        providerName: OAuthProviderName,
        userInfo: BindUserInfo,
    ): Promise<{ success: true; identityId: string }> {
        if (!userInfo.openId) {
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_INVALID_CODE,
                message: 'OAuth 用户信息缺少 openId',
            });
        }

        /** Step 1：检查 openid 是否已被其他账户绑定 */
        const occupied = await this.prisma.client.accountIdentity.findFirst({
            where: {
                identityType: providerName,
                identifier: userInfo.openId,
                NOT: { accountId },
            },
        });
        if (occupied) {
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_BIND_CONFLICT,
                message: '该第三方账号已被其他用户绑定',
            });
        }

        /** Step 2：检查当前账户是否已绑定该 provider */
        const selfBound = await this.prisma.client.accountIdentity.findFirst({
            where: { accountId, identityType: providerName },
        });
        if (selfBound) {
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_ALREADY_BOUND,
                message: '当前账户已绑定该第三方登录',
            });
        }

        /** Step 3：创建 identity（绑定） */
        const newIdentity = await this.prisma.client.accountIdentity.create({
            data: {
                accountId,
                identityType: providerName,
                identifier: userInfo.openId,
                verified: true,
            } as unknown as Prisma.AccountIdentityUncheckedCreateInput,
        });

        return { success: true, identityId: newIdentity.id };
    }

    /**
     * 解绑 OAuth（从当前账户移除）
     * - 至少保留一种登录方式（不能解绑到 0 个 identity）
     * - 抛 40005
     */
    async unbindOAuth(accountId: string, providerName: OAuthProviderName): Promise<{ success: true }> {
        /** Step 1：查该账户所有 identity */
        const allIdentities = await this.prisma.client.accountIdentity.findMany({
            where: { accountId },
            select: { id: true, identityType: true },
        });

        if (allIdentities.length <= 1) {
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_LAST_IDENTITY,
                message: '至少保留一种登录方式',
            });
        }

        /** Step 2：找到该 provider 的 identity */
        const target = allIdentities.find((i) => i.identityType === providerName);
        if (!target) {
            throw new BadRequestException({
                code: ERROR_CODES.OAUTH_NOT_BOUND ?? 40009,
                message: '当前账户未绑定该第三方登录',
            });
        }

        await this.prisma.client.accountIdentity.delete({ where: { id: target.id } });
        return { success: true };
    }
}
