import { test, expect } from '@playwright/test';

const e2eUsername = process.env.E2E_USERNAME || 'admin';
const e2ePassword = process.env.E2E_PASSWORD || '11111111';

test.describe('authenticated navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="username"]', e2eUsername);
    await page.fill('input[name="password"]', e2ePassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('dashboard loads', async ({ page }) => {
    await expect(page.getByText('仪表盘 / 数据概览')).toBeVisible();
  });

  test('can navigate to customer management', async ({ page }) => {
    await page.getByRole('link', { name: /客户数据/ }).click();
    await expect(page).toHaveURL(/customers\/data/);
  });
});
