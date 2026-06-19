/**
 * GraphQL 客户端单元测试
 *
 * 重点覆盖：
 * 1. 5xx 短暂重试（Vite dev proxy 偶发 502/504）
 * 2. 非 JSON 响应暴露真实 status（修复前被吞成"服务器响应格式异常"）
 * 3. 超时 → 408 GraphQLError
 * 4. 网络异常 → status 0
 * 5. 401 → refresh 重试
 * 6. CSRF 403 → 清缓存重试
 * 7. GraphQL errors 正常透传
 * 8. 业务码 20003 → handleAuthExpired 硬跳登录页
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 依赖（在 import gqlQuery 前完成）
// 路径相对 test 文件位置：test 在 __tests__/ 子目录，模块在父目录
vi.mock('../auth-refresh', () => ({
    refreshAuthToken: vi.fn().mockResolvedValue(false),
}));
vi.mock('../auth-expired', () => ({
    handleAuthExpired: vi.fn(),
}));
vi.mock('../request', () => ({
    removeAuthStatus: vi.fn(),
}));
vi.mock('../csrf', () => ({
    getCsrfToken: vi.fn().mockResolvedValue(''),
    clearCsrfToken: vi.fn(),
}));
vi.mock('../request-config', () => ({
    getRequestTimeout: vi.fn().mockReturnValue(5000),
}));
vi.mock('@/shared/composables/useErrorMessage', () => ({
    translateErrorCode: vi.fn((code: number) => `translated-${code}`),
}));

import { gqlQuery, GraphQLError } from '../graphql-client';
import { handleAuthExpired } from '../auth-expired';
import { refreshAuthToken } from '../auth-refresh';
import { clearCsrfToken } from '../csrf';

/** 构造一个带 ok / status / json() / text() 的 mock Response */
function mockResponse(opts: {
    status?: number;
    ok?: boolean;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
}): Response {
    const status = opts.status ?? 200;
    const ok = opts.ok ?? (status >= 200 && status < 300);
    return {
        status,
        ok,
        json: opts.json ?? (async () => ({})),
        text: opts.text ?? (async () => ''),
        clone() {
            return this;
        },
    } as unknown as Response;
}

/** 用 vi.fn() 替换全局 fetch */
const fetchMock = vi.fn();
beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(handleAuthExpired).mockClear();
    vi.mocked(refreshAuthToken).mockReset();
    vi.mocked(clearCsrfToken).mockClear();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('gqlQuery — 5xx 处理', () => {
    it('502 短暂重试一次后成功（Vite dev proxy 偶发 502 场景）', async () => {
        fetchMock
            .mockResolvedValueOnce(
                mockResponse({
                    status: 502,
                    json: async () => {
                        throw new SyntaxError('not json');
                    },
                }),
            )
            .mockResolvedValueOnce(mockResponse({ status: 200, json: async () => ({ data: { ok: 1 } }) }));

        const data = await gqlQuery<{ ok: number }>('query { ok }');
        expect(data).toEqual({ ok: 1 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('502 重试仍失败 → 抛 GraphQLError，message 包含真实 status', async () => {
        fetchMock.mockResolvedValue(
            mockResponse({
                status: 502,
                json: async () => {
                    throw new SyntaxError('not json');
                },
                text: async () => '<html>502 Bad Gateway</html>',
            }),
        );

        await expect(gqlQuery('query { ok }')).rejects.toMatchObject({
            status: 502,
            message: expect.stringContaining('502'),
        });
    });

    it('504 同样会重试一次', async () => {
        fetchMock
            .mockResolvedValueOnce(
                mockResponse({
                    status: 504,
                    json: async () => {
                        throw new SyntaxError('not json');
                    },
                }),
            )
            .mockResolvedValueOnce(mockResponse({ status: 200, json: async () => ({ data: { ok: 1 } }) }));

        const data = await gqlQuery('query { ok }');
        expect(data).toEqual({ ok: 1 });
    });

    it('mutation 遇到 5xx 不重试（避免副作用执行两次）', async () => {
        fetchMock.mockResolvedValue(
            mockResponse({
                status: 503,
                json: async () => {
                    throw new SyntaxError('not json');
                },
                text: async () => 'service unavailable',
            }),
        );

        await expect(gqlQuery('mutation { doSomething { id } }')).rejects.toMatchObject({
            status: 503,
        });
        /** 只调一次 fetch（mutation 不重试） */
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('4xx 不重试', async () => {
        fetchMock.mockResolvedValue(
            mockResponse({
                status: 400,
                json: async () => ({ errors: [{ message: 'bad' }] }),
            }),
        );

        await expect(gqlQuery('query { ok }')).rejects.toBeInstanceOf(GraphQLError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('gqlQuery — 错误处理', () => {
    it('非 JSON 响应暴露 status + body 片段', async () => {
        fetchMock.mockResolvedValue(
            mockResponse({
                status: 502,
                json: async () => {
                    throw new SyntaxError('not json');
                },
                text: async () => '<html>Bad Gateway from upstream</html>',
            }),
        );

        const err = (await gqlQuery('query { ok }').catch((e) => e)) as GraphQLError;
        expect(err).toBeInstanceOf(GraphQLError);
        expect(err.status).toBe(502);
        /** 真实 status 暴露在 message 里，方便排查 */
        expect(err.message).toContain('502');
        /** 错误类型提示 */
        expect(err.message).toMatch(/Vite proxy|反代/);
    });

    it('超时 → 408 GraphQLError', async () => {
        fetchMock.mockRejectedValue(
            Object.assign(new DOMException('aborted', 'TimeoutError'), { name: 'TimeoutError' }),
        );

        const err = (await gqlQuery('query { ok }').catch((e) => e)) as GraphQLError;
        expect(err).toBeInstanceOf(GraphQLError);
        expect(err.status).toBe(408);
    });

    it('网络异常（断网）→ status 0', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

        const err = (await gqlQuery('query { ok }').catch((e) => e)) as GraphQLError;
        expect(err).toBeInstanceOf(GraphQLError);
        expect(err.status).toBe(0);
    });

    it('401 + refresh 成功 → 重发原请求', async () => {
        vi.mocked(refreshAuthToken).mockResolvedValueOnce(true);
        fetchMock
            .mockResolvedValueOnce(mockResponse({ status: 401 }))
            .mockResolvedValueOnce(mockResponse({ status: 200, json: async () => ({ data: { ok: 1 } }) }));

        const data = await gqlQuery<{ ok: number }>('query { ok }');
        expect(data).toEqual({ ok: 1 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('401 + refresh 失败 → 抛 20003 业务码', async () => {
        vi.mocked(refreshAuthToken).mockResolvedValueOnce(false);
        fetchMock.mockResolvedValue(mockResponse({ status: 401 }));

        await expect(gqlQuery('query { ok }')).rejects.toMatchObject({
            status: 401,
            errors: [{ extensions: { code: 20003 } }],
        });
    });

    it('CSRF 403 mutation → 清缓存重试一次', async () => {
        fetchMock
            .mockResolvedValueOnce(
                mockResponse({
                    status: 403,
                    json: async () => ({ message: 'CSRF token mismatch' }),
                }),
            )
            .mockResolvedValueOnce(mockResponse({ status: 200, json: async () => ({ data: { ok: 1 } }) }));

        const data = await gqlQuery<{ ok: number }>('mutation { doSomething { id } }');
        expect(data).toEqual({ ok: 1 });
        expect(clearCsrfToken).toHaveBeenCalledTimes(1);
    });
});

describe('gqlQuery — GraphQL errors 透传', () => {
    it('业务码 20003 → handleAuthExpired 硬跳登录页', async () => {
        fetchMock.mockResolvedValue(
            mockResponse({
                status: 200,
                json: async () => ({
                    errors: [{ message: '未认证', extensions: { code: '20003' } }],
                }),
            }),
        );

        await expect(gqlQuery('query { me { id } }')).rejects.toBeInstanceOf(GraphQLError);
        expect(handleAuthExpired).toHaveBeenCalled();
    });

    it('普通业务错误 → 抛 GraphQLError 含 errors 数组', async () => {
        fetchMock.mockResolvedValue(
            mockResponse({
                status: 200,
                json: async () => ({
                    errors: [{ message: '权限不足', extensions: { code: '20010' } }],
                }),
            }),
        );

        const err = (await gqlQuery('query { ok }').catch((e) => e)) as GraphQLError;
        expect(err).toBeInstanceOf(GraphQLError);
        expect(err.errors[0].message).toBe('权限不足');
    });
});
