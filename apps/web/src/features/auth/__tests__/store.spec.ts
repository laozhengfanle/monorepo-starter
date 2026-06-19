/**
 * 认证状态管理（useAuthStore）单元测试
 *
 * 测试覆盖：
 *   - 初始状态
 *   - 登录成功 / 失败
 *   - 获取用户信息成功 / me 返回 null / 网络错误
 *   - 登出
 *   - 发送验证码
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../store';

// ---- Mock API 模块 ----
// REST 认证函数已拆分到 @/api/bff/auth
vi.mock('@/api/bff/auth', () => ({
    smsLogin: vi.fn(),
    sendSmsCode: vi.fn(),
    logout: vi.fn(),
}));
// GraphQL 查询仍在本模块
vi.mock('../api', () => ({
    fetchMe: vi.fn(),
}));

import { smsLogin, sendSmsCode, logout } from '@/api/bff/auth';
import { fetchMe } from '../api';

// ---- Mock 全局 fetch（登出接口使用原生 fetch） ----
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---- Mock localStorage ----
// happy-dom 提供了 localStorage，但需要在每个测试前清空
beforeEach(() => {
    localStorage.clear();
});

describe('useAuthStore', () => {
    /** 每个测试前创建新的 Pinia 实例，确保状态隔离 */
    beforeEach(() => {
        setActivePinia(createPinia());
        // 重置所有 mock 的调用记录和返回值
        vi.clearAllMocks();
        // 登出接口默认返回 ok 响应
        mockFetch.mockResolvedValue({ ok: true });
    });

    // ---- 1. 初始状态 ----
    describe('初始状态', () => {
        it('localStorage 为空时，isLoggedIn 为 false，user 为 null', () => {
            const store = useAuthStore();

            expect(store.isLoggedIn).toBe(false);
            expect(store.user).toBeNull();
        });

        it('localStorage 有登录标志时，isLoggedIn 为 true', () => {
            // 模拟之前已登录（localStorage 中有标志）
            localStorage.setItem('member_auth_status', '1');

            // 重新创建 Pinia 实例，让 store 重新初始化
            setActivePinia(createPinia());
            const store = useAuthStore();

            expect(store.isLoggedIn).toBe(true);
        });
    });

    // ---- 2. login() — 成功 ----
    describe('login() — 成功', () => {
        it('调用 smsLoginApi，设置 isLoggedIn=true，写入 localStorage，调用 fetchUser', async () => {
            const store = useAuthStore();

            // 模拟 smsLogin 成功（不抛异常）
            vi.mocked(smsLogin).mockResolvedValue(undefined);
            // 模拟 fetchMe 返回用户信息
            const mockUser = {
                accountId: 'ACC001',
                nickname: '测试用户',
                roles: ['member'],
            };
            vi.mocked(fetchMe).mockResolvedValue(mockUser);

            await store.login('13800138000', '123456');

            // 验证 smsLogin 被正确调用（turnstileToken 可选，未填时为 undefined）
            expect(smsLogin).toHaveBeenCalledWith('13800138000', '123456', undefined);
            // 验证登录状态已设置
            expect(store.isLoggedIn).toBe(true);
            // 验证 localStorage 写入了登录标志
            expect(localStorage.getItem('member_auth_status')).toBe('1');
            // 验证 fetchUser 被调用（内部调用 fetchMe）
            expect(fetchMe).toHaveBeenCalled();
            // 验证用户信息已设置
            expect(store.user).toEqual(mockUser);
        });
    });

    // ---- 3. login() — 失败 ----
    describe('login() — 失败', () => {
        it('smsLoginApi 抛出异常时，isLoggedIn 保持 false', async () => {
            const store = useAuthStore();

            // 模拟 smsLogin 抛出异常
            vi.mocked(smsLogin).mockRejectedValue(new Error('登录失败'));

            await expect(store.login('13800138000', '123456')).rejects.toThrow('登录失败');

            // 验证登录状态未改变
            expect(store.isLoggedIn).toBe(false);
            // 验证 localStorage 未写入
            expect(localStorage.getItem('member_auth_status')).toBeNull();
        });
    });

    // ---- 4. fetchUser() — 成功 ----
    describe('fetchUser() — 成功', () => {
        it('设置 user 为 MemberMe 数据', async () => {
            const store = useAuthStore();

            const mockUser = {
                accountId: 'ACC002',
                nickname: '张三',
                avatar: 'https://example.com/avatar.png',
                roles: ['vip'],
            };
            vi.mocked(fetchMe).mockResolvedValue(mockUser);

            await store.fetchUser();

            expect(store.user).toEqual(mockUser);
        });
    });

    // ---- 5. fetchUser() — me 返回 null ----
    describe('fetchUser() — me 返回 null', () => {
        it('清除 user 和 isLoggedIn，移除 localStorage 标志', async () => {
            // 先设置一个已登录的状态
            localStorage.setItem('member_auth_status', '1');
            setActivePinia(createPinia());
            const store = useAuthStore();

            // 模拟 fetchMe 返回 null（Cookie 已失效）
            vi.mocked(fetchMe).mockResolvedValue(null);

            await store.fetchUser();

            expect(store.user).toBeNull();
            expect(store.isLoggedIn).toBe(false);
            expect(localStorage.getItem('member_auth_status')).toBeNull();
        });
    });

    // ---- 6. fetchUser() — 网络错误 ----
    describe('fetchUser() — 网络错误', () => {
        it('清除 user 和 isLoggedIn，并抛出错误', async () => {
            // 先设置一个已登录的状态
            localStorage.setItem('member_auth_status', '1');
            setActivePinia(createPinia());
            const store = useAuthStore();

            // 模拟 fetchMe 网络错误
            vi.mocked(fetchMe).mockRejectedValue(new Error('Network Error'));

            await expect(store.fetchUser()).rejects.toThrow('获取用户信息失败');

            expect(store.user).toBeNull();
            expect(store.isLoggedIn).toBe(false);
            expect(localStorage.getItem('member_auth_status')).toBeNull();
        });
    });

    // ---- 7. logout() ----
    describe('logout()', () => {
        it('清除 user、isLoggedIn、localStorage，调用登出接口', async () => {
            // 先模拟已登录状态
            localStorage.setItem('member_auth_status', '1');
            setActivePinia(createPinia());
            const store = useAuthStore();

            // 先设置用户信息
            vi.mocked(fetchMe).mockResolvedValue({
                accountId: 'ACC003',
                nickname: '李四',
                roles: ['member'],
            });
            await store.fetchUser();

            // 确认已登录
            expect(store.isLoggedIn).toBe(true);
            expect(store.user).not.toBeNull();

            // 执行登出
            await store.logout();

            // 验证用户信息已清除
            expect(store.user).toBeNull();
            expect(store.isLoggedIn).toBe(false);
            // 验证 localStorage 已清除
            expect(localStorage.getItem('member_auth_status')).toBeNull();
            // 验证调用了后端登出接口（通过 BFF 层）
            expect(logout).toHaveBeenCalledOnce();
        });

        it('后端登出接口失败时，仍然清除前端状态', async () => {
            localStorage.setItem('member_auth_status', '1');
            setActivePinia(createPinia());
            const store = useAuthStore();

            // 模拟后端登出接口返回错误
            vi.mocked(logout).mockRejectedValue(new Error('网络错误'));

            await store.logout();

            // 即使后端失败，前端状态也应清除
            expect(store.user).toBeNull();
            expect(store.isLoggedIn).toBe(false);
            expect(localStorage.getItem('member_auth_status')).toBeNull();
        });
    });

    // ---- 8. sendSmsCode() ----
    describe('sendSmsCode()', () => {
        it('委托给 sendSmsCodeApi，传递手机号、用途和 turnstileToken（undefined）', async () => {
            const store = useAuthStore();

            vi.mocked(sendSmsCode).mockResolvedValue(undefined);

            await store.sendSmsCode('13800138000', 'login');

            // turnstileToken 可选：未传时为 undefined
            expect(sendSmsCode).toHaveBeenCalledWith('13800138000', 'login', undefined);
        });

        it("不传 purpose 时默认为 'login'", async () => {
            const store = useAuthStore();

            vi.mocked(sendSmsCode).mockResolvedValue(undefined);

            await store.sendSmsCode('13800138000');

            expect(sendSmsCode).toHaveBeenCalledWith('13800138000', 'login', undefined);
        });
    });
});
