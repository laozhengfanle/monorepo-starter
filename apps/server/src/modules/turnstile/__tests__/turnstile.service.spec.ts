/**
 * TurnstileService 单元测试
 *
 * 覆盖 spec Task 7 三个核心分支：
 * - 场景 1：system_config.turnstile.config.enabled=true + secretKey → 走 Cloudflare
 * - 场景 2：system_config.turnstile.config.enabled=false → 跳过验证（直接 return）
 * - 场景 3：system_config 没有 turnstile.config → 降级读 TURNSTILE_SECRET_KEY 环境变量
 *
 * 设计说明：
 * - mock SystemConfigService.getConfigByKey 模拟 DB 返回值
 * - mock ConfigService.get 模拟环境变量
 * - mock cacheService.exists / setex 控制"防重放"分支
 * - mock global.fetch 拦截 Cloudflare HTTP 调用（避免真实网络请求）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TurnstileService } from '../turnstile.service.js';
import { BadRequestException } from '@nestjs/common';

// ── 辅助工厂 ──

/** 构造 mock ConfigService，env 变量通过 setEnv 控制 */
function createMockConfigService(env: Record<string, string | undefined> = {}) {
    return {
        get: vi.fn((key: string) => env[key]),
    };
}

/** 构造 mock ICacheService（仅需 exists / setex 走通） */
function createMockCacheService() {
    return {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        delMany: vi.fn(),
        delByPattern: vi.fn(),
        mget: vi.fn(),
        setTtlByPattern: vi.fn(),
        exists: vi.fn().mockResolvedValue(false),
        incr: vi.fn(),
        setex: vi.fn().mockResolvedValue(undefined),
        ttl: vi.fn(),
        evalLua: vi.fn(),
        getStats: vi.fn(),
        getKeyType: vi.fn(),
    };
}

/** 构造 mock SystemConfigService（仅 getConfigByKey 走通） */
function createMockSystemConfigService(getConfigByKey: ReturnType<typeof vi.fn>) {
    return {
        getConfigByKey,
    };
}

// ── 公共 beforeEach ──

describe('TurnstileService', () => {
    let service: TurnstileService;
    let mockConfig: ReturnType<typeof createMockConfigService>;
    let mockCache: ReturnType<typeof createMockCacheService>;
    let mockSystemConfig: { getConfigByKey: ReturnType<typeof vi.fn> };
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockConfig = createMockConfigService();
        mockCache = createMockCacheService();
        mockSystemConfig = {
            getConfigByKey: vi.fn(),
        };

        service = new TurnstileService(mockConfig as any, mockCache as any, mockSystemConfig as any);

        // 用 vi.stubGlobal 拦截 fetch，避免真实 HTTP 调用
        fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // ── 场景 1：system_config.enabled=true + secretKey → 走 Cloudflare ──

    describe('场景 1: system_config 有 enabled=true + secretKey', () => {
        it('应优先用 system_config 里的 secretKey 调用 Cloudflare（不读环境变量）', async () => {
            // system_config 返回开启 + 自定义 secret
            mockSystemConfig.getConfigByKey.mockResolvedValue({
                enabled: true,
                siteKey: '0xAAAA_SITE',
                secretKey: '0xBBBB_SECRET_FROM_DB',
            });
            // 环境变量也配了，**不应该被读到**（system_config 优先级最高）
            mockConfig.get.mockReturnValue('0xZZZZ_ENV_SECRET');

            // Cloudflare 模拟返回 success
            fetchSpy.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            });

            await service.verify('test-token-001', '1.2.3.4');

            // 1. 应只查一次 system_config
            expect(mockSystemConfig.getConfigByKey).toHaveBeenCalledTimes(1);
            expect(mockSystemConfig.getConfigByKey).toHaveBeenCalledWith('turnstile.config', true);

            // 2. 不应读环境变量（优先级：system_config > env）
            expect(mockConfig.get).not.toHaveBeenCalled();

            // 3. Cloudflare 调用时 secret 应来自 DB
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const fetchUrl = fetchSpy.mock.calls[0][0];
            const fetchInit = fetchSpy.mock.calls[0][1];
            expect(fetchUrl).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
            const body = fetchInit.body as string;
            expect(body).toContain('secret=0xBBBB_SECRET_FROM_DB');
            expect(body).toContain('response=test-token-001');
            expect(body).toContain('remoteip=1.2.3.4');
            // 关键断言：环境变量的 secret 不应在 body 里
            expect(body).not.toContain('0xZZZZ_ENV_SECRET');

            // 4. 防重放：token 未被消费 → 通过 → setex 标记
            expect(mockCache.exists).toHaveBeenCalledTimes(1);
            expect(mockCache.setex).toHaveBeenCalledWith(expect.any(String), 300, '1');
        });

        it('应在 1 分钟内复用内存缓存（不重复查 system_config）', async () => {
            mockSystemConfig.getConfigByKey.mockResolvedValue({
                enabled: true,
                secretKey: 'cached-secret',
            });
            fetchSpy.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            });

            // 连续调用两次 verify
            await service.verify('token-A', '1.1.1.1');
            await service.verify('token-B', '1.1.1.1');

            // system_config 只查一次（第二次命中内存缓存）
            expect(mockSystemConfig.getConfigByKey).toHaveBeenCalledTimes(1);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });
    });

    // ── 场景 2：system_config.enabled=false → 跳过验证 ──

    describe('场景 2: system_config.enabled=false', () => {
        it('应直接跳过验证，不调 Cloudflare、不读环境变量', async () => {
            // system_config 显式禁用
            mockSystemConfig.getConfigByKey.mockResolvedValue({
                enabled: false,
                siteKey: '0xSITE',
                secretKey: '0xSECRET',
            });
            // 环境变量也配了，**因为 enabled=false 而不读**
            mockConfig.get.mockReturnValue('0xENV_SECRET');

            // 不应抛错
            await expect(service.verify('any-token', '1.2.3.4')).resolves.toBeUndefined();

            // 1. system_config 查了
            expect(mockSystemConfig.getConfigByKey).toHaveBeenCalledTimes(1);

            // 2. 因为 enabled=false 直接 return，**不读环境变量**
            expect(mockConfig.get).not.toHaveBeenCalled();

            // 3. **不应调 Cloudflare**
            expect(fetchSpy).not.toHaveBeenCalled();

            // 4. 不应做防重放检查（已经被关掉了）
            expect(mockCache.exists).not.toHaveBeenCalled();
        });

        it('enabled=false 时即使有 token 也允许通过（等于关闭）', async () => {
            mockSystemConfig.getConfigByKey.mockResolvedValue({ enabled: false });

            // 任意 token 都不应触发 Cloudflare
            await expect(service.verify('any-token', '5.6.7.8')).resolves.toBeUndefined();
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });

    // ── 场景 3：system_config 没有 turnstile.config → 降级读环境变量 ──

    describe('场景 3: system_config 没有 turnstile.config', () => {
        it('应降级读 TURNSTILE_SECRET_KEY 环境变量', async () => {
            // system_config 完全没有这条记录
            mockSystemConfig.getConfigByKey.mockResolvedValue(null);
            // 环境变量配了
            mockConfig.get.mockImplementation((key: string) => {
                if (key === 'TURNSTILE_SECRET_KEY') return '0xENV_FALLBACK_SECRET';
                return undefined;
            });
            fetchSpy.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            });

            await service.verify('fallback-token', '9.9.9.9');

            // 1. system_config 查了一次（确认没有）
            expect(mockSystemConfig.getConfigByKey).toHaveBeenCalledTimes(1);

            // 2. 降级读环境变量
            expect(mockConfig.get).toHaveBeenCalledWith('TURNSTILE_SECRET_KEY');

            // 3. 用环境变量的 secret 调 Cloudflare
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const body = fetchSpy.mock.calls[0][1].body as string;
            expect(body).toContain('secret=0xENV_FALLBACK_SECRET');
        });

        it('系统配置和环境变量都没有 → 应跳过验证', async () => {
            // system_config 没有
            mockSystemConfig.getConfigByKey.mockResolvedValue(null);
            // 环境变量也没有
            mockConfig.get.mockReturnValue(undefined);

            // 不应抛错（开发环境友好）
            await expect(service.verify('any-token', '1.1.1.1')).resolves.toBeUndefined();

            // 不应调 Cloudflare
            expect(fetchSpy).not.toHaveBeenCalled();
            // 不应做防重放
            expect(mockCache.exists).not.toHaveBeenCalled();
        });

        it('系统配置 enabled=true 但 secretKey 缺失 → 降级到环境变量', async () => {
            // 启用了但 secretKey 字段为空
            mockSystemConfig.getConfigByKey.mockResolvedValue({
                enabled: true,
                siteKey: '0xSITE',
                secretKey: '',
            });
            mockConfig.get.mockReturnValue('0xENV_BACKUP');
            fetchSpy.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            });

            await service.verify('any-token', '1.1.1.1');

            // 降级到环境变量
            expect(mockConfig.get).toHaveBeenCalledWith('TURNSTILE_SECRET_KEY');
            const body = fetchSpy.mock.calls[0][1].body as string;
            expect(body).toContain('secret=0xENV_BACKUP');
        });
    });

    // ── 场景 4：缺失 token 行为（有 secret 才检查，spec 设计的"管理员关闭"路径） ──

    describe('场景 4: 缺失 token 行为（按 spec "管理员关闭 = 不验证" 语义）', () => {
        it('**有 secret + 缺失 token** → 应抛 BadRequestException(20007)（管理员启用了验证）', async () => {
            // 管理员在 system_config 启用了 Turnstile
            mockSystemConfig.getConfigByKey.mockResolvedValue({
                enabled: true,
                siteKey: '0xSITE',
                secretKey: '0xSECRET',
            });

            // 缺失 token（空字符串）→ 必须抛 20007
            await expect(service.verify('', '1.1.1.1')).rejects.toThrow(BadRequestException);

            // resolveSecret 调用了（确认有 secret）
            expect(mockSystemConfig.getConfigByKey).toHaveBeenCalledTimes(1);
            // 不应调 Cloudflare
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('**有 secret + 缺失 token（undefined）** → 应抛 20007', async () => {
            mockSystemConfig.getConfigByKey.mockResolvedValue({
                enabled: true,
                siteKey: '0xSITE',
                secretKey: '0xSECRET',
            });

            await expect(service.verify(undefined, '1.1.1.1')).rejects.toThrow(BadRequestException);
            expect(mockSystemConfig.getConfigByKey).toHaveBeenCalledTimes(1);
        });

        it('**没 secret + 缺失 token** → 应跳过（管理员在 system_config 显式 disabled）', async () => {
            // 管理员在 system_config 显式禁用 Turnstile
            mockSystemConfig.getConfigByKey.mockResolvedValue({ enabled: false });

            // 缺失 token 不应抛错（spec 核心设计：管理员关闭 = 不验证 + 不要求 token）
            await expect(service.verify('', '1.1.1.1')).resolves.toBeUndefined();
            await expect(service.verify(undefined, '1.1.1.1')).resolves.toBeUndefined();

            // resolveSecret 调用了
            expect(mockSystemConfig.getConfigByKey).toHaveBeenCalled();
            // 不应调 Cloudflare
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('**没 secret（系统配置和环境都没有）+ 缺失 token** → 应跳过', async () => {
            mockSystemConfig.getConfigByKey.mockResolvedValue(null);
            mockConfig.get.mockReturnValue(undefined);

            // 缺失 token 也应跳过
            await expect(service.verify('', '1.1.1.1')).resolves.toBeUndefined();
            await expect(service.verify(undefined, '1.1.1.1')).resolves.toBeUndefined();
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });

    // ── 场景 5：dev 模式 mock token（前端 useTurnstile 的 LOCAL_DEV_BYPASS_ 前缀） ──

    describe('场景 5: dev 模式 LOCAL_DEV_BYPASS_ mock token 识别', () => {
        afterEach(() => {
            // 清理 NODE_ENV stub，避免影响其他 describe
            vi.unstubAllEnvs();
        });

        it('dev 模式 + LOCAL_DEV_BYPASS_ token + DB 启用 → 应直接放行（不调 Cloudflare）', async () => {
            // 模拟 dev 环境
            vi.stubEnv('NODE_ENV', 'development');
            // DB 启用了 Turnstile（这是典型的本地 dev 场景）
            mockSystemConfig.getConfigByKey.mockResolvedValue({
                enabled: true,
                siteKey: '0xSITE',
                secretKey: '0xSECRET',
            });

            // 前端 useTurnstile 在 mock 模式下生成的 fake token
            const fakeToken = `LOCAL_DEV_BYPASS_${Date.now()}`;

            // 不应抛错，直接放行
            await expect(service.verify(fakeToken, '1.1.1.1')).resolves.toBeUndefined();

            // **关键：不应调 Cloudflare**（因为是 dev mock，不需要真实验证）
            expect(fetchSpy).not.toHaveBeenCalled();
            // **不应做防重放**（mock token 没有重放意义）
            expect(mockCache.exists).not.toHaveBeenCalled();
        });

        it('生产环境 + LOCAL_DEV_BYPASS_ token + DB 启用 → 应抛 20007（防攻击）', async () => {
            // 模拟生产环境
            vi.stubEnv('NODE_ENV', 'production');
            mockSystemConfig.getConfigByKey.mockResolvedValue({
                enabled: true,
                siteKey: '0xSITE',
                secretKey: '0xSECRET',
            });

            // 攻击者拿到 dev mock token 想绕过 → 生产环境必须拒绝
            const fakeToken = `LOCAL_DEV_BYPASS_${Date.now()}`;

            // 应抛 20007
            let caught: unknown;
            try {
                await service.verify(fakeToken, '8.8.8.8');
            } catch (err) {
                caught = err;
            }
            expect(caught).toBeInstanceOf(BadRequestException);
            // 不应调 Cloudflare（fake token 直接拒绝，不需要去 Cloudflare 验证）
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('dev 模式 + LOCAL_DEV_BYPASS_ token + DB enabled=false → 也应放行（enabled=false 优先）', async () => {
            // dev 环境 + 管理员在 DB 关了 Turnstile
            vi.stubEnv('NODE_ENV', 'development');
            mockSystemConfig.getConfigByKey.mockResolvedValue({ enabled: false });

            const fakeToken = `LOCAL_DEV_BYPASS_${Date.now()}`;

            // 不应抛错
            await expect(service.verify(fakeToken, '1.1.1.1')).resolves.toBeUndefined();
            // 不应调 Cloudflare
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('非 dev 也非 production（test 模式）+ LOCAL_DEV_BYPASS_ token → 应放行（仅 production 严格）', async () => {
            // vi.stubEnv 设的 default 是 'test'，覆盖一下
            vi.stubEnv('NODE_ENV', 'test');
            mockSystemConfig.getConfigByKey.mockResolvedValue({
                enabled: true,
                siteKey: '0xSITE',
                secretKey: '0xSECRET',
            });

            const fakeToken = `LOCAL_DEV_BYPASS_${Date.now()}`;

            // test 模式 != production → 视为 dev → 放行
            await expect(service.verify(fakeToken, '1.1.1.1')).resolves.toBeUndefined();
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });
});
