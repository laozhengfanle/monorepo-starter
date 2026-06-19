/**
 * C端测试控制器 — 用于验证 MemberPermissionGuard 和 GuestPermissionGuard
 * - 仅开发/测试环境使用
 * - 包含不同权限级别的端点，验证权限守卫是否正确工作
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator.js';
import { Permission } from '../../../common/decorators/permission.decorator.js';
import { DevOnlyGuard } from '../../../common/guards/dev-only.guard.js';
import { GuestPermissionGuard } from '../../../common/guards/guest-permission.guard.js';

@Controller('member/test')
@UseGuards(DevOnlyGuard)
export class MemberTestController {
    /** 公开端点 — 无需任何认证 */
    @Public()
    @Get('public')
    getPublic() {
        return { message: '公开内容，任何人可访问' };
    }

    /** VIP 专属内容 — 需要 member:vip:list 权限（GuestPermissionGuard 校验） */
    @Public()
    @Permission('member:vip:view')
    @UseGuards(GuestPermissionGuard)
    @Get('vip')
    getVipContent() {
        return { message: 'VIP 专属内容' };
    }

    /** SVIP 专属内容 — 需要 member:svip:list 权限（GuestPermissionGuard 校验） */
    @Public()
    @Permission('member:svip:view')
    @UseGuards(GuestPermissionGuard)
    @Get('svip')
    getSvipContent() {
        return { message: 'SVIP 专属内容' };
    }
}
