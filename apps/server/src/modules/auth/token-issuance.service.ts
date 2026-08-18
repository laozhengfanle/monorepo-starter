import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  CACHE_SERVICE_TOKEN,
  type ICacheService,
} from '../../common/cache/cache.interface.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import type { JwtPayload } from './auth.types.js';

/** refresh token 默认 TTL（秒，7 天） */
const REFRESH_TTL = 7 * 24 * 60 * 60;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** access token 过期时间（秒） */
  expiresIn: number;
}

/** 客户端网络信息（refresh 审计用，可选） */
export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

/**
 * Token 签发与刷新：
 * - issueTokens：签发双 token（access 15min + refresh 7d），payload 带 tokenVersion + jti；
 *   顺带清理该账号历史 '*' 撤销行（避免登出后 stale '*' 误伤新会话）
 * - refresh：校验 refresh token → 账户有效 + tokenVersion 一致（与 JwtAuthGuard 对齐）
 *   → 黑名单 → reuse 检测 → 签发新双 token
 *   - 成功写审计 TOKEN_REFRESHED；复用检测命中写审计 TOKEN_REUSED（安全事件，先记后撤）
 * - logout：撤销账号所有 token（tokenVersion 自增 + 写 '*' 撤销行）
 */
@Injectable()
export class TokenIssuanceService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService,
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly audit: AuditService,
  ) {}

  async issueTokens(
    accountId: string,
    userType: string,
  ): Promise<IssuedTokens> {
    const account = await this.prisma.client.account.findUnique({
      where: { id: accountId },
      select: { tokenVersion: true },
    });
    const tokenVersion = account?.tokenVersion ?? 0;
    const jti = randomUUID();
    const payload: JwtPayload = { sub: accountId, userType, tokenVersion, jti };

    const accessTtl = this.configService.get<number>('JWT_ACCESS_TTL') ?? 900;
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessTtl,
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: REFRESH_TTL,
    });

    // refresh token 不预占 auth:refresh:{accountId}:{hash} 键——
    // refresh() 用 setnx 原子认领（key 不存在才成功），预占会令首次 refresh 必失败。
    // 登出/撤销时 delByPattern 清理 setnx 留下的 'used' 标记。

    // 清除该账号历史 '*' 撤销行（登出/改密后写入，新登录即清理，
    // 否则 stale '*' 会误伤新会话的 refresh——与 tokenVersion++ 配合实现"撤销 → 重登"闭环）
    await this.prisma.client.tokenRevocation.deleteMany({
      where: { accountId, jti: '*' },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  /** 刷新 token：校验签名 → 账户有效性 + tokenVersion → 黑名单 → reuse 检测 → 签发新双 token */
  async refresh(
    oldRefreshToken: string,
    clientInfo?: ClientInfo,
  ): Promise<IssuedTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(oldRefreshToken);
    } catch {
      throw new UnauthorizedException('Refresh Token 无效或已过期');
    }
    if (!payload.jti || !payload.sub) {
      throw new UnauthorizedException('Refresh Token 无效');
    }
    // 1. 账户存在 + 启用 + tokenVersion 一致（与 JwtAuthGuard 对齐，关闭 S1 漏洞：
    //    登出/改密后旧 refresh 仅靠 isRevoked 拦截不够，tokenVersion 自增才是终局防线）
    const account = await this.prisma.client.account.findUnique({
      where: { id: payload.sub },
      select: { enabled: true, tokenVersion: true },
    });
    if (!account || !account.enabled) {
      throw new UnauthorizedException('账户不存在或已禁用');
    }
    if ((payload.tokenVersion ?? 0) !== account.tokenVersion) {
      throw new UnauthorizedException('Token 已失效，请重新登录');
    }
    // 2. 黑名单（账号级 '*' 通配 / 精确 jti）
    if (await this.tokenBlacklist.isRevoked(payload.jti, payload.sub)) {
      throw new UnauthorizedException('Refresh Token 已撤销');
    }
    // 3. reuse 检测：SET NX 原子认领 —— 仅当 key 不存在（从未使用过）时认领成功并标记为 used；
    // 并发刷新时只有一个请求能认领成功，其余视为重用，杜绝 get→set 两步竞态导致的双签
    const claimed = await this.cache.setnx(
      `auth:refresh:${payload.sub}:${this.hash(oldRefreshToken)}`,
      'used',
      REFRESH_TTL,
    );
    if (!claimed) {
      // 认领失败（token 已被使用/并发重放）→ 疑似重用，先审计后撤销账号所有 token
      await this.audit.write({
        accountId: payload.sub,
        action: AUDIT_ACTIONS.TOKEN_REUSED,
        detail: { jti: payload.jti },
        ip: clientInfo?.ip,
        userAgent: clientInfo?.userAgent,
      });
      await this.tokenBlacklist.revokeAccountTokens(payload.sub, 'token_reuse');
      throw new UnauthorizedException('Refresh Token 已被使用，请重新登录');
    }
    // 认领成功：签发新双 token
    const tokens = await this.issueTokens(payload.sub, payload.userType);
    await this.audit.write({
      accountId: payload.sub,
      action: AUDIT_ACTIONS.TOKEN_REFRESHED,
      detail: { jti: payload.jti },
      ip: clientInfo?.ip,
      userAgent: clientInfo?.userAgent,
    });
    return tokens;
  }

  /** 登出：撤销账号所有 token */
  async logout(accountId: string): Promise<void> {
    await this.tokenBlacklist.revokeAccountTokens(accountId, 'logout');
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
