<!--
  短信服务商页面 — 配置短信服务商参数
  对应 config 表 key: sms.provider
  注意：AccessKeyId / AccessKeySecret 等敏感凭据已拆分到 SmsCredentialPage 单独管理
-->
<template>
    <n-card title="短信服务商">
        <!-- 加载中骨架 -->
        <div v-if="isLoading" class="flex items-center justify-center py-10">
            <n-spin description="加载配置中..." />
        </div>
        <n-form
            v-else
            ref="formRef"
            :model="form"
            :rules="rules"
            label-placement="left"
            label-width="10rem"
            class="max-w-2xl"
        >
            <!-- 提示横幅：开发模式提示（仅当 driver === 'mock' 时显示） -->
            <n-alert v-if="form.driver === 'mock'" type="info" title="开发模式" class="mb-4" :show-icon="true">
                当前为开发模式，使用 mock 驱动，验证码固定为 123456
            </n-alert>

            <n-form-item label="驱动" path="driver" feedback="选择短信发送通道">
                <n-select v-model:value="form.driver" :options="driverOptions" placeholder="请选择短信服务商" />
            </n-form-item>

            <!-- mock 专属配置：固定验证码（仅 mock 驱动可见） -->
            <n-form-item
                v-if="form.driver === 'mock'"
                label="Mock 验证码"
                path="mockCode"
                feedback="开发期固定验证码，登录时填这个值即可通过"
            >
                <n-input v-model:value="form.mockCode" placeholder="例如：123456" clearable />
            </n-form-item>

            <n-form-item label="短信签名" path="signName" feedback="短信签名（SignName），需在阿里云短信后台审核通过">
                <n-input v-model:value="form.signName" placeholder="请输入短信签名" clearable />
            </n-form-item>

            <n-divider title-placement="left">模板编码</n-divider>

            <n-form-item label="登录模板" path="templates.login" feedback="短信登录场景的模板编码（TemplateCode）">
                <n-input v-model:value="form.templates.login" placeholder="例如：SMS_123456789" clearable />
            </n-form-item>

            <n-form-item label="注册模板" path="templates.register" feedback="短信注册场景的模板编码">
                <n-input v-model:value="form.templates.register" placeholder="例如：SMS_123456789" clearable />
            </n-form-item>

            <n-form-item label="重置密码模板" path="templates.reset_password" feedback="通过短信重置密码场景的模板编码">
                <n-input v-model:value="form.templates.reset_password" placeholder="例如：SMS_123456789" clearable />
            </n-form-item>

            <n-form-item label="换绑手机模板" path="templates.bind_phone" feedback="用户更换绑定手机号场景的模板编码">
                <n-input v-model:value="form.templates.bind_phone" placeholder="例如：SMS_123456789" clearable />
            </n-form-item>

            <n-divider title-placement="left">限流配置</n-divider>

            <n-form-item label="发送间隔" path="limits.interval" feedback="同一手机号两次发送验证码的最小间隔（秒）">
                <n-input-number v-model:value="form.limits.interval" :min="1" :max="3600" class="w-full">
                    <template #suffix>秒</template>
                </n-input-number>
            </n-form-item>

            <n-form-item label="每日上限" path="limits.daily" feedback="同一手机号每天最多可收到的验证码条数">
                <n-input-number v-model:value="form.limits.daily" :min="1" :max="1000" class="w-full">
                    <template #suffix>条</template>
                </n-input-number>
            </n-form-item>

            <n-form-item label="IP 每小时" path="limits.ipHourly" feedback="同一 IP 每小时最多可发起的发送请求数">
                <n-input-number v-model:value="form.limits.ipHourly" :min="1" :max="10000" class="w-full">
                    <template #suffix>次</template>
                </n-input-number>
            </n-form-item>

            <n-form-item label="验证码有效期" path="limits.codeTtl" feedback="验证码在多长时间内有效（秒）">
                <n-input-number v-model:value="form.limits.codeTtl" :min="60" :max="3600" class="w-full">
                    <template #suffix>秒</template>
                </n-input-number>
            </n-form-item>

            <n-form-item
                label="最大尝试次数"
                path="limits.maxAttempts"
                feedback="同一验证码可验证的最大失败次数，超出后失效"
            >
                <n-input-number v-model:value="form.limits.maxAttempts" :min="1" :max="20" class="w-full">
                    <template #suffix>次</template>
                </n-input-number>
            </n-form-item>

            <n-divider title-placement="left">降级策略</n-divider>

            <n-form-item
                label="Turnstile 降级"
                path="fallback.turnstileEnabled"
                feedback="阿里云发送失败时是否降级为 Turnstile 人机验证"
            >
                <n-switch v-model:value="form.fallback.turnstileEnabled">
                    <template #checked>开启</template>
                    <template #unchecked>关闭</template>
                </n-switch>
            </n-form-item>

            <n-form-item label=" ">
                <n-button type="primary" :loading="isSaving" @click="onSave"> 保存设置 </n-button>
            </n-form-item>
        </n-form>
    </n-card>
</template>

<script setup lang="ts">
/**
 * SmsProviderPage 组件
 *
 * 配置短信服务商基础参数（驱动 / 模板 / 限流 / 降级）
 * 敏感凭据（AccessKeyId / Secret）已拆分到 SmsCredentialPage 页面单独管理
 */
import { ref, reactive, onMounted } from 'vue';
import { useMessage } from 'naive-ui';
import type { FormInst, FormRules } from 'naive-ui';
import { getPrivateConfigs, batchUpdateConfigs } from '@/api/configs';

defineOptions({ name: 'ConfigSmsProvider' });

const message = useMessage();
const formRef = ref<FormInst | null>(null);
const isSaving = ref(false);
const isLoading = ref(true);

/** 表单状态：驱动、签名、模板、限流、降级 */
const form = reactive({
    driver: 'mock' as 'mock' | 'aliyun',
    mockCode: '123456',
    signName: '',
    templates: {
        login: '',
        register: '',
        reset_password: '',
        bind_phone: '',
    },
    limits: {
        interval: 60,
        daily: 10,
        ipHourly: 20,
        codeTtl: 300,
        maxAttempts: 5,
    },
    fallback: {
        turnstileEnabled: false,
    },
});

/** 驱动选项：mock = 开发模式，aliyun = 阿里云生产 */
const driverOptions = [
    { label: 'Mock（开发模式）', value: 'mock' },
    { label: '阿里云短信', value: 'aliyun' },
];

/** 校验规则：仅 driver 必填，其余可后端兜底 */
const rules: FormRules = {
    driver: {
        required: true,
        message: '请选择短信驱动',
        trigger: 'change',
    },
    mockCode: {
        required: true,
        message: '请输入 Mock 验证码',
        trigger: 'blur',
    },
};

/** 保存处理：直接覆盖 sms.provider 整条 JSON */
async function onSave() {
    try {
        await formRef.value?.validate();
    } catch {
        return;
    }
    isSaving.value = true;
    try {
        await batchUpdateConfigs([
            {
                key: 'sms.provider',
                value: { ...form },
            },
        ]);
        message.success('短信服务商配置已保存');
    } catch {
        message.error('保存失败，请重试');
    } finally {
        isSaving.value = false;
    }
}

/** 初始化：从后端拉取 sms.provider 配置 */
onMounted(async () => {
    try {
        const configs = await getPrivateConfigs();
        const item = configs.find((c) => c.key === 'sms.provider');
        if (item) {
            const v = item.value;
            // 字段逐个回填，缺失则用默认值
            form.driver = (v.driver as 'mock' | 'aliyun') || 'mock';
            form.mockCode = (v.mockCode as string) || '123456';
            form.signName = (v.signName as string) || '';
            // 模板对象
            const tpl = (v.templates as Record<string, string>) || {};
            form.templates.login = tpl.login || '';
            form.templates.register = tpl.register || '';
            form.templates.reset_password = tpl.reset_password || '';
            form.templates.bind_phone = tpl.bind_phone || '';
            // 限流对象
            const lim = (v.limits as Record<string, number>) || {};
            form.limits.interval = lim.interval ?? 60;
            form.limits.daily = lim.daily ?? 10;
            form.limits.ipHourly = lim.ipHourly ?? 20;
            form.limits.codeTtl = lim.codeTtl ?? 300;
            form.limits.maxAttempts = lim.maxAttempts ?? 5;
            // 降级对象
            const fb = (v.fallback as Record<string, boolean>) || {};
            form.fallback.turnstileEnabled = fb.turnstileEnabled ?? false;
        }
    } catch {
        message.error('加载配置失败，请刷新页面');
    } finally {
        isLoading.value = false;
    }
});
</script>
