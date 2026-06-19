import { describe, it, expect } from 'vitest';
import { AdminLoginSchema } from '../auth/admin-auth.schema.js';
import { MemberSmsSendSchema, MemberSmsLoginSchema } from '../auth/member-auth.schema.js';
import { TokenRefreshSchema, LogoutSchema, ChangePasswordSchema } from '../auth/auth-common.schema.js';

// ── AdminLoginSchema 测试 ──
describe('AdminLoginSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的管理员登录输入', () => {
        const result = AdminLoginSchema.safeParse({
            username: 'admin01',
            password: 'pass1234',
        });
        expect(result.success).toBe(true);
    });

    /** 必填字段缺失报错 */
    it('应拒绝缺少必填字段', () => {
        const result = AdminLoginSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
            const fields = result.error.issues.map((i) => i.path.join('.'));
            expect(fields).toContain('username');
            expect(fields).toContain('password');
        }
    });

    /** 用户名长度不足报错 */
    it('应拒绝过短的用户名', () => {
        const result = AdminLoginSchema.safeParse({
            username: 'ab',
            password: 'pass1234',
        });
        expect(result.success).toBe(false);
    });

    /** 密码不含字母报错 */
    it('应拒绝不含字母的密码', () => {
        const result = AdminLoginSchema.safeParse({
            username: 'admin01',
            password: '12345678',
        });
        expect(result.success).toBe(false);
    });

    /** 密码不含数字报错 */
    it('应拒绝不含数字的密码', () => {
        const result = AdminLoginSchema.safeParse({
            username: 'admin01',
            password: 'password',
        });
        expect(result.success).toBe(false);
    });

    /** 密码长度不足报错 */
    it('应拒绝过短的密码', () => {
        const result = AdminLoginSchema.safeParse({
            username: 'admin01',
            password: 'ab1',
        });
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = AdminLoginSchema.safeParse({
            username: 'admin01',
            password: 'pass1234',
            extra: 'hack',
        });
        expect(result.success).toBe(false);
    });

    /** turnstileToken 可选：未传 / 传值都通过（向后兼容开发环境） */
    it('应支持 turnstileToken 字段为可选', () => {
        const without = AdminLoginSchema.safeParse({ username: 'admin01', password: 'pass1234' });
        expect(without.success).toBe(true);
        const withToken = AdminLoginSchema.safeParse({
            username: 'admin01',
            password: 'pass1234',
            turnstileToken: 'cf-token-xxx',
        });
        expect(withToken.success).toBe(true);
    });
});

// ── MemberSmsSendSchema 测试 ──
describe('MemberSmsSendSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的短信发送输入', () => {
        const result = MemberSmsSendSchema.safeParse({
            phone: '13800138000',
            purpose: 'login',
        });
        expect(result.success).toBe(true);
    });

    /** 手机号格式错误报错 */
    it('应拒绝错误格式的手机号', () => {
        const cases = ['12345678901', '10000000000', '1380013800', 'abc'];
        for (const phone of cases) {
            const result = MemberSmsSendSchema.safeParse({ phone, purpose: 'login' });
            expect(result.success).toBe(false);
        }
    });

    /** purpose 枚举值错误报错 */
    it('应拒绝无效的验证码用途', () => {
        const result = MemberSmsSendSchema.safeParse({
            phone: '13800138000',
            purpose: 'invalid',
        });
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = MemberSmsSendSchema.safeParse({
            phone: '13800138000',
            purpose: 'login',
            extra: 'hack',
        });
        expect(result.success).toBe(false);
    });
});

// ── MemberSmsLoginSchema 测试 ──
describe('MemberSmsLoginSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的短信登录输入', () => {
        const result = MemberSmsLoginSchema.safeParse({
            phone: '13800138000',
            code: '123456',
        });
        expect(result.success).toBe(true);
    });

    /** 验证码非 6 位数字报错 */
    it('应拒绝非 6 位数字的验证码', () => {
        const cases = ['12345', '1234567', 'abcdef', '12a456'];
        for (const code of cases) {
            const result = MemberSmsLoginSchema.safeParse({ phone: '13800138000', code });
            expect(result.success).toBe(false);
        }
    });

    /** 手机号格式错误报错 */
    it('应拒绝错误格式的手机号', () => {
        const result = MemberSmsLoginSchema.safeParse({
            phone: '12345',
            code: '123456',
        });
        expect(result.success).toBe(false);
    });
});

// ── TokenRefreshSchema 测试 ──
describe('TokenRefreshSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的刷新令牌输入', () => {
        const result = TokenRefreshSchema.safeParse({
            refreshToken: 'some-token',
        });
        expect(result.success).toBe(true);
    });

    /** refreshToken 为空报错 */
    it('应拒绝空的刷新令牌', () => {
        const result = TokenRefreshSchema.safeParse({
            refreshToken: '',
        });
        expect(result.success).toBe(false);
    });
});

// ── LogoutSchema 测试 ──
describe('LogoutSchema', () => {
    /** 空输入通过 */
    it('应通过空输入', () => {
        const result = LogoutSchema.safeParse(undefined);
        expect(result.success).toBe(true);
    });
});

// ── ChangePasswordSchema 测试 ──
describe('ChangePasswordSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的修改密码输入', () => {
        const result = ChangePasswordSchema.safeParse({
            oldPassword: 'old12345',
            newPassword: 'new56789',
        });
        expect(result.success).toBe(true);
    });

    /** 新密码与旧密码相同时报错 */
    it('应拒绝与旧密码相同的新密码', () => {
        const result = ChangePasswordSchema.safeParse({
            oldPassword: 'same12345',
            newPassword: 'same12345',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const fields = result.error.issues.map((i) => i.path.join('.'));
            expect(fields).toContain('newPassword');
        }
    });

    /** 新密码不符合强度要求报错 */
    it('应拒绝不符合强度要求的新密码', () => {
        const result = ChangePasswordSchema.safeParse({
            oldPassword: 'old12345',
            newPassword: 'short',
        });
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = ChangePasswordSchema.safeParse({
            oldPassword: 'old12345',
            newPassword: 'new56789',
            extra: 'hack',
        });
        expect(result.success).toBe(false);
    });
});
