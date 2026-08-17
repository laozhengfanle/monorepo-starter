import { Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import { AdminMeType } from './auth.type.js';
import type { AuthUser } from './auth.types.js';

/**
 * 认证 GraphQL Resolver：仅保留 me query。
 * 认证走 REST（AuthController：POST /auth/login，含 5 次/分钟 IP 限流），
 * GraphQL 暴露 login mutation 会绕过 REST 限流且违反 BFF 规范，已删除。
 */
@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Query(() => AdminMeType)
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser): Promise<AdminMeType> {
    return this.authService.me(user.accountId);
  }
}
