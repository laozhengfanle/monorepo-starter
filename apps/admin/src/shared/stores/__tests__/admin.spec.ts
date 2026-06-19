/**
 * Admin Store 单元测试
 *
 * 测试范围：
 *   - 登录流程：login → setAuthStatus + getMe
 *   - 登出流程：logout → clearAuthStatus + reset stores
 *   - 计算属性：adminName / adminAvatar
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAdminStore } from '@/shared/stores/admin';
import { usePermissionStore } from '@/shared/stores/permission';

// Mock API 模块
vi.mock('@/api', () => ({
    login: vi.fn().mockResolvedValue(undefined),
    getMe: vi.fn().mockResolvedValue({
        admin: {
            id: '1',
            name: '测试管理员',
            avatar: 'https://example.com/avatar.png',
            username: 'admin',
        },
        menus: [],
        permissions: ['dashboard:view'],
    }),
    logout: vi.fn().mockResolvedValue(undefined),
}));

// Mock auth status 工具函数
vi.mock('@/shared/request/request', () => ({
    setAuthStatus: vi.fn(),
    removeAuthStatus: vi.fn(),
    hasAuthStatus: vi.fn(() => false),
}));

// Mock router guard
vi.mock('@/app/router/guard/adminLoginInfo', () => ({
    resetMePromise: vi.fn(),
}));

// Mock router
vi.mock('@/app/router', () => ({
    default: {
        addRoute: vi.fn(),
        removeRoute: vi.fn(),
        getRoutes: vi.fn(() => []),
    },
}));

describe('Admin Store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    describe('login', () => {
        it('登录成功后设置登录状态并获取管理员信息', async () => {
            const store = useAdminStore();

            await store.login({ username: 'admin', password: '123456' });

            expect(store.isLoggedIn).toBe(true);
            expect(store.adminInfo).not.toBeNull();
            expect(store.adminInfo?.name).toBe('测试管理员');
        });

        it('登录成功后权限码注入到 permissionStore', async () => {
            const store = useAdminStore();
            const permStore = usePermissionStore();

            await store.login({ username: 'admin', password: '123456' });

            expect(permStore.permissions).toContain('dashboard:view');
        });
    });

    describe('logout', () => {
        it('登出后清空登录状态和管理员信息', async () => {
            const store = useAdminStore();

            // 先登录
            await store.login({ username: 'admin', password: '123456' });
            expect(store.isLoggedIn).toBe(true);

            // 再登出
            await store.logout();
            expect(store.isLoggedIn).toBe(false);
            expect(store.adminInfo).toBeNull();
        });

        it('登出后权限码被清空', async () => {
            const store = useAdminStore();
            const permStore = usePermissionStore();

            await store.login({ username: 'admin', password: '123456' });
            expect(permStore.permissions.length).toBeGreaterThan(0);

            await store.logout();
            expect(permStore.permissions).toEqual([]);
        });
    });

    describe('计算属性', () => {
        it('adminName 返回管理员名称', async () => {
            const store = useAdminStore();
            await store.login({ username: 'admin', password: '123456' });
            expect(store.adminName).toBe('测试管理员');
        });

        it('adminName 无管理员信息时返回空字符串', () => {
            const store = useAdminStore();
            expect(store.adminName).toBe('');
        });

        it('adminAvatar 返回管理员头像', async () => {
            const store = useAdminStore();
            await store.login({ username: 'admin', password: '123456' });
            expect(store.adminAvatar).toBe('https://example.com/avatar.png');
        });

        it('adminAvatar 无管理员信息时返回默认头像', () => {
            const store = useAdminStore();
            expect(store.adminAvatar).toBe('/hero.png');
        });
    });

    describe('markLoggedOut', () => {
        it('登录后调用 markLoggedOut 将 isLoggedIn 和 adminInfo 置为未登录态', async () => {
            const store = useAdminStore();
            // 先登录
            await store.login({ username: 'admin', password: '123456' });
            expect(store.isLoggedIn).toBe(true);
            expect(store.adminInfo).not.toBeNull();

            // 模拟路由守卫捕获 401 后的清理（不调后端 logout 接口）
            store.markLoggedOut();

            expect(store.isLoggedIn).toBe(false);
            expect(store.adminInfo).toBeNull();
        });
    });
});
