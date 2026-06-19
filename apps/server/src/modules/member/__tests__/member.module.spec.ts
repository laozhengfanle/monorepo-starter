/**
 * MemberModule 动态注册测试
 *
 * 覆盖：
 * - production 环境：MemberTestController 不在 controllers 列表
 * - non-production 环境（dev/test）：MemberTestController 在 controllers 列表
 * - 业务 service（Role / Menu / Profile）两种环境都正确注册（不影响线上业务）
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { MemberModule } from '../member.module.js';

describe('MemberModule.forRoot() 生产环境剔除', () => {
    const originalEnv = process.env['NODE_ENV'];

    beforeEach(() => {
        // 每次测试前清理，确保 NODE_ENV 重置
        delete process.env['NODE_ENV'];
    });

    afterEach(() => {
        // 恢复测试前环境
        if (originalEnv === undefined) {
            delete process.env['NODE_ENV'];
        } else {
            process.env['NODE_ENV'] = originalEnv;
        }
    });

    it('production 环境：应剔除 MemberTestController（避免测试路由泄露）', () => {
        process.env['NODE_ENV'] = 'production';

        const dynamicModule = MemberModule.forRoot();

        expect(dynamicModule.controllers ?? []).not.toContain(
            expect.objectContaining({ name: 'MemberTestController' }),
        );
        // 业务 service 不应受影响
        const providerNames = (dynamicModule.providers ?? []).map((p) => {
            if (typeof p === 'function') return p.name;
            if (typeof p === 'object' && p !== null && 'name' in p) {
                return (p as { name?: string }).name;
            }
            return undefined;
        });
        expect(providerNames).toEqual(
            expect.arrayContaining(['MemberRoleService', 'MemberMenuService', 'MemberProfileService']),
        );
    });

    it('development 环境：应注册 MemberTestController（保留自测端点）', () => {
        process.env['NODE_ENV'] = 'development';

        const dynamicModule = MemberModule.forRoot();

        // dev 环境应包含 MemberTestController（class 引用）
        const controllerClasses = (dynamicModule.controllers ?? []).filter(
            (c): c is new (...args: unknown[]) => unknown => typeof c === 'function',
        );
        const controllerNames = controllerClasses.map((c) => c.name);
        expect(controllerNames).toContain('MemberTestController');
    });

    it('test 环境：应注册 MemberTestController', () => {
        process.env['NODE_ENV'] = 'test';

        const dynamicModule = MemberModule.forRoot();

        const controllerClasses = (dynamicModule.controllers ?? []).filter(
            (c): c is new (...args: unknown[]) => unknown => typeof c === 'function',
        );
        const controllerNames = controllerClasses.map((c) => c.name);
        expect(controllerNames).toContain('MemberTestController');
    });

    it('NODE_ENV 未设置（默认 dev）：应注册 MemberTestController', () => {
        // 模拟开发者忘记设 NODE_ENV 的情况 — 走默认 dev 分支，注册测试 controller
        delete process.env['NODE_ENV'];

        const dynamicModule = MemberModule.forRoot();

        const controllerClasses = (dynamicModule.controllers ?? []).filter(
            (c): c is new (...args: unknown[]) => unknown => typeof c === 'function',
        );
        const controllerNames = controllerClasses.map((c) => c.name);
        // 默认非 production → 注册
        expect(controllerNames).toContain('MemberTestController');
    });
});
