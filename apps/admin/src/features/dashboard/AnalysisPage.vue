<template>
    <!-- 分析页：通用数据概览结构，指标标签通用化，接入真实数据后替换即可 -->
    <n-space vertical :size="gap">
        <!-- 顶部统计卡片：无数据或加载中时显示占位 -->
        <n-grid cols="2 l:4" :x-gap="gap" :y-gap="gap" responsive="screen">
            <template v-if="isStatsLoading || !stats.length">
                <n-gi v-for="label in statLabels" :key="label">
                    <n-card class="h-full">
                        <n-skeleton v-if="isStatsLoading" text :repeat="3" />
                        <n-statistic v-else :label="label" value="—" tabular-nums />
                    </n-card>
                </n-gi>
            </template>
            <n-gi v-for="stat in stats" v-else :key="stat.label">
                <n-card class="h-full">
                    <n-statistic :label="stat.label" :value="String(stat.value)" tabular-nums />
                    <p class="text-xs mt-1" :style="{ color: stat.trend > 0 ? '#d03050' : '#18a058' }">
                        {{ stat.trend > 0 ? '↑' : '↓' }} {{ Math.abs(stat.trend) }}%
                        <n-text depth="3" class="ml-0.5">较上周</n-text>
                    </p>
                </n-card>
            </n-gi>
        </n-grid>

        <!-- 图表区域：默认 1 列，l 断点以上 24 列栅格 -->
        <n-grid cols="1 l:24" :x-gap="gap" :y-gap="gap" responsive="screen">
            <!-- 数据趋势，l 断点以上占 16/24 -->
            <n-gi span="1 l:16">
                <n-card title="敏感操作趋势" class="h-full">
                    <template #header-extra>
                        <n-radio-group v-model:value="trendRange" size="small">
                            <n-radio-button value="week">本周</n-radio-button>
                            <n-radio-button value="month">本月</n-radio-button>
                            <n-radio-button value="year">本年</n-radio-button>
                        </n-radio-group>
                    </template>
                    <!-- 图例 + 异常点说明 -->
                    <n-space align="center" justify="space-between" class="mb-3 text-xs">
                        <n-space align="center" :size="16">
                            <span class="flex items-center gap-1.5">
                                <span class="w-2.5 h-2.5 rounded-sm" style="background: #d03050"></span>高危
                            </span>
                            <span class="flex items-center gap-1.5">
                                <span class="w-2.5 h-2.5 rounded-sm" style="background: #f0a020"></span>中危
                            </span>
                            <span class="flex items-center gap-1.5">
                                <span class="w-2.5 h-2.5 rounded-sm" style="background: #2080f0"></span>低危
                            </span>
                        </n-space>
                        <n-text v-if="peakInfo.label" class="font-medium" style="color: #d03050">
                            最高：{{ peakInfo.label }} {{ peakInfo.count }} 次
                        </n-text>
                    </n-space>
                    <!-- 趋势图主体(ECharts 渲染到 div) -->
                    <n-skeleton v-if="isTrendLoading" width="100%" height="192px" :sharp="false" />
                    <n-empty v-else-if="!trendData.length" description="暂无数据" class="h-48" />
                    <div v-else class="h-48 px-1 select-none">
                        <v-chart :option="chartOption" autoresize class="w-full h-full" />
                    </div>
                </n-card>
            </n-gi>

            <!-- 数据分布(l 断点以上占 8/24) -->
            <n-gi span="1 l:8">
                <n-card title="操作类型分布" class="h-full">
                    <!-- 加载骨架屏 -->
                    <n-skeleton v-if="isDistributionLoading" width="100%" height="192px" :sharp="false" />
                    <n-empty v-else-if="!distribution.length" description="暂无数据" class="h-48" />
                    <div v-else class="h-48 px-1 select-none">
                        <v-chart :option="pieOption" autoresize class="w-full h-full" />
                    </div>
                </n-card>
            </n-gi>
        </n-grid>

        <!-- 下方：操作记录 -->
        <n-card title="操作记录">
            <n-data-table
                :columns="logColumns"
                :data="operationLogs"
                :bordered="false"
                :loading="isLogsLoading"
                :pagination="pagination"
                :remote="true"
                :row-key="(row: OpLog) => row.id"
                @update:page="onPageChange"
                @update:page-size="onPageSizeChange"
            />
        </n-card>
    </n-space>
</template>

<script setup lang="ts">
import { ref, h, computed, onMounted, watch, reactive } from 'vue';

defineOptions({ name: 'DashboardAnalysisPage' });
import { NTag, NEmpty } from 'naive-ui';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart, PieChart } from 'echarts/charts';
import {
    GridComponent,
    TooltipComponent,
    TitleComponent,
    LegendComponent,
    MarkLineComponent,
    MarkAreaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
    getStats,
    getTrendData,
    getDistribution,
    getOperationLogs,
    type OpLog,
    type StatCard,
    type TrendItem,
    type DistItem,
} from '@/api';
import { useDesignTokens } from '@/shared/composables/useDesignTokens';
import { sanitizeHtml } from '@/shared/utils/security';

// ECharts 按需注册(只引入用到的,体积比全量小 90%)
use([
    LineChart,
    PieChart,
    GridComponent,
    TooltipComponent,
    TitleComponent,
    LegendComponent,
    MarkLineComponent,
    MarkAreaComponent,
    CanvasRenderer,
]);

// ========== 各区独立 loading ==========
const isStatsLoading = ref(true);
const isTrendLoading = ref(true);
const isDistributionLoading = ref(true);
const isLogsLoading = ref(true);
const { gap } = useDesignTokens();

// ========== 统计卡片 ==========
const stats = ref<StatCard[]>([]);
const statLabels = ['管理员数', '角色数', '菜单项数', '近7日操作数'];

// ========== 数据趋势 ==========
const trendRange = ref<'week' | 'month' | 'year'>('week');
const trendData = ref<(TrendItem & { total: number; anomaly: boolean; date: Date })[]>([]);

/** 异常阈值:高危操作数 >= 3 视为异常 */
const ANOMALY_THRESHOLD = 3;

/**
 * 把 API 返回的 TrendItem 加上真实日期(以今天为基准往前推)
 * - week: 本周一~周日
 * - month: 当月 1 日~今天(动态长度)
 * - year: 今年 1 月~12 月(每月取月末)
 */
function enrichWithDates(
    raw: TrendItem[],
    range: 'week' | 'month' | 'year',
): (TrendItem & { total: number; anomaly: boolean; date: Date })[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const built = buildTrendData(raw);
    if (range === 'week') {
        // 本周一(以周一为一周第一天)
        const dow = (today.getDay() + 6) % 7; // 周一=0, 周日=6
        const monday = new Date(today);
        monday.setDate(today.getDate() - dow);
        return built.map((d, i) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            return { ...d, date };
        });
    }
    if (range === 'month') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        return built
            .map((d, i) => {
                const date = new Date(firstDay);
                date.setDate(i + 1);
                // 月份内超出的不显示(API 返回的不要超过今天)
                if (date > today) return null;
                return { ...d, date };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
    }
    // year: 每月 1 号
    return built.map((d, i) => {
        const date = new Date(today.getFullYear(), i, 1);
        return { ...d, date };
    });
}

function buildTrendData(raw: TrendItem[]) {
    return raw.map((d) => ({
        ...d,
        total: d.highRisk + d.midRisk + d.lowRisk,
        anomaly: d.highRisk >= ANOMALY_THRESHOLD,
    }));
}

/** 三个序列的颜色(沿用 naive-ui 默认色板) */
const COLORS = {
    high: '#d03050', // naive-ui error - 高危
    mid: '#f0a020', // naive-ui warning - 中危
    low: '#2080f0', // naive-ui info - 低危
} as const;

/**
 * 把数据点格式化成 X 轴标签
 * - week: 周一/MM-DD (今天高亮)
 * - month: MM/DD
 * - year: M月
 */
function formatLabel(d: Date, range: 'week' | 'month' | 'year'): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = d.getTime() === today.getTime();
    const pad = (n: number) => String(n).padStart(2, '0');
    if (range === 'week') {
        const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const dow = (d.getDay() + 6) % 7;
        return isToday ? '今天' : `${weekdays[dow]}/${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    if (range === 'month') {
        return isToday ? '今天' : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    }
    return `${d.getMonth() + 1}月`;
}

/** ECharts 配置(响应式:trendData 变化自动重渲) */
const chartOption = computed(() => {
    const labels = trendData.value.map((d) => formatLabel(d.date, trendRange.value));
    const anomalyIdxList: number[] = [];
    trendData.value.forEach((d, i) => {
        if (d.anomaly) anomalyIdxList.push(i);
    });

    return {
        grid: { top: 16, right: 16, bottom: 28, left: 36 },
        animationDuration: 400,
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'line', lineStyle: { color: '#94a3b8', type: 'dashed' } },
            backgroundColor: 'rgba(255,255,255,0.98)',
            borderColor: '#e5e7eb',
            borderWidth: 1,
            textStyle: { color: '#374151', fontSize: 12 },
            padding: 10,
            extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08);',
        },
        xAxis: {
            type: 'category',
            data: labels,
            boundaryGap: false,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
                color: (_v: string, i: number) => (trendData.value[i]?.anomaly ? '#d03050' : '#9ca3af'),
                fontSize: 10,
                fontWeight: (_v: string, i: number) => (trendData.value[i]?.anomaly ? 600 : 400),
            },
        },
        yAxis: {
            type: 'value',
            beginAtZero: true,
            splitLine: { lineStyle: { color: 'rgba(156,163,175,0.15)' } },
            axisLabel: { color: '#9ca3af', fontSize: 10 },
        },
        series: [
            // 高危
            {
                name: '高危',
                type: 'line',
                smooth: 0.4,
                symbol: 'circle',
                symbolSize: (_val: unknown, i: number) => (trendData.value[i]?.anomaly ? 9 : 6),
                itemStyle: {
                    color: (params: { dataIndex: number }) =>
                        trendData.value[params.dataIndex]?.anomaly ? '#d03050' : '#fff',
                    borderColor: '#d03050',
                    borderWidth: 1.5,
                },
                lineStyle: { color: COLORS.high, width: 2 },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(208,48,80,0.35)' },
                            { offset: 1, color: 'rgba(208,48,80,0.02)' },
                        ],
                    },
                },
                data: trendData.value.map((d) => d.highRisk),
                z: 3,
                // 异常点:markLine 标红色虚线
                markLine: anomalyIdxList.length
                    ? {
                          silent: true,
                          symbol: 'none',
                          lineStyle: { color: '#d03050', type: 'dashed', width: 1, opacity: 0.5 },
                          data: anomalyIdxList.map((i) => ({ xAxis: i })),
                      }
                    : undefined,
            },
            // 中危
            {
                name: '中危',
                type: 'line',
                smooth: 0.4,
                symbol: 'circle',
                symbolSize: 6,
                itemStyle: { color: '#fff', borderColor: COLORS.mid, borderWidth: 1.5 },
                lineStyle: { color: COLORS.mid, width: 2 },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(240,160,32,0.30)' },
                            { offset: 1, color: 'rgba(240,160,32,0.02)' },
                        ],
                    },
                },
                data: trendData.value.map((d) => d.midRisk),
                z: 2,
            },
            // 低危
            {
                name: '低危',
                type: 'line',
                smooth: 0.4,
                symbol: 'circle',
                symbolSize: 6,
                itemStyle: { color: '#fff', borderColor: COLORS.low, borderWidth: 1.5 },
                lineStyle: { color: COLORS.low, width: 2 },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(32,128,240,0.28)' },
                            { offset: 1, color: 'rgba(32,128,240,0.02)' },
                        ],
                    },
                },
                data: trendData.value.map((d) => d.lowRisk),
                z: 1,
            },
        ],
    };
});

/** 当前区间的高危峰值信息（一次 reduce 计算，避免双重遍历） */
const peakInfo = computed(() => {
    const peak = trendData.value.reduce(
        (best, cur) => (cur.highRisk > (best?.highRisk ?? -1) ? cur : best),
        null as null | (TrendItem & { total: number; date: Date }),
    );
    if (!peak || peak.highRisk <= 0) return { label: '', count: 0 };
    return {
        label: formatLabel(peak.date, trendRange.value),
        count: peak.highRisk,
    };
});

// ========== 数据分布(饼图) ==========
const distribution = ref<DistItem[]>([]);

/** 饼图 ECharts 配置(naive-ui 色板:绿/蓝/琥珀/红) */
const PIE_COLORS = ['#18a058', '#2080f0', '#f0a020', '#d03050'];

const pieOption = computed(() => ({
    tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#374151', fontSize: 12 },
        padding: 10,
        formatter: (params: { name: string; value: number; percent: number }) =>
            `<div style="font-weight:600;margin-bottom:4px">${sanitizeHtml(params.name)}</div>` +
            `<div>次数: <b>${params.value}</b></div>` +
            `<div>占比: <b>${params.percent}%</b></div>`,
    },
    legend: {
        bottom: 0,
        left: 'center',
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: '#6b7280', fontSize: 11 },
    },
    series: [
        {
            name: '操作类型',
            type: 'pie',
            radius: ['45%', '70%'], // 环形饼图
            center: ['50%', '42%'],
            avoidLabelOverlap: true,
            itemStyle: {
                borderColor: '#fff',
                borderWidth: 2,
            },
            label: {
                show: true,
                position: 'outside',
                formatter: '{b}\n{d}%',
                fontSize: 11,
                color: '#374151',
            },
            labelLine: {
                length: 8,
                length2: 8,
            },
            data: distribution.value.map((d, i) => ({
                name: d.label,
                value: d.percent,
                itemStyle: { color: d.color || PIE_COLORS[i % PIE_COLORS.length] },
            })),
        },
    ],
}));

// ========== 操作记录(分页) ==========
const operationLogs = ref<OpLog[]>([]);
const pagination = reactive({
    page: 1,
    pageSize: 10,
    itemCount: 0,
    showSizePicker: true,
    pageSizes: [10, 20, 50],
    prefix: ({ itemCount }: { itemCount: number }) => `共 ${itemCount} 条`,
});

/** 拉取操作记录(分页) */
async function fetchLogs() {
    isLogsLoading.value = true;
    try {
        const page = await getOperationLogs(pagination.page, pagination.pageSize);
        operationLogs.value = page.list;
        pagination.itemCount = page.total;
    } catch {
        operationLogs.value = [];
        pagination.itemCount = 0;
    } finally {
        isLogsLoading.value = false;
    }
}

function onPageChange(p: number) {
    pagination.page = p;
    fetchLogs();
}
function onPageSizeChange(s: number) {
    pagination.pageSize = s;
    pagination.page = 1;
    fetchLogs();
}

/**
 * 发起请求并管理独立的 loading 状态
 *
 * 每个数据区使用独立的 loading 标志，先返回的先渲染（progressive loading），
 * 而非等待所有请求完成后一起显示。这提供更好的用户感知性能。
 */
function withLoading<T>(fetcher: () => Promise<T>, onOk: (data: T) => void, onDone: () => void) {
    fetcher()
        .then(onOk)
        .catch(() => {
            /* 无权限或异常时静默 */
        })
        .finally(onDone);
}

onMounted(() => {
    withLoading(
        getStats,
        (s) => {
            stats.value = s;
        },
        () => {
            isStatsLoading.value = false;
        },
    );
    withLoading(
        () => getTrendData('week'),
        (t) => {
            trendData.value = enrichWithDates(t, 'week');
        },
        () => {
            isTrendLoading.value = false;
        },
    );
    withLoading(
        getDistribution,
        (d) => {
            distribution.value = d;
        },
        () => {
            isDistributionLoading.value = false;
        },
    );
    fetchLogs();
});

// 切换趋势范围时重新加载(走独立 loading)
watch(trendRange, async (range) => {
    isTrendLoading.value = true;
    try {
        const t = await getTrendData(range);
        trendData.value = enrichWithDates(t, range);
    } catch {
        // 无权限或异常时静默
    } finally {
        isTrendLoading.value = false;
    }
});

// action / resourceType → 中文标签映射（与 LogsPage 保持一致）
const actionLabelMap: Record<string, string> = {
    login_success: '登录成功',
    login_failed: '登录失败',
    login_locked: '登录锁定',
    password_changed: '密码修改',
    reset_password: '重置密码',
    account_created: '创建账号',
    account_updated: '更新账号',
    account_enabled: '启用账号',
    account_disabled: '禁用账号',
    account_deleted: '删除账号',
    account_hard_deleted: '硬删账号',
    account_restored: '恢复账号',
    role_created: '创建角色',
    role_updated: '更新角色',
    role_deleted: '删除角色',
    role_assigned: '分配角色',
    role_revoked: '撤销角色',
    menu_created: '创建菜单',
    menu_updated: '更新菜单',
    menu_deleted: '删除菜单',
    permission_changed: '权限变更',
    account_permission_changed: '账号权限变更',
    file_uploaded: '文件上传',
    file_deleted: '文件删除',
    config_updated: '配置更新',
    audit_cleared: '清空审计日志',
};
const resourceTypeLabelMap: Record<string, string> = {
    admin_user: '管理员账号',
    admin_role: '角色',
    admin_menu: '菜单',
    admin_account_role: '账号-角色关联',
    system_config: '系统配置',
    upload_file: '文件',
    account: '账号',
    account_identity: '账号身份',
    member_menu: 'C端菜单',
    member_role: 'C端角色',
    audit_log: '审计日志',
};

const typeStyle: Record<string, { label: string; tagType: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
    login: { label: '登录', tagType: 'info' },
    logout: { label: '登出', tagType: 'default' },
    create: { label: '新增', tagType: 'success' },
    update: { label: '修改', tagType: 'warning' },
    delete: { label: '删除', tagType: 'error' },
    reset: { label: '重置', tagType: 'error' },
    export: { label: '导出', tagType: 'info' },
    import: { label: '导入', tagType: 'info' },
    grant: { label: '授权', tagType: 'warning' },
    approve: { label: '审批', tagType: 'success' },
};

const logColumns = [
    {
        title: '操作人',
        key: 'user',
        width: 120,
        render(row: OpLog) {
            return h('div', { class: 'flex flex-col leading-tight items-start' }, [
                h('span', { class: 'text-sm font-medium' }, row.user),
                row.title
                    ? h(
                          NTag,
                          {
                              size: 'small',
                              round: true,
                              bordered: false,
                              style: 'font-size: 10px; height: 16px; padding: 0 6px; margin-top: 2px;',
                          },
                          () => row.title,
                      )
                    : null,
            ]);
        },
    },
    {
        title: '时间',
        key: 'time',
        width: 160,
        render(row: OpLog) {
            return h('span', { class: 'text-xs text-gray-500' }, row.time || '—');
        },
    },
    {
        title: '操作内容',
        key: 'content',
        render(row: OpLog) {
            const label = actionLabelMap[row.content] ?? row.content;
            return h(NTag, { type: 'default', size: 'small', bordered: false, strong: true }, () => label);
        },
    },
    {
        title: '模块',
        key: 'module',
        width: 130,
        render(row: OpLog) {
            const label = resourceTypeLabelMap[row.module] ?? row.module;
            return h(NTag, { type: 'info', size: 'small', bordered: false, strong: true }, () => label);
        },
    },
    {
        title: 'IP',
        key: 'ip',
        width: 130,
        render(row: OpLog) {
            return h('span', { class: 'font-mono text-xs text-gray-500' }, row.ip || '—');
        },
    },
    {
        title: '类型',
        key: 'type',
        width: 70,
        render(row: OpLog) {
            const info = typeStyle[row.type] ?? { label: row.type, tagType: 'default' as const };
            return h(NTag, { type: info.tagType, size: 'small', round: true }, () => info.label);
        },
    },
];
</script>
