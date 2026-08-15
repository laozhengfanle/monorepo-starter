import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from './audit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthResolver } from './auth.resolver.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LoginLockService } from './login-lock.service.js';
import { PermissionGuard } from './permission.guard.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { TokenIssuanceService } from './token-issuance.service.js';

/**
 * 认证模块（阶段 3 增强）：
 * - JwtModule：注册 HS256 签名（secret/ttl 来自 env）
 * - JwtAuthGuard：自研 JWT 守卫（签名 + tokenVersion + jti 黑名单三层校验）
 * - TokenIssuanceService：双 token 签发与刷新
 * - TokenBlacklistService：token 撤销（tokenVersion 自增 + jti 黑名单）
 * - LoginLockService：登录失败锁定
 * - AuditService：安全审计
 * - REST（AuthController）+ GraphQL（AuthResolver）双暴露
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<number>('JWT_ACCESS_TTL') ?? 900,
          algorithm: 'HS256',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    PermissionGuard,
    AuthResolver,
    TokenBlacklistService,
    TokenIssuanceService,
    LoginLockService,
    AuditService,
  ],
  exports: [JwtModule, JwtAuthGuard, PermissionGuard, TokenBlacklistService],
})
export class AuthModule {}
