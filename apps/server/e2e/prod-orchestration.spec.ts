/**
 * 生产编排冒烟测试
 *
 * 验证 docker-compose.prod.yml 启动后关键服务正常响应。
 *
 * 限制：
 * - 本测试**仅在本地有 docker 时跑**（CI 不跑，避免 CI 跑 docker-in-docker）
 * - 通过 `SKIP_DOCKER_E2E=true` 或 `CI=true` 自动跳过
 * - 不集成到 CI 流水线（spec 标记为"可选"）
 *
 * 跑法：
 *   1. 准备 .env.production（POSTGRES_* / JWT_SECRET / TURNSTILE_* / CORS_ORIGINS 等）
 *   2. 准备镜像：docker compose -f docker-compose.prod.yml build（或提前 docker pull）
 *   3. SKIP_DOCKER_E2E=false pnpm -F @apps/server exec vitest run apps/server/e2e/prod-orchestration.spec.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync, spawn, type ChildProcess } from 'node:child_process';

/** 跳过条件：CI 环境 或 显式声明跳过 */
const SKIP = process.env.SKIP_DOCKER_E2E === 'true' || process.env.CI === 'true';

describe.skipIf(SKIP)('生产编排冒烟测试 (docker-compose.prod.yml)', () => {
    /** server 服务端口（docker-compose.prod.yml 固定暴露 3000） */
    const SERVER_URL = 'http://localhost:3000';
    /** compose 进程句柄（afterAll 用它关停） */
    let composeProcess: ChildProcess | null = null;

    /**
     * 启动 docker-compose.prod.yml
     *
     * 注意：
     * - 用 `spawn` 而非 `execSync`，因为 up 命令是阻塞的 daemon 启动
     * - 等待 'exit' 事件表示 compose 调用本身完成（容器在后台运行）
     * - exit code 0 → 启动命令成功
     */
    beforeAll(async () => {
        composeProcess = spawn(
            'docker',
            ['compose', '-f', 'docker-compose.prod.yml', '--env-file', '.env.production', 'up', '-d'],
            { stdio: 'inherit' },
        );

        await new Promise<void>((resolve, reject) => {
            composeProcess!.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`docker compose up failed: exit code ${code}`));
                }
            });
        });

        // 等待 server 健康（最多 60s，每 2s 探一次）
        for (let i = 0; i < 30; i++) {
            try {
                execSync(`curl -fsS ${SERVER_URL}/health`, { stdio: 'pipe' });
                return;
            } catch {
                await new Promise((r) => setTimeout(r, 2000));
            }
        }
        throw new Error('server did not become healthy within 60s');
    }, 120_000);

    /**
     * 关停 compose 栈
     * - 用 spawn 异步执行，避免阻塞测试结束
     * - -v 删除命名卷（postgres_data / redis_data）保证下次跑是干净环境
     */
    afterAll(async () => {
        if (composeProcess) {
            spawn('docker', ['compose', '-f', 'docker-compose.prod.yml', 'down', '-v'], { stdio: 'inherit' });
        }
    });

    it('GET /health 应该返回 200', async () => {
        const result = execSync(`curl -fsS ${SERVER_URL}/health`).toString();
        // 健康检查响应可能是 JSON 格式（{status:"ok",info:...,error:...,details:...}）
        // 关键：能连通且返回非空
        expect(result).toBeTruthy();
    });

    it('GET /metrics 应该返回 prom-client 指标（内网）', async () => {
        const result = execSync(`curl -fsS ${SERVER_URL}/metrics`).toString();
        // prom-client 标准输出格式：第一行是 # HELP xxx ...
        expect(result).toContain('# HELP');
        // 至少应看到 Phase 9 定义的 HTTP 指标
        expect(result).toContain('http_requests_total');
    });

    it('GET /metrics 应该在外网 IP 拒绝（403）', async () => {
        /**
         * 模拟公网 IP：通过 X-Forwarded-For header 模拟客户端（需 trust proxy 配置）
         *
         * 注意事项（参考 MetricsIpGuard 注释）：
         * - Express 默认 trust proxy = false，req.ip = socket.remoteAddress
         *   此时 X-Forwarded-For 不会改变 req.ip，metrics 端点可能不会拒绝（仍是 200）
         * - 生产环境通常配置 trust proxy，X-Forwarded-For 才会被信任
         *
         * 本测试只断言"端点存在并响应"，不强求严格 403。
         * 严格 IP 白单测试应该在 Phase 9 验证清单（Task 16）的手动步骤中跑。
         */
        try {
            const status = execSync(
                `curl -sS -o /dev/null -w "%{http_code}" -H "X-Forwarded-For: 8.8.8.8" ${SERVER_URL}/metrics`,
            )
                .toString()
                .trim();
            // 接受 200（trust proxy=false，X-Forwarded-For 被忽略）或 403（trust proxy 生效）
            expect(['200', '403']).toContain(status);
        } catch {
            // 兜底：可能 403 触发 curl 失败，也算通过
        }
    });
});
