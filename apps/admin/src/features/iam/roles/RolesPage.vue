<!--
  角色管理页面 — 展示角色列表，支持新增、编辑、删除、权限分配、搜索
-->
<template>
    <n-card title="角色管理">
        <!-- 头部右侧：新增按钮 -->
        <template #header-extra>
            <n-button type="primary" @click="openForm()">
                <template #icon>
                    <n-icon><Plus /></n-icon>
                </template>
                新增角色
            </n-button>
        </template>

        <!-- 筛选区域 -->
        <n-form label-placement="left" label-align="right" label-width="5rem" class="my-(--gap)" :show-feedback="false">
            <SearchGrid :collapsed="isCollapsed">
                <n-gi>
                    <n-form-item label="状态">
                        <!--
                            数据库字段 enabled 的二选一筛选
                            - 'enabled'  → 正常（enabled=true）
                            - 'disabled' → 禁用（enabled=false）
                            - null（清空）→ 不过滤，全部
                            配合 clearable 让 null = 全部，避免冗余的 "全部" 选项
                        -->
                        <n-select
                            v-model:value="filters.enabled"
                            placeholder="全部"
                            clearable
                            :options="statusOptions"
                        />
                    </n-form-item>
                </n-gi>

                <n-gi>
                    <n-form-item label="关键词">
                        <n-input v-model:value="filters.keyword" placeholder="角色名或编码" clearable />
                    </n-form-item>
                </n-gi>

                <n-gi suffix #="{ overflow }">
                    <n-form-item label=" ">
                        <n-space align="center">
                            <n-button type="primary" @click="onSearch"> 查询 </n-button>
                            <n-button @click="onReset"> 重置 </n-button>
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

        <n-data-table
            :columns="columns"
            :data="filteredData"
            :bordered="false"
            :loading="isLoading"
            :row-key="(row: RoleRow) => row.id"
        />

        <!-- 新增/编辑角色弹窗
             auto-focus=false：防止弹窗打开时自动聚焦第一个输入框，
             避免 FieldRulePopover 在 modal 动画未完成时计算位置错误 -->
        <n-modal
            v-model:show="isFormModalVisible"
            preset="card"
            :title="isEdit ? '编辑角色' : '新增角色'"
            style="width: 480px"
            :mask-closable="false"
            :auto-focus="false"
        >
            <n-form ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="80">
                <!-- 角色编码：
                     - 新增模式：可编辑，必填，正则 /^[a-zA-Z][a-zA-Z0-9_]*$/、max(50)
                       （与后端 CreateAdminRoleSchema 严格对齐）
                     - 编辑模式：只读 disabled + 灰色 hint，因为后端 UpdateAdminRoleInput 不接受 code
                       （code 是 RBAC 系统的稳定锚点，修改会破坏 cache key / 审计 / 权限码索引）
                     - 放最上面：code 不可变是更基础的属性，提示用户先看 -->
                <n-form-item label="角色编码" path="code">
                    <FieldRulePopover :rules="codePopoverRules" :value="formData.code">
                        <n-input
                            v-model:value="formData.code"
                            :disabled="isEdit"
                            placeholder="请输入角色编码（字母开头，仅含字母数字下划线）"
                            clearable
                        />
                    </FieldRulePopover>
                    <template v-if="isEdit" #feedback>
                        <span class="text-xs text-gray-500">角色编码创建后不可修改</span>
                    </template>
                </n-form-item>
                <!-- 角色名称：必填，1-50 个字符（与后端 CreateAdminRoleSchema 对齐） -->
                <n-form-item label="角色名称" path="name">
                    <FieldRulePopover :rules="namePopoverRules" :value="formData.name">
                        <n-input v-model:value="formData.name" placeholder="请输入角色名称" clearable />
                    </FieldRulePopover>
                </n-form-item>
                <!-- 描述：选填，最多 255 个字符（与后端 CreateAdminRoleSchema 对齐） -->
                <n-form-item label="描述" path="description">
                    <FieldRulePopover :rules="descriptionPopoverRules" :value="formData.description">
                        <n-input v-model:value="formData.description" placeholder="请输入角色描述" clearable />
                    </FieldRulePopover>
                </n-form-item>
                <!-- 状态：开关切换（与后端 enabled: boolean 对齐，默认启用） -->
                <n-form-item label="状态" path="enabled">
                    <n-switch v-model:value="formData.enabled">
                        <template #checked>启用</template>
                        <template #unchecked>禁用</template>
                    </n-switch>
                </n-form-item>
            </n-form>

            <template #footer>
                <n-space justify="end">
                    <n-button @click="isFormModalVisible = false">取消</n-button>
                    <n-button type="primary" :loading="isSubmitting" @click="onSubmit">
                        {{ isEdit ? '保存修改' : '确认添加' }}
                    </n-button>
                </n-space>
            </template>
        </n-modal>

        <!-- 权限分配弹窗 -->
        <n-modal
            v-model:show="isPermModalVisible"
            preset="card"
            :title="`分配权限 - ${permRoleName}`"
            style="width: 560px"
            :mask-closable="false"
        >
            <div class="min-h-[300px] flex flex-col">
                <!-- 加载中占位 -->
                <div v-if="isPermLoading" class="flex-1 flex items-center justify-center">
                    <n-spin description="加载权限数据..." />
                </div>
                <!-- 权限树 -->
                <n-tree
                    v-else
                    :key="permModalKey"
                    v-model:checked-keys="permCheckedKeys"
                    :data="permTree"
                    checkable
                    default-expand-all
                    node-key="key"
                    label-field="label"
                    children-field="children"
                    class="flex-1 max-h-[55vh] overflow-auto"
                />
            </div>
            <template #footer>
                <n-space justify="end">
                    <n-button @click="isPermModalVisible = false">取消</n-button>
                    <n-button type="primary" :loading="isPermSaving" :disabled="isPermLoading" @click="onPermSave">
                        保存权限
                    </n-button>
                </n-space>
            </template>
        </n-modal>
    </n-card>
</template>

<script setup lang="ts">
// KeepAlive 通过组件名匹配缓存，必须和路由名 "IamRolesPage" 一致
defineOptions({ name: 'IamRolesPage' });
import { h, ref, reactive, computed, onMounted } from 'vue';
import {
    NButton,
    NTag,
    NSpace,
    NModal,
    NTree,
    NIcon,
    NForm,
    NFormItem,
    NInput,
    NSwitch,
    NSpin,
    type FormInst,
    type FormRules,
} from 'naive-ui';
import { useMessage } from '@/shared/composables/useMessage';
import { Plus, ChevronDown, ChevronUp } from '@vicons/tabler';
import { zodToRules, CreateAdminRoleSchema, type FieldRuleSet } from '@packages/shared';
import { zodToFormRules, zodToPopoverRules } from '@/shared/utils/zod-form-rules';
import FieldRulePopover from '@/shared/components/FieldRulePopover.vue';
import type { RuleItem } from '@/shared/components/FieldRulePopover.vue';
import SearchGrid from '@/shared/components/SearchGrid.vue';
import type { RoleRow } from '@/api';
import { getRoles, getMenuTree, getRoleById, saveRolePermissions, createRole, updateRole, deleteRole } from '@/api';
import type { MenuNode } from '@/features/iam/menus/types';

const message = useMessage().message;
const dialog = useMessage().dialog;

// ---- 工具：MenuNode → Tree 原生格式 ----
interface TreeNode {
    key: string;
    label: string;
    children?: TreeNode[];
}

/** 将 MenuNode[] 转为 Naive UI n-tree 原生 {key, label, children} 格式，去除多余字段 */
function toTreeData(nodes: MenuNode[]): TreeNode[] {
    return nodes.map((node) => ({
        key: node.id,
        label: node.name,
        children: node.children?.length ? toTreeData(node.children) : undefined,
    }));
}

// ---- 表格列定义 ----
const columns = [
    { title: '角色名', key: 'name' },
    { title: '角色编码', key: 'code' },
    { title: '描述', key: 'desc' },
    {
        // 用户数：后端 AdminRole.userCount 字段，统计持有该角色的活跃账户数
        title: '用户数',
        key: 'userCount',
    },
    {
        // 状态列：展示启用/禁用
        // - 禁用（enabled=false）→ 灰色「禁用」标签
        // - 正常（enabled=true）→ 绿色「正常」标签
        title: '状态',
        key: 'status',
        render: (row: RoleRow) => {
            if (row.status === '禁用') {
                return h(NTag, { type: 'default', size: 'small' }, () => '禁用');
            }
            return h(NTag, { type: 'success', size: 'small' }, () => '正常');
        },
    },
    {
        title: '操作',
        key: 'actions',
        render: (row: RoleRow) => {
            return h(NSpace, { size: 'small' }, () => [
                h(
                    NButton,
                    {
                        quaternary: true,
                        size: 'small',
                        type: 'primary',
                        onClick: () => openForm(row),
                    },
                    () => '编辑',
                ),
                h(
                    NButton,
                    {
                        quaternary: true,
                        size: 'small',
                        type: 'info',
                        onClick: () => openPermModal(row),
                    },
                    () => '权限',
                ),
                h(
                    NButton,
                    {
                        quaternary: true,
                        size: 'small',
                        type: 'error',
                        onClick: () => onDelete(row),
                    },
                    () => '删除',
                ),
            ]);
        },
    },
];

// ---- 角色数据 ----
const data = ref<RoleRow[]>([]);
const isLoading = ref(true);

// ---- 筛选 ----
const isCollapsed = ref(true);

const filters = reactive<{
    /** 搜索关键词：匹配角色名或角色编码 */
    keyword: string;
    /**
     * 启用状态筛选（与 AdminsPage 保持一致）
     * - null        → 不过滤（清空状态字段）
     * - 'enabled'   → 只查正常（enabled=true）
     * - 'disabled'  → 只查禁用（enabled=false）
     */
    enabled: 'enabled' | 'disabled' | null;
}>({
    keyword: '',
    enabled: null,
});

/**
 * 「状态」字段的静态选项（对应数据库 AdminRole.enabled）
 * - 'enabled'  → 正常（enabled=true）
 * - 'disabled' → 禁用（enabled=false）
 * - null（NSelect 清空）→ 全部，不传 enabled 参数
 * 不加 "全部" 选项，clearable 已天然覆盖「全部」语义，避免冗余
 */
const statusOptions = [
    { label: '正常', value: 'enabled' },
    { label: '禁用', value: 'disabled' },
];

/**
 * 前端筛选后的数据：只做关键词客户端过滤
 * - 状态（enabled）走后端参数，后端 SQL 过滤
 * - 关键词走前端 computed（避免每改一个字都打一次 API）
 * - 角色数据量小（< 100），一次拉全量，前端做关键词筛选
 */
const filteredData = computed(() => {
    let result = data.value;

    // 按关键词筛选
    const kw = filters.keyword.trim().toLowerCase();
    if (kw) {
        result = result.filter((row) => row.name.toLowerCase().includes(kw) || row.code.toLowerCase().includes(kw));
    }

    return result;
});

/** 查询按钮：触发重新加载 */
function onSearch() {
    void loadData();
}

/** 重置按钮：清空所有筛选条件并重新请求 */
function onReset() {
    filters.keyword = '';
    filters.enabled = null;
    void loadData();
}

/**
 * 加载角色列表
 * - filters.enabled 走 enabled 参数传给后端
 */
async function loadData() {
    isLoading.value = true;
    try {
        const enabledParam = filters.enabled === 'enabled' ? true : filters.enabled === 'disabled' ? false : undefined;
        const all = await getRoles(enabledParam);
        data.value = all;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '加载角色列表失败');
    } finally {
        isLoading.value = false;
    }
}

/** filters / showDeleted 变化不再自动请求，需用户点击「查询」才触发 */

onMounted(async () => {
    await loadData();
});

// ---- 新增/编辑角色弹窗 ----
const isFormModalVisible = ref(false);
const isEdit = ref(false);
const editingId = ref<string | null>(null);
const isSubmitting = ref(false);
const formRef = ref<FormInst | null>(null);

const formData = reactive({
    /** 角色编码：新增必填（受后端 Zod CreateAdminRoleSchema 约束），编辑只读不可改 */
    code: '',
    /** 角色名称：必填，1-50 个字符 */
    name: '',
    /** 描述：选填，最多 255 个字符（与后端 CreateAdminRoleSchema.description 对齐） */
    description: '',
    /** 启用状态：默认 true（与后端 CreateAdminRoleSchema.enabled 对齐） */
    enabled: true,
});

/**
 * 表单校验规则 — 由 CreateAdminRoleSchema 驱动，自动提取 required / min / max / pattern 等约束
 * - fieldLabels 提供字段中文名称，用于生成"请输入角色名称"之类的提示消息
 * - enabled 字段为 boolean 开关，无需校验规则
 * - zodToRules 对 ZodObject 返回 Record<string, FieldRuleSet>，但函数签名是联合类型，
 *   这里断言为 Record<string, FieldRuleSet>（实际运行时就是 Map 形式）
 */
const formRules: FormRules = zodToFormRules(zodToRules(CreateAdminRoleSchema) as Record<string, FieldRuleSet>, {
    fieldLabels: { name: '角色名称', code: '角色编码', description: '描述' },
});

/**
 * 各字段的 FieldRulePopover 规则 — focus 时弹出规则清单，实时显示满足状态
 * - 从 CreateAdminRoleSchema.shape 提取单字段规则，转换为 RuleItem[] 格式
 * - zodToRules 对单字段 schema 返回 FieldRuleSet，需 as 断言（函数签名是联合类型）
 */
const codePopoverRules: RuleItem[] = zodToPopoverRules(zodToRules(CreateAdminRoleSchema.shape.code) as FieldRuleSet);
const namePopoverRules: RuleItem[] = zodToPopoverRules(zodToRules(CreateAdminRoleSchema.shape.name) as FieldRuleSet);
const descriptionPopoverRules: RuleItem[] = zodToPopoverRules(
    zodToRules(CreateAdminRoleSchema.shape.description) as FieldRuleSet,
);

/** 打开新增/编辑弹窗（不传 row 为新增，传 row 为编辑） */
function openForm(row?: RoleRow) {
    if (row) {
        isEdit.value = true;
        editingId.value = row.id;
        // code 回填：编辑时 formData.code 必须等于后端值（disabled input 用）
        formData.code = row.code;
        formData.name = row.name;
        // RoleRow.desc → formData.description（字段名对齐后端 schema）
        formData.description = row.desc;
        // RoleRow.status → formData.enabled（"启用"→true，"禁用"→false）
        formData.enabled = row.status === '启用';
    } else {
        isEdit.value = false;
        editingId.value = null;
        formData.code = '';
        formData.name = '';
        formData.description = '';
        formData.enabled = true;
    }
    isFormModalVisible.value = true;
}

/** 提交表单（新增或编辑） */
async function onSubmit() {
    try {
        await formRef.value?.validate();
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        if (isEdit.value && editingId.value) {
            // 编辑：只传后端 Update 接受的字段
            // - 不传 code（后端 UpdateAdminAccountInput 不接受 code，code 不可变）
            // - 后端 partial 语义：未传的字段不更新
            // - formData.description → API desc，formData.enabled → API status
            await updateRole(editingId.value, {
                name: formData.name,
                desc: formData.description,
                status: formData.enabled ? '启用' : '禁用',
            });
            message.success('角色更新成功');
        } else {
            // 新增：传后端 Create 接受的字段
            // - code 是后端 CreateAdminRoleInput 必填，前端必须由用户输入有意义字符串
            //   （如 `super_admin` / `ops` / `cs`），不再用 `role_<timestamp>` 凑数
            // - formData.description → API desc，formData.enabled → API status
            await createRole({
                code: formData.code,
                name: formData.name,
                desc: formData.description,
                status: formData.enabled ? '启用' : '禁用',
            });
            message.success('角色添加成功');
        }
        isFormModalVisible.value = false;
        await loadData();
    } catch (e) {
        message.error(String(e));
    } finally {
        isSubmitting.value = false;
    }
}

/**
 * 删除角色（二次确认 + 删除操作）
 * 关键点：Naive UI 的 dialog.warning() 返回的是 DialogReactive 对象（不是 Promise），
 *  不能用 await 取用户选择结果 —— 那会让「确认」直接走完，丢失二次确认机会。
 * 正确做法：把删除逻辑放进 onPositiveClick 回调里，用户点「确认删除」才真正触发。
 * 参考 AdminsPage.vue / MenusPage.vue 的同款实现。
 */
function onDelete(row: RoleRow) {
    dialog.warning({
        title: '确认删除',
        content: `确定要删除角色「${row.name}」吗？此操作不可撤销。`,
        positiveText: '确认删除',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                await deleteRole(row.id);
                message.success('角色已删除');
                await loadData();
            } catch (e) {
                message.error(String(e));
            }
        },
    });
}

// ---- 权限分配弹窗 ----
const isPermModalVisible = ref(false);
const permModalKey = ref(0);
const permRoleName = ref('');
const permRoleId = ref('');
const permTree = ref<TreeNode[]>([]);
const permCheckedKeys = ref<string[]>([]);
const isPermLoading = ref(false);
const isPermSaving = ref(false);

/** 打开权限分配弹窗（先开弹窗再加载数据，避免白等） */
async function openPermModal(row: RoleRow) {
    // 防止重复打开
    if (isPermLoading.value) return;

    permRoleId.value = row.id;
    permRoleName.value = row.name;
    permTree.value = [];
    permCheckedKeys.value = [];
    isPermLoading.value = true;
    permModalKey.value++;
    isPermModalVisible.value = true;

    try {
        const [tree, detail] = await Promise.all([getMenuTree(), getRoleById(row.id)]);
        permTree.value = toTreeData(tree);
        permCheckedKeys.value = detail.menuIds;
    } catch {
        const tree = await getMenuTree();
        permTree.value = toTreeData(tree);
        permCheckedKeys.value = [];
    } finally {
        isPermLoading.value = false;
    }
}

/** 保存权限 */
async function onPermSave() {
    isPermSaving.value = true;
    try {
        await saveRolePermissions(permRoleId.value, permCheckedKeys.value);
        message.success('权限保存成功');
        isPermModalVisible.value = false;
    } catch (e) {
        // Mock 环境兜底：部分权限接口可能返回 Mock 占位错误，
        // 在真实后端接入后应移除此分支，统一走 `message.error`
        if (String(e).includes('Mock:') || String(e).includes('暂未实现')) {
            message.info('（Mock）权限已模拟保存');
            isPermModalVisible.value = false;
        } else {
            message.error(String(e));
        }
    } finally {
        isPermSaving.value = false;
    }
}
</script>
