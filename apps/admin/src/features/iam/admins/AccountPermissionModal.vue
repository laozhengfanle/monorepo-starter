<!--
  AccountPermissionModal — 特例授权弹窗（Account 维度 grant/deny）

  为特定账户提供角色权限之外的细粒度覆写。
  三态：默认（走角色）→ Grant（显式授权）→ Deny（显式禁止）

  n-tree 的 checked-keys 仅作角色基线参考（只读展示），
  特例状态通过外部 overrides Ref 独立维护，不污染树状态。
  勾选框通过 cascade + checkable 配置为只读展示角色基线。
-->
<template>
    <n-modal
        :show="show"
        preset="card"
        style="width: 720px"
        :mask-closable="false"
        :auto-focus="false"
        :title="`特例权限 - ${accountName}`"
        @update:show="emit('update:show', $event)"
    >
        <!-- 角色基线说明 + 统计 -->
        <div class="flex items-center justify-between mb-3 gap-3">
            <n-alert type="info" :show-icon="true" class="flex-1">
                通过右侧「允许/禁止」按钮设置特例覆写，带底色的菜单表示角色基线权限。
            </n-alert>
            <n-space size="small" class="shrink-0">
                <n-tag :bordered="false" type="primary" size="small"> 允许 {{ stats.grant }} </n-tag>
                <n-tag :bordered="false" type="error" size="small"> 禁止 {{ stats.deny }} </n-tag>
                <n-button v-if="stats.total > 0" size="tiny" quaternary type="warning" @click="clearAll">
                    清空覆写
                </n-button>
            </n-space>
        </div>

        <n-tree
            ref="treeRef"
            :data="treeData"
            default-expand-all
            node-key="id"
            label-field="name"
            children-field="children"
            :render-prefix="renderPrefix"
            :render-suffix="renderSuffix"
            class="max-h-[60vh] overflow-auto"
        />

        <template #footer>
            <n-space justify="end">
                <n-button @click="onClose">取消</n-button>
                <n-button type="primary" :loading="isSaving" @click="onSave"> 保存 </n-button>
            </n-space>
        </template>
    </n-modal>
</template>

<script setup lang="ts">
defineOptions({ name: 'AccountPermissionModal' });
import { ref, computed, watch, h } from 'vue';
import { NModal, NTree, NButton, NSpace, NAlert, NTag, useMessage, type TreeOption } from 'naive-ui';
import { getMenuTree, getAccountMenus, saveAccountMenus, type AccountMenuOverride, type AccountMenuType } from '@/api';
import type { MenuNode } from '@/features/iam/menus/types';

// ============================================================
// Props & Emits
// ============================================================
const props = defineProps<{
    show: boolean;
    accountId: string;
    accountName: string;
    /** 角色基线权限菜单 ID 数组（只读展示勾选框） */
    roleMenuIds?: string[];
}>();

const emit = defineEmits<{
    'update:show': [value: boolean];
    saved: [];
}>();

const message = useMessage();

// ============================================================
// 树数据
// ============================================================
const treeData = ref<MenuNode[]>([]);
// 角色基线权限（只读勾选框），来自 prop 或默认空
const roleCheckedKeys = ref<string[]>([]);

// 特例覆盖映射：key = menuId, value = 'grant' | 'deny'
const overrides = ref<Record<string, AccountMenuType>>({});

const isSaving = ref(false);

// ============================================================
// 统计：覆写总数 / grant 数 / deny 数
// ============================================================
const stats = computed(() => {
    const values = Object.values(overrides.value);
    return {
        total: values.length,
        grant: values.filter((v) => v === 'grant').length,
        deny: values.filter((v) => v === 'deny').length,
    };
});

/** 一键清空所有覆写 */
function clearAll() {
    overrides.value = {};
}

// ============================================================
// render-prefix：角色基线权限标记（小圆点指示器）
// ============================================================
function renderPrefix({ option }: { option: TreeOption }) {
    const node = option as unknown as MenuNode;
    // 目录节点和不在角色基线中的菜单不显示标记
    if (node.type === 'directory' || !roleCheckedKeys.value.includes(node.id)) return null;

    // 在角色基线中的菜单：显示蓝色小圆点标记
    return h('span', {
        style: {
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#2080f0',
            marginRight: '4px',
            verticalAlign: 'middle',
        },
    });
}

// ============================================================
// 加载数据
// ============================================================

async function loadData() {
    try {
        const [tree, accountMenus] = await Promise.all([getMenuTree(), getAccountMenus(props.accountId)]);
        treeData.value = tree;

        // 角色基线权限来自 prop
        roleCheckedKeys.value = props.roleMenuIds ?? [];

        // 从已有特例记录构建 overrides 映射
        const map: Record<string, AccountMenuType> = {};
        for (const item of accountMenus) {
            map[item.menuId] = item.type;
        }
        overrides.value = map;
    } catch {
        treeData.value = [];
        roleCheckedKeys.value = props.roleMenuIds ?? [];
        overrides.value = {};
    }
}

// ============================================================
// 三态切换
// ============================================================
function toggleOverride(menuId: string, targetType: AccountMenuType) {
    const current = overrides.value[menuId];
    if (current === targetType) {
        // 再次点击 → 回到默认
        delete overrides.value[menuId];
    } else {
        // 设为指定类型（grant 和 deny 互斥）
        overrides.value[menuId] = targetType;
    }
}

// ============================================================
// render-suffix：每行末尾的 grant/deny 按钮
// ============================================================
function renderSuffix({ option }: { option: TreeOption }) {
    // Naive UI TreeOption 不带我们的 type/id 字段，需要断言为 MenuNode
    const node = option as unknown as MenuNode;
    // 目录节点不显示特例操作（type 字段与后端 admin-menu.schema.ts 对齐）
    if (node.type === 'directory') return null;

    const state = overrides.value[node.id];

    return h(
        'span',
        {
            class: 'flex gap-1 ml-2 shrink-0',
            onClick: (e: Event) => e.stopPropagation(),
        },
        [
            h(
                NButton,
                {
                    size: 'tiny',
                    type: state === 'grant' ? 'primary' : 'default',
                    ghost: state !== 'grant',
                    onClick: () => toggleOverride(String(option.id), 'grant'),
                },
                () => '允许',
            ),
            h(
                NButton,
                {
                    size: 'tiny',
                    type: state === 'deny' ? 'error' : 'default',
                    ghost: state !== 'deny',
                    onClick: () => toggleOverride(String(option.id), 'deny'),
                },
                () => '禁止',
            ),
        ],
    );
}

// ============================================================
// 提交
// ============================================================
async function onSave() {
    isSaving.value = true;
    try {
        const items: AccountMenuOverride[] = Object.entries(overrides.value).map(([menuId, type]) => ({
            menuId,
            type,
        }));
        await saveAccountMenus(props.accountId, items);
        message.success('特例权限已保存');
        emit('saved');
        emit('update:show', false);
    } catch (e) {
        // mock 模式处理
        if (String(e).includes('Mock:') || String(e).includes('暂未实现')) {
            message.info('（Mock）特例权限已模拟保存');
            emit('saved');
            emit('update:show', false);
        } else {
            message.error(String(e));
        }
    } finally {
        isSaving.value = false;
    }
}

function onClose() {
    emit('update:show', false);
}

// ============================================================
// Watch：弹窗打开时加载数据
// ============================================================
watch(
    () => props.show,
    (visible) => {
        if (visible) {
            loadData();
        }
    },
);
</script>
