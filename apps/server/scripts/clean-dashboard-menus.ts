/**
 * 一次性脚本：删除 seed 已写入的"仪表盘/欢迎页/分析页"3 条菜单记录
 * 原因：仪表盘改为前端静态路由，seed.ts 已移除仪表盘子树生成。
 * 跑法：pnpm exec tsx scripts/clean-dashboard-menus.ts
 */
import { prisma } from '../src/common/prisma/prisma.js';

async function main() {
    const dirs = await prisma.adminMenu.findMany({
        where: { name: { in: ['仪表盘', '欢迎页', '分析页'] } },
        select: { id: true, name: true, parentId: true },
    });
    console.log('Found dashboard menus:', JSON.stringify(dirs, null, 2));
    const ids = dirs.map((d) => d.id);
    if (ids.length === 0) {
        console.log('Nothing to delete');
        return;
    }
    const del1 = await prisma.adminRoleMenu.deleteMany({ where: { menuId: { in: ids } } });
    console.log('Deleted adminRoleMenu:', del1.count);
    const del2 = await prisma.adminMenu.deleteMany({ where: { id: { in: ids } } });
    console.log('Deleted adminMenu:', del2.count);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
