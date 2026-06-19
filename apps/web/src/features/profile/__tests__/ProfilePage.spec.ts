/**
 * ProfilePage 组件单元测试
 *
 * 测试覆盖：
 *   - 有用户数据时展示昵称、账户 ID、角色标签
 *   - 无用户数据时展示空状态和"去登录"按钮
 *   - 头像文字逻辑（昵称首字 / "用"）
 *   - 角色标签映射（vip→VIP, svip→SVIP, member→普通会员）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ProfilePage from '../ProfilePage.vue';

// ---- Mock auth store ----
// 默认提供空用户数据，每个测试用例可覆盖
const mockAuthStore = {
    user: null as unknown,
    isLoggedIn: false,
    login: vi.fn(),
    fetchUser: vi.fn(),
    logout: vi.fn(),
    sendSmsCode: vi.fn(),
};

vi.mock('@/features/auth/store', () => ({
    useAuthStore: () => mockAuthStore,
}));

// ---- Mock vue-router ----
const mockPush = vi.fn();
vi.mock('vue-router', async () => {
    const actual = await vi.importActual('vue-router');
    return {
        ...actual,
        useRouter: () => ({
            push: mockPush,
            replace: vi.fn(),
        }),
    };
});

/**
 * 挂载 ProfilePage 组件的辅助函数
 *
 * 封装了 Pinia 和 Naive UI 组件的 stub 配置
 */
function mountProfilePage() {
    const pinia = createPinia();
    setActivePinia(pinia);

    return mount(ProfilePage, {
        global: {
            plugins: [pinia],
            // Stub 掉 Naive UI 组件，简化测试
            stubs: {
                NCard: { template: '<div class="n-card"><slot/></div>' },
                NAvatar: {
                    template: '<div class="n-avatar" :data-src="src"><slot/></div>',
                    props: ['src', 'size', 'round'],
                },
                NTag: {
                    template: '<span class="n-tag" :data-type="type"><slot/></span>',
                    props: ['type', 'size'],
                },
                NEmpty: {
                    template: '<div class="n-empty">{{ description }}<slot/><slot name="extra"/></div>',
                    props: ['description'],
                },
                NButton: {
                    template: '<button class="n-button" :data-type="type" @click="$emit(\'click\')"><slot/></button>',
                    props: ['type'],
                    emits: ['click'],
                },
            },
        },
    });
}

/** 模拟的用户数据 */
const mockUser = {
    accountId: 'ACC001',
    nickname: '张三',
    avatar: '',
    roles: ['vip', 'member'],
};

describe('ProfilePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 每个测试前重置 mock store
        mockAuthStore.user = null;
        mockAuthStore.isLoggedIn = false;
    });

    // ---- 1. 有用户数据时 ----
    describe('有用户数据', () => {
        it('展示昵称、账户 ID 和角色标签', () => {
            // 设置 mock store 返回用户数据
            mockAuthStore.user = { ...mockUser };
            mockAuthStore.isLoggedIn = true;

            const wrapper = mountProfilePage();

            // 验证昵称被渲染
            expect(wrapper.text()).toContain('张三');
            // 验证账户 ID 被渲染
            expect(wrapper.text()).toContain('ACC001');
            // 验证角色标签被渲染
            expect(wrapper.text()).toContain('VIP');
            expect(wrapper.text()).toContain('普通会员');
        });
    });

    // ---- 2. 无用户数据时 ----
    describe('无用户数据', () => {
        it("展示空状态描述和'去登录'按钮", () => {
            mockAuthStore.user = null;
            mockAuthStore.isLoggedIn = false;

            const wrapper = mountProfilePage();

            // NEmpty stub 会渲染 description prop
            expect(wrapper.text()).toContain('暂无用户信息');
            // 验证"去登录"按钮存在
            expect(wrapper.text()).toContain('去登录');
        });

        it("点击'去登录'按钮跳转到登录页", async () => {
            mockAuthStore.user = null;
            mockAuthStore.isLoggedIn = false;

            const wrapper = mountProfilePage();

            // 找到"去登录"按钮并点击
            const loginButton = wrapper.find('.n-button');
            await loginButton.trigger('click');

            // 验证跳转到登录页
            expect(mockPush).toHaveBeenCalledWith('/login');
        });
    });

    // ---- 3. 头像文字逻辑 ----
    describe('头像文字', () => {
        it('有昵称时使用昵称首字', () => {
            mockAuthStore.user = { ...mockUser, nickname: '王小明' };
            mockAuthStore.isLoggedIn = true;

            const wrapper = mountProfilePage();

            // 验证头像显示昵称首字
            const avatar = wrapper.find('.n-avatar');
            expect(avatar.text()).toBe('王');
        });

        it("无昵称时显示'用'", () => {
            mockAuthStore.user = { ...mockUser, nickname: undefined };
            mockAuthStore.isLoggedIn = true;

            const wrapper = mountProfilePage();

            // 验证头像显示默认文字"用"
            const avatar = wrapper.find('.n-avatar');
            expect(avatar.text()).toBe('用');
        });
    });

    // ---- 4. 角色标签映射 ----
    describe('角色标签映射', () => {
        it('vip → VIP', () => {
            mockAuthStore.user = { ...mockUser, roles: ['vip'] };
            mockAuthStore.isLoggedIn = true;

            const wrapper = mountProfilePage();

            expect(wrapper.text()).toContain('VIP');
        });

        it('svip → SVIP', () => {
            mockAuthStore.user = { ...mockUser, roles: ['svip'] };
            mockAuthStore.isLoggedIn = true;

            const wrapper = mountProfilePage();

            expect(wrapper.text()).toContain('SVIP');
        });

        it('member → 普通会员', () => {
            mockAuthStore.user = { ...mockUser, roles: ['member'] };
            mockAuthStore.isLoggedIn = true;

            const wrapper = mountProfilePage();

            expect(wrapper.text()).toContain('普通会员');
        });

        it('未知角色 → 原样显示', () => {
            mockAuthStore.user = { ...mockUser, roles: ['custom_role'] };
            mockAuthStore.isLoggedIn = true;

            const wrapper = mountProfilePage();

            expect(wrapper.text()).toContain('custom_role');
        });
    });
});
