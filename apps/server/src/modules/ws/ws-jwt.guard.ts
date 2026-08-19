import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthAccount, JwtPayload } from '../auth/auth.types.js';
import { TokenBlacklistService } from '../auth/token-blacklist.service.js';

/**
 * 从 socket handshake 提取 token（优先 auth.token，回退 Authorization header）
 */
export function extractWsToken(client: Socket): string | null {
  const authToken = client.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken) {
    return authToken;
  }
  const header = client.handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

/**
 * WebSocket JWT 校验（握手 + 消息两级），校验强度与 HTTP JwtAuthGuard 对齐：
 * 1. 验签（HS256）
 * 2. 账户存在 + enabled + tokenVersion 与 payload 一致（改密/踢人后旧 token 失效）
 * 3. jti 不在黑名单（精确撤销 / '*' 账号全量）
 * - verifyHandshake：socket.io middleware（握手前拦截，失败拒绝连接）
 * - canActivate：消息级 guard（失败抛 WsException，双保险）
 */
@Injectable()
export class WsJwtGuard {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  /** 握手 middleware：校验失败拒绝连接（socket.io 标准鉴权模式） */
  async verifyHandshake(
    client: Socket,
    next: (err?: Error) => void,
  ): Promise<void> {
    const token = extractWsToken(client);
    if (!token) {
      next(new Error('未认证或 Token 缺失'));
      return;
    }
    try {
      client.data.account = await this.resolveAccount(token);
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error('Token 无效或已过期'));
    }
  }

  /** 消息级 guard（双保险，失败抛 WsException） */
  async canActivate(context: {
    switchToWs: () => { getClient: () => Socket };
  }): Promise<boolean> {
    const client = context.switchToWs().getClient();
    return this.validateClient(client);
  }

  /**
   * 对单个 socket 重新校验（消息级 guard 与 gateway 周期复核共用）：
   * token 撤销/账户禁用/tokenVersion 变更后，已连接 socket 通过此方法失效。
   * 失败抛 WsException，调用方自行决定断开或拒绝消息。
   */
  async validateClient(client: Socket): Promise<boolean> {
    const token = extractWsToken(client);
    if (!token) {
      throw new WsException('未认证或 Token 缺失');
    }
    try {
      client.data.account = await this.resolveAccount(token);
      return true;
    } catch (err) {
      throw new WsException(
        err instanceof Error ? err.message : 'Token 无效或已过期',
      );
    }
  }

  /**
   * 验签 + 账户态校验（与 JwtAuthGuard 同一套语义）：
   * 签名 → 账户存在/启用 → tokenVersion 一致 → jti 未撤销。
   * 校验通过返回挂到 client.data.account 的认证信息。
   */
  private async resolveAccount(token: string): Promise<AuthAccount> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        algorithms: ['HS256'],
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new Error('Token 无效或已过期');
    }
    if (!payload.sub || !payload.userType) {
      throw new Error('无效的 Token');
    }

    // 1. 账户存在 + 启用 + tokenVersion 一致（改密/踢人后旧 token 失效）
    const account = await this.prisma.client.account.findUnique({
      where: { id: payload.sub },
      select: { enabled: true, tokenVersion: true },
    });
    if (!account || !account.enabled) {
      throw new Error('账户不存在或已禁用');
    }
    if ((payload.tokenVersion ?? 0) !== account.tokenVersion) {
      throw new Error('Token 已失效，请重新登录');
    }

    // 2. jti 黑名单（精确撤销 / '*' 账号全量）
    if (
      payload.jti &&
      (await this.tokenBlacklist.isRevoked(payload.jti, payload.sub))
    ) {
      throw new Error('Token 已撤销，请重新登录');
    }

    return { accountId: payload.sub, userType: payload.userType };
  }
}
