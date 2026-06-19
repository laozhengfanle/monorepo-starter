/**
 * 登录/登出 E2E 测试
 *
 * 验证清单覆盖：
 *   - 打开 admin → 未登录 → 自动跳 /login
 *   - 输入 root / Root!123 → 登录成功 → 跳 Dashboard
 *   - 刷新页面 → 侧边栏菜单恢复（cookie → refresh → /me → 动态路由）
 *   - 已登录访问 /login → 自动跳首页
 */
import { test, expect } from '@playwright/test';

test.describe('登录/登出流程', () => {
    test('未登录访问管理后台，自动跳转到登录页', async ({ page }) => {
        await page.goto('/');
        // 应该被重定向到 /login
        await expect(page).toHaveURL(/\/login/);
    });

    test('使用超管账号登录成功后跳转到 Dashboard', async ({ page }) => {
        await page.goto('/login');

        // 填写登录表单
        await page.getByPlaceholder(/用户名|账号/).fill('root');
        await page.getByPlaceholder(/密码/).fill('Root!123');

        // 点击登录按钮
        await page.getByRole('button', { name: /登录|登 录/ }).click();

        // 应该跳转到 Dashboard 或首页
        await expect(page).toHaveURL(/\/(dashboard|welcome)/, { timeout: 10000 });

        // 侧边栏应该可见
        await expect(page.locator('.n-layout-sider, [class*="sidebar"]')).toBeVisible();
    });

    test('登录后刷新页面，菜单和路由恢复正常', async ({ page }) => {
        // 先登录
        await page.goto('/login');
        await page.getByPlaceholder(/用户名|账号/).fill('root');
        await page.getByPlaceholder(/密码/).fill('Root!123');
        await page.getByRole('button', { name: /登录|登 录/ }).click();
        await expect(page).toHaveURL(/\/(dashboard|welcome)/, { timeout: 10000 });

        // 刷新页面
        await page.reload();

        // 应该仍在 Dashboard，没有被踢回登录页
        await expect(page).toHaveURL(/\/(dashboard|welcome)/, { timeout: 10000 });

        // 侧边栏菜单应该恢复
        await expect(page.locator('.n-layout-sider, [class*="sidebar"]')).toBeVisible();
    });

    test('已登录状态访问 /login，自动跳转首页', async ({ page }) => {
        // 先登录
        await page.goto('/login');
        await page.getByPlaceholder(/用户名|账号/).fill('root');
        await page.getByPlaceholder(/密码/).fill('Root!123');
        await page.getByRole('button', { name: /登录|登 录/ }).click();
        await expect(page).toHaveURL(/\/(dashboard|welcome)/, { timeout: 10000 });

        // 再次访问 /login
        await page.goto('/login');

        // 应该被重定向到首页
        await expect(page).toHaveURL(/\/(dashboard|welcome)/, { timeout: 5000 });
    });
});
