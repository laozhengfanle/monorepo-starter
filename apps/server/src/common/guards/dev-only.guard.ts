/**
 * 开发环境专用守卫
 *
 * 用法：@UseGuards(DevOnlyGuard) 挂在 controller 或 handler 上
 * - 非 production 环境：放行
 * - production 环境：抛出 NotFoundException（404），端点对生产完全不可见
 */
import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class DevOnlyGuard implements CanActivate {
    canActivate(): boolean {
        if (process.env.NODE_ENV === 'production') {
            throw new NotFoundException();
        }
        return true;
    }
}
