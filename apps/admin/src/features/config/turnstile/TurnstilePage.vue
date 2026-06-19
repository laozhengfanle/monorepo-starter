<!--
  Turnstile 配置页面 — 管理 Cloudflare Turnstile 人机验证参数
  数据源：GraphQL config 表 key: turnstile.config（注意：旧 key 'turnstile' / 'turnstile.enabled' 已废弃）
  字段：enabled / siteKey（前端使用）/ secretKey（后端验证使用）
-->
<template>
    <n-card title="Turnstile 配置">
        <n-spin :show="isLoading">
            <n-form
                ref="formRef"
                :model="form"
                :rules="rules"
                label-placement="left"
                label-width="10rem"
                class="max-w-2xl"
            >
                <n-alert type="info" :show-icon="true" class="mb-4">
                    <template #header>即时生效</template>
                    修改 siteKey / secretKey 后立即生效，无需重启服务。
                </n-alert>

                <n-form-item label="启用" path="enabled" feedback="开启后登录页将显示 Turnstile 人机验证">
                    <n-switch v-model:value="form.enabled">
                        <template #checked>开启</template>
                        <template #unchecked>关闭</template>
                    </n-switch>
                </n-form-item>

                <n-form-item
                    label="站点密钥 (Site Key)"
                    path="siteKey"
                    feedback="Cloudflare Turnstile 的 Site Key，前端使用（公开可见）"
                >
                    <n-input v-model:value="form.siteKey" placeholder="例如：1x00000000000000000000AA" clearable />
                </n-form-item>

                <n-form-item
                    label="密钥 (Secret Key)"
                    path="secretKey"
                    feedback="Cloudflare Turnstile 的 Secret Key，后端验证使用（加密存储）"
                >
                    <n-input
                        v-model:value="form.secretKey"
                        type="password"
                        show-password-on="click"
                        placeholder="请输入 Secret Key"
                        clearable
                    />
                </n-form-item>

                <n-form-item label=" ">
                    <n-button type="primary" :loading="isSaving" @click="onSave"> 保存设置 </n-button>
                </n-form-item>
            </n-form>
        </n-spin>
    </n-card>
</template>

<script setup lang="ts">
/**
 * TurnstilePage 组件
 *
 * 配置 Cloudflare Turnstile 人机验证的启用开关 / siteKey / secretKey
 * 注意：旧 key 'turnstile' 和 'turnstile.enabled' 已在 Phase 8 中废弃，
 * 现统一使用 key 'turnstile.config'
 */
import { ref, reactive, onMounted } from 'vue';
import { useMessage } from 'naive-ui';
import type { FormInst, FormRules } from 'naive-ui';
import { getPrivateConfigs, batchUpdateConfigs } from '@/api/configs';

defineOptions({ name: 'ConfigTurnstile' });

const message = useMessage();
const formRef = ref<FormInst | null>(null);
const isSaving = ref(false);
const isLoading = ref(true);

/** 后端对密钥字段统一脱敏（仅占位符返回） */
const MASK_PLACEHOLDER = '******';

/** Cloudflare Turnstile 官方测试密钥（始终通过验证） */
const TEST_SITE_KEY = '1x00000000000000000000AA';
const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

/** 表单数据：精简为 3 个字段（移除旧版 mode/timeout/appearance） */
const form = reactive({
    enabled: false,
    siteKey: TEST_SITE_KEY,
    secretKey: TEST_SECRET_KEY,
});

/** 校验规则 */
const rules: FormRules = {
    siteKey: {
        required: true,
        message: '请输入站点密钥 (Site Key)',
        trigger: 'blur',
    },
    // secretKey 无前端校验：脱敏占位符 ****** 视为合法（未修改），
    // 新输入的值由后端 Cloudflare siteverify 实际校验有效性
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
        const payload: Record<string, string | boolean> = {
            enabled: form.enabled,
            siteKey: form.siteKey,
        };
        // secretKey 仍是 ****** 占位符 → 视为未修改，不传
        if (form.secretKey && form.secretKey !== MASK_PLACEHOLDER) {
            payload.secretKey = form.secretKey;
        }
        await batchUpdateConfigs([
            {
                key: 'turnstile.config',
                value: payload,
            },
        ]);
        message.success('Turnstile 配置已保存');
    } catch {
        message.error('保存失败，请重试');
    } finally {
        isSaving.value = false;
    }
}

/** 初始化：从后端拉取 turnstile.config 配置 */
onMounted(async () => {
    try {
        const configs = await getPrivateConfigs();
        const item = configs.find((c) => c.key === 'turnstile.config');
        if (item) {
            const v = item.value;
            form.enabled = (v.enabled as boolean) ?? false;
            form.siteKey = (v.siteKey as string) || '';
            form.secretKey = (v.secretKey as string) || '';
        }
    } catch {
        message.error('加载配置失败，请刷新页面');
    } finally {
        isLoading.value = false;
    }
});
</script>
