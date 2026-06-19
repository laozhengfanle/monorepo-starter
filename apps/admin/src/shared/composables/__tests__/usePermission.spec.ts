/**
 * usePermission composable 单元测试
 *
 * 测试范围：
 *   - hasPermission：单个权限码判断
 *   - hasAnyPermission：任意一个权限码判断
 *   - hasAllPermission：全部权限码判断
 *   - accessRouter：路由级权限判断
 *   - findFirstPermissionRoute：查找第一个可访问路由
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePermission } from '@/shared/composables/usePermission';
import { usePermissionStore } from '@/shared/stores/permission';
import type { RouteRecordRaw } from 'vue-router';

describe('usePermission', () => {
    beforeEach(() => {
        // 每个测试前创建新的 Pinia 实例，避免状态污染
        setActivePinia(createPinia());
    });

    describe('hasPermission', () => {
        it('拥有权限码时返回 true', () => {
            const store = usePermissionStore();
            // 直接设置权限码
            store.permissions = ['user:create', 'user:delete'];

            const { hasPermission } = usePermission();
            expect(hasPermission('user:create')).toBe(true);
        });

        it('没有权限码时返回 false', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];

            const { hasPermission } = usePermission();
            expect(hasPermission('user:delete')).toBe(false);
        });

        it('空权限列表时返回 false', () => {
            const store = usePermissionStore();
            store.permissions = [];

            const { hasPermission } = usePermission();
            expect(hasPermission('user:create')).toBe(false);
        });
    });

    describe('hasAnyPermission', () => {
        it('拥有任意一个权限码时返回 true', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];

            const { hasAnyPermission } = usePermission();
            expect(hasAnyPermission(['user:create', 'user:delete'])).toBe(true);
        });

        it('没有任何权限码时返回 false', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];

            const { hasAnyPermission } = usePermission();
            expect(hasAnyPermission(['user:delete', 'user:update'])).toBe(false);
        });

        it('空数组时返回 false', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];

            const { hasAnyPermission } = usePermission();
            expect(hasAnyPermission([])).toBe(false);
        });
    });

    describe('hasAllPermission', () => {
        it('拥有全部权限码时返回 true', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create', 'user:delete', 'user:update'];

            const { hasAllPermission } = usePermission();
            expect(hasAllPermission(['user:create', 'user:delete'])).toBe(true);
        });

        it('缺少任一权限码时返回 false', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];

            const { hasAllPermission } = usePermission();
            expect(hasAllPermission(['user:create', 'user:delete'])).toBe(false);
        });
    });

    describe('accessRouter', () => {
        it('路由未配置权限时允许访问', () => {
            const { accessRouter } = usePermission();
            const route = { meta: {} } as unknown as RouteRecordRaw;
            expect(accessRouter(route)).toBe(true);
        });

        it('路由配置了空权限数组时允许访问', () => {
            const { accessRouter } = usePermission();
            const route = { meta: { permissions: [] } } as unknown as RouteRecordRaw;
            expect(accessRouter(route)).toBe(true);
        });

        it('用户拥有路由所需权限时允许访问', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];

            const { accessRouter } = usePermission();
            const route = { meta: { permissions: ['user:create'] } } as unknown as RouteRecordRaw;
            expect(accessRouter(route)).toBe(true);
        });

        it('用户没有路由所需权限时拒绝访问', () => {
            const store = usePermissionStore();
            store.permissions = ['user:read'];

            const { accessRouter } = usePermission();
            const route = { meta: { permissions: ['user:create'] } } as unknown as RouteRecordRaw;
            expect(accessRouter(route)).toBe(false);
        });
    });

    describe('findFirstPermissionRoute', () => {
        it('返回第一个可访问的路由', () => {
            const store = usePermissionStore();
            store.permissions = ['dashboard:view'];

            const { findFirstPermissionRoute } = usePermission();
            const routes: RouteRecordRaw[] = [
                {
                    name: 'AdminPage',
                    meta: { permissions: ['admin:manage'] },
                } as unknown as RouteRecordRaw,
                {
                    name: 'DashboardPage',
                    meta: { permissions: ['dashboard:view'] },
                } as unknown as RouteRecordRaw,
            ];
            expect(findFirstPermissionRoute(routes)).toEqual({ name: 'DashboardPage' });
        });

        it('没有可访问路由时返回 null', () => {
            const store = usePermissionStore();
            store.permissions = [];

            const { findFirstPermissionRoute } = usePermission();
            const routes: RouteRecordRaw[] = [
                {
                    name: 'AdminPage',
                    meta: { permissions: ['admin:manage'] },
                } as unknown as RouteRecordRaw,
            ];
            expect(findFirstPermissionRoute(routes)).toBeNull();
        });

        it('递归搜索子路由', () => {
            const store = usePermissionStore();
            store.permissions = ['child:view'];

            const { findFirstPermissionRoute } = usePermission();
            const routes: RouteRecordRaw[] = [
                {
                    name: 'ParentPage',
                    meta: { permissions: ['parent:view'] },
                    children: [
                        {
                            name: 'ChildPage',
                            meta: { permissions: ['child:view'] },
                        } as unknown as RouteRecordRaw,
                    ],
                } as unknown as RouteRecordRaw,
            ];
            expect(findFirstPermissionRoute(routes)).toEqual({ name: 'ChildPage' });
        });
    });
});
