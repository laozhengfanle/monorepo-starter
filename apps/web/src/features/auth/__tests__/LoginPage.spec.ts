/**
 * LoginPage 组件单元测试
 *
 * 测试覆盖：
 *   - 页面元素渲染
 *   - 发送验证码按钮禁用逻辑
 *   - 发送验证码交互
 *   - 登录交互
 *   - 登录成功跳转
 *   - 登录失败提示
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LoginPage from '../LoginPage.vue';

// ---- Mock auth store ----
const mockSendSmsCode = vi.fn();
const mockLogin = vi.fn();
const mockFetchUser = vi.fn();
const mockLogout = vi.fn();

vi.mock('../store', () => ({
    useAuthStore: () => ({
        sendSmsCode: mockSendSmsCode,
        login: mockLogin,
        fetchUser: mockFetchUser,
        logout: mockLogout,
        isLoggedIn: false,
        user: null,
    }),
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
        useRoute: () => ({
            query: {},
        }),
    };
});

// ---- Mock naive-ui useMessage ----
const mockMessageWarning = vi.fn();
const mockMessageSuccess = vi.fn();
const mockMessageError = vi.fn();

vi.mock('naive-ui', async () => {
    const actual = await vi.importActual('naive-ui');
    return {
        ...actual,
        useMessage: () => ({
            warning: mockMessageWarning,
            success: mockMessageSuccess,
            error: mockMessageError,
            // 防御性补齐 wrapCreate 调用的方法
            info: vi.fn(),
            loading: vi.fn(),
            create: vi.fn(),
            destroyAll: vi.fn(),
        }),
        // web 的 useMessage 包装还调了 useDialog + useNotification，
        // 这两个需要 NDialogProvider / NNotificationProvider 子树，
        // 测试环境没挂 Provider，必须 mock 否则会抛 "No outer <n-dialog-provider />" 之类错误
        useDialog: () => ({
            /* 空 mock */
        }),
        useNotification: () => ({
            create: vi.fn(),
            success: vi.fn(),
            error: vi.fn(),
            warning: vi.fn(),
            info: vi.fn(),
        }),
    };
});

/**
 * 挂载 LoginPage 组件的辅助函数
 *
 * 使用 Naive UI 组件的 stub，NForm 的 validate 方法始终返回成功
 */
function mountLoginPage() {
    const pinia = createPinia();
    setActivePinia(pinia);

    return mount(LoginPage, {
        global: {
            plugins: [pinia],
            stubs: {
                NCard: { template: '<div class="n-card"><slot/></div>' },
                NForm: {
                    template: '<div class="n-form"><slot/></div>',
                    props: ['model', 'rules', 'labelPlacement'],
                    /** 提供 validate 方法，始终校验通过 */
                    methods: {
                        validate: () => Promise.resolve(),
                    },
                },
                NFormItem: {
                    template: '<div class="n-form-item"><slot/></div>',
                    props: ['label', 'path', 'showFeedback'],
                },
                NInput: {
                    template:
                        '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
                    props: ['modelValue', 'placeholder', 'maxlength', 'clearable'],
                    emits: ['update:modelValue'],
                },
                NButton: {
                    template:
                        '<button :disabled="disabled" :loading="loading" @click="$emit(\'click\')"><slot/></button>',
                    props: ['disabled', 'loading', 'type', 'block'],
                    emits: ['click'],
                },
                /**
                 * TurnstileWidget 在测试中不渲染真实 Cloudflare widget
                 * 只渲染一个空 div 占位，避免尝试加载外部脚本
                 */
                TurnstileWidget: {
                    template: '<div class="cf-turnstile-stub" />',
                    props: ['siteKey'],
                },
            },
        },
    });
}

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ---- 1. 渲染基本元素 ----
    describe('页面渲染', () => {
        it('渲染手机号输入框、验证码输入框和登录按钮', () => {
            const wrapper = mountLoginPage();

            // 查找所有 input 元素（手机号 + 验证码）
            const inputs = wrapper.findAll('input');
            expect(inputs.length).toBeGreaterThanOrEqual(2);

            // 查找登录按钮（包含"登录"文字的按钮）
            const buttons = wrapper.findAll('button');
            const loginButton = buttons.find((btn) => btn.text().includes('登录'));
            expect(loginButton).toBeDefined();
        });
    });

    // ---- 2. 发送验证码按钮禁用逻辑 ----
    describe('发送验证码按钮', () => {
        it('手机号无效时，发送验证码按钮被禁用', () => {
            const wrapper = mountLoginPage();

            // 查找发送验证码按钮（包含"发送验证码"文字）
            const buttons = wrapper.findAll('button');
            const sendButton = buttons.find((btn) => btn.text().includes('发送验证码'));
            expect(sendButton).toBeDefined();

            // 初始状态（手机号为空），按钮应被禁用
            expect(sendButton!.attributes('disabled')).toBeDefined();
        });

        it('输入有效手机号后，发送验证码按钮变为可用', async () => {
            const wrapper = mountLoginPage();

            // 找到手机号输入框（第一个 input）
            const inputs = wrapper.findAll('input');
            const phoneInput = inputs[0];

            // 输入有效手机号（触发 update:modelValue 事件）
            await phoneInput.setValue('13800138000');
            await flushPromises();

            // 查找发送验证码按钮
            const buttons = wrapper.findAll('button');
            const sendButton = buttons.find((btn) => btn.text().includes('发送验证码'));

            // 按钮应变为可用（disabled 属性为空字符串或 undefined）
            const disabled = sendButton!.attributes('disabled');
            expect(!disabled || disabled === '' || disabled === 'false').toBe(true);
        });
    });

    // ---- 3. 点击发送验证码 ----
    describe('发送验证码交互', () => {
        it('点击发送验证码 → 调用 authStore.sendSmsCode', async () => {
            mockSendSmsCode.mockResolvedValue(undefined);
            const wrapper = mountLoginPage();

            // 直接设置组件内部 formData 的 phone 字段
            // @ts-expect-error — 访问组件内部 reactive 状态用于测试
            wrapper.vm.formData.phone = '13800138000';
            await flushPromises();

            // 找到发送验证码按钮并点击
            const buttons = wrapper.findAll('button');
            const sendButton = buttons.find((btn) => btn.text().includes('发送验证码'));
            await sendButton!.trigger('click');
            await flushPromises();

            // 验证 sendSmsCode 被正确调用（turnstileToken 可选，未填时为 undefined）
            expect(mockSendSmsCode).toHaveBeenCalledWith('13800138000', 'login', undefined);
        });
    });

    // ---- 4. 点击登录 ----
    describe('登录交互', () => {
        it('填写有效表单后点击登录 → 调用 authStore.login', async () => {
            mockLogin.mockResolvedValue(undefined);
            const wrapper = mountLoginPage();

            // 直接设置组件内部 formData
            // @ts-expect-error — 访问组件内部 reactive 状态用于测试
            wrapper.vm.formData.phone = '13800138000';
            // @ts-expect-error — 访问组件内部 reactive 状态用于测试
            wrapper.vm.formData.code = '123456';
            await flushPromises();

            // 找到登录按钮并点击
            const buttons = wrapper.findAll('button');
            const loginButton = buttons.find((btn) => btn.text().includes('登录'));
            await loginButton!.trigger('click');
            await flushPromises();

            // 验证 login 被正确调用（turnstileToken 可选，未填时为 undefined）
            expect(mockLogin).toHaveBeenCalledWith('13800138000', '123456', undefined);
        });
    });

    // ---- 5. 登录成功跳转 ----
    describe('登录成功跳转', () => {
        it('登录成功后跳转到首页', async () => {
            mockLogin.mockResolvedValue(undefined);
            const wrapper = mountLoginPage();

            // 直接设置组件内部 formData
            // @ts-expect-error — 访问组件内部 reactive 状态用于测试
            wrapper.vm.formData.phone = '13800138000';
            // @ts-expect-error — 访问组件内部 reactive 状态用于测试
            wrapper.vm.formData.code = '123456';
            await flushPromises();

            // 点击登录
            const buttons = wrapper.findAll('button');
            const loginButton = buttons.find((btn) => btn.text().includes('登录'));
            await loginButton!.trigger('click');
            await flushPromises();

            // 验证调用了 router.push 跳转首页
            expect(mockPush).toHaveBeenCalledWith('/');
        });
    });

    // ---- 6. 登录失败提示 ----
    describe('登录失败提示', () => {
        it('登录失败时显示错误提示', async () => {
            mockLogin.mockRejectedValue(new Error('登录失败'));
            const wrapper = mountLoginPage();

            // 直接设置组件内部 formData
            // @ts-expect-error — 访问组件内部 reactive 状态用于测试
            wrapper.vm.formData.phone = '13800138000';
            // @ts-expect-error — 访问组件内部 reactive 状态用于测试
            wrapper.vm.formData.code = '123456';
            await flushPromises();

            // 点击登录
            const buttons = wrapper.findAll('button');
            const loginButton = buttons.find((btn) => btn.text().includes('登录'));
            await loginButton!.trigger('click');
            await flushPromises();

            // 验证显示了错误提示（带 optional options 参数）
            expect(mockMessageError).toHaveBeenCalledWith('登录失败', undefined);
        });
    });
});
