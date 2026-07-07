import { chromium } from 'playwright';

const allowWrites = process.env.AMI_GLOW_H5_ALLOW_WRITES === '1';
const baseUrl = process.env.AMI_GLOW_H5_URL || 'http://127.0.0.1:5178';
const storeId = process.env.AMI_GLOW_H5_STORE_ID;
const projectId = process.env.AMI_GLOW_H5_PROJECT_ID;
const phone = process.env.AMI_GLOW_H5_PHONE;
const name = process.env.AMI_GLOW_H5_NAME || 'H5 真实联调客户';
const campaignId = process.env.AMI_GLOW_H5_CAMPAIGN_ID || 'real-write-check';
const staffId = process.env.AMI_GLOW_H5_STAFF_ID;
const viewport = { width: 390, height: 844 };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (!allowWrites) {
  throw new Error('真实写库验收已被门禁拦截：请先明确授权，并设置 AMI_GLOW_H5_ALLOW_WRITES=1');
}

for (const [key, value] of Object.entries({
  AMI_GLOW_H5_STORE_ID: storeId,
  AMI_GLOW_H5_PROJECT_ID: projectId,
  AMI_GLOW_H5_PHONE: phone,
})) {
  assert(value, `缺少真实写库验收参数：${key}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport });
const errors = [];

page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  const params = new URLSearchParams({
    storeId,
    campaignId,
    ...(staffId ? { staffId } : {}),
  });
  await page.goto(`${baseUrl}/projects/${projectId}?${params.toString()}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.getByRole('button', { name: '立即预约' }).click();
  await page.getByRole('textbox', { name: '手机号' }).fill(phone);
  await page.getByRole('textbox', { name: '姓名' }).fill(name);
  await page.getByLabel(/同意门店使用手机号/).check();
  await page.getByRole('button', { name: '确认绑定' }).click();
  await page.waitForSelector('.reservation-panel', { timeout: 15000 });

  const firstAvailableSlot = page.locator('.slot-grid button:not([disabled])').first();
  await firstAvailableSlot.waitFor({ state: 'visible', timeout: 15000 });
  assert((await firstAvailableSlot.count()) > 0, '没有可预约时段，无法完成真实预约写库验收');
  const selectedSlot = (await firstAvailableSlot.innerText()).trim();
  await firstAvailableSlot.click();
  await page.getByRole('button', { name: '确认预约' }).click();
  await page.waitForURL('**/mine/reservations', { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 });
  const token = await page.evaluate(() => window.localStorage.getItem('ami_glow_h5_token'));
  assert(token, '预约成功后未找到 H5 登录态 token，无法回查我的预约');
  const reservationsResponse = await page.request.get(`${baseUrl}/api/customer-app/me/reservations?page=1&pageSize=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(reservationsResponse.ok(), `我的预约接口回查失败：${reservationsResponse.status()}`);
  const reservations = await reservationsResponse.json();
  const createdReservation = reservations.items?.find(
    (item) => Number(item.projectId) === Number(projectId) && item.startTime === selectedSlot,
  );

  assert(createdReservation, `我的预约接口未返回刚选择的时段：${selectedSlot}`);
  assert(errors.length === 0, `浏览器运行时错误：${errors.join(' | ')}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        storeId: Number(storeId),
        projectId: Number(projectId),
        phone,
        selectedSlot,
        reservationId: createdReservation.id,
        expectedAdminSource: 'Ami Glow H5',
        nextManualChecks: ['管理端项目预约列表来源列显示 Ami Glow H5', '管理端 CustomerAppEvent 可按 source=ami_glow_h5 查到事件'],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
