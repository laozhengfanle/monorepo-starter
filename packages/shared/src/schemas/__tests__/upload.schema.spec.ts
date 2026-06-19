import { describe, it, expect } from 'vitest';
import { QueryUploadSchema, UploadFileMetaSchema } from '../upload/upload.schema.js';

// ── QueryUploadSchema 测试 ──
describe('QueryUploadSchema', () => {
    /** 正常查询输入 — 只用分页 */
    it('应通过只带分页参数的查询', () => {
        const result = QueryUploadSchema.safeParse({ page: 1, pageSize: 20 });
        expect(result.success).toBe(true);
    });

    /** 默认分页值 */
    it('应为空对象提供默认分页值', () => {
        const result = QueryUploadSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.page).toBe(1);
            expect(result.data.pageSize).toBe(20);
        }
    });

    /** 按 mimeType 筛选 */
    it('应通过按 mimeType 筛选', () => {
        const result = QueryUploadSchema.safeParse({
            page: 1,
            pageSize: 20,
            mimeType: 'image/png',
        });
        expect(result.success).toBe(true);
    });

    /** mimeType 超长拒绝 */
    it('应拒绝超过 100 字符的 mimeType', () => {
        const result = QueryUploadSchema.safeParse({
            mimeType: 'a'.repeat(101),
        });
        expect(result.success).toBe(false);
    });

    /** 按 folder 筛选 */
    it('应通过按 folder 筛选', () => {
        const result = QueryUploadSchema.safeParse({
            folder: 'avatars',
        });
        expect(result.success).toBe(true);
    });

    /** folder 超长拒绝 */
    it('应拒绝超过 50 字符的 folder', () => {
        const result = QueryUploadSchema.safeParse({
            folder: 'a'.repeat(51),
        });
        expect(result.success).toBe(false);
    });

    /** folder 边界值：正好 50 字符 */
    it('应通过正好 50 字符的 folder', () => {
        const result = QueryUploadSchema.safeParse({
            folder: 'a'.repeat(50),
        });
        expect(result.success).toBe(true);
    });

    /** 按 accountId 筛选 */
    it('应通过按 accountId 筛选', () => {
        const result = QueryUploadSchema.safeParse({
            accountId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
    });

    /** accountId 非 UUID 拒绝 */
    it('应拒绝非 UUID 格式的 accountId', () => {
        const result = QueryUploadSchema.safeParse({
            accountId: 'not-a-uuid',
        });
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = QueryUploadSchema.safeParse({
            page: 1,
            pageSize: 20,
            extraField: 'hack',
        });
        expect(result.success).toBe(false);
    });
});

// ── UploadFileMetaSchema 测试 ──
describe('UploadFileMetaSchema', () => {
    /** 正常文件元数据 */
    it('应通过合法的文件元数据', () => {
        const result = UploadFileMetaSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            accountId: '660e8400-e29b-41d4-a716-446655440001',
            originalName: 'photo.jpg',
            storedName: 'abc123-photo.jpg',
            mimeType: 'image/jpeg',
            size: 102400,
            storage: 'local',
            folder: 'uploads/2026',
            url: 'https://cdn.example.com/uploads/2026/abc123-photo.jpg',
            createdAt: '2026-06-11T10:00:00.000Z',
        });
        expect(result.success).toBe(true);
    });

    /** 缺失必填字段拒绝 */
    it('应拒绝缺失必填字段', () => {
        const result = UploadFileMetaSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
            const fields = result.error.issues.map((i) => i.path.join('.'));
            expect(fields).toContain('id');
            expect(fields).toContain('accountId');
            expect(fields).toContain('originalName');
        }
    });

    /** size 为负数拒绝 */
    it('应拒绝负数的文件大小', () => {
        const result = UploadFileMetaSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            accountId: '660e8400-e29b-41d4-a716-446655440001',
            originalName: 'photo.jpg',
            storedName: 'abc123-photo.jpg',
            mimeType: 'image/jpeg',
            size: -1,
            storage: 'local',
            folder: 'uploads',
            url: 'https://cdn.example.com/photo.jpg',
            createdAt: '2026-06-11T10:00:00.000Z',
        });
        expect(result.success).toBe(false);
    });

    /** size 为 0（空文件）通过 */
    it('应通过 size 为 0 的空文件', () => {
        const result = UploadFileMetaSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            accountId: '660e8400-e29b-41d4-a716-446655440001',
            originalName: 'empty.txt',
            storedName: 'abc123-empty.txt',
            mimeType: 'text/plain',
            size: 0,
            storage: 'local',
            folder: 'uploads',
            url: 'https://cdn.example.com/empty.txt',
            createdAt: '2026-06-11T10:00:00.000Z',
        });
        expect(result.success).toBe(true);
    });

    /** size 非整数拒绝 */
    it('应拒绝非整数的文件大小', () => {
        const result = UploadFileMetaSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            accountId: '660e8400-e29b-41d4-a716-446655440001',
            originalName: 'photo.jpg',
            storedName: 'abc123-photo.jpg',
            mimeType: 'image/jpeg',
            size: 100.5,
            storage: 'local',
            folder: 'uploads',
            url: 'https://cdn.example.com/photo.jpg',
            createdAt: '2026-06-11T10:00:00.000Z',
        });
        expect(result.success).toBe(false);
    });

    /** createdAt 字符串自动转换 Date */
    it('应将字符串日期强制转换为 Date', () => {
        const result = UploadFileMetaSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            accountId: '660e8400-e29b-41d4-a716-446655440001',
            originalName: 'test.txt',
            storedName: 'abc123-test.txt',
            mimeType: 'text/plain',
            size: 1024,
            storage: 'local',
            folder: 'uploads',
            url: 'https://cdn.example.com/test.txt',
            createdAt: '2026-06-11T10:00:00.000Z',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.createdAt).toBeInstanceOf(Date);
        }
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = UploadFileMetaSchema.safeParse({
            id: '550e8400-e29b-41d4-a716-446655440000',
            accountId: '660e8400-e29b-41d4-a716-446655440001',
            originalName: 'test.txt',
            storedName: 'abc123-test.txt',
            mimeType: 'text/plain',
            size: 1024,
            storage: 'local',
            folder: 'uploads',
            url: 'https://cdn.example.com/test.txt',
            createdAt: '2026-06-11T10:00:00.000Z',
            extraField: 'should-be-rejected',
        });
        expect(result.success).toBe(false);
    });
});
