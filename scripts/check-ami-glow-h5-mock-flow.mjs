import { chromium } from 'playwright';

const baseUrl = process.env.AMI_GLOW_H5_URL || 'http://127.0.0.1:5178';
const viewport = { width: 390, height: 844 };

const store = {
  id: 9001,
  name: 'Ami Glow H5 Mock 门店',
  city: '杭州',
  address: '西湖区 Mock 路 18 号',
  phone: '13800000000',
};

const project = {
  id: 9101,
  storeId: store.id,
  name: 'H5 深层补水护理',
  description: '用于 H5 mock 全流程验收的护理项目。',
  price: 298,
  memberPrice: 238,
  duration: 60,
  typeName: '基础面部护理',
  tags: ['补水', '舒缓'],
  canBook: true,
  store,
  details: {
    description: '补水、清洁、舒缓一体护理。',
    serviceFlow: ['顾问沟通', '皮肤状态确认', '项目护理', '护理建议'],
    suitableFor: ['干燥缺水', '日常养护'],
    notices: ['如有过敏史请提前告知美容师'],
  },
  promotions: [
    {
      id: 9201,
      name: 'H5 首护体验礼',
      discountText: '到店立减 50 元',
      validDays: 14,
    },
  ],
};

const customer = {
  id: 9301,
  storeId: store.id,
  name: 'H5 测试客户',
  phone: '13800000001',
  memberLevel: '普通会员',
  store,
};

const reservation = {
  id: 9401,
  storeId: store.id,
  storeName: store.name,
  projectId: project.id,
  projectName: project.name,
  beauticianId: 9501,
  beauticianName: 'Ami 美容师',
  date: '2026-07-06T00:00:00.000Z',
  startTime: '10:00',
  endTime: '11:00',
  status: 'pending',
};

const skinReport = {
  id: 9601,
  skinType: '混合偏干',
  skinStatus: '轻度缺水',
  mainProblems: 'T 区轻微出油，脸颊缺水。',
  overallScore: 82,
  advice: '建议先做补水舒缓护理，再观察屏障状态。',
  explanation: '当前照片显示肤况整体稳定，重点补水和规律护理。',
  recommendationText: '推荐深层补水护理。',
  isFallback: false,
  createdAt: '2026-07-04T04:00:00.000Z',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function json(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

function paginated(items) {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

const posted = {
  auth: 0,
  bindPhone: undefined,
  reservation: undefined,
  skinAnalyze: undefined,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport });
const errors = [];

page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.route('**/api/customer-app/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/api', '');
  const method = request.method();

  if (path === '/customer-app/events') return route.fulfill({ status: 204, body: '' });

  if (path === '/customer-app/auth/h5-guest' && method === 'POST') {
    posted.auth += 1;
    return json(route, { token: 'mock-guest-token', openid: 'h5_mock_openid', bindStatus: 'unbound', customer: null });
  }

  if (path === '/customer-app/auth/bind-phone' && method === 'POST') {
    posted.bindPhone = JSON.parse(request.postData() || '{}');
    return json(route, { token: 'mock-bound-token', openid: 'h5_mock_openid', bindStatus: 'bound', customer });
  }

  if (path === '/customer-app/me') return json(route, customer);

  if (path === '/customer-app/home') {
    return json(route, {
      store,
      banners: [
        {
          id: 'mock-banner-1',
          title: 'H5 首护体验礼',
          subtitle: '在线预约后到店确认方案。',
          targetType: 'project',
          targetId: project.id,
          tag: '推荐',
        },
      ],
      recommendedProjects: [project],
      recommendedPromotions: project.promotions,
      recommendedProducts: [],
      recommendedCards: [],
    });
  }

  if (path === '/customer-app/projects') return json(route, paginated([project]));
  if (path === `/customer-app/projects/${project.id}`) return json(route, project);
  if (path === `/customer-app/projects/${project.id}/available-beauticians`) {
    return json(route, [{ id: 9501, name: 'Ami 美容师', levelName: '高级美容师', certified: true }]);
  }
  if (path === '/customer-app/reservations/availability') {
    return json(route, {
      slots: [
        { startTime: '10:00', endTime: '11:00', available: true },
        { startTime: '11:00', endTime: '12:00', available: false, reason: '该时段已约满' },
      ],
    });
  }
  if (path === '/customer-app/reservations' && method === 'POST') {
    posted.reservation = JSON.parse(request.postData() || '{}');
    return json(route, reservation);
  }
  if (path === '/customer-app/me/reservations') return json(route, paginated([reservation]));
  if (path === '/customer-app/me/cards') {
    return json(route, [{ id: 9701, cardName: '补水护理 5 次卡', remainingTimes: 3, validUntil: '2026-12-31' }]);
  }
  if (path === '/customer-app/me/consumption-records') {
    return json(route, paginated([{ id: 9801, projectName: project.name, amount: 238, createdAt: '2026-07-01T10:00:00.000Z' }]));
  }
  if (path === '/customer-app/me/member-card') {
    return json(route, { customerName: customer.name, memberLevel: customer.memberLevel, balance: 520, benefits: '享受会员护理价' });
  }
  if (path === '/customer-app/skin-tests/analyze' && method === 'POST') {
    posted.skinAnalyze = JSON.parse(request.postData() || '{}');
    return json(route, skinReport);
  }
  if (path === `/customer-app/skin-tests/${skinReport.id}`) return json(route, skinReport);
  if (path === `/customer-app/skin-tests/${skinReport.id}/recommendations`) return json(route, [project]);
  if (path === `/customer-app/promotions/${project.promotions[0].id}/claim`) return json(route, { success: true, promotion: project.promotions[0] });

  return json(route, { message: `未 mock 的接口：${method} ${path}` }, 404);
});

try {
  await page.goto(`${baseUrl}/projects/${project.id}?storeId=${store.id}&campaignId=mock-campaign&promotionId=${project.promotions[0].id}&staffId=9901`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.getByRole('button', { name: '立即预约' }).click();
  await page.getByRole('textbox', { name: '手机号' }).fill(customer.phone);
  await page.getByRole('textbox', { name: '姓名' }).fill(customer.name);
  await page.getByLabel(/同意门店使用手机号/).check();
  await page.getByRole('button', { name: '确认绑定' }).click();
  await page.waitForSelector('.reservation-panel', { timeout: 10000 });
  await page.getByRole('button', { name: 'Ami 美容师' }).click();
  await page.getByRole('button', { name: '10:00' }).click();
  await page.getByRole('button', { name: '确认预约' }).click();
  await page.waitForURL('**/mine/reservations', { timeout: 10000 });
  await page.waitForTimeout(1000);
  const reservationText = await page.locator('body').innerText();
  assert(reservationText.includes(project.name), `我的预约页未展示 mock 预约项目，页面文本：${reservationText.slice(0, 300)}`);
  assert(posted.auth === 1, '未调用 H5 guest 登录');
  assert(posted.bindPhone?.phone === customer.phone, '手机号绑定 payload 不正确');
  assert(posted.reservation?.projectId === project.id, '预约 payload 未包含项目 ID');
  assert(posted.reservation?.startTime === '10:00', '预约 payload 未包含选择时段');
  assert(posted.reservation?.source === 'ami_glow_h5', '预约 payload 未包含 H5 source');
  assert(posted.reservation?.campaignId === 'mock-campaign', '预约 payload 未包含 campaignId');
  assert(posted.reservation?.promotionId === project.promotions[0].id, '预约 payload 未包含 promotionId');
  assert(posted.reservation?.staffId === 9901, '预约 payload 未包含 staffId');

  await page.goto(`${baseUrl}/mine/cards`, { waitUntil: 'networkidle', timeout: 15000 });
  assert((await page.locator('body').innerText()).includes('补水护理 5 次卡'), '我的次卡未渲染 mock 数据');
  await page.goto(`${baseUrl}/mine/consumption-records`, { waitUntil: 'networkidle', timeout: 15000 });
  assert((await page.locator('body').innerText()).includes('消费记录'), '消费记录页未渲染');
  await page.goto(`${baseUrl}/mine/member-card`, { waitUntil: 'networkidle', timeout: 15000 });
  assert((await page.locator('body').innerText()).includes('享受会员护理价'), '会员卡页未渲染 mock 权益');

  await page.goto(`${baseUrl}/skin-test`, { waitUntil: 'networkidle', timeout: 15000 });
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  await page.locator('input[type="file"]').setInputFiles({ name: 'skin.png', mimeType: 'image/png', buffer: png1x1 });
  await page.getByLabel(/我确认测肤结果/).check();
  await page.getByRole('button', { name: '生成测肤报告' }).click();
  await page.waitForURL(`**/skin-reports/${skinReport.id}`, { timeout: 10000 });
  await page.waitForTimeout(1000);
  const reportText = await page.locator('body').innerText();
  assert(reportText.includes('混合偏干'), `测肤报告未展示肤质，页面文本：${reportText.slice(0, 300)}`);
  assert(reportText.includes(project.name), '测肤报告未展示推荐项目');
  assert(typeof posted.skinAnalyze?.imageDataUrl === 'string' && posted.skinAnalyze.imageDataUrl.startsWith('data:image/'), '测肤 payload 未包含图片 dataURL');
  assert(errors.length === 0, `浏览器运行时错误：${errors.join(' | ')}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        viewport,
        checked: ['bind-phone', 'reservation-submit', 'my-services', 'skin-test-report'],
        posted: {
          bindPhone: posted.bindPhone,
          reservation: posted.reservation,
          skinAnalyzeBytes: posted.skinAnalyze?.imageDataUrl?.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
