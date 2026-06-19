-- ============================================================
-- Round 2 Polish: Token 撤销中心 + Account.tokenVersion
--
-- 背景：
-- - CRITICAL B1：重置密码 / 改密 / 软删账号时，旧 token 仍 7 天有效
--   - 旧实现只 `delByPattern(mono:refresh:used:*)`，没有持久化的撤销记录
--   - 一旦 Redis 缓存丢失或 TTL 过期，旧 token 仍能通过 jwt.verify 验签
--   - 攻击者拿到旧 token 可继续用 7 天（直到 accessToken 自然过期）
--
-- 解决方案（两层防护）：
-- 1) 新增 token_revocation 表（持久化的"已撤销 token"清单）
--    - 字段：jti（JWT ID）、accountId、reason、expiresAt（与原 token 过期时间一致）
--    - revokeAccountTokens() 写入此表 → 即使 Redis 丢失，DB 仍有记录
-- 2) Account 表加 tokenVersion 字段（自增整数）
--    - JwtStrategy.validate 校验 payload.tokenVersion === account.tokenVersion
--    - 重置密码/软删时 increment(1) → 所有未携带新 version 的 token 全部失效
--    - 与 token_revocation 互补：version 字段 O(1) 校验不需查 DB
--
-- isRevoked() 流程：
-- - 先查 Redis 缓存（O(1) 命中）
-- - miss 再查 token_revocation 表
-- - 再校验 account.tokenVersion（防 token_revocation 表被截断/丢失）
-- ============================================================

-- 新表：token_revocation（撤销 token 持久化记录）
CREATE TABLE "token_revocation" (
    "id" UUID PRIMARY KEY,
    "account_id" UUID NOT NULL,
    "jti" VARCHAR(128) NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 关联 Account 表：账号软删时，由 TokenBlacklistService 主动清理
    CONSTRAINT "token_revocation_account_id_fkey" FOREIGN KEY ("account_id")
        REFERENCES "account" ("id") ON DELETE RESTRICT
);

-- 索引：按 jti 查（isRevoked 走 jti 查 DB）
CREATE INDEX "token_revocation_jti_idx" ON "token_revocation" ("jti");

-- 索引：按 account_id 查（清理某账号所有撤销记录）
CREATE INDEX "token_revocation_account_id_idx" ON "token_revocation" ("account_id");

-- 索引：按 expires_at（定期清理过期记录，可由 cleanup 任务跑）
CREATE INDEX "token_revocation_expires_at_idx" ON "token_revocation" ("expires_at");

-- Account 表新增 tokenVersion 字段
-- 默认 0，老数据自动得到 0（与初始 JWT 签发时使用的 version=0 匹配）
ALTER TABLE "account" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
