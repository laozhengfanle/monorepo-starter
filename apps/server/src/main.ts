import { Logger } from '@nestjs/common';
import { createApp, DEFAULT_PORT, emitOpenApi } from './app-setup.js';

/**
 * 应用入口（仅作为构建产物执行；测试请导入 app-setup.ts 的 createApp）。
 */
async function bootstrap(): Promise<void> {
  const outPath = process.env['OPENAPI_OUT_PATH'];
  if (outPath) {
    await emitOpenApi(outPath);
    process.exit(0);
  }

  const app = await createApp();
  const port = Number(process.env['PORT'] ?? DEFAULT_PORT);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API 已启动: http://localhost:${port}/api-docs`, 'Bootstrap');
}

void bootstrap();
