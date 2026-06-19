<!--
  OAuth 配置页面 — 管理 3 个第三方登录平台
  平台：微信开放平台 (wechat-web) / 微信公众号 (wechat-mp) / 微信小程序 (wechat-miniprogram)
  数据源：GraphQL config 表 key: oauth.providers
  注意：3 个 tab 共用一个 form 状态对象，保存时整组提交
-->
<template>
    <n-card title="OAuth 配置">
        <n-spin :show="isLoading">
            <n-tabs v-model:value="activeTab" type="card">
                <!-- Tab 1: 微信开放平台（扫码登录网站） -->
                <n-tab-pane name="wechat-web" tab="微信开放平台">
                    <n-form
                        :model="providers['wechat-web']"
                        label-placement="left"
                        label-width="10rem"
                        class="max-w-2xl mt-4"
                    >
                        <n-form-item label="启用" path="enabled">
                            <n-switch v-model:value="providers['wechat-web'].enabled">
                                <template #checked>开启</template>
                                <template #unchecked>关闭</template>
                            </n-switch>
                        </n-form-item>
                        <n-form-item label="App ID" path="appId" feedback="微信开放平台的 App ID">
                            <n-input
                                v-model:value="providers['wechat-web'].appId"
                                placeholder="请输入 App ID"
                                clearable
                            />
                        </n-form-item>
                        <n-form-item label="App Secret" path="appSecret" feedback="微信开放平台的 App Secret，加密存储">
                            <n-input
                                v-model:value="providers['wechat-web'].appSecret"
                                type="password"
                                show-password-on="click"
                                placeholder="请输入 App Secret"
                                clearable
                            />
                        </n-form-item>
                        <n-form-item
                            label="回调地址"
                            path="redirectUri"
                            feedback="微信开放平台配置的回调域名（不包含路径）"
                        >
                            <n-input
                                v-model:value="providers['wechat-web'].redirectUri"
                                placeholder="例如：https://example.com"
                                clearable
                            />
                        </n-form-item>
                    </n-form>
                </n-tab-pane>

                <!-- Tab 2: 微信公众号（h5 网页授权） -->
                <n-tab-pane name="wechat-mp" tab="微信公众号">
                    <n-form
                        :model="providers['wechat-mp']"
                        label-placement="left"
                        label-width="10rem"
                        class="max-w-2xl mt-4"
                    >
                        <n-form-item label="启用" path="enabled">
                            <n-switch v-model:value="providers['wechat-mp'].enabled">
                                <template #checked>开启</template>
                                <template #unchecked>关闭</template>
                            </n-switch>
                        </n-form-item>
                        <n-form-item label="App ID" path="appId" feedback="微信公众号的 App ID">
                            <n-input
                                v-model:value="providers['wechat-mp'].appId"
                                placeholder="请输入 App ID"
                                clearable
                            />
                        </n-form-item>
                        <n-form-item label="App Secret" path="appSecret" feedback="微信公众号的 App Secret，加密存储">
                            <n-input
                                v-model:value="providers['wechat-mp'].appSecret"
                                type="password"
                                show-password-on="click"
                                placeholder="请输入 App Secret"
                                clearable
                            />
                        </n-form-item>
                    </n-form>
                </n-tab-pane>

                <!-- Tab 3: 微信小程序 -->
                <n-tab-pane name="wechat-miniprogram" tab="微信小程序">
                    <n-form
                        :model="providers['wechat-miniprogram']"
                        label-placement="left"
                        label-width="10rem"
                        class="max-w-2xl mt-4"
                    >
                        <n-form-item label="启用" path="enabled">
                            <n-switch v-model:value="providers['wechat-miniprogram'].enabled">
                                <template #checked>开启</template>
                                <template #unchecked>关闭</template>
                            </n-switch>
                        </n-form-item>
                        <n-form-item label="App ID" path="appId" feedback="微信小程序的 App ID">
                            <n-input
                                v-model:value="providers['wechat-miniprogram'].appId"
                                placeholder="请输入 App ID"
                                clearable
                            />
                        </n-form-item>
                        <n-form-item label="App Secret" path="appSecret" feedback="微信小程序的 App Secret，加密存储">
                            <n-input
                                v-model:value="providers['wechat-miniprogram'].appSecret"
                                type="password"
                                show-password-on="click"
                                placeholder="请输入 App Secret"
                                clearable
                            />
                        </n-form-item>
                    </n-form>
                </n-tab-pane>
            </n-tabs>

            <div class="max-w-2xl mt-4 ml-40">
                <n-button type="primary" :loading="isSaving" @click="onSave"> 保存设置 </n-button>
            </div>
        </n-spin>
    </n-card>
</template>

<script setup lang="ts">
/**
 * OauthPage 组件
 *
 * 配置 3 个 OAuth 第三方登录平台：
 *   - wechat-web          微信开放平台（PC 扫码登录网站）
 *   - wechat-mp           微信公众号（H5 网页授权）
 *   - wechat-miniprogram  微信小程序
 *
 * 设计要点：
 *   - 3 个 tab 共用一个 form 状态对象 providers，保存时整组提交
 *   - 密钥字段（appSecret）若仍是 ****** 占位符，
 *     保存时不传该字段以保留后端原值
 */
import { ref, reactive, onMounted } from 'vue';
import { useMessage } from '@/shared/composables/useMessage';
import { getPrivateConfigs, batchUpdateConfigs } from '@/api/configs';

defineOptions({ name: 'SystemOAuthPage' });

const { message } = useMessage();
const isSaving = ref(false);
const isLoading = ref(true);
const activeTab = ref('wechat-web');

/** 后端对密钥字段统一脱敏（仅占位符返回） */
const MASK_PLACEHOLDER = '******';

/** 3 个平台的统一状态对象 */
const providers = reactive({
    'wechat-web': {
        enabled: false,
        appId: '',
        appSecret: '',
        redirectUri: '',
    },
    'wechat-mp': {
        enabled: false,
        appId: '',
        appSecret: '',
    },
    'wechat-miniprogram': {
        enabled: false,
        appId: '',
        appSecret: '',
    },
});

/**
 * 清洗 appSecret 字段：仍是 ****** 占位符视为未修改，置空不传
 * 避免覆盖后端真实密钥
 */
function pickAppSecret(value: string): string | undefined {
    if (!value || value === MASK_PLACEHOLDER) return undefined;
    return value;
}

/** 保存处理：整组提交 oauth.providers */
async function onSave() {
    isSaving.value = true;
    try {
        // 微信开放平台
        const wechatWeb = {
            enabled: providers['wechat-web'].enabled,
            appId: providers['wechat-web'].appId,
            redirectUri: providers['wechat-web'].redirectUri,
        };
        const ws = pickAppSecret(providers['wechat-web'].appSecret);
        if (ws !== undefined) {
            (wechatWeb as unknown as Record<string, string>).appSecret = ws;
        }

        // 微信公众号
        const wechatMp = {
            enabled: providers['wechat-mp'].enabled,
            appId: providers['wechat-mp'].appId,
        };
        const ms = pickAppSecret(providers['wechat-mp'].appSecret);
        if (ms !== undefined) {
            (wechatMp as unknown as Record<string, string>).appSecret = ms;
        }

        // 微信小程序
        const wechatMiniprogram = {
            enabled: providers['wechat-miniprogram'].enabled,
            appId: providers['wechat-miniprogram'].appId,
        };
        const xps = pickAppSecret(providers['wechat-miniprogram'].appSecret);
        if (xps !== undefined) {
            (wechatMiniprogram as unknown as Record<string, string>).appSecret = xps;
        }

        await batchUpdateConfigs([
            {
                key: 'oauth.providers',
                value: {
                    'wechat-web': wechatWeb,
                    'wechat-mp': wechatMp,
                    'wechat-miniprogram': wechatMiniprogram,
                },
            },
        ]);
        message.success('OAuth 配置已保存');
    } catch {
        message.error('保存失败，请重试');
    } finally {
        isSaving.value = false;
    }
}

/** 初始化：从后端拉取 oauth.providers 配置 */
onMounted(async () => {
    try {
        const configs = await getPrivateConfigs();
        const item = configs.find((c) => c.key === 'oauth.providers');
        if (item) {
            const v = item.value;
            // 微信开放平台
            const wc = (v['wechat-web'] as Record<string, unknown>) || {};
            providers['wechat-web'].enabled = (wc.enabled as boolean) ?? false;
            providers['wechat-web'].appId = (wc.appId as string) || '';
            providers['wechat-web'].appSecret = (wc.appSecret as string) || '';
            providers['wechat-web'].redirectUri = (wc.redirectUri as string) || '';
            // 微信公众号
            const mp = (v['wechat-mp'] as Record<string, unknown>) || {};
            providers['wechat-mp'].enabled = (mp.enabled as boolean) ?? false;
            providers['wechat-mp'].appId = (mp.appId as string) || '';
            providers['wechat-mp'].appSecret = (mp.appSecret as string) || '';
            // 微信小程序
            const xcx = (v['wechat-miniprogram'] as Record<string, unknown>) || {};
            providers['wechat-miniprogram'].enabled = (xcx.enabled as boolean) ?? false;
            providers['wechat-miniprogram'].appId = (xcx.appId as string) || '';
            providers['wechat-miniprogram'].appSecret = (xcx.appSecret as string) || '';
        }
    } catch {
        message.error('加载配置失败，请刷新页面');
    } finally {
        isLoading.value = false;
    }
});
</script>
