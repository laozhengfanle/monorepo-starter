<!--
  MenuFormDrawer — 菜单新增/编辑抽屉

  动态表单：根据 type (directory/menu/button) 显隐字段。
  对齐 RBAC 设计方案 6.1 节。
-->
<template>
    <n-drawer :show="show" :width="480" @update:show="emit('update:show', $event)">
        <n-drawer-content :title="isEdit ? '编辑菜单' : '新增菜单'">
            <n-form ref="formRef" :model="form" :rules="rules" label-placement="left" label-width="100">
                <!-- 类型切换（编辑模式下禁用，防止数据丢失） -->
                <n-form-item label="类型" path="type">
                    <FieldRulePopover :rules="typePopoverRules" :value="form.type">
                        <n-radio-group v-model:value="form.type" :disabled="isEdit">
                            <n-radio-button value="directory">
                                <n-icon><FolderOpen20Regular /></n-icon>
                                <span style="margin-left: 4px">目录</span>
                            </n-radio-button>
                            <n-radio-button value="menu">
                                <n-icon><Menu2 /></n-icon>
                                <span style="margin-left: 4px">菜单</span>
                            </n-radio-button>
                            <n-radio-button value="button">
                                <n-icon><SmartButtonFilled /></n-icon>
                                <span style="margin-left: 4px">按钮</span>
                            </n-radio-button>
                        </n-radio-group>
                    </FieldRulePopover>
                </n-form-item>

                <!-- 上级节点 -->
                <n-form-item label="上级节点">
                    <n-tree-select
                        v-model:value="form.parentId"
                        :options="parentOptions"
                        :clearable="true"
                        placeholder="留空则为根节点"
                        label-field="label"
                        key-field="key"
                        children-field="children"
                    />
                </n-form-item>

                <!-- 名称（所有类型必填） -->
                <n-form-item label="名称" path="name">
                    <FieldRulePopover :rules="namePopoverRules" :value="form.name">
                        <n-input v-model:value="form.name" placeholder="如：管理员管理" clearable />
                    </FieldRulePopover>
                </n-form-item>

                <!-- 排序（所有类型） -->
                <n-form-item label="排序" path="sort">
                    <FieldRulePopover :rules="sortPopoverRules" :value="form.sort">
                        <n-input-number v-model:value="form.sort" :min="0" class="w-full" clearable />
                    </FieldRulePopover>
                </n-form-item>

                <!-- ===== directory / menu 字段 ===== -->
                <n-form-item v-if="showField('path')" label="路由路径" path="path">
                    <FieldRulePopover :rules="pathPopoverRules" :value="form.path">
                        <n-input v-model:value="form.path" placeholder="如：users 或 /config/users" clearable />
                    </FieldRulePopover>
                </n-form-item>

                <n-form-item v-if="showField('icon')" label="图标">
                    <n-input v-model:value="form.icon" placeholder="如：tabler:Users" clearable />
                </n-form-item>

                <!-- ===== menu 专属 ===== -->
                <n-form-item v-if="showField('routeName')" label="路由标识" path="routeName">
                    <n-input v-model:value="form.routeName" placeholder="如：IamAdminsPage（唯一）" clearable />
                </n-form-item>

                <n-form-item v-if="showField('component')" label="组件路径" path="component">
                    <n-input v-model:value="form.component" placeholder="如：iam/admins" clearable />
                </n-form-item>

                <n-form-item v-if="showField('keepAlive')" label="页面缓存">
                    <n-switch v-model:value="form.keepAlive" />
                </n-form-item>

                <n-form-item v-if="showField('visible')" label="菜单可见">
                    <n-switch v-model:value="form.visible" />
                </n-form-item>

                <n-form-item v-if="showField('activeMenuId')" label="高亮菜单">
                    <n-tree-select
                        v-model:value="form.activeMenuId"
                        :options="activeMenuOptions"
                        :clearable="true"
                        placeholder="用于详情页高亮父菜单"
                        label-field="label"
                        key-field="key"
                        children-field="children"
                    />
                </n-form-item>

                <!-- ===== menu / button 字段 ===== -->
                <n-form-item v-if="showField('permissionCode')" label="权限码" path="permissionCode">
                    <FieldRulePopover :rules="permissionCodePopoverRules" :value="form.permissionCode">
                        <n-input v-model:value="form.permissionCode" placeholder="如：iam:admin:create" clearable />
                    </FieldRulePopover>
                </n-form-item>

                <!-- 启用状态（所有类型） -->
                <n-form-item label="启用">
                    <n-switch v-model:value="form.enabled" />
                </n-form-item>
            </n-form>

            <template #footer>
                <n-space justify="end">
                    <n-button @click="emit('update:show', false)">取消</n-button>
                    <n-button type="primary" :loading="isSubmitting" @click="onSubmit"> 保存 </n-button>
                </n-space>
            </template>
        </n-drawer-content>
    </n-drawer>
</template>

<script setup lang="ts">
defineOptions({ name: 'MenuFormDrawer' });
import { ref, reactive, watch, computed } from 'vue';
import {
    NDrawer,
    NDrawerContent,
    NForm,
    NFormItem,
    NInput,
    NInputNumber,
    NSwitch,
    NRadioGroup,
    NRadioButton,
    NIcon,
    NTreeSelect,
    NSpace,
    NButton,
    useMessage,
    type FormInst,
    type FormRules,
    type FormItemRule,
    type TreeSelectOption,
} from 'naive-ui';
import { FolderOpen20Regular } from '@vicons/fluent';
import { Menu2 } from '@vicons/tabler';
import { SmartButtonFilled } from '@vicons/material';
import { zodToRules, CreateAdminMenuSchema } from '@packages/shared';
import type { FieldRuleSet } from '@packages/shared';
import { zodToFormRules, zodToPopoverRules } from '@/shared/utils/zod-form-rules';
import FieldRulePopover from '@/shared/components/FieldRulePopover.vue';
import type { MenuTypeEnum, MenuNode, CreateMenuParams, UpdateMenuParams } from './types';
import { isFolder, isPage, isButton } from './types';
import { createMenu, updateMenu, getMenuTree } from '@/api';

// ============================================================
// Props & Emits
// ============================================================
const props = defineProps<{
    show: boolean;
    parentId?: string | null;
    parentType?: MenuTypeEnum | null;
    editData?: MenuNode | null;
}>();

const emit = defineEmits<{
    'update:show': [value: boolean];
    saved: [];
}>();

const message = useMessage();

// ============================================================
// 菜单树缓存（用于 routeName 唯一性校验）
// ============================================================
const menuTreeCache = ref<MenuNode[]>([]);

// ============================================================
// 计算
// ============================================================
const isEdit = computed(() => !!props.editData);

// ============================================================
// 父节点选项（TreeSelect）— 排除 button，编辑时排除自身及子孙
// ============================================================
const parentOptions = ref<TreeSelectOption[]>([]);

/** 收集节点及其所有子孙 id（用于编辑时排除循环引用） */
function collectDescendantIds(nodes: MenuNode[]): string[] {
    const ids: string[] = [];
    for (const n of nodes) {
        ids.push(n.id);
        if (n.children) ids.push(...collectDescendantIds(n.children));
    }
    return ids;
}

function buildTreeOptions(nodes: MenuNode[], excludeIds?: Set<string>): TreeSelectOption[] {
    return nodes
        .filter((n) => {
            // 所有类型的上级都不能是 button
            if (n.type === 'button') return false;
            // directory 的上级只能是 directory（不能是 menu 或 button）
            if (form.type === 'directory' && n.type !== 'directory') return false;
            // 编辑模式排除自身及子孙
            if (excludeIds && excludeIds.has(n.id)) return false;
            return true;
        })
        .map((n) => ({
            key: n.id,
            label: `${n.type === 'directory' ? '📁' : '📄'} ${n.name}`,
            children: n.children ? buildTreeOptions(n.children, excludeIds) : undefined,
        }));
}

async function loadParentOptions() {
    try {
        const tree = await getMenuTree();
        menuTreeCache.value = tree;
        // 编辑模式：排除当前节点及其所有子孙，防止循环引用
        const excludeIds = isEdit.value && props.editData ? new Set(collectDescendantIds([props.editData])) : undefined;
        parentOptions.value = buildTreeOptions(tree, excludeIds);
    } catch {
        parentOptions.value = [];
    }
}

// ============================================================
// 高亮菜单选项（仅 menu 类型节点，directory 仅作分组且不可选）
// ============================================================
const activeMenuOptions = ref<TreeSelectOption[]>([]);

function buildActiveMenuOptions(nodes: MenuNode[]): TreeSelectOption[] {
    const result: TreeSelectOption[] = [];
    for (const n of nodes) {
        if (n.type === 'menu') {
            result.push({
                key: n.id,
                label: `📄 ${n.name}`,
                children: n.children ? buildActiveMenuOptions(n.children) : undefined,
            });
        } else if (n.type === 'directory' && n.children) {
            const children = buildActiveMenuOptions(n.children);
            if (children.length > 0) {
                result.push({
                    key: n.id,
                    label: `📁 ${n.name}`,
                    children,
                    disabled: true, // directory 不可选，仅作分组容器
                });
            }
        }
    }
    return result;
}

async function loadActiveMenuOptions() {
    try {
        // 优先使用缓存，避免重复请求
        const tree = menuTreeCache.value.length > 0 ? menuTreeCache.value : await getMenuTree();
        activeMenuOptions.value = buildActiveMenuOptions(tree);
    } catch {
        activeMenuOptions.value = [];
    }
}

// ============================================================
// 表单
// ============================================================
const formRef = ref<FormInst | null>(null);
const isSubmitting = ref(false);

const defaultForm = (): CreateMenuParams => ({
    parentId: props.parentId ?? null,
    name: '',
    type: (props.parentType === 'menu' ? 'button' : 'menu') as MenuTypeEnum,
    sort: 0,
    path: '',
    icon: '',
    routeName: '',
    component: '',
    permissionCode: '',
    keepAlive: true,
    visible: true,
    activeMenuId: undefined,
    enabled: true,
});

const form = reactive<CreateMenuParams>(defaultForm());

// 哪些字段应该显示
function showField(field: string): boolean {
    const type = form.type;
    switch (field) {
        case 'path':
        case 'icon':
            return type === 'directory' || type === 'menu';
        case 'routeName':
        case 'component':
        case 'keepAlive':
        case 'activeMenuId':
            return type === 'menu';
        case 'visible':
            return type === 'directory' || type === 'menu';
        case 'permissionCode':
            return type === 'menu' || type === 'button';
        default:
            return false;
    }
}

// 类型切换时清空隐藏字段并重新加载上级选项
watch(
    () => form.type,
    (newType) => {
        const fieldsToClear: Record<string, string[]> = {
            directory: ['routeName', 'component', 'permissionCode', 'keepAlive', 'activeMenuId'],
            menu: [],
            button: ['path', 'routeName', 'component', 'icon', 'keepAlive', 'visible', 'activeMenuId'],
        };
        for (const field of fieldsToClear[newType]) {
            (form as Record<string, unknown>)[field] = field === 'keepAlive' || field === 'visible' ? true : '';
        }
        // 类型变化后重新加载上级选项（directory 只能挂在 directory 下）
        loadParentOptions();
    },
);

/** 收集树中所有 routeName（用于唯一性校验） */
function collectAllRouteNames(nodes: MenuNode[], excludeId?: string): Set<string> {
    const names = new Set<string>();
    for (const n of nodes) {
        if (isPage(n) && n.id !== excludeId && n.routeName) {
            names.add(n.routeName);
        }
        if (n.children) {
            for (const childName of collectAllRouteNames(n.children, excludeId)) {
                names.add(childName);
            }
        }
    }
    return names;
}

// 自定义校验器：routeName 唯一性
const routeNameValidator = (_rule: unknown, value: string) => {
    if (!value) return Promise.resolve();
    const existingNames = collectAllRouteNames(
        menuTreeCache.value,
        isEdit.value && props.editData ? props.editData.id : undefined,
    );
    if (existingNames.has(value)) {
        return Promise.reject(new Error('路由标识已存在，请使用唯一值'));
    }
    return Promise.resolve();
};

// 字段中文名称映射（用于生成校验提示消息）
const fieldLabels: Record<string, string> = {
    name: '菜单名称',
    type: '菜单类型',
    path: '路由路径',
    routeName: '路由名称',
    component: '组件名称',
    icon: '图标标识',
    permissionCode: '权限标识',
    sort: '排序值',
};

// 从 Zod Schema 提取的静态校验规则（必填、长度限制、枚举值等）
const schemaRules = zodToFormRules(zodToRules(CreateAdminMenuSchema) as Record<string, FieldRuleSet>, { fieldLabels });

// 字段级规则弹窗规则（用于 FieldRulePopover 实时校验提示）
const namePopoverRules = zodToPopoverRules(zodToRules(CreateAdminMenuSchema.shape.name) as FieldRuleSet);
const typePopoverRules = zodToPopoverRules(zodToRules(CreateAdminMenuSchema.shape.type) as FieldRuleSet);
const pathPopoverRules = zodToPopoverRules(zodToRules(CreateAdminMenuSchema.shape.path) as FieldRuleSet);
const permissionCodePopoverRules = zodToPopoverRules(
    zodToRules(CreateAdminMenuSchema.shape.permissionCode) as FieldRuleSet,
);
const sortPopoverRules = zodToPopoverRules(zodToRules(CreateAdminMenuSchema.shape.sort) as FieldRuleSet);

// 动态校验规则：根据 type 合并 zod 静态规则 + 动态必填规则
const rules = computed<FormRules>(() => {
    // 把 schemaRules 深拷贝成 FormItemRule[][] 形式，避免 result.path / result.routeName
    // 等字段在类型上属于 FormRules | FormItemRule | FormItemRule[] 联合类型，
    // 后续 spread 时无法迭代，需要先收窄为 FormItemRule[]。
    const result: Record<string, FormItemRule[]> = {};
    for (const [key, value] of Object.entries(schemaRules)) {
        if (Array.isArray(value)) {
            result[key] = value;
        } else {
            result[key] = [value];
        }
    }

    // type 字段是 radio-group，需要 change 触发而非 blur
    result.type = [{ required: true, message: '请选择菜单类型', trigger: 'change' }];

    // directory / menu 类型：路由路径必填
    if (form.type === 'directory' || form.type === 'menu') {
        result.path = [...(result.path ?? []), { required: true, message: '请输入路由路径', trigger: 'blur' }];
    }
    // menu 类型：路由标识和组件路径必填
    if (form.type === 'menu') {
        result.routeName = [
            ...(result.routeName ?? []),
            { required: true, message: '请输入路由标识', trigger: 'blur' },
            { validator: routeNameValidator, trigger: 'blur' },
        ];
        result.component = [
            ...(result.component ?? []),
            { required: true, message: '请输入组件路径', trigger: 'blur' },
        ];
    }
    // button 类型：权限码必填
    if (form.type === 'button') {
        result.permissionCode = [
            ...(result.permissionCode ?? []),
            { required: true, message: '请输入权限码', trigger: 'blur' },
        ];
    }

    return result;
});

// ============================================================
// 提交
// ============================================================
async function onSubmit() {
    // 使用 computed 的动态规则直接校验
    try {
        await formRef.value?.validate();
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const data: CreateMenuParams = {
            parentId: form.parentId || null,
            name: form.name,
            type: form.type,
            sort: form.sort,
            enabled: form.enabled,
            path: form.path || undefined,
            icon: form.icon || undefined,
            visible: form.visible,
            routeName: form.routeName || undefined,
            component: form.component || undefined,
            keepAlive: form.keepAlive,
            activeMenuId: form.activeMenuId || undefined,
            permissionCode: form.permissionCode || undefined,
        };

        if (isEdit.value && props.editData) {
            await updateMenu(props.editData.id, data as UpdateMenuParams);
            message.success('菜单更新成功');
        } else {
            await createMenu(data);
            message.success('菜单创建成功');
        }

        emit('saved');
        emit('update:show', false);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '操作失败，请稍后重试';
        message.error(msg);
    } finally {
        isSubmitting.value = false;
    }
}

// ============================================================
// Watch：抽屉打开时初始化
// ============================================================
watch(
    () => props.show,
    (visible) => {
        if (visible) {
            loadParentOptions();
            loadActiveMenuOptions();
            if (props.editData) {
                // 编辑模式：回填数据（通过类型守卫安全访问字段）
                const d = props.editData;
                form.parentId = d.parentId ?? null;
                form.name = d.name;
                form.type = d.type;
                form.sort = d.sort;
                form.enabled = d.enabled;

                // 先重置所有类型专属字段为默认值，防止跨类型字段残留
                form.path = '';
                form.icon = '';
                form.visible = true;
                form.routeName = '';
                form.component = '';
                form.keepAlive = true;
                form.activeMenuId = undefined;
                form.permissionCode = '';

                // 再按类型回填对应字段
                if (isFolder(d)) {
                    form.path = d.path;
                    form.icon = d.icon ?? '';
                    form.visible = d.visible;
                } else if (isPage(d)) {
                    form.path = d.path;
                    form.icon = d.icon ?? '';
                    form.visible = d.visible;
                    form.routeName = d.routeName;
                    form.component = d.component;
                    form.keepAlive = d.keepAlive;
                    form.activeMenuId = d.activeMenuId ?? undefined;
                    form.permissionCode = d.permissionCode ?? '';
                } else if (isButton(d)) {
                    form.permissionCode = d.permissionCode;
                }
            } else {
                // 新增模式：重置
                Object.assign(form, defaultForm());
            }
        }
    },
);
</script>
