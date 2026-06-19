/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<object, object, unknown>;
    export default component;
}

// Cloudflare Turnstile 验证码全局类型声明
interface Turnstile {
    /** 渲染验证码组件，返回 widgetId */
    render: (
        container: string | HTMLElement,
        options: {
            sitekey: string;
            theme?: 'light' | 'dark' | 'auto';
            size?: 'normal' | 'compact' | 'flexible';
            callback?: (token: string) => void;
            'error-callback'?: (error: string) => void;
            'expired-callback'?: () => void;
        },
    ) => string;
    /** 移除指定验证码组件 */
    remove: (widgetId: string) => void;
    /** 重置验证码组件 */
    reset: (widgetId: string) => void;
    /** 获取验证码 token */
    getToken: (widgetId: string, callback: (token: string) => void) => void;
}

interface Window {
    /** Cloudflare Turnstile 全局对象 */
    turnstile?: Turnstile;
}
