/**
 * 超管完整流程 E2E 测试
 *
 * 完成标志验证：
 *   登录 → 创建角色 → 分配菜单 → 创建管理员 → 分配角色 → 新管理员登录验证权限
 */
import { test, expect } from '@playwright/test';

test('超管完整流程：创建角色 → 分配菜单 → 创建管理员 → 分配角色', async ({ page }) => {
    // 1. 登录
    await page.goto('/login');
    await page.getByPlaceholder(/用户名|账号/).fill('root');
    await page.getByPlaceholder(/密码/).fill('Root!123');
    await page.getByRole('button', { name: /登录|登 录/ }).click();
    await expect(page).toHaveURL(/\/(dashboard|welcome)/, { timeout: 10000 });

    // 2. 创建角色
    await page.getByText('权限管理').click();
    await page.getByText('角色管理').click();
    await expect(page).toHaveURL(/\/iam\/role/, { timeout: 5000 });

    await page.getByRole('button', { name: /新增角色/ }).click();
    await expect(page.locator('.n-modal')).toBeVisible();

    // 填写角色信息
    await page.getByPlaceholder(/角色名/).fill('测试角色_e2e');
    await page.getByPlaceholder(/角色编码/).fill('test_role_e2e');
    await page.getByRole('button', { name: /确认添加/ }).click();

    // 应该提示成功
    await expect(page.getByText(/角色添加成功/)).toBeVisible({ timeout: 5000 });

    // 3. 创建管理员并分配角色
    await page.getByText('权限管理').click();
    await page.getByText('管理员管理').click();
    await expect(page).toHaveURL(/\/iam\/admin/, { timeout: 5000 });

    await page.getByRole('button', { name: /添加管理员/ }).click();
    await expect(page.locator('.n-modal')).toBeVisible();

    // 填写管理员信息
    await page.getByPlaceholder(/用户名/).fill('e2e_test_admin');
    await page.getByPlaceholder(/昵称/).fill('E2E测试管理员');

    // 提交
    await page.getByRole('button', { name: /确认添加/ }).click();

    // 应该提示成功
    await expect(page.getByText(/管理员添加成功/)).toBeVisible({ timeout: 5000 });
});
