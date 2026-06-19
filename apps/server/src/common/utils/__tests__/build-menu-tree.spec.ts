import { buildMenuTree, type FlatMenu } from '../build-menu-tree.js';

/**
 * buildMenuTree 纯函数单元测试
 * - 测试树构建逻辑：空输入、单节点、多层级、排序、孤儿节点
 */
describe('buildMenuTree', () => {
    /** 辅助函数：创建扁平菜单 */
    const mk = (overrides: Partial<FlatMenu> & Pick<FlatMenu, 'id' | 'name' | 'sort'>): FlatMenu => ({
        parentId: null,
        type: 'menu',
        visible: true,
        keepAlive: true,
        enabled: true,
        ...overrides,
    });

    /** 1. 空输入 → 返回空数组 */
    it('空输入时返回空数组', () => {
        const result = buildMenuTree([]);
        expect(result).toEqual([]);
    });

    /** 2. 单个根节点 → 返回单元素数组 */
    it('单个根节点返回单元素数组', () => {
        const menus = [mk({ id: '1', name: '权限管理', sort: 1 })];
        const result = buildMenuTree(menus);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
        expect(result[0].name).toBe('权限管理');
        expect(result[0].children).toEqual([]);
    });

    /** 3. 两层结构：目录 → 菜单 */
    it('两层结构：目录包含子菜单', () => {
        const menus = [
            mk({ id: '1', name: '权限管理', type: 'directory', sort: 1 }),
            mk({ id: '2', name: '管理员管理', type: 'menu', parentId: '1', sort: 1 }),
        ];
        const result = buildMenuTree(menus);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('权限管理');
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children[0].name).toBe('管理员管理');
    });

    /** 4. 三层结构：目录 → 菜单 → 按钮 */
    it('三层结构：目录→菜单→按钮', () => {
        const menus = [
            mk({ id: '1', name: '权限管理', type: 'directory', sort: 1 }),
            mk({ id: '2', name: '管理员管理', type: 'menu', parentId: '1', sort: 1 }),
            mk({ id: '3', name: '新增管理员', type: 'button', parentId: '2', sort: 1 }),
            mk({ id: '4', name: '删除管理员', type: 'button', parentId: '2', sort: 2 }),
        ];
        const result = buildMenuTree(menus);
        const dir = result[0];
        expect(dir.children).toHaveLength(1);
        const menu = dir.children[0];
        expect(menu.name).toBe('管理员管理');
        expect(menu.children).toHaveLength(2);
        expect(menu.children.map((c) => c.name)).toEqual(['新增管理员', '删除管理员']);
    });

    /** 5. 多个根节点 */
    it('多个根节点各自独立', () => {
        const menus = [
            mk({ id: '1', name: '权限管理', sort: 1 }),
            mk({ id: '2', name: '配置中心', sort: 2 }),
            mk({ id: '3', name: '管理员管理', parentId: '1', sort: 1 }),
            mk({ id: '4', name: '后台设置', parentId: '2', sort: 1 }),
        ];
        const result = buildMenuTree(menus);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('权限管理');
        expect(result[1].name).toBe('配置中心');
        expect(result[0].children[0].name).toBe('管理员管理');
        expect(result[1].children[0].name).toBe('后台设置');
    });

    /** 6. 按 sort 升序排列 */
    it('子节点按 sort 升序排列', () => {
        const menus = [
            mk({ id: '1', name: '根', sort: 1 }),
            mk({ id: '2', name: '角色管理', parentId: '1', sort: 3 }),
            mk({ id: '3', name: '管理员管理', parentId: '1', sort: 1 }),
            mk({ id: '4', name: '菜单管理', parentId: '1', sort: 2 }),
        ];
        const result = buildMenuTree(menus);
        expect(result[0].children.map((c) => c.name)).toEqual(['管理员管理', '菜单管理', '角色管理']);
    });

    /** 7. 根节点也按 sort 排序 */
    it('根节点按 sort 升序排列', () => {
        const menus = [
            mk({ id: '2', name: '配置中心', sort: 2 }),
            mk({ id: '1', name: '权限管理', sort: 1 }),
            mk({ id: '3', name: '日志管理', sort: 3 }),
        ];
        const result = buildMenuTree(menus);
        expect(result.map((r) => r.name)).toEqual(['权限管理', '配置中心', '日志管理']);
    });

    /** 8. 孤儿节点（parentId 指向不存在的父节点）被忽略 */
    it('孤儿节点（parentId 指向不存在的父节点）被忽略', () => {
        const menus = [
            mk({ id: '1', name: '根', sort: 1 }),
            mk({ id: '2', name: '孤儿', parentId: 'nonexistent', sort: 1 }),
        ];
        const result = buildMenuTree(menus);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('根');
        expect(result[0].children).toHaveLength(0);
    });

    /** 9. 不修改原始输入数组 */
    it('不修改原始输入数组', () => {
        const menus = [mk({ id: '2', name: '角色管理', sort: 2 }), mk({ id: '1', name: '管理员管理', sort: 1 })];
        const originalOrder = menus.map((m) => m.id);
        buildMenuTree(menus);
        expect(menus.map((m) => m.id)).toEqual(originalOrder);
    });

    /** 10. 可选字段正确传递 */
    it('可选字段（path, icon, permissionCode）正确传递', () => {
        const menus = [
            mk({
                id: '1',
                name: '管理员管理',
                sort: 1,
                path: 'admin',
                routeName: 'IamAdminList',
                icon: 'tabler:User',
                permissionCode: 'iam:admin:list',
            }),
        ];
        const result = buildMenuTree(menus);
        expect(result[0].path).toBe('admin');
        expect(result[0].routeName).toBe('IamAdminList');
        expect(result[0].icon).toBe('tabler:User');
        expect(result[0].permissionCode).toBe('iam:admin:list');
    });
});
