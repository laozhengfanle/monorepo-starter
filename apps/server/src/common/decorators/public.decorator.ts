import { SetMetadata } from '@nestjs/common';

/**
 * @Public() 装饰器 — 标记路由不需要鉴权
 * - 配合 JwtAuthGuard 使用
 * - 示例：@Public() @Post('login') adminLogin()
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
