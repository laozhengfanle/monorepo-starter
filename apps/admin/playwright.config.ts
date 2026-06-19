import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置
 *
 * 测试目标：管理后台核心流程
 * - 登录/登出
 * - 动态菜单加载
 * - IAM CRUD（用户/角色/菜单管理）
 * - 按钮权限控制
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    // 不自动启动 web server，需要手动启动 dev server 后再跑测试
    // 如需自动启动，取消注释以下配置：
    // webServer: {
    //     command: 'pnpm dev',
    //     url: 'http://localhost:5173',
    //     reuseExistingServer: !process.env.CI,
    // },
});
