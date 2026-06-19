import { Global, Module } from '@nestjs/common';
import { AccountService } from './account.service.js';
import { AccountIdentityModule } from './account-identity/account-identity.module.js';

/**
 * 账户全局模块
 * - @Global() 声明后，其他模块无需重复 imports 即可注入 AccountService
 * - 包含 AccountIdentityModule（修改密码等）
 */
@Global()
@Module({
    imports: [AccountIdentityModule],
    providers: [AccountService],
    exports: [AccountService],
})
export class AccountModule {}
