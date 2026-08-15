import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import type { JwtPayload } from '../auth/auth.types.js';

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
 * WebSocket JWT 校验（握手 + 消息两级）：
 * - verifyHandshake：socket.io middleware（握手前拦截，失败拒绝连接）
 * - canActivate：消息级 guard（失败抛 WsException，双保险）
 */
@Injectable()
export class WsJwtGuard {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** 握手 middleware：校验失败拒绝连接（socket.io 标准鉴权模式） */
  verifyHandshake(client: Socket, next: (err?: Error) => void): void {
    const token = extractWsToken(client);
    if (!token) {
      next(new Error('未认证或 Token 缺失'));
      return;
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        algorithms: ['HS256'],
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      client.data.user = { accountId: payload.sub, userType: payload.userType };
      next();
    } catch {
      next(new Error('Token 无效或已过期'));
    }
  }

  /** 消息级 guard（双保险，失败抛 WsException） */
  canActivate(context: { switchToWs: () => { getClient: () => Socket } }): boolean {
    const client = context.switchToWs().getClient();
    const token = extractWsToken(client);
    if (!token) {
      throw new WsException('未认证或 Token 缺失');
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        algorithms: ['HS256'],
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      client.data.user = { accountId: payload.sub, userType: payload.userType };
      return true;
    } catch {
      throw new WsException('Token 无效或已过期');
    }
  }
}
