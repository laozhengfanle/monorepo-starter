<!--
  邮件服务页面 — 配置邮件发送参数
  对应 config 表 key: mail.service
  注意：API Key 等敏感凭据已拆分到 MailCredentialPage 单独管理
-->
<template>
    <n-card title="邮件服务">
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
            <n-form-item label="驱动" path="driver" feedback="选择邮件发送方式">
                <n-select v-model:value="form.driver" :options="driverOptions" placeholder="请选择邮件驱动" />
            </n-form-item>

            <n-divider title-placement="left">发件人</n-divider>

            <n-form-item label="发件人名称" path="from.name" feedback="邮件 From 字段中的发件人显示名（如 MonoKit）">
                <n-input v-model:value="form.from.name" placeholder="例如：MonoKit" clearable />
            </n-form-item>

            <n-form-item label="发件邮箱" path="from.email" feedback="邮件 From 字段中的发件邮箱地址">
                <n-input v-model:value="form.from.email" placeholder="例如：no-reply@example.com" clearable />
            </n-form-item>

            <n-divider title-placement="left">邮件模板</n-divider>

            <n-form-item
                label="验证邮箱模板"
                path="templates.verify_email"
                feedback="用于邮箱验证的邮件正文，{{code}} 占位符会被替换为验证码"
            >
                <n-input
                    v-model:value="form.templates.verify_email"
                    type="textarea"
                    :autosize="{ minRows: 2, maxRows: 6 }"
                    placeholder="例如：Welcome to MonoKit! Your code: {{code}}"
                />
            </n-form-item>

            <n-form-item label="重置密码模板" path="templates.reset_password" feedback="用于找回密码的邮件正文">
                <n-input
                    v-model:value="form.templates.reset_password"
                    type="textarea"
                    :autosize="{ minRows: 2, maxRows: 6 }"
                    placeholder="例如：Reset password code: {{code}}"
                />
            </n-form-item>

            <n-form-item label="欢迎邮件模板" path="templates.welcome" feedback="用于新用户注册后的欢迎邮件">
                <n-input
                    v-model:value="form.templates.welcome"
                    type="textarea"
                    :autosize="{ minRows: 2, maxRows: 6 }"
                    placeholder="例如：Welcome aboard!"
                />
            </n-form-item>

            <n-divider title-placement="left">限流配置</n-divider>

            <n-form-item label="发送间隔" path="limits.interval" feedback="同一邮箱两次发送邮件的最小间隔（秒）">
                <n-input-number v-model:value="form.limits.interval" :min="1" :max="3600" class="w-full">
                    <template #suffix>秒</template>
                </n-input-number>
            </n-form-item>

            <n-form-item label="每日上限" path="limits.daily" feedback="同一邮箱每天最多可收到的邮件数">
                <n-input-number v-model:value="form.limits.daily" :min="1" :max="1000" class="w-full">
                    <template #suffix>封</template>
                </n-input-number>
            </n-form-item>

            <n-form-item label="验证码有效期" path="limits.codeTtl" feedback="邮件中验证码的有效期（秒）">
                <n-input-number v-model:value="form.limits.codeTtl" :min="60" :max="86400" class="w-full">
                    <template #suffix>秒</template>
                </n-input-number>
            </n-form-item>

            <n-form-item label=" ">
                <n-button type="primary" :loading="isSaving" @click="onSave"> 保存设置 </n-button>
            </n-form-item>
        </n-form>
    </n-card>
</template>

<script setup lang="ts">
/**
 * MailServicePage 组件
 *
 * 配置邮件服务基础参数（驱动 / 发件人 / 模板 / 限流）
 * 敏感凭据（Resend API Key）已拆分到 MailCredentialPage 单独管理
 */
import { ref, reactive, onMounted } from 'vue';
import { useMessage } from 'naive-ui';
import type { FormInst, FormRules } from 'naive-ui';
import { getPrivateConfigs, batchUpdateConfigs } from '@/api/configs';

defineOptions({ name: 'ConfigMailService' });

const message = useMessage();
const formRef = ref<FormInst | null>(null);
const isSaving = ref(false);
const isLoading = ref(true);

/** 表单状态：驱动、发件人、模板、限流 */
const form = reactive({
    driver: 'mock' as 'mock' | 'resend',
    from: {
        name: '',
        email: '',
    },
    templates: {
        verify_email: '',
        reset_password: '',
        welcome: '',
    },
    limits: {
        interval: 60,
        daily: 20,
        codeTtl: 1800,
    },
});

/** 驱动选项：mock = 仅写日志，resend = 走 Resend API */
const driverOptions = [
    { label: 'Mock（开发模式）', value: 'mock' },
    { label: 'Resend', value: 'resend' },
];

/** 校验规则：仅 driver 必填 */
const rules: FormRules = {
    driver: {
        required: true,
        message: '请选择邮件驱动',
        trigger: 'change',
    },
};

/** 保存处理 */
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
                key: 'mail.service',
                value: { ...form },
            },
        ]);
        message.success('邮件服务配置已保存');
    } catch {
        message.error('保存失败，请重试');
    } finally {
        isSaving.value = false;
    }
}

/** 初始化：从后端拉取 mail.service 配置 */
onMounted(async () => {
    try {
        const configs = await getPrivateConfigs();
        const item = configs.find((c) => c.key === 'mail.service');
        if (item) {
            const v = item.value;
            form.driver = (v.driver as 'mock' | 'resend') || 'mock';
            // 发件人
            const f = (v.from as Record<string, string>) || {};
            form.from.name = f.name || '';
            form.from.email = f.email || '';
            // 模板
            const tpl = (v.templates as Record<string, string>) || {};
            form.templates.verify_email = tpl.verify_email || '';
            form.templates.reset_password = tpl.reset_password || '';
            form.templates.welcome = tpl.welcome || '';
            // 限流
            const lim = (v.limits as Record<string, number>) || {};
            form.limits.interval = lim.interval ?? 60;
            form.limits.daily = lim.daily ?? 20;
            form.limits.codeTtl = lim.codeTtl ?? 1800;
        }
    } catch {
        message.error('加载配置失败，请刷新页面');
    } finally {
        isLoading.value = false;
    }
});
</script>
