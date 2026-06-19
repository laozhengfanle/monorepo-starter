/**
 * 第三方登录模块
 *
 * 组成：
 * - OAuthService：业务核心（state 管理 / find-or-create / bind / unbind）
 * - WechatWebProvider：PC 扫码登录（mock）
 * - WechatMiniprogramProvider：小程序登录（mock）
 * - AppleProvider：Apple 登录（mock + jose 真实校验骨架）
 * - OAuthController：REST 端点
 *
 * 注册到 AppModule 时同时注册 OAuthController（不需要在 app.module.ts 单独写 controllers）
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from './oauth.service.js';
import { OAuthController } from './oauth.controller.js';
import { WechatWebProvider } from './providers/wechat-web.provider.js';
import { WechatMiniprogramProvider } from './providers/wechat-miniprogram.provider.js';
import { AppleProvider } from './providers/apple.provider.js';
import { AccountModule } from '../../modules/account/account.module.js';
import { AuditModule } from '../../modules/audit/audit.module.js';

@Module({
    imports: [
        /** AccountModule 提供 AccountService（createMemberAccount） */
        AccountModule,
        /** AuditModule 全局模块 */
        AuditModule,
        /** 注册 JwtModule 以在 OAuthController 内签发 token */
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
    ],
    controllers: [OAuthController],
    providers: [OAuthService, WechatWebProvider, WechatMiniprogramProvider, AppleProvider],
    exports: [OAuthService],
})
export class OAuthModule {}
