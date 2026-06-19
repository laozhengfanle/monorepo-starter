/**
 * 审计模块
 * - 注册 AuditService
 * - 暴露给其他模块（如 admin-account / auth）注入使用
 */
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

@Global()
@Module({
    providers: [AuditService],
    exports: [AuditService],
})
export class AuditModule {}
