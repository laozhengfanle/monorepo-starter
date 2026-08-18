import { Injectable, Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { OnModuleDestroy } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { WsJwtGuard } from './ws-jwt.guard.js';

interface WsUser {
  accountId: string;
  userType: string;
}

/** 默认放行 admin 开发地址（与 app-setup.ts 的 HTTP CORS 默认值一致） */
const DEFAULT_WS_CORS_ORIGINS = ['http://localhost:3302'];

/** token 撤销后已连接 socket 的周期复核间隔（毫秒） */
const REVALIDATE_INTERVAL_MS = 60_000;

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
 * - @UseGuards(WsJwtGuard)：消息级双保险，每条消息重新校验 token
 *   （token 撤销/账户禁用/tokenVersion 变更后，旧 token 无法再发消息）
 * - 周期复核：每 60s 对全部在线连接重新校验，失败立即断开
 *   （解决「token 撤销后已连接 socket 不失效」——握手校验只在连接建立时执行一次）
 * - CORS 白名单（CORS_ORIGINS，与 HTTP 同源配置）
 * - 示例事件：ping → pong；whoami → 当前用户；notify → 回显
 */
@WebSocketGateway({
  cors: { origin: wsCorsOriginsFromEnv(), credentials: true },
  transports: ['websocket'],
})
@Injectable()
@UseGuards(WsJwtGuard)
export class NotificationsGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsGateway.name);
  private revalidateTimer: NodeJS.Timeout | null = null;

  constructor(private readonly wsJwtGuard: WsJwtGuard) {}

  /** socket.io middleware：握手前校验 token，失败拒绝连接 */
  afterInit(server: Server): void {
    server.use((client, next) => this.wsJwtGuard.verifyHandshake(client, next));
    // token 撤销后已连接 socket 失效：周期重校验全部在线连接，
    // 校验失败（token 被撤销 / 账户禁用 / tokenVersion 变更）立即断开。
    this.revalidateTimer = setInterval(() => {
      void this.revalidateAll(server);
    }, REVALIDATE_INTERVAL_MS);
    this.revalidateTimer.unref?.();
  }

  /** 对全部在线连接重新校验（token 撤销兜底；失败断开连接） */
  private async revalidateAll(server: Server): Promise<void> {
    const sockets = server.sockets.sockets;
    let disconnected = 0;
    for (const socket of sockets.values()) {
      try {
        await this.wsJwtGuard.validateClient(socket);
      } catch {
        socket.disconnect(true);
        disconnected++;
      }
    }
    if (disconnected > 0) {
      this.logger.warn(
        `WS 周期复核：已断开 ${disconnected} 个 token 失效的连接`,
      );
    }
  }

  onModuleDestroy(): void {
    if (this.revalidateTimer) {
      clearInterval(this.revalidateTimer);
      this.revalidateTimer = null;
    }
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
