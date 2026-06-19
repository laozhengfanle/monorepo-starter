<!--
  TurnstileWidget — Cloudflare Turnstile 人机验证组件
  用法：
    <TurnstileWidget :site-key="siteKey" @token="onToken" />
    function onToken(token: string) { ... }

  资源清理（修复 CRITICAL F1 — 内存泄漏）：
    onBeforeUnmount 中调用 removeWidget()，清理：
      1. 5s 超时定时器（clearScriptLoadTimer）
      2. Cloudflare widget（window.turnstile.remove）
    否则组件卸载后定时器 + iframe + postMessage 监听会持续泄漏
-->
<template>
    <div ref="containerRef" class="cf-turnstile" />
</template>

<script setup lang="ts">
/**
 * Cloudflare Turnstile 人机验证组件
 *
 * 工作流程：
 *   1. onMounted 动态加载 Cloudflare 官方脚本（仅加载一次）
 *   2. 脚本加载完成后调用 window.turnstile.render() 渲染 widget
 *   3. 用户完成验证后通过 callback 拿到 token，emit('token') 给父组件
 *   4. onBeforeUnmount 调用 window.turnstile.remove() 清理 widget
 *
 * 失败处理：脚本加载失败 / widget 渲染失败不抛错，
 * 因为 Turnstile 是可选的增强验证，不应阻断主流程
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';

/** 组件 props：siteKey 由父组件传入（通常从 import.meta.env.VITE_TURNSTILE_SITE_KEY 读） */
const props = withDefaults(
    defineProps<{
        /** Cloudflare Turnstile 的 Site Key（可选：有默认值空字符串，未配置时跳过渲染） */
        siteKey?: string;
    }>(),
    { siteKey: '' },
);

/** 事件：验证通过时向父组件 emit token */
const emit = defineEmits<{
    (e: 'token', value: string): void;
}>();

/** Cloudflare 官方脚本地址（render=explicit 让我们手动调用 render()） */
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** 脚本 ID（用于去重：避免重复插入 script 标签） */
const SCRIPT_ID = 'turnstile-script';

/** 容器引用：用于挂载 Turnstile widget */
const containerRef = ref<HTMLDivElement | null>(null);

/** Turnstile widget ID（创建后由 Cloudflare 返回，用于后续 remove/reset） */
const widgetId = ref<string>('');

/**
 * 5s 超时定时器句柄（修复 CRITICAL F1 — 内存泄漏）
 * - loadTurnstileScript 中设置的兜底定时器必须存句柄，组件卸载时 clearTimeout
 * - 若不清理：组件已卸载但 setTimeout 仍会触发 → 闭包持有的响应式状态无法 GC
 * - 初始为 null，表示"当前没有挂起的 timer"
 */
let scriptLoadTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 声明 window.turnstile 全局类型
 * Cloudflare 脚本会在 window 上挂一个 turnstile 对象，包含 render/remove/reset 等方法
 */
declare global {
    interface Window {
        turnstile?: {
            /** 手动渲染 widget，返回 widgetId */
            render: (
                container: string | HTMLElement,
                options: {
                    sitekey: string;
                    callback?: (token: string) => void;
                    'error-callback'?: () => void;
                    'expired-callback'?: () => void;
                    theme?: 'light' | 'dark' | 'auto';
                    size?: 'normal' | 'flexible' | 'compact';
                },
            ) => string;
            /** 销毁指定 widget */
            remove: (widgetId: string) => void;
            /** 重置 widget（让用户重新验证） */
            reset: (widgetId: string) => void;
        };
    }
}

/**
 * 动态加载 Cloudflare Turnstile 脚本
 *
 * 行为：
 *   - 如果 document 中已有 script 标签（其他组件已加载）→ 直接等待其加载完成
 *   - 否则插入新的 <script> 标签，async 加载
 *
 * 失败处理：
 *   - 脚本加载失败 / 超时时 Promise 仍 resolve（不 reject）
 *   - 父组件可根据 widgetId 是否成功赋值判断是否就绪
 *
 * 资源清理（修复 CRITICAL F1 — 内存泄漏）：
 *   - 5s 超时定时器句柄存到模块级 `scriptLoadTimer`，onBeforeUnmount 中 clearTimeout
 *   - 否则组件卸载后定时器仍会触发 → 闭包持有的响应式状态无法 GC
 */
function loadTurnstileScript(): Promise<void> {
    return new Promise((resolve) => {
        // 本次 Promise 是否已 resolve，防止 load / error / timeout 重复触发
        let resolved = false;
        const doResolve = () => {
            if (!resolved) {
                resolved = true;
                clearScriptLoadTimer();
                resolve();
            }
        };

        // 1. 已有 script 标签 → 等待其加载完成
        const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (existing) {
            // 脚本已加载（window.turnstile 已挂载）→ 直接渲染
            if (window.turnstile) {
                doResolve();
                return;
            }
            // 脚本标签在 DOM 中但尚未加载完成，监听 load / error
            existing.addEventListener('load', doResolve);
            existing.addEventListener('error', doResolve);
            return;
        }

        // 2. 首次加载 → 插入新 script
        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = doResolve;
        script.onerror = doResolve;
        document.head.appendChild(script);

        // 5s 超时兜底：避免 CDN 慢/挂起时永远 pending
        // 必须把句柄存到 scriptLoadTimer，onBeforeUnmount 中才能 clearTimeout
        scriptLoadTimer = setTimeout(() => {
            scriptLoadTimer = null;
            doResolve();
        }, 5000);
    });
}

/**
 * 清理 5s 超时定时器
 * - 仅清理本组件的 timer，多个 TurnstileWidget 并存时互不影响
 * - setTimeout 返回值在 Node.js / 浏览器中均为 number（happy-dom 也支持）
 */
function clearScriptLoadTimer(): void {
    if (scriptLoadTimer !== null) {
        clearTimeout(scriptLoadTimer);
        scriptLoadTimer = null;
    }
}

/**
 * 渲染 Turnstile widget 到容器
 *
 * 通过 window.turnstile.render() 把 widget 挂载到 containerRef 指向的 div。
 * 验证通过后 Cloudflare 会调用 callback(token)，我们再 emit 给父组件。
 */
function renderWidget(): void {
    if (!containerRef.value || !window.turnstile) return;
    if (!props.siteKey) {
        // 没有 siteKey 时不渲染（例如后端 Turnstile 未启用）
        return;
    }

    // 如果之前已渲染过，先清理
    if (widgetId.value) {
        removeWidget();
    }

    // 清空容器内容（避免重复渲染时叠加）
    containerRef.value.innerHTML = '';

    widgetId.value = window.turnstile.render(containerRef.value, {
        sitekey: props.siteKey,
        // 验证成功 → 拿到 token 抛给父组件
        callback: (token: string) => {
            emit('token', token);
        },
        // 验证失败 → 通知父组件（token 传空字符串）
        'error-callback': () => {
            emit('token', '');
        },
        // token 过期 → 通知父组件
        'expired-callback': () => {
            emit('token', '');
        },
    });
}

/**
 * 销毁 Turnstile widget + 清理 script load timer
 *
 * 在组件卸载时调用，避免 iframe 残留或 postMessage 监听泄漏
 *
 * 修复 CRITICAL F1 — 内存泄漏：
 *   - 同时清理 5s 超时 timer（即使 widget 还没渲染就卸载，也可能有 pending 的 timer）
 *   - remove() 偶发报错时静默忽略（widget 可能已被销毁）
 */
function removeWidget(): void {
    // 清理脚本加载超时定时器（必须放在 remove 之前，万一 remove 抛错也不影响 timer 清理）
    clearScriptLoadTimer();
    if (window.turnstile && widgetId.value) {
        try {
            window.turnstile.remove(widgetId.value);
        } catch {
            // remove 偶发报错（如 widget 已被销毁），忽略即可
        }
        widgetId.value = '';
    }
}

/** 组件挂载：加载脚本 → 渲染 widget */
onMounted(async () => {
    await loadTurnstileScript();
    renderWidget();
});

/** 组件卸载：清理 widget + script load timer */
onBeforeUnmount(() => {
    removeWidget();
});
</script>

<style scoped>
/* Turnstile widget 容器：宽度自适应父级 */
.cf-turnstile {
    width: 100%;
}
</style>
