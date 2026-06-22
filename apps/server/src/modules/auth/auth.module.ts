import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { TokenIssuanceService } from './token-issuance.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { MeService } from './me.service.js';
import { AuthResolver } from './auth.resolver.js';
import { AdminAuthController } from '../../bff/admin/auth/admin-auth.controller.js';
import { MemberAuthController } from './member/member-auth.controller.js';
import { AuthController } from './auth.controller.js';
import { AdminModule } from '../admin/admin.module.js';
import { TurnstileModule } from '../turnstile/turnstile.module.js';
import { SmsModule } from '../../common/sms/sms.module.js';
import { ServicesModule } from '../../common/services/services.module.js';

/**
 * 认证模块 — 聚合所有认证子模块
 * - 管理员登录（用户名+密码）
 * - C 端短信登录
 * - Token 刷新 / 登出
 * - JWT 双 Token + Refresh Token Rotation
 * - GraphQL: me 查询（按 userType 返回 AdminMe / MemberMe）
 *
 * Post-Audit Polish Task 4 拆分后的结构：
 * - AuthService: 编排层（登录 / 改密 / 重置密码）
 * - TokenIssuanceService: JWT 签发 + refresh + logout
 * - LoginLockService: 锁定计数底层
 * - LoginLockIntegration: 锁定服务薄包装（AuthService 走这层调用）
 * - JwtStrategy: JWT 校验
 * - MeService: me 查询
 * - AuthResolver: GraphQL resolver
 */
@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('auth.JWT_SECRET'),
                signOptions: {
                    algorithm: 'HS256',
                    issuer: configService.get<string>('auth.JWT_ISSUER'),
                    audience: configService.get<string>('auth.JWT_AUDIENCE'),
                },
            }),
            inject: [ConfigService],
        }),
        /**
         * 导入 AdminModule 以使用 AdminPermissionCacheService
         * - me 查询需要从权限缓存读取角色 + 权限码 + 菜单树
         * - AdminModule 已经导出 AdminPermissionCacheService
         */
        AdminModule,
        /**
         * 导入 TurnstileModule 以使用 TurnstileService
         * - 在管理员登录、C 端短信发送等公开端点前置人机验证
         * - 防暴力破解 / 防短信轰炸（详见 turnstile.service.ts 顶部说明）
         */
        TurnstileModule,
        /**
         * 导入 SmsModule（@Global）以使用 SmsService
         * - MemberAuthController 注入 SmsService 完成发送 + 校验
         * - Phase 8 后短信相关业务从 AuthService 剥离到 SmsService
         */
        SmsModule,
        /**
         * 导入 ServicesModule（@Global）以使用 TokenBlacklistService
         * - resetPassword / changePassword / softDelete 都会调 revokeAccountTokens
         * - TokenBlacklistService 自身依赖 RedisDegradationService（Redis 故障降级）
         */
        ServicesModule,
    ],
    controllers: [AdminAuthController, MemberAuthController, AuthController],
    providers: [AuthService, TokenIssuanceService, JwtStrategy, MeService, AuthResolver],
    exports: [AuthService, TokenIssuanceService, JwtModule, MeService],
})
export class AuthModule {}
