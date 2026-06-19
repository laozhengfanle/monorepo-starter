import { Module } from '@nestjs/common';
import { DocsController } from '../../bff/public/docs/docs.controller.js';

/**
 * 文档模块
 * - 提供 /api/docs 文件列表 + /api/docs/:slug 文件内容读取
 * - @Public() 跳过 JWT 认证（文档为只读内容，无安全风险）
 * - 仅读取 monorepo 根目录下 docs/*.md 文件
 */
@Module({
    controllers: [DocsController],
})
export class DocsModule {}
