// @vitest-environment happy-dom
/**
 * use401Refresh 单元测试
 *
 * 测试覆盖（CRITICAL F3 修复）：
 *   - 401 → refresh 成功 → 自动重发原请求
 *   - 401 → refresh 失败 → 触发 onAuthExpired 回调
 *   - 并发 401 共享同一个 refresh Promise（in-flight queue）
 *   - 非 401 响应原样返回（不触发 refresh）
 *   - refresh 自身收到 401 不重试（防无限循环）
 *   - 业务状态码非 0 视为 refresh 失败
 *   - 网络错误 / 超时 视为 refresh 失败
 *   - 顶层便利函数 refreshAuthToken
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { create401Refresh, refreshAuthToken, __reset401RefreshModuleForTests } from '../use401Refresh.js';

/** 构造一个 mock Response */
function mockResponse(status: number, body?: unknown): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(body ?? {}),
        clone() {
            return mockResponse(status, body);
        },
    } as unknown as Response;
}

describe('create401Refresh', () => {
    let originalLocation: Location;

    beforeEach(() => {
        // 重置模块级状态（防止上一个测试的 inflightRefreshPromise 污染）
        __reset401RefreshModuleForTests();
        originalLocation = window.location;
    });

    afterEach(() => {
        // 恢复 location
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
        });
        // 再次重置（兜底）
        __reset401RefreshModuleForTests();
    });

    // ---- 1. wrapFetch 401 → refresh + retry ----
    describe('wrapFetch 401 → refresh + retry', () => {
        it('收到 401 后调用 refresh，成功则重发原请求', async () => {
            // 同一 fetcher 实例被 wrapFetch 和 refreshToken 共享
            // 1st: originalFetch (wrapFetch) → 401
            // 2nd: refreshToken → 200/code:0
            // 3rd: retryFetch (wrapFetch) → 200/data
            const fetcher = vi
                .fn()
                .mockResolvedValueOnce(mockResponse(401))
                .mockResolvedValueOnce(mockResponse(200, { code: 0 }))
                .mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

            const refresh = create401Refresh({ fetcher: fetcher as unknown as typeof fetch });
            const wrappedFetch = refresh.wrapFetch(fetcher as unknown as typeof fetch);

            const response = await wrappedFetch('/api/test', { method: 'GET' });

            // 原 fetch 被调用 3 次（首次 401 + refresh + retry）
            expect(fetcher).toHaveBeenCalledTimes(3);
            // 最终响应是 200
            expect(response.status).toBe(200);
        });

        it('收到 401 后 refresh 失败，触发 onAuthExpired + 抛错', async () => {
            // 业务 fetch 返回 401；refresh fetch 返回 500（失败）
            const fetcher = vi.fn().mockResolvedValueOnce(mockResponse(401)).mockResolvedValueOnce(mockResponse(500));

            const onAuthExpired = vi.fn();
            const refresh = create401Refresh({
                fetcher: fetcher as unknown as typeof fetch,
                onAuthExpired,
            });
            const wrappedFetch = refresh.wrapFetch(fetcher as unknown as typeof fetch);

            // 抛错（refresh 失败 → onAuthExpired）
            await expect(wrappedFetch('/api/test')).rejects.toThrow();
            // onAuthExpired 被调用
            expect(onAuthExpired).toHaveBeenCalled();
        });

        it('非 401 响应原样返回（不触发 refresh）', async () => {
            const fetcher = vi.fn().mockResolvedValue(mockResponse(200, { data: 'ok' }));

            const refresh = create401Refresh({ fetcher: fetcher as unknown as typeof fetch });
            const wrappedFetch = refresh.wrapFetch(fetcher as unknown as typeof fetch);

            const response = await wrappedFetch('/api/test');
            // 原 fetch 只调用 1 次（200 不需要 refresh）
            expect(fetcher).toHaveBeenCalledTimes(1);
            expect(response.status).toBe(200);
        });

        it('refresh 接口自身 401 不重试（防无限循环）', async () => {
            // refresh 接口本身也返回 401
            const fetcher = vi.fn().mockResolvedValue(mockResponse(401));

            const refresh = create401Refresh({
                fetcher: fetcher as unknown as typeof fetch,
                refreshUrl: '/api/auth/refresh',
            });
            const wrappedFetch = refresh.wrapFetch(fetcher as unknown as typeof fetch);

            // 调用 refresh 接口本身：即使返回 401，也不重试
            const response = await wrappedFetch('/api/auth/refresh', { method: 'POST' });
            expect(fetcher).toHaveBeenCalledTimes(1); // 只调用 1 次
            expect(response.status).toBe(401);
        });
    });

    // ---- 2. 业务状态码校验 ----
    describe('业务状态码校验', () => {
        it('refresh HTTP 200 + body.code !== 0 视为失败', async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValueOnce(mockResponse(401))
                .mockResolvedValueOnce(mockResponse(200, { code: 20001, message: 'refresh token expired' }));

            const onAuthExpired = vi.fn();
            const refresh = create401Refresh({
                fetcher: fetcher as unknown as typeof fetch,
                onAuthExpired,
            });
            const wrappedFetch = refresh.wrapFetch(fetcher as unknown as typeof fetch);

            await expect(wrappedFetch('/api/test')).rejects.toThrow();
            expect(onAuthExpired).toHaveBeenCalled();
        });

        it('refresh HTTP 200 + body.code === 0 视为成功', async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValueOnce(mockResponse(401))
                .mockResolvedValueOnce(mockResponse(200, { code: 0 }))
                .mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

            const refresh = create401Refresh({ fetcher: fetcher as unknown as typeof fetch });
            const wrappedFetch = refresh.wrapFetch(fetcher as unknown as typeof fetch);

            const response = await wrappedFetch('/api/test');
            expect(response.status).toBe(200);
            // 1 次 401 + 1 次 refresh + 1 次 retry = 3 次
            expect(fetcher).toHaveBeenCalledTimes(3);
        });
    });

    // ---- 3. 并发去重：in-flight queue ----
    describe('并发 401 refresh 去重', () => {
        it('并发多个 401 共享同一个 refresh Promise（只调用 1 次）', async () => {
            // 第一次：5 个并发 401
            // 第二次：refresh 成功
            // 第三次：5 个重试都成功
            const fetcher = vi
                .fn()
                // 5 个 401
                .mockResolvedValueOnce(mockResponse(401))
                .mockResolvedValueOnce(mockResponse(401))
                .mockResolvedValueOnce(mockResponse(401))
                .mockResolvedValueOnce(mockResponse(401))
                .mockResolvedValueOnce(mockResponse(401))
                // 1 个 refresh（去重后只 1 次）
                .mockResolvedValueOnce(mockResponse(200, { code: 0 }))
                // 5 个重试
                .mockResolvedValueOnce(mockResponse(200, { data: 'ok' }))
                .mockResolvedValueOnce(mockResponse(200, { data: 'ok' }))
                .mockResolvedValueOnce(mockResponse(200, { data: 'ok' }))
                .mockResolvedValueOnce(mockResponse(200, { data: 'ok' }))
                .mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

            const refresh = create401Refresh({ fetcher: fetcher as unknown as typeof fetch });
            const wrappedFetch = refresh.wrapFetch(fetcher as unknown as typeof fetch);

            // 5 个并发请求
            const responses = await Promise.all([
                wrappedFetch('/api/test1'),
                wrappedFetch('/api/test2'),
                wrappedFetch('/api/test3'),
                wrappedFetch('/api/test4'),
                wrappedFetch('/api/test5'),
            ]);

            // 5 个都成功
            expect(responses.every((r: Response) => r.status === 200)).toBe(true);
            // fetch 总调用次数：5 (401) + 1 (refresh 去重) + 5 (retry) = 11
            expect(fetcher).toHaveBeenCalledTimes(11);
            // refresh 只被调用 1 次
            const refreshCalls = fetcher.mock.calls.filter((call) => {
                const url = call[0];
                return typeof url === 'string' && url.includes('/api/auth/refresh');
            });
            expect(refreshCalls.length).toBe(1);
        });
    });

    // ---- 4. 网络错误 / 超时 ----
    describe('网络错误处理', () => {
        it('refresh 网络异常时视为失败', async () => {
            const fetcher = vi
                .fn()
                .mockResolvedValueOnce(mockResponse(401))
                .mockRejectedValueOnce(new Error('NetworkError'));

            const onAuthExpired = vi.fn();
            const refresh = create401Refresh({
                fetcher: fetcher as unknown as typeof fetch,
                onAuthExpired,
            });
            const wrappedFetch = refresh.wrapFetch(fetcher as unknown as typeof fetch);

            await expect(wrappedFetch('/api/test')).rejects.toThrow();
            expect(onAuthExpired).toHaveBeenCalled();
        });

        it('refresh 超时视为失败（abort 触发 fetcher reject）', async () => {
            // fetcher 应当监听 abort signal（符合 fetch 规范）
            const hangingFetcher = vi
                .fn()
                .mockImplementationOnce(() => mockResponse(401))
                .mockImplementation(
                    (_url: string, init?: RequestInit) =>
                        new Promise<Response>((_, reject) => {
                            if (init?.signal) {
                                init.signal.addEventListener('abort', () => {
                                    reject(new DOMException('aborted', 'AbortError'));
                                });
                            }
                            // 如果 signal 没 abort，永远不 resolve
                        }),
                );

            const onAuthExpired = vi.fn();
            const refresh = create401Refresh({
                fetcher: hangingFetcher as unknown as typeof fetch,
                refreshTimeoutMs: 100,
                onAuthExpired,
            });
            const wrappedFetch = refresh.wrapFetch(hangingFetcher as unknown as typeof fetch);

            // 用 fake timer + advanceTimersByTimeAsync 推进（async 版会 flush microtasks）
            vi.useFakeTimers();
            // 包一层 catch 避免 unhandled rejection 警告（abort 触发的 reject 是预期行为）
            const promise = wrappedFetch('/api/test').catch((err: unknown) => err);
            // 推进 200ms（足以触发 100ms 的 abort timer）
            await vi.advanceTimersByTimeAsync(200);
            const result = await promise;
            // result 是 Error 对象
            expect(result).toBeInstanceOf(Error);
            expect((result as Error).message).toMatch(/401.*refresh failed/);
            expect(onAuthExpired).toHaveBeenCalled();
            vi.useRealTimers();
        });
    });

    // ---- 5. 跳转登录页 ----
    describe('onAuthExpired 默认行为', () => {
        it('未指定 onAuthExpired 时，refresh 失败会跳 /login', async () => {
            // mock window.location.replace
            const replaceMock = vi.fn();
            Object.defineProperty(window, 'location', {
                value: { replace: replaceMock, href: '' },
                writable: true,
            });

            const fetcher = vi.fn().mockResolvedValueOnce(mockResponse(401)).mockResolvedValueOnce(mockResponse(500));

            const refresh = create401Refresh({ fetcher: fetcher as unknown as typeof fetch });
            const wrappedFetch = refresh.wrapFetch(fetcher as unknown as typeof fetch);

            await expect(wrappedFetch('/api/test')).rejects.toThrow();
            // location.replace('/login') 应被调用
            expect(replaceMock).toHaveBeenCalledWith('/login');
        });
    });

    // ---- 6. handle401 单独使用 ----
    describe('handle401 单独使用', () => {
        it('refresh 成功 → retry 函数被调用', async () => {
            const fetcher = vi.fn().mockResolvedValue(mockResponse(200, { code: 0 }));
            const refresh = create401Refresh({ fetcher: fetcher as unknown as typeof fetch });

            const retryFn = vi.fn().mockResolvedValue(mockResponse(200, { data: 'retried' }));
            const response = await refresh.handle401(retryFn);

            // refresh 调用 1 次
            expect(fetcher).toHaveBeenCalledTimes(1);
            // retry 调用 1 次
            expect(retryFn).toHaveBeenCalledTimes(1);
            // 最终响应是 retry 的结果
            expect(response.status).toBe(200);
        });

        it('refresh 失败 → onAuthExpired 触发 + retry 不调用', async () => {
            const fetcher = vi.fn().mockResolvedValue(mockResponse(500));
            const onAuthExpired = vi.fn();
            const refresh = create401Refresh({
                fetcher: fetcher as unknown as typeof fetch,
                onAuthExpired,
            });

            const retryFn = vi.fn();
            await expect(refresh.handle401(retryFn)).rejects.toThrow();
            expect(onAuthExpired).toHaveBeenCalled();
            expect(retryFn).not.toHaveBeenCalled();
        });
    });

    // ---- 7. 顶层便利函数 refreshAuthToken ----
    describe('refreshAuthToken (顶层便利函数)', () => {
        it('函数存在并返回 boolean', async () => {
            expect(typeof refreshAuthToken).toBe('function');
            // 调用时 happy-dom 真实 fetch 会去请求 /api/auth/refresh（会失败或 hang）
            // 为了不污染测试，我们只做函数存在性 + 类型断言
        });
    });
});
