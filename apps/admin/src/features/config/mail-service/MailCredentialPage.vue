<!--
  邮件凭据页面 — 单独管理 Resend API Key
  对应 config 表 key: mail.service.resend
  注意：API Key 是敏感凭据，后端会脱敏返回 ****** 占位符；
  保存时若字段仍为 ****** 占位符则跳过该字段，以保留后端原值
-->
<template>
    <n-card title="邮件服务凭据">
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
            <n-alert type="warning" :show-icon="true" class="mb-4">
                <template #header>安全提示</template>
                修改后将立即生效。API Key 字段若为占位符 <code>******</code>
                则视为未修改，保存时不会覆盖后端原值。
            </n-alert>

            <n-form-item
                label="Resend API Key"
                path="apiKey"
                feedback="在 Resend 控制台 (https://resend.com/api-keys) 创建的 API Key"
            >
                <n-input
                    v-model:value="form.apiKey"
                    type="password"
                    show-password-on="click"
                    placeholder="请输入 Resend API Key (re_xxx...)"
                    clearable
                />
            </n-form-item>

            <n-form-item label=" ">
                <n-button type="primary" :loading="isSaving" @click="onSave"> 保存凭据 </n-button>
            </n-form-item>
        </n-form>
    </n-card>
</template>

<script setup lang="ts">
/**
 * MailCredentialPage 组件
 *
 * 单独管理 Resend 邮件服务的 API Key 敏感凭据
 * 业务参数（驱动 / 发件人 / 模板 / 限流）请到 MailServicePage 配置
 */
import { ref, reactive, onMounted } from 'vue';
import { useMessage } from 'naive-ui';
import type { FormInst, FormRules } from 'naive-ui';
import { getPrivateConfigs, batchUpdateConfigs } from '@/api/configs';

defineOptions({ name: 'ConfigMailCredential' });

const message = useMessage();
const formRef = ref<FormInst | null>(null);
const isSaving = ref(false);
const isLoading = ref(true);

/** 后端对密钥字段统一脱敏（仅占位符返回），用于判断"未修改" */
const MASK_PLACEHOLDER = '******';

/** 表单状态：Resend API Key */
const form = reactive({
    apiKey: '',
});

/** 校验规则：脱敏占位符视为合法 */
const rules: FormRules = {
    apiKey: {
        validator: (_rule, value) => {
            if (!value || value === MASK_PLACEHOLDER) return true;
            return true;
        },
        trigger: 'blur',
    },
};

/**
 * 保存处理：密钥脱敏
 *
 * 关键逻辑：
 *   1. 如果用户没动 apiKey 字段（仍是后端返回的 ****** 占位符），
 *      保存时**不传**该字段，让后端保留原值；
 *   2. 如果用户输入了新值，原样保存覆盖。
 */
async function onSave() {
    try {
        await formRef.value?.validate();
    } catch {
        return;
    }
    isSaving.value = true;
    try {
        const payload: Record<string, string> = {};

        // 仍是 ****** 占位符 → 视为未修改，不传
        if (form.apiKey && form.apiKey !== MASK_PLACEHOLDER) {
            payload.apiKey = form.apiKey;
        }

        await batchUpdateConfigs([
            {
                key: 'mail.service.resend',
                value: payload,
            },
        ]);
        message.success('邮件凭据已保存');
    } catch {
        message.error('保存失败，请重试');
    } finally {
        isSaving.value = false;
    }
}

/**
 * 初始化：从后端拉取 mail.service.resend 配置
 * 注意：后端对 apiKey 字段统一脱敏，前端拿到的是 ****** 占位符
 */
onMounted(async () => {
    try {
        const configs = await getPrivateConfigs();
        const item = configs.find((c) => c.key === 'mail.service.resend');
        if (item) {
            const v = item.value;
            form.apiKey = (v.apiKey as string) || '';
        }
    } catch {
        message.error('加载配置失败，请刷新页面');
    } finally {
        isLoading.value = false;
    }
});
</script>
