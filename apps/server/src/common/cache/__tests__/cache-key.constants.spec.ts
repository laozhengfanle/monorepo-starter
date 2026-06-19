/**
 * 缓存 Key 常量测试
 *
 * 覆盖：
 * - CACHE_KEYS 集中导出包含所有 *PREFIX 形常量
 * - SENSITIVE_KEY_PREFIXES 是 readonly + frozen 数组（防运行时被改）
 * - SENSITIVE_KEY_PREFIXES 各元素都是合法 mono: 前缀
 * - 重要敏感 key 应被覆盖（鉴权 / Refresh / OAuth state / 验证码等）
 */
import { describe, it, expect } from 'vitest';
import { CACHE_KEYS, SENSITIVE_KEY_PREFIXES } from '../cache-key.constants.js';

describe('cache-key.constants', () => {
    describe('CACHE_KEYS 集中导出', () => {
        it('应包含所有 *PREFIX 形常量', () => {
            // 断言关键 key 都在 CACHE_KEYS 暴露给业务使用
            expect(CACHE_KEYS.AUTH_RESULT).toBe('mono:auth');
            expect(CACHE_KEYS.ROLE_PERM).toBe('mono:role:permission');
            expect(CACHE_KEYS.ROLE_MENUS).toBe('mono:role:menus');
            expect(CACHE_KEYS.SYSTEM_CONFIG).toBe('mono:data:system_config');
            expect(CACHE_KEYS.MENU_VERSION).toBe('mono:data:menu_version');
            expect(CACHE_KEYS.SMS_CODE).toBe('mono:verify:sms');
            expect(CACHE_KEYS.OAUTH_STATE).toBe('mono:oauth:state');
            expect(CACHE_KEYS.REFRESH_USED).toBe('mono:refresh:used');
            expect(CACHE_KEYS.TURNSTILE_VERIFY).toBe('mono:verify:turnstile');
        });

        it('应包含 SENSITIVE_KEY_PREFIXES 引用', () => {
            expect(CACHE_KEYS.SENSITIVE_KEY_PREFIXES).toBe(SENSITIVE_KEY_PREFIXES);
        });
    });

    describe('SENSITIVE_KEY_PREFIXES', () => {
        it('应被 Object.freeze 保护（运行时不可改）', () => {
            // frozen 数组的 push 在严格模式下抛错，非严格模式下静默失败
            // 两种模式下都应"无法真正添加"
            expect(Object.isFrozen(SENSITIVE_KEY_PREFIXES)).toBe(true);
        });

        it('每个元素都应是非空字符串且以 mono: 开头', () => {
            for (const prefix of SENSITIVE_KEY_PREFIXES) {
                expect(typeof prefix).toBe('string');
                expect(prefix.length).toBeGreaterThan(0);
                expect(prefix.startsWith('mono:')).toBe(true);
            }
        });

        it('应覆盖关键敏感前缀', () => {
            // 用 startsWith 模拟过滤逻辑，验证重要 key 确实被覆盖
            const matches = (key: string) => SENSITIVE_KEY_PREFIXES.some((p) => key.startsWith(p));

            // 鉴权 / 权限 / 配置 / Refresh / OAuth / 验证码
            expect(matches('mono:auth:1:role')).toBe(true);
            expect(matches('mono:role:permission:admin:super')).toBe(true);
            expect(matches('mono:data:system_config:sms.provider')).toBe(true);
            expect(matches('mono:refresh:used:1:hash')).toBe(true);
            expect(matches('mono:oauth:state:abc123')).toBe(true);
            expect(matches('mono:verify:sms:13800001234')).toBe(true);

            // 非敏感 key 不应被误伤
            expect(matches('mono:lock:login:1')).toBe(false);
            expect(matches('mono:rate:tracker1:long')).toBe(false);
        });
    });
});
