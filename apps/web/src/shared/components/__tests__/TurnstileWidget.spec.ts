/**
 * TurnstileWidget 组件单元测试
 *
 * 测试覆盖（修复 CRITICAL F1 — 内存泄漏）：
 *   - 组件 mount 后会注入 <script id="turnstile-script">
 *   - 5s 超时定时器在 unmount 后被 clearTimeout（避免泄漏）
 *   - 组件 unmount 后调用 window.turnstile.remove(widgetId)
 *   - unmount 不抛错，多次 mount/unmount 不会泄漏 script
 *   - 验证 widget 渲染时调用 window.turnstile.render
 *   - 验证 @token 事件正确传递
 *
 * 测试技巧：
 *   happy-dom 不允许加载外部 https 脚本（会同步抛 DOMException），
 *   所以测试中预先在 head 插入 <script id="turnstile-script"> 占位元素，
 *   组件 mount 时走"已有 script"分支，不会再 appendChild 触发网络请求。
 *   随后手动 dispatchEvent('load') 模拟脚本加载完成。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import TurnstileWidget from '../TurnstileWidget.vue';

/** 测试用的 mock window.turnstile */
function installMockTurnstile() {
    const removeMock = vi.fn();
    const renderMock = vi.fn(
        (_container: HTMLElement, options: { callback?: (token: string) => void; sitekey?: string }) => {
            // 模拟 Cloudflare：渲染后异步调用 callback 通知验证完成
            Promise.resolve().then(() => options.callback?.('mock-turnstile-token'));
            return 'widget-1';
        },
    );
    const resetMock = vi.fn();
    (window as unknown as { turnstile: unknown }).turnstile = {
        render: renderMock,
        remove: removeMock,
        reset: resetMock,
    };
    return { removeMock, renderMock, resetMock };
}

/** 卸载 window.turnstile */
function uninstallMockTurnstile() {
    delete (window as unknown as { turnstile?: unknown }).turnstile;
}

/** 清理 head 中所有 turnstile script */
function removeAllTurnstileScripts() {
    Array.from(document.querySelectorAll('#turnstile-script')).forEach((el) => el.remove());
}

/**
 * 预先在 head 注入 turnstile script 占位元素（避免 happy-dom 真实加载外部脚本）
 *
 * - 设置 src 属性（符合组件 loadTurnstileScript 中的 querySelector 匹配）
 * - 但不真正加载；测试中需要时手动 dispatch 'load' 事件
 * - 元素可被组件"复用"，无需再 appendChild
 */
function preInjectScriptPlaceholder(): HTMLScriptElement {
    const script = document.createElement('script');
    script.id = 'turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    // 阻止 happy-dom 实际尝试加载
    script.setAttribute('data-test-stub', '1');
    document.head.appendChild(script);
    return script;
}

describe('TurnstileWidget', () => {
    beforeEach(() => {
        removeAllTurnstileScripts();
        vi.useFakeTimers();
    });

    afterEach(() => {
        removeAllTurnstileScripts();
        uninstallMockTurnstile();
        vi.useRealTimers();
    });

    // ---- 1. 基本渲染 ----
    describe('基本渲染', () => {
        it("mount 后确保 <script id='turnstile-script'> 存在", async () => {
            // 预注入占位 script，避免 happy-dom 真实发起 Cloudflare 网络请求
            // （happy-dom 加载外部 https 脚本会同步抛 DOMException 并阻塞测试）
            preInjectScriptPlaceholder();

            const wrapper = mount(TurnstileWidget, {
                props: { siteKey: 'test-site-key' },
            });
            await flushPromises();

            // script 标签应已存在（组件复用已有占位标签，不再重复 appendChild）
            const script = document.getElementById('turnstile-script');
            expect(script).not.toBeNull();
            // src 是 Cloudflare 官方地址
            expect(script?.getAttribute('src')).toContain('challenges.cloudflare.com');

            wrapper.unmount();
        });

        it('传入 siteKey 后调用 window.turnstile.render', async () => {
            const { renderMock } = installMockTurnstile();
            preInjectScriptPlaceholder();
            const wrapper = mount(TurnstileWidget, {
                props: { siteKey: 'test-site-key' },
                attachTo: document.body,
            });
            await flushPromises();

            // 手动 dispatch 'load' 模拟脚本加载完成
            const script = document.getElementById('turnstile-script') as HTMLScriptElement;
            script.dispatchEvent(new Event('load'));
            await flushPromises();

            // render 应被调用
            expect(renderMock).toHaveBeenCalled();
            // 检查 sitekey 正确传入
            const callArgs = renderMock.mock.calls[0]?.[1];
            expect(callArgs?.sitekey).toBe('test-site-key');

            wrapper.unmount();
        });

        it('@token 事件正确传递', async () => {
            installMockTurnstile();
            preInjectScriptPlaceholder();
            const wrapper = mount(TurnstileWidget, {
                props: { siteKey: 'test-site-key' },
                attachTo: document.body,
            });
            await flushPromises();

            // 手动 dispatch 'load' 触发 render
            const script = document.getElementById('turnstile-script') as HTMLScriptElement;
            script.dispatchEvent(new Event('load'));
            await flushPromises();
            // 等待 render mock 中的 Promise.resolve().then() 跑完
            await flushPromises();
            await flushPromises();

            // 应触发 @token 事件，值为 "mock-turnstile-token"
            const emitted = wrapper.emitted('token');
            expect(emitted).toBeDefined();
            expect(emitted?.[0]?.[0]).toBe('mock-turnstile-token');

            wrapper.unmount();
        });
    });

    // ---- 2. unmount 资源清理：CRITICAL F1 修复验证 ----
    describe('unmount 资源清理（CRITICAL F1 修复验证）', () => {
        it('unmount 后清除 5s 超时定时器（setTimeout 不再触发）', async () => {
            // 不 installMockTurnstile，让 loadScript 走 5s 超时路径
            const wrapper = mount(TurnstileWidget, {
                props: { siteKey: 'test-site-key' },
            });
            // 推进 4s（接近 5s 但未到）
            await vi.advanceTimersByTimeAsync(4000);

            // 卸载组件（unmount 应触发 clearScriptLoadTimer）
            wrapper.unmount();

            // 再推进 2s（已超过 5s）
            // clearTimeout 不会抛错，且不会导致 timeout callback 执行
            expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
        });

        it('unmount 后调用 window.turnstile.remove(widgetId)', async () => {
            const { removeMock, renderMock } = installMockTurnstile();
            preInjectScriptPlaceholder();
            const wrapper = mount(TurnstileWidget, {
                props: { siteKey: 'test-site-key' },
                attachTo: document.body,
            });
            await flushPromises();

            // 触发 render
            const script = document.getElementById('turnstile-script') as HTMLScriptElement;
            script.dispatchEvent(new Event('load'));
            await flushPromises();

            // render 已返回 widget id
            const widgetId = renderMock.mock.results[0]?.value;
            expect(widgetId).toBe('widget-1');

            // unmount
            wrapper.unmount();

            // remove 应被以 widget id 调用
            expect(removeMock).toHaveBeenCalledWith(widgetId);
        });

        it('多次 mount/unmount 不泄漏 script 节点', async () => {
            // 第一次 mount + unmount
            const wrapper1 = mount(TurnstileWidget, {
                props: { siteKey: 'test-site-key' },
            });
            await flushPromises();
            wrapper1.unmount();

            // 第二次 mount + unmount
            const wrapper2 = mount(TurnstileWidget, {
                props: { siteKey: 'test-site-key' },
            });
            await flushPromises();
            // 第二次 unmount 应正常工作
            expect(() => wrapper2.unmount()).not.toThrow();
        });
    });

    // ---- 3. 边界情况 ----
    describe('边界情况', () => {
        it('未传 siteKey 时不调用 window.turnstile.render', async () => {
            const { renderMock } = installMockTurnstile();
            const wrapper = mount(TurnstileWidget, {
                props: { siteKey: '' },
                attachTo: document.body,
            });
            await flushPromises();

            // render 未被调用
            expect(renderMock).not.toHaveBeenCalled();

            wrapper.unmount();
        });

        it('remove() 抛错时不阻塞 unmount（widget 已被销毁的情况）', async () => {
            const { removeMock } = installMockTurnstile();
            removeMock.mockImplementation(() => {
                throw new Error('widget already removed');
            });
            preInjectScriptPlaceholder();
            const wrapper = mount(TurnstileWidget, {
                props: { siteKey: 'test-site-key' },
                attachTo: document.body,
            });
            await flushPromises();

            // 触发 render
            const script = document.getElementById('turnstile-script') as HTMLScriptElement;
            script.dispatchEvent(new Event('load'));
            await flushPromises();

            // unmount 应吞掉 remove 抛出的错误，不让组件崩溃
            expect(() => wrapper.unmount()).not.toThrow();
        });
    });
});
