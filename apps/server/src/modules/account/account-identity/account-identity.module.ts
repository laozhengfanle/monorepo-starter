/**
 * 账户身份认证模块
 * - 注册 AccountIdentityService + Resolver
 * - 依赖 AccountModule 提供的 AccountService
 */
import { Module } from '@nestjs/common';
import { AccountIdentityService } from './account-identity.service.js';
import { AccountIdentityResolver } from './account-identity.resolver.js';

@Module({
    providers: [AccountIdentityService, AccountIdentityResolver],
    exports: [AccountIdentityService],
})
export class AccountIdentityModule {}
