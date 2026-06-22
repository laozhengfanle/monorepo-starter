<!--
    个人中心页面 — 只读展示当前账号信息

    设计要点：
    1. 头像为只读展示，不允许在此处更换
       - 头像更换功能移至"账号设置"页面
    2. 左列：个人中心（头像 + 姓名 + 角色） + 账号信息（账号 ID / 创建时间 / 角色标识）
       - 两块内容不重复：个人中心展示"我是谁"，账号信息展示"账号属性"
    3. 右列：我的权限（基于 store 中真实的 permissionTreeData，n-tree 展示）
       - 旧版本用硬编码 mock 数据展示"其他角色的权限"，已废弃
-->
<template>
    <n-space vertical :size="gap">
        <!-- 页面标题 -->
        <n-page-header title="个人中心" subtitle="查看当前账号信息与权限" />

        <!-- 双列布局：左侧（个人中心 + 账号信息） / 右侧（我的权限） -->
        <n-grid cols="1 1024:2" :x-gap="gap" :y-gap="gap" responsive="self">
            <!-- 左列 -->
            <n-gi>
                <n-space vertical :size="gap">
                    <!-- 个人中心卡片：头像 + 姓名 + 角色（只读） -->
                    <n-card title="个人中心">
                        <template #header-extra>
                            <n-button type="primary" @click="router.push({ name: 'AccountSettingsPage' })">
                                账号设置
                            </n-button>
                        </template>

                        <!-- 头像 + 基本信息：窄屏上下排列，宽屏左右排列 -->
                        <div class="flex flex-col items-center gap-4 py-2 sm:flex-row sm:items-start sm:gap-6">
                            <!-- 头像：只读展示，不接受点击 -->
                            <n-avatar :src="adminAvatar" :size="88" round class="shrink-0" />

                            <!-- 基本信息 -->
                            <div
                                class="flex flex-1 flex-col items-center gap-1 text-center sm:items-start sm:text-left min-w-0"
                            >
                                <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                    {{ adminName }}
                                </h2>
                                <n-text depth="3" class="text-sm">{{ userEmail || '邮箱未设置' }}</n-text>
                                <n-tag :type="roleTagType">{{ displayRole }}</n-tag>
                            </div>
                        </div>
                    </n-card>

                    <!-- 账号信息卡片：账号属性（不与上方"个人中心"卡片字段重复） -->
                    <n-card title="账号信息">
                        <n-descriptions bordered :column="2" label-placement="left" :label-style="{ width: '120px' }">
                            <n-descriptions-item label="账号 ID">{{ userId }}</n-descriptions-item>
                            <n-descriptions-item label="创建时间">{{ displayCreateAt }}</n-descriptions-item>
                            <n-descriptions-item label="角色名称" :span="2">{{ displayRole }}</n-descriptions-item>
                        </n-descriptions>
                    </n-card>
                </n-space>
            </n-gi>

            <!-- 右列：我的权限（真实数据） -->
            <n-gi>
                <n-card>
                    <template #header>
                        <n-space align="start" :size="12">
                            <div
                                class="flex h-8 w-8 items-center justify-center bg-green-100 dark:bg-green-900 rounded"
                            >
                                <n-icon :component="ShieldCheckmarkOutline" size="20" class="text-green-600" />
                            </div>
                            <n-space vertical :size="2">
                                <n-text class="text-base font-semibold">我的权限</n-text>
                                <n-text depth="3" class="text-xs">基于当前账号的真实权限码与菜单</n-text>
                            </n-space>
                        </n-space>
                    </template>

                    <!-- 权限分组：按所属菜单分组，button 节点作为 tag 展示（名称 + 权限码） -->
                    <!-- 无 max-height / 无 overflow / 无 virtual-scroll — 所有权限一次性全部展示 -->
                    <!-- 超级管理员拥有所有权限，直接给提示避免列表过长没意义 -->
                    <n-empty v-if="isSuperAdmin" description="超级管理员拥有所有权限，无需单独展示" class="py-4">
                        <template #icon>
                            <n-icon :component="ShieldCheckmarkOutline" size="40" class="text-primary" />
                        </template>
                    </n-empty>
                    <div v-else-if="permissionGroups.length > 0" class="space-y-6">
                        <div v-for="group in permissionGroups" :key="group.module">
                            <div class="mb-3 flex items-center gap-2">
                                <n-text class="text-sm font-medium">{{ group.module }}</n-text>
                                <!-- 父级权限码：directory 类型可能没有，v-if 兜底 -->
                                <span v-if="group.moduleCode" class="font-mono text-xs text-primary">
                                    {{ group.moduleCode }}
                                </span>
                                <n-tag size="tiny" :bordered="false" type="default">{{ group.items.length }} 项</n-tag>
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                <n-tag v-for="perm in group.items" :key="perm.id" size="small" :bordered="false">
                                    <span>{{ perm.name }}</span>
                                    <span class="ml-1 font-mono text-xs opacity-60">{{ perm.code }}</span>
                                </n-tag>
                            </div>
                        </div>
                    </div>
                    <n-empty v-else description="暂无权限数据" class="py-4" />
                </n-card>
            </n-gi>
        </n-grid>
    </n-space>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminStore } from '@/shared/stores/admin';
import { usePermissionStore } from '@/shared/stores/permission';
import { ShieldCheckmarkOutline } from '@vicons/ionicons5';
import type { MenuNode } from '@/features/iam/menus/types';
import { useDesignTokens } from '@/shared/composables/useDesignTokens';

defineOptions({ name: 'AccountProfilePage' });

const router = useRouter();
const adminStore = useAdminStore();
const permissionStore = usePermissionStore();
const { gap } = useDesignTokens();

// ---- 账号基本信息（统一从 adminStore 读取） ----
const adminName = computed(() => adminStore.adminName || '未命名');
const adminAvatar = computed(() => adminStore.adminAvatar);
const userEmail = computed(() => (adminStore.adminInfo?.email as string) || '');
const userId = computed(() => adminStore.adminInfo?.id || '-');
const createAt = computed(() => (adminStore.adminInfo?.createAt as string) || '');

/**
 * 简单日期格式化（项目里没装 dayjs，避免新增依赖）
 * - 入参：ISO 字符串 | undefined | null
 * - 出参：YYYY-MM-DD HH:mm；非法输入返回 "—"
 * - 个人中心"创建时间"展示用，不需要时区/语言切换
 */
function formatCreateAt(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const displayCreateAt = computed(() => formatCreateAt(createAt.value));

// ---- 角色展示（中文标签 + tag 颜色） ----
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

const roleTagType = computed(() => {
    const map: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
        super_admin: 'error',
        admin: 'warning',
        editor: 'info',
        viewer: 'default',
    };
    return map[rawRole.value] || 'info';
});

/** 是否超级管理员 — 超级管理员拥有所有权限，权限列表直接给提示而非展开 */
const isSuperAdmin = computed(() => rawRole.value === 'super_admin');

// ---- 我的权限（真实数据：permissionStore 注入的菜单树） ----
// 按所属 menu/directory 节点分组，button 节点作为 tag 展示。
// 不使用 n-tree + virtual-scroll，改为"分组 + tag 流" — 无滚动条，所有权限一次性展示。
interface PermissionGroup {
    module: string;
    moduleCode: string;
    items: Array<{ id: string; name: string; code: string }>;
}

const permissionGroups = computed<PermissionGroup[]>(() => {
    const groups: PermissionGroup[] = [];
    // 用 name+code 联合作为 group key，避免 directory 节点名与 menu 节点名重复时合并错乱
    const index = new Map<string, PermissionGroup>();

    function keyOf(name: string, code: string): string {
        return `${name}#${code}`;
    }

    /**
     * 递归遍历菜单树
     * 设计：把"页面级访问权限"（menu 节点本身的 permissionCode）也算作一项，
     *      与下面的 button 操作权限一起归入同一分组，这样分组项数 = 父级 + 子项之和。
     *
     *  - menu 节点（有 permissionCode）→ 它自己就是一个分组：module = name, moduleCode = permissionCode
     *  - directory 节点（无 permissionCode）→ 不创建分组，仅作为容器向子节点透传
     *  - button 节点（必有 permissionCode）→ 归入父级 menu 的分组
     *  - 顶层孤立的 button（罕见）→ 归入「未分组」
     */
    function walk(nodes: MenuNode[]) {
        for (const node of nodes) {
            if (node.type === 'menu' && node.permissionCode) {
                // menu 节点本身是分组主体
                const k = keyOf(node.name, node.permissionCode);
                let group = index.get(k);
                if (!group) {
                    group = { module: node.name, moduleCode: node.permissionCode, items: [] };
                    index.set(k, group);
                    groups.push(group);
                }
                // 父级权限（页面级访问）作为第一项放进去
                group.items.push({
                    id: node.id,
                    name: node.name,
                    code: node.permissionCode,
                });
                // 子节点：button 归入当前 group；directory/menu 继续递归
                for (const child of node.children || []) {
                    if (child.type === 'button') {
                        group.items.push({
                            id: child.id,
                            name: child.name,
                            code: child.permissionCode,
                        });
                    } else {
                        walk([child]);
                    }
                }
            } else if (node.type === 'directory') {
                // directory 是容器，不创建分组，继续向下递归
                walk(node.children || []);
            } else if (node.type === 'button') {
                // 顶层孤立 button（理论上不应该出现，兜底归入「未分组」）
                const k = keyOf('未分组', '');
                let group = index.get(k);
                if (!group) {
                    group = { module: '未分组', moduleCode: '', items: [] };
                    index.set(k, group);
                    groups.push(group);
                }
                group.items.push({
                    id: node.id,
                    name: node.name,
                    code: node.permissionCode,
                });
            }
        }
    }

    walk(permissionStore.menus);
    return groups;
});
</script>
