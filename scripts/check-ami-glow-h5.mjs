import { chromium } from 'playwright';

const baseUrl = process.env.AMI_GLOW_H5_URL || 'http://127.0.0.1:5178';
const viewport = { width: 390, height: 844 };
const requiredPages = ['/', '/booking', '/login', '/mine', '/tools'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readPage(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
  return page.locator('body').innerText({ timeout: 5000 });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport });
const errors = [];
const checked = [];

page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.route('**/api/customer-app/events', async (route) => {
  await route.fulfill({ status: 204, body: '' });
});

try {
  for (const path of requiredPages) {
    const text = await readPage(page, path);
    assert(text.includes('Ami Glow'), `${path} 未渲染 Ami Glow 标识`);
    assert(!text.includes('页面加载中') && !text.includes('项目加载中'), `${path} 停留在加载态`);
    checked.push({ path, sample: text.slice(0, 120).replace(/\s+/g, ' ') });
  }

  await page.goto(`${baseUrl}/booking`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('.project-card', { timeout: 10000 });
  const firstProject = page.locator('.project-card').first();
  assert((await firstProject.count()) > 0, '/booking 未找到项目卡片');
  await firstProject.click();
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const detailText = await page.locator('body').innerText({ timeout: 5000 });
  assert(detailText.includes('项目详情'), '项目详情页未渲染标题');
  assert(detailText.includes('立即预约'), '项目详情页缺少预约入口');
  checked.push({ path: new URL(page.url()).pathname, sample: detailText.slice(0, 120).replace(/\s+/g, ' ') });

  assert(errors.length === 0, `浏览器运行时错误：${errors.join(' | ')}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        viewport,
        checked,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
