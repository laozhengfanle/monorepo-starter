/**
 * Prometheus Collectors 单元测试
 *
 * 覆盖：
 * - 4 个 collector（HttpMetrics / GraphqlMetrics / DbMetrics / BusinessMetrics）的基本 inc/observe/set 行为
 * - 每个 collector 注册到独立 Registry 后，从 getMetricsAsJSON() 能读到正确 metric 名称 + 标签 + 数值
 * - BusinessMetrics 的业务语义方法（incLoginFailure / incRateLimit / setCacheHitRatio）正确转调底层 Counter/Gauge
 *
 * 测试策略：
 * - 用独立 Registry 隔离（避免污染 prom-client 全局 register）
 * - 每个 it 创建新 Registry + 新 collector 实例，保证测试间互不污染
 *
 * getMetricsAsJSON 输出格式约定（prom-client v15）：
 * - { name, help, type, values: [{ value, labels: { ... }, metricName?, exemplar? }] }
 * - labels 字段统一存放所有 labelName（包括 histogram 的 'le' 桶位）
 * - histogram 会展开为多行：_bucket（每个 le）/ _sum / _count
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from 'prom-client';
import { HttpMetrics } from '../collectors/http.metrics.js';
import { GraphqlMetrics } from '../collectors/graphql.metrics.js';
import { DbMetrics } from '../collectors/db.metrics.js';
import { BusinessMetrics } from '../collectors/business.metrics.js';

describe('HttpMetrics', () => {
    let registry: Registry;
    let metrics: HttpMetrics;

    beforeEach(() => {
        registry = new Registry();
        metrics = new HttpMetrics(registry);
    });

    it('调用 inc/observe 后能读到 http_requests_total / http_request_duration_ms / http_requests_in_flight，且数值与标签正确', async () => {
        // inFlight +1
        metrics.inFlight.inc();
        // requestsTotal +1
        metrics.requestsTotal.inc({ method: 'GET', route: '/api/users', status_code: '200' });
        // requestDuration 观察一次 100ms
        metrics.requestDuration.observe({ method: 'GET', route: '/api/users' }, 100);

        const json = await registry.getMetricsAsJSON();

        // 验证 metric 名称存在
        const names = json.map((m) => m.name);
        expect(names).toContain('http_requests_total');
        expect(names).toContain('http_request_duration_ms');
        expect(names).toContain('http_requests_in_flight');

        // 验证 http_requests_total：labels 字段包含 method/route/status_code
        const reqTotal = json.find((m) => m.name === 'http_requests_total')!;
        expect(reqTotal.values).toEqual([
            { value: 1, labels: { method: 'GET', route: '/api/users', status_code: '200' } },
        ]);

        // 验证 inFlight 值
        const inflight = json.find((m) => m.name === 'http_requests_in_flight')!;
        expect(inflight.values[0].value).toBe(1);

        // 验证 histogram count = 1
        const duration = json.find((m) => m.name === 'http_request_duration_ms')!;
        const countMetric = duration.values.find(
            (v: { metricName?: string; labels: Record<string, unknown> }) =>
                v.metricName === 'http_request_duration_ms_count' &&
                v.labels['method'] === 'GET' &&
                v.labels['route'] === '/api/users',
        );
        expect(countMetric?.value).toBe(1);
    });
});

describe('GraphqlMetrics', () => {
    let registry: Registry;
    let metrics: GraphqlMetrics;

    beforeEach(() => {
        registry = new Registry();
        metrics = new GraphqlMetrics(registry);
    });

    it('调用 observe / inc 后能读到 graphql_query_duration_ms 和 graphql_query_errors_total', async () => {
        metrics.queryDuration.observe({ operation_name: 'me', operation_type: 'query' }, 50);
        metrics.queryDuration.observe({ operation_name: 'login', operation_type: 'mutation' }, 200);
        metrics.queryErrors.inc({ operation_name: 'login', code: '10001' });

        const json = await registry.getMetricsAsJSON();
        const names = json.map((m) => m.name);
        expect(names).toContain('graphql_query_duration_ms');
        expect(names).toContain('graphql_query_errors_total');

        // errors: labels 字段包含 operation_name + code
        const errors = json.find((m) => m.name === 'graphql_query_errors_total')!;
        expect(errors.values).toEqual([{ value: 1, labels: { operation_name: 'login', code: '10001' } }]);

        // histogram count：分别按 operation_name 统计（me=1, login=1）
        const duration = json.find((m) => m.name === 'graphql_query_duration_ms')!;
        const meCount = duration.values.find(
            (v: { metricName?: string; labels: Record<string, unknown> }) =>
                v.metricName === 'graphql_query_duration_ms_count' && v.labels['operation_name'] === 'me',
        );
        const loginCount = duration.values.find(
            (v: { metricName?: string; labels: Record<string, unknown> }) =>
                v.metricName === 'graphql_query_duration_ms_count' && v.labels['operation_name'] === 'login',
        );
        expect(meCount?.value).toBe(1);
        expect(loginCount?.value).toBe(1);
    });
});

describe('DbMetrics', () => {
    let registry: Registry;
    let metrics: DbMetrics;

    beforeEach(() => {
        registry = new Registry();
        metrics = new DbMetrics(registry);
    });

    it('调用 observe / inc 后能读到 db_query_duration_ms 和 db_connections_active', async () => {
        metrics.connectionsActive.inc();
        metrics.connectionsActive.inc(); // 当前 2 个活跃
        metrics.queryDuration.observe({ model: 'Account', action: 'findUnique' }, 5);
        metrics.queryDuration.observe({ model: 'AdminRole', action: 'findMany' }, 20);

        const json = await registry.getMetricsAsJSON();
        const names = json.map((m) => m.name);
        expect(names).toContain('db_query_duration_ms');
        expect(names).toContain('db_connections_active');

        const active = json.find((m) => m.name === 'db_connections_active')!;
        expect(active.values[0].value).toBe(2);

        // histogram count：按 model 分桶，Account=1, AdminRole=1
        const duration = json.find((m) => m.name === 'db_query_duration_ms')!;
        const accountCount = duration.values.find(
            (v: { metricName?: string; labels: Record<string, unknown> }) =>
                v.metricName === 'db_query_duration_ms_count' && v.labels['model'] === 'Account',
        );
        const adminRoleCount = duration.values.find(
            (v: { metricName?: string; labels: Record<string, unknown> }) =>
                v.metricName === 'db_query_duration_ms_count' && v.labels['model'] === 'AdminRole',
        );
        expect(accountCount?.value).toBe(1);
        expect(adminRoleCount?.value).toBe(1);
    });
});

describe('BusinessMetrics', () => {
    let registry: Registry;
    let metrics: BusinessMetrics;

    beforeEach(() => {
        registry = new Registry();
        metrics = new BusinessMetrics(registry);
    });

    it('incLoginFailure / incRateLimit / setCacheHitRatio 三个业务方法都正确写入对应 metric', async () => {
        metrics.incLoginFailure('invalid_password');
        metrics.incLoginFailure('invalid_password'); // 同 reason 累加
        metrics.incLoginFailure('account_locked');
        metrics.incRateLimit('short');
        metrics.setCacheHitRatio('user:', 0.85);

        const json = await registry.getMetricsAsJSON();
        const names = json.map((m) => m.name);
        expect(names).toContain('login_failures_total');
        expect(names).toContain('rate_limit_exceeded_total');
        expect(names).toContain('cache_hit_ratio');

        // login_failures_total：labels 字段包含 reason
        const login = json.find((m) => m.name === 'login_failures_total')!;
        const invalidPwd = login.values.find(
            (v: { value: number; labels: Record<string, unknown> }) => v.labels['reason'] === 'invalid_password',
        );
        const locked = login.values.find(
            (v: { value: number; labels: Record<string, unknown> }) => v.labels['reason'] === 'account_locked',
        );
        expect(invalidPwd?.value).toBe(2);
        expect(locked?.value).toBe(1);

        // rate_limit_exceeded_total
        const rate = json.find((m) => m.name === 'rate_limit_exceeded_total')!;
        expect(rate.values).toEqual([{ value: 1, labels: { limit: 'short' } }]);

        // cache_hit_ratio
        const hit = json.find((m) => m.name === 'cache_hit_ratio')!;
        expect(hit.values).toEqual([{ value: 0.85, labels: { key_prefix: 'user:' } }]);
    });
});
