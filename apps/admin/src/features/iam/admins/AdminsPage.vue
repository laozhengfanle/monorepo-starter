<!--
  管理员管理页面 — 支持新增、编辑、删除、搜索、服务端分页、特例授权
-->
<template>
    <div>
        <n-card title="管理员管理">
            <!-- 头部右侧：添加按钮（无 admin:create 权限则隐藏） -->
            <template #header-extra>
                <n-button v-if="canCreate" type="primary" @click="openForm()">
                    <template #icon>
                        <n-icon><Plus /></n-icon>
                    </template>
                    添加管理员
                </n-button>
            </template>

            <!-- 筛选区域 -->
            <n-form
                label-placement="left"
                label-align="right"
                label-width="5rem"
                class="my-(--gap)"
                :show-feedback="false"
            >
                <SearchGrid :collapsed="isCollapsed">
                    <n-gi>
                        <n-form-item label="用户名">
                            <n-input v-model:value="filters.username" placeholder="请输入用户名" clearable />
                        </n-form-item>
                    </n-gi>
                    <n-gi>
                        <n-form-item label="邮箱">
                            <n-input v-model:value="filters.email" placeholder="请输入邮箱" clearable />
                        </n-form-item>
                    </n-gi>
                    <n-gi>
                        <n-form-item label="角色">
                            <n-select
                                v-model:value="filters.roleId"
                                placeholder="全部"
                                clearable
                                :options="roleOptions"
                            />
                        </n-form-item>
                    </n-gi>
                    <n-gi v-if="canViewTrash">
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

                    <n-gi v-if="canViewTrash">
                        <n-form-item label="软删除">
                            <!-- 勾选后把 includeDeleted=true 传给 getAccounts，分页器仍存在 -->
                            <n-checkbox v-model:checked="showDeleted">显示已删除</n-checkbox>
                        </n-form-item>
                    </n-gi>

                    <n-gi suffix #="{ overflow }">
                        <n-form-item>
                            <template #label>
                                <span class="sr-only">操作</span>
                            </template>

                            <n-space align="center">
                                <n-button @click="onSearch"> 查询 </n-button>
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

            <!-- 数据表格（服务端分页 + remote 模式）
                 现在软删除视图也走分页接口（includeDeleted=true），分页器始终存在 -->
            <n-data-table
                :columns="columns"
                :data="data"
                :bordered="false"
                :striped="false"
                :loading="isLoading"
                :pagination="pagination"
                :row-key="(row: AccountRow) => row.id"
                :remote="true"
            />
        </n-card>

        <!-- 新增/编辑管理员弹窗
             字段对齐后端 AdminAccount 模型：
             - 新增：username / nickname(必填) / phone / email / avatar / roleIds
             - 编辑：nickname / phone / email / avatar / enabled / roleIds（username 不可改）
             密码由后端 Create 时生成随机密码（mustChangePassword=true 强提示用户改），
             不在表单中收集，避免和后端策略冲突

             头像：走 /api/admin/uploads/avatar 上传到服务端，再把返回的 URL 存到 adminProfile.avatar
             - NUpload 自定义 action 改写：用 beforeUpload + customRequest 拦截，转发到 uploadAvatar()
             - 上传成功 → 把后端返回的 url 写入 formData.avatar（提交时随 GraphQL 一起落库）
             - "清空" 按钮：显式回写 formData.avatar = ''（与后端 Update partial 语义区分） -->
        <n-modal
            v-model:show="isFormModalVisible"
            preset="card"
            :title="isEdit ? '编辑管理员' : '添加管理员'"
            style="width: 560px"
            :mask-closable="false"
            :auto-focus="false"
        >
            <n-form ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="80">
                <!-- 头像：上传组件 + 实时预览 + 清空按钮
                     预览逻辑：
                     - 有 URL：显示图片，加载失败回退到 /hero.png（项目 logo）
                     - 无 URL：显示 User icon 占位（与列表保持视觉一致）
                     上传约束（与后端 upload.controller.ts 对齐）：
                     - MIME 仅 jpeg/png/webp
                     - 大小 ≤ 2MB
                     - 走 x-csrf-token + Cookie 鉴权（已封装在 uploadAvatar()） -->
                <n-form-item label="头像" path="avatar" feedback="支持 jpg/png/webp，≤ 2MB">
                    <div class="flex items-center gap-3">
                        <div>
                            <n-avatar :size="56" :src="formData.avatar || undefined" fallback-src="/hero.png" round>
                                <template v-if="!formData.avatar" #default>
                                    <n-icon size="32"><User /></n-icon>
                                </template>
                            </n-avatar>
                        </div>
                        <n-upload
                            :show-file-list="false"
                            :custom-request="handleAvatarUpload"
                            accept="image/jpeg,image/png,image/webp"
                            :disabled="isUploadingAvatar"
                        >
                            <n-button :loading="isUploadingAvatar" size="small">
                                {{ formData.avatar ? '更换头像' : '上传头像' }}
                            </n-button>
                        </n-upload>
                        <n-button
                            v-if="formData.avatar"
                            size="small"
                            quaternary
                            type="error"
                            @click="formData.avatar = ''"
                        >
                            清空
                        </n-button>
                    </div>
                </n-form-item>

                <!-- 用户名：仅新增可填，编辑时禁用（后端 Update 不接受 username） -->
                <n-form-item v-if="!isEdit" label="用户名" path="username">
                    <FieldRulePopover :rules="usernameRules" :value="formData.username">
                        <n-input v-model:value="formData.username" placeholder="请输入登录用户名" clearable />
                    </FieldRulePopover>
                </n-form-item>
                <n-form-item v-else label="用户名">
                    <FieldRulePopover
                        :rules="[{ label: '创建后不可修改', check: () => true }]"
                        :value="formData.username"
                    >
                        <n-input :value="formData.username" disabled placeholder="登录用户名不可修改" />
                    </FieldRulePopover>
                </n-form-item>

                <!-- 昵称：必填（后端 AdminProfile.nickname 必填） -->
                <n-form-item label="昵称" path="nickname">
                    <FieldRulePopover :rules="nicknameRules" :value="formData.nickname">
                        <n-input v-model:value="formData.nickname" placeholder="请输入昵称" clearable />
                    </FieldRulePopover>
                </n-form-item>

                <!-- 手机号：选填（后端 AdminProfile.phone 选填） -->
                <n-form-item label="手机号" path="phone">
                    <FieldRulePopover :rules="phoneRules" :value="formData.phone || ''">
                        <n-input v-model:value="formData.phone" placeholder="请输入手机号" clearable />
                    </FieldRulePopover>
                </n-form-item>

                <!-- 邮箱：选填（后端 AdminProfile.email 选填） -->
                <n-form-item label="邮箱" path="email">
                    <FieldRulePopover :rules="emailRules" :value="formData.email || ''">
                        <n-input v-model:value="formData.email" placeholder="请输入邮箱" clearable />
                    </FieldRulePopover>
                </n-form-item>

                <!-- 角色：必填（多选，roleIds[] 传给后端） -->
                <n-form-item label="角色" path="roleIds">
                    <FieldRulePopover :rules="roleIdsRules" :value="formData.roleIds">
                        <n-select
                            v-model:value="formData.roleIds"
                            multiple
                            placeholder="请选择角色"
                            :options="roleOptions"
                        />
                    </FieldRulePopover>
                </n-form-item>

                <!--
                    状态：仅编辑时显示（后端 Create 不接受 enabled，默认新建启用）
                    编辑模式下 状态 与 密码 在同一行视觉对齐，节省垂直空间
                -->
                <n-form-item v-if="isEdit" label="状态" path="enabled">
                    <n-switch v-model:value="formData.enabled">
                        <template #checked>启用</template>
                        <template #unchecked>禁用</template>
                    </n-switch>
                </n-form-item>

                <!--
                    密码字段：新增/编辑共用同一个输入框
                    - 新增模式（!isEdit）：必填，placeholder 提示"必填"
                    - 编辑模式（isEdit）：可选，placeholder 提示"留空则不修改"
                    - 视觉处理：
                      * 左侧 lock 图标（用 @vicons/ionicons5 的 LockClosed）让用户立刻知道这是密码
                      * 右侧"生成"按钮：点击自动填一个 10 位随机强密码
                      * show-password-on="click"：眼睛图标点按查看明文（替代确认密码）
                    - 不再使用 n-divider 分组，单一字段直接放在"状态"下面，整体更简洁
                -->
                <n-form-item label="密码" path="password">
                    <FieldRulePopover :rules="passwordRules" :value="formData.password || ''">
                        <n-input
                            v-model:value="formData.password"
                            type="password"
                            show-password-on="click"
                            :placeholder="isEdit ? '留空则不修改原密码' : passwordPlaceholder"
                            :input-props="{ autocomplete: 'new-password' }"
                            clearable
                        >
                            <template #suffix>
                                <n-button text type="primary" size="tiny" class="px-1!" @click="onGeneratePassword">
                                    <template #icon>
                                        <n-icon :component="Refresh" :size="14" />
                                    </template>
                                    生成
                                </n-button>
                            </template>
                        </n-input>
                    </FieldRulePopover>
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

        <!-- 账号特例授权弹窗（Account 维度 grant/deny 覆写） -->
        <AccountPermissionModal
            v-model:show="isAccountPermModalVisible"
            :account-id="permAccount?.id ?? ''"
            :account-name="permAccount?.username ?? ''"
            :role-menu-ids="permRoleMenuIds"
        />

        <!--
            创建成功后的密码展示弹窗
            - 必须是独立弹窗，不能用 message 提示（message 几秒就消失，admin 还没复制就消失了）
            - 包含：账号名 + 密码 + 复制按钮 + 强提示 + 确认按钮
            - 关闭后立即清空 createdAccount，避免内存中残留明文
        -->
        <n-modal
            v-model:show="isCreatedPwdModalVisible"
            preset="card"
            title="管理员创建成功"
            style="max-width: 480px"
            :mask-closable="false"
            :close-on-esc="false"
            :auto-focus="false"
            @update:show="(v: boolean) => !v && closeCreatedPwdModal()"
        >
            <n-alert type="info" :show-icon="true" :closable="false" class="mb-4">
                请将以下初始密码告知该用户。密码只显示一次，关闭此弹窗后将无法再次查看。
            </n-alert>

            <div class="space-y-3">
                <div>
                    <div class="text-xs text-gray-500 mb-1">账号</div>
                    <div class="text-sm font-mono">{{ createdAccount?.username }}</div>
                </div>
                <div>
                    <div class="text-xs text-gray-500 mb-1">初始密码</div>
                    <n-input :value="createdAccount?.password ?? ''" readonly type="text" class="font-mono">
                        <template #suffix>
                            <n-button text type="primary" size="tiny" @click="copyCreatedPassword">
                                <template #icon>
                                    <n-icon :component="Copy" :size="14" />
                                </template>
                                复制账号密码
                            </n-button>
                        </template>
                    </n-input>
                </div>
            </div>

            <n-alert type="warning" :show-icon="true" :closable="false" class="mt-4">
                出于安全考虑，建议用户首次登录后立即修改密码。
            </n-alert>

            <template #footer>
                <n-space justify="end">
                    <n-button type="primary" @click="closeCreatedPwdModal()"> 我已记录 </n-button>
                </n-space>
            </template>
        </n-modal>
    </div>
</template>

<script setup lang="ts">
// KeepAlive 通过组件名匹配缓存，必须和路由名 "IamAdminsPage" 一致
defineOptions({ name: 'IamAdminsPage' });
import { computed, h, reactive, ref, onMounted } from 'vue';
import {
    NButton,
    NAvatar,
    NIcon,
    NSpace,
    NTooltip,
    NUpload,
    NTag,
    type FormInst,
    type FormRules,
    type UploadCustomRequestOptions,
} from 'naive-ui';
import { useMessage } from '@/shared/composables/useMessage';
import { Plus, ChevronDown, ChevronUp, User } from '@vicons/tabler';
import { Refresh, Copy } from '@vicons/tabler';
import {
    type AccountRow,
    type RoleRow,
    type RoleDetail,
    getAccounts,
    createAdmin,
    updateAdmin,
    deleteAdmin,
    hardDeleteAccount,
    restoreAccount,
    resetAdminPassword,
    getRoles,
    getRoleById,
    uploadAvatar,
} from '@/api';
import { usePermissionStore } from '@/shared/stores/permission';
import { useConfigStore } from '@/shared/stores/config';
import FieldRulePopover from '@/shared/components/FieldRulePopover.vue';
import type { RuleItem } from '@/shared/components/FieldRulePopover.vue';
import SearchGrid from '@/shared/components/SearchGrid.vue';
import AccountPermissionModal from './AccountPermissionModal.vue';
// Zod 驱动的表单校验工具：从 shared 包提取规则元数据，再转为 Naive UI / FieldRulePopover 格式
import { zodToRules } from '@packages/shared';
import type { FieldRuleSet } from '@packages/shared';
import { CreateAdminAccountSchema } from '@packages/shared';
import { zodToFormRules, zodToPopoverRules } from '@/shared/utils/zod-form-rules';

const message = useMessage().message;
const dialog = useMessage().dialog;
const permissionStore = usePermissionStore();
const configStore = useConfigStore();

/**
 * 简单日期格式化函数（项目里没装 dayjs，避免新增依赖）
 * - 入参：Date | ISO 字符串 | undefined | null
 * - 出参：YYYY-MM-DD HH:mm 格式字符串；非法输入返回 "-"
 * - 仅用于「已删除」标签后缀的展示，不需要时区/语言切换
 */
function formatDeletedAt(value: string | null | undefined): string {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 按钮级权限判断：用于控制头部「添加管理员」按钮和表格操作列的可见性 */
// 权限码命名空间：管理员模块的权限码是 iam:admin:*（与 iam:role:* / iam:menu:* 一致），
// 这里必须和后端权限码严格对齐，否则按钮会被 v-if 永久隐藏。
const canCreate = computed(() => permissionStore.hasAnyPermission(['iam:admin:create']));
const canEdit = computed(() => permissionStore.hasAnyPermission(['iam:admin:update']));
const canDelete = computed(() => permissionStore.hasAnyPermission(['iam:admin:delete']));
/** 全局回收站权限（三个独立维度，对应后端 seed 的 global:trash:* 权限码） */
// 列表权限：控制能否看到「软删除」筛选 + 进入软删视图（看到已删除行 + 「已删除」红 tag）
const canViewTrash = computed(() => permissionStore.hasAnyPermission(['global:trash:view']));
// 恢复权限：控制能否对已删除账户点「恢复正常」（操作列按钮）
const canRestoreTrash = computed(() => permissionStore.hasAnyPermission(['global:trash:restore']));
// 硬删权限：控制能否对已删除账户点「彻底删除」（操作列按钮，不可逆）
const canHardDeleteTrash = computed(() => permissionStore.hasAnyPermission(['global:trash:hard_delete']));
/**
 * 改密权限：与 canEdit 绑定（合并权限码）
 * 设计：
 * - 之前把"重置密码"独立成一个独立权限码 iam:admin:reset_password 是为了给独立按钮用
 * - 现在改密字段在编辑弹窗里，admin 进编辑弹窗的权限就是 iam:admin:update
 * - 改密是编辑的子操作，没必要把"看编辑弹窗"和"改密"切成两个权限
 * - 后端 resetPassword mutation 仍然存在（API 仍是同一接口），只是前端不再独立判断
 */

// ---- 角色选项（来自角色 API） ----
const roleList = ref<RoleRow[]>([]);
const roleOptions = computed(() =>
    roleList.value.filter((r) => r.status === '启用').map((r) => ({ label: r.name, value: r.id })),
);

// ---- 管理员数据（服务端分页） ----
const data = ref<AccountRow[]>([]);
const isLoading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

/**
 * 「状态」字段的静态选项（对应数据库 Account.enabled）
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
 * 「软删除」checkbox 的开关状态
 * - false（默认）→ getAccounts({ includeDeleted: undefined })，后端默认仅看活跃
 * - true         → getAccounts({ includeDeleted: true })，含已软删
 *
 * 勾选/取消勾选不会发请求（由用户点「查询」触发），也不会改变分页器状态。
 * 表格始终走分页接口 + remote 模式，分页器一直显示。
 */
const showDeleted = ref(false);

/**
 * 从服务端加载管理员列表（带分页和筛选）
 * 每次翻页、筛选变更、增删改后都会调用
 *
 * 设计：统一走分页接口 + includeDeleted
 * - showDeleted=false → includeDeleted=undefined（后端默认仅看活跃）
 * - showDeleted=true  → includeDeleted=true（含已软删）
 * 这样分页器一直存在，避免「勾选软删除 → 分页器消失」的副作用。
 *
 * enabled 字段映射：
 * - filters.enabled=null        → 不传 enabled 参数（后端不过滤）
 * - filters.enabled='enabled'   → enabled: true
 * - filters.enabled='disabled'  → enabled: false
 */
async function loadData() {
    isLoading.value = true;
    try {
        const enabledParam = filters.enabled === 'enabled' ? true : filters.enabled === 'disabled' ? false : undefined;
        // 统一走分页接口：软删视图只是 includeDeleted=true，分页器不会消失
        const res = await getAccounts({
            page: page.value,
            pageSize: pageSize.value,
            username: filters.username || undefined,
            email: filters.email || undefined,
            roleId: filters.roleId || undefined,
            enabled: enabledParam,
            includeDeleted: showDeleted.value || undefined,
        });
        data.value = res.data;
        total.value = res.total;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '加载管理员列表失败');
    } finally {
        isLoading.value = false;
    }
}

/** 加载角色列表（角色数据量小，一次取完） */
async function loadRoles() {
    try {
        // 后端 adminRoles() 不分页，直接拿全量
        const rolesList = await getRoles();
        roleList.value = rolesList;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.warning(msg || '加载角色列表失败，角色筛选将不可用');
    }
}

/** showDeleted / filters 变化不再自动请求，需用户点击「查询」才触发 */

onMounted(async () => {
    try {
        await Promise.all([loadData(), loadRoles()]);
    } catch {
        // loadData 和 loadRoles 内已各自处理错误
    }
});

// ---- 筛选 ----
const isCollapsed = ref(true);

const filters = reactive<{
    username: string;
    email: string;
    roleId: string | null;
    /**
     * 启用状态筛选
     * - null        → 不过滤（清空状态字段）
     * - 'enabled'   → 只查正常
     * - 'disabled'  → 只查禁用
     */
    enabled: 'enabled' | 'disabled' | null;
}>({
    username: '',
    email: '',
    roleId: null,
    enabled: null,
});

/** 查询按钮：重置到第 1 页并请求 */
function onSearch() {
    page.value = 1;
    loadData();
}

/** 重置按钮：清空所有筛选条件（含状态、软删除）并重新请求 */
function onReset() {
    filters.username = '';
    filters.email = '';
    filters.roleId = null;
    filters.enabled = null;
    showDeleted.value = false;
    page.value = 1;
    loadData();
}

// ---- 分页配置（remote 模式） ----
const pagination = computed(() => ({
    page: page.value,
    pageSize: pageSize.value,
    itemCount: total.value,
    showSizePicker: true,
    pageSizes: [10, 20, 50, 100],
    prefix: ({ itemCount }: { itemCount: number }) => `共 ${itemCount} 条`,
    onChange: (p: number) => {
        page.value = p;
        loadData();
    },
    onUpdatePageSize: (ps: number) => {
        pageSize.value = ps;
        page.value = 1;
        loadData();
    },
}));

// ---- 表格列定义 ----
const columns = [
    {
        title: '头像',
        key: 'avatar',
        render: (row: AccountRow) => {
            // 有头像 URL：渲染真实图片，加载失败时降级到 fallbackSrc（项目 logo）
            if (row.avatar) {
                return h(NAvatar, {
                    src: row.avatar,
                    size: 48,
                    lazy: true,
                    fallbackSrc: '/hero.png',
                });
            }
            // 无头像：NAvatar 内部用 default slot 渲染"用户"通用 icon 作为默认头像
            // （fallbackSrc 在 src 为空字符串时不会触发，必须用 slot 显式提供占位）
            return h(
                NAvatar,
                { size: 48, color: '#e0e8f0', style: 'color: #909399' },
                {
                    default: () => h(NIcon, { size: 24 }, { default: () => h(User) }),
                },
            );
        },
    },
    { title: '用户名', key: 'username' },
    { title: '昵称', key: 'nickname' },
    { title: '邮箱', key: 'email' },
    { title: '手机号', key: 'phone' },
    {
        // 角色列：通过 roleList 将角色编码映射为角色名称展示
        // 后端 roles 字段返回的是角色编码（如 'super_admin'），需要转成用户可读的名称
        title: '角色',
        key: 'role',
        render: (row: AccountRow) => {
            if (!row.roles?.length) return '—';
            // 用 roleList 建立 code→name 映射
            const codeToName = new Map(roleList.value.map((r) => [r.code, r.name]));
            return row.roles.map((code) => codeToName.get(code) ?? code).join(', ');
        },
    },
    {
        // 状态列：综合展示启用/禁用/已删除状态
        // - 已删除（deletedAt 非空）→ 红色「已删除」标签
        // - 禁用（enabled=false）→ 灰色「禁用」标签
        // - 正常（enabled=true && 未删除）→ 绿色「正常」标签
        title: '状态',
        key: 'status',
        render: (row: AccountRow) => {
            if (row.deletedAt) {
                return h(NSpace, { size: 'small', align: 'center' }, () => [
                    h(NTag, { type: 'error', size: 'small' }, () => '已删除'),
                    h('span', { class: 'text-xs text-gray-500' }, formatDeletedAt(row.deletedAt)),
                ]);
            }
            if (!row.enabled) {
                return h(NTag, { type: 'default', size: 'small' }, () => '禁用');
            }
            return h(NTag, { type: 'success', size: 'small' }, () => '正常');
        },
    },
    { title: '创建时间', key: 'createAt' },
    {
        title: '操作',
        key: 'actions',
        render: (row: AccountRow) => {
            // 软删除按钮：仅「未删除」时显示（避免和「彻底删除」两个删除按钮同时出现导致视觉混乱）
            // 「恢复正常」「彻底删除」按钮：仅「已删除」时显示
            const isDeleted = Boolean(row.deletedAt);

            return h(NSpace, { size: 'small' }, () => [
                // 编辑：仅正常记录可操作（已删除记录先恢复再改）
                !isDeleted && canEdit.value
                    ? h(
                          NButton,
                          {
                              quaternary: true,
                              size: 'small',
                              type: 'primary',
                              onClick: () => openForm(row),
                          },
                          { default: () => '编辑' },
                      )
                    : null,
                // 软删除按钮：仅未删除记录 + 有 iam:admin:delete 权限
                !isDeleted && canDelete.value
                    ? h(
                          NButton,
                          {
                              quaternary: true,
                              size: 'small',
                              type: 'error',
                              onClick: () => onDelete(row),
                          },
                          { default: () => '删除' },
                      )
                    : null,
                // 特例授权：仅未删除记录可操作
                !isDeleted
                    ? h(
                          NTooltip,
                          { trigger: 'hover' },
                          {
                              trigger: () =>
                                  h(
                                      NButton,
                                      {
                                          quaternary: true,
                                          size: 'small',
                                          type: 'warning',
                                          onClick: () => openAccountPerm(row),
                                      },
                                      { default: () => '特例授权' },
                                  ),
                              default: () => '特例授权（Account 维度 grant/deny 覆写）',
                          },
                      )
                    : null,
                // 恢复正常按钮：仅已删除记录 + 有 global:trash:restore 权限
                isDeleted && canRestoreTrash.value
                    ? h(
                          NButton,
                          {
                              quaternary: true,
                              size: 'small',
                              type: 'warning',
                              onClick: () => onRestore(row),
                          },
                          { default: () => '恢复正常' },
                      )
                    : null,
                // 彻底删除按钮：仅已删除记录 + 有 global:trash:hard_delete 权限
                isDeleted && canHardDeleteTrash.value
                    ? h(
                          NButton,
                          {
                              quaternary: true,
                              size: 'small',
                              type: 'error',
                              onClick: () => onHardDelete(row),
                          },
                          { default: () => '彻底删除' },
                      )
                    : null,
            ]);
        },
    },
];

// ---- 新增/编辑弹窗 ----
const isFormModalVisible = ref(false);
const isEdit = ref(false);
const editingId = ref<string | null>(null);
const isSubmitting = ref(false);
const formRef = ref<FormInst | null>(null);
/** 头像上传独立 loading（避免阻塞整张表单的提交按钮） */
const isUploadingAvatar = ref(false);

/**
 * 密码输入框 placeholder：根据当前安全策略动态生成提示
 * - 告诉用户当前密码要求，而不是硬编码 "8 位 + 字母 + 数字"
 */
const passwordPlaceholder = computed(() => {
    const { passwordMinLength, passwordComplexity } = configStore.securityConfig;
    const lengthHint = `至少 ${passwordMinLength} 位`;
    if (passwordComplexity === 'low') return lengthHint;
    if (passwordComplexity === 'medium') return `${lengthHint}，必须包含字母和数字`;
    return `${lengthHint}，必须包含大小写字母、数字和特殊字符`;
});

/**
 * 从 Zod schema 提取所有字段的规则集（单例，避免重复计算）
 * 数据流：CreateAdminAccountSchema → zodToRules → FieldRuleSet → zodToPopoverRules / zodToFormRules
 */
const schemaFieldRules = zodToRules(CreateAdminAccountSchema) as Record<string, FieldRuleSet>;

/**
 * 用户名字段的规则清单（供 FieldRulePopover 使用）
 * - 从 Zod schema 自动提取：必填 + min(3) + max(50)
 * - 额外追加"创建后不可修改"提示（不属于 Zod 校验，是前端 UX 提示）
 */
const usernameRules = computed<RuleItem[]>(() => [
    ...zodToPopoverRules(schemaFieldRules.username),
    { label: '创建后不可修改', check: () => true },
]);

/**
 * 昵称字段的规则清单
 * - 从 Zod schema 自动提取：必填 + min(1) + max(50)
 */
const nicknameRules = computed<RuleItem[]>(() => zodToPopoverRules(schemaFieldRules.nickname));

/**
 * 手机号字段的规则清单
 * - 从 Zod schema 自动提取：pattern(/^1[3-9]\d{9}$/)
 * - zodToPopoverRules 的 pattern 规则已处理"选填时空值通过"逻辑
 */
const phoneRules = computed<RuleItem[]>(() => zodToPopoverRules(schemaFieldRules.phone));

/**
 * 邮箱字段的规则清单
 * - Zod 的 .email() 是内置校验，zodToRules 不提取 pattern，需要手动补充邮箱格式规则
 */
const emailRules = computed<RuleItem[]>(() => [
    ...zodToPopoverRules(schemaFieldRules.email),
    {
        label: '正确的邮箱格式',
        check: (v) => {
            const s = v as string;
            return !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
        },
    },
]);

/**
 * 角色字段的规则清单
 * - Zod schema 标记为 optional，但业务上新增管理员时至少需要一个角色
 * - 保持自定义规则，不使用 schema 生成的规则
 */
const roleIdsRules = computed<RuleItem[]>(() => [
    { label: '至少选择一个角色', check: (v) => Array.isArray(v) && v.length > 0 },
    { label: '可多选', check: () => true },
]);

/**
 * 密码字段的规则清单（供 FieldRulePopover 使用）
 * - 规则从 configStore.securityConfig 动态读取
 * - 编辑模式下，留空视为"不修改"
 */
const passwordRules = computed<RuleItem[]>(() => {
    const { passwordMinLength, passwordComplexity } = configStore.securityConfig;
    const rules: RuleItem[] = [];

    // 新增模式：必填；编辑模式：留空=不修改
    if (!isEdit.value) {
        rules.push({ label: '必填', check: (v) => (v as string).length > 0 });
    } else {
        rules.push({ label: '留空则不修改原密码', check: () => true });
    }

    rules.push({
        label: `至少 ${passwordMinLength} 位`,
        check: (v) => (v as string).length >= passwordMinLength,
    });
    rules.push({ label: '最多 64 位', check: (v) => (v as string).length <= 64 });

    if (passwordComplexity === 'medium') {
        rules.push({ label: '包含字母', check: (v) => /[A-Za-z]/.test(v as string) });
        rules.push({ label: '包含数字', check: (v) => /\d/.test(v as string) });
    } else if (passwordComplexity === 'high') {
        rules.push({ label: '包含小写字母', check: (v) => /[a-z]/.test(v as string) });
        rules.push({ label: '包含大写字母', check: (v) => /[A-Z]/.test(v as string) });
        rules.push({ label: '包含数字', check: (v) => /\d/.test(v as string) });
        rules.push({
            label: '包含特殊字符（如 !@#$%^&*）',
            check: (v) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(v as string),
        });
    }

    return rules;
});

/**
 * NUpload customRequest：把 NUpload 的内部 action 拦截下来，转发到 uploadAvatar()
 *
 * NUpload 默认走 XHR POST 到 'action' 字段，但我们的后端需要 CSRF header + 信封格式，
 * 所以完全接管：手动 fetch + FormData，成功后回写 formData.avatar
 *
 * @param options.file 待上传的 File 对象（Naive UI 包装的，底层就是浏览器 File）
 * @param options.onFinish / onError / onProgress 回调，必须按 NUpload 协议触发，否则 UI 状态卡住
 */
async function handleAvatarUpload({ file, onFinish, onError }: UploadCustomRequestOptions): Promise<void> {
    // NUpload 的 file.file 是原生 File；如果 Naive UI 版本升级变成对象，这里 unwrap 一下
    const raw = (file as { file?: File }).file ?? (file as unknown as File);
    if (!raw || !(raw instanceof File)) {
        onError();
        message.error('未获取到文件');
        return;
    }

    isUploadingAvatar.value = true;
    try {
        const url = await uploadAvatar(raw);
        // 把后端返回的 URL 写回表单（提交时随 GraphQL 落库到 adminProfile.avatar）
        formData.avatar = url;
        onFinish();
        message.success('头像上传成功');
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '头像上传失败');
        onError();
    } finally {
        isUploadingAvatar.value = false;
    }
}

/**
 * 表单数据 — 字段对齐后端 AdminAccount 模型
 *
 * 关键设计：
 *   - roleId → roleIds[]：后端用数组表达多角色，弹窗用 NSelect multiple
 *   - 新增 nickname / phone / avatar / enabled 字段
 *   - password 字段：新增必填、编辑可选，不要确认密码（靠"显示密码"眼睛图标防错）
 *   - username 仅新增时可编辑（后端 Update 拒绝接受 username）
 */
const formData = reactive({
    username: '',
    nickname: '',
    phone: '',
    email: '',
    /** 头像 URL：编辑时回填，新增时默认 ''，留空表示「使用 User icon 占位」 */
    avatar: '',
    roleIds: [] as string[],
    enabled: true,
    /**
     * 密码字段（新增/编辑都使用，但语义不同）
     * - 新增：必填。可以手输，也可以点旁边的「生成」按钮填一个随机强密码
     * - 编辑：可选。留空 = 不修改原密码；填了 = 提交时额外调一次 resetAdminPassword
     *
     * 不要确认密码！靠"显示密码"眼睛图标 + 「生成」按钮足够防错
     * （确认密码是冗余的，给用户多填一遍反而容易出"两边都填了但点提交前没发现不一致"的问题）
     */
    password: '',
});

// 表单校验规则（computed 动态响应 isEdit 变化）
//   - 新增时：username + nickname + roleIds + password 必填
//   - 编辑时：nickname + roleIds 必填（username 不可改、password 可选）
// 密码规则通过 required: true 驱动 * 号显示，符合 Naive UI 规范
//
// 数据流：CreateAdminAccountSchema → zodToRules → FieldRuleSet → zodToFormRules → Naive UI FormRules
// 特殊处理：
//   - password：保持自定义（动态读取 configStore.securityConfig）
//   - email：Zod .email() 不提取 pattern，需手动补充自定义校验器
//   - phone：zodToFormRules 的 pattern 规则不允许空值（可选字段需特殊处理）
//   - roleIds：Zod 标记 optional，但业务上新增时至少选一个角色
const formRules = computed<FormRules>(() => {
    // 从 schema 生成基础规则，排除 password（password 需要动态读取 configStore）
    const { password: _pw, ...restRules } = schemaFieldRules;

    const generated = zodToFormRules(restRules, {
        fieldLabels: {
            username: '用户名',
            nickname: '昵称',
            phone: '手机号',
            email: '邮箱',
            roleIds: '角色',
            password: '密码',
            avatar: '头像',
        },
    });

    // 覆盖 phone：可选字段，有值时校验中国大陆手机号格式
    // zodToFormRules 的 pattern 规则不允许空值通过，需要用自定义 validator 替代
    generated.phone = [
        {
            validator: (_rule, value) => {
                if (!value) return true;
                return /^1[3-9]\d{9}$/.test(value);
            },
            message: '请输入正确的手机号',
            trigger: 'blur',
        },
    ];

    // 覆盖 email：可选字段，有值时校验邮箱格式
    // Zod 的 .email() 是内置校验，zodToRules 不提取 pattern，需手动补充
    generated.email = [
        {
            validator: (_rule, value) => {
                if (!value) return true;
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            },
            message: '请输入正确的邮箱格式',
            trigger: 'blur',
        },
    ];

    // 覆盖 roleIds：至少选择一个角色（schema 标记为 optional，但业务上新增时必填）
    generated.roleIds = [
        {
            validator: (_rule, value) => Array.isArray(value) && value.length > 0,
            message: '请至少选择一个角色',
            trigger: 'change',
        },
    ];

    // 密码字段：保持自定义（动态读取 configStore.securityConfig）
    generated.password = [
        {
            /** 新增模式必填，编辑模式可选 */
            required: !isEdit.value,
            message: '请输入密码',
            trigger: ['blur', 'input'],
        },
        {
            validator: (_rule, value) => {
                /** 编辑模式留空 = 不修改原密码，直接通过 */
                if (isEdit.value && !value) return true;
                /** 新增模式空值由 required 规则拦截，这里不再重复报错 */
                if (!value) return true;
                if (typeof value !== 'string') return new Error('密码格式错误');

                const { passwordMinLength, passwordComplexity } = configStore.securityConfig;

                if (value.length < passwordMinLength)
                    return new Error(`密码至少 ${passwordMinLength} 位（当前 ${value.length} 位）`);
                if (value.length > 64) return new Error('密码最多 64 位');

                if (passwordComplexity === 'medium') {
                    if (!/[A-Za-z]/.test(value)) return new Error('密码必须包含字母（当前策略：中等复杂度）');
                    if (!/\d/.test(value)) return new Error('密码必须包含数字（当前策略：中等复杂度）');
                } else if (passwordComplexity === 'high') {
                    if (!/[a-z]/.test(value)) return new Error('密码必须包含小写字母（当前策略：高复杂度）');
                    if (!/[A-Z]/.test(value)) return new Error('密码必须包含大写字母（当前策略：高复杂度）');
                    if (!/\d/.test(value)) return new Error('密码必须包含数字（当前策略：高复杂度）');
                    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value))
                        return new Error('密码必须包含特殊字符，如 !@#$%^&*（当前策略：高复杂度）');
                }
                return true;
            },
            trigger: ['blur', 'input'],
        },
    ];

    return generated;
});

/** 打开表单弹窗（不传 row 为新增，传 row 为编辑） */
function openForm(row?: AccountRow) {
    if (row) {
        isEdit.value = true;
        editingId.value = row.id;
        // 完整回填所有可编辑字段
        formData.username = row.username;
        formData.nickname = row.nickname;
        formData.phone = row.phone;
        formData.email = row.email;
        // 头像：后端 AdminProfile.avatar 为空时，弹窗显示空字符串（无预览 + User icon）
        formData.avatar = row.avatar ?? '';
        // 角色：优先用后端原始数组，fallback 用兼容字段（取首元素包成数组）
        formData.roleIds = row.roleIds?.length ? [...row.roleIds] : row.roleId ? [row.roleId] : [];
        formData.enabled = row.enabled;
    } else {
        isEdit.value = false;
        editingId.value = null;
        formData.username = '';
        formData.nickname = '';
        formData.phone = '';
        formData.email = '';
        formData.avatar = '';
        formData.roleIds = [];
        formData.enabled = true;
    }
    /**
     * 密码字段：每次打开都重置为空
     * - 关键安全考量：不能让 admin A 改完 admin B 的资料时，admin B 的密码字段还残留 admin A 上次输入的明文
     * - 即使没填过，也显式置空（防御性）
     */
    formData.password = '';
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
            // 不传 username（后端拒绝）
            // avatar：上传后已经写到 formData.avatar，提交时落库
            //  - 如果用户从头到尾没动过头像，openForm() 回填的 formData.avatar 等于原值
            //  - 这里永远把当前 formData.avatar 传过去（即使是空字符串，表示「清空」）
            //  - 如果希望"未动过就不更新"，需要在 openForm 记录初始值做 diff；当前先简单粗暴全覆盖
            await updateAdmin(editingId.value, {
                nickname: formData.nickname,
                phone: formData.phone,
                email: formData.email,
                enabled: formData.enabled,
                roleIds: formData.roleIds,
                avatar: formData.avatar,
            });

            /**
             * 密码修改：仅在用户填了密码字段时执行
             * - 编辑模式留空 = 不修改原密码
             * - 编辑模式填了 = 调 resetAdminPassword
             *   （强度校验已由 formRules 兜底）
             *   （不再走 confirmPassword，避免冗余输入；resetAdminPassword 的 confirmPassword 参数复用 password 值即可）
             * - 分两次 try/catch 兜住 partial-success：
             *   update 成功 + resetPassword 失败时给明确"资料已更新，密码重置失败"提示
             *   而不是笼统的 message.error(e.message)
             */
            if (formData.password) {
                try {
                    await resetAdminPassword(editingId.value, formData.password, formData.password);
                } catch (resetErr) {
                    /**
                     * 资料已经更新成功（200），但密码重置失败 ——
                     * 不要让用户误以为"全部失败"，明确告知 partial-success
                     * 场景：账户已软删（极少见）、username identity 不存在（schema 异常）、
                     *   后端 bcrypt 哈希失败、网络中断
                     */
                    const resetMsg = resetErr instanceof Error ? resetErr.message : String(resetErr);
                    message.warning(`资料已更新，但密码重置失败：${resetMsg}`);
                    return; /** 跳出外层 onSubmit，不再走下面的"管理员更新成功"提示 */
                }
            }

            message.success(formData.password ? '管理员更新成功，密码已重置' : '管理员更新成功');
        } else {
            // 新增：传后端 Create 接受的字段
            //  - password 必填（formRules 已保证），随 create 一并传给后端
            //  - 不传 enabled（后端 Create 不接，默认启用）
            //  - avatar：用户上传后 formData.avatar 才有值，没传过就是空字符串
            await createAdmin({
                username: formData.username,
                nickname: formData.nickname,
                phone: formData.phone,
                email: formData.email,
                roleIds: formData.roleIds,
                avatar: formData.avatar || undefined,
                password: formData.password,
            });
            /**
             * 弹出"创建成功"对话框，把密码显示给 admin
             * - 因为密码只此一次明文出现（入库后只剩哈希值）
             * - 必须让 admin 把密码传出去（口头/IM/邮件），否则新用户登不进去
             * - 复制按钮是必备：手抄容易出错
             */
            showCreatedAccountPasswordDialog(formData.username, formData.password);
        }
        isFormModalVisible.value = false;
        // 增删改后重新加载当前页
        await loadData();
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '操作失败');
    } finally {
        isSubmitting.value = false;
    }
}

/** 删除管理员（二次确认） */
// ---- 密码生成 + 创建结果展示 ----
/**
 * 生成一个 10 位的强密码
 * 规则：
 * - 必须包含至少 1 个小写字母、1 个大写字母、1 个数字
 * - 其余从 62 字符集（a-zA-Z0-9）随机
 * - 不含容易混淆的字符（如 0/O、1/l/I）以减少手抄出错
 * - 长度固定 10 位，比最小 8 位更安全
 *
 * 安全实现：使用 crypto.getRandomValues（Web Crypto API），密码学安全 PRNG。
 * 不要用 Math.random() —— V8 内部用 xorshift128+，理论上可被预测，
 *   而 admin 自己看到的"生成强密码"按钮会让人误以为是密码学强度。
 * 与后端 admin-account.service.ts 的 generateInitialPassword() 对齐：
 *   后端用 crypto.randomBytes，前端用 crypto.getRandomValues，基座统一风格。
 */
function generateRandomPassword(): string {
    const lower = 'abcdefghjkmnpqrstuvwxyz'; // 去掉 l、i
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // 去掉 I、O
    const digit = '23456789'; // 去掉 0、1
    const all = lower + upper + digit;

    /**
     * 用 crypto.getRandomValues 取一批 uint32，一次性消费，避免每次调用
     * 都要重新 getRandomValues（性能 + 编码更干净）。
     * 长度 11 = 3 (required) + 7 (rest) + 1 (Fisher-Yates 洗牌用)，
     * 多取 1 个 buffer 保险。
     */
    const buf = new Uint32Array(11);
    crypto.getRandomValues(buf);

    /** 安全索引：取模前用 buf[i] >>> 0（uint32）保证非负，避免 [0, length) 偏移 */
    const pick = (s: string, idx: number): string => s[buf[idx] % s.length];

    /** 固定位置放 1 个小写 + 1 个大写 + 1 个数字（满足后端"必须含字母+数字"规则） */
    const required = [pick(lower, 0), pick(upper, 1), pick(digit, 2)];
    const rest: string[] = [];
    for (let i = 0; i < 7; i++) {
        rest.push(pick(all, 3 + i));
    }
    /** 洗牌：拼起来再 Fisher-Yates 一次，避免"前 3 位固定是小写大写数字"被看出规律 */
    const chars = [...required, ...rest];
    for (let i = chars.length - 1; i > 0; i--) {
        const j = buf[10] % (i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

/**
 * 点击「生成」按钮：填一个随机强密码到 formData.password
 * 经验证：v-model 写入时 Naive UI 会触发 input 事件，formRules 的 input trigger
 *   会自动跑一轮校验，无需手动触发
 */
function onGeneratePassword() {
    formData.password = generateRandomPassword();
}

// ---- 创建成功后展示密码 ----
/** 弹窗显隐 */
const isCreatedPwdModalVisible = ref(false);
/** 创建成功的账号信息（username + 明文密码，弹窗内显示用） */
const createdAccount = ref<{ username: string; password: string } | null>(null);

/**
 * 弹出"创建成功 + 密码"对话框
 * 设计：
 * - 显眼：密码字号大、用 monospace、单独成行（避免被忽略）
 * - 复制按钮：放密码旁边，点击后 message.success("已复制")
 * - 强提示：底部一行红色文字"请立即把密码告知该用户"
 * - 给个"我已记录"按钮显式确认
 */
function showCreatedAccountPasswordDialog(username: string, password: string) {
    createdAccount.value = { username, password };
    isCreatedPwdModalVisible.value = true;
}

/** 关闭"创建成功"弹窗 */
function closeCreatedPwdModal() {
    isCreatedPwdModalVisible.value = false;
    createdAccount.value = null;
}

/**
 * 复制账号信息到剪贴板（用户名 + 密码一起复制，方便管理员直接转发给新用户）
 * - 格式：用户名:密码（如 admin:Abc1234567）
 * - 用 navigator.clipboard.writeText（现代浏览器都支持）
 * - 失败兜底：try/catch + message.error
 * - 成功：message.success
 */
async function copyCreatedPassword() {
    if (!createdAccount.value) return;
    try {
        const text = `${createdAccount.value.username}:${createdAccount.value.password}`;
        await navigator.clipboard.writeText(text);
        message.success('账号密码已复制到剪贴板');
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(msg || '复制失败，请手动选中复制');
    }
}

function onDelete(row: AccountRow) {
    dialog.warning({
        title: '确认删除',
        content: `确定要删除管理员「${row.username}」吗？此操作不可撤销。`,
        positiveText: '确认删除',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                await deleteAdmin(row.id);
                message.success('管理员已删除');
                await loadData();
            } catch (e) {
                message.error(String(e));
            }
        },
    });
}

/**
 * 恢复软删除的管理员（二次确认 + 恢复操作）
 * - 仅在 row.deletedAt 非空时由操作列按钮触发
 * - 必须用 onPositiveClick 回调（项目已知坑：dialog.warning 不是 Promise）
 * - 恢复后重新加载当前 showDeleted 状态下的列表
 * - 恢复撞 unique（username 被其他活跃账户占用）由后端 ConflictException 兜底
 */
function onRestore(row: AccountRow) {
    dialog.warning({
        title: '确认恢复',
        content: '将恢复该条管理员记录为正常状态。如有唯一字段冲突（例如用户名已被其他账户占用），恢复会失败。',
        positiveText: '确认恢复',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                await restoreAccount(row.id);
                message.success('已恢复正常');
                await loadData();
            } catch (e) {
                message.error(String(e));
            }
        },
    });
}

/**
 * 彻底删除管理员（二次确认 + 硬删操作）
 * - 仅在 row.deletedAt 非空时由操作列按钮触发
 * - 必须用 onPositiveClick 回调（项目已知坑：dialog.warning 不是 Promise）
 * - 硬删后重新加载当前 showDeleted 状态下的列表（硬删的行不会再出现）
 * - 硬删会清掉该管理员所有级联表行（账号/资料/角色/特例授权/identity），不可恢复
 */
function onHardDelete(row: AccountRow) {
    dialog.warning({
        title: '确认彻底删除',
        content: '此操作不可恢复，将永久从数据库删除该管理员记录（包含账号、资料、角色、特例授权等所有关联数据）。',
        positiveText: '确认彻底删除',
        negativeText: '取消',
        onPositiveClick: async () => {
            try {
                await hardDeleteAccount(row.id);
                message.success('已彻底删除');
                await loadData();
            } catch (e) {
                message.error(String(e));
            }
        },
    });
}

// ---- 账号特例授权 ----
const isAccountPermModalVisible = ref(false);
const permAccount = ref<AccountRow | null>(null);
const permRoleMenuIds = ref<string[]>([]);

/** 打开账号特例授权弹窗：先回查该账户的「角色基线 menuIds」再展示 */
async function openAccountPerm(row: AccountRow) {
    permAccount.value = row;
    permRoleMenuIds.value = [];
    isAccountPermModalVisible.value = true;
    if (row.roleId) {
        try {
            const detail: RoleDetail = await getRoleById(row.roleId);
            permRoleMenuIds.value = detail.menuIds ?? [];
        } catch {
            permRoleMenuIds.value = [];
        }
    }
}
</script>
