/**
 * 账户身份认证 GraphQL Resolver
 *
 * Mutation:
 * - changePassword(input): 修改当前用户密码
 * - bindPhone(input): 绑定手机号到当前账户（需登录 + 短信验证码）
 * - unbindPhone(input): 解绑手机号（需登录 + 短信验证码，安全检查至少保留一种）
 *
 * 安全：
 * - 需要登录（JwtAuthGuard）
 * - 修改后强制重新登录（service 内清除 refresh token）
 */
import { UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import {
    ChangePasswordSchema,
    BindPhoneInputSchema,
    UnbindPhoneInputSchema,
    type ChangePasswordInput,
    type BindPhoneInput as BindPhoneInputDto,
    type UnbindPhoneInput as UnbindPhoneInputDto,
} from '@packages/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { ZodArgsPipe } from '../../../common/pipes/zod-args.pipe.js';
import { ChangePasswordInput as ChangePasswordInputType } from './change-password.input.js';
import { BindPhoneInput as BindPhoneInputType, UnbindPhoneInput as UnbindPhoneInputType } from './bind-phone.input.js';
import { AccountIdentityService } from './account-identity.service.js';

interface RequestContext {
    req: {
        user: { accountId: string; userType: string };
        ip?: string;
        headers: { 'user-agent'?: string };
    };
}

@Resolver()
@UseGuards(JwtAuthGuard)
export class AccountIdentityResolver {
    constructor(private readonly identityService: AccountIdentityService) {}

    /**
     * 修改当前用户密码
     * 注意：input 显式声明 nullable: false，与 schema.gql 中 input: ChangePasswordInput! 一致
     * 修复：@nestjs/graphql 13.4.2 默认 @Args() 为 nullable: true，导致运行时与生成的 schema 不一致
     * 限流：3 次/60 秒（防暴力修改密码）
     */
    @Mutation(() => Boolean, { description: '修改当前登录用户密码（修改后所有设备需重新登录）' })
    @Throttle({ short: { limit: 3, ttl: 60000 } })
    async changePassword(
        @Args('input', { type: () => ChangePasswordInputType, nullable: false }, new ZodArgsPipe(ChangePasswordSchema))
        input: ChangePasswordInput,
        @Context() context: RequestContext,
    ): Promise<boolean> {
        await this.identityService.changePassword({
            accountId: context.req.user.accountId,
            oldPassword: input.oldPassword,
            newPassword: input.newPassword,
            ip: context.req.ip,
            userAgent: context.req.headers['user-agent'],
        });
        return true;
    }

    /**
     * 绑定手机号到当前账户
     * 流程：调 SmsService.verifyCode 验证 → 创建 account_identity(phone) → 写审计
     * 限流：3 次/60 秒（防恶意绑定）
     */
    @Mutation(() => Boolean, { description: '绑定手机号到当前账户（需短信验证码）' })
    @Throttle({ short: { limit: 3, ttl: 60000 } })
    async bindPhone(
        @Args('input', { type: () => BindPhoneInputType, nullable: false }, new ZodArgsPipe(BindPhoneInputSchema))
        input: BindPhoneInputDto,
        @Context() context: RequestContext,
    ): Promise<boolean> {
        await this.identityService.bindPhone({
            accountId: context.req.user.accountId,
            phone: input.phone,
            code: input.code,
            ip: context.req.ip,
            userAgent: context.req.headers['user-agent'],
        });
        return true;
    }

    /**
     * 解绑手机号
     * 流程：调 SmsService.verifyCode 验证 → 安全检查（至少保留一种）→ 删除 identity → 写审计
     * 限流：3 次/60 秒（防恶意解绑）
     */
    @Mutation(() => Boolean, { description: '解绑当前账户的手机号（至少保留一种登录方式）' })
    @Throttle({ short: { limit: 3, ttl: 60000 } })
    async unbindPhone(
        @Args('input', { type: () => UnbindPhoneInputType, nullable: false }, new ZodArgsPipe(UnbindPhoneInputSchema))
        input: UnbindPhoneInputDto,
        @Context() context: RequestContext,
    ): Promise<boolean> {
        await this.identityService.unbindPhone({
            accountId: context.req.user.accountId,
            phone: input.phone,
            code: input.code,
            ip: context.req.ip,
            userAgent: context.req.headers['user-agent'],
        });
        return true;
    }
}
