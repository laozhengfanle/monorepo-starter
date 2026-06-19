import { Controller, Post, Req, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { TokenIssuanceService } from './token-issuance.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

/**
 * 共享认证控制器
 * - POST /auth/refresh — 刷新 Token（从 cookie 取 refresh token，委托给 TokenIssuanceService）
 * - POST /auth/logout — 登出（委托给 TokenIssuanceService.logout）
 * - refresh 限流：5 次/5 分钟
 * - logout 限流：10 次/分钟（@Public 端点，需防滥用）
 *
 * 拆分说明（Post-Audit Polish Task 4）：
 * - refresh / logout 已从 AuthService 拆到 TokenIssuanceService
 * - AuthService 只保留业务编排（登录 / 改密 / 重置密码），不再被本控制器依赖
 * - 本控制器只注入 TokenIssuanceService
 */
@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    /**
     * Cookie secure 标志 — 显式从 auth.COOKIE_SECURE 配置读取
     * - zod schema 把字符串 "true" / "false" 解析为 boolean（默认 false）
     * - 不做 NODE_ENV 推断（12-Factor App：配置显式，不靠其他变量推断）
     * - dev 友好默认值：未配置时为 false（HTTP 也能带 cookie）
     * - 生产环境：必须显式设 COOKIE_SECURE=true
     */
    private readonly cookieSecure: boolean;

    constructor(
        private readonly tokenIssuance: TokenIssuanceService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {
        this.cookieSecure = this.configService.get<boolean>('auth.COOKIE_SECURE') === true;
    }

    @Public()
    @Post('refresh')
    async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const refreshToken = req.cookies?.['refreshToken'] as string | undefined;

        if (!refreshToken) {
            /** 缺少刷新令牌时返回 401，让前端正确识别为认证失败 */
            res.status(401);
            return {
                code: 20003,
                message: '缺少刷新令牌',
                data: null,
            };
        }

        const tokens = await this.tokenIssuance.refresh(refreshToken);

        const cookieBase = {
            httpOnly: true,
            secure: this.cookieSecure,
            sameSite: 'lax' as const,
        };

        res.cookie('accessToken', tokens.accessToken, {
            ...cookieBase,
            maxAge: tokens.expiresIn * 1000,
            path: '/',
        });

        res.cookie('refreshToken', tokens.refreshToken, {
            ...cookieBase,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            /** path 必须匹配实际 refresh 接口路径（含全局前缀 /api），否则浏览器不会发送此 cookie */
            path: '/api/auth',
        });

        return {
            code: 0,
            message: 'ok',
            data: null,
        };
    }

    /**
     * 登出端点
     * - 即使 access token 过期，也从 refresh token 中提取 accountId 清理 Redis
     * - 防止残留 refresh token 被盗用
     * - 限流 10 次/分钟：@Public 端点无认证，需防恶意请求批量清理他人 Redis 记录
     */
    @Public()
    @Throttle({ long: { limit: 10, ttl: 60 * 1000 } })
    @Post('logout')
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        /** 优先从 JWT 解析的 user 中获取 accountId */
        const user = req.user as { accountId: string } | undefined;

        if (user?.accountId) {
            /**
             * 登出逻辑已从 AuthService 拆到 TokenIssuanceService
             * - 详见 token-issuance.service.ts#logout（清缓存 + 撤销 token）
             */
            await this.tokenIssuance.logout(user.accountId);
        } else {
            /**
             * access token 过期时，从 cookie 中的 refresh token 反向查找 accountId
             * - 即使 access token 失效，也要清理 Redis 中的 refresh token 记录
             * - 防止攻击者使用残留的 refresh token 获取新 access token
             */
            const refreshToken = req.cookies?.['refreshToken'] as string | undefined;
            if (refreshToken) {
                try {
                    const payload = await this.jwtService.verifyAsync(refreshToken, {
                        algorithms: ['HS256'],
                        ignoreExpiration: true, // 过期 token 也需要清理
                    });
                    await this.tokenIssuance.logout(payload.sub);
                } catch {
                    /** token 无效或格式错误，无需清理 */
                    this.logger.debug('Logout: refresh token 无效，跳过 Redis 清理');
                }
            }
        }

        /** 清除双 cookie（path 必须与设置时一致，否则浏览器不会删除） */
        res.clearCookie('accessToken', { path: '/' });
        res.clearCookie('refreshToken', { path: '/api/auth' });

        return {
            code: 0,
            message: 'ok',
            data: null,
        };
    }
}
