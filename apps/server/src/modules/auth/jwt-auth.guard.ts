import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthUser, JwtPayload } from './auth.types.js';
import { TokenBlacklistService } from './token-blacklist.service.js';

/**
 * JWT 认证守卫（自研，不依赖 passport）。
 * - REST / GraphQL 统一处理：从 Authorization: Bearer 提取 token
 * - 三层校验：签名（HS256）→ tokenVersion（改密/踢人后失效）→ jti 黑名单（精确撤销）
 * - 校验通过后挂 request.user = { accountId, userType }
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const type = context.getType<string>();
    const req =
      type === 'graphql'
        ? GqlExecutionContext.create(context).getContext().req
        : context.switchToHttp().getRequest<Request>();

    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('未登录或 Token 缺失');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        algorithms: ['HS256'],
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token 无效或已过期');
    }
    if (!payload.sub || !payload.userType) {
      throw new UnauthorizedException('无效的 Token');
    }

    // 1. 账户存在 + 启用 + tokenVersion 一致（改密/踢人后旧 token 失效）
    const account = await this.prisma.client.account.findUnique({
      where: { id: payload.sub },
      select: { enabled: true, tokenVersion: true },
    });
    if (!account || !account.enabled) {
      throw new UnauthorizedException('账户不存在或已禁用');
    }
    if ((payload.tokenVersion ?? 0) !== account.tokenVersion) {
      throw new UnauthorizedException('Token 已失效，请重新登录');
    }

    // 2. jti 黑名单（精确撤销 / '*' 账号全量）
    if (
      payload.jti &&
      (await this.tokenBlacklist.isRevoked(payload.jti, payload.sub))
    ) {
      throw new UnauthorizedException('Token 已撤销，请重新登录');
    }

    req.user = {
      accountId: payload.sub,
      userType: payload.userType,
    } satisfies AuthUser;
    return true;
  }

  private extractToken(req: Request): string | null {
    // 优先 Authorization: Bearer（API 客户端/测试）；回退 httpOnly cookie（admin 前端，P1-7 改造后
    // token 不再落 localStorage，由后端 Set-Cookie 下发，JS 不可读 → XSS 无法窃取）
    const header = req.headers?.['authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      'admin_access_token'
    ];
    if (typeof cookieToken === 'string' && cookieToken) {
      return cookieToken;
    }
    return null;
  }
}
