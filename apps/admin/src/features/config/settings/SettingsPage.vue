<!--
配置中心页面 — 管理员配置系统全局参数
功能：系统基本信息、安全策略、水印设置、界面配置
数据源：GraphQL config 表（真实后端）
-->
<template>
    <n-card title="配置中心">
        <n-spin :show="isLoading">
            <n-form ref="formRef" :model="form" :rules="rules" label-placement="left" label-width="120">
                <n-grid :x-gap="gap" :y-gap="gap" cols="1 768:2" responsive="self">
                    <!-- 系统基本信息 -->
                    <n-gi>
                        <n-form-item label="系统名称" path="systemName" feedback="后台显示的系统名称">
                            <n-input v-model:value="form.systemName" placeholder="请输入系统名称" clearable />
                        </n-form-item>
                    </n-gi>
                    <n-gi>
                        <n-form-item label="页脚文本" path="footerText" feedback="显示在页面底部的版权信息">
                            <n-input v-model:value="form.footerText" placeholder="© 2026 My Company" clearable />
                        </n-form-item>
                    </n-gi>

                    <n-gi>
                        <n-form-item
                            label="系统 Logo"
                            path="logo"
                            class="lg:col-span-2"
                            feedback="支持 PNG、JPG、WebP 格式，建议尺寸 48x48"
                        >
                            <div class="flex items-center gap-3">
                                <n-avatar
                                    :src="logoPreview || '/hero.png'"
                                    :size="36"
                                    shape="square"
                                    class="rounded-md!"
                                />
                                <n-button size="small" @click="logoInputRef?.click()"> 更换 Logo </n-button>
                                <input
                                    ref="logoInputRef"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    class="hidden"
                                    @change="onLogoChange"
                                />
                            </div>
                        </n-form-item>
                    </n-gi>

                    <!-- 安全策略 -->
                    <n-gi :span="24">
                        <n-divider />
                    </n-gi>

                    <n-gi>
                        <n-form-item label="密码最小长度" path="passwordMinLength" feedback="6-32">
                            <n-input-number v-model:value="form.passwordMinLength" :min="6" :max="32">
                                <template #suffix>位</template>
                            </n-input-number>
                        </n-form-item>
                    </n-gi>
                    <n-gi>
                        <n-form-item label="登录失败阈值" path="loginFailThreshold" feedback="超过后锁定账号">
                            <n-input-number v-model:value="form.loginFailThreshold" :min="3" :max="20">
                                <template #suffix>次</template>
                            </n-input-number>
                        </n-form-item>
                    </n-gi>
                    <n-gi>
                        <n-form-item label="锁定时长" path="lockDuration">
                            <n-input-number v-model:value="form.lockDuration" :min="5" :max="120">
                                <template #suffix>分钟</template>
                            </n-input-number>
                        </n-form-item>
                    </n-gi>
                    <n-gi>
                        <n-form-item label="密码复杂度" path="passwordComplexity" :feedback="complexityDesc">
                            <n-select
                                v-model:value="form.passwordComplexity"
                                :options="complexityOptions"
                                placeholder="请选择"
                            />
                        </n-form-item>
                    </n-gi>

                    <!-- 界面配置 -->
                    <n-gi :span="24">
                        <n-divider />
                    </n-gi>

                    <n-gi>
                        <n-form-item label="Keep-alive 上限" path="keepAliveMax" feedback="0 表示不缓存">
                            <n-input-number v-model:value="form.keepAliveMax" :min="0" :max="50">
                                <template #suffix>个页面</template>
                            </n-input-number>
                        </n-form-item>
                    </n-gi>
                    <n-gi>
                        <n-form-item label="请求超时" path="requestTimeout">
                            <n-input-number v-model:value="form.requestTimeout" :min="100" :max="60000" :step="1000">
                                <template #suffix>毫秒</template>
                            </n-input-number>
                        </n-form-item>
                    </n-gi>

                    <!-- 水印设置 -->
                    <n-gi :span="24">
                        <n-divider />
                    </n-gi>

                    <n-gi>
                        <n-form-item label="水印内容" path="watermarkContent" :feedback="watermarkVarHint">
                            <n-input
                                v-model:value="form.watermarkContent"
                                placeholder="请输入水印文本，留空则不显示"
                                clearable
                            />
                        </n-form-item>
                    </n-gi>
                    <n-gi>
                        <n-form-item label="预览">
                            <div
                                class="relative w-full h-24 bg-gray-50 dark:bg-[rgb(47,47,51)] rounded-md overflow-hidden border border-gray-200 dark:border-gray-700"
                            >
                                <div
                                    v-if="watermarkPreview"
                                    class="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
                                    :style="watermarkStyle"
                                >
                                    {{ watermarkPreview }}
                                </div>
                                <n-text
                                    v-else
                                    depth="3"
                                    class="absolute inset-0 flex items-center justify-center text-xs"
                                >
                                    无水印
                                </n-text>
                            </div>
                        </n-form-item>
                    </n-gi>

                    <n-gi>
                        <n-form-item>
                            <template #label>
                                <span />
                            </template>
                            <n-button type="primary" :loading="isSaving" @click="onSave"> 保存设置 </n-button>
                        </n-form-item>
                    </n-gi>
                </n-grid>
            </n-form>
        </n-spin>
    </n-card>
</template>

<script setup lang="ts">
// KeepAlive 通过组件名匹配缓存，必须和路由名 "ConfigAdmin" 一致
defineOptions({ name: 'ConfigAdmin' });
import { ref, reactive, computed, onMounted } from 'vue';
import { useMessage } from '@/shared/composables/useMessage';
import type { FormInst, FormRules } from 'naive-ui';
import { getConfigs, batchUpdateConfigs } from '@/api/configs';
import { useConfigStore } from '@/shared/stores/config';
import { useDesignTokens } from '@/shared/composables/useDesignTokens';

const { message } = useMessage();
const configStore = useConfigStore();
const { gap } = useDesignTokens();

const formRef = ref<FormInst | null>(null);
const isSaving = ref(false);
const logoInputRef = ref<HTMLInputElement | null>(null);
const logoPreview = ref('');
const isLoading = ref(true);

// ---- 表单数据（扁平化所有字段） ----
const form = reactive({
    systemName: '',
    logo: '',
    footerText: '',
    passwordMinLength: 8,
    loginFailThreshold: 5,
    lockDuration: 30,
    passwordComplexity: 'medium' as 'low' | 'medium' | 'high',
    watermarkContent: '{{username}} {{date}}',
    keepAliveMax: 10,
    requestTimeout: 10000,
});

// ---- 校验规则 ----
const rules: FormRules = {
    systemName: { required: true, message: '请输入系统名称', trigger: 'blur' },
    passwordComplexity: { required: true, message: '请选择密码复杂度', trigger: 'blur' },
};

// ---- 密码复杂度选项 ----
const complexityOptions = [
    { label: '低：仅长度要求', value: 'low' },
    { label: '中：包含字母和数字', value: 'medium' },
    { label: '高：包含大小写字母、数字和特殊字符', value: 'high' },
];

// ---- Logo 上传 ----
/** 允许上传的 Logo 文件类型白名单（排除 SVG，防止 SVG 内嵌 <script> 导致 XSS） */
const LOGO_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/** 上传文件大小上限：2MB */
const LOGO_MAX_SIZE = 2 * 1024 * 1024;

function onLogoChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    // 文件类型白名单校验
    if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
        message.error('仅支持 PNG、JPG、WebP 格式的图片');
        return;
    }

    if (file.size > LOGO_MAX_SIZE) {
        message.error(`文件大小不能超过 ${LOGO_MAX_SIZE / 1024 / 1024}MB`);
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        logoPreview.value = ev.target?.result as string;
        form.logo = logoPreview.value;
    };
    reader.readAsDataURL(file);
    message.success('Logo 已选择，保存后生效');
}

// ---- 密码复杂度描述 ----
const complexityDesc = computed(() => {
    const map: Record<string, string> = {
        low: '密码只需达到最小长度',
        medium: '密码必须同时包含字母和数字',
        high: '密码必须包含大小写字母、数字和特殊字符',
    };
    return map[form.passwordComplexity] || '';
});

// ---- 水印预览 ----
const watermarkVarHint = '支持变量：{{username}}（当前用户名）、{{date}}（当前日期）';

const watermarkPreview = computed(() => {
    const content = form.watermarkContent.trim();
    if (!content) return '';
    return content.replace(/\{\{username\}\}/g, '张三').replace(/\{\{date\}\}/g, '2026-06-09');
});

const watermarkStyle = computed(() => ({
    transform: 'rotate(-20deg)',
    color: 'rgba(0, 0, 0, 0.08)',
    fontSize: '14px',
    whiteSpace: 'nowrap',
}));

// ---- 保存（合并所有字段写一条 key: "settings"） ----
async function onSave() {
    try {
        await formRef.value?.validate();
    } catch {
        return;
    }
    isSaving.value = true;
    try {
        // 注意：form 字段名和 mock 数据 key 不完全一致（systemName ↔ name）
        // 因此手动构建 value 对象，确保后端 key 匹配
        await batchUpdateConfigs([
            {
                key: 'settings',
                value: {
                    name: form.systemName,
                    logo: form.logo,
                    footerText: form.footerText,
                    passwordMinLength: form.passwordMinLength,
                    loginFailThreshold: form.loginFailThreshold,
                    lockDuration: form.lockDuration,
                    passwordComplexity: form.passwordComplexity,
                    watermarkContent: form.watermarkContent,
                    keepAliveMax: form.keepAliveMax,
                    requestTimeout: form.requestTimeout,
                },
            },
        ]);

        // 同步到全局 store（通过 action 而非直接属性赋值）
        configStore.applySettings({
            name: form.systemName,
            logo: form.logo,
            footerText: form.footerText,
            keepAliveMax: form.keepAliveMax,
            requestTimeout: form.requestTimeout,
            watermarkContent: form.watermarkContent,
        });

        document.title = form.systemName;
        message.success('设置已保存');
    } catch {
        message.error('保存失败，请重试');
    } finally {
        isSaving.value = false;
    }
}

// ---- 初始化 ----
onMounted(async () => {
    try {
        const configs = await getConfigs();
        const settings = configs.find((c) => c.key === 'settings');
        if (settings) {
            const v = settings.value;
            form.systemName = (v.name as string) || '';
            form.logo = (v.logo as string) || '';
            form.footerText = (v.footerText as string) || '';
            form.passwordMinLength = (v.passwordMinLength as number) ?? 8;
            form.loginFailThreshold = (v.loginFailThreshold as number) ?? 5;
            form.lockDuration = (v.lockDuration as number) ?? 30;
            form.passwordComplexity = (v.passwordComplexity as 'low' | 'medium' | 'high') ?? 'medium';
            form.watermarkContent = (v.watermarkContent as string) ?? '{{username}} {{date}}';
            form.keepAliveMax = (v.keepAliveMax as number) ?? 10;
            form.requestTimeout = (v.requestTimeout as number) ?? 10000;
            logoPreview.value = form.logo || '/hero.png';
        }
    } catch {
        message.error('加载配置失败，请刷新页面');
    } finally {
        isLoading.value = false;
    }
});
</script>
