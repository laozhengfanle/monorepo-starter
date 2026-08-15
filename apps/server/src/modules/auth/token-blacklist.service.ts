import { Inject, Injectable, Logger } from '@nestjs/common';
import { newId } from '@starter/server-core';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** 撤销原因 — 与审计日志共享词表 */
export type RevocationReason =
  | 'password_reset'
  | 'password_changed'
  | 'account_deleted'
  | 'logout'
  | 'token_reuse'
  | 'manual';

/** refresh token 的默认 TTL（秒，7 天） */
const REFRESH_TTL = 7 * 24 * 60 * 60;

/**
 * Token 撤销中心：
 * - revokeAccountTokens：撤销账号所有 token（tokenVersion 自增 + jti='*' 通配记录 + 清缓存）
 * - revokeToken：精确撤销单个 token（jti）
 * - isRevoked：jti 黑名单快速校验（缓存优先，DB 兜底）
 *
 * 两层防护：
 * 1) token_revocation 表（持久化，精确 jti 或 '*' 通配）
 * 2) account.tokenVersion（粗粒度版本号，改密/踢人后所有旧 token 失效）
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(
    @Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService,
    private readonly prisma: PrismaService,
  ) {}

  /** 撤销账号所有 token（登出/改密/软删） */
  async revokeAccountTokens(accountId: string, reason: RevocationReason): Promise<void> {
    // 1. tokenVersion 自增：所有旧 token（payload 版本号不一致）立即失效
    await this.prisma.client.account.update({
      where: { id: accountId },
      data: { tokenVersion: { increment: 1 } },
    });
    // 2. 清该账号的 refresh token 缓存
    await this.cache.delByPattern(`auth:refresh:${accountId}:*`);
    this.logger.log(`账号 token 已全部撤销: accountId=${accountId} reason=${reason}`);
  }

  /** 精确撤销单个 token（按 jti） */
  async revokeToken(jti: string, accountId: string, reason: RevocationReason): Promise<void> {
    await this.prisma.client.tokenRevocation.create({
      data: {
        id: newId(),
        accountId,
        jti,
        reason,
        expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
      },
    });
    await this.cache.setex(`auth:revoked:${jti}`, REFRESH_TTL, '1');
  }

  /** jti 是否已被撤销（缓存优先，DB 兜底；按 accountId 过滤避免 '*' 误伤） */
  async isRevoked(jti: string, accountId: string): Promise<boolean> {
    const cached = await this.cache.get(`auth:revoked:${jti}`);
    if (cached) {
      return true;
    }
    const row = await this.prisma.client.tokenRevocation.findFirst({
      where: { jti: { in: [jti, '*'] }, accountId },
      select: { id: true },
    });
    return row !== null;
  }
}
