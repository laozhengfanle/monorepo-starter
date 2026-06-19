import { describe, it, expect } from 'vitest';
import { newId } from '../id.js';

// ── newId (UUID v7) 测试 ──
describe('newId', () => {
    /** 返回 UUID v7 格式字符串 */
    it('应返回 UUID v7 格式字符串', () => {
        const id = newId();
        // UUID v7 格式: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    /** 每次调用生成不同 ID */
    it('应每次生成不同的 ID', () => {
        const ids = new Set(Array.from({ length: 100 }, () => newId()));
        expect(ids.size).toBe(100);
    });

    /** ID 长度固定为 36 */
    it('应返回固定 36 字符长度的 ID', () => {
        const id = newId();
        expect(id).toHaveLength(36);
    });

    /** 返回字符串类型 */
    it('应返回字符串类型', () => {
        const id = newId();
        expect(typeof id).toBe('string');
    });
});
