import { describe, it, expect } from 'vitest';
import {
    CreateAdminAccountSchema,
    UpdateAdminAccountSchema,
    QueryAdminAccountSchema,
} from '../admin/admin-account.schema.js';
import { CreateAdminRoleSchema, UpdateAdminRoleSchema, AssignRoleMenusSchema } from '../admin/admin-role.schema.js';
import { CreateAdminMenuSchema } from '../admin/admin-menu.schema.js';

// ── CreateAdminAccountSchema 测试 ──
describe('CreateAdminAccountSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的创建管理员输入', () => {
        const result = CreateAdminAccountSchema.safeParse({
            username: 'admin01',
            nickname: '管理员',
        });
        expect(result.success).toBe(true);
    });

    /** 带可选字段通过 */
    it('应通过带可选字段的输入', () => {
        const result = CreateAdminAccountSchema.safeParse({
            username: 'admin01',
            nickname: '管理员',
            phone: '13800138000',
            email: 'admin@example.com',
            roleIds: ['550e8400-e29b-41d4-a716-446655440000'],
        });
        expect(result.success).toBe(true);
    });

    /** 必填字段缺失报错 */
    it('应拒绝缺少必填字段', () => {
        const result = CreateAdminAccountSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
            const fields = result.error.issues.map((i) => i.path.join('.'));
            expect(fields).toContain('username');
            expect(fields).toContain('nickname');
        }
    });

    /** 手机号格式错误报错 */
    it('应拒绝错误格式的手机号', () => {
        const result = CreateAdminAccountSchema.safeParse({
            username: 'admin01',
            nickname: '管理员',
            phone: '12345',
        });
        expect(result.success).toBe(false);
    });

    /** 邮箱格式错误报错 */
    it('应拒绝错误格式的邮箱', () => {
        const result = CreateAdminAccountSchema.safeParse({
            username: 'admin01',
            nickname: '管理员',
            email: 'not-an-email',
        });
        expect(result.success).toBe(false);
    });

    /** roleIds 中非 UUID 格式报错 */
    it('应拒绝 roleIds 中的非 UUID 格式', () => {
        const result = CreateAdminAccountSchema.safeParse({
            username: 'admin01',
            nickname: '管理员',
            roleIds: ['not-a-uuid'],
        });
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = CreateAdminAccountSchema.safeParse({
            username: 'admin01',
            nickname: '管理员',
            extra: 'hack',
        });
        expect(result.success).toBe(false);
    });
});

// ── UpdateAdminAccountSchema 测试 ──
describe('UpdateAdminAccountSchema', () => {
    /** partial 模式：空对象通过 */
    it('应通过空对象（partial 模式）', () => {
        const result = UpdateAdminAccountSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    /** partial 模式：只传部分字段通过 */
    it('应通过只传部分字段', () => {
        const result = UpdateAdminAccountSchema.safeParse({
            nickname: '新昵称',
        });
        expect(result.success).toBe(true);
    });

    /** partial 模式：仍校验字段格式 */
    it('应拒绝错误格式的字段值', () => {
        const result = UpdateAdminAccountSchema.safeParse({
            phone: '12345',
        });
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = UpdateAdminAccountSchema.safeParse({
            extra: 'hack',
        });
        expect(result.success).toBe(false);
    });
});

// ── QueryAdminAccountSchema 测试 ──
describe('QueryAdminAccountSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的查询输入', () => {
        const result = QueryAdminAccountSchema.safeParse({
            page: 1,
            pageSize: 20,
            keyword: 'admin',
            enabled: true,
        });
        expect(result.success).toBe(true);
    });

    /** 默认分页值 */
    it('应提供默认分页值', () => {
        const result = QueryAdminAccountSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.page).toBe(1);
            expect(result.data.pageSize).toBe(20);
        }
    });

    /** keyword 过长报错 */
    it('应拒绝过长的关键词', () => {
        const result = QueryAdminAccountSchema.safeParse({
            keyword: 'a'.repeat(101),
        });
        expect(result.success).toBe(false);
    });
});

// ── CreateAdminRoleSchema 测试 ──
describe('CreateAdminRoleSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的创建角色输入', () => {
        const result = CreateAdminRoleSchema.safeParse({
            name: '运营',
            code: 'operator',
        });
        expect(result.success).toBe(true);
    });

    /** 必填字段缺失报错 */
    it('应拒绝缺少必填字段', () => {
        const result = CreateAdminRoleSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    /** code 不以字母开头报错 */
    it('应拒绝不以字母开头的角色编码', () => {
        const result = CreateAdminRoleSchema.safeParse({
            name: '运营',
            code: '123operator',
        });
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = CreateAdminRoleSchema.safeParse({
            name: '运营',
            code: 'operator',
            extra: 'hack',
        });
        expect(result.success).toBe(false);
    });
});

// ── UpdateAdminRoleSchema 测试 ──
describe('UpdateAdminRoleSchema', () => {
    /** partial 模式：空对象通过 */
    it('应通过空对象（partial 模式）', () => {
        const result = UpdateAdminRoleSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    /** partial 模式：仍校验字段格式 */
    it('应拒绝错误格式的字段值', () => {
        const result = UpdateAdminRoleSchema.safeParse({
            code: '123invalid',
        });
        expect(result.success).toBe(false);
    });
});

// ── AssignRoleMenusSchema 测试 ──
describe('AssignRoleMenusSchema', () => {
    /** 正常输入通过 */
    it('应通过合法的分配角色菜单输入', () => {
        const result = AssignRoleMenusSchema.safeParse({
            roleId: '550e8400-e29b-41d4-a716-446655440000',
            menuIds: ['660e8400-e29b-41d4-a716-446655440001'],
        });
        expect(result.success).toBe(true);
    });

    /** roleId 非 UUID 报错 */
    it('应拒绝非 UUID 格式的 roleId', () => {
        const result = AssignRoleMenusSchema.safeParse({
            roleId: 'not-a-uuid',
            menuIds: ['660e8400-e29b-41d4-a716-446655440001'],
        });
        expect(result.success).toBe(false);
    });

    /** menuIds 允许空数组（业务场景：取消该角色的所有权限）*/
    it('应允许空的 menuIds 数组（清空权限合法）', () => {
        const result = AssignRoleMenusSchema.safeParse({
            roleId: '550e8400-e29b-41d4-a716-446655440000',
            menuIds: [],
        });
        expect(result.success).toBe(true);
    });

    /** menuIds 中含非 UUID 报错 */
    it('应拒绝 menuIds 中的非 UUID 格式', () => {
        const result = AssignRoleMenusSchema.safeParse({
            roleId: '550e8400-e29b-41d4-a716-446655440000',
            menuIds: ['not-a-uuid'],
        });
        expect(result.success).toBe(false);
    });
});

// ── CreateAdminMenuSchema 测试 ──
describe('CreateAdminMenuSchema', () => {
    /** 正常输入通过 — directory 类型 */
    it('应通过合法的目录菜单输入', () => {
        const result = CreateAdminMenuSchema.safeParse({
            name: '系统管理',
            type: 'directory',
        });
        expect(result.success).toBe(true);
    });

    /** 正常输入通过 — menu 类型 */
    it('应通过合法的页面菜单输入', () => {
        const result = CreateAdminMenuSchema.safeParse({
            parentId: '550e8400-e29b-41d4-a716-446655440000',
            name: '管理员管理',
            type: 'menu',
            path: '/iam/admin',
            routeName: 'IamAdminList',
            permissionCode: 'iam:admin:list',
        });
        expect(result.success).toBe(true);
    });

    /** 正常输入通过 — button 类型 */
    it('应通过合法的按钮菜单输入', () => {
        const result = CreateAdminMenuSchema.safeParse({
            parentId: '550e8400-e29b-41d4-a716-446655440000',
            name: '新增',
            type: 'button',
            permissionCode: 'iam:admin:create',
        });
        expect(result.success).toBe(true);
    });

    /** 必填字段缺失报错 */
    it('应拒绝缺少必填字段', () => {
        const result = CreateAdminMenuSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
            const fields = result.error.issues.map((i) => i.path.join('.'));
            expect(fields).toContain('name');
            expect(fields).toContain('type');
        }
    });

    /** type 枚举值错误报错 */
    it('应拒绝无效的菜单类型', () => {
        const result = CreateAdminMenuSchema.safeParse({
            name: '测试',
            type: 'invalid',
        });
        expect(result.success).toBe(false);
    });

    /** parentId 非 UUID 格式报错 */
    it('应拒绝非 UUID 格式的 parentId', () => {
        const result = CreateAdminMenuSchema.safeParse({
            name: '测试',
            type: 'menu',
            parentId: 'not-a-uuid',
        });
        expect(result.success).toBe(false);
    });

    /** strict 模式拒绝多余字段 */
    it('应拒绝多余字段（strict 模式）', () => {
        const result = CreateAdminMenuSchema.safeParse({
            name: '测试',
            type: 'menu',
            extra: 'hack',
        });
        expect(result.success).toBe(false);
    });
});
