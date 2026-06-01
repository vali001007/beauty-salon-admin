import { test, expect } from '@playwright/test';

const e2eUsername = process.env.E2E_USERNAME || 'admin';
const e2ePassword = process.env.E2E_PASSWORD || '11111111';

test('login page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /登录/i })).toBeVisible();
});

test('login with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="username"]', e2eUsername);
  await page.fill('input[name="password"]', e2ePassword);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});

test('login with invalid credentials shows error', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="username"]', e2eUsername);
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await expect(page.getByText(/密码错误|用户名或密码/i).first()).toBeVisible();
});
