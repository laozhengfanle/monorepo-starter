/**
 * useFormSubmit 单元测试
 *
 * 测试覆盖：
 *   1. 500ms 内连点 3 次只发 1 次
 *   2. 成功后禁用（loading=true 时不响应）
 *   3. 错误后允许重试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useFormSubmit } from '../useFormSubmit';

describe('useFormSubmit 防抖 composable', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ============================================================
    // 场景 1：500ms 内连点 3 次只发 1 次
    // ============================================================
    it('500ms 内连点 3 次只发 1 次 API 请求', async () => {
        const apiFn = vi.fn().mockResolvedValue({ ok: true });
        const { submit } = useFormSubmit(apiFn, { debounceMs: 500 });

        // 连点 3 次（参数不同，验证只发 1 次且用最后一次参数）
        // 三个 promise 故意不 await — 测试语义是"防抖窗口期内"不该被外部消费
        const _p1 = submit('a');
        const _p2 = submit('b');
        const _p3 = submit('c');
        // 标注使用避免 lint 误报（语义上"创建了 promise 但不 await"才是正确的）
        void _p1;
        void _p2;
        void _p3;

        // 此时还没到 500ms，apiFn 还没被调用
        expect(apiFn).toHaveBeenCalledTimes(0);

        // 推进时间 500ms，触发防抖回调
        await vi.advanceTimersByTimeAsync(500);
        // 给 microtask 多次轮转机会，让 async 链 resolve
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(0);

        // 现在应该只调用 1 次，参数是最后一次的 'c'
        expect(apiFn).toHaveBeenCalledTimes(1);
        expect(apiFn).toHaveBeenCalledWith('c');
    }, 10000);

    // ============================================================
    // 场景 2：成功后禁用（loading=true 时不响应）
    // ============================================================
    it('loading=true 时不响应新调用（防抖窗口结束后）', async () => {
        // 用对象包一层 resolveApi，避免 vue-tsc 在闭包里把 let 变量 narrow 成 never
        const resolveRef: { fn: ((v: unknown) => void) | null } = { fn: null };
        const apiFn = vi.fn().mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveRef.fn = resolve;
                }),
        );
        const { submit, loading } = useFormSubmit(apiFn, { debounceMs: 100 });

        // 第一次提交
        const p1 = submit('first');

        // 推进时间触发防抖
        await vi.advanceTimersByTimeAsync(100);
        // 此时 apiFn 已经被调用，loading=true
        expect(apiFn).toHaveBeenCalledTimes(1);
        expect(loading.value).toBe(true);

        // loading=true 时新提交被忽略
        const p2 = submit('second');
        // 推进更多时间
        await vi.advanceTimersByTimeAsync(500);
        // apiFn 仍然只调用了 1 次
        expect(apiFn).toHaveBeenCalledTimes(1);

        // 让 promise resolve，loading 回到 false
        resolveRef.fn?.({ ok: true });
        await p1;
        expect(loading.value).toBe(false);

        // 现在的 p2 应该在 loading 结束后
        // 但因为它在 loading 期间被丢弃，所以 p2 直接 resolve undefined
        const r2 = await p2;
        expect(r2).toBeUndefined();
    });

    // ============================================================
    // 场景 3：错误后允许重试
    // ============================================================
    it('API 抛出错误后，loading 重置，允许重试', async () => {
        let shouldFail = true;
        const apiFn = vi.fn().mockImplementation(async () => {
            if (shouldFail) {
                throw new Error('API failed');
            }
            return { ok: true };
        });
        const { submit, loading } = useFormSubmit(apiFn, { debounceMs: 100 });

        // 第一次提交（会失败）— 用 unhandled-rejection-safe 模式包一层
        const p1 = submit('first').catch((err) => err);
        await vi.advanceTimersByTimeAsync(100);

        // 等待 promise 完成（应该是 rejected → catch 转为 fulfilled with error）
        const r1 = await p1;
        expect(r1).toBeInstanceOf(Error);
        expect((r1 as Error).message).toBe('API failed');

        // loading 应该回到 false
        expect(loading.value).toBe(false);

        // 重试（应成功）
        shouldFail = false;
        const p2 = submit('second');
        await vi.advanceTimersByTimeAsync(100);

        const r2 = await p2;
        expect(r2).toEqual({ ok: true });

        // 共调用 2 次
        expect(apiFn).toHaveBeenCalledTimes(2);
        expect(apiFn).toHaveBeenNthCalledWith(1, 'first');
        expect(apiFn).toHaveBeenNthCalledWith(2, 'second');
    });

    // ============================================================
    // 边界场景
    // ============================================================
    it('默认 debounceMs = 500', async () => {
        const apiFn = vi.fn().mockResolvedValue({ ok: true });
        const { submit } = useFormSubmit(apiFn);

        submit('test');

        // 推进 499ms，不应触发
        await vi.advanceTimersByTimeAsync(499);
        expect(apiFn).toHaveBeenCalledTimes(0);

        // 推进到 500ms，触发
        await vi.advanceTimersByTimeAsync(1);
        expect(apiFn).toHaveBeenCalledTimes(1);
    });

    it('reset() 强制重置 loading 状态', async () => {
        const apiFn = vi.fn().mockImplementation(
            () => new Promise(() => {}), // 永不 resolve
        );
        const { submit, loading, reset } = useFormSubmit(apiFn, { debounceMs: 100 });

        submit('test');
        await vi.advanceTimersByTimeAsync(100);

        expect(loading.value).toBe(true);

        reset();
        expect(loading.value).toBe(false);
    });
});
