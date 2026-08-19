import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ChangePasswordDto, UpdateSelfDto } from '@starter/server-core';
import type { AdminMe, LoginInput, RefreshInput } from '@starter/contracts';
import type { Request } from 'express';
import { CurrentAccount } from './current-account.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthAccount } from './auth.types.js';
import type { IssuedTokens } from './token-issuance.service.js';

/** access token cookie 名（与 jwt-auth.guard 的 cookie 回退一致） */
export const ACCESS_TOKEN_COOKIE = 'admin_access_token';

/**
 * access token cookie 下发参数（P1-7 修复：token 改 httpOnly cookie，前端不再落 localStorage，
 * 消除 XSS 单点窃取面）：
 * - httpOnly：JS 不可读
 * - sameSite: strict：跨站请求不带 cookie（CSRF 天然缓解）
 * - secure：生产强制 HTTPS-only
 * - maxAge 与 access token TTL 一致（过期即自动失效）
 * Authorization header 方式仍保留（API 客户端/测试/直接调用不受影响）
 */
function accessTokenCookieOptions(ttlSeconds: number): {
  httpOnly: true;
  sameSite: 'strict';
  secure: boolean;
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: ttlSeconds * 1000,
    path: '/',
  };
}

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
  @ApiOkResponse({
    description:
      '登录成功返回双 token（access token 同时下发 httpOnly cookie）',
  })
  async login(
    @Body() body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IssuedTokens> {
    const tokens = await this.authService.adminLogin(body, req);
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      accessTokenCookieOptions(tokens.expiresIn),
    );
    return tokens;
  }

  @Post('refresh')
  // refresh 单独收紧：30 次/分钟（M1 修复；滥用者还有 reuse 检测 + 审计兜底）
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({
    description: '刷新 access token（同时刷新 httpOnly cookie）',
  })
  async refresh(
    @Body() body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IssuedTokens> {
    const tokens = await this.authService.refresh(body.refreshToken, req);
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      accessTokenCookieOptions(tokens.expiresIn),
    );
    return tokens;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({
    description: '登出成功（撤销 token + 清除 httpOnly cookie）',
  })
  async logout(
    @CurrentAccount() account: AuthAccount,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(account.accountId, req);
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: '当前账户信息' })
  me(@CurrentAccount() account: AuthAccount): Promise<AdminMe> {
    return this.authService.me(account.accountId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({
    description: '更新当前账户资料（nickname/email/phone/avatar）',
  })
  @ApiBody({ type: UpdateSelfDto })
  updateSelf(
    @CurrentAccount() account: AuthAccount,
    @Body() body: UpdateSelfDto,
  ): Promise<AdminMe> {
    return this.authService.updateSelf(account.accountId, body);
  }

  @Post('me/password')
  @UseGuards(JwtAuthGuard)
  // 改密单独收紧：5 次/分钟（M1 修复：currentPassword 可被爆破，且 bcrypt 校验构成 CPU DoS）
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({
    description: '修改密码（校验当前密码，成功后撤销全部 token）',
  })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(
    @CurrentAccount() account: AuthAccount,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.authService.changePassword(account.accountId, body, req);
    return { success: true };
  }
}
