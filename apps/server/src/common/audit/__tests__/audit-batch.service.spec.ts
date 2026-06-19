/**
 * AuditBatchService 单元测试
 *
 * 覆盖 4 个核心场景（audit log 批量写入）：
 * 1. 缓冲区满 50 → 立即触发 flush（不等到 5s）
 * 2. 5s 定时器 → 强制 flush
 * 3. onApplicationShutdown → 强制 flush
 * 4. DB 写失败 → 回滚到 logs/audit-fallback.ndjson
 *
 * 实现方式：mock prisma.client.auditLog.createMany，fs.appendFileSync 写真实临时文件
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuditBatchService } from '../audit-batch.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

describe('AuditBatchService', () => {
    let createMany: ReturnType<typeof vi.fn>;
    let prisma: PrismaService;
    let service: AuditBatchService;
    let originalCwd: string;
    let tempDir: string;

    beforeEach(() => {
        // 用临时目录作为 cwd，避免污染真实 logs/ 目录
        originalCwd = process.cwd();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-batch-test-'));
        process.chdir(tempDir);

        createMany = vi.fn().mockResolvedValue({ count: 0 });
        prisma = { client: { auditLog: { createMany } } } as unknown as PrismaService;
        service = new AuditBatchService(prisma);
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        // 清理临时目录
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // 忽略
        }
        // 关停 service（清 timer + flush）
        await service.onApplicationShutdown('test');
    });

    // 场景 1：缓冲区满 50 → 立即 flush
    it('场景1：缓冲区满 50 → 立即触发 flush（不等到 5s）', async () => {
        // 推入 50 条（应触发 flush）
        for (let i = 0; i < 50; i++) {
            service.enqueue({
                accountId: `acc-${i}`,
                action: 'login_success',
                resourceType: null,
                resourceId: null,
                ip: null,
                userAgent: null,
                detail: { i },
            });
        }
        // 等待 microtask + flush 完成
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setTimeout(r, 10));

        // 关键：createMany 一定被调 1 次
        expect(createMany).toHaveBeenCalledTimes(1);
        // 关键：createMany 接收的 data.length === 50
        const data = createMany.mock.calls[0][0].data;
        expect(data).toHaveLength(50);
        // buffer 已清空
        expect(service.getBufferSize()).toBe(0);
    });

    it('场景1-b：少于 50 条时不应主动 flush（需等定时器）', async () => {
        // 推入 49 条（未满 50）
        for (let i = 0; i < 49; i++) {
            service.enqueue({
                accountId: `acc-${i}`,
                action: 'login_success',
                resourceType: null,
                resourceId: null,
                ip: null,
                userAgent: null,
                detail: null,
            });
        }
        // 等待 microtask
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setTimeout(r, 10));

        // createMany 未被调（等定时器）
        expect(createMany).not.toHaveBeenCalled();
        // buffer 仍有 49 条
        expect(service.getBufferSize()).toBe(49);
    });

    // 场景 2：5s 定时器 → 强制 flush
    it('场景2：5s 定时器 → 强制 flush', async () => {
        // 用 vi.useFakeTimers 模拟时间（只 fake setInterval/setTimeout，不影响 Promise/microtask）
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
        try {
            // 启动定时器
            service.onModuleInit();
            // 推入 1 条（不满 50）
            service.enqueue({
                accountId: 'acc-1',
                action: 'login_success',
                resourceType: null,
                resourceId: null,
                ip: null,
                userAgent: null,
                detail: null,
            });
            // 还没过 5s → 未 flush
            vi.advanceTimersByTime(4_000);
            // 让 microtask 跑完
            await new Promise((r) => setImmediate(r));
            expect(createMany).not.toHaveBeenCalled();

            // 过 5s → 定时器触发
            vi.advanceTimersByTime(1_500);
            // 等 setInterval callback + microtask 跑完
            await new Promise((r) => setImmediate(r));
            await new Promise((r) => setImmediate(r));
            expect(createMany).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    // 场景 3：onApplicationShutdown → 强制 flush
    it('场景3：onApplicationShutdown → 强制 flush（含未满 50 的数据）', async () => {
        // 推入 10 条（未满 50）
        for (let i = 0; i < 10; i++) {
            service.enqueue({
                accountId: `acc-${i}`,
                action: 'token_refreshed',
                resourceType: null,
                resourceId: null,
                ip: null,
                userAgent: null,
                detail: null,
            });
        }
        // 关键：未触发 flush（因为没满 50）
        expect(createMany).not.toHaveBeenCalled();

        // 模拟关停
        await service.onApplicationShutdown('SIGTERM');

        // 关键：flush 被触发，10 条写入
        expect(createMany).toHaveBeenCalledTimes(1);
        expect(createMany.mock.calls[0][0].data).toHaveLength(10);
    });

    // 场景 4：DB 写失败 → 回滚到 logs/audit-fallback.ndjson
    it('场景4：DB 写失败 → 回滚到 logs/audit-fallback.ndjson', async () => {
        // 模拟 createMany 失败
        createMany.mockRejectedValue(new Error('PG connection lost'));
        // 推 5 条 + 强制 flush
        for (let i = 0; i < 5; i++) {
            service.enqueue({
                accountId: `acc-${i}`,
                action: 'login_failed',
                resourceType: null,
                resourceId: null,
                ip: null,
                userAgent: null,
                detail: { reason: 'wrong password' },
            });
        }
        await service.flushNow();

        // 关键：fallback 文件存在
        const fallbackPath = path.join(tempDir, 'logs', 'audit-fallback.ndjson');
        expect(fs.existsSync(fallbackPath)).toBe(true);
        // 关键：文件含 5 行（每行一个 JSON）
        const content = fs.readFileSync(fallbackPath, 'utf8');
        const lines = content.trim().split('\n');
        expect(lines).toHaveLength(5);
        // 验证 JSON 内容
        const parsed = JSON.parse(lines[0]);
        expect(parsed.action).toBe('login_failed');
    });

    // 场景 5：closed 后入队 → 直接走 fallback
    it('场景5：服务关闭后入队 → 直接走 fallback（不写 DB）', async () => {
        // 关闭服务
        await service.onApplicationShutdown('SIGTERM');
        // 再次入队
        service.enqueue({
            accountId: 'acc-after-close',
            action: 'login_success',
            resourceType: null,
            resourceId: null,
            ip: null,
            userAgent: null,
            detail: null,
        });
        // 不等定时器，直接走 fallback
        const fallbackPath = path.join(tempDir, 'logs', 'audit-fallback.ndjson');
        expect(fs.existsSync(fallbackPath)).toBe(true);
        const content = fs.readFileSync(fallbackPath, 'utf8');
        const parsed = JSON.parse(content.trim().split('\n')[0]);
        expect(parsed.accountId).toBe('acc-after-close');
    });

    // 场景 6：flush 防重入
    it('场景6：flush 期间再次 flush 应被忽略（防重入）', async () => {
        // 让 createMany 慢一点，模拟正在 flush
        let resolveFn: (v: unknown) => void = () => {};
        const slowPromise = new Promise((r) => {
            resolveFn = r;
        });
        createMany.mockReturnValue(slowPromise);
        // 入队 50 → 触发 flush
        for (let i = 0; i < 50; i++) {
            service.enqueue({
                accountId: `acc-${i}`,
                action: 'login_success',
                resourceType: null,
                resourceId: null,
                ip: null,
                userAgent: null,
                detail: null,
            });
        }
        // 等待 microtask
        await new Promise((r) => setImmediate(r));
        // flush 已开始（synchronously sets flushing=true）
        // 再入队 50 → 进 buffer（但 flushing=true 不会触发新的 flush）
        for (let i = 0; i < 50; i++) {
            service.enqueue({
                accountId: `acc-2-${i}`,
                action: 'login_success',
                resourceType: null,
                resourceId: null,
                ip: null,
                userAgent: null,
                detail: null,
            });
        }
        // 第一次 flush resolve（数据写回成功）
        resolveFn({ count: 50 });
        // 等待 microtask 链：
        // 1) await createMany resolve
        // 2) finally 中 flushing=false
        // 3) finally 中检查 buffer.length>=50 → 触发第二次 flush
        // 4) 第二次 flush 的 createMany 走 mockReturnValue(slowPromise) → 永远不 resolve
        //    （这次不会被本测试等待，会泄漏到 next test → 用 finally 中 await onApplicationShutdown 兜底）
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setImmediate(r));

        // 关键：createMany 已被调 2 次（第一次 50 + 第二次 50 触发）
        expect(createMany).toHaveBeenCalledTimes(2);
        // 验证两次的 data 长度都是 50
        expect(createMany.mock.calls[0][0].data).toHaveLength(50);
        expect(createMany.mock.calls[1][0].data).toHaveLength(50);
    });
});
