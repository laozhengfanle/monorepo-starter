<!--
    缓存管理页面 — 配置中心 → 缓存管理

    核心能力：
    1. 顶部统计卡片：已用内存 / 命中率 / 运行时长（来自 Redis INFO）
    2. 列表：按 SCAN pattern 列出缓存 key，支持服务端分页
    3. 详情：点行内"详情"按钮查看完整 key / type / ttl / value
    4. 删除：单条删除 / 批量删除 / 按 pattern 批量清空
-->
<template>
    <n-card title="缓存管理" class="w-full min-w-0">
        <template #header-extra>
            <n-space align="center" :size="8">
                <n-button @click="onRefresh">
                    <template #icon>
                        <n-icon><Refresh /></n-icon>
                    </template>
                    刷新
                </n-button>
                <n-button
                    v-if="canDelete"
                    @mousedown="(e: MouseEvent) => e.preventDefault()"
                    @click="onOpenClearByPattern"
                >
                    <template #icon>
                        <n-icon><Filter /></n-icon>
                    </template>
                    按 Pattern 清空
                </n-button>
                <n-button
                    v-if="canDelete"
                    type="error"
                    ghost
                    :disabled="checkedRowKeys.length === 0"
                    @click="onBatchDelete"
                >
                    <template #icon>
                        <n-icon><Trash /></n-icon>
                    </template>
                    批量删除 ({{ checkedRowKeys.length }})
                </n-button>
            </n-space>
        </template>

        <!-- 顶部统计卡片（3 个） -->
        <n-grid :x-gap="16" :y-gap="16" cols="1 768:3" responsive="self" class="mb-4">
            <n-gi>
                <n-card size="small" :bordered="false" class="bg-gray-50 dark:bg-[rgb(47,47,51)]">
                    <div class="text-xs text-gray-500 mb-1">已用内存</div>
                    <div class="text-xl font-semibold font-mono">{{ stats.usedMemory }}</div>
                </n-card>
            </n-gi>
            <n-gi>
                <n-card size="small" :bordered="false" class="bg-gray-50 dark:bg-[rgb(47,47,51)]">
                    <div class="text-xs text-gray-500 mb-1">命中率</div>
                    <div class="text-xl font-semibold font-mono">{{ stats.hitRate }}</div>
                </n-card>
            </n-gi>
            <n-gi>
                <n-card size="small" :bordered="false" class="bg-gray-50 dark:bg-[rgb(47,47,51)]">
                    <div class="text-xs text-gray-500 mb-1">运行时长</div>
                    <div class="text-xl font-semibold font-mono">{{ stats.uptime }}</div>
                </n-card>
            </n-gi>
        </n-grid>

        <!-- 筛选区域 -->
        <n-form label-placement="left" label-align="right" label-width="5rem" :show-feedback="false" class="my-(--gap)">
            <SearchGrid :collapsed="isCollapsed" :collapsed-rows="1">
                <n-gi>
                    <n-form-item label="Pattern">
                        <n-input v-model:value="filters.pattern" placeholder="如 mono:auth:*、mono:user:1" clearable />
                    </n-form-item>
                </n-gi>
                <n-gi suffix #="{ overflow }">
                    <n-form-item>
                        <template #label>
                            <span class="sr-only">操作</span>
                        </template>
                        <n-space align="center">
                            <n-button type="primary" @click="onSearch">查询</n-button>
                            <n-button @click="onReset">重置</n-button>
                            <n-button
                                v-if="overflow || !isCollapsed"
                                dashed
                                type="primary"
                                @click="isCollapsed = !isCollapsed"
                            >
                                {{ isCollapsed ? '展开' : '收起' }}
                                <template #icon>
                                    <n-icon>
                                        <ChevronDown v-if="isCollapsed" />
                                        <ChevronUp v-else />
                                    </n-icon>
                                </template>
                            </n-button>
                        </n-space>
                    </n-form-item>
                </n-gi>
            </SearchGrid>
        </n-form>

        <!-- 缓存 key 表格 -->
        <n-data-table
            v-model:checked-row-keys="checkedRowKeys"
            :columns="columns"
            :data="allData"
            :bordered="false"
            :loading="isLoading"
            :pagination="pagination"
            :remote="true"
            :row-key="(row: CacheKeyRow) => row.key"
        />
    </n-card>

    <n-modal
        v-model:show="detailVisible"
        preset="card"
        title="缓存详情"
        style="width: 640px; max-width: 90vw"
        :bordered="false"
        transform-origin="center"
    >
        <template v-if="detailRow">
            <div class="space-y-3">
                <div>
                    <div class="text-xs text-gray-500 mb-0.5">Key</div>
                    <div class="text-sm font-mono break-all">{{ detailRow.key }}</div>
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <div class="text-xs text-gray-500 mb-0.5">类型</div>
                        <n-tag type="info" :bordered="false" size="small" strong>
                            {{ detailRow.type }}
                        </n-tag>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500 mb-0.5">TTL（秒）</div>
                        <div class="text-sm font-mono">{{ formatTtl(detailRow.ttl) }}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500 mb-0.5">大小</div>
                        <div class="text-sm font-mono">{{ detailRow.size }} 字符</div>
                    </div>
                </div>
                <div>
                    <div class="text-xs text-gray-500 mb-1">值</div>
                    <pre
                        tabindex="0"
                        class="m-0 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs whitespace-pre-wrap break-all max-h-96 overflow-auto font-mono leading-relaxed border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >{{ formatValue(detailRow.value) }}</pre
                    >
                </div>
            </div>
        </template>
    </n-modal>

    <n-modal
        v-model:show="patternModalVisible"
        preset="card"
        title="按 Pattern 清空缓存"
        style="width: 480px; max-width: 90vw"
        :bordered="false"
        transform-origin="center"
    >
        <n-form label-placement="left" label-width="5rem">
            <n-form-item label="Pattern" feedback="支持 Redis MATCH 语法：* 任意字符 ? 单字符 [abc] 字符集合">
                <n-input v-model:value="clearPattern" placeholder="如 mono:auth:*、mono:user:1" clearable />
            </n-form-item>
            <n-alert type="warning" :show-icon="false" class="mb-3">
                将删除所有匹配该 pattern 的 key。此操作不可恢复，请确认后再执行。
            </n-alert>
        </n-form>
        <template #footer>
            <n-space justify="end">
                <n-button @click="patternModalVisible = false">取消</n-button>
                <n-button type="error" :loading="isClearing" @click="onClearByPattern"> 确认清空 </n-button>
            </n-space>
        </template>
    </n-modal>
</template>

<script setup lang="ts">
/**
 * 缓存管理页面
 *
 * 设计要点：
 * 1. 顶部 3 个统计卡片（已用内存 / 命中率 / 运行时长）独立加载，失败时显示 "-"
 * 2. 表格走服务端分页（offset/limit），由 n-data-table 的 page 变化触发 loadData
 * 3. pattern 筛选不会自动触发请求，必须点"查询"按钮（与 LogsPage 一致的"搜索下拉无副作用"约定）
 * 4. 删除走二次确认（dialog.warning），单条/批量/按 pattern 三种入口
 * 5. 内存模式（无 Redis）时，扫描会得到空数组 + 统计卡返回 "-"，不报错
 *
 * 权限：
 *   - 查看列表/统计/详情：config:cache:view
 *   - 删除/批量删除/按 pattern 清空：config:cache:delete
 */
defineOptions({ name: 'ConfigCache' });

import { computed, h, reactive, ref, watch, onMounted } from 'vue';
import { NTag, NIcon, NButton, NSpace, NModal, NCard, useDialog, useMessage } from 'naive-ui';
import { ChevronDown, ChevronUp, Refresh, Trash, Filter } from '@vicons/tabler';
import {
    type CacheKeyRow,
    type CacheStatsRow,
    listCacheKeys,
    getCacheKeyTotal,
    getCacheStats,
    deleteCacheKey,
    deleteCacheKeys,
    clearCacheByPattern,
} from '@/api';
import SearchGrid from '@/shared/components/SearchGrid.vue';
import { usePermissionStore } from '@/shared/stores/permission';

// ============================================================
// 权限
// ============================================================
const permissionStore = usePermissionStore();
const canDelete = computed(() => permissionStore.hasAnyPermission(['config:cache:delete']));

// ============================================================
// Naive UI dialog / message 实例
// ============================================================
const dialog = useDialog();
const message = useMessage();

// ============================================================
// 数据状态
// ============================================================
const allData = ref<CacheKeyRow[]>([]);
const isLoading = ref(true);
const stats = reactive<CacheStatsRow>({ usedMemory: '-', hitRate: '-', uptime: '-' });
const checkedRowKeys = ref<string[]>([]); // 表格多选选中的 key 列表

// ============================================================
// 详情 Modal 状态
// ============================================================
const detailVisible = ref(false);
const detailRow = ref<CacheKeyRow | null>(null);

// ============================================================
// 按 Pattern 清空 Modal 状态
// ============================================================
const patternModalVisible = ref(false);
const clearPattern = ref('');
const isClearing = ref(false);

// ============================================================
// 筛选
// ============================================================
const isCollapsed = ref(true);

const filters = reactive<{
    pattern: string;
}>({
    pattern: '',
});

// ============================================================
// 分页（n-data-table 服务端分页）
// ============================================================
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

const pagination = computed(() => ({
    page: page.value,
    pageSize: pageSize.value,
    itemCount: total.value,
    showSizePicker: true,
    pageSizes: [10, 20, 50, 100],
    showQuickJumper: true,
    prefix: ({ itemCount }: { itemCount: number }) => `共 ${itemCount} 条`,
    onChange: (p: number) => {
        page.value = p;
    },
    onUpdatePageSize: (ps: number) => {
        pageSize.value = ps;
        page.value = 1;
    },
}));

// ============================================================
// 数据加载
// ============================================================
async function loadData(pageNum: number, pageSizeNum: number) {
    isLoading.value = true;
    try {
        const offset = (pageNum - 1) * pageSizeNum;
        const pattern = filters.pattern.trim() || '*';
        // 并发拉数据 + total，节省一次往返
        const [items, t] = await Promise.all([
            listCacheKeys({ pattern, offset, limit: pageSizeNum }),
            getCacheKeyTotal(pattern),
        ]);
        allData.value = items;
        total.value = t;
        // 翻页后清空已选项，避免跨页误删
        checkedRowKeys.value = [];
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '加载缓存 key 失败');
    } finally {
        isLoading.value = false;
    }
}

async function loadStats() {
    try {
        const s = await getCacheStats();
        Object.assign(stats, s);
    } catch {
        // 统计失败不影响主列表，保持 "-"
        Object.assign(stats, { usedMemory: '-', hitRate: '-', uptime: '-' });
    }
}

onMounted(() => {
    loadData(page.value, pageSize.value);
    loadStats();
});

// 翻页时去后端拉新数据
watch([page, pageSize], async ([newPage, newSize], [oldPage, oldSize]) => {
    if (oldPage === undefined) return; // 首次 mount 已在 onMounted 中加载
    if (newPage === oldPage && newSize === oldSize) return;
    await loadData(newPage, newSize);
});

// ============================================================
// 操作
// ============================================================
function onSearch() {
    page.value = 1;
    loadData(page.value, pageSize.value);
}

function onReset() {
    filters.pattern = '';
    page.value = 1;
    loadData(page.value, pageSize.value);
}

/**
 * 顶部"刷新"按钮：重新拉列表 + 统计
 */
async function onRefresh() {
    await Promise.all([loadData(page.value, pageSize.value), loadStats()]);
    message.success('已刷新');
}

/**
 * 单条删除
 */
function onDeleteOne(row: CacheKeyRow) {
    dialog.warning({
        title: '确认删除',
        content: `将永久删除缓存 key「${row.key}」，不可恢复。`,
        positiveText: '确认',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                const ok = await deleteCacheKey(row.key);
                if (ok) {
                    message.success(`已删除「${row.key}」`);
                } else {
                    message.warning(`「${row.key}」不存在，可能已被其他进程删除`);
                }
                await loadData(page.value, pageSize.value);
                await loadStats();
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                message.error(msg || '删除失败');
            }
        },
    });
}

/**
 * 批量删除
 */
function onBatchDelete() {
    if (checkedRowKeys.value.length === 0) return;
    const keys = [...checkedRowKeys.value];
    dialog.warning({
        title: '确认批量删除',
        content: `将永久删除 ${keys.length} 个缓存 key，此操作不可恢复。`,
        positiveText: '确认删除',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                const result = await deleteCacheKeys(keys);
                message.success(`已删除 ${result.deletedCount} 个 key`);
                checkedRowKeys.value = [];
                await loadData(page.value, pageSize.value);
                await loadStats();
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                message.error(msg || '批量删除失败');
            }
        },
    });
}

/**
 * 打开"按 Pattern 清空" Modal
 * 注：触发按钮已用 @mousedown.prevent 阻止获得焦点，此处无需再 blur
 */
function onOpenClearByPattern() {
    clearPattern.value = filters.pattern.trim() || '';
    patternModalVisible.value = true;
}

/**
 * 确认按 pattern 清空
 */
async function onClearByPattern() {
    const pattern = clearPattern.value.trim();
    if (!pattern) {
        message.warning('请输入 pattern');
        return;
    }
    isClearing.value = true;
    try {
        const count = await clearCacheByPattern(pattern);
        message.success(`按 pattern「${pattern}」清空了 ${count} 个 key`);
        patternModalVisible.value = false;
        await loadData(page.value, pageSize.value);
        await loadStats();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '按 pattern 清空失败');
    } finally {
        isClearing.value = false;
    }
}

// ============================================================
// 表格列
// ============================================================
const typeColorMap: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    string: 'default',
    hash: 'info',
    list: 'success',
    set: 'warning',
    zset: 'error',
    stream: 'error',
    none: 'default',
    unknown: 'default',
};

const columns = [
    {
        type: 'selection' as const,
        width: 48,
        disabled: (_row: CacheKeyRow) => !canDelete.value,
    },
    {
        title: 'Key',
        key: 'key',
        ellipsis: { tooltip: true },
        render: (row: CacheKeyRow) => h('span', { class: 'font-mono text-xs' }, row.key),
    },
    {
        title: '类型',
        key: 'type',
        width: 100,
        render: (row: CacheKeyRow) =>
            h(
                NTag,
                { type: typeColorMap[row.type] ?? 'default', size: 'small', bordered: false, strong: true },
                () => row.type,
            ),
    },
    {
        title: 'TTL',
        key: 'ttl',
        width: 140,
        render: (row: CacheKeyRow) => h('span', { class: 'font-mono text-xs' }, formatTtl(row.ttl)),
    },
    {
        title: '大小',
        key: 'size',
        width: 100,
        render: (row: CacheKeyRow) => h('span', { class: 'font-mono text-xs' }, `${row.size} 字符`),
    },
    {
        title: '操作',
        key: 'actions',
        fixed: 'right' as const,
        width: 160,
        render: (row: CacheKeyRow) =>
            h(NSpace, { size: 4 }, () => [
                h(
                    NButton,
                    {
                        quaternary: true,
                        size: 'small',
                        // mousedown.prevent 阻止按钮获得焦点（浏览器默认行为），
                        // 避免 n-modal 给 body 加 aria-hidden 时焦点停留在按钮上触发
                        // 「Blocked aria-hidden on an element because its descendant retained focus」警告
                        onMousedown: (e: MouseEvent) => e.preventDefault(),
                        onClick: () => {
                            detailRow.value = row;
                            detailVisible.value = true;
                        },
                    },
                    () => '详情',
                ),
                canDelete.value
                    ? h(
                          NButton,
                          {
                              quaternary: true,
                              size: 'small',
                              type: 'error',
                              onMousedown: (e: MouseEvent) => e.preventDefault(),
                              onClick: () => onDeleteOne(row),
                          },
                          () => '删除',
                      )
                    : null,
            ]),
    },
];

// ============================================================
// 工具函数
// ============================================================

/**
 * 格式化 TTL 显示
 * - -1 → 永不过期
 * - -2 → 已过期/不存在
 * - >0 → X 秒 / X 分 X 秒 / X 时 X 分 X 秒 / X 天 X 时...
 */
function formatTtl(ttl: number): string {
    if (ttl === -1) return '永不过期';
    if (ttl === -2) return '已过期';
    if (ttl < 0) return '-';
    if (ttl < 60) return `${ttl} 秒`;
    if (ttl < 3600) {
        const m = Math.floor(ttl / 60);
        const s = ttl % 60;
        return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`;
    }
    if (ttl < 86400) {
        const h = Math.floor(ttl / 3600);
        const m = Math.floor((ttl % 3600) / 60);
        return m > 0 ? `${h} 时 ${m} 分` : `${h} 时`;
    }
    const d = Math.floor(ttl / 86400);
    const h = Math.floor((ttl % 86400) / 3600);
    return h > 0 ? `${d} 天 ${h} 时` : `${d} 天`;
}

/**
 * 详情 Modal 的 value 格式化（尝试 pretty print JSON）
 */
function formatValue(v: string | null): string {
    if (v === null || v === undefined) return '(空)';
    try {
        const parsed = JSON.parse(v);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return v;
    }
}
</script>
