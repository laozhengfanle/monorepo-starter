/**
 * ErrorThrottle 单元测试
 *
 * 覆盖：
 * - 首次错误：logger.warn 被调用一次
 * - 30s 窗口内同质错误（code + address + port 相同）：静默丢弃
 * - 不同错误码 / 不同地址 / 不同端口：各自记一次
 * - 30s 窗口后同质错误：再次 warn
 * - warn 内容只传 code/address/port/message 摘要，不传整个 Error 对象
 * - 重置后允许立即打印新错误
 * - 不同 context 不会互相抑制
 *
 * 设计说明：
 * - 抽出 ErrorThrottle 后不再需要 vi.mock ioredis，测试 0 依赖
 * - 直接构造 ErrorThrottle 实例，传 mock logger 即可
 */
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorThrottle } from '../error-throttle.js';

/** 构造 ECONNREFUSED 风格的错误（模拟 ioredis + node:net 真实抛出） */
function makeErrnoError(
    address: string,
    port: number | string,
    code = 'ECONNREFUSED',
    message = `connect ${code} ${address}:${port}`,
): Error {
    const err = new Error(message) as Error & { code?: string; address?: string; port?: number | string };
    err.code = code;
    err.address = address;
    err.port = port;
    return err;
}

describe('ErrorThrottle', () => {
    let mockLogger: { warn: ReturnType<typeof vi.fn>; log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
    let throttle: ErrorThrottle;

    beforeEach(() => {
        mockLogger = {
            warn: vi.fn(),
            log: vi.fn(),
            error: vi.fn(),
        };
        // 部分 mock：只 mock 实际用到的方法
        throttle = new ErrorThrottle({
            logger: mockLogger as unknown as Logger,
            context: 'CacheService',
            windowMs: 30_000,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('首次错误', () => {
        it('首次 log() 返回 true 且 logger.warn 被调用一次', () => {
            const err = makeErrnoError('127.0.0.1', 6379);
            const printed = throttle.log(err, 'Redis');

            expect(printed).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledTimes(1);
            // logger.error 永远不该被调用（这是关键：不传整个 Error 对象给 NestJS Logger）
            expect(mockLogger.error).not.toHaveBeenCalled();
        });
    });

    describe('同质错误节流', () => {
        it('30s 窗口内同质错误 → 只 warn 一次', () => {
            const err1 = makeErrnoError('127.0.0.1', 6379);
            const err2 = makeErrnoError('127.0.0.1', 6379);
            const err3 = makeErrnoError('127.0.0.1', 6379);

            const r1 = throttle.log(err1, 'Redis');
            const r2 = throttle.log(err2, 'Redis');
            const r3 = throttle.log(err3, 'Redis');

            expect(r1).toBe(true);
            expect(r2).toBe(false);
            expect(r3).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        });

        it('不同错误码 → 各自记一次', () => {
            const err1 = makeErrnoError('127.0.0.1', 6379, 'ECONNREFUSED');
            const err2 = makeErrnoError('127.0.0.1', 6379, 'EHOSTUNREACH');

            const r1 = throttle.log(err1, 'Redis');
            const r2 = throttle.log(err2, 'Redis');

            expect(r1).toBe(true);
            expect(r2).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        });

        it('不同地址 → 各自记一次', () => {
            const errV4 = makeErrnoError('127.0.0.1', 6379);
            const errV6 = makeErrnoError('::1', 6379);

            const r1 = throttle.log(errV4, 'Redis');
            const r2 = throttle.log(errV6, 'Redis');

            expect(r1).toBe(true);
            expect(r2).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        });

        it('不同端口 → 各自记一次', () => {
            const err6379 = makeErrnoError('127.0.0.1', 6379);
            const err6380 = makeErrnoError('127.0.0.1', 6380);

            const r1 = throttle.log(err6379, 'Redis');
            const r2 = throttle.log(err6380, 'Redis');

            expect(r1).toBe(true);
            expect(r2).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        });

        it('不同 context → 不会互相抑制', () => {
            const cacheThrottle = new ErrorThrottle({
                logger: mockLogger as unknown as Logger,
                context: 'CacheService',
            });
            const lockThrottle = new ErrorThrottle({
                logger: mockLogger as unknown as Logger,
                context: 'RedisLockService',
            });

            const err = makeErrnoError('127.0.0.1', 6379);
            cacheThrottle.log(err, 'Redis');
            lockThrottle.log(err, 'Redis lock client');

            // 不同 context 即便错误码相同也是不同 key → 各自记一次
            expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        });
    });

    describe('窗口过期', () => {
        it('30s 窗口后同质错误 → 再次 warn', () => {
            // throttle.log() 内部每次只调一次 Date.now()
            // 第一次 log：t=1_000_000（节流判断 + 更新都基于此值）
            // 第二次 log：t=1_000_000 + 31_000（差值 31_000 > 30_000，节流窗口过期）
            const nowSpy = vi.spyOn(Date, 'now');
            nowSpy.mockReturnValueOnce(1_000_000);
            nowSpy.mockReturnValueOnce(1_000_000 + 31_000);

            const err1 = makeErrnoError('127.0.0.1', 6379);
            const err2 = makeErrnoError('127.0.0.1', 6379);

            const r1 = throttle.log(err1, 'Redis');
            const r2 = throttle.log(err2, 'Redis');

            expect(r1).toBe(true);
            expect(r2).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledTimes(2);
            nowSpy.mockRestore();
        });
    });

    describe('日志内容（防内存爆炸核心）', () => {
        it('warn 的第一个参数必须是字符串摘要，绝不能是 Error 对象', () => {
            const err = makeErrnoError('127.0.0.1', 6379);
            throttle.log(err, 'Redis');

            expect(mockLogger.warn).toHaveBeenCalledTimes(1);
            const warnMessage = mockLogger.warn.mock.calls[0]?.[0] as string;

            // 关键断言：warn 的第一个参数必须是字符串摘要，绝不能是 Error 对象
            // （NestJS Logger 收到 Error 对象时会序列化整个 stack + cause + 嵌套 errors，
            //  单条日志可达数十 KB，是内存爆炸的根因）
            expect(typeof warnMessage).toBe('string');
            expect(warnMessage).toContain('ECONNREFUSED');
            expect(warnMessage).toContain('127.0.0.1');
            expect(warnMessage).toContain('6379');
            expect(warnMessage).toContain('Redis');
        });

        it('message 超长时只取前 200 字符', () => {
            const longMessage = 'x'.repeat(500);
            const err = new Error(longMessage);
            throttle.log(err, 'Redis');

            const warnMessage = mockLogger.warn.mock.calls[0]?.[0] as string;
            // message 部分不应超过 200 个 x
            const xCount = (warnMessage.match(/x/g) ?? []).length;
            expect(xCount).toBeLessThanOrEqual(200);
        });

        it('message 缺失时使用 "no message" 占位', () => {
            // 构造一个 message 为空的 Error
            const err = new Error('');
            throttle.log(err, 'Redis');

            const warnMessage = mockLogger.warn.mock.calls[0]?.[0] as string;
            expect(warnMessage).toContain('no message');
        });
    });

    describe('鲁棒性', () => {
        it('错误对象缺失 code/address/port 字段时也能正常节流（不抛错）', () => {
            const bareErr = new Error('connection lost'); // 无 code/address/port

            const r1 = throttle.log(bareErr, 'Redis');
            const r2 = throttle.log(bareErr, 'Redis');

            // 两个完全相同的 bare error → 只记 1 次
            expect(r1).toBe(true);
            expect(r2).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledTimes(1);
            expect(mockLogger.error).not.toHaveBeenCalled();
        });

        it('reset() 后允许立即打印新错误（模拟连接恢复）', () => {
            const err = makeErrnoError('127.0.0.1', 6379);

            throttle.log(err, 'Redis'); // 第一次：记 warn
            throttle.log(err, 'Redis'); // 30s 内同质：丢弃
            expect(mockLogger.warn).toHaveBeenCalledTimes(1);

            throttle.reset(); // 模拟重连成功

            const r = throttle.log(err, 'Redis');
            expect(r).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        });
    });
});
