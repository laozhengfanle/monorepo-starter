/**
 * AuthResolver 单元测试
 *
 * 覆盖场景：
 * - me(admin): 返回AdminMe类型
 * - me(member): 返回MemberMe类型
 * - me: 未认证用户抛出UnauthorizedException
 * - me: 防御性检查user为空
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthResolver } from '../auth.resolver.js';

describe('AuthResolver', () => {
    let resolver: AuthResolver;
    let mockMeService: { getAdminMe: ReturnType<typeof vi.fn>; getMemberMe: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockMeService = {
            getAdminMe: vi.fn(),
            getMemberMe: vi.fn(),
        };
        resolver = new AuthResolver(mockMeService as any);
    });

    describe('me', () => {
        it('admin用户应返回AdminMe', async () => {
            const adminAccount = {
                accountId: 'acc-1',
                userType: 'admin',
                username: 'admin',
                nickname: '管理员',
                roles: ['super_admin'],
                permissions: ['iam:admin:list'],
                menus: [],
            };
            const context = { req: { user: { accountId: 'acc-1', userType: 'admin' } } };

            (mockMeService.getAdminMe as any).mockResolvedValue(adminAccount);

            const result = await resolver.me(context as any);

            expect(result.userType).toBe('admin');
            expect(mockMeService.getAdminMe).toHaveBeenCalledWith('acc-1', undefined);
            expect(mockMeService.getMemberMe).not.toHaveBeenCalled();
        });

        it('member用户应返回MemberMe', async () => {
            const memberAccount = {
                accountId: 'mem-1',
                userType: 'member',
                nickname: '用户',
                avatar: '/a.png',
                roles: ['vip'],
            };
            const context = { req: { user: { accountId: 'mem-1', userType: 'member' } } };

            (mockMeService.getMemberMe as any).mockResolvedValue(memberAccount);

            const result = await resolver.me(context as any);

            expect(result.userType).toBe('member');
            expect(mockMeService.getMemberMe).toHaveBeenCalledWith('mem-1');
            expect(mockMeService.getAdminMe).not.toHaveBeenCalled();
        });

        it('user为null时应返回异常（防御性检查）', async () => {
            const context = { req: { user: null } };

            await expect(resolver.me(context as any)).rejects.toThrow(UnauthorizedException);
        });

        it('未知userType应返回异常', async () => {
            const context = { req: { user: { accountId: 'acc-3', userType: 'unknown' } } };

            await expect(resolver.me(context as any)).rejects.toThrow(UnauthorizedException);
        });
    });
});
