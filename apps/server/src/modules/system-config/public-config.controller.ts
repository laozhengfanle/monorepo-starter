import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { SystemConfig } from '@starter/contracts';
import { SystemConfigService } from './system-config.service.js';

/**
 * 公开配置端点（无需登录）：登录页等场景读取白名单配置
 * - 与受保护的管理端端点分离（避免类级 JwtAuthGuard 拦截）
 * - 白名单 + 字段级脱敏（secret 绝不外泄）
 */
@ApiTags('public-configs')
@Controller('public/configs')
export class PublicConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get()
  @ApiOkResponse({ description: '公开配置（白名单 + 字段级脱敏，无需鉴权）' })
  listPublic(): Promise<SystemConfig[]> {
    return this.systemConfigService.listPublic();
  }
}
