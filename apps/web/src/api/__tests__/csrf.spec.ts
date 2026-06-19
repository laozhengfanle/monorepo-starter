// @vitest-environment happy-dom
/**
 * CSRF token 管理模块单元测试（CRITICAL F4 修复）
 *
 * 测试覆盖：
 *   - useCsrfToken 首次调用触发 fetch /api/auth/csrf-token
 *   - 缓存命中：1 小时内不重复请求
 *   - 缓存过期：重新请求
 *   - 并发请求 in-flight dedup
 *   - 响应体格式兼容（扁平 vs 业务封装）
 *   - getCsrfHeaderValue 同步取缓存（无网络）
 *   - clearCsrfToken 清空缓存
 *   - 失败时清空 in-flight，允许重试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useCsrfToken, getCsrfHeaderValue, clearCsrfToken, __resetCsrfModuleForTests, CSRF_HEADER } from '../csrf';

/** 构造 mock Response */
function mockResponse(status: number, body?: unknown): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(body ?? {}),
    } as unknown as Response;
}

describe('csrf', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn> & { mockResolvedValue: (value: Response) => unknown };

    beforeEach(() => {
        __resetCsrfModuleForTests();
        // 默认 spy：返回 200/ok，body 为空
        fetchSpy = vi.spyOn(globalThis, 'fetch') as ReturnType<typeof vi.spyOn> & {
            mockResolvedValue: (value: Response) => unknown;
        };
        fetchSpy.mockResolvedValue(mockResponse(200, {}));
    });

    afterEach(() => {
        fetchSpy.mockRestore();
        __resetCsrfModuleForTests();
    });

    // ---- 1. CSRF_HEADER 常量 ----
    it('CSRF_HEADER 导出正确的 header 名称', () => {
        expect(CSRF_HEADER).toBe('X-CSRF-Token');
    });

    // ---- 2. getCsrfHeaderValue 同步取缓存 ----
    describe('getCsrfHeaderValue', () => {
        it('无缓存时返回 null', () => {
            clearCsrfToken();
            expect(getCsrfHeaderValue()).toBeNull();
        });
    });

    // ---- 3. useCsrfToken 异步获取 ----
    describe('useCsrfToken 首次获取', () => {
        it('响应体扁平格式 { token } 正确解析', async () => {
            fetchSpy.mockResolvedValue(mockResponse(200, { token: 'csrf-abc-123' }));

            const token = await useCsrfToken();

            expect(token).toBe('csrf-abc-123');
            // fetchSpy 调用 URL 是 /api/auth/csrf-token
            expect(fetchSpy).toHaveBeenCalledWith('/api/auth/csrf-token', expect.objectContaining({ method: 'GET' }));
        });

        it('响应体业务封装 { code: 0, data: { token } } 正确解析', async () => {
            fetchSpy.mockResolvedValue(mockResponse(200, { code: 0, data: { token: 'csrf-xyz-789' } }));

            const token = await useCsrfToken();

            expect(token).toBe('csrf-xyz-789');
        });

        it('HTTP 非 2xx 抛错', async () => {
            fetchSpy.mockResolvedValue(mockResponse(500, { error: 'internal' }));

            await expect(useCsrfToken()).rejects.toThrow(/获取 token 失败/);
        });

        it('响应体中无 token 字段抛错', async () => {
            fetchSpy.mockResolvedValue(mockResponse(200, { data: 'no-token-here' }));

            await expect(useCsrfToken()).rejects.toThrow(/未找到 token 字段/);
        });
    });

    // ---- 4. 缓存 ----
    describe('缓存行为', () => {
        it('缓存命中：1 小时内不重复请求', async () => {
            fetchSpy.mockResolvedValue(mockResponse(200, { token: 'token-1' }));
            const t1 = await useCsrfToken();
            expect(t1).toBe('token-1');
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            // 第二次调用应命中缓存，不发请求
            const t2 = await useCsrfToken();
            expect(t2).toBe('token-1');
            expect(fetchSpy).toHaveBeenCalledTimes(1); // 没有新请求
        });

        it('缓存命中后 getCsrfHeaderValue 同步返回 token', async () => {
            fetchSpy.mockResolvedValue(mockResponse(200, { token: 'sync-token' }));
            await useCsrfToken();

            // 同步接口直接返回缓存值（不触发 fetch）
            expect(getCsrfHeaderValue()).toBe('sync-token');
        });

        it('clearCsrfToken 清空缓存后重新请求', async () => {
            fetchSpy.mockResolvedValue(mockResponse(200, { token: 'token-1' }));
            await useCsrfToken();
            expect(getCsrfHeaderValue()).toBe('token-1');

            clearCsrfToken();
            expect(getCsrfHeaderValue()).toBeNull();

            // 再次获取应触发新请求
            fetchSpy.mockResolvedValue(mockResponse(200, { token: 'token-2' }));
            const t2 = await useCsrfToken();
            expect(t2).toBe('token-2');
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('缓存过期（>1h）后重新请求', async () => {
            fetchSpy.mockResolvedValue(mockResponse(200, { token: 'token-1' }));
            await useCsrfToken();
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            // 快进 1 小时 + 1ms
            const now = Date.now();
            const dateNowSpy = vi.spyOn(Date, 'now');
            dateNowSpy.mockReturnValue(now + 60 * 60 * 1000 + 1);

            // 缓存过期，应重新请求
            fetchSpy.mockResolvedValue(mockResponse(200, { token: 'token-2' }));
            const t2 = await useCsrfToken();
            expect(t2).toBe('token-2');
            expect(fetchSpy).toHaveBeenCalledTimes(2);

            dateNowSpy.mockRestore();
        });
    });

    // ---- 5. 并发去重 ----
    describe('并发 in-flight dedup', () => {
        it('并发 3 个 useCsrfToken 只触发 1 次 fetch', async () => {
            fetchSpy.mockResolvedValue(mockResponse(200, { token: 'concurrent-token' }));

            const [t1, t2, t3] = await Promise.all([useCsrfToken(), useCsrfToken(), useCsrfToken()]);

            // 3 个都拿到相同 token
            expect(t1).toBe('concurrent-token');
            expect(t2).toBe('concurrent-token');
            expect(t3).toBe('concurrent-token');
            // 只发 1 次请求
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });
    });

    // ---- 6. 失败重试 ----
    describe('失败后允许重试', () => {
        it('fetch 失败后清空 inflight，下次可重试', async () => {
            fetchSpy.mockResolvedValue(mockResponse(500, { error: 'fail' }));

            await expect(useCsrfToken()).rejects.toThrow();

            // 下次应能重新尝试（in-flight 已清空）
            fetchSpy.mockResolvedValue(mockResponse(200, { token: 'retry-token' }));
            const token = await useCsrfToken();
            expect(token).toBe('retry-token');
        });
    });
});
