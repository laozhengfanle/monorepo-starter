import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { BizException } from '@starter/server-core';
import {
  ChangePasswordSchema,
  LoginSchema,
  UpdateSelfSchema,
} from '@starter/contracts';
import type {
  AdminMe,
  ChangePasswordInput,
  LoginInput,
  UpdateSelfInput,
} from '@starter/contracts';
import bcrypt from 'bcrypt';
import type { Counter } from 'prom-client';
import type { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { resolveAccountPermissions } from './account-permission.util.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { LoginLockService } from './login-lock.service.js';
import {
  TokenIssuanceService,
  type IssuedTokens,
} from './token-issuance.service.js';
import { TurnstileService } from '../turnstile/turnstile.service.js';
import { buildMenuTree } from '../admin-menu/menu-tree.util.js';

const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
const ACCOUNT_DISABLED = 'ACCOUNT_DISABLED';
const ACCOUNT_LOCKED = 'ACCOUNT_LOCKED';

/**
 * 从请求提取客户端信息（审计用）。
 * IP 提取安全策略：
 * - 优先 req.ip：Express 在 trust proxy 开启时已从受信 X-Forwarded-For 解析出真实客户端 IP；
 *   未开启时 req.ip 即直连地址，均不受客户端伪造 XFF 影响
 * - 回退 req.socket.remoteAddress（socket 层地址，永远不可伪造）
 * - 不再手写解析 x-forwarded-for 首段（可被客户端任意伪造，导致 IP 锁定/限流被绕过）
 */
export function clientInfo(req: Request): { ip: string; userAgent?: string } {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
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
    private readonly turnstile: TurnstileService,
    @InjectMetric('auth_login_success_total')
    private readonly loginSuccessCounter: Counter<string>,
  ) {}

  async adminLogin(input: LoginInput, req: Request): Promise<IssuedTokens> {
    const data = LoginSchema.parse(input);
    const { ip, userAgent } = clientInfo(req);

    // Turnstile 人机验证（未启用时自动跳过）
    await this.turnstile.verify(data.turnstileToken, ip);

    const identity = await this.prisma.client.accountIdentity.findUnique({
      where: {
        identityType_identifier: {
          identityType: 'username',
          identifier: data.username,
        },
      },
      include: { account: true },
    });

    // 锁定检查（账号存在时）
    if (
      identity?.account &&
      (await this.loginLock.isLocked(identity.account.id, ip))
    ) {
      await this.audit.write({
        accountId: identity.account.id,
        action: AUDIT_ACTIONS.LOGIN_LOCKED,
        detail: { reason: 'account_or_ip_locked' },
        ip,
        userAgent,
      });
      throw new BizException({
        code: ACCOUNT_LOCKED,
        message: '登录失败次数过多，账号已锁定，请稍后再试',
      });
    }

    // 不泄露账号存在性：账号不存在与密码错误返回同一提示
    if (!identity?.credential || !identity.account) {
      throw new BizException({
        code: INVALID_CREDENTIALS,
        message: '用户名或密码错误',
      });
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
      // 携带剩余可尝试次数（登录框提示）；达到 0 后下次登录将被锁定
      const remaining = await this.loginLock.getRemainingAttempts(
        identity.account.id,
      );
      throw new BizException({
        code: INVALID_CREDENTIALS,
        message: '用户名或密码错误',
        details: { remainingAttempts: [String(remaining)] },
      });
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
    return this.tokenIssuance.issueTokens(
      identity.accountId,
      identity.account.userType,
    );
  }

  /** 刷新 token（refresh → 新双 token；成功/重用均写审计） */
  async refresh(refreshToken: string, req?: Request): Promise<IssuedTokens> {
    const info = req ? clientInfo(req) : undefined;
    return this.tokenIssuance.refresh(refreshToken, info);
  }

  /** 登出：撤销账号所有 token + 审计 */
  async logout(accountId: string, req: Request): Promise<void> {
    const { ip, userAgent } = clientInfo(req);
    await this.tokenIssuance.logout(accountId);
    await this.audit.write({
      accountId,
      action: AUDIT_ACTIONS.LOGOUT,
      ip,
      userAgent,
    });
  }

  /** 当前登录账户信息（profile + 角色 + 权限点 + 可访问菜单树） */
  async me(accountId: string): Promise<AdminMe> {
    const account = await this.prisma.client.account.findUnique({
      where: { id: accountId },
      include: {
        adminProfile: true,
        adminRoles: {
          include: {
            role: { include: { roleMenus: { include: { menu: true } } } },
          },
        },
      },
    });
    if (!account) {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在',
      });
    }

    const identity = await this.prisma.client.accountIdentity.findFirst({
      where: { accountId, identityType: 'username' },
      select: { identifier: true },
    });

    const isSuperAdmin = account.adminRoles.some(
      (r) => r.role.code === 'super_admin',
    );
    // 聚合权限点：角色基线 + 账户级特例授权覆盖（与 PermissionGuard 共用同一逻辑，保证前后端一致）
    const permissionSet = await resolveAccountPermissions(this.prisma, account);
    // 菜单树：与权限同一张表；超管全量下发，其余按权限裁剪（目录经祖先链自动保留）。
    // 侧栏只需 directory + menu（按钮权限点在 permissions 数组里，不进树）
    const menuRows = await this.prisma.client.adminMenu.findMany({
      where: {
        enabled: true,
        visible: true,
        type: { in: ['directory', 'menu'] },
      },
      orderBy: { sort: 'asc' },
    });
    const menus = buildMenuTree(menuRows, isSuperAdmin ? null : permissionSet);

    return {
      accountId: account.id,
      username: identity?.identifier ?? '',
      nickname: account.adminProfile?.nickname ?? '',
      avatar: account.adminProfile?.avatar ?? '',
      email: account.adminProfile?.email ?? '',
      phone: account.adminProfile?.phone ?? '',
      createdAt: account.createdAt.toISOString(),
      roleCodes: account.adminRoles.map((r) => r.role.code).sort(),
      permissions: [...permissionSet].sort(),
      menus,
    };
  }

  /** 个人中心：更新自己的资料（仅本人，profile 字段） */
  async updateSelf(
    accountId: string,
    input: UpdateSelfInput,
  ): Promise<AdminMe> {
    const data = UpdateSelfSchema.parse(input);
    const account = await this.prisma.client.account.findUnique({
      where: { id: accountId },
      include: { adminProfile: true },
    });
    if (!account || !account.adminProfile) {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在',
      });
    }
    await this.prisma.client.adminProfile.update({
      where: { accountId },
      data: {
        ...(data.nickname !== undefined ? { nickname: data.nickname } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
      },
    });
    // 审计：个人资料更新（词表无 PROFILE_UPDATED，复用 ACCOUNT_UPDATED，resourceType 默认映射 admin_account）
    await this.audit.write({
      accountId,
      action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
      resourceId: accountId,
      detail: { accountId, updatedFields: Object.keys(data) },
    });
    return this.me(accountId);
  }

  /** 个人中心：修改密码（校验当前密码 → 更新 hash → 撤销全部 token → 审计） */
  async changePassword(
    accountId: string,
    input: ChangePasswordInput,
    req: Request,
  ): Promise<void> {
    const data = ChangePasswordSchema.parse(input);
    const { ip, userAgent } = clientInfo(req);
    const identity = await this.prisma.client.accountIdentity.findFirst({
      where: { accountId, identityType: 'username' },
    });
    if (!identity) {
      throw new BizException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '账户不存在',
      });
    }
    const valid = await bcrypt.compare(
      data.currentPassword,
      identity.credential ?? '',
    );
    if (!valid) {
      throw new BizException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: '当前密码不正确',
      });
    }
    const newHash = await bcrypt.hash(data.newPassword, 10);
    await this.prisma.client.accountIdentity.update({
      where: { id: identity.id },
      data: { credential: newHash },
    });
    // 密码已变：撤销该账户所有已签发 token（tokenVersion 自增），强制重新登录
    await this.tokenIssuance.logout(accountId);
    // 审计：密码修改成功（账号身份变更；审计写入容错，失败不阻塞）
    await this.audit.write({
      accountId,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      resourceId: accountId,
      ip,
      userAgent,
    });
  }
}
