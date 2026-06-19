<!--
  短信凭据页面 — 单独管理阿里云 AccessKeyId / AccessKeySecret
  对应 config 表 key: sms.provider.aliyun
  注意：密钥字段会脱敏显示（后端返回 ****** 占位符），
  保存时若字段仍为 ****** 占位符则跳过该字段，以保留后端原值
-->
<template>
    <n-card title="短信服务商凭据">
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
                修改后将立即生效。密钥字段若为占位符 <code>******</code>
                则视为未修改，保存时不会覆盖后端原值。
            </n-alert>

            <n-form-item label="AccessKey ID" path="accessKeyId" feedback="阿里云 RAM 账号的 AccessKey ID">
                <n-input v-model:value="form.accessKeyId" placeholder="请输入 AccessKey ID" clearable />
            </n-form-item>

            <n-form-item label="AccessKey Secret" path="accessKeySecret" feedback="AccessKey ID 对应的密钥，加密存储">
                <n-input
                    v-model:value="form.accessKeySecret"
                    type="password"
                    show-password-on="click"
                    placeholder="请输入 AccessKey Secret"
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
 * SmsCredentialPage 组件
 *
 * 单独管理阿里云短信的 AccessKeyId / AccessKeySecret 敏感凭据
 * 业务参数（驱动 / 模板 / 限流等）请到 SmsProviderPage 配置
 */
import { ref, reactive, onMounted } from 'vue';
import { useMessage } from 'naive-ui';
import type { FormInst, FormRules } from 'naive-ui';
import { getPrivateConfigs, batchUpdateConfigs } from '@/api/configs';

defineOptions({ name: 'ConfigSmsCredential' });

const message = useMessage();
const formRef = ref<FormInst | null>(null);
const isSaving = ref(false);
const isLoading = ref(true);

/** 后端对密钥字段统一脱敏（仅占位符返回），用于判断"未修改" */
const MASK_PLACEHOLDER = '******';

/** 表单状态：阿里云 SMS 凭据 */
const form = reactive({
    accessKeyId: '',
    accessKeySecret: '',
});

/** 校验规则：仅在用户填了实际值（非占位符）时才校验非空 */
const rules: FormRules = {
    accessKeyId: {
        validator: (_rule, value) => {
            // 值为空且不是占位符 → 允许（首次保存时可能为空）
            if (!value || value === MASK_PLACEHOLDER) return true;
            return true;
        },
        trigger: 'blur',
    },
    accessKeySecret: {
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
 *   1. 如果用户没动 secretKey 字段（仍是后端返回的 ****** 占位符），
 *      保存时**不传**该字段，让后端保留原值；
 *   2. 如果用户输入了新值，原样保存覆盖。
 *   这样可以避免"未修改的密钥被空字符串覆盖"或"被误清空"。
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

        // accessKeyId 不是密钥，明文存储即可，未填时跳过
        if (form.accessKeyId) {
            payload.accessKeyId = form.accessKeyId;
        }
        // accessKeySecret 是密钥：
        //   1. 仍是 ****** 占位符 → 视为未修改，不传该字段
        //   2. 填了新值 → 原样覆盖
        if (form.accessKeySecret && form.accessKeySecret !== MASK_PLACEHOLDER) {
            payload.accessKeySecret = form.accessKeySecret;
        }

        await batchUpdateConfigs([
            {
                key: 'sms.provider.aliyun',
                value: payload,
            },
        ]);
        message.success('短信凭据已保存');
    } catch {
        message.error('保存失败，请重试');
    } finally {
        isSaving.value = false;
    }
}

/**
 * 初始化：从后端拉取 sms.provider.aliyun 配置
 * 注意：后端对密钥字段统一脱敏，前端拿到的是 ****** 占位符
 */
onMounted(async () => {
    try {
        const configs = await getPrivateConfigs();
        const item = configs.find((c) => c.key === 'sms.provider.aliyun');
        if (item) {
            const v = item.value;
            form.accessKeyId = (v.accessKeyId as string) || '';
            form.accessKeySecret = (v.accessKeySecret as string) || '';
        }
    } catch {
        message.error('加载配置失败，请刷新页面');
    } finally {
        isLoading.value = false;
    }
});
</script>
