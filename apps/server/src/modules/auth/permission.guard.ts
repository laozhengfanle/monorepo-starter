import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { resolveAccountPermissions } from './account-permission.util.js';
import { PERMISSIONS_KEY } from './permission.decorator.js';
import type { AuthUser } from './auth.types.js';

/**
 * 权限守卫：校验当前用户是否拥有 @RequirePermission 声明的权限点。
 * - 权限来源：account → adminRoles → roleMenus → menu.code（permissionCode）
 *   再叠加账户级特例授权覆盖（admin_account_menu）：grant 追加、deny 移除（deny 优先）
 * - 与 me() 共用 resolveAccountPermissions，保证前端显示与后端校验一致
 * - 超级管理员（super_admin 角色）自动绕过（不看权限）
 * - 必须排在 JwtAuthGuard 之后（依赖 request.user）
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }

    const type = context.getType<string>();
    const req =
      type === 'graphql'
        ? GqlExecutionContext.create(context).getContext().req
        : context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('未认证');
    }

    const account = await this.prisma.client.account.findUnique({
      where: { id: user.accountId },
      include: {
        adminRoles: {
          include: { role: { include: { roleMenus: { include: { menu: true } } } } },
        },
      },
    });
    if (!account) {
      throw new ForbiddenException('账户不存在');
    }

    // 超级管理员绕过
    if (account.adminRoles.some((r) => r.role.code === 'super_admin')) {
      return true;
    }

    // 聚合权限点：角色基线 + 账户特例授权覆盖（grant 追加 / deny 移除，deny 优先）
    const ownedCodes = await resolveAccountPermissions(this.prisma, account);
    const hasAll = required.every((permission) => ownedCodes.has(permission));
    if (!hasAll) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}
