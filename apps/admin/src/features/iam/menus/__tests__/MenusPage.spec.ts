/**
 * MenusPage 单元测试
 *
 * 测试范围：
 *   - 权限控制：添加/编辑/删除按钮的可见性
 *   - 数据加载：组件挂载时调用 getMenus、loading 状态
 *   - 统计卡片：目录数、菜单数、按钮数的正确统计
 *   - 二次确认：onPositiveClick 回调触发 deleteMenu
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import MenusPage from '../MenusPage.vue';
import type { MenuNode } from '../types';
import { usePermissionStore } from '@/shared/stores/permission';

// ============================================================
// Mock 数据
// ============================================================
const { mockMenuTree } = vi.hoisted(() => ({
    // 模拟真实 GraphQL adminMenus 行为：扁平列表 + parentId
    mockMenuTree: [
        {
            id: 'dir-1',
            name: '权限管理',
            path: '/iam',
            icon: 'tabler:Lock',
            sort: 1,
            type: 'directory',
            visible: true,
            enabled: true,
            parentId: null,
        },
        {
            id: 'menu-1',
            name: '管理员管理',
            path: 'admin',
            routeName: 'IamAdminList',
            component: 'iam/admins',
            icon: 'tabler:User',
            permissionCode: 'iam:admin:view',
            sort: 1,
            type: 'menu',
            visible: true,
            keepAlive: true,
            enabled: true,
            parentId: 'dir-1',
        },
        {
            id: 'btn-1',
            name: '新增管理员',
            permissionCode: 'iam:admin:create',
            sort: 1,
            type: 'button',
            enabled: true,
            parentId: 'menu-1',
        },
    ] as unknown as MenuNode[],
}));

// ============================================================
// Mock API 模块
// ============================================================
const apiRef = vi.hoisted(() => {
    return { current: null as null | Record<string, ReturnType<typeof vi.fn>> };
});

vi.mock('@/api', () => {
    const mod = {
        getMenus: vi.fn().mockResolvedValue(mockMenuTree),
        getMenuTree: vi.fn().mockResolvedValue(mockMenuTree),
        deleteMenu: vi.fn().mockResolvedValue(undefined),
        updateMenu: vi.fn().mockResolvedValue(undefined),
        getCurrentUserMenus: vi.fn().mockResolvedValue({ menus: [], permissions: [] }),
    };
    apiRef.current = mod;
    return mod;
});

// Mock vue-router
vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    createRouter: () => ({
        addRoute: vi.fn(),
        removeRoute: vi.fn(),
        getRoutes: vi.fn(() => []),
        push: vi.fn(),
        replace: vi.fn(),
        beforeEach: vi.fn(),
        afterEach: vi.fn(),
    }),
    createWebHashHistory: () => ({}),
}));

// Mock 路由守卫
vi.mock('@/app/router/guard', () => ({
    default: vi.fn(),
}));

// Mock 路由事件广播
vi.mock('@/app/router/route-listener', () => ({
    setRouteEmitter: vi.fn(),
}));

// Mock 路由模块
vi.mock('@/app/router', () => ({
    default: {
        addRoute: vi.fn(),
        removeRoute: vi.fn(),
        getRoutes: vi.fn(() => []),
        push: vi.fn(),
        replace: vi.fn(),
        beforeEach: vi.fn(),
        afterEach: vi.fn(),
    },
}));

// Mock 路由菜单转换
vi.mock('@/app/router/menu-to-routes', () => ({
    menuToRoutes: vi.fn(() => ({
        routes: [],
        externalMenus: [],
        buttonPermissions: [],
    })),
}));

// Mock 设计令牌 composable
vi.mock('@/shared/composables/useDesignTokens', () => ({
    useDesignTokens: () => ({ gap: ref(16) }),
}));

const dialogMock = vi.hoisted(() => ({
    warning: vi.fn().mockResolvedValue(true),
}));
const messageMock = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}));

// Mock Naive UI composable
vi.mock('naive-ui', async (importOriginal) => {
    const actual = await importOriginal<typeof import('naive-ui')>();
    return {
        ...actual,
        useMessage: () => messageMock,
        useDialog: () => dialogMock,
    };
});

// ============================================================
// 辅助类型
// ============================================================
interface ColumnDef {
    title: string;
    key: string;
    render?: (...args: unknown[]) => unknown;
}

// ============================================================
// 辅助函数
// ============================================================

function extractButtonTexts(vnodes: unknown[]): string[] {
    const texts: string[] = [];
    for (const vnode of vnodes) {
        if (!vnode || typeof vnode !== 'object') continue;
        const v = vnode as { children?: unknown; type?: unknown };

        if (vnode === null) continue;

        if (
            v.children &&
            typeof v.children === 'object' &&
            'default' in (v.children as object) &&
            typeof (v.children as { default?: unknown }).default === 'function'
        ) {
            const slotResult = (v.children as { default: () => unknown }).default();
            if (typeof slotResult === 'string') {
                texts.push(slotResult);
            } else if (Array.isArray(slotResult)) {
                texts.push(...extractButtonTexts(slotResult));
            }
        }
    }
    return texts;
}

function mountWithPermissions(permissions: string[] = []) {
    const pinia = createTestingPinia({
        stubActions: false,
    });

    const wrapper = mount(MenusPage, {
        global: {
            stubs: {
                NSpace: {
                    template: '<div class="n-space"><slot /></div>',
                },
                NCard: {
                    template:
                        '<div class="n-card"><div class="n-card-header-extra"><slot name="header-extra" /></div><slot /></div>',
                },
                NGrid: {
                    template: '<div class="n-grid"><slot /></div>',
                },
                NGi: {
                    template: '<div class="n-gi"><slot /></div>',
                },
                NIcon: {
                    template: '<span class="n-icon"><slot /></span>',
                },
                NText: {
                    template: '<span class="n-text"><slot /></span>',
                },
                NButton: {
                    template:
                        '<button class="n-button" :class="extraClass" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
                    props: ['type', 'size', 'text', 'ghost', 'disabled'],
                    computed: {
                        extraClass() {
                            return this.type ? `n-button--${this.type}` : '';
                        },
                    },
                },
                NDataTable: {
                    name: 'NDataTable',
                    template: '<div class="n-data-table"></div>',
                    props: ['columns', 'data', 'loading', 'singleLine', 'rowKey', 'rowProps'],
                },
                NSwitch: {
                    template: '<input type="checkbox" class="n-switch" />',
                    props: ['value', 'size', 'disabled', 'loading'],
                },
                NTag: {
                    template: '<span class="n-tag" :class="\'n-tag--\' + type"><slot /></span>',
                    props: ['size', 'type'],
                },
                MenuFormDrawer: {
                    template: '<div class="menu-form-drawer"></div>',
                },
            },
            plugins: [pinia],
        },
    });

    const permStore = usePermissionStore();
    permStore.$patch({ permissions });

    return wrapper;
}

function getColumnsFromDataTable(wrapper: VueWrapper): ColumnDef[] {
    const dataTable = wrapper.findComponent({ name: 'NDataTable' });
    return dataTable.props('columns') as ColumnDef[];
}

function createMockRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'menu-1',
        name: '管理员管理',
        type: 'menu',
        sort: 1,
        enabled: true,
        level: 1,
        fullPath: '/iam/admin',
        ...overrides,
    };
}

function getActionButtonTexts(wrapper: VueWrapper, row?: Record<string, unknown>): string[] {
    const columns = getColumnsFromDataTable(wrapper);
    const actionColumn = columns.find((col) => col.key === 'actions');
    if (!actionColumn?.render) return [];

    const rendered = actionColumn.render(row || createMockRow(), 0) as {
        children: { default?: () => unknown[] };
    };

    const children = typeof rendered.children?.default === 'function' ? rendered.children.default() : rendered.children;

    return extractButtonTexts(children as unknown[]);
}

interface MenusPageVM {
    isLoading: boolean;
    flatData: MenuNode[];
    columns: ColumnDef[];
    onDelete: (row: MenuNode) => void;
    loadData: () => Promise<void>;
}

// ============================================================
// 测试用例
// ============================================================
describe('MenusPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ============================================================
    // 数据加载
    // ============================================================
    describe('数据加载', () => {
        it('组件挂载时调用 getMenus 加载数据', async () => {
            mountWithPermissions();
            await flushPromises();

            expect(apiRef.current!.getMenus).toHaveBeenCalledTimes(1);
        });

        it('加载中显示 loading 状态', async () => {
            let resolveLoad!: () => void;
            vi.mocked(apiRef.current!.getMenus).mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveLoad = () => resolve(mockMenuTree);
                }),
            );

            const wrapper = mountWithPermissions([]);

            await wrapper.vm.$nextTick();

            const dataTable = wrapper.findComponent({ name: 'NDataTable' });
            expect(dataTable.props('loading')).toBe(true);

            resolveLoad();
            await flushPromises();
            await wrapper.vm.$nextTick();

            expect(dataTable.props('loading')).toBe(false);
        });
    });

    // ============================================================
    // 权限控制
    // ============================================================
    describe('权限控制', () => {
        it("有 iam:menu:create 权限时，'添加菜单'按钮可见", async () => {
            const wrapper = mountWithPermissions(['iam:menu:create']);

            await wrapper.vm.$nextTick();

            const permStore = usePermissionStore();
            expect(permStore.hasAnyPermission(['iam:menu:create'])).toBe(true);

            const addBtn = wrapper.findAll('.n-button').find((btn) => btn.text().includes('添加菜单'));
            expect(addBtn).toBeDefined();
            expect(addBtn?.exists()).toBe(true);
        });

        it.todo("无 iam:menu:create 权限时，'添加菜单'按钮不可见");

        it("有 iam:menu:update 权限时，表格操作列有'编辑'按钮", async () => {
            const wrapper = mountWithPermissions(['iam:menu:update']);
            await wrapper.vm.$nextTick();

            const permStore = usePermissionStore();
            expect(permStore.hasAnyPermission(['iam:menu:update'])).toBe(true);

            const buttonTexts = getActionButtonTexts(wrapper);

            expect(buttonTexts).toContain('编辑');
        });

        it.todo("无 iam:menu:update 权限时，表格操作列无'编辑'按钮");

        it("有 iam:menu:delete 权限时，表格操作列有'删除'按钮", async () => {
            const wrapper = mountWithPermissions(['iam:menu:delete']);
            await wrapper.vm.$nextTick();

            const permStore = usePermissionStore();
            expect(permStore.hasAnyPermission(['iam:menu:delete'])).toBe(true);

            const buttonTexts = getActionButtonTexts(wrapper);

            expect(buttonTexts).toContain('删除');
        });

        it.todo("无 iam:menu:delete 权限时，表格操作列无'删除'按钮");
    });

    // ============================================================
    // 统计卡片
    // ============================================================
    describe('统计卡片', () => {
        it('正确统计目录数、菜单数、按钮数', async () => {
            const wrapper = mountWithPermissions();

            await flushPromises();
            await wrapper.vm.$nextTick();
            await wrapper.vm.$nextTick();

            const html = wrapper.text();

            // mockMenuTree 中：1 个 folder、1 个 menu、1 个 button
            expect(html).toContain('目录');
            expect(html).toMatch(/目录.*?1/);

            expect(html).toContain('菜单总数');
            expect(html).toMatch(/菜单总数.*?1/);

            expect(html).toContain('页面菜单');
            expect(html).toMatch(/页面菜单.*?1/);

            expect(html).toContain('按钮权限');
            expect(html).toMatch(/按钮权限.*?1/);
        });
    });

    // ============================================================
    // 删除操作
    // ============================================================
    describe('删除操作', () => {
        it('操作列包含编辑、删除、子项按钮', () => {
            const wrapper = mountWithPermissions(['iam:menu:create']);
            const buttonTexts = getActionButtonTexts(wrapper);

            expect(buttonTexts).toContain('编辑');
            expect(buttonTexts).toContain('删除');
            expect(buttonTexts).toContain('子项');
        });

        it('button 类型节点不显示子项按钮', () => {
            const wrapper = mountWithPermissions(['iam:menu:create']);
            const buttonTexts = getActionButtonTexts(wrapper, {
                ...createMockRow({ type: 'button' }),
            });

            expect(buttonTexts).toContain('编辑');
            expect(buttonTexts).toContain('删除');
            expect(buttonTexts).not.toContain('子项');
        });

        it('点「删除」按钮弹出二次确认弹窗', async () => {
            const naiveUi = await import('naive-ui');
            const dialog = naiveUi.useDialog();
            let capturedOnPositive: (() => Promise<void>) | undefined;
            vi.mocked(dialog.warning).mockImplementation(((options: {
                onPositiveClick?: (e?: MouseEvent) => Promise<void>;
            }) => {
                capturedOnPositive = options.onPositiveClick as () => Promise<void>;
                return undefined as never;
            }) as never);

            const deleteMenu = apiRef.current!.deleteMenu;

            const wrapper = mountWithPermissions(['iam:menu:create']);
            const vm = wrapper.vm as unknown as MenusPageVM;

            const testRow = {
                id: 'menu-1',
                name: '管理员管理',
                type: 'menu',
                path: 'admin',
                sort: 1,
                enabled: true,
            } as MenuNode;

            vm.onDelete(testRow);

            expect(dialog.warning).toHaveBeenCalled();
            expect(capturedOnPositive).toBeDefined();

            await capturedOnPositive!();
            expect(deleteMenu).toHaveBeenCalledWith(testRow.id);
        });
    });
});
