import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service.js';

/**
 * JWT Payload 结构
 * - sub: accountId（账户 ID）
 * - userType: 'admin' | 'member'（用户类型）
 * - tokenVersion: 签发时的 Account.tokenVersion
 *   - JwtStrategy.validate 会校验 payload.tokenVersion === account.tokenVersion
 *   - 旧 token 没带此字段时默认为 0（与 DB 默认值匹配）
 * - jti: JWT ID（可选）
 *   - 用于 TokenBlacklistService.isRevoked() 精确匹配
 */
export interface JwtPayload {
    sub: string;
    userType: string;
    tokenVersion?: number;
    jti?: string;
}

/**
 * 自定义提取器：优先 Authorization header，fallback 到 httpOnly cookie
 * - 浏览器环境：cookie 自动携带，不需要前端手拼 Authorization header
 * - curl / 非浏览器：仍可用 Authorization header
 */
function extractJwt(req: Request): string | null {
    // 1. 优先从 Authorization header 提取
    const headerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (headerToken) return headerToken;
    // 2. fallback 到 httpOnly cookie
    return req.cookies?.['accessToken'] || null;
}

/**
 * Passport JWT Strategy
 * - 从 Authorization header 或 accessToken cookie 提取 token
 * - 算法锁定 HS256（拒绝 alg: none 攻击）
 * - 验证通过后挂 request.user = { accountId, userType }
 *
 * 两重防护：
 * 1) TokenBlacklistService.isRevoked(jti) — 精确查 token_revocation 表（持久化兜底）
 * 2) tokenVersion 校验 — payload.tokenVersion !== account.tokenVersion 视为旧 token 拒绝
 *    - 重置密码 / 软删账号时自增 tokenVersion → 所有未带新 version 的 token 失效
 *    - 即使 token_revocation 表被截断，version 校验仍能挡住旧 token
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly tokenBlacklist: TokenBlacklistService,
    ) {
        super({
            jwtFromRequest: extractJwt,
            ignoreExpiration: false,
            algorithms: ['HS256'],
            secretOrKey: configService.get<string>('auth.JWT_SECRET')!,
            issuer: configService.get<string>('auth.JWT_ISSUER'),
            audience: configService.get<string>('auth.JWT_AUDIENCE'),
        });
    }

    /**
     * 验证通过后的回调 — 将 payload 挂到 request.user
     * - NestJS Passport 约定：validate 返回值会赋给 request.user
     *
     * 校验：
     * 1) jti 黑名单（精确撤销）
     * 2) account.tokenVersion 一致性（粗粒度版本号，防旧 token 串继续通过）
     *
     * 错误码统一 20003（invalid_token），前端捕获后触发 handleAuthExpired
     */
    async validate(payload: JwtPayload) {
        if (!payload.sub || !payload.userType) {
            throw new UnauthorizedException('无效的 Token');
        }

        /** 1) 检查 jti 是否在黑名单（精确撤销，如重置密码 / 软删账号） */
        if (payload.jti) {
            /**
             * 必须传 accountId（payload.sub）：
             * - token_revocation 表里 jti='*' 是"该账号所有 token"通配符
             * - 不带 accountId 过滤会导致 A 账号 logout 后 B 账号登录也被判为撤销
             */
            const revoked = await this.tokenBlacklist.isRevoked(payload.jti, payload.sub);
            if (revoked) {
                throw new UnauthorizedException({ code: 20003, message: 'Token 已撤销，请重新登录' });
            }
        }

        /**
         * 2) 校验 account.tokenVersion
         * - 查 account.tokenVersion（O(1) 索引查询）
         * - 与 payload.tokenVersion 比对，不一致视为旧 token 拒绝
         * - 老 token 没带 tokenVersion 字段时默认为 0（与 DB 默认值匹配）
         * - DB 查不到（账号被硬删）也拒绝
         */
        const account = await this.prisma.client.account.findUnique({
            where: { id: payload.sub },
            select: { tokenVersion: true },
        });
        if (!account) {
            throw new UnauthorizedException({ code: 20003, message: '账户不存在或已注销' });
        }
        const tokenVersionInPayload = payload.tokenVersion ?? 0;
        if (tokenVersionInPayload !== account.tokenVersion) {
            throw new UnauthorizedException({ code: 20003, message: 'Token 已过期，请重新登录' });
        }

        return { accountId: payload.sub, userType: payload.userType };
    }
}
