/**
 * JwtStrategy 单元测试
 *
 * 覆盖场景：
 * - validate: 有效payload / 缺少sub / 缺少userType
 * - jti 已被撤销 → 20003
 *   - account 已被硬删 → 20003
 *   - payload.tokenVersion !== account.tokenVersion → 20003（旧 token 拒绝）
 *   - payload 没带 tokenVersion → 默认 0（兼容老 token）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, type JwtPayload } from '../jwt.strategy.js';

describe('JwtStrategy', () => {
    let strategy: JwtStrategy;
    let mockPrisma: any;
    let mockTokenBlacklist: any;

    beforeEach(() => {
        const configService = {
            get: (key: string) => {
                if (key === 'auth.JWT_SECRET') return 'test-secret-at-least-32-chars-long-ok';
                if (key === 'auth.JWT_ISSUER') return 'mono';
                if (key === 'auth.JWT_AUDIENCE') return 'mono-app';
                return undefined;
            },
        };

        /**
         * PrismaService mock
         * - 默认 account.tokenVersion = 0
         * - 测试可单独 override
         */
        mockPrisma = {
            client: {
                account: {
                    findUnique: vi.fn().mockResolvedValue({ tokenVersion: 0 }),
                },
            },
        };

        /**
         * TokenBlacklistService mock
         * - 默认 isRevoked → false
         */
        mockTokenBlacklist = {
            isRevoked: vi.fn().mockResolvedValue(false),
        };

        strategy = new JwtStrategy(configService as any, mockPrisma, mockTokenBlacklist);
    });

    describe('validate（基础）', () => {
        it('有效 payload 应返回 user 对象', async () => {
            const payload: JwtPayload = { sub: 'acc-1', userType: 'admin' };

            const result = await strategy.validate(payload);

            expect(result).toEqual({ accountId: 'acc-1', userType: 'admin' });
        });

        it('缺少 sub 应抛出 UnauthorizedException', async () => {
            const payload = { sub: '', userType: 'admin' } as JwtPayload;

            await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
        });

        it('缺少 userType 应抛出 UnauthorizedException', async () => {
            const payload = { sub: 'acc-1', userType: '' } as JwtPayload;

            await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('validate', () => {
        it('jti 在黑名单 → 抛 UnauthorizedException 20003', async () => {
            mockTokenBlacklist.isRevoked.mockResolvedValue(true);
            const payload: JwtPayload = { sub: 'acc-1', userType: 'admin', jti: 'revoked-jti' };

            await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
            /** 不应再走 tokenVersion 校验 */
            expect(mockPrisma.client.account.findUnique).not.toHaveBeenCalled();
        });

        it('account 已被硬删 → 抛 UnauthorizedException', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue(null);
            const payload: JwtPayload = { sub: 'acc-deleted', userType: 'admin', tokenVersion: 0 };

            await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
        });

        it('payload.tokenVersion !== account.tokenVersion → 抛 UnauthorizedException', async () => {
            /** 模拟重置密码后 tokenVersion 已被自增到 1 */
            mockPrisma.client.account.findUnique.mockResolvedValue({ tokenVersion: 1 });
            /** 但 payload 还带 0（签发时是 0） */
            const payload: JwtPayload = { sub: 'acc-1', userType: 'admin', tokenVersion: 0 };

            await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
        });

        it('payload 没带 tokenVersion → 默认 0（兼容老 token）', async () => {
            /** account.tokenVersion = 0（默认值） */
            mockPrisma.client.account.findUnique.mockResolvedValue({ tokenVersion: 0 });
            const payload: JwtPayload = { sub: 'acc-1', userType: 'admin' };

            const result = await strategy.validate(payload);

            expect(result).toEqual({ accountId: 'acc-1', userType: 'admin' });
        });

        it('payload.tokenVersion === account.tokenVersion → 放行', async () => {
            mockPrisma.client.account.findUnique.mockResolvedValue({ tokenVersion: 5 });
            const payload: JwtPayload = { sub: 'acc-1', userType: 'admin', tokenVersion: 5 };

            const result = await strategy.validate(payload);

            expect(result).toEqual({ accountId: 'acc-1', userType: 'admin' });
        });
    });
});
