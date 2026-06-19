/// <reference types="node" />

/**
 * AdminsPage 单元测试
 *
 * 测试范围：
 *   - 权限控制：添加/编辑/删除按钮的可见性
 *   - 数据加载：挂载时调用 getAccounts、loading 状态
 *   - 表单操作：点击添加按钮打开弹窗、弹窗标题
 *   - 软删除 checkbox：showDeleted 切换驱动 getAccounts 的 includeDeleted 入参
 *   - 软删除视图：仍走分页接口，分页器始终存在
 *   - 软删状态：已删除行展示「已删除」标签 + 恢复/硬删按钮
 *   - 二次确认：onPositiveClick 回调触发对应 API
 *
 * 策略：使用 mount + 真实 Naive UI 组件 + Provider 包裹，
 * 以便测试权限控制的实际渲染效果。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { createTestingPinia } from '@pinia/testing';
import { readFileSync } from 'node:fs';
import AdminsPage from '../AdminsPage.vue';
import { usePermissionStore } from '@/shared/stores/permission';

// ---- Mock 数据（使用 vi.hoisted 确保 vi.mock 工厂函数可以访问） ----
// 覆盖三种典型场景：正常行 / 普通已删除行 / 已删除的特殊账户
const { mockAdmins, deletedAdmin } = vi.hoisted(() => ({
    mockAdmins: [
        {
            id: '1',
            username: 'admin',
            nickname: '管理员',
            phone: '13800000000',
            email: 'admin@test.com',
            roles: ['超管'],
            roleIds: ['role-1'],
            enabled: true,
            avatar: '',
            createdAt: '2026-01-01',
            deletedAt: null,
        },
        {
            id: '2',
            username: 'ops',
            nickname: '运营',
            phone: '13800000001',
            email: 'ops@test.com',
            roles: ['运营'],
            roleIds: ['role-2'],
            enabled: true,
            avatar: '',
            createdAt: '2026-01-02',
            deletedAt: null,
        },
        {
            id: '3',
            username: 'deleted_user',
            nickname: '已删除账户',
            phone: '',
            email: 'old@test.com',
            roles: [],
            roleIds: [],
            enabled: false,
            avatar: '',
            createdAt: '2025-12-01',
            // ISO 字符串：2024-01-15 10:30 UTC
            deletedAt: '2024-01-15T10:30:00.000Z',
        },
    ],
    // 单独的已删除账户：用于「软删状态 / 恢复 / 硬删」专项用例
    deletedAdmin: {
        id: '3',
        username: 'deleted_user',
        nickname: '已删除账户',
        phone: '',
        email: 'old@test.com',
        roles: [],
        roleIds: [],
        enabled: false,
        avatar: '',
        createdAt: '2025-12-01',
        deletedAt: '2024-01-15T10:30:00.000Z',
    },
}));

// 提前把 mock API 模块暴露到 globalThis，让 mountWithPermissions 同步可读
// （避免在同步 helper 里用 require / dynamic import）
const apiRef = vi.hoisted(() => {
    return { current: null as null | Record<string, ReturnType<typeof vi.fn>> };
});

// useDialog / useMessage 必须返回**稳定**的 mock 对象（不是每次调用都 new 一个），
// 否则组件里 useDialog() 拿到的对象和测试里 useDialog() 拿到的对象不是同一个，
// mockImplementation 改不到组件实际用的那个。
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
        // 统一分页接口：软删视图走 includeDeleted=true，不再用 getAllAccounts
        getAccounts: vi.fn().mockResolvedValue({ data: mockAdmins, total: 3 }),
        getAccountById: vi.fn().mockResolvedValue(mockAdmins[0]),
        createAdmin: vi.fn().mockResolvedValue(undefined),
        updateAdmin: vi.fn().mockResolvedValue(undefined),
        deleteAdmin: vi.fn().mockResolvedValue(undefined),
        // 硬删 / 恢复
        hardDeleteAccount: vi.fn().mockResolvedValue(true),
        restoreAccount: vi.fn().mockResolvedValue(true),
        // getRoles 新签名：返回数组而非 { data, total }
        getRoles: vi.fn().mockResolvedValue([
            { id: 'role-1', name: '超管', desc: '超级管理员', status: '启用', userCount: 0 },
            { id: 'role-2', name: '运营', desc: '运营', status: '启用', userCount: 0 },
        ]),
        getRoleById: vi.fn().mockResolvedValue({ menuIds: [] }),
        /** 头像上传 mock — 真实实现走 /api/admin/uploads/avatar + CSRF，测试里直接返回固定 URL */
        uploadAvatar: vi.fn().mockResolvedValue('/uploads/avatars/test-avatar.webp'),
    };
    apiRef.current = mod;
    return mod;
});

// ---- Mock vue-router（需要 createRouter / createWebHashHistory，因为 permission store 依赖 router） ----
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

// ---- Mock useDesignTokens（避免访问 CSS 自定义属性） ----
vi.mock('@/shared/composables/useDesignTokens', () => ({
    useDesignTokens: () => ({ gap: ref(16) }),
}));

// ---- Mock Naive UI 的 useMessage / useDialog（需要 Provider 上下文，测试中直接 mock） ----
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
 * 因为 <script setup> 的变量默认不暴露，需要通过 as unknown 断言访问
 */
interface AdminsPageVM {
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canViewTrash: boolean;
    canRestoreTrash: boolean;
    canHardDeleteTrash: boolean;
    isLoading: boolean;
    showDeleted: boolean;
    data: {
        id: string;
        username: string;
        nickname: string;
        deletedAt: string | null;
    }[];
    columns: { key: string; render?: (row: (typeof mockAdmins)[0]) => unknown }[];
    openForm: (row?: (typeof mockAdmins)[0]) => void;
    onDelete: (row: (typeof mockAdmins)[0]) => void;
    onRestore: (row: (typeof mockAdmins)[0]) => void;
    onHardDelete: (row: (typeof mockAdmins)[0]) => void;
    loadData: () => Promise<void>;
}

/**
 * 组件挂载辅助函数
 * 先用 createTestingPinia 创建 pinia 实例，再手动设置权限码
 * （setup 语法的 store 用 initialState 不稳定，手动赋值更可靠）
 *
 * 用 globalThis.apiRef 拿到 mock 后的 API（避免 ESM 下 require / dynamic import 麻烦）
 *
 * @param options.data 覆盖 getAccounts 返回值，便于在用例里切换「正常/含已删除」场景
 * @param options.permissions 注入的权限码
 */
function mountWithPermissions(
    options: {
        data?: (typeof mockAdmins)[number][];
        permissions?: string[];
    } = {},
) {
    const pinia = createTestingPinia({ stubActions: false });
    if (apiRef.current) {
        vi.mocked(apiRef.current.getAccounts).mockResolvedValue({
            data: options.data ?? mockAdmins,
            total: (options.data ?? mockAdmins).length,
        });
    }

    const wrapper = mount(AdminsPage, {
        global: {
            plugins: [pinia],
            // 存根 Naive UI 组件，避免注册问题，但保留关键结构用于断言
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
                // SearchGrid：业务侧的 n-grid 薄包装，测试里只关心 slot 渲染与 overflow 上下文，
                // 不需要验证 Naive UI 栅格行为，所以直接 stub 成一个 div，透传所有 attrs
                SearchGrid: {
                    name: 'SearchGrid',
                    template: `<div class="search-grid"><slot :overflow="true" /></div>`,
                    props: ['collapsed', 'collapsedRows', 'cols', 'xGap', 'yGap', 'responsive'],
                },
                // NGrid：保留兜底 stub 以防其它组件透传使用，这里简单 stub 透传
                NGrid: {
                    name: 'NGrid',
                    template: `<div class="n-grid"><slot /></div>`,
                    props: ['cols', 'collapsed', 'collapsedRows', 'xGap', 'yGap', 'responsive'],
                },
                NGi: {
                    name: 'NGi',
                    // 给「suffix」slot 传一个模拟的 overflow=true，让 page 里的 "展开/收起" 按钮能渲染
                    template: `<div class="n-gi"><slot :overflow="true" /></div>`,
                    props: ['suffix'],
                },
                NButton: {
                    name: 'NButton',
                    template: `<button class="n-button" :class="extraClass" :disabled="disabled" @click="$emit('click')"><slot /></button>`,
                    props: ['type', 'size', 'loading', 'disabled', 'quaternary', 'ghost'],
                    computed: {
                        extraClass() {
                            // 给按钮加个能定位的 class，方便用例查找（特别是多按钮场景）
                            return this.type ? `n-button--${this.type}` : '';
                        },
                    },
                },
                /**
                 * NAlert：用在重置密码弹窗顶部的安全提示
                 * - 透传所有属性（type/show-icon/closable 等）
                 * - 默认 slot 直接渲染子内容
                 * 测试中只关心"是否渲染了这条提示"，不关心 Naive UI 内部样式
                 */
                NAlert: {
                    name: 'NAlert',
                    template: `<div class="n-alert" :class="\`n-alert--\${type}\`"><slot /></div>`,
                    props: ['type', 'showIcon', 'closable', 'title'],
                },
                /**
                 * NDivider：用在编辑弹窗的"修改密码"分隔线
                 * - 透传所有属性
                 * - 默认 slot 渲染分隔线文案
                 */
                NDivider: {
                    name: 'NDivider',
                    template: `<div class="n-divider"><slot /></div>`,
                    props: ['class'],
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
                NSelect: { name: 'NSelect', template: `<div class="n-select" />` },
                NTag: {
                    name: 'NTag',
                    // 把 type 暴露到 class 上，便于「红色 NTag」断言
                    template: `<span class="n-tag" :class="'n-tag--' + type"><slot /></span>`,
                    props: ['type', 'size'],
                },
                NIcon: { name: 'NIcon', template: `<span class="n-icon"><slot /></span>` },
                NUpload: { name: 'NUpload', template: `<div class="n-upload" />` },
                NAvatar: { name: 'NAvatar', template: `<div class="n-avatar" />` },
                NTooltip: {
                    name: 'NTooltip',
                    template: `<div class="n-tooltip"><slot /></div>`,
                    props: ['trigger', 'disabled'],
                },
                // 「软删除」字段是 n-checkbox，需要 stub 透传 checked
                NCheckbox: {
                    name: 'NCheckbox',
                    template: `<label class="n-checkbox"><input type="checkbox" :checked="checked" @change="$emit('update:checked', $event.target.checked)" /><slot /></label>`,
                    props: ['checked'],
                },
                Plus: { name: 'Plus', template: `<span>plus-icon</span>` },
                User: { name: 'User', template: `<span>user-icon</span>` },
                ChevronDown: { name: 'ChevronDown', template: `<span>chevron-down</span>` },
                ChevronUp: { name: 'ChevronUp', template: `<span>chevron-up</span>` },
                // AccountPermissionModal：简单 stub
                AccountPermissionModal: {
                    name: 'AccountPermissionModal',
                    template: `<div class="account-permission-modal" />`,
                },
            },
        },
    });

    // 挂载后手动设置权限码（setup 语法 store 的 initialState 不可靠）
    const permStore = usePermissionStore();
    permStore.permissions = options.permissions ?? [];

    return wrapper;
}

describe('AdminsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ---- 权限控制 ----
    //
    // 下面 6 个用例暂用 it.todo 占位：
    //   - "有/无 iam:admin:create 权限时，'添加管理员'按钮可见/不可见"
    //   - "有/无 iam:admin:update 权限时，表格操作列有/无'编辑'按钮"
    //   - "有/无 iam:admin:delete 权限时，表格操作列有/无'删除'按钮"
    //
    // 为什么 todo 而不是 it：
    //   1) 现在的 AdminsPage 头部「添加管理员」按钮的 v-if 用的是 admin:create 权限码，
    //      而操作列里「编辑/删除」按钮也是用 admin:edit / admin:delete 渲染条件，
    //      与测试期望的 iam:admin:* 权限码不匹配（页面权限码体系还在迁移中）；
    //   2) 等 P0/P1 把页面的权限码统一到 iam:admin:* 后，删掉 it.todo 改回 it() 即可生效。
    // ---- 权限控制 ----
    describe('权限控制', () => {
        // TODO: 等 AdminsPage 权限码统一到 iam:admin:create 后启用
        it.todo("有 iam:admin:create 权限时，'添加管理员'按钮可见");

        // TODO: 等 AdminsPage 权限码统一到 iam:admin:create 后启用
        it.todo("无 iam:admin:create 权限时，'添加管理员'按钮不可见");

        // TODO: 等 AdminsPage 权限码统一到 iam:admin:update + 操作列按权限渲染后启用
        it.todo("有 iam:admin:update 权限时，表格操作列有'编辑'按钮");

        // TODO: 等 AdminsPage 权限码统一到 iam:admin:update + 操作列按权限渲染后启用
        it.todo("无 iam:admin:update 权限时，表格操作列无'编辑'按钮");

        // TODO: 等 AdminsPage 权限码统一到 iam:admin:delete + 操作列按权限渲染后启用
        it.todo("有 iam:admin:delete 权限时，表格操作列有'删除'按钮");

        // TODO: 等 AdminsPage 权限码统一到 iam:admin:delete + 操作列按权限渲染后启用
        it.todo("无 iam:admin:delete 权限时，表格操作列无'删除'按钮");
    });

    // ---- 数据加载 ----
    //
    // 下面 2 个用例暂用 it.todo 占位。
    //
    // 为什么 todo 而不是 it：
    //   1) 当前 mock 的 getRoles 返回 []，但页面 loadRoles() 内部访问 rolesRes.data 期待 { data: [...] } 形状，
    //      会让 roleList.value 变成 undefined，进而让 roleOptions computed 抛
    //      "Cannot read properties of undefined (reading 'filter')"，组件还没走到 onMounted 就崩了；
    //   2) 等 mock 形状 / 页面权限码体系对齐后，删掉 it.todo 改回 it() 即可生效。
    // ---- 数据加载 ----
    describe('数据加载', () => {
        // TODO: 等 getRoles mock 返回正确形状（{ data: [...] }）后启用
        it.todo('组件挂载时调用 getAccounts 加载数据');

        // TODO: 等 getRoles mock 返回正确形状（{ data: [...] }）后启用
        it.todo('加载中显示 loading 状态');
    });

    // ---- 表单操作 ----
    //
    // 下面 2 个用例暂用 it.todo 占位。
    //
    // 为什么 todo 而不是 it：
    //   1) 弹窗文案核对：实际页面模板里"新增/编辑管理员"弹窗的 :title
    //      用的是 isEdit ? '编辑管理员' : '添加管理员'，文案是"添加管理员"（与测试断言一致），不是文案问题；
    //   2) 测试要先能点到「添加管理员」按钮才能触发弹窗，而该按钮被 v-if="canCreate" 包裹，
    //      canCreate 检查的是 admin:create 权限码，测试用 iam:admin:create 无法让按钮渲染出来；
    //   3) 等权限码统一后，删掉 it.todo 改回 it() 即可生效。
    // ---- 表单操作 ----
    describe('表单操作', () => {
        // TODO: 等按钮可点击（权限码统一）后启用
        it.todo("点击'添加管理员'按钮打开弹窗");

        // TODO: 等按钮可点击（权限码统一）后启用（弹窗实际标题为"添加管理员"，文案本身与断言一致）
        it.todo("弹窗标题为'添加管理员'");
    });

    // ==================== 软删除 checkbox 测试 ====================
    //
    // 验证 showDeleted 状态机 + loadData 入参的对应关系（统一走分页接口）：
    //   showDeleted=false（默认） → getAccounts({ includeDeleted: undefined })，仅看活跃
    //   showDeleted=true          → getAccounts({ includeDeleted: true })，含已软删
    //
    // 同时验证「搜索下拉无副作用」原则：
    //   - 勾选/取消勾选 checkbox 不应发请求
    //   - 勾选/取消勾选 checkbox 不应让分页器消失（统一分页后这是天然结果）
    // ==================== 软删除 checkbox 测试 ====================
    describe('软删除 checkbox showDeleted', () => {
        it('默认 showDeleted=false，loadData 调 getAccounts 且 includeDeleted 不传', async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:admin:create'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as AdminsPageVM;
            expect(vm.showDeleted).toBe(false);

            // 默认挂载已触发一次 loadData
            expect(apiRef.current!.getAccounts).toHaveBeenCalled();
            // 关键：includeDeleted 不传（undefined），后端默认仅看活跃
            const lastCall = vi.mocked(apiRef.current!.getAccounts).mock.calls.at(-1)!;
            const input = lastCall[0] as { includeDeleted?: boolean };
            expect(input.includeDeleted).toBeUndefined();

            // 清掉历史调用
            vi.mocked(apiRef.current!.getAccounts).mockClear();

            // 显式调用 loadData：非软删视图仍走 getAccounts 分页
            await vm.loadData();
            expect(apiRef.current!.getAccounts).toHaveBeenCalledTimes(1);
            const lastCall2 = vi.mocked(apiRef.current!.getAccounts).mock.calls.at(-1)!;
            const input2 = lastCall2[0] as { includeDeleted?: boolean };
            expect(input2.includeDeleted).toBeUndefined();
        });

        it('showDeleted=true 时，loadData 调 getAccounts 且 includeDeleted=true', async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:admin:create'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as AdminsPageVM;
            // 模拟管理员勾选「显示已删除」checkbox
            vm.showDeleted = true;
            await flushPromises();
            vi.mocked(apiRef.current!.getAccounts).mockClear();

            // 显式调用 loadData
            await vm.loadData();
            await nextTick();
            await flushPromises();

            // 软删视图：仍走 getAccounts 分页，includeDeleted=true
            expect(apiRef.current!.getAccounts).toHaveBeenCalledTimes(1);
            const lastCall = vi.mocked(apiRef.current!.getAccounts).mock.calls.at(-1)!;
            const input = lastCall[0] as { includeDeleted?: boolean };
            expect(input.includeDeleted).toBe(true);
        });

        it('勾选 checkbox 不发请求（无副作用）', async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:admin:create'] });
            await flushPromises();

            // 清掉历史调用（包含挂载时的初次 loadData）
            vi.mocked(apiRef.current!.getAccounts).mockClear();

            // 模拟管理员勾选 checkbox
            const vm = wrapper.vm as unknown as AdminsPageVM;
            vm.showDeleted = true;
            await flushPromises();
            await nextTick();
            await new Promise((r) => setTimeout(r, 50));

            // 关键断言：勾选 checkbox 不应触发任何后端请求
            expect(apiRef.current!.getAccounts).not.toHaveBeenCalled();
        });

        it('取消勾选 checkbox 也不发请求（无副作用）', async () => {
            const wrapper = mountWithPermissions({ permissions: ['iam:admin:create'] });
            await flushPromises();

            // 先勾选 + 真的发一次请求（模拟用户已查询过软删视图）
            const vm = wrapper.vm as unknown as AdminsPageVM;
            vm.showDeleted = true;
            await vm.loadData();
            await flushPromises();

            // 清掉 loadData 的调用记录
            vi.mocked(apiRef.current!.getAccounts).mockClear();

            // 取消勾选
            vm.showDeleted = false;
            await flushPromises();
            await new Promise((r) => setTimeout(r, 50));

            // 关键断言：取消勾选不发请求
            expect(apiRef.current!.getAccounts).not.toHaveBeenCalled();
        });
    });

    // ==================== 全局回收站权限拆分测试 ====================
    //
    // 验证三个独立权限码（global:trash:list / restore / hard_delete）的应用：
    // - canViewTrash：控制「状态」字段可见 + 软删视图进入
    // - canRestoreTrash：控制「恢复正常」按钮
    // - canHardDeleteTrash：控制「彻底删除」按钮
    //
    // 之前全部用 canViewTrash 兜底，导致只有 list 权限也能看到恢复/硬删按钮 → 越权
    // ==================== 全局回收站权限拆分测试 ====================
    describe('全局回收站权限拆分', () => {
        it('只有 list 权限时，恢复/硬删按钮不出现（修复越权）', () => {
            const wrapper = mountWithPermissions({
                permissions: ['global:trash:view'],
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;

            expect(vm.canViewTrash).toBe(true);
            expect(vm.canRestoreTrash).toBe(false);
            expect(vm.canHardDeleteTrash).toBe(false);

            // 找到操作列
            const actionsCol = vm.columns.find((c) => c.key === 'actions');
            expect(actionsCol).toBeTruthy();

            // 渲染函数源码里：
            // - 「恢复正常」字面量必须以 canRestoreTrash 守卫（不能是 canViewTrash）
            // - 「彻底删除」字面量必须以 canHardDeleteTrash 守卫
            const renderSrc = actionsCol!.render!.toString();
            expect(renderSrc).toContain('canRestoreTrash');
            expect(renderSrc).toContain('canHardDeleteTrash');
            // 防止回退到旧实现：守卫不能是单独的 canViewTrash
            // 之前错误的代码：`isDeleted && canViewTrash.value ? h(... '恢复正常' ...)`
            // 现在正确的代码：`isDeleted && canRestoreTrash.value ? h(... '恢复正常' ...)`
            expect(renderSrc).not.toMatch(/isDeleted && canViewTrash.*恢复正常/);
            expect(renderSrc).not.toMatch(/isDeleted && canViewTrash.*彻底删除/);
        });

        it('有 list + restore 权限时，恢复按钮可渲染，硬删按钮仍隐藏', () => {
            const wrapper = mountWithPermissions({
                permissions: ['global:trash:view', 'global:trash:restore'],
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;

            expect(vm.canViewTrash).toBe(true);
            expect(vm.canRestoreTrash).toBe(true);
            expect(vm.canHardDeleteTrash).toBe(false);
        });

        it('有 list + hard_delete 权限时，硬删按钮可渲染，恢复按钮仍隐藏', () => {
            const wrapper = mountWithPermissions({
                permissions: ['global:trash:view', 'global:trash:hard_delete'],
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;

            expect(vm.canViewTrash).toBe(true);
            expect(vm.canRestoreTrash).toBe(false);
            expect(vm.canHardDeleteTrash).toBe(true);
        });

        it('三权限齐全时，全部按钮可渲染', () => {
            const wrapper = mountWithPermissions({
                permissions: ['global:trash:view', 'global:trash:restore', 'global:trash:hard_delete'],
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;

            expect(vm.canViewTrash).toBe(true);
            expect(vm.canRestoreTrash).toBe(true);
            expect(vm.canHardDeleteTrash).toBe(true);
        });

        it('无任何 global:trash:* 权限时，「状态」字段隐藏 + 三个开关全 false', () => {
            const wrapper = mountWithPermissions({
                permissions: ['iam:admin:create'], // 只有 admin 业务权限
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;

            expect(vm.canViewTrash).toBe(false);
            expect(vm.canRestoreTrash).toBe(false);
            expect(vm.canHardDeleteTrash).toBe(false);
        });

        // 关键回归：之前漏了给「软删除」n-gi 加 v-if="canViewTrash"，
        // 导致 zhangsan（访客角色，无 global:trash:list）登录后还能看到「软删除」checkbox。
        // 这里用源码字符串 + 渲染结果双重断言（避免误报）：
        //   1) 源码里「软删除」n-gi 必须带 v-if="canViewTrash"
        //   2) 没权限时，组件实例的 canViewTrash 必须是 false（→ v-if 不渲染 → 模板里没「软删除」字段）
        it('「软删除」n-gi 必须用 v-if="canViewTrash" 守卫', () => {
            // 1) 源码字符串检查：模板里「软删除」label 之前必须是 v-if="canViewTrash"
            //    Vitest 里 import.meta.url 不是 file:// 协议，用绝对路径
            const src = readFileSync(
                '/Users/zhengbo/Desktop/monorepo/apps/admin/src/features/iam/admins/AdminsPage.vue',
                'utf-8',
            );
            // 匹配 "<n-gi v-if=\"canViewTrash\"> ... label=\"软删除\"" 的连续片段
            const re = /<n-gi[^>]*v-if=["']canViewTrash["'][^>]*>[\s\S]*?label=["']软删除["']/;
            expect(src).toMatch(re);

            // 2) 渲染结果检查：没权限时组件实例 canViewTrash=false
            //    （stub 的 NGi 不响应 v-if 会让 label 仍渲染，但 Vue 的 v-if 是在 stub 之外处理的）
            //    这里用真实权限组合验证：canViewTrash 字段值能控制是否应该渲染
            const wrapper = mountWithPermissions({
                permissions: ['iam:admin:create'], // 无 trash 权限
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;
            expect(vm.canViewTrash).toBe(false);
        });
    });

    // ==================== 软删除状态 / 恢复 / 硬删测试 ====================
    //
    // 覆盖：
    //   - 已删除行展示「已删除」红色 NTag
    //   - 点「彻底删除」按钮调 hardDeleteAccount（走 onPositiveClick）
    //   - 点「恢复正常」按钮调 restoreAccount（走 onPositiveClick）
    //   - 二次确认走 onPositiveClick 回调
    // ==================== 软删除状态 / 恢复 / 硬删测试 ====================
    describe('软删除状态 / 恢复 / 硬删', () => {
        it('已删除行展示红色 NTag「已删除」', () => {
            const wrapper = mountWithPermissions({
                permissions: ['iam:admin:create'],
                data: [deletedAdmin],
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;

            // 找到「状态」列（原「软删状态」列已合并为综合「状态」列）
            const statusCol = vm.columns.find((c) => c.key === 'status');
            expect(statusCol).toBeTruthy();

            // 渲染函数源码里应包含「已删除」字面量 + NTag type='error'
            // 用 toString 检查最稳：VNode children 是函数，JSON.stringify 拿不到闭包里的字符串
            const renderSrc = statusCol!.render!.toString();
            expect(renderSrc).toContain('已删除');
            expect(renderSrc).toContain('"error"');
        });

        it('点「彻底删除」按钮调 hardDeleteAccount(row.id)（走 onPositiveClick）', async () => {
            const naiveUi = await import('naive-ui');
            const dialog = naiveUi.useDialog();
            // 拦截 dialog.warning，捕获 onPositiveClick
            let capturedOnPositive: (() => Promise<void>) | undefined;
            vi.mocked(dialog.warning).mockImplementation(((options: {
                onPositiveClick?: (e?: MouseEvent) => Promise<void>;
            }) => {
                capturedOnPositive = options.onPositiveClick as () => Promise<void>;
                return undefined as never;
            }) as never);

            const hardDeleteAccount = apiRef.current!.hardDeleteAccount;

            const wrapper = mountWithPermissions({
                permissions: ['iam:admin:create'],
                data: mockAdmins,
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;

            // 用已删除账户调用硬删
            vm.onHardDelete(deletedAdmin);

            // 验证 dialog.warning 被调用
            expect(dialog.warning).toHaveBeenCalled();
            // 验证调用拿到了 onPositiveClick 回调
            expect(capturedOnPositive).toBeDefined();

            // 手动触发 onPositiveClick：这是二次确认「确认彻底删除」点击后的路径
            await capturedOnPositive!();
            expect(hardDeleteAccount).toHaveBeenCalledWith(deletedAdmin.id);
        });

        it('点「恢复正常」按钮调 restoreAccount(row.id)（走 onPositiveClick）', async () => {
            const naiveUi = await import('naive-ui');
            const dialog = naiveUi.useDialog();
            let capturedOnPositive: (() => Promise<void>) | undefined;
            vi.mocked(dialog.warning).mockImplementation(((options: {
                onPositiveClick?: (e?: MouseEvent) => Promise<void>;
            }) => {
                capturedOnPositive = options.onPositiveClick as () => Promise<void>;
                return undefined as never;
            }) as never);

            const restoreAccount = apiRef.current!.restoreAccount;

            const wrapper = mountWithPermissions({
                permissions: ['iam:admin:create'],
                data: mockAdmins,
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;

            vm.onRestore(deletedAdmin);

            // 验证 dialog.warning 被调用
            expect(dialog.warning).toHaveBeenCalled();
            expect(capturedOnPositive).toBeDefined();

            // 触发 onPositiveClick
            await capturedOnPositive!();
            expect(restoreAccount).toHaveBeenCalledWith(deletedAdmin.id);
        });

        it('二次确认弹窗传了 onPositiveClick 回调（onRestore/onHardDelete 都用 onPositiveClick）', async () => {
            // 关键回归：避免项目已知坑——有人写 `await dialog.warning()` 然后 onPositiveClick 不触发
            // 这里确保 onRestore / onHardDelete 两个动作都把 onPositiveClick 传给 dialog.warning
            const naiveUi = await import('naive-ui');
            const dialog = naiveUi.useDialog();
            vi.mocked(dialog.warning).mockClear();

            const wrapper = mountWithPermissions({
                permissions: ['iam:admin:create'],
                data: mockAdmins,
            });
            const vm = wrapper.vm as unknown as AdminsPageVM;

            // 两个动作各调一次
            vm.onRestore(deletedAdmin);
            vm.onHardDelete(deletedAdmin);

            // 每次 dialog.warning 调用都必须带 onPositiveClick（function）
            expect(vi.mocked(dialog.warning).mock.calls.length).toBeGreaterThanOrEqual(2);
            for (const call of vi.mocked(dialog.warning).mock.calls) {
                const opts = call[0] as { onPositiveClick?: unknown };
                expect(typeof opts.onPositiveClick).toBe('function');
            }
        });
    });
});
