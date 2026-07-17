import { expect, test } from '@playwright/test';

const username = process.env.E2E_USERNAME || 'admin';
const password = process.env.E2E_PASSWORD || '11111111';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe('Ami Brain real product flow', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('creates a conversation, streams an answer and restores it after refresh', async ({ page }) => {
    await login(page);
    await page.goto('/brain');
    await expect(page.getByRole('heading', { name: 'Ami Brain' })).toBeVisible();

    await page.getByRole('button', { name: '新建会话' }).click();
    await expect(page.getByText(/会话 #\d+/)).toBeVisible();

    const question = '今天店里情况怎么样，给我来个总结';
    await page.getByPlaceholder('问经营数据、风险和下一步动作').fill(question);
    await page.getByRole('button', { name: '发送' }).click();

    await expect(page.getByText(/经营概览：实收流水|经营分析：实收/).last()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder('问经营数据、风险和下一步动作')).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByText('数据与口径')).toBeVisible();
    await expect(page.getByText('运行轨迹', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: new RegExp(question) }).last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/经营概览：实收流水|经营分析：实收/).last()).toBeVisible();
  });

  test('opens the governance workspaces without rendering all panels at once', async ({ page }) => {
    await login(page);
    await page.goto('/brain-governance');
    await expect(page.getByRole('heading', { name: 'Ami Brain 治理中心' })).toBeVisible();

    await page.getByRole('button', { name: '模型规划' }).click();
    await expect(page.getByText('模型运行配置')).toBeVisible();
    await expect(page.getByText('Capability Card')).toBeVisible();
    await expect(page.getByText('执行 DAG')).toBeVisible();

    await page.getByRole('button', { name: '评测中心' }).click();
    await expect(page.getByText(/评测运行|评测任务|评测集/).first()).toBeVisible();

    await page.getByRole('button', { name: '发布中心' }).click();
    await expect(page.getByText(/发布|灰度|回滚/).first()).toBeVisible();

    await page.getByRole('button', { name: '巡检治理' }).click();
    await expect(page.getByText(/巡检|发现/).first()).toBeVisible();
  });
});

test.describe('Ami Brain mobile width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps the chat controls usable without horizontal overflow', async ({ page }) => {
    await login(page);
    await page.goto('/brain');
    await expect(page.getByPlaceholder('问经营数据、风险和下一步动作')).toBeVisible();
    await expect(page.getByRole('button', { name: '新会话' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders model plans as a linear list without governance page overflow', async ({ page }) => {
    await login(page);
    await page.goto('/brain-governance');
    await page.getByRole('button', { name: '模型规划' }).click();
    await expect(page.getByText('执行 DAG')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
