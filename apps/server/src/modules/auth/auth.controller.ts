import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChangePasswordDto, UpdateSelfDto } from '@starter/server-core';
import type { AdminMe, LoginInput, RefreshInput } from '@starter/contracts';
import type { Request } from 'express';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import type { IssuedTokens } from './token-issuance.service.js';

/**
 * 认证 REST 端点（阶段 3 增强）：
 * - POST /auth/login：用户名+密码 → 双 token（含登录锁定 + 审计），IP 限流 5 次/分钟
 * - POST /auth/refresh：refresh token → 新双 token
 * - POST /auth/logout：撤销账号所有 token（需 JWT）
 * - GET /auth/me：当前账户信息（需 JWT）
 * - PATCH /auth/me：个人中心更新自己资料（需 JWT）
 * - POST /auth/me/password：个人中心修改密码（需 JWT）
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  // 登录端点单独收紧：按 IP 5 次/分钟（防爆破，与账号级 LoginLock 互补）
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ description: '登录成功返回双 token' })
  login(@Body() body: LoginInput, @Req() req: Request): Promise<IssuedTokens> {
    return this.authService.adminLogin(body, req);
  }

  @Post('refresh')
  @ApiOkResponse({ description: '刷新 access token' })
  refresh(@Body() body: RefreshInput, @Req() req: Request): Promise<IssuedTokens> {
    return this.authService.refresh(body.refreshToken, req);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: '登出成功' })
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<void> {
    await this.authService.logout(user.accountId, req);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: '当前账户信息' })
  me(@CurrentUser() user: AuthUser): Promise<AdminMe> {
    return this.authService.me(user.accountId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: '更新当前账户资料（nickname/email/phone/avatar）' })
  @ApiBody({ type: UpdateSelfDto })
  updateSelf(@CurrentUser() user: AuthUser, @Body() body: UpdateSelfDto): Promise<AdminMe> {
    return this.authService.updateSelf(user.accountId, body);
  }

  @Post('me/password')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: '修改密码（校验当前密码，成功后撤销全部 token）' })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.authService.changePassword(user.accountId, body, req);
    return { success: true };
  }
}
