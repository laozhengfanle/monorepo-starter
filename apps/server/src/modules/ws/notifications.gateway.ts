import { Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { WsJwtGuard } from './ws-jwt.guard.js';

interface WsUser {
  accountId: string;
  userType: string;
}

/** 默认放行 admin 开发地址（与 app-setup.ts 的 HTTP CORS 默认值一致） */
const DEFAULT_WS_CORS_ORIGINS = ['http://localhost:3302'];

/**
 * WS CORS 白名单：显式读取 CORS_ORIGINS 环境变量（逗号分隔），
 * 未配置时回退默认开发地址。禁止 '*' + credentials（浏览器凭证请求
 * 必须匹配具体 origin，通配符会静默降级且属于安全反模式）。
 */
function wsCorsOriginsFromEnv(): string[] {
  const raw = process.env['CORS_ORIGINS'];
  if (!raw) {
    return DEFAULT_WS_CORS_ORIGINS;
  }
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_WS_CORS_ORIGINS;
}

/**
 * WebSocket 网关（阶段 3）：
 * - socket.io，与 HTTP 同端口（3301）
 * - 握手 middleware 校验 JWT（socket.io 标准模式，失败拒绝连接）
 * - CORS 白名单（CORS_ORIGINS，与 HTTP 同源配置）
 * - 示例事件：ping → pong；whoami → 当前用户；notify → 回显
 */
@WebSocketGateway({
  cors: { origin: wsCorsOriginsFromEnv(), credentials: true },
  transports: ['websocket'],
})
@Injectable()
export class NotificationsGateway implements OnGatewayInit {
  constructor(private readonly wsJwtGuard: WsJwtGuard) {}

  /** socket.io middleware：握手前校验 token，失败拒绝连接 */
  afterInit(server: Server): void {
    server.use((client, next) => this.wsJwtGuard.verifyHandshake(client, next));
  }

  @SubscribeMessage('ping')
  handlePing(): string {
    return 'pong';
  }

  @SubscribeMessage('whoami')
  handleWhoAmI(@ConnectedSocket() client: Socket): WsUser {
    return client.data.user as WsUser;
  }

  @SubscribeMessage('notify')
  handleNotify(@MessageBody() body: { message: string }): { received: string } {
    return { received: body?.message ?? '' };
  }
}
