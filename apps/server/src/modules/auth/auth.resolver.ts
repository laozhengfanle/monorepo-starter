import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { LoginSchema } from '@starter/contracts';
import { ZodArgsPipe } from '@starter/server-core';
import type { Request } from 'express';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import { AdminMeType, AuthResultType, LoginInputType } from './auth.type.js';
import type { AuthUser } from './auth.types.js';

/** 认证 GraphQL Resolver：login mutation + me query */
@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => AuthResultType)
  async login(
    @Args('input', { type: () => LoginInputType }, new ZodArgsPipe(LoginSchema))
    input: LoginInputType,
    @Context() context: { req: Request },
  ): Promise<AuthResultType> {
    return this.authService.adminLogin(input as never, context.req);
  }

  @Query(() => AdminMeType)
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser): Promise<AdminMeType> {
    return this.authService.me(user.accountId);
  }
}
