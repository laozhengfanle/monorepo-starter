/**
 * LoggerConfig 单元测试
 *
 * 覆盖 redact 路径：
 * - *.accessKey / *.secretKey / *.apiKey（第三方平台密钥）
 * - *.smsCode / *.otpCode（一次性验证码）
 * - *.jwt / *.csrfToken / *.sessionToken（鉴权 token）
 * - req.body.sms（兜底短信字段）
 *
 * 实现方式：
 * - 直接验证 REDACT_PATHS 数组包含新增的每一条路径
 * - pino 端到端测试用 pino-http（已经是 server 的直接依赖）走 pino 的 redact API
 * - 避免引入 pino 作为新依赖（pino 是 pino-http 的 transitive dep，在 pnpm 严格模式下不可直接 import）
 */
import { describe, it, expect } from 'vitest';
import { REDACT_PATHS, getPinoConfig } from '../logger.config.js';

describe('LoggerConfig - REDACT_PATHS 数组', () => {
    // 关键断言：所有新加的路径都必须在 REDACT_PATHS 中
    it('应包含新增的 *.accessKey 路径', () => {
        expect(REDACT_PATHS).toContain('*.accessKey');
    });

    it('应包含新增的 *.secretKey 路径', () => {
        expect(REDACT_PATHS).toContain('*.secretKey');
    });

    it('应包含新增的 *.apiKey 路径', () => {
        expect(REDACT_PATHS).toContain('*.apiKey');
    });

    it('应包含新增的 *.smsCode 路径', () => {
        expect(REDACT_PATHS).toContain('*.smsCode');
    });

    it('应包含新增的 *.otpCode 路径', () => {
        expect(REDACT_PATHS).toContain('*.otpCode');
    });

    it('应包含新增的 *.jwt 路径', () => {
        expect(REDACT_PATHS).toContain('*.jwt');
    });

    it('应包含新增的 *.csrfToken 路径', () => {
        expect(REDACT_PATHS).toContain('*.csrfToken');
    });

    it('应包含新增的 *.sessionToken 路径', () => {
        expect(REDACT_PATHS).toContain('*.sessionToken');
    });

    it('应包含新增的 req.body.sms 兜底路径', () => {
        expect(REDACT_PATHS).toContain('req.body.sms');
    });

    // 同时确保原有路径没被误删
    it('应保留原有的 *.password / *.token / req.headers.authorization 路径', () => {
        expect(REDACT_PATHS).toContain('*.password');
        expect(REDACT_PATHS).toContain('*.token');
        expect(REDACT_PATHS).toContain('req.headers.authorization');
        expect(REDACT_PATHS).toContain('req.headers.cookie');
    });

    // 全部新增路径总数 9 条（8 个 *.xx + 1 个 req.body.sms）
    it('新增路径总数应 ≥ 9 条', () => {
        const newPaths = [
            '*.accessKey',
            '*.secretKey',
            '*.apiKey',
            '*.smsCode',
            '*.otpCode',
            '*.jwt',
            '*.csrfToken',
            '*.sessionToken',
            'req.body.sms',
        ];
        newPaths.forEach((p) => {
            expect(REDACT_PATHS).toContain(p);
        });
    });
});

describe('LoggerConfig - getPinoConfig 集成', () => {
    /**
     * 验证 dev / prod 两种环境的 pino 配置都包含所有 REDACT_PATHS
     * - 通过 pino-http (pino 内核) 的 redact 配置验证
     * - 不需要实际写日志
     */
    it('dev 配置的 redact paths 应包含所有新增路径', () => {
        const config = getPinoConfig('dev');
        const paths = (config.pinoHttp?.redact as { paths: string[] } | undefined)?.paths ?? [];
        // 8 个新增 *.xx 路径
        expect(paths).toContain('*.accessKey');
        expect(paths).toContain('*.secretKey');
        expect(paths).toContain('*.apiKey');
        expect(paths).toContain('*.smsCode');
        expect(paths).toContain('*.otpCode');
        expect(paths).toContain('*.jwt');
        expect(paths).toContain('*.csrfToken');
        expect(paths).toContain('*.sessionToken');
        // 兜底
        expect(paths).toContain('req.body.sms');
    });

    it('prod 配置的 redact paths 应包含所有新增路径', () => {
        const config = getPinoConfig('prod');
        const paths = (config.pinoHttp?.redact as { paths: string[] } | undefined)?.paths ?? [];
        expect(paths).toContain('*.accessKey');
        expect(paths).toContain('*.secretKey');
        expect(paths).toContain('*.apiKey');
        expect(paths).toContain('*.smsCode');
        expect(paths).toContain('*.otpCode');
        expect(paths).toContain('*.jwt');
        expect(paths).toContain('*.csrfToken');
        expect(paths).toContain('*.sessionToken');
        expect(paths).toContain('req.body.sms');
    });

    it('censor 应为 [REDACTED]', () => {
        const devConfig = getPinoConfig('dev');
        const prodConfig = getPinoConfig('prod');
        expect((devConfig.pinoHttp?.redact as { censor: string }).censor).toBe('[REDACTED]');
        expect((prodConfig.pinoHttp?.redact as { censor: string }).censor).toBe('[REDACTED]');
    });

    it('dev 配置应使用 pino-pretty transport', () => {
        const config = getPinoConfig('dev');
        const transport = config.pinoHttp?.transport as { target: string } | undefined;
        expect(transport?.target).toBe('pino-pretty');
    });

    it('prod 配置不应使用 transport（输出原始 JSON）', () => {
        const config = getPinoConfig('prod');
        expect(config.pinoHttp?.transport).toBeUndefined();
    });
});
