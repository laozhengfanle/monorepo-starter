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

/**
 * WebSocket 网关（阶段 3）：
 * - socket.io，与 HTTP 同端口（3301）
 * - 握手 middleware 校验 JWT（socket.io 标准模式，失败拒绝连接）
 * - 示例事件：ping → pong；whoami → 当前用户；notify → 回显
 */
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
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
