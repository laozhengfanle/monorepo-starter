import { Inject, Injectable, Logger } from '@nestjs/common';
import { newId } from '@starter/server-core';
import {
  CACHE_SERVICE_TOKEN,
  type ICacheService,
} from '../../common/cache/cache.interface.js';
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
 * - revokeAccountTokens：撤销账号所有 token（tokenVersion 自增 + 写 jti='*' 通配行 + 清缓存）
 * - isRevoked：账号级 '*' 通配行快速校验（DB 唯一来源；精确 jti 撤销暂未启用）
 *
 * 两层防护（核心防御仍是 tokenVersion 自增，'*' 行是持久化兜底）：
 * 1) token_revocation 表（持久化，jti='*' 通配撤销整账号所有 token）
 * 2) account.tokenVersion（粗粒度版本号，改密/踢人后所有旧 token 失效）
 * —— refresh/JwtAuthGuard 必须先过 tokenVersion 校验，再过 isRevoked。
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(
    @Inject(CACHE_SERVICE_TOKEN) private readonly cache: ICacheService,
    private readonly prisma: PrismaService,
  ) {}

  /** 撤销账号所有 token（登出/改密/软删） */
  async revokeAccountTokens(
    accountId: string,
    reason: RevocationReason,
  ): Promise<void> {
    // 1. tokenVersion 自增：所有旧 token（payload 版本号不一致）立即失效（终局防线）
    await this.prisma.client.account.update({
      where: { id: accountId },
      data: { tokenVersion: { increment: 1 } },
    });
    // 2. 写 jti='*' 通配撤销行（持久化兜底，覆盖 tokenVersion 校验逻辑万一失守的场景）
    await this.prisma.client.tokenRevocation.create({
      data: {
        id: newId(),
        accountId,
        jti: '*',
        reason,
        expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
      },
    });
    // 3. 清该账号的 refresh token 缓存（stale 'active' 标记占位无意义）
    await this.cache.delByPattern(`auth:refresh:${accountId}:*`);
    this.logger.log(
      `账号 token 已全部撤销: accountId=${accountId} reason=${reason}`,
    );
  }

  /** jti 是否已被撤销（DB 唯一来源：精确 jti 或 '*' 通配；按 accountId 过滤避免误伤） */
  async isRevoked(jti: string, accountId: string): Promise<boolean> {
    const row = await this.prisma.client.tokenRevocation.findFirst({
      where: { jti: { in: [jti, '*'] }, accountId },
      select: { id: true },
    });
    return row !== null;
  }
}
