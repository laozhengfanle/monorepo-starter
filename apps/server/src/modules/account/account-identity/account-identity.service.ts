/**
 * 账户身份认证服务
 *
 * 业务能力：
 * - 修改密码（验证旧密码 → 更新新密码 → 失效所有 refresh token）
 * - 绑定手机号（验证码 → 创建 account_identity(phone) → 写审计）
 * - 解绑手机号（验证码 → 安全检查 → 删除 account_identity(phone) → 写审计）
 *
 * 关联模块（注入）：
 * - SmsService：发送 / 验证手机号验证码
 */
import { Inject, Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../../common/cache/cache.interface.js';
import { CACHE_KEYS } from '../../../common/cache/cache-key.constants.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { hashPassword, verifyPassword } from '../../../common/utils/crypto.js';
import { AuditService, AUDIT_ACTIONS } from '../../audit/audit.service.js';
import { SmsService } from '../../../common/sms/sms.service.js';
import { TokenBlacklistService } from '../../../common/services/token-blacklist.service.js';
import { newId } from '@packages/shared';

/** 密码策略：8-32 字符，至少含一个大写字母、一个小写字母、一个数字 */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 32;
/** 密码复杂度正则：至少一个大写字母 + 一个小写字母 + 一个数字 */
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,32}$/;
/** 密码修改频率限制：60 秒内只能修改一次 */
const PASSWORD_CHANGE_TTL = 60;

@Injectable()
export class AccountIdentityService {
    private readonly logger = new Logger(AccountIdentityService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly auditService: AuditService,
        private readonly smsService: SmsService,
        private readonly tokenBlacklist: TokenBlacklistService,
    ) {}

    /**
     * 修改密码
     *
     * 流程：
     * 1. 查找账户身份记录
     * 2. 验证旧密码（先验证旧密码，避免通过格式校验探测密码策略）
     * 3. 校验新密码强度（长度 + 复杂度正则）
     * 4. 哈希新密码 + 更新到 DB
     * 5. 失效该账户所有 refresh token（强制下次重新登录）
     * 6. 写审计日志
     *
     * 安全：
     * - 新密码不能与旧密码相同
     * - 修改后所有设备需要重新登录（refresh token 全清）
     * - 60 秒内只允许修改一次密码（防暴力修改）
     */
    async changePassword(opts: {
        accountId: string;
        oldPassword: string;
        newPassword: string;
        ip?: string;
        userAgent?: string;
    }): Promise<{ success: true }> {
        const { accountId, oldPassword, newPassword, ip, userAgent } = opts;

        /** 1. 查找账户的身份认证记录（先查身份，避免通过错误码差异泄露账户存在性） */
        const identity = await this.prisma.client.accountIdentity.findFirst({
            where: { accountId, identityType: 'username' },
        });
        if (!identity || !identity.credential) {
            throw new UnauthorizedException({ code: 20003, message: '账户不存在或未设置密码' });
        }

        /** 2. 验证旧密码（必须在格式校验之前，避免攻击者通过格式错误差异探测密码策略） */
        const oldMatch = await verifyPassword(oldPassword, identity.credential);
        if (!oldMatch) {
            throw new BadRequestException({ code: 11002, message: '旧密码错误' });
        }

        /** 3. 修改密码频率限制（防暴力修改，60 秒内只能改一次） */
        const rateLimitKey = `${CACHE_KEYS.LOGIN_LOCK}:password_change:${accountId}`;
        const recentChange = await this.cacheService.exists(rateLimitKey);
        if (recentChange) {
            throw new BadRequestException({ code: 11004, message: '修改太频繁，请 60 秒后重试' });
        }

        /** 4. 校验新密码长度 */
        if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
            throw new BadRequestException({
                code: 11001,
                message: `新密码长度需在 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 字符之间`,
            });
        }

        /** 5. 校验新密码复杂度：至少含一个大写字母、一个小写字母、一个数字 */
        if (!PASSWORD_COMPLEXITY_REGEX.test(newPassword)) {
            throw new BadRequestException({
                code: 11005,
                message: '新密码需包含大写字母、小写字母和数字',
            });
        }

        /** 6. 新密码不能与旧密码相同（用 verifyPassword 比较明文，bcrypt 哈希每次不同） */
        const sameAsOld = await verifyPassword(newPassword, identity.credential);
        if (sameAsOld) {
            throw new BadRequestException({ code: 11003, message: '新密码不能与旧密码相同' });
        }

        /** 7. 哈希新密码并更新 */
        const newHash = await hashPassword(newPassword);
        await this.prisma.client.accountIdentity.update({
            where: { id: identity.id },
            data: { credential: newHash },
        });

        /** 8. 设置频率限制标记 */
        await this.cacheService.setex(rateLimitKey, PASSWORD_CHANGE_TTL, '1');

        /** 9. 失效所有 refresh token（强制重新登录）+ 自增 tokenVersion */
        await this.cacheService.delByPattern(`${CACHE_KEYS.REFRESH_USED}:${accountId}:*`);
        await this.cacheService.del(`${CACHE_KEYS.REFRESH_FAMILY}:${accountId}`);
        await this.tokenBlacklist.revokeAccountTokens(accountId, 'password_changed');

        /** 10. 写审计日志
         *
         * 使用细粒度 PASSWORD_CHANGED：审计要能精确回答"谁在何时改了密码"
         * 注意：这里不记旧密码/新密码（即使加密也不记），避免敏感数据进入审计日志
         * accountId 字段已能唯一标识是谁改的
         */
        await this.auditService.record({
            accountId,
            action: AUDIT_ACTIONS.PASSWORD_CHANGED,
            resourceType: 'auth',
            ip,
            userAgent,
            detail: {},
        });

        this.logger.log(`Password changed: accountId=${accountId}`);

        return { success: true };
    }

    /**
     * 绑定手机号到当前账户
     *
     * 流程：
     * 1. 验证手机号格式（Zod 校验在 resolver 层完成）
     * 2. 调 SmsService.verifyCode 校验验证码（错误会自动抛 30001-30005）
     * 3. 检查该手机号是否已被其他账户绑定 → 40003
     * 4. 检查当前账户是否已绑定该手机号 → 40004
     * 5. 创建 account_identity(phone)
     * 6. 写审计日志
     */
    async bindPhone(opts: {
        accountId: string;
        phone: string;
        code: string;
        ip?: string;
        userAgent?: string;
    }): Promise<{ success: true }> {
        const { accountId, phone, code, ip, userAgent } = opts;

        /** 1. 验证手机验证码（错误码由 SmsService 抛 30001-30005） */
        await this.smsService.verifyCode(phone, code, 'bind_phone');

        /** 2. 检查该手机号是否已被其他账户绑定 */
        const existing = await this.prisma.client.accountIdentity.findFirst({
            where: { identityType: 'phone', identifier: phone },
        });
        if (existing) {
            if (existing.accountId === accountId) {
                throw new BadRequestException({ code: 40004, message: '该手机号已绑定到当前账户' });
            }
            throw new BadRequestException({ code: 40003, message: '该手机号已被其他账户绑定' });
        }

        /** 3. 创建 account_identity(phone) */
        await this.prisma.client.accountIdentity.create({
            data: {
                id: newId(),
                accountId,
                identityType: 'phone',
                identifier: phone,
                verified: true,
                verifiedAt: new Date(),
            },
        });

        /** 4. 写审计日志 */
        await this.auditService.record({
            accountId,
            action: AUDIT_ACTIONS.PHONE_BIND,
            resourceType: 'auth',
            ip,
            userAgent,
            detail: { phone: phone.slice(0, 3) + '****' + phone.slice(-4) },
        });

        this.logger.log(`Phone bound: accountId=${accountId} phone=${phone.slice(0, 3)}****${phone.slice(-4)}`);

        return { success: true };
    }

    /**
     * 解绑手机号
     *
     * 流程：
     * 1. 验证手机验证码
     * 2. 安全检查：解绑后必须仍保留至少一种登录方式 → 40005
     * 3. 删除 account_identity(phone)
     * 4. 写审计日志
     */
    async unbindPhone(opts: {
        accountId: string;
        phone: string;
        code: string;
        ip?: string;
        userAgent?: string;
    }): Promise<{ success: true }> {
        const { accountId, phone, code, ip, userAgent } = opts;

        /** 1. 验证手机验证码 */
        await this.smsService.verifyCode(phone, code, 'unbind_phone');

        /** 2. 查找该 phone identity */
        const identity = await this.prisma.client.accountIdentity.findFirst({
            where: { accountId, identityType: 'phone', identifier: phone },
        });
        if (!identity) {
            throw new BadRequestException({ code: 40001, message: '该手机号未绑定到当前账户' });
        }

        /** 3. 安全检查：解绑后至少保留一种登录方式 */
        const remainingIdentities = await this.prisma.client.accountIdentity.count({
            where: { accountId, NOT: { id: identity.id } },
        });
        if (remainingIdentities === 0) {
            throw new BadRequestException({ code: 40005, message: '至少保留一种登录方式' });
        }

        /** 4. 删除 identity */
        await this.prisma.client.accountIdentity.delete({ where: { id: identity.id } });

        /** 5. 写审计日志 */
        await this.auditService.record({
            accountId,
            action: AUDIT_ACTIONS.PHONE_UNBIND,
            resourceType: 'auth',
            ip,
            userAgent,
            detail: { phone: phone.slice(0, 3) + '****' + phone.slice(-4) },
        });

        this.logger.log(`Phone unbound: accountId=${accountId} phone=${phone.slice(0, 3)}****${phone.slice(-4)}`);

        return { success: true };
    }
}
