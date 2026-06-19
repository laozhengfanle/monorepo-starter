/**
 * formatError 单元测试
 *
 * 覆盖：
 * - null / undefined 返回 'unknown'
 * - 标准 Error：拼接 name + message 第一行
 * - 带 code 的 Error（Prisma / NodeJS）：拼接 [code] 前缀
 * - 多行 message：只取第一行
 * - 超长 message：截到 maxLen 字符
 * - 非 Error 对象（string / object）：JSON.stringify 兜底
 * - JSON.stringify 失败的循环引用：回退到 String()
 */
import { describe, expect, it } from 'vitest';
import { formatError } from '../format-error.js';

describe('formatError', () => {
    describe('null / undefined', () => {
        it('null 返回 "unknown"', () => {
            expect(formatError(null)).toBe('unknown');
        });

        it('undefined 返回 "unknown"', () => {
            expect(formatError(undefined)).toBe('unknown');
        });
    });

    describe('标准 Error', () => {
        it('拼接 name + message 第一行', () => {
            const err = new Error('connection failed');
            expect(formatError(err)).toBe('Error: connection failed');
        });

        it('自定义 name 显示自定义 name', () => {
            class CustomError extends Error {
                constructor(message: string) {
                    super(message);
                    this.name = 'CustomError';
                }
            }
            const err = new CustomError('something bad');
            expect(formatError(err)).toBe('CustomError: something bad');
        });
    });

    describe('带 code 的 Error（Prisma / NodeJS）', () => {
        it('PrismaClientKnownRequestError 带 code 显示 [code] 前缀', () => {
            const err = new Error('Invalid `prisma.x.y()` invocation') as Error & { code?: string };
            err.name = 'PrismaClientKnownRequestError';
            err.code = 'P2002';

            expect(formatError(err)).toBe('PrismaClientKnownRequestError [P2002]: Invalid `prisma.x.y()` invocation');
        });

        it('NodeJS 系统错误带 ECONNREFUSED code', () => {
            const err = new Error('connect ECONNREFUSED 127.0.0.1:6379') as Error & { code?: string };
            err.code = 'ECONNREFUSED';

            expect(formatError(err)).toBe('Error [ECONNREFUSED]: connect ECONNREFUSED 127.0.0.1:6379');
        });

        it('无 code 时不显示 [] 前缀', () => {
            const err = new Error('plain error');
            expect(formatError(err)).toBe('Error: plain error');
        });
    });

    describe('多行 message', () => {
        it('只取第一行（去掉堆栈帧等）', () => {
            const err = new Error('line1\nline2\nline3');
            expect(formatError(err)).toBe('Error: line1');
        });

        it('Prisma 风格的多行错误：只显示首行 + 截短', () => {
            const err = new Error(
                'Invalid `prisma.x.y()` invocation in\n/path/to/file.ts:1:1\n\n  1  code\n→ 2  more code',
            );
            expect(formatError(err)).toBe('Error: Invalid `prisma.x.y()` invocation in');
        });
    });

    describe('超长 message', () => {
        it('默认截到 200 字符', () => {
            const longMessage = 'x'.repeat(500);
            const err = new Error(longMessage);
            const formatted = formatError(err);
            // "Error: " 前缀 + 200 个 x
            expect(formatted.length).toBe('Error: '.length + 200);
        });

        it('自定义 maxLen 生效', () => {
            const err = new Error('x'.repeat(500));
            const formatted = formatError(err, 50);
            expect(formatted.length).toBe('Error: '.length + 50);
        });
    });

    describe('非 Error 对象', () => {
        it('string：直接返回', () => {
            expect(formatError('just a string')).toBe('just a string');
        });

        it('plain object：JSON.stringify', () => {
            expect(formatError({ code: 'X1', message: 'oops' })).toBe('{"code":"X1","message":"oops"}');
        });

        it('循环引用 object：回退到 String()（不抛错）', () => {
            const obj: Record<string, unknown> = { name: 'self-ref' };
            obj['self'] = obj;
            // 不应抛错
            const result = formatError(obj);
            expect(typeof result).toBe('string');
        });
    });
});
