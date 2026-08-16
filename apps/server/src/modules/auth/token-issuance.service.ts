import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';
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
 * - issueTokens：签发双 token（access 15min + refresh 7d），payload 带 tokenVersion + jti
 * - refresh：校验 refresh token → reuse 检测 → 签发新双 token
 *   - 成功写审计 TOKEN_REFRESHED；复用检测命中写审计 TOKEN_REUSED（安全事件，先记后撤）
 * - logout：撤销账号所有 token（tokenVersion 自增）
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

  async issueTokens(accountId: string, userType: string): Promise<IssuedTokens> {
    const account = await this.prisma.client.account.findUnique({
      where: { id: accountId },
      select: { tokenVersion: true },
    });
    const tokenVersion = account?.tokenVersion ?? 0;
    const jti = randomUUID();
    const payload: JwtPayload = { sub: accountId, userType, tokenVersion, jti };

    const accessTtl = this.configService.get<number>('JWT_ACCESS_TTL') ?? 900;
    const accessToken = await this.jwtService.signAsync(payload, { expiresIn: accessTtl });
    const refreshToken = await this.jwtService.signAsync(payload, { expiresIn: REFRESH_TTL });

    // refresh token 状态缓存（reuse 检测）：active 表示可用
    await this.cache.setex(`auth:refresh:${accountId}:${this.hash(refreshToken)}`, REFRESH_TTL, 'active');

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  /** 刷新 token：校验签名 → 黑名单 → reuse 检测 → 签发新双 token（成功/重用均写审计） */
  async refresh(oldRefreshToken: string, clientInfo?: ClientInfo): Promise<IssuedTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(oldRefreshToken);
    } catch {
      throw new UnauthorizedException('Refresh Token 无效或已过期');
    }
    if (!payload.jti || !payload.sub) {
      throw new UnauthorizedException('Refresh Token 无效');
    }
    // 黑名单（jti 精确撤销 / '*' 账号全量）
    if (await this.tokenBlacklist.isRevoked(payload.jti, payload.sub)) {
      throw new UnauthorizedException('Refresh Token 已撤销');
    }
    // reuse 检测：refresh token 只能使用一次
    const state = await this.cache.get<string>(`auth:refresh:${payload.sub}:${this.hash(oldRefreshToken)}`);
    if (state !== 'active') {
      // token 已被使用或不存在 → 疑似重用，先审计后撤销账号所有 token
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
    // 标记为 used，再签发新双 token
    await this.cache.setex(`auth:refresh:${payload.sub}:${this.hash(oldRefreshToken)}`, REFRESH_TTL, 'used');
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
