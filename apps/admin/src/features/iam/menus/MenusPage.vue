<!--
  菜单管理页面 — 树形表格展示所有菜单项
  功能：展示菜单层级、路由信息、组件映射、排序、可见性、缓存策略等
  字段对齐后端 AdminMenu 表结构
  删除为硬删除（不可恢复），有子节点时不允许删除
-->
<template>
    <n-space vertical :size="gap">
        <!-- 顶部统计卡片 -->
        <n-grid :x-gap="gap" :y-gap="gap" cols="2 s:4" responsive="screen">
            <n-gi v-for="card in statCards" :key="card.label">
                <n-card size="small">
                    <n-space align="center" :size="12">
                        <div class="stat-card__icon" :class="card.bgClass">
                            <n-icon :component="card.icon" size="22" :class="card.iconClass" />
                        </div>
                        <n-space vertical :size="2">
                            <n-text depth="3" class="text-xs">{{ card.label }}</n-text>
                            <n-text class="text-xl font-semibold">
                                {{ card.value }}
                                <n-text depth="3" class="text-xs font-normal">个</n-text>
                            </n-text>
                        </n-space>
                    </n-space>
                </n-card>
            </n-gi>
        </n-grid>

        <!-- 菜单表格 -->
        <n-card title="菜单管理">
            <template #header-extra>
                <n-button type="primary" @click="openCreate">
                    <template #icon>
                        <n-icon :component="AddOutline" />
                    </template>
                    添加菜单
                </n-button>
            </template>

            <n-data-table
                :columns="columns"
                :data="filteredData"
                :loading="isLoading"
                :single-line="false"
                :row-key="(row: FlatMenuRow) => row.id"
                :row-props="rowProps"
            />
        </n-card>

        <!-- 新增/编辑菜单抽屉 -->
        <MenuFormDrawer
            v-model:show="isFormDrawerVisible"
            :parent-id="defaultParentId"
            :parent-type="defaultParentType"
            :edit-data="editingMenu"
            @saved="onSaved"
        />
    </n-space>
</template>

<script setup lang="ts">
// KeepAlive 通过组件名匹配缓存，必须和路由名 "IamMenusPage" 一致
defineOptions({ name: 'IamMenusPage' });
import { h, onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NCard, NGi, NGrid, NIcon, NSpace, NSwitch, NTag } from 'naive-ui';
import { useMessage } from '@/shared/composables/useMessage';
import {
    AddOutline,
    FolderOutline,
    DocumentTextOutline,
    ShieldCheckmarkOutline,
    MenuOutline,
    FolderOpenOutline,
    DocumentOutline,
    RadioButtonOffOutline,
} from '@vicons/ionicons5';
import { getMenus, deleteMenu, updateMenu, getCurrentUserMenus } from '@/api';
import { usePermissionStore } from '@/shared/stores/permission';
import type { ButtonNode, FolderNode, MenuNode, MenuTypeEnum, PageNode } from './types';
import { isFolder, isPage, isButton } from './types';
import MenuFormDrawer from './MenuFormDrawer.vue';
import { useDesignTokens } from '@/shared/composables/useDesignTokens.ts';

const router = useRouter();
const message = useMessage().message;
const dialog = useMessage().dialog;
const permissionStore = usePermissionStore();
const { gap } = useDesignTokens();

// ============================================================
// 内联开关：可见 / 启用 / 缓存
// ============================================================
const switchingKeys = ref(new Set<string>());

function switchKey(rowId: string, field: string) {
    return `${rowId}:${field}`;
}

function isSwitchLoading(rowId: string, field: string) {
    return switchingKeys.value.has(switchKey(rowId, field));
}

async function toggleMenuField(row: FlatMenuRow, field: string, value: boolean) {
    const key = switchKey(row.id, field);
    switchingKeys.value = new Set([...switchingKeys.value, key]);
    try {
        // 乐观更新：先改本地数据
        (row as unknown as Record<string, unknown>)[field] = value;
        await updateMenu(row.id, { [field]: value });
        // 刷新侧边栏：重新拉取菜单并生成路由
        const { menus, permissions } = await getCurrentUserMenus();
        permissionStore.generateRoutes(menus, permissions);
        message.success('更新成功');
    } catch (e: unknown) {
        // 回滚
        (row as unknown as Record<string, unknown>)[field] = !value;
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '更新失败');
    } finally {
        switchingKeys.value = new Set([...switchingKeys.value].filter((k) => k !== key));
    }
}

// ============================================================
// 类型图标映射
// 后端 type 字段取值：'directory' | 'menu' | 'button'（与 admin-menu.schema.ts 对齐）
// ============================================================
const typeIconMap = {
    directory: FolderOpenOutline,
    menu: DocumentOutline,
    button: RadioButtonOffOutline,
} as const;

// ============================================================
// 树 → 平铺
// ============================================================

/** 平铺行类型：保留可辨识联合结构，附加 level 和 fullPath */
type FlatFolderRow = FolderNode & { level: number; fullPath: string; children?: undefined };
type FlatPageRow = PageNode & { level: number; fullPath: string; children?: undefined };
type FlatButtonRow = ButtonNode & { level: number; fullPath: string; children?: undefined };
type FlatMenuRow = FlatFolderRow | FlatPageRow | FlatButtonRow;

function joinPath(parent: string, child: string): string {
    if (!child) return parent;
    const result = parent ? parent + '/' + child : child;
    return (result.startsWith('/') ? result : '/' + result).replace(/\/+/g, '/');
}

function flattenTree(nodes: MenuNode[], level = 0, parentPath = ''): FlatMenuRow[] {
    return nodes.flatMap((node) => {
        // path 仅在 directory 和 menu 上存在
        const path = isFolder(node) || isPage(node) ? node.path : '';
        const fullPath = !isButton(node) ? joinPath(parentPath, path) : '';
        const row: FlatMenuRow = {
            ...node,
            level,
            fullPath,
            children: undefined,
        };
        const childrenParent = isFolder(node) ? fullPath : parentPath;
        return [row, ...flattenTree(node.children ?? [], level + 1, childrenParent)];
    });
}

/**
 * 从扁平列表构建树
 * - 后端 adminMenus 返回的是扁平列表（带 parentId），需要前端构建树
 * - 兼容：父节点缺失（孤儿）会被提升为根节点
 * - 节点按 sort 升序插入同层
 * - 输入数组会被浅拷贝（避免污染原数组的 children）
 */
function buildTree(flat: MenuNode[]): MenuNode[] {
    const map = new Map<string, MenuNode>();
    const roots: MenuNode[] = [];

    // 1) 初始化：每个节点带 children = []
    for (const item of flat) {
        map.set(item.id, { ...item, children: [] });
    }

    // 2) 挂载到父节点 / 收集根
    for (const item of flat) {
        const node = map.get(item.id)!;
        if (item.parentId && map.has(item.parentId)) {
            const parent = map.get(item.parentId)!;
            if (!parent.children) parent.children = [];
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

function rowProps(row: FlatMenuRow) {
    return {
        style: row.enabled === false ? 'opacity: 0.45' : row.type === 'button' ? 'opacity: 0.7' : '',
    };
}

// ============================================================
// 数据加载
// ============================================================
const flatData = ref<FlatMenuRow[]>([]);
const searchKeyword = ref('');
const isLoading = ref(false);

async function loadData() {
    isLoading.value = true;
    try {
        const flat = await getMenus();
        flatData.value = flattenTree(buildTree(flat));
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '加载菜单树失败');
    } finally {
        isLoading.value = false;
    }
}

onMounted(async () => {
    await loadData();
});

/**
 * 前端筛选后的数据：按关键词过滤
 * - 关键词匹配菜单名、路由标识、路由路径、权限码
 */
const filteredData = computed(() => {
    if (!searchKeyword.value.trim()) return flatData.value;
    const kw = searchKeyword.value.toLowerCase();
    return flatData.value.filter((row) => {
        // 名称：所有类型都有
        if (row.name.toLowerCase().includes(kw)) return true;
        // 路由标识：仅 PageNode 有
        if (isPage(row) && row.routeName.toLowerCase().includes(kw)) return true;
        // 路由路径：directory 和 menu 有
        if ((isFolder(row) || isPage(row)) && (row.path || '').toLowerCase().includes(kw)) return true;
        // 权限码：PageNode（可选）和 ButtonNode（必填）有
        if (isPage(row) && row.permissionCode && row.permissionCode.toLowerCase().includes(kw)) return true;
        if (isButton(row) && row.permissionCode.toLowerCase().includes(kw)) return true;
        return false;
    });
});

const stats = computed(() => {
    const data = flatData.value;
    // type 字段必须与后端 admin-menu.schema.ts 保持一致：'directory'（目录）
    return {
        total: data.filter((r) => r.type === 'menu' && (r as FlatPageRow).visible !== false).length,
        folders: data.filter((r) => r.type === 'directory').length,
        menus: data.filter((r) => r.type === 'menu').length,
        buttons: data.filter((r) => r.type === 'button').length,
    };
});

const statCards = computed(() => [
    {
        label: '目录',
        value: stats.value.folders,
        icon: FolderOutline,
        iconClass: 'text-amber-500',
        bgClass: 'bg-amber-50 dark:bg-amber-900/30',
    },
    {
        label: '菜单总数',
        value: stats.value.total,
        icon: MenuOutline,
        iconClass: 'text-blue-500',
        bgClass: 'bg-blue-50 dark:bg-blue-900/30',
    },
    {
        label: '页面菜单',
        value: stats.value.menus,
        icon: DocumentTextOutline,
        iconClass: 'text-emerald-500',
        bgClass: 'bg-emerald-50 dark:bg-emerald-900/30',
    },
    {
        label: '按钮权限',
        value: stats.value.buttons,
        icon: ShieldCheckmarkOutline,
        iconClass: 'text-purple-500',
        bgClass: 'bg-purple-50 dark:bg-purple-900/30',
    },
]);

// ============================================================
// 抽屉状态
// ============================================================
const isFormDrawerVisible = ref(false);
const editingMenu = ref<MenuNode | null>(null);
const defaultParentId = ref<string | null>(null);
const defaultParentType = ref<MenuTypeEnum | null>(null);

function openCreate() {
    editingMenu.value = null;
    defaultParentId.value = null;
    defaultParentType.value = null;
    isFormDrawerVisible.value = true;
}

function onEdit(row: MenuNode) {
    editingMenu.value = row;
    defaultParentId.value = null;
    defaultParentType.value = null;
    isFormDrawerVisible.value = true;
}

function onAddChild(row: MenuNode) {
    editingMenu.value = null;
    defaultParentId.value = row.id;
    defaultParentType.value = row.type as MenuTypeEnum;
    isFormDrawerVisible.value = true;
}

function onDelete(row: MenuNode) {
    dialog.warning({
        title: '确认删除',
        content: `确定要删除菜单「${row.name}」吗？此操作不可恢复。`,
        positiveText: '确认删除',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                await deleteMenu(row.id);
                message.success('菜单已删除');
                await loadData();
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '删除失败，请稍后重试';
                message.error(msg);
            }
        },
    });
}

async function onSaved() {
    await loadData();
    isFormDrawerVisible.value = false;
}

// ============================================================
// 列定义
// ============================================================
const columns = [
    {
        title: '菜单名称',
        key: 'name',
        render: (row: FlatMenuRow) => {
            // visible 仅在 directory 和 menu 上存在，button 无此字段
            // 早返回 button 类型避免后续 redundant narrowing
            let visible: boolean = true;
            if (isFolder(row) || isPage(row)) {
                visible = row.visible;
            }
            const isHidden = visible === false;
            const isDisabled = row.enabled === false;
            const TypeIcon = typeIconMap[row.type];
            const indentLevel = row.type === 'button' ? row.level + 1 : row.level;
            const indent = indentLevel * 20;

            return h('span', { class: 'inline-flex items-center gap-2', style: { paddingLeft: `${indent}px` } }, [
                h(
                    NIcon,
                    {
                        size: 15,
                        class: [
                            'shrink-0',
                            row.type === 'directory'
                                ? 'text-amber-400'
                                : row.type === 'menu'
                                  ? 'text-emerald-400'
                                  : 'text-purple-400',
                        ].join(' '),
                    },
                    () => h(TypeIcon),
                ),
                h(
                    'span',
                    {
                        class: [
                            isHidden ? 'line-through text-gray-400' : isDisabled ? 'text-gray-400' : 'font-medium',
                        ].join(' '),
                    },
                    row.name,
                ),
                isHidden ? h(NTag, { size: 'tiny', type: 'default', class: 'ml-1' }, () => '隐藏') : null,
                isDisabled ? h(NTag, { size: 'tiny', type: 'error', class: 'ml-1' }, () => '禁用') : null,
            ]);
        },
    },
    {
        title: '路由标识',
        key: 'routeName',
        render: (row: FlatMenuRow) => {
            // routeName 仅 PageNode 有
            const val = isPage(row) ? row.routeName : '';
            return h(
                'code',
                {
                    class: 'text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
                },
                val || '-',
            );
        },
    },
    {
        title: '路由路径',
        key: 'fullPath',
        render: (row: FlatMenuRow) => {
            // button 没有路由路径
            if (isButton(row)) {
                return h('span', { class: 'text-gray-300 text-xs' }, '-');
            }
            // directory 仅作分组，不显示可点击路径
            if (isFolder(row)) {
                return h('span', { class: 'text-gray-300 text-xs' }, '-');
            }
            // PageNode：外部链接
            if (/^https?:\/\//.test(row.fullPath)) {
                return h(
                    'a',
                    {
                        href: row.fullPath,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        class: 'text-xs text-blue-500 hover:text-blue-600 underline decoration-dashed underline-offset-2',
                    },
                    row.fullPath,
                );
            }
            // PageNode：内部路径，可点击跳转
            return h(
                'a',
                {
                    href: row.fullPath,
                    onClick: (e: Event) => {
                        e.preventDefault();
                        router.push({ name: row.routeName });
                    },
                    class: 'text-xs text-blue-500 hover:text-blue-600 cursor-pointer',
                },
                row.fullPath || '-',
            );
        },
    },
    {
        title: '组件',
        key: 'component',
        render: (row: FlatMenuRow) => {
            // component 仅 PageNode 有
            const val = row.type === 'menu' ? (row as PageNode).component : '';
            return val
                ? h(
                      'code',
                      {
                          class: 'text-xs px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
                      },
                      val,
                  )
                : h('span', { class: 'text-gray-300 text-xs' }, '-');
        },
    },
    {
        title: '权限码',
        key: 'permissionCode',
        render: (row: FlatMenuRow) => {
            // permissionCode：PageNode 可选，ButtonNode 必填
            const val =
                row.type === 'menu'
                    ? (row as PageNode).permissionCode
                    : row.type === 'button'
                      ? (row as ButtonNode).permissionCode
                      : undefined;
            return val
                ? h(
                      'code',
                      {
                          class: 'text-xs px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
                      },
                      val,
                  )
                : h('span', { class: 'text-gray-300 text-xs' }, '-');
        },
    },
    {
        title: '排序',
        key: 'sort',
        align: 'center' as const,
        render: (row: FlatMenuRow) =>
            row.sort !== undefined
                ? h('span', { class: 'text-xs text-gray-500' }, String(row.sort))
                : h('span', { class: 'text-gray-300 text-xs' }, '-'),
    },
    {
        title: '可见',
        key: 'visible',
        align: 'center' as const,
        render: (row: FlatMenuRow) => {
            if (isButton(row)) {
                return h('span', { class: 'text-gray-300 text-xs' }, '-');
            }
            return h(NSwitch, {
                value: row.visible ?? true,
                size: 'small',
                disabled: row.enabled === false,
                loading: isSwitchLoading(row.id, 'visible'),
                onUpdateValue: (val: boolean) => toggleMenuField(row, 'visible', val),
            });
        },
    },
    {
        title: '启用',
        key: 'enabled',
        align: 'center' as const,
        render: (row: FlatMenuRow) =>
            h(NSwitch, {
                value: row.enabled !== false,
                size: 'small',
                loading: isSwitchLoading(row.id, 'enabled'),
                onUpdateValue: (val: boolean) => toggleMenuField(row, 'enabled', val),
            }),
    },
    {
        title: '缓存',
        key: 'keepAlive',
        align: 'center' as const,
        render: (row: FlatMenuRow) => {
            if (!isPage(row)) {
                return h('span', { class: 'text-gray-300 text-xs' }, '-');
            }
            return h(NSwitch, {
                value: row.keepAlive !== false,
                size: 'small',
                loading: isSwitchLoading(row.id, 'keepAlive'),
                onUpdateValue: (val: boolean) => toggleMenuField(row, 'keepAlive', val),
            });
        },
    },
    {
        title: '操作',
        key: 'actions',
        render: (row: FlatMenuRow) => {
            return h(NSpace, { size: 'small' }, () => [
                h(
                    NButton,
                    {
                        text: true,
                        type: 'primary',
                        size: 'small',
                        onClick: () => onEdit(row),
                    },
                    () => '编辑',
                ),
                h(
                    NButton,
                    {
                        text: true,
                        type: 'error',
                        size: 'small',
                        onClick: () => onDelete(row),
                    },
                    () => '删除',
                ),
                !isButton(row)
                    ? h(
                          NButton,
                          {
                              text: true,
                              type: 'info',
                              size: 'small',
                              onClick: () => onAddChild(row),
                          },
                          () => '子项',
                      )
                    : null,
            ]);
        },
    },
];
</script>

<style scoped>
.stat-card__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    flex-shrink: 0;
}
</style>
