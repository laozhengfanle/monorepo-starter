import { newId } from '@starter/server-core';
import type { SeedDb } from './shared.js';

/**
 * 角色（核心主数据）：确保内置 super_admin 角色存在（幂等 upsert）。
 * 演示角色 operator 属演示数据，见 demo.ts。
 */
export async function seedRoles(db: SeedDb): Promise<{ superAdminId: string }> {
  let role = await db.adminRole.findUnique({ where: { code: 'super_admin' } });
  if (!role) {
    role = await db.adminRole.create({
      data: {
        id: newId(),
        name: '超级管理员',
        code: 'super_admin',
        description: '内置超管角色',
      },
    });
    console.log('✅ 已创建内置角色 超级管理员（super_admin）');
  }
  return { superAdminId: role.id };
}
