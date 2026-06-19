/**
 * v-permission 自定义指令单元测试
 *
 * 测试范围：
 *   - 基本功能：拥有权限时元素可见，无权限时元素被移除
 *   - 字符串权限码和数组权限码
 *   - 边界情况：空权限列表、空字符串、空数组
 *   - 响应式更新：权限变更后重新挂载组件的可见性变化
 *
 * 注意：当前指令只实现了 mounted 钩子，无 updated 钩子，
 *       因此权限变更后已挂载元素不会自动响应（设计如此，页面刷新路由后组件自然重新挂载）。
 *
 * 技术说明：el.remove() 会将元素从 DOM 树中脱离，但 @vue/test-utils 的 wrapper.text()
 * 仍能读取到脱离 DOM 的元素内容。因此通过在指令元素外包裹父容器，
 * 检查父容器的 text() 来判断元素是否真正被移除。
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { nextTick } from 'vue';
import { usePermissionStore } from '@/shared/stores/permission';
import { vPermission } from '@/shared/directives/permission';

// Mock vue-router，避免真实路由操作（permission store 内部依赖 router）
vi.mock('@/app/router', () => ({
    default: {
        addRoute: vi.fn(),
        removeRoute: vi.fn(),
        getRoutes: vi.fn(() => []),
    },
}));

/**
 * 创建测试组件
 * 外层包裹一个父容器 div.parent，用于检测子元素是否被 el.remove() 移除
 * @param permission - 传递给 v-permission 指令的权限码（字符串或数组）
 */
function createTestComponent(permission: string | string[]) {
    return {
        directives: { permission: vPermission },
        // 外层 .parent 作为观察容器，内层 div 受 v-permission 控制
        template: `<div class="parent"><div v-permission="permission">受保护内容</div></div>`,
        data() {
            return { permission };
        },
    };
}

/**
 * 挂载组件并注入权限 store
 * @param permissions - 用户拥有的权限码列表
 * @param componentPermission - 传递给 v-permission 的权限码
 */
function mountWithPermissions(permissions: string[] = [], componentPermission: string | string[] = 'test:perm') {
    return mount(createTestComponent(componentPermission), {
        global: {
            plugins: [
                createTestingPinia({
                    // 不 stub actions，让 hasAnyPermission 执行真实逻辑
                    stubActions: false,
                    initialState: {
                        permission: { permissions },
                    },
                }),
            ],
        },
    });
}

/**
 * 断言受保护内容可见（父容器中包含文本）
 */
function expectVisible(wrapper: ReturnType<typeof mount>) {
    expect(wrapper.find('.parent').text()).toContain('受保护内容');
}

/**
 * 断言受保护内容不可见（父容器中文本为空，子元素已被 remove）
 */
function expectHidden(wrapper: ReturnType<typeof mount>) {
    expect(wrapper.find('.parent').text()).not.toContain('受保护内容');
}

describe('v-permission 指令', () => {
    describe('基本功能', () => {
        it('用户拥有权限码时，元素可见', () => {
            const wrapper = mountWithPermissions(['iam:admin:create'], 'iam:admin:create');
            expectVisible(wrapper);
        });

        it('用户没有权限码时，元素被移除', () => {
            const wrapper = mountWithPermissions(['iam:role:create'], 'iam:admin:create');
            expectHidden(wrapper);
        });
    });

    describe('字符串权限码', () => {
        it('支持字符串权限码：v-permission="\'iam:admin:create\'"', () => {
            const wrapper = mountWithPermissions(['iam:admin:create'], 'iam:admin:create');
            expectVisible(wrapper);
        });

        it('字符串权限码不匹配时，元素被移除', () => {
            const wrapper = mountWithPermissions(['iam:role:create'], 'iam:admin:create');
            expectHidden(wrapper);
        });
    });

    describe('数组权限码', () => {
        it('支持数组权限码：任意一个匹配即可', () => {
            const wrapper = mountWithPermissions(['iam:admin:delete'], ['iam:admin:create', 'iam:admin:delete']);
            // 用户拥有 iam:admin:delete，数组中包含该权限码，元素可见
            expectVisible(wrapper);
        });

        it('数组权限码全部不匹配时，元素被移除', () => {
            const wrapper = mountWithPermissions(['iam:role:create'], ['iam:admin:create', 'iam:admin:delete']);
            expectHidden(wrapper);
        });

        it('数组权限码全部匹配时，元素可见', () => {
            const wrapper = mountWithPermissions(
                ['iam:admin:create', 'iam:admin:delete'],
                ['iam:admin:create', 'iam:admin:delete'],
            );
            expectVisible(wrapper);
        });
    });

    describe('边界情况', () => {
        it('用户权限列表为空时，元素被移除', () => {
            const wrapper = mountWithPermissions([], 'iam:admin:create');
            expectHidden(wrapper);
        });

        it('空字符串权限码时，元素被移除', () => {
            const wrapper = mountWithPermissions(['iam:admin:create'], '');
            // 空字符串不在权限集中，hasAnyPermission 返回 false
            expectHidden(wrapper);
        });

        it('空数组权限码时，元素被移除', () => {
            const wrapper = mountWithPermissions(['iam:admin:create'], []);
            // 空数组 [].some() 返回 false，hasAnyPermission 返回 false
            expectHidden(wrapper);
        });
    });

    describe('响应式更新', () => {
        it('权限变更后重新挂载组件，元素可见性跟随变化', async () => {
            // 第一次挂载：用户没有权限，元素被移除
            const wrapper1 = mountWithPermissions(['iam:role:create'], 'iam:admin:create');
            expectHidden(wrapper1);

            // 第二次挂载：用户拥有权限，元素可见
            const wrapper2 = mountWithPermissions(['iam:admin:create'], 'iam:admin:create');
            expectVisible(wrapper2);
        });

        it('当前实现中，权限变更不会自动更新已挂载元素（无 updated 钩子）', async () => {
            // 挂载时用户没有权限，元素被移除
            const wrapper = mountWithPermissions(['iam:role:create'], 'iam:admin:create');
            expectHidden(wrapper);

            // 动态添加权限码
            const store = usePermissionStore();
            store.permissions = ['iam:admin:create'];
            await nextTick();

            // 由于指令没有 updated 钩子，且元素已被 remove，
            // 权限变更后元素不会自动恢复
            expectHidden(wrapper);
        });
    });
});
