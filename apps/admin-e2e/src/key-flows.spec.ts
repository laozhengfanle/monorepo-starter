import { test, expect, type Page } from '@playwright/test';

/**
 * 关键业务流程 e2e（P3 测试补齐）：
 * - 登录成功 → 进入仪表盘 + 侧栏按权限渲染菜单
 * - 登录失败 → 错误提示 + 停留登录页
 * - 登出 → 回到登录页
 *
 * 前置：server（3301，已 seed root/Root!123）与 admin（3302，/api 反代）均已启动
 * （playwright.config webServer 会自动拉起 admin preview）。
 */

async function fillLogin(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('请输入用户名').fill(username);
  await page.getByPlaceholder('请输入密码').fill(password);
  // antd v6 两个中文字符按钮会自动插入空格（'登 录'），用正则匹配
  await page.getByRole('button', { name: /登\s*录/ }).click();
}

test('登录成功 → 进入仪表盘且侧栏渲染菜单', async ({ page }) => {
  await fillLogin(page, 'root', 'Root!123');

  // ProtectedRoute 登录后回跳 '/'（仪表盘）
  await page.waitForURL((url) => url.pathname === '/');
  await expect(
    page.getByRole('heading', { name: 'monorepo-starter' }),
  ).toBeVisible();
  // 超管侧栏全量菜单：权限中心 → 账户管理 / 角色权限
  await expect(page.getByText('权限中心')).toBeVisible();
  await expect(page.getByText('账户管理')).toBeVisible();
  await expect(page.getByText('角色权限')).toBeVisible();
});

test('登录失败 → 错误提示且停留登录页', async ({ page }) => {
  await fillLogin(page, 'root', 'wrong-password');

  await expect(page.getByText('用户名或密码错误')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('登出 → 回到登录页', async ({ page }) => {
  await fillLogin(page, 'root', 'Root!123');
  await page.waitForURL((url) => url.pathname === '/');

  // 顶栏用户下拉（hover 触发，最后一个 header 按钮）→ 退出登录
  await page.locator('.ant-layout-header').getByRole('button').last().hover();
  await page.getByText('退出登录').click();

  await page.waitForURL(/\/login/);
  await expect(page.locator('form')).toBeVisible();
});
