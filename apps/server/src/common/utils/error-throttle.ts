/**
 * 节流版错误日志工具
 *
 * 用途：
 * - 防止第三方长连接（ioredis / ws / 长轮询等）emit 错误时把日志 + 内存撑爆
 * - 同一类错误（用 error 上的 code + address + port 标识）在指定窗口内只记一次 warn
 * - 日志只传 err.message 摘要，绝不直接传整个 Error 对象
 *   （NestJS Logger 序列化 Error 时会把 stack + cause + 嵌套 errors 全部打印，
 *    单条日志可达数十 KB，频繁 emit 直接撑爆内存）
 *
 * 使用示例：
 * ```ts
 * const throttle = new ErrorThrottle({ logger, context: 'CacheService', windowMs: 30_000 });
 * client.on('error', (err) => throttle.log(err, 'Redis'));
 * ```
 */
import { Logger } from '@nestjs/common';

/** 待识别错误的扩展字段（node:net 的 connect 错误携带 code/address/port） */
interface ErrnoLikeError extends Error {
    code?: string;
    address?: string;
    port?: number | string;
}

/** 节流器配置 */
export interface ErrorThrottleOptions {
    /** NestJS Logger 实例（通常是 new Logger(ContextClass.name)） */
    logger: Logger;
    /** 日志前缀中的服务名（用于区分不同来源的同质错误） */
    context: string;
    /** 节流窗口（毫秒），默认 30 秒 */
    windowMs?: number;
}

/**
 * 错误日志节流器
 * - 同质错误（code:address:port 三元组相同）在 windowMs 窗口内只记一次 warn
 * - 不同质错误立即记
 * - 日志只传 message 摘要（最多 200 字符），不传整个 Error 对象
 */
export class ErrorThrottle {
    private readonly logger: Logger;
    private readonly context: string;
    private readonly windowMs: number;
    private lastErrorLogAt = 0;
    private lastErrorKey = '';

    constructor(options: ErrorThrottleOptions) {
        this.logger = options.logger;
        this.context = options.context;
        this.windowMs = options.windowMs ?? 30_000;
    }

    /**
     * 记录一条错误日志（带节流）
     * @param err Error 对象
     * @param source 错误来源描述（如 "Redis" / "Redis lock client" / "WebSocket"）
     * @returns true 表示本次实际打印了日志，false 表示被节流丢弃
     */
    log(err: Error, source: string): boolean {
        const e = err as ErrnoLikeError;
        const code = e.code ?? 'UNKNOWN';
        const address = e.address ?? '';
        const port = e.port ?? '';
        // context 拼进 key 防止不同服务的同质错误互相抑制
        const key = `${this.context}:${code}:${address}:${port}`;
        const now = Date.now();

        if (key === this.lastErrorKey && now - this.lastErrorLogAt < this.windowMs) {
            // 窗口内同质错误静默丢弃
            return false;
        }
        this.lastErrorLogAt = now;
        this.lastErrorKey = key;

        this.logger.warn(
            `${source} unreachable (${code} ${address}:${port}) — 降级语义，` +
                `同质错误在 ${Math.floor(this.windowMs / 1000)}s 内不再重复打印。` +
                `err.message: ${err.message?.slice(0, 200) || 'no message'}`,
        );
        return true;
    }

    /** 重置节流状态（用于连接恢复后允许立即打印新错误） */
    reset(): void {
        this.lastErrorLogAt = 0;
        this.lastErrorKey = '';
    }
}
