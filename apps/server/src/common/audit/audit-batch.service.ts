/**
 * AuditBatchService — 审计日志批量写入服务
 *
 * 设计目标：
 * - 解决高频审计日志（如 login_success、token_refreshed）每条单写 DB 的性能问题
 * - 批量 insert 50 条/批 OR 5s 强制 flush 一次
 * - 进程退出时（onApplicationShutdown）必须 flush，防止丢日志
 * - DB 写失败时回滚到 logs/audit-fallback.ndjson（运维后续手动恢复）
 *
 * 架构：
 * - 与 AuditService 并列，AuditService 注入本服务做实际写入
 * - 本服务不感知业务（不接 IP/UA 解析），只负责 buffer + flush
 * - 与 AuditService 的 record() 共用 AuditLogInput 输入格式
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import type { InputJsonValue } from '../../../prisma/generated/internal/prismaNamespace.js';
import type { AuditLogCreateManyInput } from '../../../prisma/generated/models/AuditLog.js';
import { PrismaService } from '../prisma/prisma.service.js';
import * as fs from 'fs';
import * as path from 'path';

/** 缓冲区满时强制 flush 的条数 */
const BATCH_SIZE_LIMIT = 50;
/** 距离上次 flush 超过这个时间就强制 flush（ms） */
const BATCH_TIME_LIMIT_MS = 5_000;

/** 待写入的审计日志（不带 createdAt，由 DB 默认） */
type BufferedAuditLog = {
    accountId: string;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    ip: string | null;
    userAgent: string | null;
    detail: Record<string, unknown> | null;
    /** 到达缓冲区的时间（用于打点 / 排查延迟） */
    enqueuedAt: number;
};

@Injectable()
export class AuditBatchService implements OnModuleInit, OnApplicationShutdown {
    private readonly logger = new Logger(AuditBatchService.name);

    /** 内存缓冲区（普通数组，按入队顺序 flush） */
    private buffer: BufferedAuditLog[] = [];
    /** flush 定时器（5s 强制 flush 用） */
    private timer: NodeJS.Timeout | null = null;
    /** 当前是否正在 flush（防重入） */
    private flushing = false;
    /** 服务是否已关闭（关闭后 enqueue 直接写 fallback，不再 buffer） */
    private closed = false;

    /** 兜底文件路径（相对 cwd）：logs/audit-fallback.ndjson */
    private readonly fallbackFile = path.resolve(process.cwd(), 'logs', 'audit-fallback.ndjson');

    constructor(private readonly prisma: PrismaService) {}

    /**
     * 启动 5s 定时 flush
     * - OnModuleInit 触发，比 OnApplicationBootstrap 早
     * - 服务起来后定时器持续跑
     */
    onModuleInit(): void {
        this.startTimer();
    }

    /**
     * 服务关闭时强制 flush 一次
     * - OnApplicationShutdown 触发（在 onModuleDestroy 之后）
     * - 关停后入队的日志直接走 fallback 文件
     */
    async onApplicationShutdown(signal?: string): Promise<void> {
        this.logger.log(`AuditBatchService onApplicationShutdown signal=${signal ?? 'unknown'}`);
        this.closed = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        // 同步等待最后一批 flush 完成
        await this.flush('shutdown');
    }

    /**
     * 入队一条审计日志
     * - 缓冲区满 50 → 异步触发 flush（不等）
     * - 否则由定时器在 5s 后 flush
     * - closed=true 时直接走 fallback（防止 buffer 状态不一致）
     *
     * 防重入逻辑：
     * - 第一次 enqueue 时 buffer=50, flushing=false → 触发 flush
     * - flush 启动后 flushing=true，后续 enqueue 不会触发新的 flush
     * - flush 完成后（finally 中 flushing=false），自动检查 buffer 是否需要再 flush
     *   （覆盖「flush 进行中又入队 50 条」的场景）
     */
    enqueue(input: Omit<BufferedAuditLog, 'enqueuedAt'>): void {
        if (this.closed) {
            this.writeFallback([{ ...input, enqueuedAt: Date.now() }]);
            return;
        }
        this.buffer.push({ ...input, enqueuedAt: Date.now() });
        // 只在不在 flush 中时触发（避免重复触发）
        if (this.buffer.length >= BATCH_SIZE_LIMIT && !this.flushing) {
            void this.flush('size-limit');
        }
    }

    /**
     * 启动定时器（每 5s 检查一次是否需要 flush）
     * - 用 setInterval 而非 setTimeout：定时器常驻，关停时清掉
     * - 5s 间隔内即使没有新日志也走一次 flush（空操作）
     */
    private startTimer(): void {
        if (this.timer) return;
        this.timer = setInterval(() => {
            // 有日志才 flush
            if (this.buffer.length > 0) {
                void this.flush('timer');
            }
        }, BATCH_TIME_LIMIT_MS);
    }

    /**
     * Flush 缓冲区
     * - 防重入：上一次 flush 没完就不再开新的
     * - 失败回滚：整批失败 → 走 fallback 文件
     * - 部分失败：throw 出去由上层处理（罕见，DB 部分成功极少出现）
     *
     * @param reason flush 触发原因（size-limit / timer / shutdown / manual）
     */
    private async flush(reason: 'size-limit' | 'timer' | 'shutdown' | 'manual'): Promise<void> {
        if (this.flushing) return;
        if (this.buffer.length === 0) return;

        this.flushing = true;
        // 取出当前 buffer 的所有元素（保留引用给 fallback 用）
        const batch = this.buffer;
        // 立即清空 buffer（让后续 enqueue 写入新 buffer）
        // 关键：必须用 splice 不能直接置 []，因为闭包里 splice 才能保证不丢中间进来的
        this.buffer = [];

        const startMs = Date.now();
        try {
            // 批量 create（Prisma 5+ 的 createMany 在 PG 上走 INSERT INTO ... VALUES (...), (...), ...）
            await this.prisma.client.auditLog.createMany({
                data: batch.map((b) => ({
                    accountId: b.accountId,
                    action: b.action,
                    resourceType: b.resourceType,
                    resourceId: b.resourceId,
                    ip: b.ip,
                    userAgent: b.userAgent,
                    detail: b.detail as InputJsonValue,
                })) as AuditLogCreateManyInput[],
            });
            const dur = Date.now() - startMs;
            this.logger.log(
                `Audit batch flushed reason=${reason} count=${batch.length} durationMs=${dur} oldestAgeMs=${Date.now() - batch[0].enqueuedAt}`,
            );
        } catch (err) {
            // 失败：回滚到 fallback 文件
            this.logger.error(
                `Audit batch flush failed reason=${reason} count=${batch.length} error=${(err as Error).message}. Falling back to ndjson.`,
            );
            this.writeFallback(batch);
        } finally {
            this.flushing = false;
            /**
             * 关键：flush 结束后再检查 buffer
             * - 场景：第一次 flush 期间又入队了 50 条 → buffer 满但 flushing=true 没触发
             * - 第一次 flush 结束后 flushing=false → 再次检查 → 触发第二次 flush
             * - 不在 await 后再触发的话，这 50 条要等下一个 5s 定时器，违反 spec
             */
            if (this.buffer.length >= BATCH_SIZE_LIMIT && !this.closed) {
                void this.flush('size-limit');
            }
        }
    }

    /**
     * 写 fallback 文件（NDJSON 格式）
     * - 文件不存在 → 自动创建 logs/ 目录
     * - 一行一个 JSON 对象（.ndjson 格式）
     * - 失败也仅打日志，不抛出（避免影响主流程）
     */
    private writeFallback(batch: BufferedAuditLog[]): void {
        try {
            const dir = path.dirname(this.fallbackFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const lines = batch.map((b) => JSON.stringify(b)).join('\n') + '\n';
            fs.appendFileSync(this.fallbackFile, lines, { encoding: 'utf8' });
            this.logger.warn(`Audit batch persisted to fallback file: ${this.fallbackFile} (count=${batch.length})`);
        } catch (err) {
            this.logger.error(`Audit fallback write failed: error=${(err as Error).message}`);
        }
    }

    /**
     * 测试 / 运维手动 flush（不等定时器）
     */
    async flushNow(): Promise<void> {
        await this.flush('manual');
    }

    /**
     * 当前缓冲区长度（测试用）
     */
    getBufferSize(): number {
        return this.buffer.length;
    }
}
