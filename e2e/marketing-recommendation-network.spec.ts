import { expect, test } from '@playwright/test';

const token = process.env.E2E_TOKEN;

test.describe('智能推荐真实浏览器请求拓扑', () => {
  test.skip(!token, 'E2E_TOKEN is required for the real local API acceptance');

  test('首屏只发起三个并行主请求', async ({ page }) => {
    await page.addInitScript((value) => window.localStorage.setItem('token', value), token!);
    await page.goto('/dashboard');

    const storeSelector = page.getByRole('combobox').first();
    await expect(storeSelector).toBeVisible();
    await storeSelector.click();
    await page.getByRole('option', { name: /Ami 全量演示/ }).click();

    const observed = new Map<string, number>();
    const mainPaths = new Set([
      '/api/marketing/recommendation-workspace',
      '/api/marketing/follow-up-tasks/summary',
      '/api/marketing/lifecycle/quality',
    ]);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/marketing/')) {
        observed.set(url.pathname, (observed.get(url.pathname) ?? 0) + 1);
      }
    });

    await page.getByRole('link', { name: '智能推荐' }).click();
    await expect(page).toHaveURL(/\/customer-marketing\/intelligent-recommendation$/);
    await expect(page.getByRole('heading', { name: '智能推荐' })).toBeVisible();
    await expect.poll(() => [...mainPaths].map((path) => observed.get(path) ?? 0)).toEqual([1, 1, 1]);

    const unexpected = [...observed.entries()].filter(([path]) => !mainPaths.has(path));
    expect(unexpected).toEqual([]);
    expect(observed.has('/api/marketing/recommendation-instances/refresh')).toBe(false);
    expect([...observed.keys()].some((path) => /\/audience$/.test(path))).toBe(false);
  });
});
