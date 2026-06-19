import { describe, it, expect } from 'vitest';
import { CreateSystemConfigSchema, UpdateSystemConfigSchema } from '../admin/system-config.schema.js';

// ── CreateSystemConfigSchema 测试 ──
describe('CreateSystemConfigSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的创建系统配置输入', () => {
        const result = CreateSystemConfigSchema.safeParse({
            key: 'site_name',
            value: '企业基座管理后台',
        });
        expect(result.success).toBe(true);
    });

    /** key 格式：小写字母开头，允许点号 */
    it('应通过以小写字母开头的 key', () => {
        const validKeys = ['app_name', 'max_upload_size', 'a', 'a1', 'a_b_c', 'sms.provider', 'storage.config'];
        for (const key of validKeys) {
            const result = CreateSystemConfigSchema.safeParse({ key, value: 'test' });
            expect(result.success).toBe(true);
        }
    });

    /** key 不以小写字母开头拒绝 */
    it('应拒绝不以小写字母开头的 key', () => {
        const invalidKeys = ['1app', '_app', 'App', 'APP_NAME'];
        for (const key of invalidKeys) {
            const result = CreateSystemConfigSchema.safeParse({ key, value: 'test' });
            expect(result.success).toBe(false);
        }
    });

    /** key 含非法字符拒绝（点号除外，点号是合法的分段符） */
    it('应拒绝含非法字符的 key', () => {
        const invalidKeys = ['app-name', 'app name', 'app$name'];
        for (const key of invalidKeys) {
            const result = CreateSystemConfigSchema.safeParse({ key, value: 'test' });
            expect(result.success).toBe(false);
        }
    });

    /** key 超长拒绝 */
    it('应拒绝超过 100 字符的 key', () => {
        const result = CreateSystemConfigSchema.safeParse({
            key: 'a'.repeat(101),
            value: 'test',
        });
        expect(result.success).toBe(false);
    });

    /** key 边界值：正好 100 字符 */
    it('应通过正好 100 字符的 key', () => {
        const result = CreateSystemConfigSchema.safeParse({
            key: 'a'.repeat(100),
            value: 'test',
        });
        expect(result.success).toBe(true);
    });

    /** key 为空拒绝 */
    it('应拒绝空的 key', () => {
        const result = CreateSystemConfigSchema.safeParse({ key: '', value: 'test' });
        expect(result.success).toBe(false);
    });

    /** value 为空拒绝 */
    it('应拒绝空的 value', () => {
        const result = CreateSystemConfigSchema.safeParse({
            key: 'site_name',
            value: '',
        });
        expect(result.success).toBe(false);
    });

    /** 缺失必填字段拒绝 */
    it('应拒绝缺失必填字段', () => {
        const result = CreateSystemConfigSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
            const fields = result.error.issues.map((i) => i.path.join('.'));
            expect(fields).toContain('key');
            expect(fields).toContain('value');
        }
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = CreateSystemConfigSchema.safeParse({
            key: 'site_name',
            value: 'test',
            extraField: 'hack',
        });
        expect(result.success).toBe(false);
    });
});

// ── UpdateSystemConfigSchema 测试 ──
describe('UpdateSystemConfigSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的更新系统配置输入', () => {
        const result = UpdateSystemConfigSchema.safeParse({
            value: '新的配置值',
        });
        expect(result.success).toBe(true);
    });

    /** value 为空拒绝 */
    it('应拒绝空的 value', () => {
        const result = UpdateSystemConfigSchema.safeParse({ value: '' });
        expect(result.success).toBe(false);
    });

    /** 缺失 value 拒绝 */
    it('应拒绝缺失 value 字段', () => {
        const result = UpdateSystemConfigSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = UpdateSystemConfigSchema.safeParse({
            value: 'test',
            extraField: 'hack',
        });
        expect(result.success).toBe(false);
    });

    /** 不应接受 key 字段（更新时 key 不可修改） */
    it('应拒绝传入 key（主键不可修改）', () => {
        const result = UpdateSystemConfigSchema.safeParse({
            key: 'site_name',
            value: 'test',
        });
        expect(result.success).toBe(false);
    });
});
