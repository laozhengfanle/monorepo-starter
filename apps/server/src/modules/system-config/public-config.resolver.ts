import { Query, Resolver } from '@nestjs/graphql';
import { SystemConfigService } from './system-config.service.js';
import { SystemConfigType } from './system-config.type.js';

/**
 * 公开配置 GraphQL Resolver（无鉴权）：
 * 登录页等未登录场景读取白名单配置（settings：name/logo/footerText 等，敏感字段已脱敏）。
 * 与管理端 adminConfigs 分离，避免类级守卫拦截。
 */
@Resolver(() => SystemConfigType)
export class PublicConfigResolver {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Query(() => [SystemConfigType])
  async publicConfigs(): Promise<SystemConfigType[]> {
    return this.systemConfigService.listPublic();
  }
}
