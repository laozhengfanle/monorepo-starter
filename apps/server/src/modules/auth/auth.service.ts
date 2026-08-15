import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { BizException } from '@starter/server-core';
import { LoginSchema } from '@starter/contracts';
import type { AdminMe, LoginInput } from '@starter/contracts';
import bcrypt from 'bcrypt';
import type { Counter } from 'prom-client';
import type { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { LoginLockService } from './login-lock.service.js';
import { TokenIssuanceService, type IssuedTokens } from './token-issuance.service.js';

const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
const ACCOUNT_DISABLED = 'ACCOUNT_DISABLED';
const ACCOUNT_LOCKED = 'ACCOUNT_LOCKED';

/** 从请求提取客户端信息（审计用） */
function clientInfo(req: Request): { ip: string; userAgent?: string } {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.ip ??
    '';
  return { ip, userAgent: req.headers['user-agent'] };
}

/**
 * 认证服务（阶段 3 增强）：
 * - adminLogin：登录锁定 → bcrypt 校验 → 双 token 签发 → 审计
 * - refresh：刷新 token
 * - logout：撤销账号所有 token + 审计
 * - me：当前账户信息
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenIssuance: TokenIssuanceService,
    private readonly loginLock: LoginLockService,
    private readonly audit: AuditService,
    @InjectMetric('auth_login_success_total')
    private readonly loginSuccessCounter: Counter<string>,
  ) {}

  async adminLogin(input: LoginInput, req: Request): Promise<IssuedTokens> {
    const data = LoginSchema.parse(input);
    const { ip, userAgent } = clientInfo(req);

    const identity = await this.prisma.client.accountIdentity.findUnique({
      where: {
        identityType_identifier: { identityType: 'username', identifier: data.username },
      },
      include: { account: true },
    });

    // 锁定检查（账号存在时）
    if (identity?.account && (await this.loginLock.isLocked(identity.account.id, ip))) {
      await this.audit.write({
        accountId: identity.account.id,
        action: AUDIT_ACTIONS.LOGIN_LOCKED,
        detail: { reason: 'account_or_ip_locked' },
        ip,
        userAgent,
      });
      throw new BizException({ code: ACCOUNT_LOCKED, message: '登录失败次数过多，请稍后再试' });
    }

    // 不泄露账号存在性：账号不存在与密码错误返回同一提示
    if (!identity?.credential || !identity.account) {
      throw new BizException({ code: INVALID_CREDENTIALS, message: '用户名或密码错误' });
    }
    const passwordOk = await bcrypt.compare(data.password, identity.credential);
    if (!passwordOk) {
      await this.loginLock.recordFailure(identity.account.id, ip);
      await this.audit.write({
        accountId: identity.account.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        detail: { reason: 'wrong_password', identifier: data.username },
        ip,
        userAgent,
      });
      throw new BizException({ code: INVALID_CREDENTIALS, message: '用户名或密码错误' });
    }
    if (!identity.account.enabled) {
      throw new BizException({ code: ACCOUNT_DISABLED, message: '账号已禁用' });
    }

    // 登录成功：清零失败计数 + 更新 lastLogin + 审计
    await this.loginLock.resetOnSuccess(identity.account.id, ip);
    await this.prisma.client.account.update({
      where: { id: identity.accountId },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.write({
      accountId: identity.account.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      detail: { identityType: 'username', identifier: data.username },
      ip,
      userAgent,
    });
    // Prometheus 业务指标：登录成功计数
    this.loginSuccessCounter.inc();

    // 签发双 token（access + refresh，payload 带 tokenVersion + jti）
    return this.tokenIssuance.issueTokens(identity.accountId, identity.account.userType);
  }

  /** 刷新 token（refresh → 新双 token） */
  async refresh(refreshToken: string): Promise<IssuedTokens> {
    return this.tokenIssuance.refresh(refreshToken);
  }

  /** 登出：撤销账号所有 token + 审计 */
  async logout(accountId: string, req: Request): Promise<void> {
    const { ip, userAgent } = clientInfo(req);
    await this.tokenIssuance.logout(accountId);
    await this.audit.write({ accountId, action: AUDIT_ACTIONS.LOGOUT, ip, userAgent });
  }

  /** 当前登录账户信息（profile + 角色） */
  async me(accountId: string): Promise<AdminMe> {
    const account = await this.prisma.client.account.findUnique({
      where: { id: accountId },
      include: {
        adminProfile: true,
        adminRoles: {
          include: { role: { include: { roleMenus: { include: { menu: true } } } } },
        },
      },
    });
    if (!account) {
      throw new BizException({ code: 'ACCOUNT_NOT_FOUND', message: '账户不存在' });
    }

    const identity = await this.prisma.client.accountIdentity.findFirst({
      where: { accountId, identityType: 'username' },
      select: { identifier: true },
    });

    return {
      accountId: account.id,
      username: identity?.identifier ?? '',
      nickname: account.adminProfile?.nickname ?? '',
      avatar: account.adminProfile?.avatar ?? '',
      roleCodes: account.adminRoles.map((r) => r.role.code).sort(),
      // 聚合权限点：角色 → roleMenus → menu.code（去重排序）
      permissions: [
        ...new Set(
          account.adminRoles.flatMap((r) =>
            r.role.roleMenus.filter((rm) => rm.menu.enabled).map((rm) => rm.menu.code),
          ),
        ),
      ].sort(),
    };
  }
}
