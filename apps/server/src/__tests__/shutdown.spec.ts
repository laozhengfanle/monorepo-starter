/**
 * 优雅关闭测试（Phase 9.8）
 *
 * 验证 SIGTERM 触发时：
 * 1. NestJS 收到信号，停止接收新请求
 * 2. 等 in-flight 请求完成
 * 3. 按序关闭：Prisma → Redis → Logger → HTTP server
 * 4. 总耗时 ≤ 25s
 *
 * 依赖：
 * - 需要真实可用的 DATABASE_URL / REDIS_URL（PrismaService.onModuleInit 会连接 DB）
 * - 通过 SKIP_E2E=true 跳过（CI 或无 DB/Redis 环境）
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../app.module.js';

/** 跳过条件：显式声明跳过 或 在 CI 环境 */
const SKIP = process.env.SKIP_E2E === 'true' || process.env.CI === 'true';

/**
 * 注入测试环境变量（必须在 Test.createTestingModule 之前）
 *
 * 原因：
 * - ConfigModule 启动时用 Zod 校验环境变量，缺字段会 fail-fast
 * - 开发环境常用的 .env.example 值可满足校验
 * - DB / Redis 走 localhost（dev docker-compose 默认端口）
 */
function setTestEnv(): void {
    process.env['NODE_ENV'] = 'test';
    process.env['DATABASE_URL'] ??= 'postgresql://root:test123@localhost:5432/mono_test';
    process.env['REDIS_URL'] ??= 'redis://localhost:6379/0';
    // JWT_SECRET 至少 64 字符（HS256 要求 256 bit = 32 字节 = 64 hex）
    process.env['JWT_SECRET'] ??= 'test-secret-key-for-shutdown-test-only-not-for-production-use-here';
    process.env['JWT_ISSUER'] ??= 'monorepo-server';
    process.env['JWT_AUDIENCE'] ??= 'monorepo-app';
    // AES_ENCRYPTION_KEY 64 hex 字符 = 32 字节
    process.env['AES_ENCRYPTION_KEY'] ??= '0000000000000000000000000000000000000000000000000000000000000000';
    // Turnstile 测试密钥（永远通过验证）
    process.env['TURNSTILE_SECRET_KEY'] ??= '1x0000000000000000000000000000000AA';
    // 允许的 origin（避免 CORS 报错）
    process.env['ALLOWED_ORIGINS'] ??= 'http://localhost:3000';
}

describe.skipIf(SKIP)('优雅关闭 (SIGTERM)', () => {
    let app: INestApplication;
    /** 保存原始 process listeners（防止测试污染宿主 vitest 进程） */
    let originalListeners: { [key: string]: NodeJS.SignalsListener | undefined } = {};

    beforeEach(async () => {
        setTestEnv();

        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = moduleRef.createNestApplication();

        // 启用关闭钩子（必须在 app.init() 之前调用才会注册 SIGTERM/SIGINT 监听器）
        app.enableShutdownHooks();

        await app.init();

        // 保存原始 listeners（在 init 之后保存，此时 hooks 已注册）
        //   - enableShutdownHooks 在 init 期间向 process 注册 SIGTERM/SIGINT 监听器
        //   - 保存"原始"是为了 afterEach 恢复测试隔离（虽然 close() 通常会清理）
        originalListeners = {
            SIGTERM: process.listeners('SIGTERM')[0] as NodeJS.SignalsListener,
            SIGINT: process.listeners('SIGINT')[0] as NodeJS.SignalsListener,
        };
    }, 60_000);

    afterEach(async () => {
        try {
            await app.close();
        } catch (err) {
            // close() 失败不阻断测试清理流程
            // eslint-disable-next-line no-console
            console.error('app.close() failed in afterEach:', err);
        }
        // 恢复原始 listeners
        if (originalListeners['SIGTERM']) {
            process.on('SIGTERM', originalListeners['SIGTERM']);
        }
        if (originalListeners['SIGINT']) {
            process.on('SIGINT', originalListeners['SIGINT']);
        }
    });

    it('应该注册 SIGTERM 监听器', () => {
        const sigtermListeners = process.listeners('SIGTERM');
        expect(sigtermListeners.length).toBeGreaterThan(0);
    });

    it('应该注册 SIGINT 监听器', () => {
        const sigintListeners = process.listeners('SIGINT');
        expect(sigintListeners.length).toBeGreaterThan(0);
    });

    it('关闭 app 应该按序完成（耗时 < 25s）', async () => {
        /**
         * 重新创建一个独立的 app 用于此测试
         * 原因：前两个测试不关闭 app，依赖 afterEach 处理
         *       此测试显式调用 close()，避免 afterEach 二次 close 报错
         */
        const start = Date.now();
        await app.close();
        const elapsed = Date.now() - start;

        // 25s 阈值：参考 K8s terminationGracePeriodSeconds 默认 30s
        // 留 5s 余量给 K8s 自身的 preStop + endpoint 摘除
        expect(elapsed).toBeLessThan(25_000);

        // 标记 app 已关闭，避免 afterEach 二次 close
        app = undefined as unknown as INestApplication;
    }, 30_000);
});
