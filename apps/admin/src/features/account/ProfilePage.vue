<template>
    <n-space vertical :size="gap">
        <!-- 页面标题 -->
        <n-page-header title="个人中心" subtitle="欢迎使用管理后台" />

        <!-- 双列布局：左侧（个人中心 + 账号信息） / 右侧（权限概览） -->
        <n-grid cols="1 1024:2" :x-gap="gap" :y-gap="gap" responsive="screen">
            <!-- 左列 -->
            <n-gi>
                <n-space vertical :size="gap">
                    <!-- 个人中心卡片 -->
                    <n-card title="个人中心">
                        <template #header-extra>
                            <n-button type="primary" @click="router.push({ name: 'AccountSettingsPage' })">
                                <template #icon>
                                    <n-icon><SettingsOutline /></n-icon>
                                </template>
                                账号设置
                            </n-button>
                        </template>

                        <n-space vertical align="center" :size="16" class="py-4 sm:flex-row sm:items-start sm:gap-6">
                            <!-- 头像 -->
                            <div class="relative group shrink-0">
                                <n-avatar :src="adminAvatar" :size="88" round />
                                <!-- 悬浮遮罩：无 Naive 替代 -->
                                <div
                                    class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                                    style="border-radius: 50%"
                                    @click="onAvatarClick"
                                >
                                    <n-icon :size="24" color="#fff"><CameraOutline /></n-icon>
                                </div>
                                <input
                                    ref="avatarInputRef"
                                    type="file"
                                    accept="image/*"
                                    class="hidden"
                                    @change="onAvatarChange"
                                />
                            </div>

                            <!-- 基本信息 -->
                            <n-space vertical :size="4" class="flex-1 text-center sm:text-left min-w-0">
                                <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                    {{ adminName }}
                                </h2>
                                <n-text depth="3" class="text-sm">{{ userEmail }}</n-text>
                                <n-tag :type="roleTagType">{{ displayRole }}</n-tag>
                            </n-space>
                        </n-space>
                    </n-card>

                    <!-- 账号信息卡片 -->
                    <n-card title="账号信息">
                        <template #header-extra>
                            <n-text depth="3" class="text-sm">账号设置</n-text>
                        </template>

                        <n-descriptions bordered :column="1" label-placement="left" :label-style="{ width: '100px' }">
                            <n-descriptions-item label="账号">{{ userId }}</n-descriptions-item>
                            <n-descriptions-item label="用户名">{{ adminName }}</n-descriptions-item>
                            <n-descriptions-item label="邮箱">{{ userEmail || '未设置' }}</n-descriptions-item>
                            <n-descriptions-item label="角色">{{ displayRole }}</n-descriptions-item>
                            <n-descriptions-item label="创建时间">{{ createAt || '-' }}</n-descriptions-item>
                        </n-descriptions>
                    </n-card>
                </n-space>
            </n-gi>

            <!-- 右列：权限概览 -->
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
                                <n-text class="text-base font-semibold">角色权限</n-text>
                                <n-text depth="3" class="text-xs">配置中心</n-text>
                            </n-space>
                        </n-space>
                    </template>

                    <!-- 统计数字 -->
                    <n-grid cols="3" :x-gap="gap" :y-gap="gap" class="mb-(--gap)">
                        <n-gi>
                            <div class="text-center py-3 bg-blue-50 dark:bg-blue-950 rounded">
                                <n-statistic :value="String(permissionCount)">
                                    <template #label>
                                        <n-text depth="3" class="text-xs">权限数</n-text>
                                    </template>
                                </n-statistic>
                            </div>
                        </n-gi>
                        <n-gi>
                            <div class="text-center py-3 bg-green-50 dark:bg-green-950 rounded">
                                <n-statistic :value="String(menuCount)">
                                    <template #label>
                                        <n-text depth="3" class="text-xs">菜单数</n-text>
                                    </template>
                                </n-statistic>
                            </div>
                        </n-gi>
                        <n-gi>
                            <div class="text-center py-3 bg-amber-50 dark:bg-amber-950 rounded">
                                <n-statistic :value="String(dynamicRouteCount)">
                                    <template #label>
                                        <n-text depth="3" class="text-xs">动态路由</n-text>
                                    </template>
                                </n-statistic>
                            </div>
                        </n-gi>
                    </n-grid>

                    <!-- 超级管理员提示 -->
                    <n-alert v-if="isSuperAdmin" type="success" class="mt-4">
                        提示：您是超级管理员，拥有系统所有权限。
                    </n-alert>

                    <!-- 超级管理员时：展示其他角色的权限示例 -->
                    <n-space v-if="isSuperAdmin" vertical :size="gap">
                        <n-card v-for="role in otherRoleExamples" :key="role.role" size="small">
                            <n-space align="center" :size="8" class="mb-3">
                                <n-tag :type="role.tagType">{{ role.label }}</n-tag>
                                <n-text depth="3" class="text-xs">{{ role.permissions.length }} 个权限</n-text>
                            </n-space>
                            <n-data-table
                                :columns="permColumns"
                                :data="role.permissions"
                                :bordered="false"
                                size="small"
                            />
                        </n-card>
                    </n-space>

                    <n-empty v-if="!isSuperAdmin && !permissionTreeData.length" description="暂无数据" class="py-4" />
                </n-card>
            </n-gi>
        </n-grid>
    </n-space>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from '@/shared/composables/useMessage';
import type { TreeOption } from 'naive-ui';
import { useAdminStore } from '@/shared/stores/admin';
import { usePermissionStore } from '@/shared/stores/permission';
import { SettingsOutline, ShieldCheckmarkOutline, CameraOutline } from '@vicons/ionicons5';
import type { MenuNode } from '@/features/iam/menus/types';
import { useDesignTokens } from '@/shared/composables/useDesignTokens';

defineOptions({ name: 'AccountProfilePage' });

const router = useRouter();
const { message } = useMessage();
const adminStore = useAdminStore();
const permissionStore = usePermissionStore();
const { gap } = useDesignTokens();

const adminName = computed(() => adminStore.adminName || '未命名');
const adminAvatar = computed(() => adminStore.adminAvatar);
const userEmail = computed(() => (adminStore.adminInfo?.email as string) || '');
const userId = computed(() => adminStore.adminInfo?.id || '-');
const createAt = computed(() => (adminStore.adminInfo?.createAt as string) || '');

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
    const map: Record<string, string> = {
        super_admin: 'error',
        admin: 'warning',
        editor: 'info',
        viewer: 'default',
    };
    return (map[rawRole.value] || 'info') as 'error' | 'warning' | 'info' | 'default';
});

const isSuperAdmin = computed(() => rawRole.value === 'super_admin');

const permissions = computed(() => permissionStore.permissions);
const permissionCount = computed(() => permissions.value.length);
const menuCount = computed(() => permissionStore.menuCount);
const dynamicRouteCount = computed(() => permissionStore.dynamicRoutes.length);

function buildPermissionTree(nodes: MenuNode[]): TreeOption[] {
    const result: TreeOption[] = [];
    for (const node of nodes) {
        // type 字段与后端 admin-menu.schema.ts 对齐：'directory' 表示分组容器
        if (node.type === 'directory') {
            if (node.children) {
                const children = buildPermissionTree(node.children);
                if (children.length > 0) result.push({ key: `folder-${node.id}`, label: node.name, children });
            }
            continue;
        }
        if (node.type === 'menu') {
            if (node.children) {
                const children = buildPermissionTree(node.children);
                if (children.length > 0) result.push({ key: `menu-${node.id}`, label: node.name, children });
            }
            continue;
        }
        if (node.type === 'button' && node.permissionCode) {
            result.push({ key: `btn-${node.id}`, label: node.name });
        }
    }
    return result;
}

const permissionTreeData = computed(() => buildPermissionTree(permissionStore.menus));

// 表格列定义：文案直接硬编码中文（项目不做 i18n，CLAUDE.md 明确禁止）
const permColumns = computed(() => [
    { title: '权限名称', key: 'name', width: '33%' },
    {
        title: '权限码',
        key: 'code',
        render: (row: { name: string; code: string }) =>
            h(
                'code',
                {
                    class: 'text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300 font-mono',
                },
                row.code,
            ),
    },
]);

const otherRoleExamples = computed(() => [
    {
        role: 'admin',
        label: '管理员',
        tagType: 'warning' as const,
        permissions: [
            { name: '新增管理员', code: 'admin:create' },
            { name: '编辑管理员', code: 'admin:update' },
            { name: '删除管理员', code: 'admin:delete' },
            { name: '新增角色', code: 'role:create' },
            { name: '编辑角色', code: 'role:update' },
            { name: '删除角色', code: 'role:delete' },
        ],
    },
    {
        role: 'editor',
        label: '内容编辑',
        tagType: 'info' as const,
        permissions: [
            { name: '新增内容', code: 'article:create' },
            { name: '编辑内容', code: 'article:update' },
            { name: '发布内容', code: 'article:publish' },
            { name: '删除内容', code: 'article:delete' },
        ],
    },
    {
        role: 'viewer',
        label: '查看者',
        tagType: 'default' as const,
        permissions: [
            { name: '查看配置中心', code: 'settings:view' },
            { name: '查看操作日志', code: 'logs:view' },
            { name: '导出操作日志', code: 'logs:export' },
        ],
    },
]);

const avatarInputRef = ref<HTMLInputElement | null>(null);

function onAvatarClick() {
    avatarInputRef.value?.click();
}

function onAvatarChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) message.info('头像已选择');
}
</script>
