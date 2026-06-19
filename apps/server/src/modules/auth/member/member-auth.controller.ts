import { Controller, Post, Body, Req, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '../auth.service.js';
import { AccountService } from '../../account/account.service.js';
import { SmsService } from '../../../common/sms/sms.service.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import {
    MemberSmsSendSchema,
    MemberSmsLoginSchema,
    ResetPasswordSendSchema,
    ResetPasswordSchema,
    type MemberSmsSendInput,
    type MemberSmsLoginInput,
    type ResetPasswordSendInput,
    type ResetPasswordInput,
} from '@packages/shared';
import { Public } from '../../../common/decorators/public.decorator.js';
import { issueCsrfCookie } from '../../../common/middleware/csrf.middleware.js';
import { TurnstileService } from '../../turnstile/turnstile.service.js';

/**
 * C 端认证控制器（Phase 8 改造）
 * - POST /member/auth/sms/send           — 发送短信验证码（已迁移到 SmsService）
 * - POST /member/auth/sms/login          — 短信验证码登录（验证码校验迁移到 SmsService）
 * - POST /member/auth/reset-password/send — 重置密码：发送验证码
 * - POST /member/auth/reset-password     — 重置密码：提交新密码（验证码校验迁移到 SmsService）
 * - 短信发送限流：1 次/60 秒（防短信轰炸）
 * - 登录限流：5 次/5 分钟
 * - 重置密码限流：3 次/5 分钟（防爆破）
 * - Turnstile 人机验证：所有公开端点前置调 TurnstileService.verify()
 *   - 防短信轰炸（攻击者无法绕过 Turnstile 触发高频发送）
 *   - 配置未启用 / 缺 secret → 服务端跳过；启用 + 缺 token → 20007 拒绝
 */
@Controller('member/auth')
export class MemberAuthController {
    private readonly logger = new Logger(MemberAuthController.name);

    /**
     * Cookie secure 标志 — 显式从 auth.COOKIE_SECURE 配置读取
     * - zod schema 把字符串 "true" / "false" 解析为 boolean（默认 false）
     * - 不做 NODE_ENV 推断（12-Factor App：配置显式，不靠其他变量推断）
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
        private readonly accountService: AccountService,
        private readonly smsService: SmsService,
        private readonly turnstileService: TurnstileService,
        private readonly configService: ConfigService,
    ) {
        this.cookieSecure = this.configService.get<boolean>('auth.COOKIE_SECURE') === true;
        this.issueCsrf = issueCsrfCookie(this.configService);
    }

    /**
     * @description C 端发送短信验证码（登录 / 注册 / 重置密码前调用）
     * @param dto - 入参 { phone, purpose, turnstileToken }
     * @returns 200 表示发送成功
     * @throws 20007 Turnstile 验证失败
     * @example POST /api/member/auth/sms/send
     */
    @Public()
    @Throttle({ long: { limit: 1, ttl: 60000 } })
    @Post('sms/send')
    async sendSmsCode(@Body(new ZodValidationPipe(MemberSmsSendSchema)) dto: MemberSmsSendInput, @Req() req: Request) {
        /** Phase 8：短信发送已迁移到 SmsService（频率限制 + 阿里云通道 + 审计） */
        const ip = req.ip || 'unknown';
        /**
         * Step 1：Turnstile 人机验证（防短信轰炸第一道防线）
         * - verify() 内部已处理：未启用 / 缺 secret → 跳过；启用 + 缺/错 token → 抛 20007
         * - dto.turnstileToken 在 schema 中是 optional，前端未传时为 undefined
         */
        await this.turnstileService.verify(dto.turnstileToken, ip);
        await this.smsService.sendVerificationCode(dto.phone, dto.purpose, ip);
        return {
            code: 0,
            message: 'ok',
            data: { message: '验证码已发送' },
        };
    }

    /**
     * @description C 端重置密码 — 第一步：发送验证码
     * @param dto - 入参 { phone, turnstileToken }
     * @returns 200 表示发送成功
     * @example POST /api/member/auth/reset-password/send
     */
    @Public()
    @Throttle({ long: { limit: 1, ttl: 60000 } })
    @Post('reset-password/send')
    async sendResetPasswordCode(
        @Body(new ZodValidationPipe(ResetPasswordSendSchema)) dto: ResetPasswordSendInput,
        @Req() req: Request,
    ) {
        const ip = req.ip || 'unknown';
        /** Turnstile 验证：重置密码短信发送属于"防短信轰炸"重点端点 */
        await this.turnstileService.verify(dto.turnstileToken, ip);

        /**
         * 先查手机号是否已注册，仅对已注册手机号真发短信
         * - 未注册 → 跳过真发（节省短信成本），统一返回相同文案
         * - 已注册 → 正常发送验证码
         *
         * 安全设计：不泄露"该手机号是否已注册"——两种路径返回完全相同的响应
         */
        const identity = await this.accountService.findByIdentity('phone', dto.phone);
        if (identity) {
            await this.smsService.sendVerificationCode(dto.phone, 'reset_password', ip);
        }

        return {
            code: 0,
            message: 'ok',
            data: { message: '如果该手机号已注册，验证码将发送' },
        };
    }

    /**
     * @description C 端重置密码 — 第二步：提交验证码 + 新密码
     * @param dto - 入参 { phone, code, newPassword }
     * @returns 200 表示重置成功
     * @throws 30004/30005 验证码错误 / 已过期
     * @example POST /api/member/auth/reset-password
     */
    @Public()
    @Throttle({ long: { limit: 3, ttl: 5 * 60 * 1000 } })
    @Post('reset-password')
    async resetPassword(
        @Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordInput,
        @Req() req: Request,
    ) {
        /** Step 1：SmsService 校验验证码（失败抛 30004/30005） */
        await this.smsService.verifyCode(dto.phone, dto.code, 'reset_password');
        /** Step 2：AuthService 重置密码（验证码已通过，直接落库） */
        await this.authService.resetPassword(dto.phone, dto.newPassword);
        this.logger.log(`[reset-password] phone=${dto.phone.slice(0, 3)}**** ip=${req.ip ?? 'unknown'}`);
        return {
            code: 0,
            message: 'ok',
            data: null,
        };
    }

    /**
     * @description C 端短信验证码登录（无密码登录）
     * @param dto - 入参 { phone, code, turnstileToken }
     * @returns accessToken + isNewUser + csrfToken
     * @example POST /api/member/auth/sms/login
     */
    @Public()
    @Throttle({ long: { limit: 5, ttl: 300000 } })
    @Post('sms/login')
    async smsLogin(
        @Body(new ZodValidationPipe(MemberSmsLoginSchema)) dto: MemberSmsLoginInput,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const ip = req.ip || 'unknown';
        const userAgent = req.headers['user-agent'];

        /**
         * Step 1：Turnstile 人机验证（短信登录端点）
         * - 防止攻击者用自动化脚本批量调短信登录端点（虽不直接发短信，但能暴力猜测 token + 用户状态）
         */
        await this.turnstileService.verify(dto.turnstileToken, ip);

        /** Step 2：SmsService 校验验证码（失败抛 30004/30005） */
        await this.smsService.verifyCode(dto.phone, dto.code, 'login');

        /** Step 3：登录 / 注册 */
        const result = await this.authService.memberSmsLogin(dto.phone, ip, userAgent);

        /** Refresh Token 通过 httpOnly cookie 下发 */
        res.cookie('refreshToken', result.refreshToken, {
            httpOnly: true,
            secure: this.cookieSecure,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            /** path 必须匹配实际 refresh 接口路径（含全局前缀 /api），否则浏览器不会发送此 cookie */
            path: '/api/auth',
        });

        /**
         * 短信登录响应一次性下发 CSRF token
         * - 顺序：在 refreshToken cookie 之后、返回响应体之前
         * - 与管理员登录共用同一套 Double Submit Cookie 防护
         */
        const csrfToken = this.issueCsrf(res);

        return {
            code: 0,
            message: 'ok',
            data: {
                accessToken: result.accessToken,
                expiresIn: result.expiresIn,
                isNewUser: result.isNewUser,
                csrfToken,
            },
        };
    }
}
