import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AdminMe, LoginInput, RefreshInput } from '@starter/contracts';
import type { Request } from 'express';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthUser } from './auth.types.js';
import type { IssuedTokens } from './token-issuance.service.js';

/**
 * 认证 REST 端点（阶段 3 增强）：
 * - POST /auth/login：用户名+密码 → 双 token（含登录锁定 + 审计）
 * - POST /auth/refresh：refresh token → 新双 token
 * - POST /auth/logout：撤销账号所有 token（需 JWT）
 * - GET /auth/me：当前账户信息（需 JWT）
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOkResponse({ description: '登录成功返回双 token' })
  login(@Body() body: LoginInput, @Req() req: Request): Promise<IssuedTokens> {
    return this.authService.adminLogin(body, req);
  }

  @Post('refresh')
  @ApiOkResponse({ description: '刷新 access token' })
  refresh(@Body() body: RefreshInput): Promise<IssuedTokens> {
    return this.authService.refresh(body.refreshToken);
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
}
