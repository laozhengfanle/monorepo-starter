import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DashboardResolver } from './dashboard.resolver.js';
import { DashboardService } from './dashboard.service.js';

/** 仪表盘模块（只读聚合：统计/趋势/分布/操作记录，JwtAuthGuard 依赖 AuthModule） */
@Module({
  imports: [AuthModule],
  providers: [DashboardResolver, DashboardService],
})
export class DashboardModule {}
