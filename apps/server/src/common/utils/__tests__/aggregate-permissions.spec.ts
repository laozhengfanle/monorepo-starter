import { aggregatePermissions } from '../aggregate-permissions.js';

/**
 * aggregatePermissions 纯函数单元测试
 * - 测试权限聚合逻辑：角色权限提取、grant/deny 覆盖、去重、空值过滤
 */
describe('aggregatePermissions', () => {
    /** 1. 空角色和空覆盖 → 返回空数组 */
    it('空角色和空覆盖时返回空数组', () => {
        const result = aggregatePermissions([], []);
        expect(result).toEqual([]);
    });

    /** 2. 单角色单权限 → 返回该权限 */
    it('单角色单权限时返回该权限', () => {
        const roles = [
            {
                roleMenus: [{ menu: { permissionCode: 'iam:admin:list' } }],
            },
        ];
        const result = aggregatePermissions(roles, []);
        expect(result).toEqual(['iam:admin:list']);
    });

    /** 3. 多角色权限合并去重 */
    it('多角色权限合并去重', () => {
        const roles = [
            {
                roleMenus: [
                    { menu: { permissionCode: 'iam:admin:list' } },
                    { menu: { permissionCode: 'iam:role:list' } },
                ],
            },
            {
                roleMenus: [
                    { menu: { permissionCode: 'iam:role:list' } },
                    { menu: { permissionCode: 'iam:menu:list' } },
                ],
            },
        ];
        const result = aggregatePermissions(roles, []);
        /** iam:role:list 在两个角色中都出现，应去重 */
        expect(result).toEqual(['iam:admin:list', 'iam:role:list', 'iam:menu:list']);
    });

    /** 4. grant 覆盖追加权限 */
    it('grant 覆盖追加权限', () => {
        const roles = [
            {
                roleMenus: [{ menu: { permissionCode: 'iam:admin:list' } }],
            },
        ];
        const overrides = [{ menu: { permissionCode: 'iam:admin:create' }, type: 'grant' as const }];
        const result = aggregatePermissions(roles, overrides);
        /** grant 追加了 iam:admin:create */
        expect(result).toEqual(['iam:admin:list', 'iam:admin:create']);
    });

    /** 5. deny 覆盖移除权限 */
    it('deny 覆盖移除权限', () => {
        const roles = [
            {
                roleMenus: [
                    { menu: { permissionCode: 'iam:admin:list' } },
                    { menu: { permissionCode: 'iam:admin:delete' } },
                ],
            },
        ];
        const overrides = [{ menu: { permissionCode: 'iam:admin:delete' }, type: 'deny' as const }];
        const result = aggregatePermissions(roles, overrides);
        /** deny 移除了 iam:admin:delete */
        expect(result).toEqual(['iam:admin:list']);
    });

    /** 6. grant + deny 混合 */
    it('grant + deny 混合场景', () => {
        const roles = [
            {
                roleMenus: [
                    { menu: { permissionCode: 'iam:admin:list' } },
                    { menu: { permissionCode: 'iam:admin:delete' } },
                ],
            },
        ];
        const overrides = [
            { menu: { permissionCode: 'iam:role:list' }, type: 'grant' as const },
            { menu: { permissionCode: 'iam:admin:delete' }, type: 'deny' as const },
        ];
        const result = aggregatePermissions(roles, overrides);
        /** grant 追加 iam:role:list，deny 移除 iam:admin:delete */
        expect(result).toEqual(['iam:admin:list', 'iam:role:list']);
    });

    /** 7. 空 permissionCode 的菜单被过滤 */
    it('空 permissionCode 的菜单被过滤', () => {
        const roles = [
            {
                roleMenus: [
                    { menu: { permissionCode: 'iam:admin:list' } },
                    { menu: { permissionCode: '' } },
                    { menu: { permissionCode: 'iam:role:list' } },
                ],
            },
        ];
        const overrides = [
            { menu: { permissionCode: '' }, type: 'grant' as const },
            { menu: { permissionCode: 'iam:menu:list' }, type: 'grant' as const },
        ];
        const result = aggregatePermissions(roles, overrides);
        /** 空字符串的 permissionCode 被 filter(Boolean) 过滤掉 */
        expect(result).toEqual(['iam:admin:list', 'iam:role:list', 'iam:menu:list']);
    });

    /** 8. deny 不存在的权限（无害操作） */
    it('deny 不存在的权限是无害操作', () => {
        const roles = [
            {
                roleMenus: [{ menu: { permissionCode: 'iam:admin:list' } }],
            },
        ];
        const overrides = [{ menu: { permissionCode: 'iam:nonexistent' }, type: 'deny' as const }];
        const result = aggregatePermissions(roles, overrides);
        /** deny 一个不存在的权限，不会影响已有权限 */
        expect(result).toEqual(['iam:admin:list']);
    });
});
