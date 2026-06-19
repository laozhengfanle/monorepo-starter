/**
 * MetricsIpGuard 单元测试
 *
 * 覆盖：
 * - 内网 IP（10.x / 172.16-31.x / 192.168.x / 127.x / IPv6）放行
 * - 公网 IP 拒绝
 * - 未配 TRUSTED_PROXIES 时，伪造 XFF（声称是 127.0.0.1）但 socket 是公网 IP → 拒绝
 * - 配置 TRUSTED_PROXIES 后，socket 在 trusted 网段内 + XFF 是 10.x → 放行
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsIpGuard } from '../metrics-ip.guard';

function createMockConfigService(overrides: Record<string, any> = {}): ConfigService {
    return {
        get: vi.fn().mockImplementation((key: string) => overrides[key]),
    } as unknown as ConfigService;
}

function createMockRequest(socketIp: string, xff?: string): any {
    const headers: Record<string, string> = {};
    if (xff) headers['x-forwarded-for'] = xff;
    return {
        socket: { remoteAddress: socketIp },
        ip: socketIp,
        headers,
    };
}

function createMockContext(req: any): any {
    return {
        switchToHttp: () => ({
            getRequest: () => req,
        }),
    };
}

describe('MetricsIpGuard', () => {
    let guard: MetricsIpGuard;
    let config: ConfigService;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('无 TRUSTED_PROXIES 配置（默认安全）', () => {
        beforeEach(() => {
            config = createMockConfigService({ TRUSTED_PROXIES: undefined });
            guard = new MetricsIpGuard(config);
        });

        it('socket IP = 10.x.x.x（内网）→ 放行', () => {
            const ctx = createMockContext(createMockRequest('10.0.0.1'));
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('socket IP = 192.168.x.x（内网）→ 放行', () => {
            const ctx = createMockContext(createMockRequest('192.168.1.1'));
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('socket IP = 172.16-31.x.x（内网）→ 放行', () => {
            expect(guard.canActivate(createMockContext(createMockRequest('172.16.0.1')))).toBe(true);
            expect(guard.canActivate(createMockContext(createMockRequest('172.20.0.1')))).toBe(true);
            expect(guard.canActivate(createMockContext(createMockRequest('172.31.255.255')))).toBe(true);
        });

        it('socket IP = 127.0.0.1（回环）→ 放行', () => {
            const ctx = createMockContext(createMockRequest('127.0.0.1'));
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('socket IP = 公网 IP（8.8.8.8）→ 拒绝', () => {
            const ctx = createMockContext(createMockRequest('8.8.8.8'));
            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
        });

        it('socket IP = 公网 IP（172.32.x.x 超出 B 类私网）→ 拒绝', () => {
            const ctx = createMockContext(createMockRequest('172.32.0.1'));
            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
        });

        it('socket IP = 公网 IP（11.0.0.1） + XFF 伪造 127.0.0.1 → 拒绝（防 XFF 绕过）', () => {
            const ctx = createMockContext(createMockRequest('11.0.0.1', '127.0.0.1'));
            // 关键：未配 TRUSTED_PROXIES 时必须忽略 XFF，否则攻击者能伪造本地 IP
            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
        });

        it('socket IP = 10.x（内网）+ XFF 伪造公网 8.8.8.8 → 放行（socket 在白名单内）', () => {
            const ctx = createMockContext(createMockRequest('10.0.0.1', '8.8.8.8'));
            // 默认不信任 XFF，所以取 socket IP = 10.0.0.1（内网 → 放行）
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('socket IP = ::1（IPv6 回环）→ 放行', () => {
            const ctx = createMockContext(createMockRequest('::1'));
            expect(guard.canActivate(ctx)).toBe(true);
        });
    });

    describe('配置 TRUSTED_PROXIES 后', () => {
        beforeEach(() => {
            config = createMockConfigService({ TRUSTED_PROXIES: '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16' });
            guard = new MetricsIpGuard(config);
        });

        it('socket = 10.0.0.1（trusted proxy）+ XFF = 127.0.0.1 → 放行（信任 XFF）', () => {
            const ctx = createMockContext(createMockRequest('10.0.0.1', '127.0.0.1'));
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('socket = 10.0.0.1（trusted proxy）+ XFF = 8.8.8.8（公网）→ 拒绝', () => {
            const ctx = createMockContext(createMockRequest('10.0.0.1', '8.8.8.8'));
            // XFF 取首 IP = 8.8.8.8 → 公网 → 拒绝
            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
        });

        it('socket = 192.168.1.1（trusted proxy）+ XFF = 192.168.10.10 → 放行', () => {
            const ctx = createMockContext(createMockRequest('192.168.1.1', '192.168.10.10'));
            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('socket = 8.8.8.8（公网，非 trusted proxy）+ XFF = 10.0.0.1 → 拒绝（不信任 XFF）', () => {
            // 即使配置了 TRUSTED_PROXIES，socket IP 不在 trusted 内时仍然忽略 XFF
            const ctx = createMockContext(createMockRequest('8.8.8.8', '10.0.0.1'));
            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
        });

        it('socket = 10.0.0.1 + 多级 XFF "client, proxy1, proxy2" → 取首个 client IP', () => {
            const ctx = createMockContext(createMockRequest('10.0.0.1', '192.168.5.5, 10.0.0.2, 10.0.0.3'));
            // XFF 首个 = 192.168.5.5（内网）→ 放行
            expect(guard.canActivate(ctx)).toBe(true);
        });
    });

    describe('TRUSTED_PROXIES 为空字符串', () => {
        it('空字符串 → 等同未配置（不信任 XFF）', () => {
            const cfg = createMockConfigService({ TRUSTED_PROXIES: '' });
            const g = new MetricsIpGuard(cfg);
            const ctx = createMockContext(createMockRequest('11.0.0.1', '127.0.0.1'));
            expect(() => g.canActivate(ctx)).toThrow(ForbiddenException);
        });
    });
});
