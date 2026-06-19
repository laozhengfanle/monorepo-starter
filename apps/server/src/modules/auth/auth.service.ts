import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';
import { CACHE_KEYS } from '../../common/cache/cache-key.constants.js';
import { AccountService } from '../account/account.service.js';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service.js';
import { LoginLockIntegration } from './login-lock-integration.js';
import { TokenIssuanceService } from './token-issuance.service.js';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { hashPassword, verifyPassword } from '../../common/utils/crypto.js';

/**
 * 认证编排服务（Post-Audit Polish Task 4 重构后）
 *
 * 职责：管理员登录 / C 端短信登录 / 重置密码 / 改密
 * 组合：AccountService / LoginLockIntegration / TokenIssuanceService / TokenBlacklistService
 * 不再负责（已拆分）：JWT 签发刷新登出 → TokenIssuanceService；锁定计数 → LoginLockService；短信 → SmsService
 *
 * 错误码：20002(账号密码错) / 20003(账号不存在) / 21001(锁定/禁用) / 11002(旧密码错) / 11003(同旧密码)
 */
@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly accountService: AccountService,
        private readonly loginLock: LoginLockIntegration,
        private readonly auditService: AuditService,
        private readonly tokenIssuance: TokenIssuanceService,
        private readonly tokenBlacklist: TokenBlacklistService,
        private readonly prisma: PrismaService,
    ) {}

    /** C 端重置密码（验证码已由 SmsService 校验）。流程：查→哈希→revoke→更新→audit→清 refresh */
    async resetPassword(phone: string, newPassword: string): Promise<void> {
        const identity = await this.accountService.findByIdentity('phone', phone);
        if (!identity) {
            // 未注册静默返回（不泄露"是否已注册"）
            this.logger.warn(`[reset-password] 手机号未注册 phone=${this.maskPhone(phone)}`);
            return;
        }
        // 顺序：先 revoke 再 update（防"密码已变但 token 还在"的安全窗口）
        const hashed = await hashPassword(newPassword);
        await this.tokenBlacklist.revokeAccountTokens(identity.accountId, 'password_reset');
        await this.accountService.updateIdentityCredential(identity.id, hashed);
        await this.auditService.record({
            accountId: identity.accountId,
            action: AUDIT_ACTIONS.RESET_PASSWORD,
            resourceType: 'account_identity',
            resourceId: identity.id,
            detail: { phone: this.maskPhone(phone), source: 'member_sms' },
        });
        // 清 refresh 缓存（双保险，Redis 缓存可能与 tokenVersion 不一致）
        await this.cacheService.delByPattern(`${CACHE_KEYS.REFRESH_USED}:${identity.accountId}:*`);
    }

    /** 改密：查 username → 验旧 → 新旧不同 → 哈希+更新 → 并行清 lock + audit；revoke 后置 fire-and-forget */
    async changePassword(opts: {
        accountId: string;
        oldPassword: string;
        newPassword: string;
        ip?: string;
        userAgent?: string;
    }): Promise<{ success: true }> {
        const { accountId, oldPassword, newPassword, ip, userAgent } = opts;
        const usernameIdentity = await this.prisma.client.accountIdentity.findFirst({
            where: { accountId, identityType: 'username' },
            select: { id: true, credential: true },
        });
        if (!usernameIdentity?.credential) {
            throw new BadRequestException({ code: 20003, message: '账户不存在或未设置密码' });
        }
        if (!(await verifyPassword(oldPassword, usernameIdentity.credential))) {
            throw new BadRequestException({ code: 11002, message: '旧密码错误' });
        }
        if (await verifyPassword(newPassword, usernameIdentity.credential)) {
            throw new BadRequestException({ code: 11003, message: '新密码不能与旧密码相同' });
        }
        await this.accountService.updateIdentityCredential(usernameIdentity.id, await hashPassword(newPassword));
        // 后置撤销 token（密码已改，撤销失败不阻塞）
        this.tokenBlacklist.revokeAccountTokens(accountId, 'password_changed').catch((err) => {
            this.logger.error(
                `changePassword 后置撤销 token 失败: accountId=${accountId} err=${(err as Error).message}`,
            );
        });
        // 并行：清 loginLock + 写 audit
        await Promise.all([
            this.loginLock.clear(accountId),
            this.auditService.record({
                accountId,
                action: AUDIT_ACTIONS.PASSWORD_CHANGED,
                resourceType: 'auth',
                ip,
                userAgent,
                detail: {},
            }),
        ]);
        this.logger.log(`Password changed: accountId=${accountId}`);
        return { success: true };
    }

    /** 手机号脱敏 13800001234 → 138****1234 */
    private maskPhone(phone: string): string {
        if (phone.length !== 11) return '***';
        return phone.slice(0, 3) + '****' + phone.slice(7);
    }

    /**
     * 管理员登录：查账户 → 查锁定 → 验密码（不泄露存在性）→ 检查启用 → 签 token + 写 audit
     * @returns { accessToken, refreshToken, expiresIn, mustChangePassword }
     */
    async adminLogin(username: string, password: string, ip: string, userAgent?: string) {
        const identity = await this.accountService.findByIdentity('username', username);
        // 账号存在时检查锁定（Redis 故障时降级为 false）
        if (identity?.account && (await this.loginLock.isLocked(identity.account.id, ip))) {
            await this.writeAuthAudit(identity.account.id, ip, userAgent, AUDIT_ACTIONS.LOGIN_LOCKED, {
                reason: 'account_or_ip_locked',
            });
            throw await this.buildLockedError();
        }
        // 校验密码（不泄露账号存在性：账号不存在和密码错都返回同一提示）
        if (!identity?.account || !identity.credential) {
            throw new BadRequestException({ code: 20002, message: '用户名或密码错误' });
        }
        if (!(await verifyPassword(password, identity.credential))) {
            return this.handlePasswordFailure(identity, ip, userAgent);
        }
        if (!identity.account.enabled) {
            throw new BadRequestException({ code: 21001, message: '账号已禁用' });
        }
        // 登录成功：重置失败计数 + 更新 lastLogin
        await this.loginLock.resetOnSuccess(identity.account.id);
        const isFirstLogin = !identity.account.lastLoginAt;
        await this.accountService.updateLastLogin(identity.account.id, ip);
        // 签发双 Token（委托给 TokenIssuanceService）
        const tokens = await this.tokenIssuance.issueTokens(identity.account.id, identity.account.userType);
        await this.writeAuthAudit(identity.account.id, ip, userAgent, AUDIT_ACTIONS.LOGIN_SUCCESS, {
            identityType: 'username',
            identifier: username,
        });
        return { ...tokens, mustChangePassword: isFirstLogin };
    }

    /** 密码错误处理：记录失败 + 写 audit + 抛错（锁定时抛 21001；否则 20002） */
    private async handlePasswordFailure(
        identity: { account: { id: string } },
        ip: string,
        userAgent?: string,
    ): Promise<never> {
        const { locked } = await this.loginLock.recordFailure(identity.account.id, ip);
        await this.writeAuthAudit(identity.account.id, ip, userAgent, AUDIT_ACTIONS.LOGIN_FAILED, {
            reason: 'wrong_password',
        });
        if (locked) throw await this.buildLockedError();
        throw new BadRequestException({ code: 20002, message: '用户名或密码错误' });
    }

    /** 构造锁定异常（含锁定分钟数提示） */
    private async buildLockedError(): Promise<BadRequestException> {
        const minutes = await this.loginLock.getLockDurationMinutes();
        return new BadRequestException({ code: 21001, message: `账号已锁定，请 ${minutes} 分钟后重试` });
    }

    /**
     * C 端短信登录（验证码已由 SmsService 校验）：查/建账户 → 检查启用 → 更新 lastLogin → 签 token + 写 audit
     * @returns { accessToken, refreshToken, expiresIn, isNewUser }
     */
    async memberSmsLogin(phone: string, ip: string, userAgent?: string) {
        const identity = await this.accountService.findByIdentity('phone', phone);
        // 老用户 / 新用户自动注册
        let accountId: string;
        let isNewUser = false;
        if (identity?.account) {
            if (!identity.account.enabled) {
                throw new BadRequestException({ code: 21001, message: '账号已禁用' });
            }
            accountId = identity.account.id;
        } else {
            const account = await this.accountService.createMemberAccount(phone);
            accountId = account.id;
            isNewUser = true;
        }
        await this.accountService.updateLastLogin(accountId, ip);
        // 签发双 Token（委托给 TokenIssuanceService）
        const tokens = await this.tokenIssuance.issueTokens(accountId, 'member');
        await this.writeAuthAudit(accountId, ip, userAgent, AUDIT_ACTIONS.LOGIN_SUCCESS, {
            identityType: 'phone',
            identifier: phone,
            isNewUser,
        });
        return { ...tokens, isNewUser };
    }

    /** 写认证相关 audit log（resourceType 固定为 'auth'，简化调用方） */
    private writeAuthAudit(
        accountId: string,
        ip: string,
        userAgent: string | undefined,
        action: string,
        detail: Record<string, unknown>,
    ) {
        return this.auditService.record({ accountId, action, resourceType: 'auth', ip, userAgent, detail });
    }
}
