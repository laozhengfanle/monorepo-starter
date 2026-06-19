/**
 * WebSocket 鉴权
 *
 * 设计背景：
 * - 当前项目没有 WebSocket gateway（Grep 无结果）
 * - 此模块为「开箱即用」组件，未来添加 WebSocket gateway 时直接挂上
 *
 * 工作流程（握手阶段）：
 * 1. 浏览器通过 socket.io 客户端建立连接
 *    - socket.io 客户端会自动把 httpOnly cookie 拼到握手请求的 Cookie 头
 *    - 这意味着我们能从 handshake.headers.cookie 读 accessToken / refreshToken
 * 2. WsAuthGuard / verifyWsHandshake 解析 cookie 拿到 token
 * 3. 用 jwtService.verifyAsync 校验签名
 * 4. 校验通过 → client.data.accountId = sub（业务消息 handler 可读）
 * 5. 校验失败 → 抛 WsException（socket.io 拒绝握手）
 *
 * 为何不只校验 access token：
 * - access token TTL 短（15min），WS 长连接中途过期需主动 emit AUTH_EXPIRED
 * - 所以握手时也接受 refresh token
 * - 但生产环境建议只用 access token（refresh token 一旦泄露比 access 严重）
 *   - 这里采用双 token 都接受的设计，由调用方在握手 handler 中选择
 *
 * 用法示例（未来添加 gateway 时）：
 * ```ts
 * @WebSocketGateway({ cors: { origin: ... } })
 * @UseWsAuth()  // ← 装饰器，握手阶段校验 token
 * export class NotificationsGateway {
 *   @WebSocketServer() server: Server;
 *
 *   @SubscribeMessage('ping')
 *   handlePing(@ConnectedSocket() client: Socket) {
 *     // client.data.accountId 已由 WsAuthGuard 注入
 *     return { pong: true, accountId: client.data.accountId };
 *   }
 * }
 * ```
 *
 * 与 JwtStrategy 的关系：
 * - JwtStrategy 用 passport-jwt，依赖 req 对象
 * - WebSocket 握手阶段没有 req，只有 handshake 对象
 * - 所以这里手写校验逻辑（与 JwtStrategy 共享 jwtService 实例）
 * - 两层防护（jti 黑名单 + tokenVersion）也在此处复制实现
 */
import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../../modules/auth/jwt.strategy.js';
import { TokenBlacklistService } from '../services/token-blacklist.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** @UseWsAuth() 元数据 key */
export const USE_WS_AUTH_KEY = 'useWsAuth';

/**
 * 装饰器：标记某个 Gateway 类需要 WS 握手鉴权
 * - 与 @UseGuards(WsAuthGuard) 配合使用
 * - 也可以直接对单个 @SubscribeMessage 标注，单独控制
 */
export const UseWsAuth = (): MethodDecorator & ClassDecorator => SetMetadata(USE_WS_AUTH_KEY, true);

/** 握手成功时挂到 client.data 的字段 */
export interface WsClientData {
    accountId: string;
    userType: string;
    /** 关联的 jti（用于 AUTH_EXPIRED 消息精确定位） */
    jti?: string;
    /** 关联的 tokenVersion（用于快速校验） */
    tokenVersion: number;
}

/**
 * Cookie 头解析（简化版，支持 `k=v; k2=v2` 格式）
 * - 不依赖 cookie-parser（因为 handshake 阶段不一定经过 Express 中间件）
 * - 只取需要的 cookie 字段，未做 RFC 6265 完整实现（不去 trim 引号等）
 */
export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
    if (!header) return {};
    const out: Record<string, string> = {};
    const parts = header.split(';');
    for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        const key = part.slice(0, idx).trim();
        const value = decodeURIComponent(part.slice(idx + 1).trim());
        if (key) out[key] = value;
    }
    return out;
}

/**
 * 握手时尝试从 cookie 解析 token
 * - 优先 accessToken（短 TTL，安全性更高）
 * - 退化到 refreshToken（长 TTL，握手时若 access 过期也能用）
 *
 * @param cookies 解析后的 cookie 字典
 * @returns 找到的 token（accessToken 优先），没有返回 undefined
 */
export function pickWsToken(cookies: Record<string, string>): string | undefined {
    if (cookies['accessToken']) return cookies['accessToken'];
    if (cookies['refreshToken']) return cookies['refreshToken'];
    return undefined;
}

/**
 * WsException — 握手失败时抛此异常，socket.io 会拒绝连接
 * - code 字段用于客户端区分错误类型
 */
export class WsAuthException extends Error {
    constructor(
        message: string,
        public readonly code: 'AUTH_MISSING' | 'AUTH_INVALID' | 'AUTH_EXPIRED' | 'AUTH_REVOKED',
    ) {
        super(message);
        this.name = 'WsAuthException';
    }
}

/**
 * 握手校验依赖
 * - 抽出来便于单元测试（无需 mock 整个 NestJS DI 容器）
 */
export interface WsAuthDeps {
    jwtService: Pick<JwtService, 'verifyAsync'>;
    configService: Pick<ConfigService, 'get'>;
    tokenBlacklist: Pick<TokenBlacklistService, 'isRevoked'>;
    prisma: Pick<PrismaService, 'client'>;
}

/**
 * 核心：握手时校验 token，返回挂到 client.data 的数据
 * - 这是纯函数式实现，便于单测
 * - 真实场景下，WsAuthGuard.canActivate 内部会调用本函数
 *
 * 校验链（任何一步失败立即抛 WsAuthException）：
 * 1) cookie 解析
 * 2) token 提取（accessToken 优先）
 * 3) jwtService.verifyAsync（签名 / issuer / audience / exp）
 * 4) tokenBlacklist.isRevoked(jti)（精确撤销）
 * 5) prisma 查 account.tokenVersion（粗粒度版本）
 * 6) 返回 WsClientData
 *
 * @param handshake socket.io 握手对象（io.use 时是 Socket['handshake']）
 * @param deps 注入的服务
 * @returns 注入到 client.data 的数据
 */
export async function verifyWsHandshake(
    handshake: { headers?: Record<string, string | string[]>; auth?: Record<string, unknown> },
    deps: WsAuthDeps,
): Promise<WsClientData> {
    /** 1) 解析 cookie */
    const rawCookieHeader = handshake.headers?.['cookie'];
    const cookieStr = Array.isArray(rawCookieHeader) ? rawCookieHeader[0] : rawCookieHeader;
    const cookies = parseCookieHeader(cookieStr);

    /** 2) 提取 token（也支持 auth 模式：socket.io 客户端的 auth 选项） */
    let token = pickWsToken(cookies);
    if (!token) {
        // socket.io v4 客户端支持 auth 模式传 token
        // 例：io(url, { auth: { token: 'xxx' } })
        const authToken = handshake.auth?.['token'];
        if (typeof authToken === 'string') {
            token = authToken;
        }
    }
    if (!token) {
        throw new WsAuthException('Missing access token', 'AUTH_MISSING');
    }

    /** 3) 验证 JWT 签名 + exp + issuer + audience */
    let payload: JwtPayload;
    try {
        payload = await deps.jwtService.verifyAsync<JwtPayload>(token, {
            algorithms: ['HS256'],
            issuer: deps.configService.get<string>('auth.JWT_ISSUER'),
            audience: deps.configService.get<string>('auth.JWT_AUDIENCE'),
        });
    } catch (err) {
        // jwt.verify 抛 TokenExpiredError / JsonWebTokenError / NotBeforeError
        const msg = (err as Error).message || '';
        if (msg.includes('expired')) {
            throw new WsAuthException('Token expired', 'AUTH_EXPIRED');
        }
        throw new WsAuthException('Invalid token', 'AUTH_INVALID');
    }

    if (!payload.sub || !payload.userType) {
        throw new WsAuthException('Invalid token payload', 'AUTH_INVALID');
    }

    /** 4) jti 黑名单（精确撤销）— 必须传 accountId 把 jti='*' 限定到本账号 */
    if (payload.jti) {
        const revoked = await deps.tokenBlacklist.isRevoked(payload.jti, payload.sub);
        if (revoked) {
            throw new WsAuthException('Token revoked', 'AUTH_REVOKED');
        }
    }

    /** 5) account.tokenVersion 一致性 */
    const account = await deps.prisma.client.account.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true },
    });
    if (!account) {
        throw new WsAuthException('Account not found', 'AUTH_INVALID');
    }
    const tokenVersionInPayload = payload.tokenVersion ?? 0;
    if (tokenVersionInPayload !== account.tokenVersion) {
        throw new WsAuthException('Token version mismatch', 'AUTH_EXPIRED');
    }

    /** 6) 返回挂到 client.data 的数据 */
    return {
        accountId: payload.sub,
        userType: payload.userType,
        jti: payload.jti,
        tokenVersion: account.tokenVersion,
    };
}

/**
 * 握手中间件工厂（直接给 socket.io 的 io.use() 用）
 * - 比 NestJS Guard 模式更通用——能在 NestJS 接管前拒绝非法连接
 * - 用法：io.use(wsAuthMiddleware(deps))
 *
 * @param deps 注入的服务
 * @returns socket.io 中间件 (socket, next) => void
 */
export const wsAuthMiddleware =
    (deps: WsAuthDeps) =>
    async (
        socket: {
            handshake: { headers?: Record<string, string | string[]>; auth?: Record<string, unknown> };
            data: Record<string, unknown>;
        },
        next: (err?: Error) => void,
    ): Promise<void> => {
        try {
            const data = await verifyWsHandshake(socket.handshake, deps);
            socket.data['accountId'] = data.accountId;
            socket.data['userType'] = data.userType;
            socket.data['jti'] = data.jti;
            socket.data['tokenVersion'] = data.tokenVersion;
            next();
        } catch (err) {
            next(err as Error);
        }
    };

/**
 * NestJS Guard 实现（用于 @UseGuards(WsAuthGuard)）
 * - 适合在 @WebSocketGateway 类上直接挂
 * - canActivate 阶段会调用 verifyWsHandshake
 * - 把结果挂到 client.data，供后续 handler 读
 *
 * 注意：WsAuthGuard 必须用 Reflector 配合 @UseWsAuth() 装饰器使用
 *   - 没有装饰器标记的 Gateway 不强制启用
 *   - 但也可以直接在类上挂 @UseGuards(WsAuthGuard) 强制启用
 */
@Injectable()
export class WsAuthGuard implements CanActivate {
    private readonly logger = new Logger(WsAuthGuard.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly tokenBlacklist: TokenBlacklistService,
        private readonly prisma: PrismaService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 检查 @UseWsAuth() 元数据，没标的不强制
        // （允许不同 Gateway 用不同策略：部分公开、部分鉴权）
        const marked = this.reflector.getAllAndOverride<boolean>(USE_WS_AUTH_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!marked) {
            return true;
        }

        /**
         * ExecutionContext 在 WS 场景下：
         * - context.switchToWs() 返回 WsArgumentsHost
         * - getClient() 拿到 socket 实例
         */
        const client = context.switchToWs().getClient<{
            handshake: { headers?: Record<string, string | string[]>; auth?: Record<string, unknown> };
            data: Record<string, unknown>;
            emit?: (event: string, payload: unknown) => void;
        }>();

        try {
            const data = await verifyWsHandshake(client.handshake, {
                jwtService: this.jwtService,
                configService: this.configService,
                tokenBlacklist: this.tokenBlacklist,
                prisma: this.prisma,
            });
            client.data['accountId'] = data.accountId;
            client.data['userType'] = data.userType;
            client.data['jti'] = data.jti;
            client.data['tokenVersion'] = data.tokenVersion;
            return true;
        } catch (err) {
            if (err instanceof WsAuthException) {
                this.logger.warn(`WS auth failed: ${err.message} (code=${err.code})`);
            } else {
                this.logger.error(`WS auth error: ${(err as Error).message}`);
            }
            // 握手阶段拒绝：socket.io 收到 false/throw 会断开连接
            // NestJS WS adapter 把抛出的异常转成 WsException
            throw err;
        }
    }
}
