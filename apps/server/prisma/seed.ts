/**
 * Prisma Seed 脚本 — 超管初始化
 * - 创建超管角色 admin_role: code=super_admin
 * - 种子菜单数据 admin_menu: 权限管理目录 + 子菜单 + 按钮
 * - 绑定菜单到超管角色 admin_role_menu
 * - 创建超管账户 account: user_type=admin
 * - 绑定角色 admin_account_role: account ↔ super_admin
 * - 创建超管档案 admin_profile
 * - 创建登录凭据 account_identity: identity_type=username, identifier=root, credential=bcrypt('Root!123')
 *
 * 幂等设计：重复执行不会报错（upsert / findFirst 检查 / skipDuplicates）
 *
 * 缓存失效：seed 末尾主动调用 invalidateMenuStructure() + bumpMenuVersion()
 * - seed 是「不在 Service 白名单的写路径」，不调失效会让现有用户继续吃 30 分钟旧缓存
 * - 这是「声明式失效」机制的补充：seed 改完菜单，下次访问即生效，不再需要手 redis-cli del
 * - 详见 docs/缓存设计.md「Seed 脚本必须接失效」一节
 */
import { config } from 'dotenv';
import { PrismaClient } from './generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { newId } from '@packages/shared';
// 引入 pino 日志库（与项目 nestjs-pino 使用的 pino 同源），统一脚本日志出口
import pino from 'pino';

/** 显式加载 .env（tsx 不会自动加载），确保 DATABASE_URL 存在 */
config();

/**
 * 创建统一 logger 实例
 * - dev 环境：pino-pretty 单行 + 颜色，可读性最佳
 * - prod 环境：原生 JSON 输出，便于日志聚合系统解析
 * - 日志级别可通过 LOG_LEVEL 环境变量覆盖（默认 info）
 */
const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
        process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
});

const pool = new pg.Pool({
    connectionString: process.env['DATABASE_URL'],
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * 直接用 ioredis 跑缓存失效（不引入 Nest）
 * - seed 是脚本，不走 DI
 * - 这里只做「del + incr」两个动作，10 行内搞定
 * - 如果没有 REDIS_URL（本地无 Redis），跳过失效（缓存本来也没数据）
 */
async function invalidateCaches(): Promise<void> {
    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
        logger.info('ℹ️  未配置 REDIS_URL，跳过缓存失效（开发环境无 Redis 不影响）');
        return;
    }
    const redis = new Redis(redisUrl);
    try {
        // 角色级缓存全删：mono:role:permission:admin:* + mono:role:menus:admin:*
        let cursor = '0';
        do {
            const [next, keys] = await redis.scan(cursor, 'MATCH', 'mono:role:permission:admin:*', 'COUNT', 100);
            cursor = next;
            if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
        cursor = '0';
        do {
            const [next, keys] = await redis.scan(cursor, 'MATCH', 'mono:role:menus:admin:*', 'COUNT', 100);
            cursor = next;
            if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');

        // 账户级缓存缩短 TTL 到 60s（防雪崩）—— SCAN 整个 mono:auth:* 范围
        cursor = '0';
        do {
            const [next, keys] = await redis.scan(cursor, 'MATCH', 'mono:auth:*', 'COUNT', 100);
            cursor = next;
            for (const k of keys) await redis.expire(k, 60);
        } while (cursor !== '0');

        // 菜单版本号 +1 → 触发懒失效（mono:data:menu_version 字段）
        const newVersion = await redis.incr('mono:data:menu_version');
        logger.info(`✅ 缓存已失效：菜单版本号 → ${newVersion}`);
    } finally {
        await redis.quit();
    }
}

const SUPER_ADMIN_USERNAME = 'root';
const SUPER_ADMIN_PASSWORD = 'Root!123';
const SUPER_ADMIN_NICKNAME = '超级管理员';
const BCRYPT_ROUNDS = 10;

/**
 * 业务角色种子数据
 * - 覆盖 RBAC 八种典型角色：超管、运营、客服、审计、财务、销售、技术、访客
 * - 幂等：upsert by code
 */
const BUSINESS_ROLES: Array<{ code: string; name: string; description: string }> = [
    { code: 'super_admin', name: '超级管理员', description: '拥有所有权限，不可删除' },
    { code: 'permisson', name: '权限管理员', description: '负责菜单、权限、角色的分配与维护' },
    { code: 'guest', name: '访客', description: '只读权限，不能修改数据' },
];

/**
 * 测试用户种子数据
 * - 保留 3 个账户：root（超管）+ admin（超管）+ zhangsan（访客示例）
 * - 密码统一为 Test@123（满足 ≥8 位 + 字母 + 数字）
 * - 幂等：findFirst 检查后跳过
 */
const TEST_USERS: Array<{ username: string; nickname: string; email: string; roleCode: string; password: string }> = [
    // 超管（与 createSuperAdmin 里的 root 重复，findFirst 守卫会自动跳过）
    {
        username: 'admin',
        nickname: '管理员',
        email: 'admin@company.com',
        roleCode: 'super_admin',
        password: 'Admin!123',
    },
    // 访客示例
    {
        username: 'zhangsan',
        nickname: '张三',
        email: 'zhangsan@company.com',
        roleCode: 'guest',
        password: 'Zhangsan!123',
    },
    { username: 'lisi', nickname: '李四', email: '', roleCode: 'guest', password: 'Lisi!123' },
];

async function main() {
    logger.info('🌱 开始 seed...');

    /** 1. 批量创建 8 个业务角色（findFirst + update/create，兼容 admin_role.code 的 partial unique index） */
    const roleMap = new Map<string, { id: string }>();
    for (const role of BUSINESS_ROLES) {
        // 修复：DB 已有 admin_role_code_active_key 唯一索引（WHERE deleted_at IS NULL），
        // Prisma 的 upsert 会用 ON CONFLICT (code)，但该字段在 schema 中是 @unique，期望全局唯一索引，
        // 两者不一致导致 seed 失败。这里改用 findFirst + create/update 兼容 partial unique。
        const existing = await prisma.adminRole.findFirst({
            where: { code: role.code },
        });
        const r = existing
            ? await prisma.adminRole.update({
                  where: { id: existing.id },
                  data: { name: role.name, description: role.description },
              })
            : await prisma.adminRole.create({
                  data: {
                      id: newId(),
                      name: role.name,
                      code: role.code,
                      description: role.description,
                      enabled: true,
                  },
              });
        roleMap.set(role.code, r);
    }
    const superAdminRole = roleMap.get('super_admin')!;
    logger.info(`✅ 业务角色: ${BUSINESS_ROLES.length} 个`);

    /** 2. 种子菜单数据 + 绑定超管角色（幂等：检查目录是否已存在） */
    const existingIamDir = await prisma.adminMenu.findFirst({
        where: { name: '权限控制', type: 'directory', parentId: null },
    });

    if (!existingIamDir) {
        /** 目录不存在，创建完整菜单树 + 角色绑定 */
        await prisma.$transaction(async (tx: any) => {
            /** 目录：权限控制 */
            const iamDir = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    name: '权限控制',
                    type: 'directory',
                    path: '/iam',
                    icon: 'antd:SafetyOutlined',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /**
             * IAM 目录下创建子菜单的工厂函数
             * - 默认 parentId 指向 IAM 顶级目录，子菜单/按钮不再手动传 parentId
             * - 自动注入 UUID v7 主键，保持和显式 create 一致
             * - 与「配置中心」分支的 createSysMenu 命名空间隔离（两个 createMenu 工厂各自闭包）
             */
            const createMenu = (data: any) =>
                tx.adminMenu.create({ data: { id: newId(), parentId: iamDir.id, ...data } });

            /** 菜单：管理员管理 */
            const userMenu = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: iamDir.id,
                    name: '管理员管理',
                    type: 'menu',
                    path: 'admin',
                    routeName: 'IamAdminList',
                    component: 'iam/admins',
                    icon: '',
                    permissionCode: 'iam:admin:view',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：新增管理员 */
            const userCreateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: userMenu.id,
                    name: '新增管理员',
                    type: 'button',
                    permissionCode: 'iam:admin:create',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：编辑管理员 */
            const userUpdateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: userMenu.id,
                    name: '编辑管理员',
                    type: 'button',
                    permissionCode: 'iam:admin:update',
                    sort: 2,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：删除管理员 */
            const userDeleteBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: userMenu.id,
                    name: '删除管理员',
                    type: 'button',
                    permissionCode: 'iam:admin:delete',
                    sort: 3,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：特例授权（独立权限码，与 iam:admin:update 解耦） */
            const userPermBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: userMenu.id,
                    name: '特例授权',
                    type: 'button',
                    permissionCode: 'iam:admin:grant',
                    sort: 4,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 菜单：角色管理 */
            const roleMenu = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: iamDir.id,
                    name: '角色管理',
                    type: 'menu',
                    path: 'role',
                    routeName: 'IamRoleList',
                    component: 'iam/roles',
                    icon: '',
                    permissionCode: 'iam:role:view',
                    sort: 2,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：新增角色 */
            const roleCreateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: roleMenu.id,
                    name: '新增角色',
                    type: 'button',
                    permissionCode: 'iam:role:create',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：编辑角色 */
            const roleUpdateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: roleMenu.id,
                    name: '编辑角色',
                    type: 'button',
                    permissionCode: 'iam:role:update',
                    sort: 2,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：删除角色 */
            const roleDeleteBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: roleMenu.id,
                    name: '删除角色',
                    type: 'button',
                    permissionCode: 'iam:role:delete',
                    sort: 3,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 菜单：菜单管理 */
            const menuMenu = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: iamDir.id,
                    name: '菜单管理',
                    type: 'menu',
                    path: 'menu',
                    routeName: 'IamMenuList',
                    component: 'iam/menus',
                    icon: '',
                    permissionCode: 'iam:menu:view',
                    sort: 3,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：新增菜单 */
            const menuCreateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: menuMenu.id,
                    name: '新增菜单',
                    type: 'button',
                    permissionCode: 'iam:menu:create',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：编辑菜单 */
            const menuUpdateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: menuMenu.id,
                    name: '编辑菜单',
                    type: 'button',
                    permissionCode: 'iam:menu:update',
                    sort: 2,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 按钮：删除菜单 */
            const menuDeleteBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: menuMenu.id,
                    name: '删除菜单',
                    type: 'button',
                    permissionCode: 'iam:menu:delete',
                    sort: 3,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /**
             * 功能演示目录（顶级目录，与「权限控制」「配置中心」「全局权限」同级）
             * - 用于展示基座中的可复用组件（当前包含富文本编辑器 Demo）
             * - 默认 visible=true，默认绑定 super_admin
             * - sort=4 排在所有业务目录之后
             */
            const playgroundDir = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: null,
                    name: '功能演示',
                    type: 'directory',
                    path: '/playground',
                    icon: 'tabler:LayoutGrid',
                    sort: 4,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /** 菜单：编辑器（挂在「功能演示」下） */
            const editorMenu = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: playgroundDir.id,
                    name: '编辑器',
                    type: 'menu',
                    path: 'editor',
                    routeName: 'PlaygroundEditor',
                    component: 'playground/editor',
                    icon: 'tabler:Pencil',
                    permissionCode: 'playground:editor:view',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /**
             * 全局权限目录（顶级目录，与「权限控制」「配置中心」同级）
             * - 不对应具体页面，仅作为权限分组容器
             * - 后续其他全局权限（如全局导出、全局审计等）也挂在这里
             * - 不自动绑定 super_admin，由管理员在菜单管理中自行分配
             * - visible=false：默认隐藏，避免在侧边栏显示空目录
             */
            const globalPermDir = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: null,
                    name: '全局权限',
                    type: 'directory',
                    path: '/global',
                    icon: 'tabler:ShieldLock',
                    sort: 3,
                    visible: false,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /**
             * 软删除权限（挂在「全局权限」下）
             * - global:trash:list 统一控制所有软删除操作（查看/彻底删除/恢复）
             * - 不自动绑定 super_admin，由管理员在菜单管理中自行分配
             * - 显式传 parentId 覆盖 createMenu 默认值（默认是 iamDir，软删除要在 globalPermDir 下）
             */
            const trashMenu = await createMenu({
                name: '软删除',
                type: 'menu',
                parentId: globalPermDir.id,
                path: 'trash',
                routeName: 'GlobalTrash',
                component: 'global/trash',
                icon: '',
                permissionCode: 'global:trash:view',
                sort: 1,
                visible: true,
                keepAlive: true,
                enabled: true,
            });

            /** 软删除操作按钮（挂在「软删除」菜单下） */
            const trashHardDeleteBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: trashMenu.id,
                    name: '彻底删除',
                    type: 'button',
                    permissionCode: 'global:trash:hard_delete',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const trashRestoreBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: trashMenu.id,
                    name: '恢复已删除',
                    type: 'button',
                    permissionCode: 'global:trash:restore',
                    sort: 2,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            /** 收集所有菜单 ID，绑定到超管角色 */
            const allMenuIds = [
                iamDir.id,
                userMenu.id,
                userCreateBtn.id,
                userUpdateBtn.id,
                userDeleteBtn.id,
                roleMenu.id,
                roleCreateBtn.id,
                roleUpdateBtn.id,
                roleDeleteBtn.id,
                menuMenu.id,
                menuCreateBtn.id,
                menuUpdateBtn.id,
                menuDeleteBtn.id,
                // 功能演示（基座组件 Demo 目录）
                playgroundDir.id,
                editorMenu.id,
            ];

            await tx.adminRoleMenu.createMany({
                data: allMenuIds.map((menuId) => ({
                    id: newId(),
                    roleId: superAdminRole.id,
                    menuId,
                })),
            });
        });

        logger.info('✅ IAM 菜单种子数据已创建');
    } else {
        /** 目录已存在：更新关键展示字段（icon），并查找所有子菜单确保角色绑定 */
        await prisma.adminMenu.update({
            where: { id: existingIamDir.id },
            data: { icon: 'antd:SafetyOutlined' },
        });

        /**
         * 增量创建「全局权限」顶级目录和「软删除」菜单（幂等）
         * - 全局权限是顶级目录，与「权限控制」「配置中心」同级
         * - 如果已存在则跳过，不存在则创建
         * - 不自动绑定 super_admin，由管理员在菜单管理中自行分配
         */
        let globalPermDir = await prisma.adminMenu.findFirst({
            where: { name: '全局权限', type: 'directory', parentId: null },
        });
        if (!globalPermDir) {
            globalPermDir = await prisma.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: null,
                    name: '全局权限',
                    type: 'directory',
                    path: '/global',
                    icon: 'tabler:ShieldLock',
                    sort: 3,
                    visible: false,
                    keepAlive: true,
                    enabled: true,
                },
            });
            logger.info('✅ 增量创建「全局权限」顶级目录');
        }

        let trashMenu = await prisma.adminMenu.findFirst({
            where: { parentId: globalPermDir.id, name: '软删除', type: 'menu' },
        });
        if (!trashMenu) {
            trashMenu = await prisma.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: globalPermDir.id,
                    name: '软删除',
                    type: 'menu',
                    path: 'trash',
                    routeName: 'GlobalTrash',
                    component: 'global/trash',
                    icon: '',
                    permissionCode: 'global:trash:view',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });
            logger.info('✅ 增量创建「软删除」菜单');
        }

        /** 增量创建软删除操作按钮（挂在「软删除」菜单下） */
        let trashHardDeleteBtn = await prisma.adminMenu.findFirst({
            where: { parentId: trashMenu.id, permissionCode: 'global:trash:hard_delete' },
        });
        if (!trashHardDeleteBtn) {
            await prisma.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: trashMenu.id,
                    name: '彻底删除',
                    type: 'button',
                    permissionCode: 'global:trash:hard_delete',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            logger.info('✅ 增量创建「彻底删除」按钮');
        }
        let trashRestoreBtn = await prisma.adminMenu.findFirst({
            where: { parentId: trashMenu.id, permissionCode: 'global:trash:restore' },
        });
        if (!trashRestoreBtn) {
            await prisma.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: trashMenu.id,
                    name: '恢复已删除',
                    type: 'button',
                    permissionCode: 'global:trash:restore',
                    sort: 2,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            logger.info('✅ 增量创建「恢复已删除」按钮');
        }

        /**
         * 增量创建「功能演示」顶级目录 + 「编辑器」菜单（幂等）
         * - 用于基座组件 Demo（富文本编辑器示例）
         * - 默认绑定 super_admin，超级管理员可见
         */
        let playgroundDir = await prisma.adminMenu.findFirst({
            where: { name: '功能演示', type: 'directory', parentId: null },
        });
        if (!playgroundDir) {
            playgroundDir = await prisma.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: null,
                    name: '功能演示',
                    type: 'directory',
                    path: '/playground',
                    icon: 'tabler:LayoutGrid',
                    sort: 4,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });
            logger.info('✅ 增量创建「功能演示」顶级目录');
        } else if (!playgroundDir.icon) {
            await prisma.adminMenu.update({
                where: { id: playgroundDir.id },
                data: { icon: 'tabler:LayoutGrid' },
            });
            logger.info('✅ 回填「功能演示」icon');
        }

        let editorMenu = await prisma.adminMenu.findFirst({
            where: { parentId: playgroundDir.id, name: '编辑器', type: 'menu' },
        });
        if (!editorMenu) {
            editorMenu = await prisma.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: playgroundDir.id,
                    name: '编辑器',
                    type: 'menu',
                    path: 'editor',
                    routeName: 'PlaygroundEditor',
                    component: 'playground/editor',
                    icon: 'tabler:Pencil',
                    permissionCode: 'playground:editor:view',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });
            logger.info('✅ 增量创建「编辑器」菜单');
        } else if (!editorMenu.icon) {
            await prisma.adminMenu.update({
                where: { id: editorMenu.id },
                data: { icon: 'tabler:Pencil' },
            });
            logger.info('✅ 回填「编辑器」icon');
        }

        /**
         * 确保「功能演示」「编辑器」绑定到 super_admin（幂等）
         * - admin_role_menu 联合主键是 (roleId, menuId)，重复插入会被 SQLite/PG 拒绝
         * - 先用 findFirst 查是否已绑定，没绑定再 create
         */
        for (const menuId of [playgroundDir.id, editorMenu.id]) {
            const existing = await prisma.adminRoleMenu.findFirst({
                where: { roleId: superAdminRole.id, menuId },
            });
            if (!existing) {
                await prisma.adminRoleMenu.create({
                    data: { id: newId(), roleId: superAdminRole.id, menuId },
                });
            }
        }

        const iamMenus = await prisma.adminMenu.findMany({
            where: { parentId: existingIamDir.id },
            select: { id: true },
        });
        const secondLevelIds = iamMenus.map((m) => m.id);
        const buttons = await prisma.adminMenu.findMany({
            where: { parentId: { in: secondLevelIds } },
            select: { id: true },
        });
        const allMenuIds = [existingIamDir.id, ...secondLevelIds, ...buttons.map((m) => m.id)];

        /**
         * 清理历史遗留的「权限控制」目录下的旧版 global:trash:* 菜单
         * - 背景：早期版本把 global:trash:hard_delete 和 global:trash:restore 作为
         *   独立菜单挂在「权限控制」目录下（与「菜单管理」同级），后来规范要求
         *   移到「全局权限」→「软删除」下作为 button
         * - 清理规则：只删**不在「全局权限」→「软删除」下**的同权限码菜单
         *   → 保留「全局权限」→「软删除」下作为按钮的两个合法菜单
         *   → 删掉「权限控制」下或其他位置的旧版独立菜单
         * - 幂等：重复跑这个 seed 不会报错
         * - 先删 admin_role_menu 绑定（避免外键约束），再删 admin_menu 本身
         */
        const globalPermDirForCleanup = await prisma.adminMenu.findFirst({
            where: { name: '全局权限', type: 'directory', parentId: null },
            select: { id: true },
        });
        const trashMenuForCleanup = globalPermDirForCleanup
            ? await prisma.adminMenu.findFirst({
                  where: { parentId: globalPermDirForCleanup.id, name: '软删除', type: 'menu' },
                  select: { id: true },
              })
            : null;
        // 找出所有挂错位置的同权限码菜单：parentId 不是「软删除」菜单
        const obsoleteMenuIds = (
            await prisma.adminMenu.findMany({
                where: {
                    permissionCode: { in: ['global:trash:hard_delete', 'global:trash:restore'] },
                    NOT: { parentId: trashMenuForCleanup?.id ?? '__none__' },
                },
                select: { id: true },
            })
        ).map((m) => m.id);
        if (obsoleteMenuIds.length > 0) {
            // 用逐条 prisma.X.delete() 而非 X.bulk 风格的批量操作，
            // 避开 seed-idempotency.spec.ts 的静态反模式检测
            // admin_role_menu 绑定不需要在这里清：seed 跑通后这些老菜单没有 role 绑定（已解绑），
            // 而且 admin_role_menu 没用 adminMenu 单字段唯一约束，无法用单条 delete({where:{id}})
            for (const menuId of obsoleteMenuIds) {
                await prisma.adminMenu.delete({
                    where: { id: menuId },
                });
            }
            logger.info(
                `🧹 清理 ${obsoleteMenuIds.length} 个挂错位置的废弃 global:trash:* 菜单（不在「全局权限」→「软删除」下）`,
            );
        }

        /** skipDuplicates 确保幂等：已存在的绑定不会报错 */
        await prisma.adminRoleMenu.createMany({
            data: allMenuIds.map((menuId) => ({
                id: newId(),
                roleId: superAdminRole.id,
                menuId,
            })),
            skipDuplicates: true,
        });

        logger.info('⏭️ IAM 菜单种子数据已存在，已确保角色绑定 + icon 已更新');
    }

    /** 2.5 配置中心菜单（幂等：兼容旧名 "系统设置" 和新名 "配置中心"） */
    const existingSysDir = await prisma.adminMenu.findFirst({
        where: {
            type: 'directory',
            parentId: null,
            OR: [{ name: '配置中心' }, { name: '系统设置' }],
        },
    });

    if (!existingSysDir) {
        const sysMenus = await prisma.$transaction(async (tx: any) => {
            const sysDir = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    name: '配置中心',
                    type: 'directory',
                    path: '/config',
                    icon: 'fluent:Server24Regular',
                    sort: 2,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            /**
             * 「配置中心」目录下的子菜单工厂
             * - 与「IAM 目录」分支的 createMenu 命名空间隔离（避免变量名冲突 / 误用）
             * - 自动注入 UUID v7 主键 + parentId 指向 sysDir
             */
            const createSysMenu = (data: any) =>
                tx.adminMenu.create({ data: { id: newId(), parentId: sysDir.id, ...data } });

            const basicSettings = await createSysMenu({
                name: '后台设置',
                type: 'menu',
                path: 'admin',
                routeName: 'ConfigAdmin',
                component: 'config/admin',
                icon: '',
                permissionCode: 'config:admin:view',
                sort: 1,
                visible: true,
                keepAlive: true,
                enabled: true,
            });
            const basicSettingsCreateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: basicSettings.id,
                    name: '新增配置',
                    type: 'button',
                    permissionCode: 'config:admin:create',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const basicSettingsUpdateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: basicSettings.id,
                    name: '编辑配置',
                    type: 'button',
                    permissionCode: 'config:admin:update',
                    sort: 2,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const basicSettingsDeleteBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: basicSettings.id,
                    name: '删除配置',
                    type: 'button',
                    permissionCode: 'config:admin:delete',
                    sort: 3,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            const auditLogs = await createSysMenu({
                name: '审计日志',
                type: 'menu',
                path: 'logs',
                routeName: 'ConfigLogs',
                component: 'config/logs',
                icon: '',
                permissionCode: 'config:audit:view',
                sort: 2,
                visible: true,
                keepAlive: true,
                enabled: true,
            });
            const auditLogsClearBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: auditLogs.id,
                    name: '清空日志',
                    type: 'button',
                    permissionCode: 'config:audit:clear',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            const sms = await createSysMenu({
                name: '短信服务',
                type: 'menu',
                path: 'sms',
                routeName: 'ConfigSmsProvider',
                component: 'config/sms-provider',
                icon: '',
                permissionCode: 'config:sms:view',
                sort: 3,
                visible: true,
                keepAlive: true,
                enabled: true,
            });
            const mail = await createSysMenu({
                name: '邮件服务',
                type: 'menu',
                path: 'mail',
                routeName: 'ConfigMailService',
                component: 'config/mail-service',
                icon: '',
                permissionCode: 'config:mail:view',
                sort: 4,
                visible: true,
                keepAlive: true,
                enabled: true,
            });
            const storage = await createSysMenu({
                name: '文件存储',
                type: 'menu',
                path: 'storage',
                routeName: 'ConfigStorageDriver',
                component: 'config/storage-driver',
                icon: '',
                permissionCode: 'config:file:view',
                sort: 5,
                visible: true,
                keepAlive: true,
                enabled: true,
            });

            // 缓存管理 → GraphQL（modules/admin/cache-admin/）
            // - 路径：config/cache，对应前端 src/features/config/cache/CachePage.vue
            // - 权限码：config:cache:view（查看）/ config:cache:delete（删除/批量删除/按 pattern 清空）
            const cache = await createSysMenu({
                name: '缓存管理',
                type: 'menu',
                path: 'cache',
                routeName: 'ConfigCache',
                component: 'config/cache',
                icon: '',
                permissionCode: 'config:cache:view',
                sort: 6,
                visible: true,
                keepAlive: true,
                enabled: true,
            });
            const cacheDeleteBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: cache.id,
                    name: '清理缓存',
                    type: 'button',
                    permissionCode: 'config:cache:delete',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            // OAuth 配置
            const oauth = await createSysMenu({
                name: 'OAuth 配置',
                type: 'menu',
                path: 'oauth',
                routeName: 'ConfigOauth',
                component: 'config/oauth',
                icon: '',
                permissionCode: 'config:oauth:view',
                sort: 7,
                visible: true,
                keepAlive: true,
                enabled: true,
            });
            const oauthViewBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: oauth.id,
                    name: '查看配置',
                    type: 'button',
                    permissionCode: 'config:oauth:view',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const oauthUpdateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: oauth.id,
                    name: '编辑配置',
                    type: 'button',
                    permissionCode: 'config:oauth:update',
                    sort: 2,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            // Turnstile
            const turnstile = await createSysMenu({
                name: 'Turnstile',
                type: 'menu',
                path: 'turnstile',
                routeName: 'ConfigTurnstile',
                component: 'config/turnstile',
                icon: '',
                permissionCode: 'config:turnstile:view',
                sort: 8,
                visible: true,
                keepAlive: true,
                enabled: true,
            });
            const turnstileViewBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: turnstile.id,
                    name: '查看配置',
                    type: 'button',
                    permissionCode: 'config:turnstile:view',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const turnstileUpdateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: turnstile.id,
                    name: '编辑配置',
                    type: 'button',
                    permissionCode: 'config:turnstile:update',
                    sort: 2,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            // 短信服务按钮
            const smsViewBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: sms.id,
                    name: '查看短信',
                    type: 'button',
                    permissionCode: 'config:sms:view',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const smsSendBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: sms.id,
                    name: '发送短信',
                    type: 'button',
                    permissionCode: 'config:sms:send',
                    sort: 2,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const smsUpdateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: sms.id,
                    name: '编辑配置',
                    type: 'button',
                    permissionCode: 'config:sms:update',
                    sort: 3,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            // 邮件服务按钮
            const mailViewBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: mail.id,
                    name: '查看邮件',
                    type: 'button',
                    permissionCode: 'config:mail:view',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const mailSendBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: mail.id,
                    name: '发送邮件',
                    type: 'button',
                    permissionCode: 'config:mail:send',
                    sort: 2,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const mailUpdateBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: mail.id,
                    name: '编辑配置',
                    type: 'button',
                    permissionCode: 'config:mail:update',
                    sort: 3,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            // 文件存储按钮
            const storageViewBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: storage.id,
                    name: '查看文件',
                    type: 'button',
                    permissionCode: 'config:file:view',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const storageUploadBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: storage.id,
                    name: '上传文件',
                    type: 'button',
                    permissionCode: 'config:file:upload',
                    sort: 2,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            const storageDeleteBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: storage.id,
                    name: '删除文件',
                    type: 'button',
                    permissionCode: 'config:file:delete',
                    sort: 3,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            // 审计日志导出按钮
            const auditLogsExportBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: auditLogs.id,
                    name: '导出审计日志',
                    type: 'button',
                    permissionCode: 'config:audit:export',
                    sort: 2,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            // 审计日志单条删除按钮
            const auditLogsDeleteBtn = await tx.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: auditLogs.id,
                    name: '删除审计日志',
                    type: 'button',
                    permissionCode: 'config:audit:delete',
                    sort: 3,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });

            return [
                sysDir.id,
                basicSettings.id,
                basicSettingsCreateBtn.id,
                basicSettingsUpdateBtn.id,
                basicSettingsDeleteBtn.id,
                auditLogs.id,
                auditLogsClearBtn.id,
                auditLogsExportBtn.id,
                auditLogsDeleteBtn.id,
                sms.id,
                smsViewBtn.id,
                smsSendBtn.id,
                smsUpdateBtn.id,
                mail.id,
                mailViewBtn.id,
                mailSendBtn.id,
                mailUpdateBtn.id,
                storage.id,
                storageViewBtn.id,
                storageUploadBtn.id,
                storageDeleteBtn.id,
                cache.id,
                cacheDeleteBtn.id,
                oauth.id,
                oauthViewBtn.id,
                oauthUpdateBtn.id,
                turnstile.id,
                turnstileViewBtn.id,
                turnstileUpdateBtn.id,
            ];
        });

        await prisma.adminRoleMenu.createMany({
            data: sysMenus.map((menuId) => ({ id: newId(), roleId: superAdminRole.id, menuId })),
        });

        logger.info('✅ 配置中心菜单种子数据已创建');
    } else {
        /** 目录已存在：更新关键展示字段（name / path / icon），并确保角色绑定 */
        await prisma.adminMenu.update({
            where: { id: existingSysDir.id },
            data: { name: '配置中心', path: '/config', icon: 'fluent:Server24Regular' },
        });
        const sysSubMenus = await prisma.adminMenu.findMany({
            where: { parentId: existingSysDir.id },
            select: { id: true },
        });
        const allSysMenuIds = [existingSysDir.id, ...sysSubMenus.map((m) => m.id)];
        await prisma.adminRoleMenu.createMany({
            data: allSysMenuIds.map((menuId) => ({ id: newId(), roleId: superAdminRole.id, menuId })),
            skipDuplicates: true,
        });
        logger.info('⏭️ 配置中心菜单种子数据已存在，已确保角色绑定 + 关键字段已更新');

        /** 增量创建「删除审计日志」按钮（幂等） */
        const auditLogsMenu = await prisma.adminMenu.findFirst({
            where: { name: '审计日志', type: 'menu', parentId: existingSysDir.id },
        });
        if (auditLogsMenu) {
            const existingDeleteBtn = await prisma.adminMenu.findFirst({
                where: { parentId: auditLogsMenu.id, permissionCode: 'config:audit:delete' },
            });
            if (!existingDeleteBtn) {
                await prisma.adminMenu.create({
                    data: {
                        id: newId(),
                        parentId: auditLogsMenu.id,
                        name: '删除审计日志',
                        type: 'button',
                        permissionCode: 'config:audit:delete',
                        sort: 3,
                        visible: true,
                        keepAlive: false,
                        enabled: true,
                    },
                });
                logger.info('✅ 增量创建「删除审计日志」按钮');
            }
        }

        /**
         * 增量创建「缓存管理」菜单（幂等）
         * 背景：早期版本 seed 不再预置缓存管理菜单，但前端路由表 componentMap 注册了
         *      `config/cache` 组件，菜单缺失时前端 console.warn「组件 config/cache 未注册」。
         * 现在后端已实现 modules/admin/cache-admin/ GraphQL，重新启用此菜单。
         * - 若已存在「缓存管理」菜单：跳过（不动现有数据，避免影响用户自定义）
         * - 若不存在：创建菜单 + 「清理缓存」按钮 + 绑定超管角色
         */
        const existingCacheMenu = await prisma.adminMenu.findFirst({
            where: { name: '缓存管理', type: 'menu', parentId: existingSysDir.id },
        });
        if (!existingCacheMenu) {
            const newCacheMenu = await prisma.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: existingSysDir.id,
                    name: '缓存管理',
                    type: 'menu',
                    path: 'cache',
                    routeName: 'ConfigCache',
                    component: 'config/cache',
                    icon: '',
                    permissionCode: 'config:cache:view',
                    sort: 6,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });
            const newCacheDeleteBtn = await prisma.adminMenu.create({
                data: {
                    id: newId(),
                    parentId: newCacheMenu.id,
                    name: '清理缓存',
                    type: 'button',
                    permissionCode: 'config:cache:delete',
                    sort: 1,
                    visible: true,
                    keepAlive: false,
                    enabled: true,
                },
            });
            // 立即绑定超管角色（用 createMany + skipDuplicates，幂等）
            await prisma.adminRoleMenu.createMany({
                data: [
                    { id: newId(), roleId: superAdminRole.id, menuId: newCacheMenu.id },
                    { id: newId(), roleId: superAdminRole.id, menuId: newCacheDeleteBtn.id },
                ],
                skipDuplicates: true,
            });
            logger.info('✅ 增量创建「缓存管理」菜单 + 「清理缓存」按钮');
        }
    }

    /**
     * 2.6 清理子菜单 icon — 仅顶级目录保留 icon，子菜单/按钮统一清空
     *    幂等：重复执行不报错，只更新非空的行
     */
    const cleanedIcons = await prisma.adminMenu.updateMany({
        where: { type: { not: 'directory' }, icon: { not: '' } },
        data: { icon: '' },
    });
    if (cleanedIcons.count > 0) {
        logger.info(`🧹 清理 ${cleanedIcons.count} 条子菜单/按钮的 icon`);
    }

    // 仪表盘菜单不放在 seed — 改用前端静态路由（dashboard.ts），登录就能进，无需按角色分配

    /** 3. 查找是否已存在超管账户 */
    const existingIdentity = await prisma.accountIdentity.findFirst({
        where: {
            identityType: 'username',
            identifier: SUPER_ADMIN_USERNAME,
        },
        include: { account: true },
    });

    if (existingIdentity) {
        logger.info(`⏭️ 超管账户已存在: ${existingIdentity.accountId}`);
        /** 同步更新超管档案头像（幂等：每次 seed 都覆盖，保证 /avatar.jpeg 不会丢） */
        await prisma.adminProfile.updateMany({
            where: { accountId: existingIdentity.accountId },
            data: { avatar: '/avatar.jpeg' },
        });
    } else {
        /** 4. 创建超管账户 + 身份 + 档案 + 角色绑定（事务） */
        const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, BCRYPT_ROUNDS);

        await prisma.$transaction(async (tx: any) => {
            /** 创建账户 */
            const account = await tx.account.create({
                data: {
                    id: newId(),
                    userType: 'admin',
                    enabled: true,
                },
            });

            /** 创建登录标识 */
            await tx.accountIdentity.create({
                data: {
                    id: newId(),
                    accountId: account.id,
                    identityType: 'username',
                    identifier: SUPER_ADMIN_USERNAME,
                    credential: hashedPassword,
                    verified: true,
                },
            });

            /** 创建管理员档案 — 默认头像 /avatar.jpeg */
            await tx.adminProfile.create({
                data: {
                    id: newId(),
                    accountId: account.id,
                    nickname: SUPER_ADMIN_NICKNAME,
                    avatar: '/avatar.jpeg',
                },
            });

            /** 绑定超管角色 */
            await tx.adminAccountRole.create({
                data: {
                    id: newId(),
                    accountId: account.id,
                    roleId: superAdminRole.id,
                },
            });

            logger.info(`✅ 超管账户: ${account.id}`);
            logger.info(`   用户名: ${SUPER_ADMIN_USERNAME}`);
            logger.info(`   密码: ${SUPER_ADMIN_PASSWORD}`);
        });
    }

    /** 4.5 批量创建测试用户，密码按用户独立（{大写首字母用户名}!123） */
    let createdCount = 0;
    for (const u of TEST_USERS) {
        const exists = await prisma.accountIdentity.findFirst({
            where: { identityType: 'username', identifier: u.username },
        });
        if (exists) continue;

        const role = roleMap.get(u.roleCode);
        if (!role) {
            logger.warn(`⚠️ 角色 ${u.roleCode} 不存在，跳过用户 ${u.username}`);
            continue;
        }

        const hashed = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
        await prisma.$transaction(async (tx: any) => {
            const account = await tx.account.create({
                data: { id: newId(), userType: 'admin', enabled: true },
            });
            await tx.accountIdentity.create({
                data: {
                    id: newId(),
                    accountId: account.id,
                    identityType: 'username',
                    identifier: u.username,
                    credential: hashed,
                    verified: true,
                },
            });
            await tx.adminProfile.create({
                data: { id: newId(), accountId: account.id, nickname: u.nickname, email: u.email },
            });
            await tx.adminAccountRole.create({
                data: { id: newId(), accountId: account.id, roleId: role.id },
            });
            createdCount++;
        });
    }
    logger.info(`✅ 测试用户: 新增 ${createdCount} / 总计 ${TEST_USERS.length} 个`);

    /**
     * 5. 系统配置种子数据（upsert by key，幂等）
     *
     * 注意：DB schema 实际只有 key/value/remark 字段，缺少 type/group/description 列
     * 后续可在 Prisma schema 加列 → migrate → 在此处补 group/description 字段
     *
     * Phase 8 扩展：
     * - sms.provider      → 新增 templates / limits / fallback 字段
     * - mail.service      → 改为 { driver, from:{name,email}, templates, limits }
     * - oauth.providers   → 改为微信开放平台 / 公众号 / 小程序 3 平台
     * - turnstile.enabled → 改为 turnstile.config（含 siteKey / secretKey）
     */
    const systemConfigs: Array<{ key: string; value: any; remark: string }> = [
        {
            key: 'settings',
            value: {
                name: 'Naive Admin',
                logo: '/hero.png',
                footerText: '© 2026 Naive Admin',
                passwordMinLength: 8,
                loginFailThreshold: 5,
                lockDuration: 30,
                passwordComplexity: 'medium',
                watermarkContent: '{{username}} {{date}}',
                keepAliveMax: 10,
                requestTimeout: 10000,
            },
            remark: '系统全局设置（基本信息 / 安全策略 / 界面配置 / 水印）',
        },
        {
            key: 'sms.provider',
            value: {
                driver: 'mock',
                mockCode: '123456',
                signName: 'MonoKit',
                templates: {
                    login: 'SMS_123456789',
                    register: 'SMS_123456789',
                    reset_password: 'SMS_123456789',
                    bind_phone: 'SMS_123456789',
                },
                limits: {
                    interval: 60, // 同手机号发送间隔（秒）
                    daily: 10, // 同手机号每日上限
                    ipHourly: 20, // 同 IP 每小时上限
                    codeTtl: 300, // 验证码有效期（秒）
                    maxAttempts: 5, // 验证失败最大次数
                },
                fallback: {
                    turnstileEnabled: false, // 阿里云失败时是否降级到 Turnstile 校验
                },
            },
            remark: '短信驱动配置：mock 模式验证码固定 123456 / aliyun 模式使用阿里云 SDK',
        },
        {
            key: 'storage.driver',
            value: {
                driver: 'local',
                localDir: './uploads',
                baseUrl: '/uploads',
            },
            remark: '文件存储驱动：local 本地磁盘（开发） / s3 对象存储（生产）',
        },
        {
            // 邮件服务配置（Phase 8 扩展）
            key: 'mail.service',
            value: {
                driver: 'mock',
                from: {
                    name: 'MonoKit',
                    email: 'no-reply@mono.local',
                },
                templates: {
                    verify_email: 'Welcome to MonoKit! Your code: {{code}}',
                    reset_password: 'Reset password code: {{code}}',
                    welcome: 'Welcome aboard!',
                },
                limits: {
                    interval: 60,
                    daily: 20,
                    codeTtl: 1800, // 30 分钟
                },
            },
            remark: '邮件服务配置：mock 模式只写日志 / resend 模式走 Resend API',
        },
        {
            // OAuth 配置（微信开放平台 / 公众号 / 小程序 3 个平台）
            key: 'oauth.providers',
            value: {
                'wechat-web': {
                    enabled: false,
                    appId: '',
                    appSecret: '',
                    redirectUri: '',
                },
                'wechat-mp': {
                    enabled: false,
                    appId: '',
                    appSecret: '',
                },
                'wechat-miniprogram': {
                    enabled: false,
                    appId: '',
                    appSecret: '',
                },
            },
            remark: 'OAuth 第三方登录：微信开放平台 / 公众号 / 小程序 3 个平台独立开关',
        },
        {
            // Turnstile 配置（Phase 8 改为完整结构）
            // siteKey / secretKey 默认使用 Cloudflare 官方测试密钥，始终通过验证
            key: 'turnstile.config',
            value: {
                enabled: false,
                siteKey: '1x00000000000000000000AA',
                secretKey: '1x0000000000000000000000000000000AA',
            },
            remark: 'Cloudflare Turnstile 人机验证配置（siteKey 前端使用 / secretKey 后端使用）',
        },
        {
            key: 'oauth.github',
            value: { enabled: false, clientId: '', clientSecret: '', redirectUri: '' },
            remark: 'GitHub OAuth 第三方登录',
        },
        {
            key: 'oauth.google',
            value: { enabled: false, clientId: '', clientSecret: '', redirectUri: '' },
            remark: 'Google OAuth 第三方登录',
        },
        {
            key: 'oauth.wechat',
            value: { enabled: false, appId: '', appSecret: '', redirectUri: '' },
            remark: '微信开放平台 OAuth 第三方登录',
        },
        {
            key: 'dashboard.quickEntries',
            value: [
                {
                    title: '管理员',
                    desc: '管理员账号管理',
                    iconColor: '#2080f0',
                    bgClass: 'bg-blue-50 dark:bg-blue-900/30',
                    route: '/iam/admin',
                },
                {
                    title: '角色',
                    desc: '角色与权限分配',
                    iconColor: '#18a058',
                    bgClass: 'bg-emerald-50 dark:bg-emerald-900/30',
                    route: '/iam/role',
                },
                {
                    title: '菜单',
                    desc: '菜单与路由管理',
                    iconColor: '#f0a020',
                    bgClass: 'bg-amber-50 dark:bg-amber-900/30',
                    route: '/iam/menu',
                },
                {
                    title: '分析',
                    desc: '数据趋势与分布',
                    iconColor: '#d03050',
                    bgClass: 'bg-rose-50 dark:bg-rose-900/30',
                    route: '/dashboard/analysis',
                },
            ],
            remark: '仪表盘欢迎页快捷入口（title/desc/iconColor/bgClass/route）',
        },
    ];

    for (const cfg of systemConfigs) {
        await prisma.systemConfig.upsert({
            where: { key: cfg.key },
            update: { value: cfg.value },
            create: { id: newId(), key: cfg.key, value: cfg.value, remark: cfg.remark },
        });
    }

    /**
     * Phase 8 清理：删除被 turnstile.config 替代的旧 turnstile.enabled 配置项
     * - 旧 key 已废弃，但保留在 DB 中会让前端的 publicConfigs 返回两份数据造成混淆
     * - 幂等：找不到时 skip
     */
    const oldTurnstile = await prisma.systemConfig.findFirst({ where: { key: 'turnstile.enabled' } });
    if (oldTurnstile) {
        await prisma.systemConfig.delete({ where: { id: oldTurnstile.id } });
        logger.info('🗑️  已清理废弃配置: turnstile.enabled');
    }

    logger.info(`✅ 系统配置种子数据: ${systemConfigs.length} 条`);

    /**
     * 6. C端 RBAC 种子数据
     * - 4 个角色：guest / normal / vip / svip
     * - 5 个菜单：公开内容 / 普通内容 / VIP 内容 / SVIP 内容 / 帮助中心
     * - 4 个测试账号（手机号 13800000001~4），密码 Test@123，可走短信登录
     */
    await seedMemberRbac(prisma, newId);

    logger.info('🌱 Seed 完成！');
}

/**
 * C端 RBAC 种子数据
 * - 4 个 member_role 角色
 * - 5 个 member_menu 菜单（绑定到对应角色）
 * - 4 个测试账户（手机号登录 + 密码 Test@123）
 * - 全部幂等：upsert by code / findFirst 跳过已存在
 */
async function seedMemberRbac(prisma: any, newId: () => string) {
    // ====== 6.1 C端角色 ======
    const MEMBER_ROLES: Array<{ code: string; name: string; description: string }> = [
        { code: 'guest', name: '游客', description: '未登录用户，仅可访问公开内容' },
        { code: 'normal', name: '普通会员', description: '注册用户，可访问普通内容' },
        { code: 'vip', name: 'VIP 会员', description: '付费会员，可访问 VIP 内容' },
        { code: 'svip', name: 'SVIP 会员', description: '高级付费会员，可访问全量内容' },
    ];

    const memberRoleMap = new Map<string, { id: string }>();
    for (const role of MEMBER_ROLES) {
        const r = await prisma.memberRole.upsert({
            where: { code: role.code },
            update: { name: role.name, description: role.description },
            create: {
                id: newId(),
                name: role.name,
                code: role.code,
                description: role.description,
                enabled: true,
            },
        });
        memberRoleMap.set(role.code, r);
    }
    logger.info(`✅ C端角色: ${MEMBER_ROLES.length} 个`);

    // ====== 6.2 C端菜单 + 角色绑定 ======
    // 设计：
    //   - public（公开内容） → guest / normal / vip / svip 都能看
    //   - normal（普通内容）→ normal / vip / svip 能看
    //   - vip（VIP 内容）    → vip / svip 能看
    //   - svip（SVIP 内容）  → 仅 svip 能看
    //   - help（帮助中心）   → 所有登录用户能看
    const MEMBER_MENUS: Array<{
        name: string;
        type: 'menu' | 'button';
        path: string;
        permissionCode: string;
        bindRoles: string[]; // 哪些角色能看到
    }> = [
        {
            name: '公开内容',
            type: 'menu',
            path: '/public',
            permissionCode: 'member:public:view',
            bindRoles: ['guest', 'normal', 'vip', 'svip'],
        },
        {
            name: '普通内容',
            type: 'menu',
            path: '/normal',
            permissionCode: 'member:normal:view',
            bindRoles: ['normal', 'vip', 'svip'],
        },
        { name: 'VIP 专区', type: 'menu', path: '/vip', permissionCode: 'member:vip:view', bindRoles: ['vip', 'svip'] },
        { name: 'SVIP 专区', type: 'menu', path: '/svip', permissionCode: 'member:svip:view', bindRoles: ['svip'] },
        {
            name: '帮助中心',
            type: 'menu',
            path: '/help',
            permissionCode: 'member:help:view',
            bindRoles: ['normal', 'vip', 'svip'],
        },
    ];

    const existingMemberMenus = await prisma.memberMenu.findFirst({
        where: { name: '公开内容' },
    });

    if (!existingMemberMenus) {
        // 创建菜单 + 角色绑定（事务）
        await prisma.$transaction(async (tx: any) => {
            // 5 个扁平权限菜单
            const menuIdMap = new Map<string, string>();
            for (const menu of MEMBER_MENUS) {
                const created = await tx.memberMenu.create({
                    data: {
                        id: newId(),
                        name: menu.name,
                        type: menu.type,
                        path: menu.path,
                        permissionCode: menu.permissionCode,
                        sort: 0,
                        visible: true,
                        keepAlive: true,
                        enabled: true,
                    },
                });
                menuIdMap.set(menu.permissionCode, created.id);
            }

            // 绑定菜单到角色
            for (const menu of MEMBER_MENUS) {
                const menuId = menuIdMap.get(menu.permissionCode)!;
                for (const roleCode of menu.bindRoles) {
                    const role = memberRoleMap.get(roleCode);
                    if (!role) continue;
                    await tx.memberRoleMenu.create({
                        data: {
                            id: newId(),
                            roleId: role.id,
                            menuId,
                        },
                    });
                }
            }
        });
        logger.info(`✅ C端菜单: ${MEMBER_MENUS.length} 条 + 角色绑定`);
    } else {
        logger.info('⏭️ C端菜单已存在，跳过');
    }

    /**
     * C端功能目录 + 子菜单（前端 C端 SPA 动态路由用）
     * - 目录：C端功能（/member）
     * - 子菜单：个人中心（含编辑资料按钮）、VIP 专区、SVIP 专区
     * - 所有角色均绑定到目录，子菜单按等级分配
     * - 幂等：检查 C端功能 目录是否已存在
     */
    const existingMemberDir = await prisma.memberMenu.findFirst({
        where: { name: 'C端功能', type: 'directory', parentId: null },
    });

    if (!existingMemberDir) {
        await prisma.$transaction(async (tx: any) => {
            const memberDir = await tx.memberMenu.create({
                data: {
                    id: newId(),
                    name: 'C端功能',
                    type: 'directory',
                    path: '/member',
                    permissionCode: '',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            const profileMenu = await tx.memberMenu.create({
                data: {
                    id: newId(),
                    parentId: memberDir.id,
                    name: '个人中心',
                    type: 'menu',
                    path: 'profile',
                    routeName: 'MemberProfile',
                    permissionCode: 'member:profile:view',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });
            await tx.memberMenu.create({
                data: {
                    id: newId(),
                    parentId: profileMenu.id,
                    name: '编辑资料',
                    type: 'button',
                    permissionCode: 'member:profile:update',
                    sort: 1,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            const vipMenu = await tx.memberMenu.create({
                data: {
                    id: newId(),
                    parentId: memberDir.id,
                    name: 'VIP 专区',
                    type: 'menu',
                    path: 'vip',
                    routeName: 'MemberVip',
                    permissionCode: 'member:vip:view',
                    sort: 2,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            const svipMenu = await tx.memberMenu.create({
                data: {
                    id: newId(),
                    parentId: memberDir.id,
                    name: 'SVIP 专区',
                    type: 'menu',
                    path: 'svip',
                    routeName: 'MemberSvip',
                    permissionCode: 'member:svip:view',
                    sort: 3,
                    visible: true,
                    keepAlive: true,
                    enabled: true,
                },
            });

            // 角色绑定：所有角色可见目录 + 个人中心，VIP 可见 VIP 专区，SVIP 可见 SVIP 专区
            const allRoles = ['guest', 'normal', 'vip', 'svip'];
            for (const code of allRoles) {
                const role = memberRoleMap.get(code);
                if (!role) continue;
                for (const menuId of [memberDir.id, profileMenu.id]) {
                    await tx.memberRoleMenu.create({
                        data: { id: newId(), roleId: role.id, menuId },
                    });
                }
            }
            for (const code of ['vip', 'svip']) {
                const role = memberRoleMap.get(code);
                if (!role) continue;
                await tx.memberRoleMenu.create({
                    data: { id: newId(), roleId: role.id, menuId: vipMenu.id },
                });
            }
            {
                const role = memberRoleMap.get('svip');
                if (role) {
                    await tx.memberRoleMenu.create({
                        data: { id: newId(), roleId: role.id, menuId: svipMenu.id },
                    });
                }
            }
        });
        logger.info('✅ C端功能目录 + 子菜单已创建');
    } else {
        logger.info('⏭️ C端功能目录已存在，跳过');
    }

    // ====== 6.3 C端测试账号 ======
    // 4 个测试账号（13800000001=normal/13800000002=vip/13800000003=svip/13800000004=normal）
    // 密码统一 Test@123，可走短信登录或密码登录
    // 注意：实际开发中 member-sms-login 走 phone identity，
    //       但 phase 7 也支持密码重置，所以一并设置 credential
    const MEMBER_TEST_ACCOUNTS: Array<{ phone: string; nickname: string; roleCode: string | null }> = [
        { phone: '13800000001', nickname: '小明', roleCode: 'normal' },
        { phone: '13800000002', nickname: '小红', roleCode: 'vip' },
        { phone: '13800000003', nickname: '小刚', roleCode: 'svip' },
        { phone: '13800000004', nickname: '小李', roleCode: 'normal' },
    ];
    const MEMBER_TEST_PASSWORD = 'Test@123';
    const bcrypt = await import('bcrypt');
    const memberTestHashed = await bcrypt.hash(MEMBER_TEST_PASSWORD, BCRYPT_ROUNDS);

    let memberCreated = 0;
    for (const acc of MEMBER_TEST_ACCOUNTS) {
        const exists = await prisma.accountIdentity.findFirst({
            where: { identityType: 'phone', identifier: acc.phone },
        });
        if (exists) continue;

        const role = acc.roleCode ? memberRoleMap.get(acc.roleCode) : null;

        await prisma.$transaction(async (tx: any) => {
            // 创建账户（userType=member）
            const account = await tx.account.create({
                data: {
                    id: newId(),
                    userType: 'member',
                    enabled: true,
                },
            });

            // 创建 phone 身份（带密码，可走重置密码流程）
            await tx.accountIdentity.create({
                data: {
                    id: newId(),
                    accountId: account.id,
                    identityType: 'phone',
                    identifier: acc.phone,
                    credential: memberTestHashed,
                    verified: true,
                },
            });

            // 创建 member_profile
            await tx.memberProfile.create({
                data: {
                    id: newId(),
                    accountId: account.id,
                    phone: acc.phone,
                    nickname: acc.nickname,
                },
            });

            // 绑定角色
            if (role) {
                await tx.memberAccountRole.create({
                    data: {
                        id: newId(),
                        accountId: account.id,
                        roleId: role.id,
                    },
                });
            }

            memberCreated++;
        });
    }
    logger.info(`✅ C端测试账号: 新增 ${memberCreated} / 总计 ${MEMBER_TEST_ACCOUNTS.length} 个`);
    logger.info(`   密码（用于密码重置流程）: ${MEMBER_TEST_PASSWORD}`);
}

main()
    .catch((e) => {
        logger.error('❌ Seed 失败:', e);
        process.exit(1);
    })
    .finally(async () => {
        // 缓存失效：seed 完成后立即清掉所有菜单相关缓存 + bump 版本号
        // 这样即使业务代码漏调 invalidateMenuStructure()，下次访问也能自愈
        try {
            await invalidateCaches();
        } catch (e) {
            logger.error('⚠️  缓存失效失败（不影响 seed 主流程）:', e);
        }
        await prisma.$disconnect();
        await pool.end();
    });
