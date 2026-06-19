import * as bcrypt from 'bcrypt';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * bcrypt rounds（成本因子）— 从环境变量读取，默认 12
 * - 10 rounds ≈ 100ms（2026 年硬件），OWASP 建议至少 10+
 * - 12 rounds ≈ 300ms，安全性更高，适合开源底座默认值
 * - 生产环境可通过 BCRYPT_ROUNDS 环境变量调整（auth.config.ts 已校验范围 10-15）
 * - 值越大越安全但越慢，需在安全与性能间权衡
 */
const BCRYPT_ROUNDS = (() => {
    const raw = process.env.BCRYPT_ROUNDS;
    if (!raw) return 12; // 默认 12 rounds（OWASP 2024 推荐）
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n) || n < 10 || n > 15) {
        // 非法值 fallback 到默认（auth.config.ts 会 fail-fast，这里兜底防直接引用）
        // 使用 NestJS Logger 替代 console.warn，进入统一 Pino 日志流（dev 友好 + prod 可被聚合）
        new Logger('crypto').warn(`BCRYPT_ROUNDS 值无效: "${raw}"，回退到默认值 12（合法范围 10-15）`);
        return 12;
    }
    return n;
})();

const AES_ALGORITHM = 'aes-256-gcm';

/**
 * 密码哈希 — bcrypt
 * - 存储在 account_identity.credential 字段
 * - rounds 从 BCRYPT_ROUNDS 环境变量读取（默认 12）
 */
export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * 密码验证 — bcrypt compare
 * - 从 account_identity.credential 取出 hash 对比
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
}

/**
 * AES-256-GCM 加密结果
 */
export interface AesEncrypted {
    iv: string;
    tag: string;
    ciphertext: string;
}

/**
 * AES-256-GCM 加密
 * - 用于 OAuth token 等敏感数据加密存储
 * - 密钥从环境变量 AES_ENCRYPTION_KEY 注入（64 位 hex 字符串 = 32 字节）
 */
export function encrypt(plaintext: string, keyHex: string): AesEncrypted {
    /** 密钥长度校验：AES-256 需要 32 字节密钥（64 个 hex 字符） */
    if (keyHex.length !== 64) {
        throw new Error(`AES key must be 64 hex chars (32 bytes), got ${keyHex.length}`);
    }
    const key = Buffer.from(keyHex, 'hex');
    const iv = randomBytes(16);
    const cipher = createCipheriv(AES_ALGORITHM, key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    return {
        iv: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
        ciphertext,
    };
}

/**
 * AES-256-GCM 解密
 * - 密钥从环境变量 AES_ENCRYPTION_KEY 注入
 */
export function decrypt({ iv, tag, ciphertext }: AesEncrypted, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    const decipher = createDecipheriv(AES_ALGORITHM, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
}
