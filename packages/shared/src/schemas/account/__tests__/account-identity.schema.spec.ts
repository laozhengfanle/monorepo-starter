import { describe, it, expect } from 'vitest';
import {
    OAuthProviderEnum,
    BindPhoneInputSchema,
    UnbindPhoneInputSchema,
    BindOAuthInputSchema,
    UnbindOAuthInputSchema,
} from '../account-identity.schema.js';

// ── 手机号格式（通过 BindPhoneInputSchema 间接测试 PhoneSchema） ──
describe('手机号格式（PhoneSchema）', () => {
    it('应通过有效的 13 号段手机号', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '13812345678', code: '123456' });
        expect(result.success).toBe(true);
    });

    it('应通过有效的 19 号段手机号', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '19812345678', code: '123456' });
        expect(result.success).toBe(true);
    });

    it('应拒绝位数不足的手机号', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '1381234567', code: '123456' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('手机号格式不正确');
        }
    });

    it('应拒绝位数超长的手机号', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '138123456789', code: '123456' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('手机号格式不正确');
        }
    });

    it('应拒绝含字母的手机号', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '1381234567a', code: '123456' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('手机号格式不正确');
        }
    });

    it('应拒绝 12 号段（不在 13-19 范围）', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '12012345678', code: '123456' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('手机号格式不正确');
        }
    });

    it('应拒绝空字符串', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '', code: '123456' });
        expect(result.success).toBe(false);
    });
});

// ── 验证码格式（通过 BindPhoneInputSchema 间接测试 CodeSchema） ──
describe('验证码格式（CodeSchema）', () => {
    it('应通过 6 位数字验证码', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '13812345678', code: '888888' });
        expect(result.success).toBe(true);
    });

    it('应拒绝 5 位数字验证码', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '13812345678', code: '88888' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('验证码必须是 6 位数字');
        }
    });

    it('应拒绝 7 位数字验证码', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '13812345678', code: '8888888' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('验证码必须是 6 位数字');
        }
    });

    it('应拒绝含字母的验证码', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '13812345678', code: 'abc123' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('验证码必须是 6 位数字');
        }
    });

    it('应拒绝空字符串', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '13812345678', code: '' });
        expect(result.success).toBe(false);
    });
});

// ── OAuthProviderEnum ──
describe('OAuthProviderEnum', () => {
    it('应接受 wechat-web', () => {
        const result = OAuthProviderEnum.safeParse('wechat-web');
        expect(result.success).toBe(true);
    });

    it('应接受 wechat-mp', () => {
        const result = OAuthProviderEnum.safeParse('wechat-mp');
        expect(result.success).toBe(true);
    });

    it('应接受 wechat-miniprogram', () => {
        const result = OAuthProviderEnum.safeParse('wechat-miniprogram');
        expect(result.success).toBe(true);
    });

    it('应接受 apple', () => {
        const result = OAuthProviderEnum.safeParse('apple');
        expect(result.success).toBe(true);
    });

    it('应拒绝未知 provider', () => {
        const result = OAuthProviderEnum.safeParse('github');
        expect(result.success).toBe(false);
    });

    it('应拒绝空字符串', () => {
        const result = OAuthProviderEnum.safeParse('');
        expect(result.success).toBe(false);
    });

    it('应拒绝 undefined', () => {
        const result = OAuthProviderEnum.safeParse(undefined);
        expect(result.success).toBe(false);
    });
});

// ── BindPhoneInputSchema ──
describe('BindPhoneInputSchema', () => {
    it('应通过正确的 phone + code', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '13812345678', code: '123456' });
        expect(result.success).toBe(true);
    });

    it('应拒绝缺少 phone', () => {
        const result = BindPhoneInputSchema.safeParse({ code: '123456' });
        expect(result.success).toBe(false);
    });

    it('应拒绝缺少 code', () => {
        const result = BindPhoneInputSchema.safeParse({ phone: '13812345678' });
        expect(result.success).toBe(false);
    });

    it('应拒绝空对象', () => {
        const result = BindPhoneInputSchema.safeParse({});
        expect(result.success).toBe(false);
    });
});

// ── UnbindPhoneInputSchema ──
describe('UnbindPhoneInputSchema', () => {
    it('应通过正确的 phone + code', () => {
        const result = UnbindPhoneInputSchema.safeParse({ phone: '13812345678', code: '123456' });
        expect(result.success).toBe(true);
    });

    it('应拒绝缺少 phone', () => {
        const result = UnbindPhoneInputSchema.safeParse({ code: '123456' });
        expect(result.success).toBe(false);
    });

    it('应拒绝缺少 code', () => {
        const result = UnbindPhoneInputSchema.safeParse({ phone: '13812345678' });
        expect(result.success).toBe(false);
    });

    it('应拒绝空对象', () => {
        const result = UnbindPhoneInputSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('应拒绝无效手机号', () => {
        const result = UnbindPhoneInputSchema.safeParse({ phone: '12345678901', code: '123456' });
        expect(result.success).toBe(false);
    });
});

// ── BindOAuthInputSchema ──
describe('BindOAuthInputSchema', () => {
    it('应通过有效的 wechat-web provider + code', () => {
        const result = BindOAuthInputSchema.safeParse({
            provider: 'wechat-web',
            code: 'auth_code_xxx',
        });
        expect(result.success).toBe(true);
    });

    it('应通过有效的 apple provider + code', () => {
        const result = BindOAuthInputSchema.safeParse({
            provider: 'apple',
            code: 'auth_code_xxx',
        });
        expect(result.success).toBe(true);
    });

    it('应通过包含 state 的 wechat-web 绑定', () => {
        const result = BindOAuthInputSchema.safeParse({
            provider: 'wechat-web',
            code: 'auth_code_xxx',
            state: 'random_state_string',
        });
        expect(result.success).toBe(true);
    });

    it('应拒绝无效 provider', () => {
        const result = BindOAuthInputSchema.safeParse({
            provider: 'github',
            code: 'auth_code_xxx',
        });
        expect(result.success).toBe(false);
    });

    it('应拒绝空 code', () => {
        const result = BindOAuthInputSchema.safeParse({
            provider: 'wechat-web',
            code: '',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe('授权码不能为空');
        }
    });

    it('应拒绝缺少 code', () => {
        const result = BindOAuthInputSchema.safeParse({
            provider: 'wechat-web',
        });
        expect(result.success).toBe(false);
    });

    it('应拒绝缺少 provider', () => {
        const result = BindOAuthInputSchema.safeParse({
            code: 'auth_code_xxx',
        });
        expect(result.success).toBe(false);
    });

    it('应拒绝空对象', () => {
        const result = BindOAuthInputSchema.safeParse({});
        expect(result.success).toBe(false);
    });
});

// ── UnbindOAuthInputSchema ──
describe('UnbindOAuthInputSchema', () => {
    it('应通过有效的 wechat-web provider', () => {
        const result = UnbindOAuthInputSchema.safeParse({ provider: 'wechat-web' });
        expect(result.success).toBe(true);
    });

    it('应通过有效的 apple provider', () => {
        const result = UnbindOAuthInputSchema.safeParse({ provider: 'apple' });
        expect(result.success).toBe(true);
    });

    it('应拒绝无效 provider', () => {
        const result = UnbindOAuthInputSchema.safeParse({ provider: 'github' });
        expect(result.success).toBe(false);
    });

    it('应拒绝空字符串 provider', () => {
        const result = UnbindOAuthInputSchema.safeParse({ provider: '' });
        expect(result.success).toBe(false);
    });

    it('应拒绝空对象', () => {
        const result = UnbindOAuthInputSchema.safeParse({});
        expect(result.success).toBe(false);
    });
});
