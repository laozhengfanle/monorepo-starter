import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Metrics 端点 IP 白名单 Guard
 *
 * 用途：/metrics 端点暴露应用内部状态（请求数、QPS、错误率、连接池使用等），
 *       对公网开放会泄露业务规模、QPS 峰值、慢查询等敏感信息。
 *
 * 放行规则（RFC 1918 私有网段 + IPv6 本地/链路本地）：
 * - 10.0.0.0/8     — A 类私网
 * - 172.16.0.0/12  — B 类私网
 * - 192.168.0.0/16 — C 类私网
 * - 127.0.0.0/8    — IPv4 回环
 * - ::1            — IPv6 回环
 * - ::ffff:127.x.x.x — IPv4 映射的 IPv6 回环（Node 在 dual-stack 环境下会这么返回）
 * - fc00::/7       — IPv6 唯一本地地址（ULA）
 * - fe80::/10      — IPv6 链路本地
 *
 * 反向代理 / 负载均衡场景（防 XFF 绕过）：
 * - **必须**显式配置 `TRUSTED_PROXIES`（CIDR 列表，逗号分隔，例如 `10.0.0.0/8,172.16.0.0/12`）
 *   才会信任请求中的 `X-Forwarded-For` 头
 * - **未配置**时直接取 socket.remoteAddress（攻击者无法通过 XFF 伪造 IP 绕过白名单）
 *
 * 不使用 ip 库：手写正则已能覆盖所有常见内网段，引入 ip-range-check 等依赖收益不大
 */
const PRIVATE_NETS: RegExp[] = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^127\./, // 127.0.0.0/8 loopback
    /^::1$/, // IPv6 loopback
    /^::ffff:127\./, // IPv4-mapped IPv6 loopback
    /^fc00:/, // IPv6 ULA
    /^fe80:/, // IPv6 link-local
];

/**
 * 检查 IP 是否在白名单内网段
 * - 接受 IPv4 和 IPv6 字符串
 * - 失败时返回 false（与 PRIVATE_NETS.any 语义一致）
 */
function isPrivateIp(ip: string): boolean {
    if (!ip) return false;
    // 去掉 IPv4-mapped IPv6 前缀
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    return PRIVATE_NETS.some((re) => re.test(normalized) || re.test(ip));
}

@Injectable()
export class MetricsIpGuard implements CanActivate {
    constructor(private readonly configService: ConfigService) {}

    /**
     * 校验请求 IP 是否在内网白名单
     * - 放行：返回 true
     * - 拒绝：抛 ForbiddenException（GlobalExceptionFilter 会转换为业务错误响应）
     *
     * XFF 信任策略：
     * - 仅当 TRUSTED_PROXIES 配置且 socket IP 在 TRUSTED_PROXIES 内时，才信任 X-Forwarded-For
     * - 默认从 socket.remoteAddress 取 IP（XFF 完全被忽略，防伪造）
     */
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const socketIp = req.socket?.remoteAddress || '';

        /**
         * 决定是否信任 XFF 的客户端 IP
         * 1. socket IP 在 TRUSTED_PROXIES 列表中 → 信任 XFF（取最左侧客户端 IP）
         * 2. 否则 → 忽略 XFF，用 socket IP
         */
        const trustedProxies = this.parseTrustedProxies(this.configService.get<string>('TRUSTED_PROXIES'));
        const trustXff = trustedProxies.length > 0 && isPrivateIp(socketIp) && this.matchCidr(socketIp, trustedProxies);

        let clientIp = socketIp;
        if (trustXff) {
            const xff = req.headers['x-forwarded-for'];
            if (typeof xff === 'string' && xff.length > 0) {
                // XFF 格式: client, proxy1, proxy2 — 取第一个（最左侧 = 真实客户端）
                clientIp = xff.split(',')[0]?.trim() || socketIp;
            }
        }

        if (isPrivateIp(clientIp)) {
            return true;
        }
        throw new ForbiddenException('metrics endpoint only accessible from private network');
    }

    /**
     * 解析 TRUSTED_PROXIES 环境变量
     * - 逗号分隔的 CIDR 列表（简化为前缀匹配，不做严格 CIDR 计算）
     * - 未配置 / 空字符串 → 返回空数组（不信任 XFF）
     */
    private parseTrustedProxies(raw: string | undefined): string[] {
        if (!raw || typeof raw !== 'string') return [];
        return raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    /**
     * 严格 CIDR 匹配（IPv4）
     *
     * 替代旧的"简化前缀匹配"（只取前三段做 A 类匹配）：
     * - 旧实现无法正确处理 /16 /24 /28 等非 8 位边界的 CIDR
     * - 新实现将 IP 和 CIDR 转为 32 位无符号整数，按位 AND mask 比较
     *
     * 算法：
     * 1. IP → 32 位整数（按点分十进制解析）
     * 2. CIDR → 网络地址 + 前缀长度（如 10.0.0.0/8 → 0x0A000000, 8）
     * 3. mask = (0xFFFFFFFF << (32 - prefixLen)) >>> 0
     * 4. 匹配条件：(ip & mask) === (network & mask)
     *
     * @param ip IPv4 地址字符串（已去除 IPv4-mapped IPv6 前缀）
     * @param cidrs CIDR 列表（如 ['10.0.0.0/8', '172.16.0.0/12']）
     * @returns true 表示 IP 匹配任一 CIDR
     */
    private matchCidr(ip: string, cidrs: string[]): boolean {
        /** 将 IPv4 点分十进制转为 32 位无符号整数 */
        const ipToInt = (ipStr: string): number | null => {
            const parts = ipStr.split('.');
            if (parts.length !== 4) return null;
            let result = 0;
            for (const part of parts) {
                const n = Number.parseInt(part, 10);
                if (Number.isNaN(n) || n < 0 || n > 255) return null;
                result = (result << 8) | n;
            }
            return result >>> 0; // 转为无符号
        };

        const ipInt = ipToInt(ip);
        if (ipInt === null) return false;

        return cidrs.some((cidr) => {
            /** 解析 CIDR：network/prefixLen（如 10.0.0.0/8） */
            const slashIdx = cidr.indexOf('/');
            let network: string;
            let prefixLen: number;

            if (slashIdx >= 0) {
                network = cidr.slice(0, slashIdx);
                prefixLen = Number.parseInt(cidr.slice(slashIdx + 1), 10);
            } else {
                /** 无前缀长度 → 视为 /32（精确匹配单个 IP） */
                network = cidr;
                prefixLen = 32;
            }

            /** 校验 prefixLen 范围 */
            if (Number.isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;

            const networkInt = ipToInt(network);
            if (networkInt === null) return false;

            /**
             * 计算 mask
             * - prefixLen=8 → mask=0xFF000000
             * - prefixLen=16 → mask=0xFFFF0000
             * - prefixLen=24 → mask=0xFFFFFF00
             * - prefixLen=32 → mask=0xFFFFFFFF
             * - prefixLen=0 → mask=0x00000000（匹配所有 IP）
             */
            const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;

            /** 按位 AND 比较 */
            return (ipInt & mask) === (networkInt & mask);
        });
    }
}
