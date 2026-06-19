/**
 * 第三方登录 REST 控制器
 *
 * 端点：
 * - GET  /member/auth/wechat-web/authorize-url  → 拿授权 URL + state
 * - POST /member/auth/wechat-web               → code + state 换登录（@Public）
 * - POST /member/auth/wechat-miniprogram       → code 换登录（@Public）
 * - POST /member/auth/apple                    → identityToken 换登录（@Public）
 * - POST /member/auth/bind                     → 当前账户绑定 OAuth（默认受 JwtAuthGuard 保护）
 * - POST /member/auth/unbind                   → 当前账户解绑 OAuth（默认受 JwtAuthGuard 保护）
 * - POST /member/auth/apple/revoke             → Apple 撤销服务（@Public）
 *
 * 鉴权策略：
 * - 全局 JwtAuthGuard 在 app.module.ts 通过 APP_GUARD 注册
 * - 登录 / revoke 端点加 @Public() 跳过
 * - bind / unbind 端点不加 @Public()，由全局守卫保护
 */
import {
    BadRequestException,
    Body,
    Controller,
    Get,
    InternalServerErrorException,
    Logger,
    Post,
    Query,
    Req,
    Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { OAuthService } from './oauth.service.js';
import { Public } from '../decorators/public.decorator.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { issueCsrfCookie } from '../middleware/csrf.middleware.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe.js';

/** Zod schemas for OAuth endpoints */
const WechatWebLoginSchema = z.object({
    code: z.string().min(1, 'code 必填'),
    state: z.string().min(1, 'state 必填'),
});
const WechatMiniprogramLoginSchema = z.object({
    code: z.string().min(1, 'code 必填'),
});
const AppleLoginSchema = z.object({
    code: z.string().optional(),
    identityToken: z.string().min(1, 'identityToken 必填'),
    user: z
        .object({
            name: z.object({ firstName: z.string().optional(), lastName: z.string().optional() }).optional(),
            email: z.string().optional(),
        })
        .optional(),
});
const BindSchema = z.object({
    provider: z.enum(['wechat-web', 'wechat-miniprogram', 'apple']),
    code: z.string().min(1, 'code 必填'),
    state: z.string().min(1, 'state 必填'),
});
const UnbindSchema = z.object({
    provider: z.enum(['wechat-web', 'wechat-miniprogram', 'apple']),
});

/** 微信 web 登录请求体 */
interface WechatWebLoginDto {
    code: string;
    state: string;
}

/** 微信小程序登录请求体 */
interface WechatMiniprogramLoginDto {
    code: string;
}

/** Apple 登录请求体 */
interface AppleLoginDto {
    code?: string;
    identityToken: string;
    user?: { name?: { firstName?: string; lastName?: string }; email?: string };
}

/** 绑定请求体 */
interface BindDto {
    provider: 'wechat-web' | 'wechat-miniprogram' | 'apple';
    code: string;
    state: string;
}

/** 解绑请求体 */
interface UnbindDto {
    provider: 'wechat-web' | 'wechat-miniprogram' | 'apple';
}

/** Apple 撤销请求体（来自 Apple 服务器回调） */
interface AppleRevokeDto {
    payload?: string;
    code?: string;
}

@Controller('member/auth')
export class OAuthController {
    private readonly logger = new Logger(OAuthController.name);

    /**
     * 工厂化的 CSRF cookie 发放函数（闭包内已绑定 ConfigService）
     * - 与 express middleware 共用同一套工厂，避免重复实现
     */
    private readonly issueCsrf: (res: Response) => string;

    constructor(
        private readonly oauthService: OAuthService,
        private readonly auditService: AuditService,
        private readonly configService: ConfigService,
        private readonly jwtService: JwtService,
        private readonly prisma: PrismaService,
    ) {
        this.issueCsrf = issueCsrfCookie(this.configService);
    }

    /**
     * GET /member/auth/wechat-web/authorize-url
     * - 返回 { url, state }，前端跳转 url 完成扫码
     */
    @Public()
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Get('wechat-web/authorize-url')
    async getWechatWebAuthorizeUrl(@Query('platform') platform?: string) {
        void platform; // 预留 platform=web/h5 区分
        /**
         * 读取 wechat web OAuth 回调地址（绝对 URL）
         * - 微信 OAuth 要求 redirectUri 必须是公网可访问的绝对 URL，否则报 `redirect_uri 参数错误`
         * - 未配置 → fail-fast 返回 500，防止线上静默 fallback 到相对路径导致登录失败
         * - 白名单校验在 OAuthService.generateState → validateRedirectUri 内统一处理
         */
        const redirectUri = this.configService.get<string>('oauth.wechatWebRedirectUri');
        if (!redirectUri) {
            this.logger.error('OAuth wechat-web 缺少配置 oauth.wechatWebRedirectUri（必须是公网可访问的绝对 URL）');
            throw new InternalServerErrorException({
                code: 50000,
                message: 'OAuth wechat-web 回调地址未配置，请联系管理员',
            });
        }
        /** generateState 内校验 redirectUri 白名单 + 绑定 provider/redirectUri/nonce */
        const state = await this.oauthService.generateState('wechat-web', redirectUri);
        const url = this.oauthService.getAuthorizationUrl('wechat-web', state, redirectUri);
        return { code: 0, message: 'ok', data: { url, state } };
    }

    /**
     * POST /member/auth/wechat-web
     * - code + state 换登录
     */
    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('wechat-web')
    async wechatWebLogin(
        @Body(new ZodValidationPipe(WechatWebLoginSchema)) dto: WechatWebLoginDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const ip = req.ip || 'unknown';
        const userAgent = req.headers['user-agent'];
        /** 校验 state（一次性消费 + 比对 provider），取回 redirectUri */
        const { redirectUri } = await this.oauthService.verifyState(dto.state, 'wechat-web');
        /** 拿 userInfo（传 redirectUri：微信 API code 换 token 需要此参数） */
        const userInfo = await this.oauthService.fetchUserInfo('wechat-web', dto.code, redirectUri);
        /** 查 / 创建账户 */
        const { accountId, isNewUser } = await this.oauthService.findOrCreateByWechat('wechat-web', userInfo);
        /** 签发双 Token */
        return this.issueTokensAndRespond(accountId, isNewUser, 'wechat-web', ip, userAgent, res);
    }

    /**
     * POST /member/auth/wechat-miniprogram
     * - code 换登录（前端用 wx.login 拿 code）
     */
    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('wechat-miniprogram')
    async wechatMiniprogramLogin(
        @Body(new ZodValidationPipe(WechatMiniprogramLoginSchema)) dto: WechatMiniprogramLoginDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const ip = req.ip || 'unknown';
        const userAgent = req.headers['user-agent'];
        const userInfo = await this.oauthService.fetchUserInfo('wechat-miniprogram', dto.code);
        const { accountId, isNewUser } = await this.oauthService.findOrCreateByWechat('wechat-miniprogram', userInfo);
        return this.issueTokensAndRespond(accountId, isNewUser, 'wechat-miniprogram', ip, userAgent, res);
    }

    /**
     * POST /member/auth/apple
     * - identityToken 换登录
     */
    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('apple')
    async appleLogin(
        @Body(new ZodValidationPipe(AppleLoginSchema)) dto: AppleLoginDto,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const ip = req.ip || 'unknown';
        const userAgent = req.headers['user-agent'];
        const { sub, email } = await this.oauthService.verifyAppleIdentityToken(dto.identityToken);
        const { accountId, isNewUser } = await this.oauthService.findOrCreateByApple(sub, email);
        return this.issueTokensAndRespond(accountId, isNewUser, 'apple', ip, userAgent, res);
    }

    /**
     * POST /member/auth/bind
     * - 当前账户绑定 OAuth（受全局 JwtAuthGuard 保护）
     */
    @Post('bind')
    async bind(@Body(new ZodValidationPipe(BindSchema)) dto: BindDto, @Req() req: Request) {
        await this.oauthService.verifyState(dto.state, dto.provider);
        const userInfo = await this.oauthService.fetchUserInfo(dto.provider, dto.code);

        const accountId = (req.user as { accountId: string })?.accountId;
        if (!accountId) {
            throw new BadRequestException({ code: 20003, message: '未认证' });
        }
        const result = await this.oauthService.bindOAuth(accountId, dto.provider, userInfo);
        return { code: 0, message: 'ok', data: result };
    }

    /**
     * POST /member/auth/unbind
     * - 当前账户解绑 OAuth（受全局 JwtAuthGuard 保护）
     */
    @Post('unbind')
    async unbind(@Body(new ZodValidationPipe(UnbindSchema)) dto: UnbindDto, @Req() req: Request) {
        const accountId = (req.user as { accountId: string })?.accountId;
        if (!accountId) {
            throw new BadRequestException({ code: 20003, message: '未认证' });
        }
        const result = await this.oauthService.unbindOAuth(accountId, dto.provider);
        return { code: 0, message: 'ok', data: result };
    }

    /**
     * POST /member/auth/apple/revoke
     * - Apple 服务器撤销授权回调
     * - 当前仅记录日志（生产可对接具体业务）
     * - 限流：5 次/分钟（Apple 服务器回调频率很低，正常应 < 1 次/天）
     */
    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('apple/revoke')
    async appleRevoke(@Body() dto: AppleRevokeDto) {
        await this.auditService.record({
            accountId: '',
            action: 'apple_oauth_revoked',
            resourceType: 'oauth',
            detail: { payload: dto.payload, code: dto.code },
        });
        return { code: 0, message: 'ok' };
    }

    /**
     * 签发双 Token 并下发 cookie / csrf（OAuth 登录与短信登录共用）
     * - 与 AuthService.issueTokens 镜像：抽到 controller 层是因为跨服务共享会形成循环依赖
     * - 简化版：只签 access + refresh，写 Redis
     */
    private async issueTokensAndRespond(
        accountId: string,
        isNewUser: boolean,
        provider: string,
        ip: string,
        userAgent: string | string[] | undefined,
        res: Response,
    ) {
        /** 查 account.tokenVersion（签发时锁定当时的版本号，与 AuthService.issueTokens 对齐） */
        const account = await this.prisma.client.account.findUnique({
            where: { id: accountId },
            select: { tokenVersion: true },
        });
        const tokenVersion = account?.tokenVersion ?? 0;
        const jti = randomUUID();
        const payload = { sub: accountId, userType: 'member', tokenVersion, jti };
        const accessTtl = this.configService.get<number>('auth.JWT_ACCESS_TTL') || 900;
        const refreshTtl = this.configService.get<number>('auth.JWT_REFRESH_TTL') || 604800;
        const accessToken = await this.jwtService.signAsync(payload, {
            expiresIn: accessTtl,
            algorithm: 'HS256',
            issuer: this.configService.get<string>('auth.JWT_ISSUER'),
            audience: this.configService.get<string>('auth.JWT_AUDIENCE'),
        });
        const refreshPayload = { ...payload, jti: randomUUID() };
        const refreshToken = await this.jwtService.signAsync(refreshPayload, {
            expiresIn: refreshTtl,
            algorithm: 'HS256',
            issuer: this.configService.get<string>('auth.JWT_ISSUER'),
            audience: this.configService.get<string>('auth.JWT_AUDIENCE'),
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: this.configService.get<boolean>('auth.COOKIE_SECURE') === true,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/api/auth',
        });
        const csrfToken = this.issueCsrf(res);

        await this.auditService.record({
            accountId,
            action: isNewUser ? 'register_success' : 'login_success',
            resourceType: 'auth',
            ip,
            userAgent: typeof userAgent === 'string' ? userAgent : undefined,
            detail: { provider, isNewUser },
        });

        return {
            code: 0,
            message: 'ok',
            data: {
                accessToken,
                expiresIn: accessTtl,
                isNewUser,
                csrfToken,
            },
        };
    }
}
