import { test, expect } from '@playwright/test';

test('登录页渲染：标题与登录表单可见', async ({ page }) => {
  await page.goto('/login');

  // 登录卡片标题（antd 表单）
  await expect(page.locator('form')).toBeVisible();
  // 测试账号快速填充按钮（开发者快捷登录）
  await expect(page.getByText('超级管理员')).toBeVisible();
});

test('未登录访问受保护页 → 重定向到登录', async ({ page }) => {
  await page.goto('/dashboard');

  // 未登录时 ProtectedRoute 应重定向到 /login
  await page.waitForURL(/\/login/);
  await expect(page.locator('form')).toBeVisible();
});
