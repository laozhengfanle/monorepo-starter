/**
 * CachePage 缓存管理页面 单元测试
 *
 * 测试范围：
 *   - 权限控制：批量删除 / 按 pattern 清空按钮的可见性
 *   - 数据加载：组件挂载时调用 listCacheKeys + getCacheKeyTotal + getCacheStats
 *   - 搜索：点"查询"按钮触发 listCacheKeys 重新加载
 *   - 单条删除：调 deleteCacheKey
 *   - 批量删除：调 deleteCacheKeys
 *   - 按 pattern 清空：调 clearCacheByPattern
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createTestingPinia } from '@pinia/testing';
import CachePage from '../CachePage.vue';
import { usePermissionStore } from '@/shared/stores/permission';

// ---- Mock 数据 ----
const { mockKeys, mockStats } = vi.hoisted(() => ({
    mockKeys: [
        { key: 'mono:auth:login:user-1', type: 'string', ttl: 60, value: '{"id":"user-1"}', size: 15 },
        { key: 'mono:user:profile:1', type: 'string', ttl: -1, value: 'profile-data', size: 12 },
        { key: 'mono:menu:role:admin', type: 'string', ttl: 300, value: '[1,2,3,4,5]', size: 11 },
    ],
    mockStats: { usedMemory: '1.23 MB', hitRate: '87.50%', uptime: '3 天 5 小时' },
}));

// 提前把 mock API 暴露到 globalThis
const apiRef = vi.hoisted(() => {
    return { current: null as null | Record<string, ReturnType<typeof vi.fn>> };
});

/** 局部类型：dialog.warning 接收的 options 子集（避免 any） */
interface DialogWarningOptions {
    title?: string;
    content?: string;
    positiveText?: string;
    negativeText?: string;
    onPositiveClick?: () => void | Promise<void>;
    onNegativeClick?: () => void | Promise<void>;
}

const dialogMock = vi.hoisted(() => ({
    warning: vi.fn().mockResolvedValue(true),
}));
const messageMock = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}));

// ---- Mock API ----
vi.mock('@/api', () => {
    const mod = {
        listCacheKeys: vi.fn().mockResolvedValue(mockKeys),
        getCacheKeyTotal: vi.fn().mockResolvedValue(mockKeys.length),
        getCacheKey: vi.fn().mockResolvedValue(mockKeys[0]),
        getCacheStats: vi.fn().mockResolvedValue(mockStats),
        deleteCacheKey: vi.fn().mockResolvedValue(true),
        deleteCacheKeys: vi.fn().mockResolvedValue({ deletedCount: 2, keys: ['a', 'b'] }),
        clearCacheByPattern: vi.fn().mockResolvedValue(5),
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

interface CachePageVM {
    isLoading: boolean;
    isClearing: boolean;
    filters: { pattern: string };
    allData: { key: string }[];
    stats: { usedMemory: string; hitRate: string; uptime: string };
    checkedRowKeys: string[];
    detailVisible: boolean;
    detailRow: { key: string } | null;
    patternModalVisible: boolean;
    clearPattern: string;
    page: number;
    pageSize: number;
    total: number;
    onSearch: () => void;
    onReset: () => void;
    onRefresh: () => Promise<void>;
    onDeleteOne: (row: { key: string; type?: string; ttl?: number; value?: string | null; size?: number }) => void;
    onBatchDelete: () => void;
    onOpenClearByPattern: () => void;
    onClearByPattern: () => Promise<void>;
    loadData: (page: number, pageSize: number) => Promise<void>;
}

/**
 * 组件挂载辅助函数
 */
function mountWithPermissions(options: { permissions?: string[] } = {}) {
    const pinia = createTestingPinia({ stubActions: false });
    if (apiRef.current) {
        vi.mocked(apiRef.current.listCacheKeys).mockResolvedValue(mockKeys);
        vi.mocked(apiRef.current.getCacheKeyTotal).mockResolvedValue(mockKeys.length);
    }

    const wrapper = mount(CachePage, {
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
                    props: ['columns', 'data', 'bordered', 'loading', 'rowKey', 'checkedRowKeys', 'pagination'],
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
                NFormItem: { name: 'NFormItem', template: `<div class="n-form-item"><slot /></div>` },
                NInput: { name: 'NInput', template: `<input class="n-input" />` },
                NAlert: { name: 'NAlert', template: `<div class="n-alert"><slot /></div>` },
                NSpace: {
                    name: 'NSpace',
                    template: `<div class="n-space"><slot /></div>`,
                    props: ['size', 'justify', 'align'],
                },
                NTag: {
                    name: 'NTag',
                    template: `<span class="n-tag" :class="'n-tag--' + type"><slot /></span>`,
                    props: ['type', 'size'],
                },
                NIcon: { name: 'NIcon', template: `<span class="n-icon"><slot /></span>` },
                NGrid: {
                    name: 'NGrid',
                    template: `<div class="n-grid"><slot /></div>`,
                    props: ['cols', 'xGap', 'yGap', 'responsive'],
                },
                NGi: { name: 'NGi', template: `<div class="n-gi"><slot :overflow="true" /></div>` },
                SearchGrid: {
                    name: 'SearchGrid',
                    template: `<div class="search-grid"><slot :overflow="true" /></div>`,
                    props: ['collapsed', 'collapsedRows', 'cols', 'xGap', 'yGap', 'responsive'],
                },
                Refresh: { name: 'Refresh', template: `<span>refresh-icon</span>` },
                Trash: { name: 'Trash', template: `<span>trash-icon</span>` },
                Filter: { name: 'Filter', template: `<span>filter-icon</span>` },
                Search: { name: 'Search', template: `<span>search-icon</span>` },
                ChevronDown: { name: 'ChevronDown', template: `<span>chevron-down</span>` },
                ChevronUp: { name: 'ChevronUp', template: `<span>chevron-up</span>` },
            },
        },
    });

    const permStore = usePermissionStore();
    permStore.permissions = options.permissions ?? [];

    return wrapper;
}

describe('CachePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ==================== 权限控制测试 ====================
    describe('权限控制', () => {
        it('有 config:cache:delete 权限时，按钮可见（批量删除 / 按 pattern 清空）', async () => {
            const wrapper = mountWithPermissions({ permissions: ['config:cache:view', 'config:cache:delete'] });
            await flushPromises();
            const html = wrapper.html();
            expect(html).toContain('按 Pattern 清空');
            expect(html).toContain('批量删除');
        });

        it('无 config:cache:delete 权限时，危险按钮不可见', async () => {
            const wrapper = mountWithPermissions({ permissions: ['config:cache:view'] });
            await flushPromises();
            const html = wrapper.html();
            expect(html).not.toContain('按 Pattern 清空');
            expect(html).not.toContain('批量删除');
        });
    });

    // ==================== 数据加载测试 ====================
    describe('数据加载', () => {
        it('组件挂载时调用 listCacheKeys + getCacheKeyTotal + getCacheStats', async () => {
            mountWithPermissions({ permissions: ['config:cache:view'] });
            await flushPromises();
            expect(apiRef.current!.listCacheKeys).toHaveBeenCalledTimes(1);
            expect(apiRef.current!.getCacheKeyTotal).toHaveBeenCalledTimes(1);
            expect(apiRef.current!.getCacheStats).toHaveBeenCalledTimes(1);
        });

        it('加载完成 stats 被填充', async () => {
            const wrapper = mountWithPermissions({ permissions: ['config:cache:view'] });
            await flushPromises();
            const vm = wrapper.vm as unknown as CachePageVM;
            expect(vm.stats).toEqual(mockStats);
        });

        it('加载完成 isLoading 变 false', async () => {
            const wrapper = mountWithPermissions({ permissions: ['config:cache:view'] });
            await flushPromises();
            const vm = wrapper.vm as unknown as CachePageVM;
            expect(vm.isLoading).toBe(false);
        });
    });

    // ==================== 搜索 / 重置测试 ====================
    describe('搜索 / 重置', () => {
        it('onSearch 重置 page=1 并调 listCacheKeys', async () => {
            const wrapper = mountWithPermissions({ permissions: ['config:cache:view'] });
            await flushPromises();
            vi.mocked(apiRef.current!.listCacheKeys).mockClear();

            const vm = wrapper.vm as unknown as CachePageVM;
            vm.filters.pattern = 'mono:auth:*';
            vm.onSearch();

            expect(apiRef.current!.listCacheKeys).toHaveBeenCalledWith(
                expect.objectContaining({ pattern: 'mono:auth:*' }),
            );
        });

        it('onReset 清空 filters 并重新加载', async () => {
            const wrapper = mountWithPermissions({ permissions: ['config:cache:view'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as CachePageVM;
            vm.filters.pattern = 'mono:auth:*';
            vm.onReset();
            await flushPromises();

            expect(vm.filters.pattern).toBe('');
            expect(apiRef.current!.listCacheKeys).toHaveBeenCalledWith(expect.objectContaining({ pattern: '*' }));
        });
    });

    // ==================== 删除测试 ====================
    describe('删除', () => {
        it('onDeleteOne 弹确认框 + 确认后调 deleteCacheKey', async () => {
            dialogMock.warning.mockImplementation((opts: DialogWarningOptions) => {
                opts.onPositiveClick?.();
                return Promise.resolve(true);
            });
            const wrapper = mountWithPermissions({ permissions: ['config:cache:delete'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as CachePageVM;
            vm.onDeleteOne({ key: 'k1', type: 'string', ttl: 60, value: 'v', size: 1 });
            await flushPromises();

            expect(dialogMock.warning).toHaveBeenCalled();
            expect(apiRef.current!.deleteCacheKey).toHaveBeenCalledWith('k1');
        });

        it('onBatchDelete 传选中的 key 列表到 deleteCacheKeys', async () => {
            dialogMock.warning.mockImplementation((opts: DialogWarningOptions) => {
                opts.onPositiveClick?.();
                return Promise.resolve(true);
            });
            const wrapper = mountWithPermissions({ permissions: ['config:cache:delete'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as CachePageVM;
            vm.checkedRowKeys = ['a', 'b', 'c'];
            vm.onBatchDelete();
            await flushPromises();

            expect(apiRef.current!.deleteCacheKeys).toHaveBeenCalledWith(['a', 'b', 'c']);
        });
    });

    // ==================== 按 Pattern 清空测试 ====================
    describe('按 Pattern 清空', () => {
        it('onOpenClearByPattern 打开 modal 并预填当前 pattern', async () => {
            const wrapper = mountWithPermissions({ permissions: ['config:cache:delete'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as CachePageVM;
            vm.filters.pattern = 'mono:auth:*';
            vm.onOpenClearByPattern();
            await nextTick();

            expect(vm.patternModalVisible).toBe(true);
            expect(vm.clearPattern).toBe('mono:auth:*');
        });

        it('onClearByPattern 调 clearCacheByPattern', async () => {
            const wrapper = mountWithPermissions({ permissions: ['config:cache:delete'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as CachePageVM;
            vm.clearPattern = 'mono:user:*';
            await vm.onClearByPattern();
            await flushPromises();

            expect(apiRef.current!.clearCacheByPattern).toHaveBeenCalledWith('mono:user:*');
            expect(vm.patternModalVisible).toBe(false);
        });

        it('空 pattern 应给警告且不调后端', async () => {
            const wrapper = mountWithPermissions({ permissions: ['config:cache:delete'] });
            await flushPromises();

            const vm = wrapper.vm as unknown as CachePageVM;
            vm.clearPattern = '';
            await vm.onClearByPattern();
            await flushPromises();

            expect(messageMock.warning).toHaveBeenCalled();
            expect(apiRef.current!.clearCacheByPattern).not.toHaveBeenCalled();
        });
    });
});
