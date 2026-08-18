import { newId } from '@starter/server-core';
import type { SeedDb } from './shared.js';

/**
 * 系统配置默认值（核心主数据）：后台设置 / 文件存储 / Turnstile。
 * 幂等 upsert：不存在则创建；存在但被软删则复用并清除 deletedAt（key 唯一约束）。
 */
export async function seedConfigs(db: SeedDb): Promise<void> {
  const DEFAULT_CONFIGS = [
    {
      key: 'settings',
      value: {
        name: 'monorepo-starter',
        logo: '',
        footerText: '© zhengbo',
        passwordMinLength: 8,
        loginFailThreshold: 5,
        lockDuration: 30,
        passwordComplexity: 'medium',
        watermarkContent: '{{username}} {{date}}',
        keepAliveMax: 10,
        requestTimeout: 10000,
      },
    },
    {
      key: 'storage.driver',
      // 与页面读取字段一致：local 模式用 localPath（老项目 localDir/localPath 不一致的坑已统一）
      value: { driver: 'local', localPath: './uploads', baseUrl: '/uploads' },
    },
    {
      key: 'turnstile.config',
      // Cloudflare 官方测试密钥（任何 token 都通过验证）；生产替换为真实密钥
      value: {
        enabled: false,
        siteKey: '1x00000000000000000000AA',
        secretKey: '1x0000000000000000000000000000000AA',
      },
    },
  ];

  for (const cfg of DEFAULT_CONFIGS) {
    // 先找未删行；不存在则找已软删行（key 唯一约束，软删后重建需复用并清除 deletedAt）
    const existing =
      (await db.systemConfig.findFirst({
        where: { key: cfg.key, deletedAt: null },
      })) ?? (await db.systemConfig.findFirst({ where: { key: cfg.key } }));
    if (existing) {
      if (existing.deletedAt) {
        await db.systemConfig.update({
          where: { id: existing.id },
          data: { value: cfg.value as never, deletedAt: null },
        });
        console.log(`✅ 已重建软删的系统配置 ${cfg.key}`);
      }
    } else {
      await db.systemConfig.create({
        data: {
          id: newId(),
          key: cfg.key,
          value: cfg.value as never,
          remark: null,
          updatedBy: null,
        },
      });
      console.log(`✅ 已创建系统配置 ${cfg.key}`);
    }
  }
}
