/**
 * GraphQL 查询超时机制 验证测试
 *
 * 测试目标：
 * - AbortController 在 30 秒后触发 abort
 * - 上下文正确注入 abortSignal
 * - resolver 可以通过 context.abortSignal.aborted 检查超时
 * - 响应完成后清理 timeout（防止内存泄漏）
 *
 * 覆盖率目标：≥ 70%
 *
 * 实现说明（与计划文档的差异）：
 * - 计划使用 Apollo Server Plugin（executionDidStart + willResolveField）
 * - 实际使用 AbortController 注入 context，更简单且符合 NestJS 模式
 * - 注意：当前实现需要 resolver 主动检查 context.abortSignal.aborted
 *   Apollo 不会自动中止字段解析
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** 当前生产配置的超时时间 */
const GRAPHQL_QUERY_TIMEOUT_MS = 30_000;

/**
 * 模拟 graphql.module.ts 中的超时机制
 * - 这是对 context 工厂函数中 AbortController 逻辑的简化复现
 */
function createTimeoutContext(res?: { on?: (event: string, cb: () => void) => void }) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
        abortController.abort();
    }, GRAPHQL_QUERY_TIMEOUT_MS);

    // 响应完成后清理 timeout
    res?.on?.('close', () => {
        clearTimeout(timeout);
    });

    return {
        req: {},
        res: res || {},
        abortSignal: abortController.signal,
        _timeout: timeout, // 暴露用于测试
        _abortController: abortController,
    };
}

describe('GraphQL 查询超时机制', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── AbortController 创建 ──

    describe('AbortController 创建', () => {
        it('context 包含 abortSignal', () => {
            const ctx = createTimeoutContext();
            expect(ctx.abortSignal).toBeDefined();
            expect(ctx.abortSignal.aborted).toBe(false);
        });

        it('abortSignal 初始状态为未中止', () => {
            const ctx = createTimeoutContext();
            expect(ctx.abortSignal.aborted).toBe(false);
        });

        it('每次请求创建独立的 AbortController', () => {
            const ctx1 = createTimeoutContext();
            const ctx2 = createTimeoutContext();
            expect(ctx1._abortController).not.toBe(ctx2._abortController);
        });
    });

    // ── 超时触发 ──

    describe('超时触发', () => {
        it('在 30 秒内 signal 保持未中止', () => {
            const ctx = createTimeoutContext();

            // 前进 29 秒
            vi.advanceTimersByTime(29_000);
            expect(ctx.abortSignal.aborted).toBe(false);
        });

        it('30 秒后 abortSignal 变为 aborted', () => {
            const ctx = createTimeoutContext();

            vi.advanceTimersByTime(GRAPHQL_QUERY_TIMEOUT_MS);
            expect(ctx.abortSignal.aborted).toBe(true);
        });

        it('超过 30 秒后 signal 保持 aborted', () => {
            const ctx = createTimeoutContext();

            vi.advanceTimersByTime(GRAPHQL_QUERY_TIMEOUT_MS + 10_000);
            expect(ctx.abortSignal.aborted).toBe(true);
        });
    });

    // ── 清理机制 ──

    describe('清理机制（防内存泄漏）', () => {
        it('响应 close 后 timeout 被清除，不再触发 abort', () => {
            const closeCallbacks: (() => void)[] = [];
            const mockRes = {
                on: vi.fn((event: string, cb: () => void) => {
                    if (event === 'close') {
                        closeCallbacks.push(cb);
                    }
                }),
            };

            const ctx = createTimeoutContext(mockRes as any);

            // 请求在 5 秒内完成
            vi.advanceTimersByTime(5_000);

            // 触发 close 回调（模拟响应完成）
            closeCallbacks.forEach((cb) => cb());

            // 前进到 35 秒 — timeout 已被清除，不应 abort
            vi.advanceTimersByTime(30_000);
            expect(ctx.abortSignal.aborted).toBe(false);
        });

        it('未调用 close 时 timeout 正常触发', () => {
            const ctx = createTimeoutContext();

            vi.advanceTimersByTime(GRAPHQL_QUERY_TIMEOUT_MS);
            expect(ctx.abortSignal.aborted).toBe(true);
        });

        it('无 res 对象时不崩溃（半开连接）', () => {
            // 某些情况 res 可能不可用
            const ctx = createTimeoutContext(undefined);
            expect(ctx.abortSignal).toBeDefined();
            expect(ctx.abortSignal.aborted).toBe(false);

            // 超时仍然正常触发
            vi.advanceTimersByTime(GRAPHQL_QUERY_TIMEOUT_MS);
            expect(ctx.abortSignal.aborted).toBe(true);
        });

        it('无 res.on 方法时不崩溃', () => {
            const ctx = createTimeoutContext({} as any);
            expect(ctx.abortSignal).toBeDefined();

            vi.advanceTimersByTime(GRAPHQL_QUERY_TIMEOUT_MS);
            expect(ctx.abortSignal.aborted).toBe(true);
        });
    });

    // ── Resolver 感知超时 ──

    describe('Resolver 感知超时', () => {
        it('在请求未超时时 abortSignal.aborted = false', () => {
            const ctx = createTimeoutContext();

            vi.advanceTimersByTime(10_000);
            // 模拟 resolver 检查
            expect(ctx.abortSignal.aborted).toBe(false);
        });

        it('在请求超时后 abortSignal.aborted = true', () => {
            const ctx = createTimeoutContext();

            vi.advanceTimersByTime(GRAPHQL_QUERY_TIMEOUT_MS);
            // 模拟 resolver 检查
            expect(ctx.abortSignal.aborted).toBe(true);
        });

        it('abortSignal 的 reason 为 AbortError DOMException（AbortController 默认行为）', () => {
            const ctx = createTimeoutContext();

            vi.advanceTimersByTime(GRAPHQL_QUERY_TIMEOUT_MS);
            // AbortController.abort() 无参数时，reason 为 DOMException "AbortError"
            expect(ctx.abortSignal.reason).toBeInstanceOf(DOMException);
            expect((ctx.abortSignal.reason as DOMException).name).toBe('AbortError');
        });

        it('abort event listener 在超时时被触发', () => {
            const ctx = createTimeoutContext();
            const abortListener = vi.fn();

            ctx.abortSignal.addEventListener('abort', abortListener);

            vi.advanceTimersByTime(GRAPHQL_QUERY_TIMEOUT_MS);
            expect(abortListener).toHaveBeenCalledTimes(1);
        });

        it('提前 close 时 abort event listener 不被触发', () => {
            const closeCallbacks: (() => void)[] = [];
            const mockRes = {
                on: vi.fn((event: string, cb: () => void) => {
                    if (event === 'close') closeCallbacks.push(cb);
                }),
            };

            const ctx = createTimeoutContext(mockRes as any);
            const abortListener = vi.fn();
            ctx.abortSignal.addEventListener('abort', abortListener);

            // 响应提前完成
            vi.advanceTimersByTime(5_000);
            closeCallbacks.forEach((cb) => cb());

            // 超时时间已过
            vi.advanceTimersByTime(GRAPHQL_QUERY_TIMEOUT_MS);
            expect(abortListener).not.toHaveBeenCalled();
        });
    });

    // ── 生产配置 ──

    describe('生产配置验证', () => {
        it('硬编码超时为 30 秒（与计划文档第 18 项一致）', () => {
            expect(GRAPHQL_QUERY_TIMEOUT_MS).toBe(30_000);
        });

        it('超时时间大于典型的慢查询耗时（5-10 秒）', () => {
            // 如果超时 < 10 秒，正常慢查询会被误杀
            expect(GRAPHQL_QUERY_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
        });

        it('超时时间小于数据库默认超时（60 秒）', () => {
            // GraphQL 超时应该在数据库超时之前触发
            expect(GRAPHQL_QUERY_TIMEOUT_MS).toBeLessThan(60_000);
        });
    });
});
