/**
 * Permission Store 单元测试
 *
 * 测试范围：
 *   - 权限码判断：hasPermission / hasAnyPermission / hasAllPermission
 *   - 菜单树生成路由：generateRoutes
 *   - 重置：reset
 *   - 按钮权限码合并
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePermissionStore } from '@/shared/stores/permission';
import type { MenuNode } from '@/features/iam/menus/types';

// Mock vue-router，避免真实路由操作
vi.mock('@/app/router', () => ({
    default: {
        addRoute: vi.fn(),
        removeRoute: vi.fn(),
        getRoutes: vi.fn(() => []),
    },
}));

describe('Permission Store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    describe('hasPermission', () => {
        it('拥有权限码时返回 true', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create', 'role:assign'];
            expect(store.hasPermission('user:create')).toBe(true);
        });

        it('没有权限码时返回 false', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];
            expect(store.hasPermission('role:assign')).toBe(false);
        });
    });

    describe('hasAnyPermission', () => {
        it('拥有任意一个权限码时返回 true', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];
            expect(store.hasAnyPermission(['user:create', 'user:delete'])).toBe(true);
        });

        it('没有任何权限码时返回 false', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];
            expect(store.hasAnyPermission(['user:delete', 'user:update'])).toBe(false);
        });
    });

    describe('hasAllPermission', () => {
        it('拥有全部权限码时返回 true', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create', 'user:delete'];
            expect(store.hasAllPermission(['user:create', 'user:delete'])).toBe(true);
        });

        it('缺少任一权限码时返回 false', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];
            expect(store.hasAllPermission(['user:create', 'user:delete'])).toBe(false);
        });
    });

    describe('generateRoutes', () => {
        it('设置权限码和菜单', () => {
            const store = usePermissionStore();
            const menus: MenuNode[] = [
                {
                    id: '1',
                    name: '仪表盘',
                    path: '/dashboard',
                    component: 'dashboard/IndexPage',
                    routeName: 'DashboardPage',
                    icon: '',
                    sort: 1,
                    type: 'menu',
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                    children: [],
                },
            ];

            store.generateRoutes(menus, ['dashboard:view']);

            expect(store.permissions).toContain('dashboard:view');
            expect(store.menus).toEqual(menus);
            expect(store.isReady).toBe(true);
        });

        it('按钮权限码合并到权限池', () => {
            const store = usePermissionStore();
            // button 类型菜单与 menu 平级放在 directory 下，menuToRoutes 的 walk 会遍历 directory 的 children
            const menus: MenuNode[] = [
                {
                    id: '0',
                    name: 'IAM',
                    path: '/iam',
                    icon: '',
                    sort: 1,
                    type: 'directory',
                    visible: true,
                    enabled: true,
                    children: [
                        {
                            id: '1',
                            name: '管理员管理',
                            path: 'admin',
                            component: 'iam/admins/AdminsPage',
                            routeName: 'IamAdminsPage',
                            icon: '',
                            sort: 1,
                            type: 'menu',
                            visible: true,
                            keepAlive: true,
                            enabled: true,
                            children: [],
                        },
                        {
                            id: '2',
                            name: '新增管理员',
                            sort: 2,
                            type: 'button',
                            permissionCode: 'iam:admin:create',
                            enabled: true,
                            children: [],
                        },
                    ],
                },
            ];

            store.generateRoutes(menus, ['iam:admin:view']);

            // 应包含原始权限码 + 按钮权限码
            expect(store.permissions).toContain('iam:admin:view');
            expect(store.permissions).toContain('iam:admin:create');
        });
    });

    describe('reset', () => {
        it('清空所有状态', () => {
            const store = usePermissionStore();
            store.permissions = ['user:create'];
            store.menus = [
                {
                    id: '1',
                    name: 'test',
                    path: '/test',
                    routeName: 'TestPage',
                    component: '',
                    icon: '',
                    sort: 1,
                    type: 'menu',
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                    children: [],
                },
            ];
            store.isReady = true;

            store.reset();

            expect(store.permissions).toEqual([]);
            expect(store.menus).toEqual([]);
            expect(store.isReady).toBe(false);
        });
    });

    describe('menuCount', () => {
        it('递归统计菜单节点数', () => {
            const store = usePermissionStore();
            store.menus = [
                {
                    id: '1',
                    name: '父菜单',
                    path: '/parent',
                    icon: '',
                    sort: 1,
                    // 与后端 admin-menu.schema.ts 对齐：'directory' 表示分组容器
                    type: 'directory',
                    visible: true,
                    enabled: true,
                    children: [
                        {
                            id: '2',
                            name: '子菜单1',
                            path: 'child1',
                            component: 'TestPage',
                            routeName: 'TestPage',
                            icon: '',
                            sort: 1,
                            type: 'menu',
                            visible: true,
                            keepAlive: true,
                            enabled: true,
                            children: [],
                        },
                        {
                            id: '3',
                            name: '子菜单2',
                            path: 'child2',
                            component: 'TestPage2',
                            routeName: 'TestPage2',
                            icon: '',
                            sort: 2,
                            type: 'menu',
                            visible: true,
                            keepAlive: true,
                            enabled: true,
                            children: [],
                        },
                    ],
                },
            ];

            expect(store.menuCount).toBe(3); // 1 父 + 2 子
        });

        it('空菜单树节点数为 0', () => {
            const store = usePermissionStore();
            store.menus = [];
            expect(store.menuCount).toBe(0);
        });
    });
});
