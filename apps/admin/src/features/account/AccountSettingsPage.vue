<!--
    账号设置页面 — 提供可操作的"账号设置"能力

    设计要点：
    1. 响应式布局 — 用 n-grid (responsive="self" + 数字断点，与 WelcomePage 一致)：
       - 窄屏（< 1024px）：4 个 card 1 列堆叠
       - 宽屏（>= 1024px）：4 个 card 排成 2×2
       - 为什么用 self + 数字断点？
         · screen 模式只支持预设断点（s/m/l/xl/2xl）
         · self 模式按组件自身宽度判断，支持自定义像素断点
         · 见 Naive UI Grid 文档：responsive prop 默认 'self'
    2. 4 个 card 各有图标 + 配色，提升视觉辨识度：
       - 头像（绿，identity）     + 基本信息（蓝，edit）
       - 账号状态（橙，info）     + 修改密码（红，security）
    3. 可编辑项（保存时仅更新前端 store，不持久化到后端）：
       - 头像（文件读取为 dataURL 预览）
       - 昵称 / 邮箱 / 手机号（保存到 adminStore）
       - 密码（当前密码 + 新密码 + 确认密码）
    4. 数据源：与 ProfilePage 保持一致，统一从 adminStore 派生
-->
<template>
    <n-space vertical :size="gap">
        <n-page-header title="账号设置" subtitle="修改头像、基本信息与密码" />

        <!-- 第一行：头像（左） + 基本信息（右） -->
        <n-grid cols="1 1024:2" :x-gap="gap" :y-gap="gap" responsive="self">
            <!-- 1. 头像 — 操作按钮放 header-extra，内容区只展示头像和提示 -->
            <n-gi class="flex flex-col">
                <n-card class="flex-1">
                    <template #header>
                        <span class="flex items-center gap-2 text-base font-semibold">
                            <n-icon size="18" color="#18a058">
                                <PersonCircleOutline />
                            </n-icon>
                            头像
                        </span>
                    </template>
                    <template #header-extra>
                        <n-button size="small" type="primary" ghost :loading="avatarLoading" @click="onAvatarClick">
                            更换头像
                        </n-button>
                    </template>
                    <div class="flex flex-col items-center gap-3 py-6">
                        <n-avatar
                            :src="avatarPreview"
                            :size="96"
                            round
                            class="ring-2 ring-default-100 dark:ring-default-700 shadow-sm"
                        />
                        <n-text depth="3" class="text-xs">支持 JPG / PNG / WEBP，大小不超过 2MB</n-text>
                    </div>
                    <input
                        ref="avatarInputRef"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        class="hidden"
                        @change="onAvatarChange"
                    />
                </n-card>
            </n-gi>

            <!-- 2. 基本信息（可编辑） -->
            <n-gi class="flex flex-col">
                <n-card class="flex-1">
                    <template #header>
                        <span class="flex items-center gap-2 text-base font-semibold">
                            <n-icon size="18" color="#2080f0">
                                <CreateOutline />
                            </n-icon>
                            基本信息
                        </span>
                    </template>
                    <n-form
                        ref="profileFormRef"
                        :model="profileForm"
                        :rules="profileRules"
                        label-placement="top"
                        :show-feedback="true"
                    >
                        <n-form-item label="账号 ID" :show-feedback="false">
                            <n-input :value="userId" disabled />
                        </n-form-item>
                        <n-form-item label="昵称" path="name">
                            <n-input v-model:value="profileForm.name" placeholder="请输入昵称" clearable />
                        </n-form-item>
                        <n-form-item label="邮箱" path="email">
                            <n-input v-model:value="profileForm.email" placeholder="请输入邮箱" clearable />
                        </n-form-item>
                        <n-form-item label="手机号" path="phone">
                            <n-input v-model:value="profileForm.phone" placeholder="请输入手机号" clearable />
                        </n-form-item>
                        <n-form-item :show-feedback="false">
                            <n-button type="primary" :loading="profileSaving" @click="onSaveProfile">
                                保存修改
                            </n-button>
                        </n-form-item>
                    </n-form>
                </n-card>
            </n-gi>
        </n-grid>

        <!-- 第二行：账号状态（左） + 修改密码（右） -->
        <n-grid cols="1 1024:2" :x-gap="gap" :y-gap="gap" responsive="self">
            <!-- 3. 账号状态（只读） -->
            <n-gi class="flex flex-col">
                <n-card class="flex-1">
                    <template #header>
                        <span class="flex items-center gap-2 text-base font-semibold">
                            <n-icon size="18" color="#f0a020">
                                <ShieldCheckmarkOutline />
                            </n-icon>
                            账号状态
                        </span>
                    </template>
                    <n-descriptions :column="1" bordered :label-style="{ width: '100px' }">
                        <n-descriptions-item label="角色">
                            <n-tag :type="roleTagType">{{ displayRole }}</n-tag>
                        </n-descriptions-item>
                        <n-descriptions-item label="状态">
                            <n-tag :type="accountStatus === 1 ? 'success' : 'default'">
                                {{ accountStatus === 1 ? '正常' : '禁用' }}
                            </n-tag>
                        </n-descriptions-item>
                        <n-descriptions-item label="最近登录">
                            {{ lastLoginAt || '—' }}
                        </n-descriptions-item>
                        <n-descriptions-item label="创建时间">
                            {{ createAt || '—' }}
                        </n-descriptions-item>
                    </n-descriptions>
                </n-card>
            </n-gi>

            <!-- 4. 修改密码 -->
            <n-gi class="flex flex-col">
                <n-card class="flex-1">
                    <template #header>
                        <span class="flex items-center gap-2 text-base font-semibold">
                            <n-icon size="18" color="#d03050">
                                <LockClosedOutline />
                            </n-icon>
                            修改密码
                        </span>
                    </template>
                    <n-form
                        ref="passwordFormRef"
                        :model="passwordForm"
                        :rules="passwordRules"
                        label-placement="top"
                        :show-feedback="true"
                    >
                        <n-form-item label="当前密码" path="current">
                            <n-input
                                v-model:value="passwordForm.current"
                                type="password"
                                show-password-on="click"
                                placeholder="请输入当前密码"
                            />
                        </n-form-item>
                        <n-form-item label="新密码" path="next">
                            <n-input
                                v-model:value="passwordForm.next"
                                type="password"
                                show-password-on="click"
                                placeholder="至少 6 位"
                            />
                        </n-form-item>
                        <n-form-item label="确认新密码" path="confirm">
                            <n-input
                                v-model:value="passwordForm.confirm"
                                type="password"
                                show-password-on="click"
                                placeholder="再次输入新密码"
                            />
                        </n-form-item>
                        <n-form-item :show-feedback="false">
                            <n-button type="primary" :loading="passwordSaving" @click="onChangePassword">
                                修改密码
                            </n-button>
                        </n-form-item>
                    </n-form>
                </n-card>
            </n-gi>
        </n-grid>
    </n-space>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { FormInst, FormRules } from 'naive-ui';
import { PersonCircleOutline, CreateOutline, ShieldCheckmarkOutline, LockClosedOutline } from '@vicons/ionicons5';
import { useAdminStore } from '@/shared/stores/admin';
import { useMessage } from '@/shared/composables/useMessage';
import { useDesignTokens } from '@/shared/composables/useDesignTokens';

defineOptions({ name: 'AccountSettingsPage' });

const { gap } = useDesignTokens();
const { message } = useMessage();
const adminStore = useAdminStore();

// ---- 头像：本地预览状态 + 隐藏 file input ----
const avatarInputRef = ref<HTMLInputElement | null>(null);
const avatarLoading = ref(false);
const avatarPreview = ref('');

// ---- 基本信息（可编辑） ----
const profileFormRef = ref<FormInst | null>(null);
const profileSaving = ref(false);
const profileForm = reactive({
    name: '',
    email: '',
    phone: '',
});

const profileRules: FormRules = {
    name: [
        { required: true, message: '请输入昵称', trigger: ['blur', 'input'] },
        { min: 2, max: 32, message: '昵称长度 2-32 个字符', trigger: ['blur', 'input'] },
    ],
    email: [
        {
            validator: (_rule, value) => {
                if (!value) return true;
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
            },
            message: '邮箱格式不正确',
            trigger: ['blur', 'input'],
        },
    ],
    phone: [
        {
            validator: (_rule, value) => {
                if (!value) return true;
                return /^1[3-9]\d{9}$/.test(String(value));
            },
            message: '手机号格式不正确',
            trigger: ['blur', 'input'],
        },
    ],
};

// ---- 修改密码 ----
const passwordFormRef = ref<FormInst | null>(null);
const passwordSaving = ref(false);
const passwordForm = reactive({
    current: '',
    next: '',
    confirm: '',
});

const passwordRules: FormRules = {
    current: [{ required: true, message: '请输入当前密码', trigger: ['blur', 'input'] }],
    next: [
        { required: true, message: '请输入新密码', trigger: ['blur', 'input'] },
        { min: 6, message: '新密码至少 6 位', trigger: ['blur', 'input'] },
    ],
    confirm: [
        { required: true, message: '请再次输入新密码', trigger: ['blur', 'input'] },
        {
            validator: (_rule, value) => value === passwordForm.next,
            message: '两次输入的密码不一致',
            trigger: ['blur', 'input'],
        },
    ],
};

// ---- 账号状态（只读，从 adminStore 派生） ----
const userId = computed(() => adminStore.adminInfo?.id || '-');
const createAt = computed(() => (adminStore.adminInfo?.createAt as string) || '');
const lastLoginAt = computed(() => (adminStore.adminInfo?.lastLoginAt as string) || '');
const accountStatus = computed(() => (adminStore.adminInfo?.status as number | undefined) ?? 1);

// ---- 角色展示（与 ProfilePage 完全一致） ----
const ROLE_LABEL_MAP: Record<string, string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    editor: '内容编辑',
    viewer: '观察者',
    auditor: '审计员',
    operator: '运营专员',
};
const rawRole = computed(() => adminStore.adminInfo?.role || '');
const displayRole = computed(() => ROLE_LABEL_MAP[rawRole.value] || rawRole.value || '—');
const roleTagType = computed(() => {
    const map: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
        super_admin: 'error',
        admin: 'warning',
        editor: 'info',
        viewer: 'default',
    };
    return map[rawRole.value] || 'info';
});

// ---- 头像更换 ----
const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function onAvatarClick() {
    avatarInputRef.value?.click();
}

function onAvatarChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    // 允许用户取消选择：清空 input.value 避免下次选同一文件不触发
    input.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
        message.error('仅支持 JPG / PNG / WEBP 格式');
        return;
    }
    if (file.size > AVATAR_MAX_SIZE) {
        message.error('图片大小不能超过 2MB');
        return;
    }

    avatarLoading.value = true;
    const reader = new FileReader();
    reader.onload = () => {
        avatarPreview.value = String(reader.result || '');
        avatarLoading.value = false;
        // 后端上传 API 尚未接入：明确告诉用户预览已生效，但不会持久化
        message.warning('头像预览已更新（上传接口待后端 API 接入）');
    };
    reader.onerror = () => {
        avatarLoading.value = false;
        message.error('图片读取失败，请重试');
    };
    reader.readAsDataURL(file);
}

// ---- 保存基本信息 ----
async function onSaveProfile() {
    if (!profileFormRef.value) return;
    try {
        await profileFormRef.value.validate();
    } catch (err) {
        if (err instanceof Array) {
            // FormValidationError：交给 n-form 自身的反馈提示
            return;
        }
        throw err;
    }

    profileSaving.value = true;
    try {
        adminStore.updateAdminInfo({
            name: profileForm.name.trim(),
            email: profileForm.email.trim() || undefined,
            phone: profileForm.phone.trim() || undefined,
        });
        message.warning('基本信息已更新（持久化接口待后端 API 接入）');
    } finally {
        profileSaving.value = false;
    }
}

// ---- 修改密码 ----
async function onChangePassword() {
    if (!passwordFormRef.value) return;
    try {
        await passwordFormRef.value.validate();
    } catch (err) {
        if (err instanceof Array) {
            return;
        }
        throw err;
    }

    passwordSaving.value = true;
    try {
        // 后端改密接口尚未接入：仅清空表单，给出明确提示
        passwordForm.current = '';
        passwordForm.next = '';
        passwordForm.confirm = '';
        message.warning('密码修改请求已记录（持久化接口待后端 API 接入）');
    } finally {
        passwordSaving.value = false;
    }
}

// 页面挂载时把 store 中的基本信息塞入表单，把头像塞入预览
onMounted(() => {
    const info = adminStore.adminInfo;
    if (info) {
        profileForm.name = info.name || '';
        profileForm.email = (info.email as string) || '';
        profileForm.phone = (info.phone as string) || '';
    }
    avatarPreview.value = adminStore.adminAvatar;
});
</script>
