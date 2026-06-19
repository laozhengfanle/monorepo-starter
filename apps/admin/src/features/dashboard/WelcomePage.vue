<template>
    <n-space vertical :size="gap">
        <!-- ==================== 英雄卡片：问候 + 用户信息 ==================== -->
        <n-card content-class="relative">
            <!-- 顶部渐变装饰条：纯装饰，无 Naive 替代 -->
            <div
                class="absolute left-0 top-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-purple-500 to-rose-500"
            />

            <n-grid cols="1 768:2" :x-gap="gap" :y-gap="gap" responsive="self">
                <!-- 左侧：主信息区 -->
                <n-gi>
                    <n-space vertical :size="16">
                        <n-space align="center" :size="8" class="text-xs font-medium text-blue-600 dark:text-blue-400">
                            <!-- 脉冲点：纯装饰 -->
                            <span class="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            <n-text>系统运行正常</n-text>
                            <n-text depth="3">·</n-text>
                            <n-text depth="3">{{ currentTime }}</n-text>
                        </n-space>

                        <n-space align="center" :size="16" :wrap="true">
                            <n-avatar :src="adminAvatar" :size="56" round />
                            <n-space vertical :size="4">
                                <h2 class="text-2xl sm:text-3xl font-semibold leading-tight">
                                    {{ greeting }}，{{ adminName }}
                                </h2>
                                <n-space align="center" :size="8" :wrap="true">
                                    <n-text>欢迎回来</n-text>
                                    <n-tag :bordered="false" size="small" type="info">
                                        {{ displayRole }}
                                    </n-tag>
                                </n-space>
                            </n-space>
                        </n-space>
                    </n-space>
                </n-gi>

                <!-- 右侧：今日日期面板 -->
                <n-gi>
                    <n-space vertical align="end" :size="2" class="md:items-end">
                        <span class="text-5xl font-bold leading-none tracking-tight text-gray-900 dark:text-gray-100">
                            {{ currentDay }}
                        </span>
                        <n-text>{{ currentYearMonth }}</n-text>
                        <n-text depth="3" class="text-xs">{{ currentWeekday }}</n-text>
                    </n-space>
                </n-gi>
            </n-grid>
        </n-card>

        <!-- ==================== 统计指标卡片行 ==================== -->
        <n-grid cols="3" :x-gap="gap" :y-gap="gap" responsive="screen">
            <n-gi v-for="stat in stats" :key="stat.label">
                <n-card class="relative overflow-hidden">
                    <!-- 左侧彩色竖条：纯装饰 -->
                    <div class="absolute left-0 top-0 bottom-0 w-1" :style="{ backgroundColor: stat.color }" />
                    <n-statistic :value="String(stat.value)" tabular-nums>
                        <template #label>
                            <n-text depth="3" class="text-sm">{{ stat.label }}</n-text>
                        </template>
                    </n-statistic>
                </n-card>
            </n-gi>
        </n-grid>

        <!-- ==================== 快捷导航 ==================== -->
        <n-empty v-if="!quickEntries.length" description="暂无快捷入口" class="py-6" />
        <n-grid v-else cols="2 s:4" :x-gap="gap" :y-gap="gap" responsive="screen">
            <n-gi v-for="item in quickEntries" :key="item.title">
                <n-card
                    class="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 h-full"
                    @click="onQuickEntry(item)"
                >
                    <n-space align="center" :size="12">
                        <div
                            class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                            :class="item.bgClass"
                        >
                            <n-icon :size="20" :color="item.iconColor">
                                <component :is="item.icon" />
                            </n-icon>
                        </div>
                        <n-space vertical :size="2">
                            <n-text class="text-sm font-medium">{{ item.title }}</n-text>
                            <n-text depth="3" class="text-xs">{{ item.desc }}</n-text>
                        </n-space>
                    </n-space>
                </n-card>
            </n-gi>
        </n-grid>

        <!-- ==================== 系统环境 + 最近访问 ==================== -->
        <n-grid cols="1 l:24" :x-gap="gap" :y-gap="gap" responsive="screen">
            <!-- 系统环境 -->
            <n-gi span="1 l:14">
                <n-card class="h-full">
                    <template #header>
                        <n-text class="text-sm font-medium">配置中心</n-text>
                    </template>
                    <n-grid cols="2" :x-gap="gap" :y-gap="gap">
                        <n-gi v-for="info in systemInfos" :key="info.label">
                            <n-space align="center" :size="10">
                                <div
                                    class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                    :class="info.dotClass"
                                >
                                    <n-icon :size="24" :color="info.iconColor">
                                        <component :is="info.icon" />
                                    </n-icon>
                                </div>
                                <n-space vertical :size="2">
                                    <n-text depth="3" class="text-xs">{{ info.label }}</n-text>
                                    <n-text class="text-xs font-medium truncate">{{ info.value }}</n-text>
                                </n-space>
                            </n-space>
                        </n-gi>
                    </n-grid>
                </n-card>
            </n-gi>

            <!-- 最近访问 -->
            <n-gi span="1 l:10">
                <n-card title="最近访问">
                    <template #header-extra>
                        <n-button v-if="recentVisits.length" text size="small" @click="clearVisits"> 清空 </n-button>
                    </template>
                    <n-empty v-if="!recentVisits.length" description="暂无数据" class="py-6" />
                    <n-grid v-else cols="2 s:3" :x-gap="12" :y-gap="12" responsive="screen">
                        <n-gi
                            v-for="visit in recentVisits"
                            :key="visit.path"
                            class="cursor-pointer rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 p-2 overflow-hidden"
                            @click="router.push(visit.path)"
                        >
                            <n-space vertical :size="0">
                                <n-text class="text-sm block truncate">{{ visit.title }}</n-text>
                                <n-text depth="3" class="text-xs block truncate">{{ visit.path }}</n-text>
                            </n-space>
                        </n-gi>
                    </n-grid>
                </n-card>
            </n-gi>
        </n-grid>
    </n-space>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, onMounted, onUnmounted } from 'vue';

defineOptions({ name: 'DashboardWelcomePage' });
import { useRouter } from 'vue-router';
import { useDialog } from 'naive-ui';
import { useAdminStore } from '@/shared/stores/admin';
import { usePermissionStore } from '@/shared/stores/permission';
import { useSystemInfo } from '@/shared/composables/useSystemInfo';
import { useDesignTokens } from '@/shared/composables/useDesignTokens';
import {
    PersonOutline,
    SettingsOutline,
    BarChartOutline,
    MenuOutline,
    DesktopOutline,
    GlobeOutline,
    SpeedometerOutline,
    TimeOutline,
} from '@vicons/ionicons5';
import { getQuickEntries, type QuickEntry } from '@/api';

const router = useRouter();
const adminStore = useAdminStore();
const permissionStore = usePermissionStore();
const { gap } = useDesignTokens();
const adminName = computed(() => adminStore.adminName || '管理员');
const adminAvatar = computed(() => adminStore.adminAvatar);

const ROLE_LABEL_MAP: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    editor: '内容编辑',
    viewer: '观察者',
    auditor: '审计员',
    operator: '运营专员',
};
const rawRole = computed(() => adminStore.adminInfo?.role || '');
const displayRole = computed(() => ROLE_LABEL_MAP[rawRole.value] || rawRole.value || '-');

const greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 9) return '早上好';
    if (hour < 12) return '上午好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
});

const currentYearMonth = computed(() => {
    const d = new Date();
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
});

const currentDay = computed(() => String(new Date().getDate()));

const currentTime = ref('');
const now = ref(new Date());
let timer: number | null = null;

function refreshNow() {
    const d = new Date();
    now.value = d;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    currentTime.value = `${hh}:${mm}`;
}

const currentWeekday = computed(() => {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return days[now.value.getDay()];
});

const menuCount = computed(() => permissionStore.menuCount);

const stats = computed(() => {
    const ready = permissionStore.isReady;
    return [
        {
            label: '权限数量',
            value: ready ? String(permissionStore.permissions.length) : '—',
            color: '#18a058',
        },
        { label: '菜单数量', value: ready ? String(menuCount.value) : '—', color: '#2080f0' },
        {
            label: '动态路由',
            value: ready ? String(permissionStore.dynamicRoutes.length) : '—',
            color: '#f0a020',
        },
    ];
});

const { os: osInfo, browser: browserInfo, resolution: screenResolution } = useSystemInfo();

const systemInfos = computed(() => [
    {
        label: '操作系统',
        value: osInfo.value,
        icon: DesktopOutline,
        iconColor: '#8a2be2',
        dotClass: 'bg-purple-50 dark:bg-purple-900/30',
    },
    {
        label: '浏览器',
        value: browserInfo.value,
        icon: GlobeOutline,
        iconColor: '#00bcd4',
        dotClass: 'bg-cyan-50 dark:bg-cyan-900/30',
    },
    {
        label: '屏幕分辨率',
        value: screenResolution.value,
        icon: SpeedometerOutline,
        iconColor: '#ff9800',
        dotClass: 'bg-orange-50 dark:bg-orange-900/30',
    },
    {
        label: '时区',
        value: Intl.DateTimeFormat().resolvedOptions().timeZone,
        icon: TimeOutline,
        iconColor: '#607d8b',
        dotClass: 'bg-slate-100 dark:bg-slate-800',
    },
]);

interface QuickEntryWithIcon extends QuickEntry {
    icon: unknown;
}
const quickEntries = shallowRef<QuickEntryWithIcon[]>([]);

const dialog = useDialog();

const routePermissionMap: Record<string, string> = {
    '/iam/admin': 'iam:admin:view',
    '/iam/role': 'iam:role:view',
    '/iam/menu': 'iam:menu:view',
    '/dashboard/analysis': 'dashboard:analytics',
};

function onQuickEntry(item: QuickEntryWithIcon) {
    const perm = routePermissionMap[item.route];
    if (perm && !permissionStore.hasAnyPermission([perm])) {
        dialog.warning({
            title: '无权限',
            content: `你没有访问「${item.title}」的权限`,
            positiveText: '知道了',
        });
        return;
    }
    router.push(item.route);
}

const iconMap: Record<string, unknown> = {
    '/iam/admin': PersonOutline,
    '/iam/role': SettingsOutline,
    '/iam/menu': MenuOutline,
    '/dashboard/analysis': BarChartOutline,
};

interface VisitRecord {
    title: string;
    path: string;
    time: number;
}
const VISITS_KEY = 'dashboard-recent-visits';
const recentVisits = ref<VisitRecord[]>([]);

function loadVisits(): VisitRecord[] {
    try {
        const raw = localStorage.getItem(VISITS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

let removeGuard: (() => void) | null = null;

onMounted(async () => {
    refreshNow();
    timer = window.setInterval(refreshNow, 30 * 1000);
    try {
        const entries = await getQuickEntries();
        quickEntries.value = entries.map((entry) => ({
            ...entry,
            icon: iconMap[entry.route] || PersonOutline,
        }));
    } catch {
        // 无权限或异常时静默，显示空占位
    }
    recentVisits.value = loadVisits();
    removeGuard = router.afterEach(() => {
        recentVisits.value = loadVisits();
    });
});

onUnmounted(() => {
    removeGuard?.();
    if (timer !== null) window.clearInterval(timer);
});

function clearVisits() {
    localStorage.removeItem(VISITS_KEY);
    recentVisits.value = [];
}
</script>
