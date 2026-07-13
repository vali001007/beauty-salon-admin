import { expect, test } from '@playwright/test';

const e2eUsername = process.env.E2E_USERNAME || 'admin';
const e2ePassword = process.env.E2E_PASSWORD || '11111111';

const chainPages = [
  { path: '/industry/product-templates', title: /行业数据平台|标准商品\/耗品/ },
  { path: '/industry/supply-mappings', title: /行业数据平台|供应链映射/ },
  { path: '/inventory/products', title: /产品管理/ },
  { path: '/inventory/purchase', title: /采购管理/ },
  { path: '/inventory/stock', title: /库存管理/ },
  { path: '/supply-platform', title: /供应链平台|平台 MVP/ },
  { path: '/orders/products', title: /商品订单管理|商品订单/ },
  { path: '/stores/projects', title: /项目管理/ },
];

test.describe('industry product to inventory chain pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', e2eUsername);
    await page.fill('input[name="password"]', e2ePassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  for (const item of chainPages) {
    test(`${item.path} renders without route or permission error`, async ({ page }) => {
      await page.goto(item.path);
      await expect(page).toHaveURL(new RegExp(item.path.replace(/\//g, '\\/')));
      await expect(page.locator('body')).toContainText(item.title, { timeout: 15000 });
      await expect(page.locator('body')).not.toContainText(/404: 页面未找到|无权限|页面出错/);
    });
  }
});
