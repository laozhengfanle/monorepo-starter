import { test, expect } from '@playwright/test';

test('renders the app shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'monorepo-starter' })).toBeVisible();
});
