<!--
  LoginPage — 会员手机号 + 短信验证码登录页
  使用 Naive UI 表单组件，包含：
    - 手机号输入框（11 位手机号校验）
    - 发送验证码按钮（60 秒倒计时）
    - 验证码输入框（6 位数字）
    - Cloudflare Turnstile 人机验证
    - 登录按钮
  登录成功后跳转到 redirect 参数指定的页面或首页
  文案硬编码中文（CLAUDE.md 明确禁止 i18n）
-->
<template>
    <n-card title="手机号登录" class="shadow-lg" bordered>
        <n-form
            ref="formRef"
            :model="formData"
            :rules="formRules"
            label-placement="top"
            @keydown.enter.prevent="onLogin"
        >
            <!-- 手机号输入 -->
            <n-form-item label="手机号" path="phone">
                <n-input v-model:value="formData.phone" placeholder="请输入手机号" maxlength="11" clearable />
            </n-form-item>

            <!-- 验证码输入 + 发送按钮 -->
            <n-form-item label="验证码" path="code">
                <div class="flex gap-2 w-full">
                    <!-- 验证码输入框：clearable 让用户能一键清空重新输入 -->
                    <n-input
                        v-model:value="formData.code"
                        placeholder="请输入验证码"
                        maxlength="6"
                        class="flex-1"
                        clearable
                    />
                    <n-button :disabled="countdown > 0 || !isPhoneValid" :loading="isSending" @click="onSendCode">
                        {{ sendButtonText }}
                    </n-button>
                </div>
            </n-form-item>

            <!-- Cloudflare Turnstile 人机验证（仅当配置了 siteKey 才渲染） -->
            <n-form-item v-if="turnstileSiteKey" label="人机验证" :show-feedback="false">
                <TurnstileWidget :site-key="turnstileSiteKey" @token="onTurnstileToken" />
            </n-form-item>

            <!-- 登录按钮 -->
            <n-button type="primary" block :loading="isLoading" :disabled="isLoading" class="mt-2" @click="onLogin">
                登录
            </n-button>
        </n-form>
    </n-card>
</template>

<script setup lang="ts">
/**
 * LoginPage 组件逻辑
 *
 * 功能：
 *   - 手机号格式校验（11 位数字，1 开头）
 *   - 发送短信验证码（60 秒倒计时防刷）
 *   - Cloudflare Turnstile 人机验证
 *   - 短信验证码登录
 *   - 登录成功后跳转到 redirect 参数指定的页面或首页
 *
 * Turnstile 配置来源（按优先级）：
 *   1. system_config.turnstile.config（运行时从后端 publicConfigs 拿，**已脱敏 secretKey**）
 *      - enabled=true + siteKey 有值 → 渲染 widget + 登录请求带 turnstileToken
 *      - enabled=false / 无 siteKey → 不渲染 widget + 登录请求不带 token
 *   2. VITE_TURNSTILE_SITE_KEY 环境变量（dev 兜底，publicConfigs 加载失败时使用）
 *
 * 注意：
 *   - Turnstile token 通过 @token 事件获取，存到 turnstileToken
 *   - 后端 MemberSmsSendSchema / MemberSmsLoginSchema.turnstileToken 是 optional
 */
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import type { FormInst, FormRules } from 'naive-ui';
import { useMessage } from '@/shared/composables/useMessage';
import { useAuthStore } from './store';
import TurnstileWidget from '@/shared/components/TurnstileWidget.vue';

const router = useRouter();
const route = useRoute();
const { message } = useMessage();
const authStore = useAuthStore();

/**
 * Turnstile Site Key — 运行时配置优先，未拿到时降级读环境变量
 * - 从 /api/graphql publicConfigs 拿 system_config.turnstile.config（**已脱敏 secretKey**）
 * - 公开配置包含 enabled + siteKey 字段
 */
const turnstileSiteKey = ref<string>(import.meta.env.VITE_TURNSTILE_SITE_KEY || '');

onMounted(async () => {
    /**
     * 拉取公开配置（公开白名单内的 key，无需鉴权）
     * - 公开白名单当前含 settings + turnstile.config（turnstile.config 在 findPublic 中已脱敏 secretKey）
     * - 拉取失败时降级使用 VITE_TURNSTILE_SITE_KEY 环境变量
     */
    try {
        const query = `
            query PublicConfigs {
                publicConfigs {
                    key
                    value
                }
            }
        `;
        const res = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ query }),
        });
        if (!res.ok) return; // 拉取失败时保留 env 兜底值
        const json = (await res.json()) as { data?: { publicConfigs?: Array<{ key: string; value: unknown }> } };
        const configs = json.data?.publicConfigs ?? [];
        const turnstileConfig = configs.find((c) => c.key === 'turnstile.config');
        if (turnstileConfig && typeof turnstileConfig.value === 'object' && turnstileConfig.value !== null) {
            const v = turnstileConfig.value as { enabled?: boolean; siteKey?: string };
            if (v.enabled === true && typeof v.siteKey === 'string' && v.siteKey.length > 0) {
                // 后端明确启用了 Turnstile → 用后端的 siteKey 覆盖环境变量
                turnstileSiteKey.value = v.siteKey;
            } else {
                // 显式关闭 / 缺 siteKey → 不渲染 widget（即使环境变量有值）
                turnstileSiteKey.value = '';
            }
        }
    } catch {
        // 拉取失败 → 保留 env 兜底值
    }
});

/** 当前 Turnstile 验证 token（用户完成验证后由 Widget 通过 @token 事件写入） */
const turnstileToken = ref<string>('');

/**
 * TurnstileWidget 的 @token 事件回调
 * 验证成功 → 写入 token；失败 / 过期 → 清空
 */
function onTurnstileToken(token: string) {
    turnstileToken.value = token;
}

// ---- 表单相关 ----

/** 表单引用 */
const formRef = ref<FormInst | null>(null);

/** 是否正在登录 */
const isLoading = ref(false);

/** 是否正在发送验证码 */
const isSending = ref(false);

/** 倒计时秒数（0 表示可以发送） */
const countdown = ref(0);

/** 倒计时定时器 */
let countdownTimer: ReturnType<typeof setInterval> | null = null;

/** 表单数据 */
const formData = reactive({
    phone: '',
    code: '',
});

/** 手机号格式校验正则（1 开头的 11 位数字） */
const PHONE_REGEX = /^1[3-9]\d{9}$/;

/** 手机号是否有效 */
const isPhoneValid = computed(() => PHONE_REGEX.test(formData.phone));

/** 发送按钮文字 */
const sendButtonText = computed(() => {
    if (countdown.value > 0) {
        return `${countdown.value}s 后重发`;
    }
    return '发送验证码';
});

/** 表单校验规则 */
const formRules: FormRules = {
    phone: [
        { required: true, message: '请输入手机号', trigger: 'blur' },
        {
            validator: (_rule, value) => {
                if (value && !PHONE_REGEX.test(value)) {
                    return new Error('请输入正确的手机号');
                }
                return true;
            },
            trigger: 'blur',
        },
    ],
    code: [
        { required: true, message: '请输入验证码', trigger: 'blur' },
        {
            validator: (_rule, value) => {
                if (value && !/^\d{6}$/.test(value)) {
                    return new Error('验证码为6位数字');
                }
                return true;
            },
            trigger: 'blur',
        },
    ],
};

// ---- 发送验证码 ----

/**
 * 开始倒计时
 *
 * @param seconds 倒计时秒数（默认 60）
 */
function startCountdown(seconds: number = 60) {
    countdown.value = seconds;
    countdownTimer = setInterval(() => {
        countdown.value--;
        if (countdown.value <= 0) {
            stopCountdown();
        }
    }, 1000);
}

/** 停止倒计时 */
function stopCountdown() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    countdown.value = 0;
}

/** 发送验证码处理 */
async function onSendCode() {
    // 校验手机号
    if (!isPhoneValid.value) {
        message.warning('请输入正确的手机号');
        return;
    }

    isSending.value = true;
    try {
        // turnstileToken 可选：有就传，没有就传 undefined
        await authStore.sendSmsCode(formData.phone, 'login', turnstileToken.value || undefined);
        message.success('验证码已发送');
        startCountdown();
    } catch (err) {
        message.error((err as Error).message || '发送验证码失败');
    } finally {
        isSending.value = false;
    }
}

// ---- 登录 ----

/** 登录处理 */
async function onLogin() {
    // 先做表单校验
    try {
        await formRef.value?.validate();
    } catch {
        return;
    }

    isLoading.value = true;
    try {
        await authStore.login(formData.phone, formData.code, turnstileToken.value || undefined);
        message.success('登录成功');

        // 登录成功后跳转：优先跳转到 redirect 参数指定的页面，否则跳转首页
        const redirect = (route.query.redirect as string) || '/';
        router.push(redirect);
    } catch (err) {
        message.error((err as Error).message || '登录失败，请重试');
    } finally {
        isLoading.value = false;
    }
}

// 组件卸载时清除倒计时定时器
onUnmounted(() => {
    stopCountdown();
});
</script>
