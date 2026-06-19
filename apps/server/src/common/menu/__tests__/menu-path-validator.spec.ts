/**
 * 菜单 path 白名单校验器 单元测试
 *
 * 覆盖：
 * - 12 个合法 case（含纯根路径、单层/多层路径、短横、纯数字段）
 * - 12 个非法 case（XSS / 协议相对 / 路径穿越 / 大写 / 特殊字符 / 空 / 类型错 / 端口号）
 *
 * 测试策略：
 * - 每个 case 独立 it()，失败时定位精确
 * - 不依赖任何外部状态（pure function）
 */
import { describe, it, expect } from 'vitest';
import { validateMenuPath, menuPathZodRefine } from '../menu-path-validator';

describe('validateMenuPath', () => {
    // ───────────────── 合法 case（12 个） ─────────────────
    describe('合法 path', () => {
        const validCases = [
            '/',
            '/system',
            '/system/user',
            '/system/user-list',
            '/abc-def',
            '/dashboard',
            '/iam/admin',
            '/user/123',
            '/a',
            '/a-b-c-d',
            '/sys/user-list/detail',
            '/api/v1/health', // 数字段
        ];

        for (const path of validCases) {
            it(`合法：${path}`, () => {
                const result = validateMenuPath(path);
                expect(result.ok).toBe(true);
            });
        }
    });

    // ───────────────── 非法 case（12 个） ─────────────────
    describe('非法 path', () => {
        const invalidCases: Array<{ path: unknown; reason: string; desc: string }> = [
            { path: 'javascript:alert(1)', reason: 'must start with /', desc: 'javascript: 伪协议' },
            { path: '//evil.com/path', reason: 'must start with /', desc: '协议相对 URL（//evil）' },
            { path: '/path/../escape', reason: '..', desc: '路径穿越' },
            { path: '/Path', reason: '', desc: '大写字母' },
            { path: '/path?q=1', reason: '', desc: '含查询参数' },
            { path: '', reason: 'empty', desc: '空字符串' },
            { path: '/path with space', reason: '', desc: '含空格' },
            { path: '/path/with/colon:8080', reason: ':', desc: '含 : 端口号' },
            { path: '/path<script>', reason: '', desc: '含 < > HTML 标签' },
            { path: '/path;DROP', reason: '', desc: '含 ; 注入字符' },
            { path: 'no-leading-slash', reason: 'must start with /', desc: '不以 / 开头' },
            { path: null, reason: 'string', desc: 'null 类型' },
        ];

        for (const { path, desc } of invalidCases) {
            it(`非法：${desc}（path=${JSON.stringify(path)}）`, () => {
                const result = validateMenuPath(path);
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(typeof result.reason).toBe('string');
                    expect(result.reason.length).toBeGreaterThan(0);
                }
            });
        }
    });

    // ───────────────── 边界 case ─────────────────
    describe('边界 case', () => {
        it('undefined → 拒绝', () => {
            const result = validateMenuPath(undefined);
            expect(result.ok).toBe(false);
        });

        it('number → 拒绝', () => {
            const result = validateMenuPath(123);
            expect(result.ok).toBe(false);
        });

        it('object → 拒绝', () => {
            const result = validateMenuPath({});
            expect(result.ok).toBe(false);
        });

        it('array → 拒绝', () => {
            const result = validateMenuPath(['/system']);
            expect(result.ok).toBe(false);
        });

        it('只有 /（单字符）→ 合法（根路径）', () => {
            const result = validateMenuPath('/');
            expect(result.ok).toBe(true);
        });

        it('// 双斜杠开头 → 拒绝', () => {
            const result = validateMenuPath('//');
            // 字符集不匹配（首字符后是 /，不在 [a-z0-9] 范围）
            expect(result.ok).toBe(false);
        });
    });

    // ───────────────── Zod refine 工厂 ─────────────────
    describe('menuPathZodRefine', () => {
        it('合法 path 返回 true（passthrough）', () => {
            const refine = menuPathZodRefine();
            const result = refine('/system');
            expect(result).toBe(true);
        });

        it('非法 path 返回 { message }', () => {
            const refine = menuPathZodRefine('菜单 path 非法');
            const result = refine('javascript:alert(1)');
            expect(typeof result).toBe('object');
            if (typeof result === 'object' && result !== null) {
                expect((result as { message: string }).message).toContain('菜单 path 非法');
            }
        });
    });
});
