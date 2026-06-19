/**
 * SWC ESM 注册脚本（dev 模式专用）
 *
 * 唯一职责：注册 @swc-node/register/esm 加载器，让 `node src/main.ts` 实时编译 TS。
 *
 * 为什么用 swc 不用 tsx：
 * - swc 支持 emitDecoratorMetadata，NestJS DI 元数据（design:paramtypes）能正确生成
 * - tsx 仅支持 decorators 语法不会生成元数据 → AdminPermissionGuard 等运行时报
 *   "Nest can't resolve dependencies of the AdminPermissionGuard (?, ICacheService)"
 *
 * .env 加载不在 loader hook 里做：
 * - ConfigModule.forRoot() 在 AppModule imports 阶段会同步加载 .env（@nestjs/config 内部用 dotenv）
 * - dev/prod 行为完全一致：都走 ConfigModule，无需 loader hook 介入
 *
 * 用法：
 *   node --import ./scripts/swc-register.mjs src/main.ts
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// 以 apps/server 目录为根注册 swc 加载器
register('@swc-node/register/esm', pathToFileURL('./'));
