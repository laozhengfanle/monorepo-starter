/**
 * Prisma seed 幂等性结构测试
 *
 * 目的：
 * - 静态扫描 seed.ts 源码，确保关键 CRUD 都用 upsert / findFirst 守卫
 * - 防止后续开发者不小心把 create() 直接调用加回去，破坏幂等性
 *
 * 注意：这是结构性测试（不实际跑 seed），跑真 seed 需要真实 DB，留给 integration test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEED_PATH = resolve(__dirname, '../../../prisma/seed.ts');

function readSeed(): string {
    return readFileSync(SEED_PATH, 'utf-8');
}

describe('prisma/seed.ts — 幂等性结构', () => {
    const seed = readSeed();

    it('文件存在且可读', () => {
        expect(seed.length).toBeGreaterThan(0);
        expect(seed).toContain('async function main');
    });

    describe('admin_role 种子', () => {
        it('使用 findFirst 守卫 + update/create 模式', () => {
            // 检查 findFirst + update/create 同时出现
            const roleSection = seed.match(/BUSINESS_ROLES[\s\S]*?roleMap\.set\([\s\S]*?console\.log/);
            expect(roleSection).toBeTruthy();
            const text = roleSection![0];
            expect(text).toMatch(/findFirst/);
            expect(text).toMatch(/\.update\(/);
            expect(text).toMatch(/\.create\(/);
            expect(text).toMatch(/prisma\.adminRole/);
        });
    });

    describe('admin_menu 种子', () => {
        it('用 findFirst 检查 + 整段跳过', () => {
            const menuSection = seed.match(/2\.\s*种子菜单[\s\S]*?3\./);
            expect(menuSection).toBeTruthy();
            const text = menuSection![0];
            expect(text).toMatch(/findFirst/);
            expect(text).toMatch(/if\s*\(!existingIamDir\)/);
        });
    });

    describe('account_identity 种子（超管 + 测试用户）', () => {
        it('超管身份用 findFirst 守卫', () => {
            // 找 createSuperAdmin 调用或 SUPER_ADMIN_USERNAME 相关
            expect(seed).toMatch(/SUPER_ADMIN_USERNAME/);
            // 至少出现 1 次 findFirst({ where: { identityType/identifier } })
            const findFirstIdentity = seed.match(/findFirst\([\s\S]*?identityType[\s\S]*?identifier[\s\S]*?\)/g);
            expect(findFirstIdentity).toBeTruthy();
            expect(findFirstIdentity!.length).toBeGreaterThanOrEqual(2);
        });

        it('测试用户用 findFirst 守卫 + continue 跳过', () => {
            // 检查 findFirst + if (exists) continue
            const testUserSection = seed.match(/TEST_USERS[\s\S]*?memberCreated/);
            expect(testUserSection).toBeTruthy();
            const text = testUserSection![0];
            expect(text).toMatch(/findFirst/);
            expect(text).toMatch(/if\s*\(exists\)\s*continue/);
        });
    });

    describe('system_config 种子', () => {
        it('用 upsert by key', () => {
            const cfgSection = seed.match(/systemConfigs[\s\S]*?console\.log\(\`\u2705 系统配置/);
            expect(cfgSection).toBeTruthy();
            expect(cfgSection![0]).toMatch(/upsert\(/);
            expect(cfgSection![0]).toMatch(/where:\s*\{\s*key:/);
        });

        it('清理废弃配置用 findFirst 守卫（不强制 delete）', () => {
            expect(seed).toMatch(/oldTurnstile/);
            expect(seed).toMatch(/findFirst\([\s\S]*?key:\s*'turnstile\.enabled'/);
            // delete 必须在 if (oldTurnstile) 块内
            expect(seed).toMatch(/if\s*\(oldTurnstile\)[\s\S]*?delete/);
        });
    });

    describe('member_role 种子', () => {
        it('用 upsert by code', () => {
            const memberRoleSection = seed.match(/MEMBER_ROLES[\s\S]*?memberRoleMap\.set/);
            expect(memberRoleSection).toBeTruthy();
            expect(memberRoleSection![0]).toMatch(/upsert\(/);
            expect(memberRoleSection![0]).toMatch(/where:\s*\{\s*code:/);
        });
    });

    describe('member_menu 种子', () => {
        it('用 findFirst 检查 + 整段跳过', () => {
            const memberMenuSection = seed.match(/existingMemberMenus/);
            expect(memberMenuSection).toBeTruthy();
            expect(seed).toMatch(/if\s*\(!existingMemberMenus\)/);
        });
    });

    describe('C端测试账号', () => {
        it('用 findFirst + continue 跳过已存在', () => {
            const cEndSection = seed.match(/MEMBER_TEST_ACCOUNTS[\s\S]*?memberCreated\+\+/);
            expect(cEndSection).toBeTruthy();
            expect(cEndSection![0]).toMatch(/findFirst/);
            expect(cEndSection![0]).toMatch(/if\s*\(exists\)\s*continue/);
        });
    });

    describe('禁止破坏幂等的反模式', () => {
        it('不在事务里直接 prisma.X.deleteMany()（只允许 upsert / findFirst 守卫）', () => {
            // 删除行可能存在（系统配置清理用），但要确保不在事务里
            const deleteManyInTx = seed.match(/\$transaction[\s\S]*?deleteMany/);
            expect(deleteManyInTx).toBeNull();
        });

        it('不使用 $executeRawUnsafe（防 SQL 注入 + 难幂等）', () => {
            expect(seed).not.toMatch(/\$executeRawUnsafe/);
        });
    });
});
