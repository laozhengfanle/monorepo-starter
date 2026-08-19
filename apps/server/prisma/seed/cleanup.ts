import type { SeedDb } from './shared.js';

/**
 * 清理旧菜单（老结构遗留）：
 * 对齐老项目：管理端无独立"回收站"菜单，
 * 软删除已集成到账户列表（显示已删除），权限点在隐藏的全局权限目录下。
 * 注意：种子只做增量对齐，被移除的菜单不会自动消失，必须在此显式清理，
 * 否则旧行会一直残留在侧栏（回收站曾因此反复出现）。
 */
export async function cleanupLegacyMenus(db: SeedDb): Promise<void> {
  const LEGACY_MENU_CODES = [
    // 独立回收站菜单（已废弃，软删除集成进账户列表）
    'recycle:list',
    // 旧后台设置权限码 config:admin → 已升级为 config:admin:view
    'config:admin',
    // 富文本编辑器是功能不是栏目（曾误挂侧栏，改为无菜单功能页）
    'config:editor:view',
  ];
  const legacyMenus = await db.adminMenu.findMany({
    where: { code: { in: LEGACY_MENU_CODES } },
    select: { id: true, code: true },
  });
  if (legacyMenus.length > 0) {
    const legacyIds = legacyMenus.map((m) => m.id);
    await db.adminAccountMenu.deleteMany({
      where: { menuId: { in: legacyIds } },
    });
    await db.adminRoleMenu.deleteMany({ where: { menuId: { in: legacyIds } } });
    await db.adminMenu.deleteMany({ where: { id: { in: legacyIds } } });
    console.log(
      `🗑️ 已清理旧菜单/权限点 ${legacyMenus.length} 个（${legacyMenus.map((m) => m.code).join(', ')}）`,
    );
  }
}
