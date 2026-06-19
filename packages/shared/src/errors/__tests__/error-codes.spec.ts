/**
 * 错误码字典单元测试
 *
 * 测试覆盖：
 *   - 13 个核心码（spec 要求：10001/10002/20001/20002/20003/20005/21001/22001/10099/10999）都存在
 *   - 扩展码：10003/10004/21002/21003/22002 也存在
 *   - 工具函数：getErrorCodeInfo() 正确返回
 *   - 防御性：未知 code 返回 null
 *   - 前后端一致性：与后端 business-codes.ts 的 keys 完全对齐
 *     （注：后端文件在 apps/server/，不能直接 import，这里采用人工约定的硬编码列表做对比）
 */
import { describe, it, expect } from 'vitest';
import { ERROR_CODES, ERROR_CODE_INFO, getErrorCodeInfo } from '../error-codes.js';
import type { ErrorCode } from '../error-codes.js';
import type { ErrorCodeInfo } from '../../types/error.js';

describe('error-codes 字典', () => {
    describe('核心码存在性', () => {
        // spec 明确要求的 13 个核心码（去掉重复的 10001/10002/20001/20002/20003/20005/21001/22001/10099/10999 = 10 个 + 扩展 3 个 = 13）
        const REQUIRED_CODES: ErrorCode[] = [
            // 通用类（2）
            10001, 10002,
            // 业务类（4）
            20001, 20002, 20003, 20005,
            // 用户管理（1）
            21001,
            // 权限（1）
            22001,
            // 兜底（2）
            10099, 10999,
        ];

        it.each(REQUIRED_CODES)('错误码 %d 在字典中', (code) => {
            expect(ERROR_CODES[code]).toBeDefined();
            expect(ERROR_CODES[code].code).toBe(code);
            expect(ERROR_CODES[code].message).toBeTruthy();
        });
    });

    describe('扩展码存在性', () => {
        const EXTENDED_CODES: ErrorCode[] = [10003, 10004, 21002, 21003, 22002];

        it.each(EXTENDED_CODES)('扩展码 %d 在字典中', (code) => {
            expect(ERROR_CODES[code]).toBeDefined();
        });
    });

    describe('字典结构完整性', () => {
        it('每个 ErrorCodeInfo 都包含 code / message / category / description', () => {
            for (const info of ERROR_CODE_INFO) {
                expect(typeof info.code).toBe('number');
                expect(typeof info.message).toBe('string');
                expect(info.message.length).toBeGreaterThan(0);
                expect(typeof info.category).toBe('string');
                expect(typeof info.description).toBe('string');
            }
        });

        it('每个元信息都通过 ErrorCodeInfo 类型校验', () => {
            // 编译期已校验（satisfies Record<number, ErrorCodeInfo>）
            // 运行时再补一道：检查 category 是允许的枚举值
            const validCategories: ReadonlyArray<ErrorCodeInfo['category']> = [
                'validation',
                'rate-limit',
                'not-found',
                'conflict',
                'common',
                'system',
                'auth',
                'user',
                'permission',
            ];
            for (const info of ERROR_CODE_INFO) {
                expect(validCategories).toContain(info.category);
            }
        });

        it('错误码唯一性（无重复）', () => {
            const codes = ERROR_CODE_INFO.map((info) => info.code);
            const uniqueCodes = new Set(codes);
            expect(codes.length).toBe(uniqueCodes.size);
        });
    });

    describe('getErrorCodeInfo 工具函数', () => {
        it('合法数字 code 返回元信息', () => {
            const info = getErrorCodeInfo(20002);
            expect(info).not.toBeNull();
            expect(info?.message).toBe('用户名或密码错误');
        });

        it('字符串数字 code 也能解析', () => {
            const info = getErrorCodeInfo('20003');
            expect(info).not.toBeNull();
            expect(info?.code).toBe(20003);
        });

        it('未知 code 返回 null', () => {
            expect(getErrorCodeInfo(99999)).toBeNull();
            expect(getErrorCodeInfo('abc')).toBeNull();
        });

        it('null / undefined 返回 null', () => {
            expect(getErrorCodeInfo(null)).toBeNull();
            expect(getErrorCodeInfo(undefined)).toBeNull();
        });
    });

    // ============================================================
    // 前后端字典一致性断言
    // ============================================================
    describe('前后端一致性（与后端 business-codes.ts 对齐）', () => {
        // 人工核对后的后端错误码列表（与 apps/server/src/common/errors/error-codes.ts 一致）
        // 注意：当后端新增 / 删除 code 时，必须同步更新此列表 + 提交新版本 shared
        const BACKEND_CODES: number[] = [
            10001, 10002, 10003, 10004, 10005, 10099, 10999, 11002, 11003, 12001, 12002, 12003, 20001, 20002, 20003,
            20005, 20007, 21001, 21002, 21003, 22001, 22002,
        ];

        it('前端 ERROR_CODES 包含所有后端定义的 code（无遗漏）', () => {
            const frontendCodes = Object.keys(ERROR_CODES)
                .map((k) => Number.parseInt(k, 10))
                .sort((a, b) => a - b);
            const expectedCodes = [...BACKEND_CODES].sort((a, b) => a - b);
            // 断言完全相等：任何新增 / 删除都会导致这个测试失败
            expect(frontendCodes).toEqual(expectedCodes);
        });

        it('前端无多余 code（避免定义孤儿）', () => {
            const frontendCodes = Object.keys(ERROR_CODES).map((k) => Number.parseInt(k, 10));
            for (const code of frontendCodes) {
                expect(BACKEND_CODES).toContain(code);
            }
        });
    });
});
