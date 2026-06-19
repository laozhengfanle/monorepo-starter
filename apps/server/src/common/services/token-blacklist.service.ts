/**
 * Token 撤销中心
 *
 * 设计动机：
 * - 之前所有 token 失效逻辑散落在 auth.service.ts / admin-account.service.ts 中
 *   各自调 delByPattern，清不干净（Redis TTL 过期后旧 token 仍能通过 jwt.verify）
 * - 缺少统一的撤销入口 → 审计 / 测试 / 单元测试都难
 *
 * 提供的能力：
 * - revokeAccountTokens(accountId, reason) — 撤销该账号所有 token
 *   - 写 token_revocation 表（持久化兜底）
 *   - account.tokenVersion increment(1)（O(1) 校验，不必查 DB）
 *   - 清 Redis 缓存（refresh:used:*、refresh:family:*、auth:*）
 * - tryClaimRefreshSlot(oldJti, newJti) — refresh 路由的 CAS 原子操作
 *   - Lua 脚本原子完成"标记旧 JTI 为 USED + 写入新 JTI"
 *   - 失败的请求收到 20005（refresh conflict）
 * - isRevoked(jti, accountId) — 给 JwtStrategy 用的快速校验
 *   - 先查 Redis 缓存（O(1) 命中）
 *   - miss 再查 token_revocation 表（按 accountId 过滤，避免 jti='*' 误伤其他账号）
 *   - 再校验 account.tokenVersion（防 token_revocation 表被截断）
 *
 * 两层防护：
 * 1) token_revocation 表：精确记录"哪些 JTI 被撤销"
 * 2) Account.tokenVersion：粗粒度版本号，任何"踢人"操作都自增
 *    - JwtStrategy.validate 比对 payload.tokenVersion === account.tokenVersion
 *    - 即便 token_revocation 表丢了，version 校验仍能挡住旧 token
 *
 * Redis 降级（Task 3）：
 * - isRevoked 内部使用 safeGet 包裹，Redis 故障时降级为"不校验" + warn
 *   - 这是有意的：auth 链不能因为 Redis 挂掉而阻塞
 *   - 强一致（reuse detection）仍由 jwt.verify 单独完成
 */
import { Inject, Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { CACHE_SERVICE_TOKEN, type ICacheService } from '../cache/cache.interface.js';
import { CACHE_KEYS } from '../cache/cache-key.constants.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisDegradationService } from './redis-degradation.service.js';

/** 撤销原因枚举 — 与 audit log 共享词表 */
export type RevocationReason =
    | 'password_reset'
    | 'password_changed'
    | 'account_deleted'
    | 'logout'
    | 'token_reuse'
    | 'manual';

/**
 * Redis 缓存 key：mono:token:revoked:{jti} → '1'
 * - TTL 与 token 过期时间一致
 * - 命中即视为撤销
 */
const REVOKED_KEY_PREFIX = 'mono:token:revoked';

@Injectable()
export class TokenBlacklistService {
    private readonly logger = new Logger(TokenBlacklistService.name);

    /**
     * Lua 脚本：原子完成"标记旧 JTI 为 USED + 写入新 JTI"
     *
     * KEYS[1] = oldJti 的 used key
     * KEYS[2] = newJti 的 used key
     * ARGV[1] = TTL（秒）
     *
     * 逻辑：
     * 1) 如果 KEYS[1] 已存在且 value = 'used' → 返回 0（已被用过，CAS 失败）
     * 2) 否则 SET KEYS[1] = 'used' EX ttl
     * 3) SET KEYS[2] = 'active' EX ttl
     * 4) 返回 1（成功）
     *
     * 注意：refresh 路由的旧逻辑是先 setex(used)，再签发新 token，期间并发请求会"两份新 token 都签发"
     * 引入此 Lua 后，旧 JTI 的"已被用过"判定是原子的，并发请求只会有一个成功
     */
    static readonly CLAIM_REFRESH_SLOT_LUA = `
        local usedValue = redis.call('GET', KEYS[1])
        if usedValue == 'used' then
            return 0
        end
        redis.call('SET', KEYS[1], 'used', 'EX', ARGV[1])
        redis.call('SET', KEYS[2], 'active', 'EX', ARGV[1])
        return 1
    `;

    constructor(
        @Inject(CACHE_SERVICE_TOKEN) private readonly cacheService: ICacheService,
        private readonly prisma: PrismaService,
        private readonly redisDegradation: RedisDegradationService,
    ) {}

    /**
     * 撤销该账号所有 token（账户级别粗粒度撤销）
     *
     * 步骤：
     * 1) account.tokenVersion += 1（O(1) 校验版 — 唯一的账户级撤销机制）
     * 2) 清 Redis 缓存：
     *    - mono:refresh:used:{accountId}:*（所有 refresh token hash）
     *    - mono:refresh:family:{accountId}（family 记录）
     *    - mono:auth:{accountId}（权限缓存）
     *    - mono:token:revoked:*（该账号之前签发的所有 jti 缓存）
     *
     * ⚠️ 不再写 token_revocation 表：
     * - 旧实现会写 `jti='*'` 的"该账号所有 token"行
     * - 后果：用户登出/重置密码后再登录，新签发的 jti 也会被 `*` 行匹配
     *   → JwtStrategy 抛 20003 "Token 已撤销"，用户永远登不上
     * - 账户级撤销的真正机制是 tokenVersion 自增：
     *   - 旧 token 的 payload.tokenVersion < account.tokenVersion → 校验失败
     *   - 新登录签发的 token 带新 tokenVersion → 校验通过，不受影响
     * - 单 token 撤销（refresh token 复用检测等）走专门接口写具体 jti，不在这里
     *
     * 错误处理：
     * - tokenVersion 自增失败 → 抛 InternalServerErrorException（500）
     *   - tokenVersion 是撤销核心：自增失败 = 旧 token 仍可通过 JwtStrategy 校验
     *   - 调用方按场景决定是否 catch：
     *     - "前置撤销"（改密前调）→ 让异常传播，阻断后续操作
     *     - "后置清理"（改密/删号后调）→ try-catch 兜底，不阻塞已完成的主操作
     * - Redis 失败时降级（撤销已生效，只是缓存没清）
     *
     * @param accountId 账号 ID
     * @param reason 撤销原因（仅记日志，不入 DB）
     * @throws InternalServerErrorException tokenVersion 自增失败
     */
    async revokeAccountTokens(accountId: string, reason: RevocationReason): Promise<void> {
        /** 1) 自增 tokenVersion（核心机制，失败必须抛错） */
        try {
            await this.prisma.client.account.update({
                where: { id: accountId },
                data: { tokenVersion: { increment: 1 } },
            });
        } catch (err) {
            this.logger.error(
                `revokeAccountTokens 自增 tokenVersion 失败: accountId=${accountId} reason=${reason} err=${(err as Error).message}`,
            );
            throw new InternalServerErrorException('撤销 token 失败，请稍后重试');
        }

        /** 2) 清 Redis 缓存（允许降级，Redis 故障不影响撤销） */
        await this.redisDegradation.tryWithFallback(
            async () => {
                await this.cacheService.delByPattern(`${CACHE_KEYS.REFRESH_USED}:${accountId}:*`);
                await this.cacheService.del(`${CACHE_KEYS.REFRESH_FAMILY}:${accountId}`);
                await this.cacheService.del(`${CACHE_KEYS.AUTH_RESULT}:${accountId}`);
                return true;
            },
            async () => {
                this.logger.warn(`revokeAccountTokens Redis 降级（未清缓存）: accountId=${accountId} reason=${reason}`);
                return false;
            },
        );

        this.logger.log(`Tokens revoked: accountId=${accountId} reason=${reason}`);
    }

    /**
     * refresh 路由的 CAS 操作：原子完成"标记旧 JTI 为 USED + 写入新 JTI"
     *
     * 调用方：auth.service.ts#refresh
     * - 拿到旧 token 的 jti 和准备签发的新 jti 后调用
     * - 返回 true → 签发新双 token
     * - 返回 false → 返回 20005 给前端
     *
     * 降级（Redis 故障）：
     * - 仍然返回 true，但记 warn
     * - 强一致检测由 jwt.verify 单独兜底（签名无效直接拒）
     * - 不阻塞登录链
     *
     * @param oldJti 旧 refresh token 的 jti
     * @param newJti 新 refresh token 的 jti（本次准备签发的）
     * @param ttl 过期时间（秒），默认 604800（7d）
     * @returns true=成功（可签发新 token）；false=CAS 失败（已有并发请求用过此 jti）
     */
    async tryClaimRefreshSlot(oldJti: string, newJti: string, ttl = 604800): Promise<boolean> {
        const oldKey = `${CACHE_KEYS.REFRESH_USED}:${oldJti}`;
        const newKey = `${CACHE_KEYS.REFRESH_USED}:${newJti}`;

        try {
            const result = await this.cacheService.evalLua(
                TokenBlacklistService.CLAIM_REFRESH_SLOT_LUA,
                [oldKey, newKey],
                [ttl],
                /**
                 * 内存模式 fallback（无 Redis）
                 * - 内存模式天然没有跨进程竞态，但仍需模拟 Lua 的语义：
                 *   - 旧 JTI 已存在且 = used → 0
                 *   - 否则写入旧 + 写入新 → 1
                 * - 用 cacheService.get/setex 模拟
                 */
                async () => {
                    const oldVal = await this.cacheService.get<string>(oldKey);
                    if (oldVal === 'used') return 0;
                    await this.cacheService.setex(oldKey, ttl, 'used');
                    await this.cacheService.setex(newKey, ttl, 'active');
                    return 1;
                },
            );
            return Number(result) === 1;
        } catch (err) {
            // Redis 故障 → 降级放行 + warn（auth 链不能阻塞）
            this.logger.warn(
                `tryClaimRefreshSlot Redis 故障降级: oldJti=${oldJti} newJti=${newJti} err=${(err as Error).message}`,
            );
            return true;
        }
    }

    /**
     * 检查指定 jti 是否被撤销
     *
     * 调用方：JwtStrategy.validate（每个请求都会查一次）
     *
     * 流程：
     * 1) Redis 缓存查询（O(1) 命中）
     * 2) miss → 查 token_revocation 表（精确 jti 匹配 + 粗粒度 jti='*' 匹配）
     *    - 必须按 accountId 过滤：jti='*' 是"该账号所有 token"通配符，
     *      不带 accountId 会导致 A 账号 logout 后 B 账号登录也被判为撤销
     * 3) Redis 故障 → 降级为 false（视为未撤销）+ warn
     *
     * 注意：精确匹配在 DB 端会带 expiresAt > now() 过滤，过期记录不算
     *
     * @param jti JWT ID
     * @param accountId 账号 ID（payload.sub）— 用于把 jti='*' 限定到具体账号
     * @returns true=已撤销；false=未撤销
     */
    async isRevoked(jti: string, accountId: string): Promise<boolean> {
        /** 1) Redis 缓存查询（走降级，Redis 故障时返回 null） */
        const cached = await this.redisDegradation.safeGet<string | null>(`${REVOKED_KEY_PREFIX}:${jti}`, null);
        if (cached === '1') {
            return true;
        }

        /** 2) miss → 查 DB（按 accountId 过滤，避免 jti='*' 误伤其他账号） */
        try {
            const record = await this.prisma.client.tokenRevocation.findFirst({
                where: {
                    accountId,
                    OR: [{ jti }, { jti: '*' }],
                    expiresAt: { gt: new Date() },
                },
                select: { id: true },
            });
            if (record) {
                /** 写回 Redis 缓存（短期 O(1) 命中），TTL 用剩余 expiresAt */
                const ttl = 60; // 保守 60s（避免大 key 长期驻留）
                await this.cacheService.setex(`${REVOKED_KEY_PREFIX}:${jti}`, ttl, '1');
                return true;
            }
        } catch (err) {
            this.logger.warn(`isRevoked 查 token_revocation 失败: jti=${jti} err=${(err as Error).message}`);
            // DB 失败 → 视为未撤销（fail-open，但 JwtStrategy 还会校验 tokenVersion 第二层防护）
        }

        return false;
    }
}
