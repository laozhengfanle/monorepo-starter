import { Controller, Post, Body, Req, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '../../../modules/auth/auth.service.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AdminLoginSchema, type AdminLoginInput } from '@packages/shared';
import { Public } from '../../../common/decorators/public.decorator.js';
import { issueCsrfCookie } from '../../../common/middleware/csrf.middleware.js';
import { TurnstileService } from '../../../modules/turnstile/turnstile.service.js';

/**
 * 管理员认证控制器
 * - POST /admin/auth/login — 管理员用户名+密码登录
 * - 登录端点限流：5 次/60 秒（防暴力破解）
 * - Turnstile 人机验证：调 TurnstileService.verify() 前置
 *   - 配置未启用 / 缺 secret → 服务端跳过
 *   - 启用 + 缺 token → 20007 拒绝
 */
@Controller('admin/auth')
export class AdminAuthController {
    private readonly logger = new Logger(AdminAuthController.name);

    /**
     * Cookie secure 标志 — 显式从 auth.COOKIE_SECURE 配置读取
     * - zod schema 把字符串 "true" / "false" 解析为 boolean（默认 false）
     * - 不做 NODE_ENV 推断（避免"两个环境变量来源"导致行为难预测）
     * - 12-Factor App 原则：配置显式，不要从其他变量推断配置
     * - dev 友好默认值：未配置时为 false（HTTP 也能带 cookie，方便本地调试）
     * - 生产环境：必须显式设 COOKIE_SECURE=true，强制 HTTPS
     */
    private readonly cookieSecure: boolean;

    /**
     * 工厂化的 CSRF cookie 发放函数（闭包内已绑定 ConfigService）
     * - 与 express middleware 共用同一套工厂，避免重复实现
     */
    private readonly issueCsrf: (res: Response) => string;

    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
        private readonly turnstileService: TurnstileService,
    ) {
        this.cookieSecure = this.configService.get<boolean>('auth.COOKIE_SECURE') === true;
        this.issueCsrf = issueCsrfCookie(this.configService);
    }

    @Public()
    @Throttle({ long: { limit: 5, ttl: 300000 } })
    @Post('login')
    async adminLogin(
        @Body(new ZodValidationPipe(AdminLoginSchema)) dto: AdminLoginInput,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const ip = req.ip || 'unknown';
        const userAgent = req.headers['user-agent'];

        /**
         * Step 1：Turnstile 人机验证（公开端点防暴力破解的第一道防线）
         * - 内部已处理：配置未启用 / 缺 secret → 跳过；启用 + 缺/错 token → 抛 20007
         * - dto.turnstileToken 在 schema 中是 optional，前端未传时为 undefined
         */
        await this.turnstileService.verify(dto.turnstileToken, ip);

        const tokens = await this.authService.adminLogin(dto.username, dto.password, ip, userAgent);

        /** accessToken + refreshToken 双 httpOnly cookie */
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

        /**
         * 登录响应一次性下发 CSRF token
         * - 顺序：在 accessToken / refreshToken cookie 之后、返回响应体之前
         * - 前端无需手动 GET /api/auth/csrf-token，由登录响应 Set-Cookie 直接下发
         * - 返回的 csrfToken 会回传到响应体（前端可缓存，避免后续额外请求）
         */
        const csrfToken = this.issueCsrf(res);

        return {
            code: 0,
            message: 'ok',
            data: {
                mustChangePassword: tokens.mustChangePassword,
                csrfToken,
            },
        };
    }
}
