import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { WsJwtGuard } from './ws-jwt.guard.js';

/** WebSocket 模块（socket.io 网关 + JWT 鉴权） */
@Module({
  imports: [AuthModule],
  providers: [NotificationsGateway, WsJwtGuard],
})
export class WsModule {}
