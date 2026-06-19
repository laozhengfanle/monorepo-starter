<!--
缓存管理页面 — 查看/清除 Redis 缓存
功能：查看缓存键列表、缓存统计、清除指定缓存
数据源：REST API /api/admin/cache

═══════════════════════════════════════════════════════════════════
数据真实性（重要：避免下次误以为假数据）
═══════════════════════════════════════════════════════════════════
4 个统计字段的 Redis 数据来源：

1. 缓存键总数（totalKeys）
   - 来源：后端调用 `SCAN MATCH mono:* COUNT 100` 实时遍历，累加 key 数
   - 不是 Redis DBSIZE（开发/生产 key 数远大于业务 key，DBSIZE 会含干扰数据）
   - 行为：清空缓存后 → 0（准确）

2. 内存占用（usedMemory）
   - 来源：Redis `INFO` 命令 `used_memory` 字段（后端已转人类可读）
   - 行为：清空 key 不会立即下降！Redis 不会主动归还内存给 OS
     （jemalloc 行为；只有重启 / 触发 `MEMORY PURGE` 才下降）
   - 这是 Redis 行为不是 bug

3. 命中率（hitRate）
   - 来源：Redis `INFO` 命令 `keyspace_hits / (keyspace_hits + keyspace_misses)`
   - 行为：是 Redis 启动以来累计命中率的"瞬时值"，清空 key 不影响分母分子
   - 无样本时（hits + misses == 0）显示 "-"，避免除零

4. 运行时长（uptime）
   - 来源：Redis `INFO` 命令 `uptime_in_seconds`（秒 → "X 天 Y 小时"）
   - 行为：与 key 数量完全无关，进程不重启就不变

TTL 格式化（formatTtl 函数）：
- -1 = 永不过期（Redis PTTL 返回 -1 表示 key 存在但没设过期时间）
- -2 = 已过期 / key 不存在（Redis PTTL 返回 -2 表示 key 不存在）
- 正数 = 剩余秒数 → "X 秒" / "X 分 Y 秒" / "X 小时 Y 分" / "X 天 Y 小时"

═══════════════════════════════════════════════════════════════════
Redis TYPE 命令返回值对照表（用于表格"类型"列颜色映射）
═══════════════════════════════════════════════════════════════════
| Redis TYPE 返回值 | 业务含义                          | Tag 颜色             |
|------------------|----------------------------------|---------------------|
| string           | 字符串                            | success (绿)        |
| hash             | 哈希                              | info (蓝)           |
| list             | 列表                              | warning (橙)        |
| set              | 集合                              | error (红)          |
| zset             | 有序集合                          | primary (蓝)        |
| stream           | 流（Redis 5+ 引入的消息流）         | info (蓝)           |
| none             | 已过期或不存在（不应在 SCAN 结果里）| default (灰)        |
| unknown          | 调用失败兜底                      | default (灰)        |
═══════════════════════════════════════════════════════════════════
-->
<template>
    <n-card title="缓存管理">
        <n-spin :show="isLoading">
            <!-- 统计卡片 -->
            <!-- 4 个卡片的 label 都有 n-tooltip 包裹，hover 即可看到「数据来源」和「Redis 行为」说明 -->
            <n-grid :x-gap="gap" :y-gap="gap" cols="1 640:2 960:4" class="mb-6">
                <n-gi>
                    <n-statistic :value="stats.totalKeys">
                        <template #label>
                            <n-tooltip placement="top">
                                <template #trigger>
                                    <span style="cursor: help">缓存键总数</span>
                                </template>
                                实时 SCAN 遍历所有 <code>mono:*</code> 前缀 key 计数
                            </n-tooltip>
                        </template>
                    </n-statistic>
                </n-gi>
                <n-gi>
                    <n-statistic :value="stats.usedMemory">
                        <template #label>
                            <n-tooltip placement="top">
                                <template #trigger>
                                    <span style="cursor: help">内存占用</span>
                                </template>
                                Redis INFO 命令
                                <code>used_memory</code> 字段；清空缓存不会立即下降（Redis 不主动归还内存）
                            </n-tooltip>
                        </template>
                    </n-statistic>
                </n-gi>
                <n-gi>
                    <n-statistic :value="stats.hitRate">
                        <template #label>
                            <n-tooltip placement="top">
                                <template #trigger>
                                    <span style="cursor: help">命中率</span>
                                </template>
                                Redis INFO 命令
                                <code>keyspace_hits / (keyspace_hits + keyspace_misses)</code>，无样本时显示
                                <code>-</code>
                            </n-tooltip>
                        </template>
                    </n-statistic>
                </n-gi>
                <n-gi>
                    <n-statistic :value="stats.uptime">
                        <template #label>
                            <n-tooltip placement="top">
                                <template #trigger>
                                    <span style="cursor: help">运行时长</span>
                                </template>
                                Redis INFO 命令 <code>uptime_in_seconds</code>；与 key 数量无关，进程不重启就不变
                            </n-tooltip>
                        </template>
                    </n-statistic>
                </n-gi>
            </n-grid>

            <!-- 操作栏 -->
            <n-space class="mb-4">
                <!-- 刷新统计按钮，仅拥有 config:cache:list 权限的用户可见 -->
                <!-- 注意：权限码必须与后端 cache.controller.ts @Permission('config:cache:view') 一致 -->
                <n-button v-permission="'config:cache:view'" type="primary" @click="loadStats"> 刷新统计 </n-button>
                <n-popconfirm @positive-click="onClearAll">
                    <template #trigger>
                        <!-- 清除全部缓存按钮，仅拥有 config:cache:delete 权限的用户可见 -->
                        <!-- 权限码与后端 cache.controller.ts @Permission('config:cache:delete') 一致 -->
                        <n-button v-permission="'config:cache:delete'" type="warning"> 清除全部缓存 </n-button>
                    </template>
                    确定要清除所有缓存吗？此操作可能导致部分用户需要重新登录。
                </n-popconfirm>
            </n-space>

            <!-- 缓存键列表 -->
            <n-data-table
                :columns="columns"
                :data="cacheKeys"
                :bordered="false"
                :row-key="(row: CacheKeyRow) => row.key"
            />
        </n-spin>
    </n-card>
</template>

<script setup lang="ts">
/** KeepAlive 通过组件名匹配缓存，必须和路由名一致 */
defineOptions({ name: 'ConfigCache' });

import { ref, reactive, onMounted, h } from 'vue';
import { NButton, NPopconfirm, NTag } from 'naive-ui';
import { useMessage } from '@/shared/composables/useMessage';
import { get, del } from '@/shared/request/request';
import { usePermissionStore } from '@/shared/stores/permission';
import { useDesignTokens } from '@/shared/composables/useDesignTokens';

const { message } = useMessage();
// 权限 store，用于在 render 函数中判断按钮可见性
const permissionStore = usePermissionStore();
const isLoading = ref(true);

const { gap } = useDesignTokens(); // 获取设计系统间距变量

// ---- 缓存统计 ----
const stats = reactive({
    totalKeys: 0,
    usedMemory: '-',
    hitRate: '-',
    uptime: '-',
});

// ---- 缓存键行类型 ----
interface CacheKeyRow {
    key: string;
    /** Redis TYPE 命令返回值：string / hash / list / set / zset / stream / none / unknown */
    type: string;
    /** 剩余 TTL（秒），-1 = 永不过期，-2 = key 不存在 */
    ttl: number;
    size: string;
}

// ---- 缓存键数据 ----
const cacheKeys = ref<CacheKeyRow[]>([]);

// ---- Redis 数据类型 → Naive UI Tag 颜色映射 ----
// Redis 有 6 种数据类型 + 2 个边界值（none / unknown），每种用一个语义化颜色区分。
// 完整对照表见文件头部注释，此处只维护映射，避免漂移。
//
// Redis TYPE 命令返回值对照表（再次列出便于 review）：
// ┌──────────┬──────────────────────────────┬────────────────┐
// │ TYPE 返回 │ 业务含义                      │ Tag 颜色        │
// ├──────────┼──────────────────────────────┼────────────────┤
// │ string   │ 字符串                        │ success (绿)   │
// │ hash     │ 哈希                          │ info (蓝)      │
// │ list     │ 列表                          │ warning (橙)   │
// │ set      │ 集合                          │ error (红)     │
// │ zset     │ 有序集合                      │ primary (蓝)   │
// │ stream   │ 流（Redis 5+ 消息流）          │ info (蓝)      │
// │ none     │ 已过期或不存在（不应在 SCAN 中）│ default (灰)   │
// │ unknown  │ 调用失败兜底                  │ default (灰)   │
// └──────────┴──────────────────────────────┴────────────────┘
const TYPE_TAG_COLOR: Record<string, 'default' | 'success' | 'info' | 'warning' | 'error' | 'primary'> = {
    string: 'success',
    hash: 'info',
    list: 'warning',
    set: 'error',
    zset: 'primary',
    stream: 'info',
    none: 'default',
    unknown: 'default',
};

// ---- TTL 格式化（秒 → 人类可读） ----
// -1 = 永不过期；正数 = 剩余秒数 → "X 分 Y 秒" / "X 小时 Y 分" / "X 天 Y 小时"
function formatTtl(ttl: number): string {
    if (ttl === -1) return '永不过期';
    if (ttl === -2) return '已过期';
    if (!Number.isFinite(ttl) || ttl < 0) return '-';
    if (ttl < 60) return `${ttl} 秒`;
    if (ttl < 3600) {
        const m = Math.floor(ttl / 60);
        const s = ttl % 60;
        return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`;
    }
    if (ttl < 86400) {
        const h = Math.floor(ttl / 3600);
        const m = Math.floor((ttl % 3600) / 60);
        return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
    }
    const d = Math.floor(ttl / 86400);
    const h = Math.floor((ttl % 86400) / 3600);
    return h > 0 ? `${d} 天 ${h} 小时` : `${d} 天`;
}

// ---- 表格列定义 ----
const columns = [
    {
        title: '键名',
        key: 'key',
        ellipsis: { tooltip: true },
    },
    {
        title: '类型',
        key: 'type',
        width: 120,
        render: (row: CacheKeyRow) =>
            h(NTag, { size: 'small', type: TYPE_TAG_COLOR[row.type] ?? 'default' }, () => row.type || '-'),
    },
    {
        title: 'TTL',
        key: 'ttl',
        width: 140,
        // 直接展示秒数（"-1"、"123"）对用户不友好，formatTtl 转成可读字符串
        render: (row: CacheKeyRow) => formatTtl(row.ttl),
    },
    {
        title: '大小',
        key: 'size',
        width: 100,
    },
    {
        title: '操作',
        key: 'actions',
        width: 100,
        // render 函数中无法使用 v-permission 指令，改用 permissionStore 判断权限
        // 权限码与后端 cache.controller.ts @Permission('config:cache:delete') 一致
        render: (row: CacheKeyRow) =>
            permissionStore.hasAnyPermission(['config:cache:delete'])
                ? h(
                      NPopconfirm,
                      { onPositiveClick: () => onClearKey(row.key) },
                      {
                          trigger: () => h(NButton, { size: 'small', type: 'error' }, () => '清除'),
                          default: () => `确定要清除缓存 "${row.key}" 吗？`,
                      },
                  )
                : null,
    },
];

// ---- 加载缓存统计 ----
async function loadStats() {
    try {
        // 后端返回格式：{ code, message, data: { stats, keys } }，需要取 .data 解包
        const res = await get<{ stats: typeof stats; keys: CacheKeyRow[] }>('/admin/cache/stats');
        // 解包两种格式：有 data 包裹的（新格式）或直接是 payload 的（兼容）
        const payload: { stats: typeof stats; keys: CacheKeyRow[] } =
            'data' in (res as object) && (res as { data?: unknown }).data
                ? (res as unknown as { data: { stats: typeof stats; keys: CacheKeyRow[] } }).data
                : (res as { stats: typeof stats; keys: CacheKeyRow[] });
        Object.assign(stats, payload.stats);
        cacheKeys.value = payload.keys;
    } catch {
        /** 接口可能尚未实现，使用模拟数据 */
        stats.totalKeys = cacheKeys.value.length;
        stats.usedMemory = '-';
        stats.hitRate = '-';
        stats.uptime = '-';
    }
}

// ---- 清除单个缓存键 ----
async function onClearKey(key: string) {
    try {
        await del(`/admin/cache/keys/${encodeURIComponent(key)}`);
        message.success(`缓存 "${key}" 已清除`);
        await loadStats();
    } catch {
        message.error('清除失败，请重试');
    }
}

// ---- 清除全部缓存 ----
async function onClearAll() {
    try {
        // 清除前先记录 key 数（清除后会被后端清空，前端要自己记住"清理了几个"）
        const cleared = cacheKeys.value.length;
        await del('/admin/cache/keys');
        // 关键提示：必须明确告诉用户哪些指标不会变 + 为什么（避免被当 bug 报）
        message.success(`已清理 ${cleared} 个 key；内存占用/命中率/运行时长是 Redis 实例级指标，与 key 数量无关`);
        await loadStats();
    } catch {
        message.error('清除失败，请重试');
    }
}

// ---- 初始化 ----
onMounted(async () => {
    try {
        await loadStats();
    } finally {
        isLoading.value = false;
    }
});
</script>
