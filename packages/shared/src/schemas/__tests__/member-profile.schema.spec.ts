import { describe, it, expect } from 'vitest';
import { UpdateMemberProfileSchema, QueryMemberProfileSchema } from '../member/member-profile.schema.js';

// ── UpdateMemberProfileSchema 测试 ──
describe('UpdateMemberProfileSchema', () => {
    /** 正常：只传 nickname */
    it('应通过只传 nickname 的更新', () => {
        const result = UpdateMemberProfileSchema.safeParse({ nickname: '新昵称' });
        expect(result.success).toBe(true);
    });

    /** 正常：只传 avatar */
    it('应通过只传 avatar 的更新', () => {
        const result = UpdateMemberProfileSchema.safeParse({ avatar: 'https://cdn.example.com/avatar.jpg' });
        expect(result.success).toBe(true);
    });

    /** 正常：同时传 nickname + avatar */
    it('应通过同时传 nickname 和 avatar', () => {
        const result = UpdateMemberProfileSchema.safeParse({
            nickname: '新昵称',
            avatar: 'https://cdn.example.com/avatar.jpg',
        });
        expect(result.success).toBe(true);
    });

    /** 空对象通过（所有字段可选） */
    it('应通过空对象（所有字段可选）', () => {
        const result = UpdateMemberProfileSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    /** 昵称超长拒绝 */
    it('应拒绝超过 50 字符的昵称', () => {
        const result = UpdateMemberProfileSchema.safeParse({
            nickname: 'a'.repeat(51),
        });
        expect(result.success).toBe(false);
    });

    /** 昵称边界值：正好 50 字符 */
    it('应通过正好 50 字符的昵称', () => {
        const result = UpdateMemberProfileSchema.safeParse({
            nickname: 'a'.repeat(50),
        });
        expect(result.success).toBe(true);
    });

    /** 空字符串昵称拒绝 */
    it('应拒绝空字符串的昵称', () => {
        const result = UpdateMemberProfileSchema.safeParse({ nickname: '' });
        expect(result.success).toBe(false);
    });

    /** 头像 URL 超长拒绝 */
    it('应拒绝超过 255 字符的头像 URL', () => {
        const result = UpdateMemberProfileSchema.safeParse({
            avatar: 'https://cdn.example.com/' + 'a'.repeat(255),
        });
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = UpdateMemberProfileSchema.safeParse({
            nickname: 'test',
            extraField: 'hack',
        });
        expect(result.success).toBe(false);
    });
});

// ── QueryMemberProfileSchema 测试 ──
describe('QueryMemberProfileSchema', () => {
    /** 正常查询输入 */
    it('应通过合法的查询输入', () => {
        const result = QueryMemberProfileSchema.safeParse({
            page: 1,
            pageSize: 20,
            keyword: 'test',
        });
        expect(result.success).toBe(true);
    });

    /** 默认分页值 */
    it('应为空对象提供默认分页值', () => {
        const result = QueryMemberProfileSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.page).toBe(1);
            expect(result.data.pageSize).toBe(20);
        }
    });

    /** keyword 为空 */
    it('应通过无 keyword 的查询', () => {
        const result = QueryMemberProfileSchema.safeParse({ page: 1, pageSize: 20 });
        expect(result.success).toBe(true);
    });

    /** keyword 超长拒绝 */
    it('应拒绝超过 100 字符的关键词', () => {
        const result = QueryMemberProfileSchema.safeParse({
            keyword: 'a'.repeat(101),
        });
        expect(result.success).toBe(false);
    });

    /** keyword 边界值：正好 100 字符 */
    it('应通过正好 100 字符的关键词', () => {
        const result = QueryMemberProfileSchema.safeParse({
            keyword: 'a'.repeat(100),
        });
        expect(result.success).toBe(true);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = QueryMemberProfileSchema.safeParse({
            page: 1,
            pageSize: 20,
            extraField: 'hack',
        });
        expect(result.success).toBe(false);
    });

    /** pageSize 边界值：最大 100 */
    it('应拒绝 pageSize 超过 100', () => {
        const result = QueryMemberProfileSchema.safeParse({ pageSize: 101 });
        expect(result.success).toBe(false);
    });

    /** page 边界值：最小 1 */
    it('应拒绝 page 小于 1', () => {
        const result = QueryMemberProfileSchema.safeParse({ page: 0 });
        expect(result.success).toBe(false);
    });
});
