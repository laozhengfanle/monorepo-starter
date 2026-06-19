/**
 * SvipPage 组件 + 路由守卫集成测试
 *
 * 测试覆盖：
 *   1. 渲染时显示 "SVIP" 字样
 *   2. 未登录访问 /svip → 跳转到 /login
 *   3. VIP 用户访问 /svip → 跳转到 /vip-upgrade（vip 不可进 svip 专属页）
 *   4. SVIP 用户访问 /svip → 正常显示内容（含昵称、SVIP 徽章、特权标题）
 *
 * 关于 requiresSvip 严格等值的核心测试：
 *   测试 3 是本测试套件的关键，它验证"普通 VIP 用户**不能**进入 SVIP 专属页"。
 *   这正是 requiresVip 和 requiresSvip 拆分的意义：
 *     - requiresVip = some(role === 'vip' || role === 'svip')  ← vip/svip 都能进
 *     - requiresSvip = roles[0] === 'svip'  ← 严格等值，vip 不行
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SvipPage from '../SvipPage.vue';

// ---- Mock auth store ----
// 默认空用户；每个测试可改写 mockAuthStore 的字段
const mockAuthStore = {
    user: null as unknown,
    isLoggedIn: false,
};

vi.mock('@/features/auth/store', () => ({
    useAuthStore: () => mockAuthStore,
}));

// ---- Mock vue-router ----
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('vue-router', async () => {
    const actual = await vi.importActual('vue-router');
    return {
        ...actual,
        useRouter: () => ({
            push: mockPush,
            replace: mockReplace,
        }),
    };
});

/**
 * 挂载 SvipPage 组件的辅助函数
 *
 * 用 stub 简化 Naive UI 组件，聚焦逻辑验证
 */
function mountSvipPage() {
    const pinia = createPinia();
    setActivePinia(pinia);

    return mount(SvipPage, {
        global: {
            plugins: [pinia],
            stubs: {
                NAlert: {
                    template: '<div class="n-alert" :data-type="type"><slot name="header"/><slot/></div>',
                    props: ['type', 'showIcon', 'title'],
                },
                NCard: { template: '<div class="n-card"><slot/></div>' },
                NResult: {
                    template: '<div class="n-result">{{ title }}<slot name="footer"/></div>',
                    props: ['status', 'title', 'description'],
                },
                NTag: {
                    template: '<span class="n-tag" :data-type="type"><slot/></span>',
                    props: ['type', 'size'],
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

describe('SvipPage — 组件渲染', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthStore.user = null;
        mockAuthStore.isLoggedIn = false;
    });

    // ---- 测试 1：渲染时显示 SVIP 字样 ----
    it("渲染时显示 'SVIP' 字样（标题 + 徽章）", () => {
        // 模拟 SVIP 用户
        mockAuthStore.user = {
            accountId: 'ACC-SVIP-001',
            nickname: 'SVIP 用户',
            roles: ['svip'],
        };
        mockAuthStore.isLoggedIn = true;

        const wrapper = mountSvipPage();

        // 标题"SVIP 专属"含 SVIP 字样
        expect(wrapper.text()).toContain('SVIP 专属');
        // n-alert 的"您是 SVIP 会员"也含 SVIP
        expect(wrapper.text()).toContain('您是 SVIP 会员');
        // 角色徽章文字
        expect(wrapper.text()).toContain('SVIP');
    });
});

describe('SvipPage — requiresSvip 守卫行为（模拟路由导航）', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthStore.user = null;
        mockAuthStore.isLoggedIn = false;
    });

    /**
     * 用真实 vue-router + memory history 模拟 /svip 导航，
     * 复用 router/index.ts 的路由表和 router/guards.ts 的守卫，
     * 端到端验证 requiresAuth / requiresSvip 守卫的拦截行为
     */
    async function navigateToSvip() {
        // 动态 import 避免在测试加载阶段就触发 router 注册
        const router = (await import('@/app/router/index')).default;
        // 重置到初始位置
        await router.replace('/');
        // 导航到 /svip
        return router.push('/svip').catch(() => {
            // 守卫重定向不算错误
        });
    }

    // ---- 测试 2：未登录访问 /svip 跳 /login ----
    it('未登录访问 /svip → 跳转到 /login', async () => {
        // 重要：清空 localStorage，避免 isLoggedIn 被 localStorage 标记污染
        localStorage.clear();
        mockAuthStore.user = null;
        mockAuthStore.isLoggedIn = false;

        await navigateToSvip();
        await flushPromises();

        const router = (await import('@/app/router/index')).default;
        // 验证当前路径是 /login
        expect(router.currentRoute.value.name).toBe('LoginPage');
        // 验证 redirect 参数被带上
        expect(router.currentRoute.value.query.redirect).toBe('/svip');
    });

    // ---- 测试 3：VIP 用户访问 /svip 跳 /vip-upgrade ----
    it('VIP 用户访问 /svip → 跳转到 /vip-upgrade（vip 不能进 svip 专属页）', async () => {
        localStorage.clear();
        // 模拟 vip 用户（不是 svip）
        mockAuthStore.user = {
            accountId: 'ACC-VIP-001',
            nickname: '普通 VIP',
            roles: ['vip'],
        };
        mockAuthStore.isLoggedIn = true;

        await navigateToSvip();
        await flushPromises();

        const router = (await import('@/app/router/index')).default;
        // 验证被重定向到 /vip-upgrade
        expect(router.currentRoute.value.name).toBe('VipUpgradePage');
        // 不能到达 /svip
        expect(router.currentRoute.value.name).not.toBe('SvipPage');
    });

    // ---- 测试 4：SVIP 用户访问 /svip 正常显示内容 ----
    it('SVIP 用户访问 /svip → 正常显示内容（含昵称 + 角色徽章）', async () => {
        localStorage.clear();
        mockAuthStore.user = {
            accountId: 'ACC-SVIP-002',
            nickname: '顶级会员',
            roles: ['svip'],
        };
        mockAuthStore.isLoggedIn = true;

        await navigateToSvip();
        await flushPromises();

        const router = (await import('@/app/router/index')).default;
        // 验证成功进入 /svip
        expect(router.currentRoute.value.name).toBe('SvipPage');

        // 挂载 SvipPage 组件，验证渲染内容
        const wrapper = mountSvipPage();

        // 验证昵称展示
        expect(wrapper.text()).toContain('顶级会员');
        // 验证 SVIP 字样多次出现（标题、徽章、特权文字）
        expect(wrapper.text()).toContain('SVIP');
        // 验证特权文案（虚构占位内容）
        expect(wrapper.text()).toContain('1对1 专属客服');
        expect(wrapper.text()).toContain('优先体验新功能');
        expect(wrapper.text()).toContain('定制化内容推荐');
    });
});
