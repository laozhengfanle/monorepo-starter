/**
 * Cloudflare Turnstile 人机验证 composable
 *
 * ## 使用方式
 *
 * 1. **生产模式**（运行时配置）：从 `useConfigStore.turnstileConfig` 拿 siteKey + enabled
 *    ```ts
 *    const config = useConfigStore();
 *    const { loadScript, render, getToken, reset, destroy, dispose } = useTurnstile({
 *        siteKey: config.turnstileConfig.enabled ? config.turnstileConfig.siteKey : "",
 *    });
 *    ```
 *
 * 2. **开发兜底**：未传 siteKey 时降级读 `VITE_TURNSTILE_SITE_KEY` 环境变量
 *    - 便于本地 dev 调试（不需要从后端 system_config 拿配置）
 *
 * ## 关于 resolve-on-failure 的设计
 *
 * 脚本加载失败或超时时，Promise 仍会 resolve（不会 reject）。
 * 这是为了**用户体验**：Turnstile 是可选的验证增强，加载失败不应阻断登录流程。
 * 调用方通过 `captchaState`（loading/ready/timeout）区分状态，
 * 在 timeout 状态下显示重试按钮，而非直接拒绝登录。
 *
 * ## 关于 dev 模式本地 mock fallback（关键设计）
 *
 * Cloudflare 测试 siteKey（`1x000...0AA` / `2x000...0AA` / `3x000...0AA`）的"永远通过"
 * 行为在 localhost 上**不再 100% 成立**——Cloudflare 服务端会返回 400020（域名不匹配），
 * 导致 widget 加载失败。
 *
 * 为此在 widget 加载失败时进入 **mock 模式**：
 * 1. 在容器内插入一个"开发模式 - 跳过验证"按钮（视觉上仍有"验证码"区域）
 * 2. 用户点击 → 标记 mock 模式就绪
 * 3. 调 getToken() 返回 `LOCAL_DEV_BYPASS_<timestamp>` fake token
 * 4. 后端 TurnstileService 识别该前缀 → dev 模式放行 + warn log / prod 模式拒绝
 *
 * 这样：
 * - 生产环境：widget 正常加载 → 真实 Cloudflare 验证（不变）
 * - dev 环境 + Cloudflare 可用：与生产一致
 * - dev 环境 + Cloudflare 不可用：本地 mock 按钮 → fake token → dev 模式放行
 *
 * 在需要强制验证码的生产环境中，应将 resolve 改为 reject，
 * 并确保后端同时验证 Turnstile token。
 *
 * ## 资源生命周期与清理（修复 CRITICAL F1 — 内存泄漏）
 *
 * `useTurnstile` 必须在组件卸载时清理以下三类资源：
 * 1. **轮询 / 超时定时器**：`loadScript` 内的 5s 超时 `setTimeout`（不 clear 就会在已卸载组件
 *    上继续执行 → 闭包持有的 `isMockMode` / `isLoaded` ref 持续存在，DOM script 节点引用不释放）
 * 2. **动态注入的 script 节点**：用**引用计数**管理（多个组件可共享同一份 Cloudflare 脚本，
 *    最后一个使用者卸载时才真正 `removeChild`）。`window.turnstile` 引用会一直 hold 这个
 *    script 标签所在的 DOM 节点，泄漏后会阻止 GC。
 * 3. **widget 实例**：`window.turnstile.remove(widgetId)` 销毁 widget 及其内部 iframe +
 *    postMessage 监听；不销毁会导致 iframe 残留 + Cloudflare 端持续计时
 *
 * `dispose()` 统一执行上述清理；同时通过 `onScopeDispose` 在组件作用域销毁时**自动**调用，
 * 避免调用方忘记清理。重复调用 `dispose()` 是幂等的（`isDisposed` 标记防重入）。
 */
import { ref, onScopeDispose, getCurrentScope } from 'vue';

/** 本地 mock 模式 token 前缀（与后端 TurnstileService 约定） */
const LOCAL_DEV_BYPASS_PREFIX = 'LOCAL_DEV_BYPASS_';

/** Cloudflare 脚本地址：常量提到顶层（避免每次调用 loadScript 时重建字符串） */
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** script 节点 id（用于去重 + 查询移除） */
const SCRIPT_ID = 'turnstile-script';

/**
 * 模块级引用计数：跟踪当前有多少个 `useTurnstile` 实例正在使用 Turnstile 脚本
 *
 * - 多个组件（LoginPage、RegisterPage...）共享同一份 Cloudflare 脚本时，
 *   `useTurnstile()` 被多次调用，refCount 累加
 * - 只有最后一个使用者 `dispose()` 时才真正 `removeChild(script)`，
 *   避免误删其他组件还在用的资源
 * - 这样能保证：
 *   - 多个组件同时挂载时，脚本只被加载 1 次
 *   - 组件依次卸载时，脚本在最后一个组件卸载时才被清理
 */
let scriptRefCount = 0;

/** 标记脚本是否被本模块加载过（防止外部手动插入同名 script 时误判） */
let scriptInjectedByUs = false;

export interface UseTurnstileOptions {
    /**
     * Cloudflare Turnstile Site Key
     * - 传空字符串表示"未配置"，render() / getToken() 会无操作跳过
     * - 不传时降级读 import.meta.env.VITE_TURNSTILE_SITE_KEY
     */
    siteKey?: string;
}

export function useTurnstile(options: UseTurnstileOptions = {}) {
    // 运行时传入优先；未传时降级读环境变量（dev 友好）
    const resolvedSiteKey = options.siteKey ?? import.meta.env.VITE_TURNSTILE_SITE_KEY;
    const widgetId = ref('');
    const isLoaded = ref(false);
    /**
     * mock 模式标记：widget 加载失败时为 true
     * - true 时 render 会在容器内插入"开发模式 - 跳过验证"按钮
     * - true 时 getToken 返回 LOCAL_DEV_BYPASS_<timestamp> fake token
     * - LoginPage 通过 captchaState 同步显示状态
     */
    const isMockMode = ref(false);

    /**
     * 已 dispose 标记：防止重复清理（onScopeDispose + 手动调用 dispose() 都会触发）
     * - setTimeout 句柄一旦被 clearTimeout 之后再 clearTimeout 是 no-op，但 widgetId.remove()
     *   重复调用会抛错，所以用标志位防重入
     */
    const isDisposed = ref(false);

    /**
     * loadScript 中的 5s 超时定时器句柄
     * - 必须在 dispose() 中 clearTimeout，否则组件已卸载时定时器仍会触发
     * - 闭包持有 isMockMode / isLoaded 等 ref，导致组件作用域内的响应式对象无法 GC
     */
    let loadTimeoutId: ReturnType<typeof setTimeout> | null = null;

    /**
     * 当前实例是否已注册到模块级 refCount
     * - 防止 dispose() 在 loadScript 未触发前就调用时，refCount 被错误 -1
     */
    let refCountRegistered = false;

    /**
     * 清理 loadScript 中的 5s 超时定时器
     * - 仅清理本实例的 timer，不影响其他并发组件的 timer
     */
    function clearLoadTimeout() {
        if (loadTimeoutId !== null) {
            clearTimeout(loadTimeoutId);
            loadTimeoutId = null;
        }
    }

    /**
     * 减少脚本引用计数；引用归零时移除 script 节点
     * - 多个组件共享同一份脚本，必须等所有使用者都卸载后才能真正 removeChild
     * - 仅当脚本是本模块注入的（scriptInjectedByUs=true）时才移除，避免误删外部同名 script
     */
    function releaseScript() {
        if (!refCountRegistered) return;
        refCountRegistered = false;
        scriptRefCount = Math.max(0, scriptRefCount - 1);
        if (scriptRefCount === 0 && scriptInjectedByUs) {
            const el = document.getElementById(SCRIPT_ID);
            if (el) el.remove();
            scriptInjectedByUs = false;
            // 注意：不清除 window.turnstile —— Cloudflare 加载后会持续保留该全局对象，
            // 移除 script 节点只是断开 DOM 引用，但 window 对象的引用计数仍由浏览器管理
        }
    }

    function loadScript(): Promise<void> {
        // 已 dispose 的实例不允许再加载资源（避免泄漏窗口期）
        if (isDisposed.value) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            // 已有 script 标签（被本模块或外部插入）
            if (document.querySelector(`#${SCRIPT_ID}`)) {
                // 引用计数 +1：本实例也要用这个脚本
                scriptRefCount += 1;
                refCountRegistered = true;
                if (!scriptInjectedByUs) {
                    // 脚本是外部插入的（不应由本模块管理 remove）
                    refCountRegistered = false;
                    scriptRefCount = Math.max(0, scriptRefCount - 1);
                }

                if (isLoaded.value) {
                    resolve();
                    return;
                }
                // script 标签已存在但尚未加载完成，等待加载
                const existing = document.querySelector(`#${SCRIPT_ID}`) as HTMLScriptElement;
                existing.addEventListener('load', () => {
                    isLoaded.value = true;
                    clearLoadTimeout();
                    resolve();
                });
                existing.addEventListener('error', () => {
                    // script 加载失败 → 进入 mock 模式
                    isMockMode.value = true;
                    clearLoadTimeout();
                    resolve();
                });
                return;
            }

            // 首次加载：插入新 script
            scriptRefCount += 1;
            refCountRegistered = true;
            scriptInjectedByUs = true;

            const script = document.createElement('script');
            script.id = SCRIPT_ID;
            script.src = TURNSTILE_SCRIPT_SRC;
            script.async = true;
            script.onload = () => {
                isLoaded.value = true;
                clearLoadTimeout();
                resolve();
            };
            script.onerror = () => {
                // script 加载失败 → 进入 mock 模式
                isMockMode.value = true;
                clearLoadTimeout();
                resolve();
            };
            document.head.appendChild(script);

            // 5s 超时兜底：超时也进入 mock 模式（Cloudflare 不可达时的兜底）
            // 必须把句柄存到 loadTimeoutId，dispose() 中才能 clearTimeout
            loadTimeoutId = setTimeout(() => {
                loadTimeoutId = null;
                if (!isLoaded.value) {
                    isMockMode.value = true;
                    resolve();
                }
            }, 5000);
        });
    }

    function render(id: string, dark = false, size: 'flexible' | 'compact' = 'flexible') {
        // dispose 后不允许再 render（避免向已被移除的容器写入 DOM）
        if (isDisposed.value) return;

        const el = document.querySelector(`#${id}`);
        if (!el) return;

        // 路径 A：未配置 siteKey → 管理员在 system_config 关闭了 Turnstile
        // - 这种情况用户根本不想要任何"验证码" UI（包括 mock 兜底）
        // - LoginPage 的注释明确：enabled=false → 不渲染 widget + 登录请求不带 token
        // - 容器清空，保持 LoginPage 布局不被破坏
        if (!resolvedSiteKey) {
            isMockMode.value = false;
            el.innerHTML = '';
            return;
        }

        // 路径 B：mock 模式（Cloudflare 不可用兜底）—— 插入"开发模式 - 跳过验证"按钮
        // - 视觉上保留"验证码"区域（用户能看到），不破坏 LoginPage 布局
        // - 用户点击 → 标记 mock 就绪 → getToken 返回 fake token → 后端 dev 模式放行
        if (!window.turnstile || isMockMode.value) {
            isMockMode.value = true;
            renderMockFallback(el, dark);
            return;
        }

        // 路径 C：正常 Cloudflare widget 渲染
        if (widgetId.value) {
            window.turnstile.remove(widgetId.value);
            widgetId.value = '';
        }
        el.innerHTML = '';
        try {
            widgetId.value = window.turnstile.render(`#${id}`, {
                sitekey: resolvedSiteKey,
                theme: dark ? 'dark' : 'light',
                size,
                // 异步错误回调：Cloudflare 服务端返回 400020 等错误时触发
                // 进入 mock 模式，避免登录按钮被永久禁用
                'error-callback': () => {
                    console.warn('[useTurnstile] Cloudflare 异步报错，进入 mock 模式');
                    isMockMode.value = true;
                    renderMockFallback(el, dark);
                },
            });
        } catch (err) {
            // render 抛错（Cloudflare widget 内部异常）→ fallback 到 mock
            console.warn('[useTurnstile] render 失败，进入 mock 模式:', err);
            isMockMode.value = true;
            renderMockFallback(el, dark);
        }
    }

    /**
     * 渲染本地 mock 兜底 UI
     * - 一个"开发模式 - 点击跳过验证"按钮
     * - 视觉上保留"验证码"区域（用户能看到），不破坏 LoginPage 布局
     * - 功能上 mock 模式在 captchaState='ready' 后用户可直接点登录，无需点 mock 按钮
     *   （getToken() 在 isMockMode=true 时直接返回 fake token）
     * - 按钮 click 只做**视觉反馈**（改为"✅ 已就绪，可登录"），不触发任何 LoginPage 状态
     *   ——让用户点了有反馈，按完继续登录
     */
    function renderMockFallback(el: Element, dark: boolean) {
        const textColor = dark ? 'rgba(255,255,255,0.82)' : 'rgb(51,54,57)';
        const bgColor = dark ? 'rgba(255,255,255,0.08)' : 'rgb(232,232,235)';
        const hoverBgColor = dark ? 'rgba(255,255,255,0.12)' : 'rgb(220,220,225)';
        el.innerHTML = `
            <div
                data-testid="turnstile-mock-fallback"
                data-state="idle"
                style="display:flex;align-items:center;justify-content:center;height:65px;border-radius:4px;background:${bgColor};color:${textColor};font-size:13px;cursor:pointer;user-select:none;transition:background 0.15s;"
                role="button"
                tabindex="0"
            >
                <span data-label>🛡️ 开发模式：点击跳过验证码（dev fallback）</span>
            </div>
        `;
        const btn = el.querySelector('[data-testid="turnstile-mock-fallback"]') as HTMLElement | null;
        if (!btn) return;
        const label = btn.querySelector('[data-label]') as HTMLElement | null;
        btn.addEventListener('mouseenter', () => {
            if (btn.dataset['state'] === 'ready') return;
            btn.style.background = hoverBgColor;
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = bgColor;
        });
        btn.addEventListener('click', () => {
            // 纯视觉反馈：用户点了有"按过"的感觉
            // 功能上 getToken() 在 isMockMode=true 时直接返回 fake token，无需点按钮
            btn.dataset['state'] = 'ready';
            btn.style.background = bgColor;
            if (label) label.textContent = '✅ 已就绪（可点登录）';
        });
    }

    function getToken(): Promise<string> {
        return new Promise((resolve, reject) => {
            // dispose 后 getToken 直接 resolve 空串（避免在已卸载实例上调用 widget API）
            if (isDisposed.value) {
                resolve('');
                return;
            }
            // mock 模式：返回 fake token（后端 dev 模式会放行，prod 模式会拒绝）
            if (isMockMode.value) {
                resolve(`${LOCAL_DEV_BYPASS_PREFIX}${Date.now()}`);
                return;
            }
            if (!window.turnstile || !widgetId.value) {
                resolve('');
                return;
            }
            window.turnstile.getToken(widgetId.value, (token: string) => {
                if (token) {
                    resolve(token);
                } else {
                    reject(new Error('验证未通过'));
                }
            });
        });
    }

    /** 销毁当前 Turnstile widget，清理 iframe 和 DOM */
    function destroy() {
        if (isMockMode.value) {
            // mock 模式无 widget，清掉容器 innerHTML 即可
            return;
        }
        if (window.turnstile && widgetId.value) {
            try {
                window.turnstile.remove(widgetId.value);
            } catch {
                // widget 已被销毁（重复调用、widget 内部异常等），忽略
            }
            widgetId.value = '';
        }
    }

    function reset() {
        // dispose 后不允许 reset（避免向已销毁的 widget 发起操作）
        if (isDisposed.value) return;
        if (isMockMode.value) {
            // mock 模式无 widget，无需 reset
            return;
        }
        if (window.turnstile && widgetId.value) {
            window.turnstile.reset(widgetId.value);
        }
    }

    /**
     * 释放本实例持有的所有资源（定时器 + widget + 脚本引用计数 -1）
     *
     * 调用时机：
     * 1. 组件 `onUnmounted` / 组合式函数 `onScopeDispose` —— 自动
     * 2. 调用方主动提前释放（如路由切换 + 强制清理） —— 手动
     *
     * 幂等：多次调用安全（isDisposed 标记防重入 + 内部所有清理操作都判空）
     */
    function dispose() {
        if (isDisposed.value) return;
        isDisposed.value = true;
        // 1. 清理 5s 超时定时器
        clearLoadTimeout();
        // 2. 销毁 Turnstile widget
        destroy();
        // 3. 减少脚本引用计数；最后一个使用者真正 removeChild
        releaseScript();
    }

    // 自动清理：组件作用域销毁时自动调用 dispose()
    // - 仅在 effect scope 存在时注册（独立调用 useTurnstile() 不会触发）
    // - 单元测试中用 effectScope 包裹即可验证清理行为
    if (getCurrentScope()) {
        onScopeDispose(dispose);
    }

    return {
        siteKey: resolvedSiteKey,
        isLoaded,
        isMockMode,
        isDisposed,
        loadScript,
        render,
        getToken,
        reset,
        destroy,
        dispose,
    };
}

/**
 * 重置模块级状态（仅供单元测试使用）
 *
 * 因为 `scriptRefCount` / `scriptInjectedByUs` 是模块级单例，
 * 多个测试顺序执行时若不重置，前一个测试残留的状态会影响下一个。
 * 生产环境绝对不要调用。
 */
export function __resetTurnstileModuleForTests(): void {
    scriptRefCount = 0;
    scriptInjectedByUs = false;
}
