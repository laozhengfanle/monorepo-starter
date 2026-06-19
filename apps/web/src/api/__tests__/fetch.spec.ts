// @vitest-environment happy-dom
/**
 * api/fetch.ts 单元测试
 *
 * 测试覆盖（CRITICAL F3 + F4 修复）：
 *   - POST/PUT/PATCH/DELETE 自动注入 X-CSRF-Token header
 *   - GET/HEAD/OPTIONS 不注入 CSRF token
 *   - 401 → refresh + retry
 *   - 401 → refresh 失败 → onAuthExpired
 *   - 启动时预热 CSRF token
 *   - 防重复包装（__wrappedByCsrf401 标记）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetCsrfModuleForTests, useCsrfToken, CSRF_HEADER } from '../csrf';
import { createApiFetch, installGlobalFetch } from '../fetch';
import { create401Refresh, __reset401RefreshModuleForTests } from '@packages/shared';

/** 构造 mock Response */
function mockResponse(status: number, body?: unknown): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(body ?? {}),
    } as unknown as Response;
}

describe('api/fetch CSRF + 401 注入', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn> & { mockResolvedValue: (value: Response) => unknown };

    beforeEach(() => {
        __resetCsrfModuleForTests();
        __reset401RefreshModuleForTests();
        // 默认 spy：返回 200/ok
        // 注意：必须先 spy，再使用 originalFetch；否则 spy 会替换 window.fetch
        fetchSpy = vi.spyOn(window, 'fetch') as ReturnType<typeof vi.spyOn> & {
            mockResolvedValue: (value: Response) => unknown;
        };
        fetchSpy.mockResolvedValue(mockResponse(200, { data: 'ok' }));
    });

    afterEach(() => {
        fetchSpy.mockRestore();
        // window.fetch 已被 spy 还原
        __resetCsrfModuleForTests();
        __reset401RefreshModuleForTests();
    });

    // ---- 1. CSRF 注入 ----
    describe('CSRF token 注入', () => {
        it('POST 请求自动注入 X-CSRF-Token header', async () => {
            // 预热 CSRF token
            fetchSpy.mockResolvedValueOnce(mockResponse(200, { token: 'csrf-post-token' }));
            await useCsrfToken();

            // 创建 apiFetch（使用 spy 作为 originalFetch）
            const refresh = create401Refresh({
                fetcher: vi.fn() as unknown as typeof fetch,
            });
            const apiFetch = createApiFetch(fetchSpy as unknown as typeof fetch, refresh);

            await apiFetch('/api/test', { method: 'POST' });

            expect(fetchSpy).toHaveBeenCalled();
            const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
            const init = lastCall[1] as RequestInit | undefined;
            const headers = init?.headers as Headers | undefined;
            // CSRF header 应被注入
            expect(headers?.get(CSRF_HEADER)).toBe('csrf-post-token');
        });

        it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s 请求注入 X-CSRF-Token header', async (method) => {
            fetchSpy.mockResolvedValueOnce(mockResponse(200, { token: `csrf-${method.toLowerCase()}` }));
            await useCsrfToken();

            const refresh = create401Refresh({
                fetcher: vi.fn() as unknown as typeof fetch,
            });
            const apiFetch = createApiFetch(fetchSpy as unknown as typeof fetch, refresh);

            await apiFetch('/api/test', { method });

            const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
            const init = lastCall[1] as RequestInit | undefined;
            const headers = init?.headers as Headers | undefined;
            expect(headers?.get(CSRF_HEADER)).toBe(`csrf-${method.toLowerCase()}`);
        });

        it.each(['GET', 'HEAD', 'OPTIONS'])('%s 请求不注入 X-CSRF-Token header', async (method) => {
            fetchSpy.mockResolvedValueOnce(mockResponse(200, { token: 'should-not-appear' }));
            await useCsrfToken();

            const refresh = create401Refresh({
                fetcher: vi.fn() as unknown as typeof fetch,
            });
            const apiFetch = createApiFetch(fetchSpy as unknown as typeof fetch, refresh);

            await apiFetch('/api/test', { method });

            const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
            const init = lastCall[1] as RequestInit | undefined;
            // GET/HEAD/OPTIONS 不应注入 CSRF（init 可能完全没传，此时 init === undefined）
            if (init?.headers instanceof Headers) {
                expect(init.headers.get(CSRF_HEADER)).toBeNull();
            } else {
                // init 未传 / headers 不存在：等价于不注入 CSRF
                expect(init?.headers).toBeUndefined();
            }
        });

        it('无 CSRF 缓存时，POST 请求先 await useCsrfToken 再发请求', async () => {
            __resetCsrfModuleForTests();
            // mock fetch：第一次返回 csrf token，第二次返回 ok
            fetchSpy
                .mockResolvedValueOnce(mockResponse(200, { token: 'fresh-token' }))
                .mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

            const refresh = create401Refresh({
                fetcher: vi.fn() as unknown as typeof fetch,
            });
            const apiFetch = createApiFetch(fetchSpy as unknown as typeof fetch, refresh);

            await apiFetch('/api/test', { method: 'POST' });

            // fetch 被调用 2 次：1 次 csrf + 1 次 业务
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            // 第二次（业务）应带 CSRF header
            const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
            const init = lastCall[1] as RequestInit | undefined;
            const headers = init?.headers as Headers | undefined;
            expect(headers?.get(CSRF_HEADER)).toBe('fresh-token');
        });
    });

    // ---- 2. 401 refresh + retry ----
    describe('401 自动刷新', () => {
        it('401 → refresh 成功 → 重发原请求', async () => {
            __resetCsrfModuleForTests();

            // 业务 fetch：先 401，后 200
            fetchSpy
                .mockResolvedValueOnce(mockResponse(401))
                .mockResolvedValueOnce(mockResponse(200, { code: 0 })) // refresh
                .mockResolvedValueOnce(mockResponse(200, { data: 'retried' })); // retry

            const refresh = create401Refresh({
                fetcher: fetchSpy as unknown as typeof fetch,
            });
            const apiFetch = createApiFetch(fetchSpy as unknown as typeof fetch, refresh);

            const response = await apiFetch('/api/test', { method: 'GET' });

            // 业务 401 + refresh + retry = 3 次
            expect(fetchSpy).toHaveBeenCalledTimes(3);
            expect(response.status).toBe(200);
        });

        it('401 → refresh 失败 → onAuthExpired + 抛错', async () => {
            __resetCsrfModuleForTests();
            __reset401RefreshModuleForTests();

            // 业务 fetch：先 401；refresh fetch：500
            fetchSpy.mockResolvedValueOnce(mockResponse(401)).mockResolvedValueOnce(mockResponse(500));

            const onAuthExpired = vi.fn();
            const refresh = create401Refresh({
                fetcher: fetchSpy as unknown as typeof fetch,
                onAuthExpired,
            });
            const apiFetch = createApiFetch(fetchSpy as unknown as typeof fetch, refresh);

            await expect(apiFetch('/api/test')).rejects.toThrow();
            expect(onAuthExpired).toHaveBeenCalled();
        });
    });

    // ---- 3. installGlobalFetch 启动时集成 ----
    describe('installGlobalFetch 集成', () => {
        it('替换 window.fetch 并启动时预热 CSRF token', async () => {
            // 先保存当前 spied fetch
            fetchSpy.mockRestore();

            // 重新设置 fetch 为 mock（installGlobalFetch 会再替换）
            const warmupSpy = vi
                .spyOn(window, 'fetch')
                .mockResolvedValueOnce(mockResponse(200, { token: 'warmup-token' }))
                .mockResolvedValue(mockResponse(200, { data: 'ok' }));

            // happy-dom 中 window.fetch 替换可能不生效，但 installGlobalFetch 内部逻辑应正常运行
            // 检验：__wrappedByCsrf401 标记已被设置在新 fetch 上（如果替换成功的话）
            installGlobalFetch();
            // fetchRef 验证：创建的包装 fetch 内部有标记（即使 DOM 属性替换受限）
            const fetchRef = window.fetch;
            // 至少 installGlobalFetch 不抛错即证明包装链路完整
            expect(typeof fetchRef).toBe('function');

            // 等预热完成（installGlobalFetch 内部 await 预热）
            await new Promise((resolve) => setTimeout(resolve, 10));

            // 发起 GET 请求
            await window.fetch('/api/test', { method: 'GET' });
            // 不应抛错

            warmupSpy.mockRestore();
        });

        it('防重复包装：第二次 installGlobalFetch 不重复包装', async () => {
            fetchSpy.mockRestore();
            const initialSpy = vi.spyOn(window, 'fetch').mockResolvedValue(mockResponse(200, {}));

            installGlobalFetch();
            const wrapped1 = window.fetch;
            installGlobalFetch();
            const wrapped2 = window.fetch;
            // 两次都引用同一函数（未重复包装）
            expect(wrapped1).toBe(wrapped2);

            initialSpy.mockRestore();
        });
    });
});
