import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置（monorepo 根目录）
 *
 * 测试目标：管理后台全功能 CRUD 验证
 * - 登录/登出
 * - 缓存管理
 * - 菜单管理（树形表格 + 抽屉编辑）
 * - 管理员管理（弹窗 + 软删/硬删）
 * - 角色管理（弹窗 + 权限分配）
 * - 系统设置
 * - 审计日志
 *
 * 核心原则：验证操作结果（检测红色错误弹窗），而非仅验证按钮可点击
 */
export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false, // 串行执行，避免多个测试同时操作同一数据库
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1, // 单 worker，保证测试顺序和数据库状态一致
    reporter: 'html',
    timeout: 60_000, // 每个测试最长 60 秒
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        actionTimeout: 10_000, // 每个操作最长等待 10 秒
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // 侧边栏自动折叠阈值默认 1280px，视口必须大于此值才能展开侧边栏
                viewport: { width: 1440, height: 900 },
            },
        },
        {
            name: 'firefox',
            use: {
                ...devices['Desktop Firefox'],
                viewport: { width: 1440, height: 900 },
            },
        },
        {
            name: 'webkit',
            use: {
                ...devices['Desktop Safari'],
                viewport: { width: 1440, height: 900 },
            },
        },
    ],
    // 不自动启动 web server，需要手动启动 dev server 后再跑测试
});
