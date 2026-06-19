<template>
    <div
        class="login-page relative z-10 flex flex-col flex-1"
        :data-theme="resolvedTheme === darkTheme ? 'dark' : 'light'"
        :style="{ '--primary-color': primaryColor }"
    >
        <!-- 背景装饰层 -->
        <div ref="bgRef" class="bg-decoration">
            <!-- 模糊光斑：data-parallax 越大，鼠标移动时偏移越大 -->
            <div class="bg-blob bg-blob--1" data-parallax="0.03"></div>
            <div class="bg-blob bg-blob--2" data-parallax="0.05"></div>
            <div class="bg-blob bg-blob--3" data-parallax="0.04"></div>
            <!-- 旋转圆环 -->
            <div class="bg-ring bg-ring--1" data-parallax="0.02"></div>
            <div class="bg-ring bg-ring--2" data-parallax="0.03"></div>
            <div class="bg-ring bg-ring--3" data-parallax="0.02"></div>
            <!-- 菱形装饰 -->
            <div class="bg-diamond bg-diamond--1" data-parallax="0.04"></div>
            <div class="bg-diamond bg-diamond--2" data-parallax="0.06"></div>
            <!-- 几何色块 -->
            <div class="bg-geo bg-geo--1" data-parallax="0.05"></div>
            <div class="bg-geo bg-geo--2" data-parallax="0.07"></div>
            <div class="bg-geo bg-geo--3" data-parallax="0.04"></div>
            <div class="bg-geo bg-geo--4" data-parallax="0.06"></div>
        </div>
        <!-- 对角斜线 -->
        <div class="bg-stripes"></div>
        <!-- 网格点阵 -->
        <div class="bg-dots"></div>

        <!-- 登录卡片居中：小屏缩小边距给验证码腾空间 -->
        <div class="flex-1 flex items-center justify-center p-1 sm:p-(--gap)">
            <n-card class="max-w-[400px] py-4 sm:py-10 px-1.5 sm:px-4" bordered>
                <!-- 品牌信息 -->
                <div class="text-center mb-8">
                    <img src="/hero.png" alt="Naive Admin 企业级开发底座" class="w-15 h-15 mx-auto" />
                    <h1 class="text-[22px] font-semibold mt-2">登录</h1>
                    <p class="text-sm font-light mt-1" :style="{ color: tv.textColor3 }">企业级全栈基座</p>
                </div>

                <!-- 登录表单 -->
                <n-form
                    ref="formRef"
                    :model="formData"
                    :rules="formRules"
                    label-placement="top"
                    @keydown.enter.prevent="onLogin"
                >
                    <!-- 用户名 -->
                    <n-form-item label="用户名" path="username">
                        <n-input
                            v-model:value="formData.username"
                            placeholder="请输入用户名"
                            autocomplete="username"
                            clearable
                        >
                            <template #prefix>
                                <n-icon :component="Person12Regular" />
                            </template>
                        </n-input>
                    </n-form-item>

                    <!-- 密码 -->
                    <n-form-item label="密码" path="password">
                        <n-input
                            v-model:value="formData.password"
                            type="password"
                            show-password-on="click"
                            placeholder="请输入密码"
                            autocomplete="current-password"
                            clearable
                        >
                            <template #prefix>
                                <n-icon :component="LockClosed32Regular" />
                            </template>
                        </n-input>
                    </n-form-item>

                    <!-- 验证码区域：后台关闭 Turnstile 时整个区块不渲染 -->
                    <n-form-item
                        v-if="turnstileEnabled"
                        label="告诉我们您是人类"
                        :label-style="{
                            fontSize: '12px',
                            color: tv.textColor3,
                        }"
                    >
                        <!-- Turnstile 挂载点放正常流中，让 flexible 模式正确感知容器宽度 -->
                        <div class="w-full h-[65px] relative rounded-[4px] bg-gray-100 dark:bg-[rgba(255,255,255,0.1)]">
                            <div id="turnstile-container"></div>
                            <!-- 加载 / 超时遮罩：绝对定位覆盖在 Turnstile 上方 -->
                            <div
                                v-if="captchaState !== 'ready'"
                                class="absolute inset-0 z-1 flex items-center justify-center bg-gray-100 dark:bg-[rgba(255,255,255,0.1)]"
                            >
                                <template v-if="captchaState === 'loading'">
                                    <n-spin
                                        size="small"
                                        :scale="0.6"
                                        :stroke-width="20"
                                        class="flex-row! align-center!"
                                    >
                                        <template #description>
                                            <p class="relative mt-[-8px] text-xs" :style="{ color: tv.textColor2 }">
                                                验证码加载中...
                                            </p>
                                        </template>
                                    </n-spin>
                                </template>

                                <template v-else-if="captchaState === 'timeout'">
                                    <div class="flex flex-col items-center gap-1">
                                        <p class="text-xs" :style="{ color: tv.textColor2 }">验证码加载超时</p>
                                        <n-button size="tiny" text type="primary" @click="reloadCaptcha">
                                            点击重试
                                        </n-button>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </n-form-item>

                    <!-- 登录按钮：验证码启用但未就绪时禁用，防止 widget 未渲染完成就提交导致 20007 -->
                    <n-button
                        type="primary"
                        block
                        :loading="isLoading"
                        :disabled="isLoading || (turnstileEnabled && captchaState !== 'ready')"
                        @click="onLogin"
                    >
                        {{ '登录' }}
                    </n-button>
                </n-form>
            </n-card>
        </div>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'LoginPage' });
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Person12Regular, LockClosed32Regular } from '@vicons/fluent';
import type { FormInst, FormRules } from 'naive-ui';
import { darkTheme } from 'naive-ui';
import { useMessage } from '@/shared/composables/useMessage';
import { useTurnstile } from '@/shared/composables/useTurnstile';
import { useSettingsStore } from '@/shared/stores/settings';
import { useConfigStore } from '@/shared/stores/config';
import { useAdminStore } from '@/shared/stores/admin';
import { storeToRefs } from 'pinia';
import { useThemeVars } from 'naive-ui';

const tv = useThemeVars();
const { message } = useMessage();

/**
 * Turnstile 运行时配置
 * - 从 useConfigStore 拿 system_config.turnstile.config（已脱敏 secretKey）
 * - enabled=true + siteKey 有值 → 渲染 widget + 登录请求带 turnstileToken
 * - enabled=false 或 siteKey 空 → 不渲染 widget + 登录请求不带 token
 * - useConfigStore 在 main.ts 启动时已通过 getPublicConfigs 加载，无需 LoginPage 再请求
 */
const configStore = useConfigStore();

/** 是否启用 Turnstile 验证码（后台关闭时整个区块不渲染） */
const turnstileEnabled = configStore.turnstileConfig.enabled && !!configStore.turnstileConfig.siteKey;

const { loadScript, render, getToken, reset, destroy } = useTurnstile({
    siteKey: turnstileEnabled ? configStore.turnstileConfig.siteKey : '',
});

const settings = useSettingsStore();
const { resolvedTheme, primaryColor } = storeToRefs(settings);

// ---- Turnstile 始终用 flexible（宽度自适应容器，最小 300px），正常流布局确保容器宽度正确传递 ----

// ---- 验证码加载状态：loading → ready / timeout ----
const CAPTCHA_TIMEOUT_MS = 10_000;
type CaptchaState = 'loading' | 'ready' | 'timeout';
const captchaState = ref<CaptchaState>('loading');
let captchaTimer: ReturnType<typeof setTimeout> | null = null;

function startCaptchaTimeout() {
    clearCaptchaTimer();
    captchaState.value = 'loading';
    captchaTimer = setTimeout(() => {
        if (captchaState.value === 'loading') {
            captchaState.value = 'timeout';
        }
    }, CAPTCHA_TIMEOUT_MS);
}

function clearCaptchaTimer() {
    if (captchaTimer !== null) {
        clearTimeout(captchaTimer);
        captchaTimer = null;
    }
}

async function loadAndRenderCaptcha() {
    // 后台关闭验证码时不加载脚本
    if (!turnstileEnabled) return;

    startCaptchaTimeout();
    await loadScript();
    if (captchaState.value === 'timeout') return;
    clearCaptchaTimer();
    captchaState.value = 'ready';
    render('turnstile-container', resolvedTheme.value === darkTheme);
}

function reloadCaptcha() {
    reset();
    loadAndRenderCaptcha();
}

onMounted(() => {
    loadAndRenderCaptcha();
});

onUnmounted(() => {
    clearCaptchaTimer();
    // 销毁 Turnstile widget，避免幽灵 iframe 继续发送 postMessage
    destroy();
});

// 主题切换时自动重渲染 Turnstile（暗黑 / 亮色）
watch(resolvedTheme, (theme) => {
    if (captchaState.value === 'ready') {
        render('turnstile-container', theme === darkTheme);
    }
});

const router = useRouter();
const route = useRoute();
const adminStore = useAdminStore();

// 背景装饰层引用
const bgRef = ref<HTMLElement | null>(null);

// 鼠标视差：鼠标移动时，装饰元素根据 data-parallax 系数产生不同幅度的偏移
// 使用 rAF 节流，将 mousemove 回调收敛到每帧一次，避免高频事件导致不必要的样式重算
let rafId: number | null = null;
function onMouseMove(e: MouseEvent) {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!bgRef.value) return;
        // 鼠标相对视口中心的偏移，归一化到 -1 ~ 1
        const cx = (e.clientX / window.innerWidth - 0.5) * 2;
        const cy = (e.clientY / window.innerHeight - 0.5) * 2;

        // 遍历所有带 data-parallax 的子元素，设置 translate
        const els = bgRef.value.querySelectorAll('[data-parallax]');
        els.forEach((el) => {
            const factor = parseFloat((el as HTMLElement).dataset.parallax || '0');
            const offsetX = cx * factor * 1000; // 乘以基数放大位移
            const offsetY = cy * factor * 1000;
            // 用 CSS 变量传递偏移，避免覆盖动画 transform
            (el as HTMLElement).style.setProperty('--px', `${offsetX}px`);
            (el as HTMLElement).style.setProperty('--py', `${offsetY}px`);
        });
    });
}

onMounted(() => {
    window.addEventListener('mousemove', onMouseMove);
});
onUnmounted(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    window.removeEventListener('mousemove', onMouseMove);
});

// 表单引用
const formRef = ref<FormInst | null>(null);
// 加载状态
const isLoading = ref(false);

// 表单数据
//
// 凭据初始值为空字符串，强制用户手输账号密码：
//   1. 不再用 MSW 自动填充，避免与真实后端的预期凭据混淆
//   2. 避免把开发凭据硬编码进前端 bundle，防止生产环境泄露
//   3. 用户在登录页看到的就是真实场景，必须自己输入 root / Root!123 等
const formData = reactive({
    username: '',
    password: '',
});

// 校验规则
const formRules: FormRules = {
    username: { required: true, message: '请输入用户名', trigger: 'blur' },
    password: { required: true, message: '请输入密码', trigger: 'blur' },
};

// 登录处理
async function onLogin() {
    try {
        // 先做表单校验
        await formRef.value?.validate();
    } catch {
        return;
    }

    isLoading.value = true;

    try {
        /**
         * 获取 Turnstile token（如果有 siteKey 且 widget 就绪）
         * - getToken() 在 widget 未就绪时返回空字符串，不阻断登录
         * - 后端 TurnstileService.verify() 内部根据 system_config.turnstile.config.enabled
         *   决定是否强校验：未传 + enabled=true → 20007；未传 + enabled=false → 跳过
         * - 字段名 turnstileToken 与后端 AdminLoginSchema.turnstileToken 一致
         */
        let turnstileToken: string | undefined;
        try {
            turnstileToken = (await getToken()) || undefined;
        } catch {
            // widget 渲染失败 / token 拉取失败：不阻断登录，让后端决定
        }

        await adminStore.login({
            username: formData.username,
            password: formData.password,
            turnstileToken,
        });
        // 登录成功 → 跳转目标页或首页
        const redirect = route.query.redirect as string | undefined;
        if (redirect) {
            router.push({ name: redirect });
        } else {
            router.push('/');
        }
    } catch (err: unknown) {
        message.error((err as { message?: string })?.message || '登录失败，请重试');
        // 登录失败后重置验证码，要求用户重新验证
        reloadCaptcha();
    } finally {
        isLoading.value = false;
    }
}
</script>

<style scoped>
/* Turnstile 验证码容器：宽度自适应父级 */
#turnstile-container {
    width: 100%;
}

/* 小屏缩小 n-card 内部内容区边距，给验证码腾空间 */
@media (max-width: 639px) {
    :deep(.n-card.n-card--bordered .n-card__content) {
        padding: 0 8px 12px 8px;
    }
}

/* ===== 背景装饰 ===== */

/* 装饰层容器：固定定位，不响应点击 */
.bg-decoration {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
}

/* 模糊光斑 */
.bg-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(120px);
    translate: var(--px, 0) var(--py, 0);
}
.bg-blob--1 {
    width: 600px;
    height: 600px;
    background: var(--primary-color, #18a058);
    top: -200px;
    right: -150px;
    opacity: 0.1;
    animation: bg-drift-1 18s ease-in-out infinite;
}
.bg-blob--2 {
    width: 400px;
    height: 400px;
    background: #f0a020;
    bottom: -150px;
    left: -100px;
    opacity: 0.06;
    animation: bg-drift-2 22s ease-in-out infinite;
}
.bg-blob--3 {
    width: 250px;
    height: 250px;
    background: var(--primary-color, #18a058);
    bottom: 40%;
    left: 10%;
    opacity: 0.06;
    animation: bg-drift-3 20s ease-in-out infinite;
}

/* 旋转圆环 */
.bg-ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid var(--n-border-color, rgb(224, 224, 230));
    opacity: 0.4;
    translate: var(--px, 0) var(--py, 0);
}
.bg-ring--1 {
    width: 520px;
    height: 520px;
    top: -100px;
    left: -200px;
    animation: bg-ring-spin 30s linear infinite;
}
.bg-ring--2 {
    width: 360px;
    height: 360px;
    bottom: -80px;
    right: -120px;
    animation: bg-ring-spin 25s linear infinite reverse;
}
.bg-ring--3 {
    width: 200px;
    height: 200px;
    top: 30%;
    right: 10%;
    animation: bg-ring-spin 20s linear infinite;
}

/* 菱形装饰 */
.bg-diamond {
    position: absolute;
    border: 1px dashed var(--n-border-color, rgb(224, 224, 230));
    opacity: 0.35;
    transform: rotate(45deg);
    translate: var(--px, 0) var(--py, 0);
}
.bg-diamond--1 {
    width: 180px;
    height: 180px;
    top: 15%;
    right: 5%;
    animation: bg-diamond-float 8s ease-in-out infinite;
}
.bg-diamond--2 {
    width: 120px;
    height: 120px;
    bottom: 20%;
    left: 5%;
    animation: bg-diamond-float 12s ease-in-out infinite reverse;
}

/* 几何色块 */
.bg-geo {
    position: absolute;
    border-radius: 3px;
    opacity: 0.06;
    translate: var(--px, 0) var(--py, 0);
}
.bg-geo--1 {
    width: 80px;
    height: 80px;
    background: var(--primary-color, #18a058);
    top: 8%;
    left: 4%;
    transform: rotate(15deg);
}
.bg-geo--2 {
    width: 40px;
    height: 40px;
    background: #f0a020;
    top: 20%;
    right: 8%;
    border-radius: 50%;
}
.bg-geo--3 {
    width: 60px;
    height: 60px;
    background: var(--primary-color, #18a058);
    bottom: 12%;
    left: 28%;
    transform: rotate(30deg);
}
.bg-geo--4 {
    width: 50px;
    height: 50px;
    background: #f0a020;
    top: 55%;
    right: 15%;
    border-radius: 50%;
}

/* 对角斜线 */
.bg-stripes {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background: repeating-linear-gradient(
        -30deg,
        transparent,
        transparent 200px,
        rgba(24, 160, 88, 0.06) 200px,
        rgba(24, 160, 88, 0.06) 201px
    );
    opacity: 0.4;
}

/* 网格点阵 */
.bg-dots {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background-image:
        radial-gradient(circle, var(--n-border-color, rgb(224, 224, 230)) 1.5px, transparent 1.5px),
        radial-gradient(circle, var(--n-border-color, rgb(224, 224, 230)) 0.5px, transparent 0.5px);
    background-size:
        48px 48px,
        48px 48px;
    background-position:
        0 0,
        24px 24px;
    opacity: 0.3;
}

/* ===== 暗黑模式：压低装饰元素透明度，恢复若隐若现 ===== */
.login-page[data-theme='dark'] .bg-blob--1 {
    opacity: 0.04;
}
.login-page[data-theme='dark'] .bg-blob--2 {
    opacity: 0.025;
}
.login-page[data-theme='dark'] .bg-blob--3 {
    opacity: 0.025;
}
.login-page[data-theme='dark'] .bg-ring {
    opacity: 0.15;
}
.login-page[data-theme='dark'] .bg-diamond {
    opacity: 0.12;
}
.login-page[data-theme='dark'] .bg-geo {
    opacity: 0.025;
}
.login-page[data-theme='dark'] .bg-stripes {
    opacity: 0.15;
}
.login-page[data-theme='dark'] .bg-dots {
    opacity: 0.12;
}

/* ===== Chrome 自动填充样式覆盖 ===== */
/*
 * Chrome 自动填充会用 box-shadow 覆盖 input 的背景（亮色 #E8F0FE，暗色 rgba(70,90,126,0.4)）。
 * 必须用 !important 覆盖。Naive UI 的 --n-color 在暗色模式下是半透明色（rgba(255,255,255,0.1)），
 * 用它会透出 Chrome 的底色，所以按主题分别用实色硬编码。
 */
/* 亮色：input 背景纯白，文字 rgb(51,54,57) */
:deep(.n-input__input-el:-webkit-autofill),
:deep(.n-input__input-el:-webkit-autofill:hover),
:deep(.n-input__input-el:-webkit-autofill:focus),
:deep(.n-input__input-el:-webkit-autofill:active) {
    -webkit-box-shadow: 0 0 0 30px #fff inset !important;
    -webkit-text-fill-color: rgb(51, 54, 57) !important;
    caret-color: rgb(51, 54, 57);
}
/* 暗色：Naive UI card 背景 rgb(24,24,28) + input 半透明叠加 → ≈rgb(47,47,51) */
[data-theme='dark'] :deep(.n-input__input-el:-webkit-autofill),
[data-theme='dark'] :deep(.n-input__input-el:-webkit-autofill:hover),
[data-theme='dark'] :deep(.n-input__input-el:-webkit-autofill:focus),
[data-theme='dark'] :deep(.n-input__input-el:-webkit-autofill:active) {
    -webkit-box-shadow: 0 0 0 30px rgb(47, 47, 51) inset !important;
    -webkit-text-fill-color: rgba(255, 255, 255, 0.82) !important;
    caret-color: rgba(255, 255, 255, 0.82);
}

/* ===== 动画 ===== */
@keyframes bg-drift-1 {
    0%,
    100% {
        transform: translate(0, 0) scale(1);
    }
    33% {
        transform: translate(-40px, 30px) scale(1.05);
    }
    66% {
        transform: translate(20px, -20px) scale(0.95);
    }
}
@keyframes bg-drift-2 {
    0%,
    100% {
        transform: translate(0, 0) scale(1);
    }
    50% {
        transform: translate(30px, -25px) scale(1.08);
    }
}
@keyframes bg-drift-3 {
    0%,
    100% {
        transform: translate(0, 0) scale(1);
    }
    50% {
        transform: translate(60px, -30px) scale(1.3);
    }
}
@keyframes bg-ring-spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
@keyframes bg-diamond-float {
    0%,
    100% {
        transform: rotate(45deg) translate(0, 0);
    }
    33% {
        transform: rotate(45deg) translate(8px, -8px);
    }
    66% {
        transform: rotate(45deg) translate(-8px, 6px);
    }
}
</style>
