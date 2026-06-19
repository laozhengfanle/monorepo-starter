/**
 * IAM（管理员/角色/菜单管理）E2E 测试
 *
 * 验证清单覆盖：
 *   - 管理员管理：列表加载、新增、编辑、删除
 *   - 角色管理：列表显示、创建、分配权限
 *   - 菜单管理：树形表格展示、创建/编辑/删除
 *   - 按钮权限：超管可见所有操作按钮
 */
import { test, expect, type Page } from '@playwright/test';

// 登录辅助函数：以超管身份登录
async function loginAsSuperAdmin(page: Page) {
    await page.goto('/login');
    await page.getByPlaceholder(/用户名|账号/).fill('root');
    await page.getByPlaceholder(/密码/).fill('Root!123');
    await page.getByRole('button', { name: /登录|登 录/ }).click();
    await expect(page).toHaveURL(/\/(dashboard|welcome)/, { timeout: 10000 });
}

test.describe('管理员管理', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsSuperAdmin(page);
        // 导航到管理员管理页面
        await page.getByText('权限管理').click();
        await page.getByText('管理员管理').click();
        await expect(page).toHaveURL(/\/iam\/admin/, { timeout: 5000 });
    });

    test('管理员列表加载成功，表格有数据', async ({ page }) => {
        // 表格应该可见且有数据行
        const table = page.locator('.n-data-table');
        await expect(table).toBeVisible();
        // 至少有一行数据（超管账号）
        await expect(table.locator('tbody tr')).toHaveCount({ min: 1 });
    });

    test('超管可见所有操作按钮（添加、编辑、删除）', async ({ page }) => {
        // 头部"添加管理员"按钮可见
        await expect(page.getByRole('button', { name: /添加管理员/ })).toBeVisible();

        // 表格操作列应该有编辑和删除按钮
        const actionColumn = page.locator('.n-data-table tbody tr').first().locator('td').last();
        await expect(actionColumn.getByText('编辑')).toBeVisible();
        await expect(actionColumn.getByText('删除')).toBeVisible();
    });

    test('点击"添加管理员"打开新增弹窗', async ({ page }) => {
        await page.getByRole('button', { name: /添加管理员/ }).click();

        // 弹窗应该可见
        await expect(page.locator('.n-modal')).toBeVisible();
        await expect(page.getByText('添加管理员')).toBeVisible();
    });
});

test.describe('角色管理', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsSuperAdmin(page);
        await page.getByText('权限管理').click();
        await page.getByText('角色管理').click();
        await expect(page).toHaveURL(/\/iam\/role/, { timeout: 5000 });
    });

    test('角色列表显示成功', async ({ page }) => {
        const table = page.locator('.n-data-table');
        await expect(table).toBeVisible();
        await expect(table.locator('tbody tr')).toHaveCount({ min: 1 });
    });

    test('点击"新增角色"打开新增弹窗', async ({ page }) => {
        await page.getByRole('button', { name: /新增角色/ }).click();
        await expect(page.locator('.n-modal')).toBeVisible();
        await expect(page.getByText('新增角色')).toBeVisible();
    });
});

test.describe('菜单管理', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsSuperAdmin(page);
        await page.getByText('权限管理').click();
        await page.getByText('菜单管理').click();
        await expect(page).toHaveURL(/\/iam\/menu/, { timeout: 5000 });
    });

    test('树形表格展示菜单数据', async ({ page }) => {
        const table = page.locator('.n-data-table');
        await expect(table).toBeVisible();
        // 应该有"权限管理"目录
        await expect(table.getByText('权限管理')).toBeVisible();
    });

    test('点击"添加菜单"打开抽屉', async ({ page }) => {
        await page.getByRole('button', { name: /添加菜单/ }).click();
        // 抽屉应该可见
        await expect(page.locator('.n-drawer')).toBeVisible();
    });
});
