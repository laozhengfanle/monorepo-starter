import { Injectable, Logger, UnauthorizedException, InternalServerErrorException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../../common/cache/cache.interface.js';
import { CACHE_KEYS } from '../../common/cache/cache-key.constants.js';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { JwtPayload } from './jwt.strategy.js';

/**
 * Token 签发与生命周期服务
 *
 * 职责：
 * - 签发双 Token（access 15min + refresh 7d），并在 payload 写入 tokenVersion + jti
 * - 刷新 Token：校验签名 → 查 jti 撤销 → CAS 标记旧 jti 为 USED → 签发新双 Token
 * - 登出：清 Redis 权限/refresh 缓存 + 撤销账号所有 token
 * - 把 refresh token 哈希写入 Redis（用于 reuse detection）
 *
 * 不负责：
 * - 业务编排（登录、改密等）— 由 AuthService 负责
 * - 失败计数 / 锁定 — 由 LoginLockService 负责（AuthService 走 LoginLockIntegration 包装）
 * - 账户级撤销 — 由 TokenBlacklistService.revokeAccountTokens 负责
 *
 * Refresh Token 存储 key 设计：
 * - mono:refresh:used:{accountId}:{tokenHash} → 'active' | 'used'
 *   每次签发写入，刷新时标记为 'used'，reuse detection 只清当前用户
 * - mono:refresh:used:{jti} → 'used'  （CAS 用的 key，仅按 jti）
 *   用于 tryClaimRefreshSlot 的 Lua 原子操作
 * - mono:refresh:family:{accountId} → 最后签发 token 的 hash
 *   用于 logout 时快速定位并清除
 *
 * 流程：
 * - 签发 token 时 payload 增加 tokenVersion（与 account.tokenVersion 同步）+ jti
 * - resetPassword / changePassword / softDelete 前调 revokeAccountTokens 撤销
 * - refresh 路由用 tryClaimRefreshSlot 做原子 CAS（防并发签发多份新 token）
 * - 新错误码 20005（refresh conflict）
 */
@Injectable()
export class TokenIssuanceService {
    private readonly logger = new Logger(TokenIssuanceService.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly tokenBlacklist: TokenBlacklistService,
        private readonly prisma: PrismaService,
    ) {}

    /**
     * 签发双 Token
     * - Access Token: 15 分钟，前端内存存储
     * - Refresh Token: 7 天，httpOnly cookie 存储
     * - Refresh Token 哈希写入 Redis（用于 reuse detection）
     *
     * 签发逻辑补充：
     * - payload 增加 tokenVersion（从 DB 查 account.tokenVersion）
     * - payload 增加 jti（UUID，refresh 路由 CAS 用）
     *
     * Key 结构：
     * - mono:refresh:used:{accountId}:{tokenHash} → 'active'
     *   每次签发一个 refresh token 就写入一条，刷新时标记为 'used'
     * - mono:refresh:family:{accountId} → tokenHash
     *   记录最后一次签发的 token hash，logout 时按 pattern 清除该用户所有 token
     *
     * @param accountId 账户 ID
     * @param userType 用户类型（'admin' | 'member'）
     */
    async issueTokens(accountId: string, userType: string) {
        /** 查 account.tokenVersion（签发时锁定当时的版本号） */
        const account = await this.prisma.client.account.findUnique({
            where: { id: accountId },
            select: { tokenVersion: true },
        });
        const tokenVersion = account?.tokenVersion ?? 0;

        /** payload 增加 tokenVersion + jti */
        const jti = randomUUID();
        const payload: JwtPayload = { sub: accountId, userType, tokenVersion, jti };

        const accessTtl = this.configService.get<number>('auth.JWT_ACCESS_TTL') || 900;
        const refreshTtl = this.configService.get<number>('auth.JWT_REFRESH_TTL') || 604800;

        /** 签发 Access Token */
        const accessToken = await this.jwtService.signAsync(payload, {
            expiresIn: accessTtl,
            algorithm: 'HS256',
            issuer: this.configService.get<string>('auth.JWT_ISSUER'),
            audience: this.configService.get<string>('auth.JWT_AUDIENCE'),
        });

        /** 签发 Refresh Token（payload 复用同一 jti，保证签发的 token 携带 jti） */
        const refreshToken = await this.jwtService.signAsync(payload, {
            expiresIn: refreshTtl,
            algorithm: 'HS256',
            issuer: this.configService.get<string>('auth.JWT_ISSUER'),
            audience: this.configService.get<string>('auth.JWT_AUDIENCE'),
        });

        /** 将 refresh token 哈希写入 Redis */
        const tokenHash = this.hashToken(refreshToken);

        /** 写入 used 记录：mono:refresh:used:{accountId}:{tokenHash} → 'active' */
        await this.cacheService.setex(`${CACHE_KEYS.REFRESH_USED}:${accountId}:${tokenHash}`, refreshTtl, 'active');

        /** 更新 family 记录：mono:refresh:family:{accountId} → tokenHash */
        await this.cacheService.setex(`${CACHE_KEYS.REFRESH_FAMILY}:${accountId}`, refreshTtl, tokenHash);

        return {
            accessToken,
            expiresIn: accessTtl,
            refreshToken,
        };
    }

    /**
     * 刷新 Token
     * - 验证签名
     * - CAS 原子操作：
     *   - tryClaimRefreshSlot(oldJti, newJti) — Lua 脚本原子完成"标记旧 JTI 为 USED + 写入新 JTI"
     *   - 失败的请求收到 20005（refresh conflict）
     * - 签发新双 Token
     *
     * 时钟容忍：
     * - clockTolerance: 30 容忍服务器之间 30s 内的时钟漂移
     *   - 多台 API 服务器可能因 NTP 同步延迟有微小时钟差
     *   - 默认 0s 时，刚签发 1s 的 token 在时钟"快"的那台服务器上验证时会失败
     *   - 30s 是一般行业标准（参考 Auth0 / AWS Cognito 默认）
     *
     * 错误码：
     *   - 20003: Token 无效/已过期/已撤销（旧逻辑保留）
     *   - 20005: refresh conflict（并发刷新检测）
     *
     * @param oldRefreshToken 客户端携带的旧 refresh token
     */
    async refresh(oldRefreshToken: string) {
        /** 1) 验证 JWT 签名（含 30s clock tolerance 容忍服务器时钟漂移） */
        let payload: JwtPayload;
        try {
            payload = await this.jwtService.verifyAsync<JwtPayload>(oldRefreshToken, {
                algorithms: ['HS256'],
                issuer: this.configService.get<string>('auth.JWT_ISSUER'),
                audience: this.configService.get<string>('auth.JWT_AUDIENCE'),
                /** 允许 iat/nbf ± 30s（防多台服务器时钟漂移） */
                clockTolerance: 30,
            });
        } catch {
            throw new UnauthorizedException({ code: 20003, message: 'Token 无效或已过期' });
        }

        /**
         * 2) 检查 jti 是否已被撤销（精确撤销）
         * - 与 CAS 不同：CAS 防"并发签发两份新 token"，isRevoked 防"已撤销的 token 仍能用"
         * - 必须传 accountId（payload.sub）：jti='*' 是"该账号所有 token"通配符，
         *   不带 accountId 过滤会误伤其他账号（详见 token-blacklist.service.ts#isRevoked）
         */
        if (payload.jti) {
            const revoked = await this.tokenBlacklist.isRevoked(payload.jti, payload.sub);
            if (revoked) {
                throw new UnauthorizedException({ code: 20003, message: 'Token 已撤销，请重新登录' });
            }
        }

        const oldJti = payload.jti;

        /**
         * 3) CAS 原子操作
         * - Lua 脚本：原子完成"标记旧 JTI 为 USED + 写入新 JTI"
         * - 失败返回 false → 抛 20005
         * - 成功继续走 issueTokens 签发新双 token
         *
         * 兼容性：旧 token 没带 jti 字段时降级为旧逻辑（setex 'used'）
         */
        if (oldJti) {
            /** 先用 tryClaimRefreshSlot 标记旧 JTI 为 USED（CAS） */
            const newJti = randomUUID();
            const claimed = await this.tryClaimRefreshSlot(oldJti, newJti);
            if (!claimed) {
                /**
                 * CAS 失败 = 已被并发请求用过
                 * - 触发 reuse detection 兜底：
                 *   1) 撤销账号所有 token（自增 tokenVersion → 已签发的 access token 也立即失效）
                 *   2) 清 Redis refresh 缓存（双保险）
                 *   3) 返回 20005 让前端提示"请重新登录"
                 * - 安全原则：撤销操作必须 await，失败时抛 500（不能让攻击者继续使用已确认复用的 token）
                 *   - 旧实现用 fire-and-forget + catch 仅记日志，存在"撤销失败但返回 20005"的安全窗口
                 *   - 新实现：撤销失败 → 500，强制客户端重新登录，确保攻击 token 一定失效
                 */
                this.logger.error(`Refresh token reuse detected! accountId=${payload.sub}`);
                try {
                    await this.tokenBlacklist.revokeAccountTokens(payload.sub, 'token_reuse');
                } catch (err) {
                    this.logger.error(
                        `reuse detection 撤销 token 失败（安全失败，抛 500）: accountId=${payload.sub} err=${(err as Error).message}`,
                    );
                    /** 撤销失败是严重安全问题：必须抛 500，不能让攻击者继续使用复用的 token */
                    throw new InternalServerErrorException('会话异常，请重新登录');
                }
                await this.cacheService.delByPattern(`${CACHE_KEYS.REFRESH_USED}:${payload.sub}:*`);
                await this.cacheService.del(`${CACHE_KEYS.REFRESH_FAMILY}:${payload.sub}`);
                await this.cacheService.del(`${CACHE_KEYS.AUTH_RESULT}:${payload.sub}`);
                throw new UnauthorizedException({ code: 20005, message: 'Token 已被其他会话使用，请重新登录' });
            }
        } else {
            /**
             * 旧 token 无 jti（兼容性路径）
             * - 退化到 setex 'used' 的旧逻辑
             */
            const tokenHash = this.hashToken(oldRefreshToken);
            const refreshTtl = this.configService.get<number>('auth.JWT_REFRESH_TTL') || 604800;
            await this.cacheService.setex(`${CACHE_KEYS.REFRESH_USED}:${payload.sub}:${tokenHash}`, refreshTtl, 'used');
        }

        /** 4) 签发新双 Token（payload 携带新 jti + 新的 tokenVersion 快照） */
        return this.issueTokens(payload.sub, payload.userType);
    }

    /**
     * CAS 原子操作：尝试"标记旧 JTI 为 USED + 写入新 JTI"
     *
     * - 实际逻辑委托给 TokenBlacklistService.tryClaimRefreshSlot（Lua 脚本）
     * - 这里包一层是为了"以 TokenIssuanceService 视角"提供方法：以后想替换底层 CAS 实现
     *   （比如改成 Redis Streams）只改这一处
     *
     * @param oldJti 旧 refresh token 的 jti
     * @param newJti 新 refresh token 的 jti（本次准备签发的）
     * @returns true=成功（可签发新 token）；false=CAS 失败（已有并发请求用过此 jti）
     */
    private async tryClaimRefreshSlot(oldJti: string, newJti: string): Promise<boolean> {
        return this.tokenBlacklist.tryClaimRefreshSlot(oldJti, newJti);
    }

    /**
     * SHA256 哈希 token — 用于把 token 字符串转成可写入 Redis 的 key
     * - 不用明文 token 写 key（避免日志泄露 / Redis 监控泄露）
     */
    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    /**
     * 登出（撤销该账号所有 token + 清 Redis 缓存）
     * - 调 cacheService 清掉 AUTH_RESULT / REFRESH_USED / REFRESH_FAMILY 三个 key
     * - 调 tokenBlacklist.revokeAccountTokens 自增 account.tokenVersion（旧 token 立即失效）
     *
     * 流程：
     *   1) 清权限缓存（mono:auth:{accountId}）— 前端下次请求时会重建
     *   2) 清该账号所有 refresh token 记录（按 pattern 删）
     *   3) 清 family 记录（mono:refresh:family:{accountId}）
     *   4) 撤销账号所有 token（自增 tokenVersion）
     *      - fire-and-forget + catch：登出请求立即返回 200，不阻塞用户
     *      - 撤销失败只记 error，不影响登出"成功"语义（前端已经清 cookie 了）
     *
     * 顺序：
     * - 先清 cache（确保旧的 refresh token 不能再用来换新 access）
     * - 再触发撤销（异步，不阻塞）
     *
     * @param accountId 账户 ID
     */
    async logout(accountId: string): Promise<void> {
        /** 1) 删除权限缓存 */
        await this.cacheService.del(`${CACHE_KEYS.AUTH_RESULT}:${accountId}`);
        /** 2) 删除该用户所有 refresh token 记录（按 pattern 删） */
        await this.cacheService.delByPattern(`${CACHE_KEYS.REFRESH_USED}:${accountId}:*`);
        /** 3) 删除 family 记录 */
        await this.cacheService.del(`${CACHE_KEYS.REFRESH_FAMILY}:${accountId}`);
        /**
         * 4) 撤销账号所有 token（自增 tokenVersion）
         * - 后置清理：登出已完成，撤销失败不阻塞主流程
         * - fire-and-forget + catch：即便撤销失败，登出请求仍返回成功
         */
        this.tokenBlacklist.revokeAccountTokens(accountId, 'logout').catch((err) => {
            this.logger.error(`logout 后置撤销 token 失败: accountId=${accountId} err=${(err as Error).message}`);
        });
    }
}
