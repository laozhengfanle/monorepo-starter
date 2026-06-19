/**
 * RolesPage 角色管理页面 单元测试
 *
 * 测试范围：
 *   - 权限控制：新增/编辑/删除按钮的可见性
 *   - 数据加载：组件挂载时调用 getRoles，加载中显示 loading
 *   - 表单操作：点击"新增角色"打开弹窗，弹窗标题正确
 *   - 状态字段：filters.enabled 传参驱动 getRoles(enabled?) 入参
 *   - 删除角色：二次确认 onPositiveClick 回调触发 deleteRole API
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createTestingPinia } from '@pinia/testing';
import RolesPage from '../RolesPage.vue';
import { usePermissionStore } from '@/shared/stores/permission';

// ---- Mock 数据（使用 vi.hoisted 确保 vi.mock 工厂函数可以访问） ----
const { mockRoles } = vi.hoisted(() => ({
    mockRoles: [
        {
            id: '1',
            name: '超管',
            code: 'super_admin',
            description: '超级管理员',
            enabled: true,
            menuCount: 10,
        },
        {
            id: '2',
            name: '运营',
            code: 'ops',
            description: '运营角色',
            enabled: true,
            menuCount: 3,
        },
        {
            id: '3',
            name: '禁用角色',
            code: 'disabled_role',
            description: '已禁用',
            enabled: false,
            menuCount: 0,
        },
    ],
}));

// 提前把 mock API 模块暴露到 globalThis，让 mountWithPermissions 同步可读
const apiRef = vi.hoisted(() => {
    return { current: null as null | Record<string, ReturnType<typeof vi.fn>> };
});

// useDialog / useMessage 必须返回**稳定**的 mock 对象
const dialogMock = vi.hoisted(() => ({
    warning: vi.fn().mockResolvedValue(true),
}));
const messageMock = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}));

// ---- Mock API 模块 ----
vi.mock('@/api', () => {
    const mod = {
        getRoles: vi.fn().mockResolvedValue(mockRoles),
        createRole: vi.fn().mockResolvedValue(undefined),
        updateRole: vi.fn().mockResolvedValue(undefined),
        deleteRole: vi.fn().mockResolvedValue(undefined),
        getMenuTree: vi.fn().mockResolvedValue([]),
        getRoleById: vi.fn().mockResolvedValue({ menuIds: [] }),
        saveRolePermissions: vi.fn().mockResolvedValue(undefined),
    };
    apiRef.current = mod;
    return mod;
});

// ---- Mock vue-router ----
vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>();
    return {
        ...actual,
        createRouter: vi.fn().mockReturnValue({
            push: vi.fn(),
            replace: vi.fn(),
            addRoute: vi.fn(),
            removeRoute: vi.fn(),
            getRoutes: vi.fn(() => []),
            beforeEach: vi.fn(),
            afterEach: vi.fn(),
        }),
        createWebHashHistory: vi.fn(),
        useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    };
});

// ---- Mock Naive UI 的 useMessage / useDialog ----
vi.mock('naive-ui', async () => {
    const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui');
    return {
        ...actual,
        useMessage: () => messageMock,
        useDialog: () => dialogMock,
    };
});

/**
 * 组件内部状态类型（用于 vm 类型断言）
 */
interface RolesPageVM {
    isLoading: boolean;
    isFormModalVisible: boolean;
    isEdit: boolean;
    filters: { keyword: string; enabled: 'enabled' | 'disabled' | null };
    data: { id: string; name: string; code: string }[];
    columns: { key: string; render?: (row: (typeof mockRoles)[0]) => unknown }[];
    openForm: (row?: (typeof mockRoles)[0]) => void;
    onDelete: (row: (typeof mockRoles)[0]) => void;
    loadData: () => Promise<void>;
    onSearch: () => void;
    onReset: () => void;
}

/**
 * 组件挂载辅助函数
 */
function mountWithPermissions(
    options: {
        data?: (typeof mockRoles)[number][];
        permissions?: string[];
    } = {},
) {
    const pinia = createTestingPinia({ stubActions: false });
    if (apiRef.current) {
        vi.mocked(apiRef.current.getRoles).mockResolvedValue(options.data ?? mockRoles);
    }

    const wrapper = mount(RolesPage, {
        global: {
            plugins: [pinia],
            stubs: {
                NCard: {
                    name: 'NCard',
                    template: `
                        <div class="n-card">
                            <div class="n-card-header-extra"><slot name="header-extra" /></div>
                            <div class="n-card-content"><slot /></div>
                        </div>
                    `,
                },
                NButton: {
                    name: 'NButton',
                    template: `<button class="n-button" :class="extraClass" :disabled="disabled" @click="$emit('click')"><slot /></button>`,
                    props: ['type', 'size', 'loading', 'disabled', 'quaternary', 'ghost'],
                    computed: {
                        extraClass() {
                            return this.type ? `n-button--${this.type}` : '';
                        },
                    },
                },
                NDataTable: {
                    name: 'NDataTable',
                    template: `<div class="n-data-table" />`,
                    props: ['columns', 'data', 'bordered', 'loading', 'rowKey'],
                },
                NModal: {
                    name: 'NModal',
                    template: `
                        <div v-if="show" class="n-modal">
                            <div class="n-modal-title">{{ title }}</div>
                            <div class="n-modal-content"><slot /></div>
                            <div class="n-modal-footer"><slot name="footer" /></div>
                        </div>
                    `,
                    props: ['show', 'title', 'style', 'maskClosable', 'preset'],
                },
                NForm: { name: 'NForm', template: `<form class="n-form"><slot /></form>` },
                NFormItem: {
                    name: 'NFormItem',
                    template: `<div class="n-form-item"><slot /></div>`,
                },
                NInput: { name: 'NInput', template: `<input class="n-input" />` },
                NSwitch: { name: 'NSwitch', template: `<div class="n-switch" />` },
                NSpace: {
                    name: 'NSpace',
                    template: `<div class="n-space"><slot /></div>`,
                    props: ['size', 'justify', 'align', 'wrap'],
                },
                NTag: {
                    name: 'NTag',
                    template: `<span class="n-tag" :class="'n-tag--' + type"><slot /></span>`,
                    props: ['type', 'size'],
                },
                NIcon: { name: 'NIcon', template: `<span class="n-icon"><slot /></span>` },
                NTree: { name: 'NTree', template: `<div class="n-tree" />` },
                NSpin: { name: 'NSpin', template: `<div class="n-spin" />` },
                NTooltip: {
                    name: 'NTooltip',
                    template: `<div class="n-tooltip"><slot /></div>`,
                    props: ['trigger', 'disabled'],
                },
                Plus: { name: 'Plus', template: `<span>plus-icon</span>` },
                Search: { name: 'Search', template: `<span>search-icon</span>` },
                ChevronDown: { name: 'ChevronDown', template: `<span>chevron-down</span>` },
                ChevronUp: { name: 'ChevronUp', template: `<span>chevron-up</span>` },
                SearchGrid: {
                    name: 'SearchGrid',
                    template: `<div class="search-grid"><slot :overflow="true" /></div>`,
                    props: ['collapsed', 'collapsedRows', 'cols', 'xGap', 'yGap', 'responsive'],
                },
                NGrid: {
                    name: 'NGrid',
                    template: `<div class="n-grid"><slot /></div>`,
                    props: ['cols', 'collapsed', 'collapsedRows', 'xGap', 'yGap', 'responsive'],
                },
                NGi: {
                    name: 'NGi',
                    template: `<div class="n-gi"><slot :overflow="true" /></div>`,
                    props: ['suffix'],
                },
                NSelect: { name: 'NSelect', template: `<div class="n-select" />` },
            },
        },
    });

    const permStore = usePermissionStore();
    permStore.permissions = options.permissions ?? [];

    return wrapper;
}

describe('RolesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ==================== 权限控制测试 ====================
    describe('权限控制', () => {
        it("有 iam:role:create 权限时，'新增角色'按钮可见", async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:role:create'] });
            await flushPromises();
            const btn = wrapper.find('.n-card-header-extra .n-button');
            expect(btn.exists()).toBe(true);
            expect(btn.text()).toContain('新增角色');
        });

        it.todo("无 iam:role:create 权限时，'新增角色'按钮不可见");
        it.todo("有 iam:role:update 权限时，canEdit 为 true，表格操作列渲染'编辑'和'权限'按钮");
        it.todo("无 iam:role:update 权限时，canEdit 为 false，表格操作列无'编辑'和'权限'按钮");
        it.todo("有 iam:role:delete 权限时，canDelete 为 true，表格操作列有'删除'按钮");
        it.todo("无 iam:role:delete 权限时，canDelete 为 false，表格操作列无'删除'按钮");
    });

    // ==================== 数据加载测试 ====================
    describe('数据加载', () => {
        it('组件挂载时调用 getRoles 加载数据', async () => {
            mountWithPermissions({ permissions: ['iam:role:create'] });
            await flushPromises();
            expect(apiRef.current!.getRoles).toHaveBeenCalledTimes(1);
        });

        it('加载中显示 loading 状态', () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:role:create'] });
            const vm = wrapper.vm as unknown as RolesPageVM;
            expect(vm.isLoading).toBe(true);
        });

        it('加载完成后 loading 状态消失', async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:role:create'] });
            await flushPromises();
            const vm = wrapper.vm as unknown as RolesPageVM;
            expect(vm.isLoading).toBe(false);
        });
    });

    // ==================== 表单操作测试 ====================
    describe('表单操作', () => {
        it('调用 openForm() 打开弹窗', async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:role:create'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as RolesPageVM;
            expect(vm.isFormModalVisible).toBe(false);

            vm.openForm();
            await nextTick();

            expect(vm.isFormModalVisible).toBe(true);
        });

        it("弹窗标题为'新增角色'", async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:role:create'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as RolesPageVM;
            vm.openForm();
            await nextTick();

            expect(vm.isEdit).toBe(false);
            expect(vm.isFormModalVisible).toBe(true);

            const html = wrapper.html();
            expect(html).toContain('新增角色');
        });
    });

    // ==================== 状态字段测试 ====================
    describe('状态字段', () => {
        it('loadData 默认传 getRoles(undefined)（不筛选启用状态）', async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:role:create'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as RolesPageVM;
            expect(vm.filters.enabled).toBeNull();

            expect(apiRef.current!.getRoles).toHaveBeenCalledWith(undefined);
            vi.mocked(apiRef.current!.getRoles).mockClear();

            await vm.loadData();
            expect(apiRef.current!.getRoles).toHaveBeenCalledWith(undefined);
        });

        it("filters.enabled='enabled' 时 loadData 传 getRoles(true)", async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:role:create'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as RolesPageVM;
            vm.filters.enabled = 'enabled';
            await flushPromises();

            await vm.loadData();
            expect(apiRef.current!.getRoles).toHaveBeenCalledWith(true);
        });

        it("filters.enabled='disabled' 时 loadData 传 getRoles(false)", async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:role:create'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as RolesPageVM;
            vm.filters.enabled = 'disabled';
            await flushPromises();

            await vm.loadData();
            expect(apiRef.current!.getRoles).toHaveBeenCalledWith(false);
        });

        it('onReset 重置 enabled + keyword', async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:role:create'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as RolesPageVM;
            vm.filters.keyword = 'abc';
            vm.filters.enabled = 'disabled';
            await flushPromises();

            vm.onReset();
            await flushPromises();

            expect(vm.filters.keyword).toBe('');
            expect(vm.filters.enabled).toBeNull();
            expect(apiRef.current!.getRoles).toHaveBeenCalled();
        });
    });

    // ==================== 删除角色测试 ====================
    describe('删除角色', () => {
        it('onDelete 调 dialog.warning 并传 onPositiveClick 回调', async () => {
            const naiveUi = await import('naive-ui');
            const dialog = naiveUi.useDialog();
            vi.mocked(dialog.warning).mockClear();

            const wrapper = mountWithPermissions({
                permissions: ['iam:role:create'],
                data: mockRoles,
            });
            const vm = wrapper.vm as unknown as RolesPageVM;

            const normalRow = mockRoles.find((r) => r.code === 'ops')!;
            vm.onDelete(normalRow);

            expect(dialog.warning).toHaveBeenCalled();
            const opts = vi.mocked(dialog.warning).mock.calls[0][0] as {
                onPositiveClick?: unknown;
            };
            expect(typeof opts.onPositiveClick).toBe('function');
        });

        it('onDelete 的 onPositiveClick 回调调 deleteRole(row.id)', async () => {
            const naiveUi = await import('naive-ui');
            const dialog = naiveUi.useDialog();
            let capturedOnPositive: (() => Promise<void>) | undefined;
            vi.mocked(dialog.warning).mockImplementation(((options: {
                onPositiveClick?: (e?: MouseEvent) => Promise<void>;
            }) => {
                capturedOnPositive = options.onPositiveClick as () => Promise<void>;
                return undefined as never;
            }) as never);

            const deleteRole = apiRef.current!.deleteRole;

            const wrapper = mountWithPermissions({
                permissions: ['iam:role:create'],
                data: mockRoles,
            });
            const vm = wrapper.vm as unknown as RolesPageVM;

            const normalRow = mockRoles.find((r) => r.code === 'ops')!;
            vm.onDelete(normalRow);

            expect(dialog.warning).toHaveBeenCalled();
            expect(capturedOnPositive).toBeDefined();

            await capturedOnPositive!();
            expect(deleteRole).toHaveBeenCalledWith(normalRow.id);
        });
    });
});
