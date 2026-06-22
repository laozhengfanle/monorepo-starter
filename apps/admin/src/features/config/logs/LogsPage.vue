<template>
    <!--
        w-full min-w-0：
        - 父容器 .page-transition-wrapper 是 display: grid
        - grid 子项默认 min-width: auto (= max-content)，会按内容撑开
        - 列宽之和 1290px > 父容器 1030px 时，n-card 会被撑到 1350+px 出现右侧截断
        - 加 w-full + min-w-0 让 card 宽度固定为父容器宽度，n-data-table 内部出现横向滚动条
    -->
    <n-card title="审计日志" class="w-full min-w-0">
        <template #header-extra>
            <n-space align="center" :size="8">
                <n-button v-if="canExport" @click="onExport">
                    <template #icon>
                        <n-icon><Download /></n-icon>
                    </template>
                    导出
                </n-button>
                <n-button v-if="canClear" type="error" ghost @click="onClear">
                    <template #icon>
                        <n-icon><Trash /></n-icon>
                    </template>
                    清空日志
                </n-button>
            </n-space>
        </template>

        <!-- 筛选区域（按 spec §"审计日志 UI 字段透出"：3 个筛选 + onSearch 触发） -->
        <n-form label-placement="left" label-align="right" label-width="5rem" :show-feedback="false" class="my-(--gap)">
            <SearchGrid :collapsed="isCollapsed" :collapsed-rows="1">
                <n-gi>
                    <n-form-item label="操作">
                        <n-select
                            v-model:value="filters.action"
                            placeholder="全部"
                            clearable
                            :options="actionOptions"
                        />
                    </n-form-item>
                </n-gi>
                <n-gi>
                    <n-form-item label="资源类型">
                        <n-select
                            v-model:value="filters.resourceType"
                            placeholder="全部"
                            clearable
                            :options="resourceTypeOptions"
                        />
                    </n-form-item>
                </n-gi>
                <n-gi>
                    <n-form-item label="时间区间">
                        <n-date-picker
                            v-model:value="filters.dateRange"
                            type="datetimerange"
                            clearable
                            format="yyyy-MM-dd HH:mm"
                            placeholder="开始时间 ~ 结束时间"
                        />
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

        <!-- 审计日志表格（7 列：时间/操作者/操作/资源类型/资源ID/IP/详情）
             scroll-x：列宽之和（180+120+180+180+220+130+200+80=1290）+ 余量 14 = 1304
             不加 scroll-x 时 Naive UI 会让表格按列宽之和自动撑开 n-card，
             导致 card 宽度超过父容器出现右侧截断。 -->
        <n-data-table
            :columns="columns"
            :data="filteredAll"
            :bordered="false"
            :loading="isLoading"
            :pagination="pagination"
            :remote="true"
            :row-key="(row: LogRow) => row.id"
        />
    </n-card>

    <!-- 审计详情 Modal -->
    <n-modal
        v-model:show="detailVisible"
        preset="card"
        :title="detailRow ? `审计详情 — ${actionLabelMap.get(detailRow.action) ?? detailRow.action}` : ''"
        style="width: 480px; max-width: 90vw"
        :bordered="false"
    >
        <template v-if="detailRow">
            <div class="space-y-3">
                <div>
                    <div class="text-xs text-gray-500 mb-0.5">时间</div>
                    <div class="text-sm">{{ detailRow.time }}</div>
                </div>
                <div>
                    <div class="text-xs text-gray-500 mb-0.5">操作者</div>
                    <div class="text-sm font-medium">{{ detailRow.operator }}</div>
                </div>
                <div>
                    <div class="text-xs text-gray-500 mb-0.5">资源类型</div>
                    <n-tag type="info" :bordered="false" size="small" strong>
                        {{ resourceTypeLabelMap.get(detailRow.resourceType) ?? detailRow.resourceType }}
                    </n-tag>
                </div>
                <div v-if="detailRow.resourceId && detailRow.resourceId !== '-'">
                    <div class="text-xs text-gray-500 mb-0.5">资源 ID</div>
                    <div class="text-sm font-mono text-xs break-all">
                        {{ detailRow.resourceId }}
                    </div>
                </div>
                <div v-if="detailRow.ip && detailRow.ip !== '-'">
                    <div class="text-xs text-gray-500 mb-0.5">IP</div>
                    <div class="text-sm font-mono text-xs">{{ detailRow.ip }}</div>
                </div>
                <div>
                    <div class="text-xs text-gray-500 mb-1">详情</div>
                    <pre
                        tabindex="0"
                        class="m-0 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs whitespace-pre-wrap break-all max-h-72 overflow-auto font-mono leading-relaxed border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >{{ formatDetail(detailRow.detail) }}</pre
                    >
                </div>
            </div>
        </template>
    </n-modal>
</template>

<script setup lang="ts">
/**
 * 审计日志页面（配置中心 → 审计日志）
 *
 * 字段说明（与 apps/admin/src/api/logs.ts LogRow 对应）：
 *   - time          操作时间（后端 createdAt）
 *   - operator      操作者（后端 accountUsername，null 时显示"系统"）
 *   - action        操作类型（后端 action，如 'login_success' / 'account_created'）
 *   - resourceType  资源类型
 *   - resourceId    资源 ID
 *   - ip            操作者 IP
 *   - detail        详情（JSON 字符串，默认折叠；点击"详情"按钮展开查看完整 JSON）
 *
 * 交互约束（spec §"搜索下拉无副作用"）：
 *   - 所有筛选字段（action / resourceType / 时间区间）切换**不会**触发请求
 *   - 只有点"查询"按钮或分页器翻页才会调 getLogs
 *   - 所以模板里没有 watch，filter 状态本地缓存，等用户点"查询"再发出
 */
defineOptions({ name: 'ConfigLogs' });
import { computed, h, reactive, ref, watch, onMounted } from 'vue';
import { NTag, NIcon, NButton, NSpace, NModal, NCard, useDialog, useMessage } from 'naive-ui';
import { ChevronDown, ChevronUp, Trash, Download } from '@vicons/tabler';
import { type LogRow, getLogs, deleteLog, clearLogs, exportLogs } from '@/api';
import SearchGrid from '@/shared/components/SearchGrid.vue';
import { usePermissionStore } from '@/shared/stores/permission';

// ---- 筛选项静态选项 ----
// action 列表与后端 AuditService.AUDIT_ACTIONS 一一对应（保持同步）
// 硬删/恢复类的 action（xxx_hard_deleted / xxx_restored）后端都支持，前端下拉必须给齐
const actionOptions = [
    // 认证
    { label: '登录成功', value: 'login_success' },
    { label: '登录失败', value: 'login_failed' },
    { label: '登录锁定', value: 'login_locked' },
    { label: '密码修改', value: 'password_changed' },
    { label: '重置密码', value: 'reset_password' },
    { label: 'Token 刷新', value: 'token_refreshed' },
    { label: 'Token 重用（异常）', value: 'token_reused' },
    { label: '绑定手机', value: 'phone_bind' },
    { label: '解绑手机', value: 'phone_unbind' },
    { label: '绑定 OAuth', value: 'oauth_bind' },
    { label: '解绑 OAuth', value: 'oauth_unbind' },
    // 账号
    { label: '创建账号', value: 'account_created' },
    { label: '更新账号', value: 'account_updated' },
    { label: '启用账号', value: 'account_enabled' },
    { label: '禁用账号', value: 'account_disabled' },
    { label: '删除账号', value: 'account_deleted' },
    { label: '硬删账号', value: 'account_hard_deleted' },
    { label: '恢复账号', value: 'account_restored' },
    // 角色
    { label: '创建角色', value: 'role_created' },
    { label: '更新角色', value: 'role_updated' },
    { label: '删除角色', value: 'role_deleted' },
    { label: '硬删角色', value: 'role_hard_deleted' },
    { label: '恢复角色', value: 'role_restored' },
    { label: '分配角色', value: 'role_assigned' },
    { label: '撤销角色', value: 'role_revoked' },
    // 菜单
    { label: '创建菜单', value: 'menu_created' },
    { label: '更新菜单', value: 'menu_updated' },
    { label: '删除菜单', value: 'menu_deleted' },
    { label: '硬删菜单', value: 'menu_hard_deleted' },
    { label: '恢复菜单', value: 'menu_restored' },
    { label: '权限变更', value: 'permission_changed' },
    { label: '账号权限变更', value: 'account_permission_changed' },
    // 文件
    { label: '文件上传', value: 'file_uploaded' },
    { label: '文件删除', value: 'file_deleted' },
    { label: '硬删文件', value: 'file_hard_deleted' },
    { label: '恢复文件', value: 'file_restored' },
    // 配置
    { label: '配置更新', value: 'config_updated' },
    // 审计
    { label: '清空审计日志', value: 'audit_cleared' },
];

// resourceType 与后端 record() 时写入的 resourceType 字符串对应
// （与 apps/server/src 下所有 auditService.record() 调用点对齐）
const resourceTypeOptions = [
    { label: '管理员账号 (admin_account)', value: 'admin_account' },
    { label: '角色 (admin_role)', value: 'admin_role' },
    { label: '菜单 (admin_menu)', value: 'admin_menu' },
    { label: '系统配置 (system_config)', value: 'system_config' },
    { label: '文件 (upload_file)', value: 'upload_file' },
    { label: '账号身份 (account_identity)', value: 'account_identity' },
    { label: '认证 (auth)', value: 'auth' },
    { label: 'OAuth (oauth)', value: 'oauth' },
    { label: '审计日志 (audit_log)', value: 'audit_log' },
    { label: '成员角色 (member_role)', value: 'member_role' },
    { label: '成员账号 (member_user)', value: 'member_user' },
    { label: '成员菜单 (member_menu)', value: 'member_menu' },
];

// 值 → 中文标签 查找表
const actionLabelMap = new Map(actionOptions.map((o) => [o.value, o.label]));
const resourceTypeLabelMap = new Map(resourceTypeOptions.map((o) => [o.value, o.label]));

// ---- 权限 ----
const permissionStore = usePermissionStore();
const canClear = computed(() => permissionStore.hasAnyPermission(['config:audit:clear']));
const canExport = computed(() => permissionStore.hasAnyPermission(['config:audit:export']));
const canDelete = computed(() => permissionStore.hasAnyPermission(['config:audit:delete']));

// ---- Naive UI dialog / message 实例 ----
const dialog = useDialog();
const message = useMessage();

// ---- 数据加载 ----
const allData = ref<LogRow[]>([]);
const isLoading = ref(true);

/**
 * 调后端拉数据
 * @param page 当前页（后端分页；不再像以前那样一次性拉 500 条）
 * @param pageSize 每页条数
 */
async function loadData(page: number, pageSize: number) {
    isLoading.value = true;
    try {
        // 把 dateRange 拆成 startDate / endDate 透传给后端
        const [start, end] = filters.dateRange ?? [];
        const { data, total: t } = await getLogs({
            page,
            pageSize,
            action: filters.action || undefined,
            resourceType: filters.resourceType || undefined,
            startDate: start ? new Date(start).toISOString() : undefined,
            endDate: end ? new Date(end).toISOString() : undefined,
        });
        allData.value = data;
        total.value = t;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '加载审计日志失败');
    } finally {
        isLoading.value = false;
    }
}

onMounted(() => {
    // 首次进入：拉第 1 页
    loadData(page.value, pageSize.value);
});

// ---- 筛选（本地状态，必须点"查询"才发请求） ----
const isCollapsed = ref(true);

const filters = reactive<{
    action: string | null;
    resourceType: string | null;
    /** n-date-picker 的双值数组：[startMs, endMs] | null */
    dateRange: [number, number] | null;
}>({
    action: null,
    resourceType: null,
    dateRange: null,
});

/**
 * 客户端二次过滤：后端已经按 action / resourceType / 时间区间过滤过，
 * 这里不再做过滤，直接返回 allData（保留这段结构是方便后续加纯前端过滤）。
 */
const filteredAll = computed(() => allData.value);

// ---- 分页（n-data-table 服务端分页） ----
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

// 分页切换时去后端拉新数据（pageSize / page 变化都触发）
watch([page, pageSize], async ([newPage, newSize], [oldPage, oldSize]) => {
    if (oldPage === undefined) return; // 首次 mount 已经在 onMounted 里加载
    if (newPage === oldPage && newSize === oldSize) return;
    await loadData(newPage, newSize);
});

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

// ---- 操作 ----
/**
 * 点"查询"按钮：把筛选条件提交给后端，重新从第 1 页拉
 *
 * 注意：这里不会 watch filters.* 自动请求，必须用户主动点按钮
 * （spec §"搜索下拉无副作用"）
 */
function onSearch() {
    page.value = 1;
    loadData(page.value, pageSize.value);
}

function onReset() {
    filters.action = null;
    filters.resourceType = null;
    filters.dateRange = null;
    page.value = 1;
    loadData(page.value, pageSize.value);
}

/**
 * 删除单条审计日志
 */
function onDeleteOne(row: LogRow) {
    dialog.warning({
        title: '确认删除',
        content: '将永久删除该条审计日志，不可恢复。',
        positiveText: '确认',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                await deleteLog(row.id);
                message.success('已删除');
                await loadData(page.value, pageSize.value);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                message.error(msg || '删除失败');
            }
        },
    });
}

/**
 * 清空所有审计日志（二次确认）
 */
function onClear() {
    dialog.warning({
        title: '确认清空',
        content: '将永久删除所有审计日志，此操作不可恢复。确定要继续吗？',
        positiveText: '确认清空',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                const count = await clearLogs();
                message.success(`已清空 ${count} 条审计日志`);
                page.value = 1;
                await loadData(page.value, pageSize.value);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                message.error(msg || '清空失败');
            }
        },
    });
}

/**
 * 导出审计日志为 CSV 文件
 * - 使用当前筛选条件（action / resourceType / 时间区间）
 * - 生成 CSV blob → 触发浏览器下载
 */
async function onExport() {
    try {
        message.info('正在导出，请稍候...');
        const [start, end] = filters.dateRange ?? [];
        const rows = await exportLogs({
            action: filters.action || undefined,
            resourceType: filters.resourceType || undefined,
            startDate: start ? new Date(start).toISOString() : undefined,
            endDate: end ? new Date(end).toISOString() : undefined,
        });

        if (rows.length === 0) {
            message.warning('没有匹配的审计日志可导出');
            return;
        }

        // 生成 CSV
        const BOM = '﻿';
        const headers = ['时间', '操作者', '操作', '资源类型', '资源ID', 'IP', '详情'];
        const csvRows = [headers.join(',')];
        for (const row of rows) {
            const escaped = [
                row.time,
                row.operator,
                row.action,
                row.resourceType,
                row.resourceId,
                row.ip,
                row.detail,
            ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
            csvRows.push(escaped.join(','));
        }

        const blob = new Blob([BOM + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        message.success(`已导出 ${rows.length} 条审计日志`);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '导出失败');
    }
}

// ---- 表格列（7 列审计风格） ----
const columns = [
    { title: '操作者', key: 'operator' },

    {
        title: '操作',
        key: 'action',
        render: (row: LogRow) =>
            h(
                NTag,
                { type: 'default', size: 'small', bordered: false, strong: true },
                () => actionLabelMap.get(row.action) ?? row.action,
            ),
    },
    {
        title: '资源类型',
        key: 'resourceType',
        render: (row: LogRow) =>
            h(
                NTag,
                { type: 'info', size: 'small', bordered: false, strong: true },
                () => resourceTypeLabelMap.get(row.resourceType) ?? row.resourceType,
            ),
    },
    { title: '时间', key: 'time' },
    {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        render: (row: LogRow) =>
            h(NSpace, { size: 4 }, () => [
                h(
                    NButton,
                    {
                        quaternary: true,
                        size: 'small',
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
                              onClick: () => onDeleteOne(row),
                          },
                          () => '删除',
                      )
                    : null,
            ]),
    },
];

// ---- 详情 Modal ----
const detailVisible = ref(false);
const detailRow = ref<LogRow | null>(null);

function formatDetail(detail: string): string {
    if (!detail || detail === '-') return '（无详情）';
    try {
        return JSON.stringify(JSON.parse(detail), null, 2);
    } catch {
        return detail;
    }
}
</script>
