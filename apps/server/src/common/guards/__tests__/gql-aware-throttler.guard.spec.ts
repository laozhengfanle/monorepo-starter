/**
 * GqlAwareThrottlerGuard 单元测试
 *
 * 覆盖场景：
 * 1. 触发限流（super.handleRequest 返回 false）→ rate_limit_blocked_total 计数器 +1
 * 2. Redis 降级（super.handleRequest 抛错）→ 不上报限流指标（视为放行）
 * 3. 正常放行（super.handleRequest 返回 true）→ 不上报指标
 * 4. label 归一化：GraphQL operationName / HTTP method:path
 * 5. 异常时 route 提取失败 → 'unknown' label
 * 6. counter 未注入（@Optional） → 静默跳过
 *
 * 测试策略：
 * - 直接调用 `handleRequest` 时用 `vi.spyOn` 拦截 `super.handleRequest`
 *   - super.handleRequest 实际是 ThrottlerGuard.handleRequest（不在我们的文件里）
 *   - spyOn(guard, 'handleRequest').mockImplementation(...) 拦截子类方法
 *   - 更优雅：用 vi.spyOn(Object.getPrototypeOf(guard), 'handleRequest') 拦截父类
 * - 私有方法（extractRouteLabel / extractReasonLabel）通过 `(guard as any)` 访问测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GqlAwareThrottlerGuard } from '../gql-aware-throttler.guard';

/**
 * 创建测试用 guard，并 mock counter
 * - counter.inc: 实际调用的指标上报方法
 * - incCalls: 记录所有 inc 调用（用于断言）
 */
function createGuard() {
    const incCalls: Array<{ labels: Record<string, string> }> = [];
    const guard = new GqlAwareThrottlerGuard({} as any, {} as any, {} as any);
    // 注入 mock counter（模拟 @InjectMetric）
    (guard as any).rateLimitBlocked = {
        inc: (labels: Record<string, string>) => {
            incCalls.push({ labels });
        },
    };
    return { guard, incCalls };
}

/**
 * 拦截 super.handleRequest（ThrottlerGuard.handleRequest）
 * - 用 vi.spyOn 替换父类原型上的方法
 * - 返回值：true = 放行，false = 限流
 * - throw = 模拟 Redis 故障
 */
function stubSuperHandleRequest(guard: GqlAwareThrottlerGuard, behavior: () => boolean | Promise<boolean>): void {
    const proto = Object.getPrototypeOf(GqlAwareThrottlerGuard.prototype);
    vi.spyOn(proto, 'handleRequest' as any).mockImplementation(behavior as any);
}

describe('GqlAwareThrottlerGuard — Prometheus 指标', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('触发限流（super 返回 false）→ rate_limit_blocked_total +1，labels 包含 route + reason', async () => {
        const { guard, incCalls } = createGuard();
        stubSuperHandleRequest(guard, () => false);

        // 构造一个 HTTP context mock
        const fakeContext = {
            getType: () => 'http',
            switchToHttp: () => ({
                getRequest: () => ({ method: 'POST', path: '/api/auth/login' }),
            }),
        };

        const result = await (guard as any).handleRequest({
            context: fakeContext,
            throttler: { name: 'short' },
        });

        expect(result).toBe(false);
        expect(incCalls).toHaveLength(1);
        expect(incCalls[0]?.labels).toEqual({
            route: 'post:api/auth',
            reason: 'short',
        });
    });

    it('正常放行（super 返回 true）→ 不上报指标', async () => {
        const { guard, incCalls } = createGuard();
        stubSuperHandleRequest(guard, () => true);

        const fakeContext = {
            getType: () => 'http',
            switchToHttp: () => ({
                getRequest: () => ({ method: 'GET', path: '/api/users' }),
            }),
        };

        const result = await (guard as any).handleRequest({
            context: fakeContext,
            throttler: { name: 'short' },
        });

        expect(result).toBe(true);
        expect(incCalls).toHaveLength(0);
    });

    it('Redis 降级（super 抛错）→ 放行 + 不上报指标', async () => {
        const { guard, incCalls } = createGuard();
        stubSuperHandleRequest(guard, () => {
            throw new Error('Redis ECONNREFUSED');
        });

        const fakeContext = {
            getType: () => 'http',
            switchToHttp: () => ({
                getRequest: () => ({ method: 'POST', path: '/api/foo' }),
            }),
        };

        const result = await (guard as any).handleRequest({
            context: fakeContext,
            throttler: { name: 'short' },
        });

        // 降级策略：放行（fail-open）
        expect(result).toBe(true);
        // 关键：Redis 降级时不上报限流指标
        expect(incCalls).toHaveLength(0);
    });

    it('GraphQL operationName 走 graphql:OpName label', async () => {
        const { guard, incCalls } = createGuard();
        stubSuperHandleRequest(guard, () => false);

        const fakeContext = {
            getType: () => 'http',
            switchToHttp: () => ({
                getRequest: () => ({ method: 'POST', path: '/graphql', body: { operationName: 'Login' } }),
            }),
        };

        await (guard as any).handleRequest({
            context: fakeContext,
            throttler: { name: 'medium' },
        });

        expect(incCalls).toHaveLength(1);
        expect(incCalls[0]?.labels).toEqual({
            route: 'graphql:Login',
            reason: 'medium',
        });
    });

    it('HTTP path 走 method:seg1/seg2 label（防高基数）', async () => {
        const { guard, incCalls } = createGuard();
        stubSuperHandleRequest(guard, () => false);

        const fakeContext = {
            getType: () => 'http',
            switchToHttp: () => ({
                getRequest: () => ({ method: 'GET', path: '/users/123/orders/456' }),
            }),
        };

        await (guard as any).handleRequest({
            context: fakeContext,
            throttler: { name: 'long' },
        });

        expect(incCalls).toHaveLength(1);
        expect(incCalls[0]?.labels).toEqual({
            route: 'get:users/123', // 只取前 2 段
            reason: 'long',
        });
    });

    it('throttlerName 缺失时，reason label 默认 short', async () => {
        const { guard, incCalls } = createGuard();
        stubSuperHandleRequest(guard, () => false);

        const fakeContext = {
            getType: () => 'http',
            switchToHttp: () => ({
                getRequest: () => ({ method: 'POST', path: '/api/foo' }),
            }),
        };

        // 故意不传 throttler.name
        await (guard as any).handleRequest({
            context: fakeContext,
        });

        expect(incCalls[0]?.labels['reason']).toBe('short');
    });

    it('Counter 未注入（@Optional 无 provider）→ 静默跳过，不抛错', async () => {
        // 构造一个没有 counter 的 guard
        const guard = new GqlAwareThrottlerGuard({} as any, {} as any, {} as any);
        // 不设置 rateLimitBlocked → undefined
        stubSuperHandleRequest(guard, () => false); // 触发限流

        const fakeContext = {
            getType: () => 'http',
            switchToHttp: () => ({
                getRequest: () => ({ method: 'POST', path: '/api/foo' }),
            }),
        };

        // 不应抛错
        const result = await (guard as any).handleRequest({
            context: fakeContext,
            throttler: { name: 'short' },
        });

        expect(result).toBe(false);
    });

    it('route 提取异常时 → label 为 "unknown"（不污染主流程）', async () => {
        const incCalls2: Array<{ labels: Record<string, string> }> = [];
        const guard = new GqlAwareThrottlerGuard({} as any, {} as any, {} as any);
        (guard as any).rateLimitBlocked = {
            inc: (labels: Record<string, string>) => {
                incCalls2.push({ labels });
            },
        };
        stubSuperHandleRequest(guard, () => false);

        // 传一个会抛错的 context（getter 抛错）
        const result = await (guard as any).handleRequest({
            get context() {
                throw new Error('boom');
            },
            throttler: { name: 'short' },
        });

        expect(result).toBe(false);
        // 应该上报了一个 metrics，label.route = 'unknown'
        expect(incCalls2).toHaveLength(1);
        expect(incCalls2[0]?.labels['route']).toBe('unknown');
    });
});
