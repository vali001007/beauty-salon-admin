import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import {
  MarketingStrategyStatus,
  PrismaClient,
  ServiceTaskStatus,
  TerminalDeviceStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { readSeedPassword } from './seed-env.ts';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const yes = args.has('--yes');
const dryRun = args.has('--dry-run') || !apply;
if (apply && !yes) {
  throw new Error('真实写入必须显式传入 --apply --yes');
}

function readArg(name: string, fallback: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const STORE_NAME = readArg('--store-name', 'Ami 全量演示门店');
const PREFIX = 'AMI-DEMO-FULL';
const USER_PREFIX = 'ami_demo_full';
const RANDOM_SEED = readArg('--seed', 'ami-demo-full-2026-06-01');
const BASE_DATE = new Date(readArg('--base-date', '2026-06-01T10:00:00+08:00'));
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const PUBLIC_ASSET_ROOT = resolve(REPO_ROOT, 'public', 'demo-assets', 'ami-demo-full');
const REPORT_PATH = resolve(REPO_ROOT, 'docs', '04-测试数据', 'Ami全量演示门店数据写入报告.md');
const ASSET_REPORT_PATH = resolve(REPO_ROOT, 'docs', '04-测试数据', 'Ami全量演示门店图片资产清单.md');
const ASSET_MANIFEST_PATH = resolve(PUBLIC_ASSET_ROOT, 'asset-manifest.json');

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

type CountKey =
  | 'stores'
  | 'users'
  | 'customers'
  | 'consumptionRecords'
  | 'healthProfiles'
  | 'products'
  | 'stockBatches'
  | 'stockMovements'
  | 'purchaseOrders'
  | 'transferOrders'
  | 'projects'
  | 'projectBomItems'
  | 'beauticians'
  | 'schedules'
  | 'reservations'
  | 'terminalDevices'
  | 'serviceTasks'
  | 'skinTests'
  | 'cards'
  | 'customerCards'
  | 'cardUsageRecords'
  | 'balanceAccounts'
  | 'balanceTransactions'
  | 'productOrders'
  | 'orderItems'
  | 'paymentRecords'
  | 'refundRecords'
  | 'promotions'
  | 'printJobs'
  | 'predictionRuns'
  | 'predictionSnapshots'
  | 'marketingStrategies'
  | 'marketingExecutions'
  | 'marketingTouches'
  | 'marketingAttributions'
  | 'recommendationEvents'
  | 'imageAssets';

type Report = {
  mode: 'dry-run' | 'apply';
  storeName: string;
  prefix: string;
  seed: string;
  beforeCounts: Partial<Record<CountKey, number>>;
  plannedCounts: Partial<Record<CountKey, number>>;
  deletedCounts: Partial<Record<CountKey, number>>;
  createdCounts: Partial<Record<CountKey, number>>;
  afterCounts: Partial<Record<CountKey, number>>;
  warnings: string[];
};

const report: Report = {
  mode: dryRun ? 'dry-run' : 'apply',
  storeName: STORE_NAME,
  prefix: PREFIX,
  seed: RANDOM_SEED,
  beforeCounts: {},
  plannedCounts: {},
  deletedCounts: {},
  createdCounts: {},
  afterCounts: {},
  warnings: [],
};

function inc(bucket: Partial<Record<CountKey, number>>, key: CountKey, by = 1) {
  bucket[key] = (bucket[key] ?? 0) + by;
}

function rngFactory(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rngFactory(RANDOM_SEED);
const rand = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
const pick = <T>(items: T[]) => items[rand(0, items.length - 1)];
function pickN<T>(items: T[], count: number) {
  return [...items].sort(() => random() - 0.5).slice(0, count);
}
function weightedPick<T extends { weight: number; value: string }>(items: T[]) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item.value;
  }
  return items[items.length - 1].value;
}
function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
function daysFromBase(days: number, hour = 10, minute = 0) {
  const date = new Date(BASE_DATE);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}
function dateOnly(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function timeText(date: Date) {
  return date.toTimeString().slice(0, 5);
}

const productCatalog = [
  ['hyaluronic-serum', '玻尿酸保湿精华', '精华', '30ml', '瓶', 168, 298, 45, 730, 'slim frosted serum bottle'],
  ['repair-mask', '舒缓修护面膜', '面膜', '6片/盒', '盒', 86, 168, 60, 365, 'facial sheet mask box'],
  ['amino-cleanser', '氨基酸洁面乳', '洁面', '120ml', '支', 58, 128, 50, 730, 'soft cleanser tube'],
  ['niacinamide-serum', '烟酰胺亮肤精华', '精华', '30ml', '瓶', 188, 368, 35, 730, 'clear brightening serum bottle'],
  ['firming-eye-cream', '抗衰紧致眼霜', '面霜', '15ml', '瓶', 220, 498, 28, 365, 'small premium eye cream jar'],
  ['barrier-lotion', '屏障修护乳', '面霜', '100ml', '瓶', 136, 268, 42, 730, 'minimal moisturizer pump bottle'],
  ['aqua-care-kit', '水氧护理耗材包', '仪器耗材', '10套/盒', '盒', 260, 480, 24, 365, 'beauty device consumable kit box'],
  ['care-towel', '一次性护理巾', '日用消耗品', '100片/包', '包', 32, 68, 90, 1095, 'soft disposable care towel pack'],
  ['collagen-mask', '胶原蛋白面膜', '面膜', '5片/盒', '盒', 112, 228, 55, 365, 'collagen mask box'],
  ['sunscreen-milk', '清透防晒乳', '防晒', '60ml', '支', 92, 198, 45, 365, 'sunscreen squeeze tube'],
  ['neck-cream', '紧致颈霜', '面霜', '50g', '瓶', 138, 298, 32, 730, 'premium neck cream jar'],
  ['body-oil', '舒缓精油', '身体护理', '100ml', '瓶', 96, 198, 40, 730, 'amber essential oil bottle'],
  ['toner', '水润柔肤水', '爽肤水', '150ml', '瓶', 72, 158, 55, 730, 'clear toner bottle'],
  ['repair-ampoule', '屏障安瓶精华', '精华', '7支/盒', '盒', 186, 398, 26, 365, 'ampoule vial set box'],
  ['cleansing-pad', '清洁棉片', '日用消耗品', '80片/盒', '盒', 42, 88, 75, 730, 'round cleansing pad box'],
  ['massage-cream', '舒压按摩膏', '身体护理', '200g', '瓶', 76, 168, 46, 730, 'spa massage cream jar'],
  ['beauty-gel', '仪器导入凝胶', '仪器耗材', '500ml', '瓶', 58, 128, 65, 365, 'beauty device conductive gel bottle'],
  ['hand-mask', '滋养手膜', '手部护理', '6片/盒', '盒', 56, 118, 48, 365, 'hand mask packaging box'],
  ['hair-scalp-serum', '头皮养护精华', '头皮护理', '50ml', '瓶', 118, 258, 36, 730, 'scalp serum dropper bottle'],
  ['aftercare-spray', '术后舒缓喷雾', '修护喷雾', '100ml', '瓶', 82, 178, 44, 365, 'fine mist calming spray bottle'],
].map(([slug, name, category, spec, unit, costPrice, retailPrice, safetyStock, shelfLife, subject], index) => ({
  slug: String(slug),
  name: String(name),
  category: String(category),
  spec: String(spec),
  unit: String(unit),
  costPrice: Number(costPrice),
  retailPrice: Number(retailPrice),
  safetyStock: Number(safetyStock),
  shelfLife: Number(shelfLife),
  subject: String(subject),
  sku: `${PREFIX}-SKU-${String(index + 1).padStart(3, '0')}`,
}));

const projectCatalog = [
  ['hydrating-facial', '深层补水护理', '面部护理', 60, 298, 'hydrating facial care with serum and mask', ['hyaluronic-serum', 'repair-mask', 'care-towel']],
  ['sensitive-repair', '敏感肌舒缓修护', '面部护理', 75, 398, 'calming sensitive skin facial repair', ['repair-mask', 'barrier-lotion', 'repair-ampoule']],
  ['aqua-cleanse', '水氧清洁焕肤', '仪器护理', 60, 368, 'aqua oxygen pore cleansing facial device treatment', ['amino-cleanser', 'aqua-care-kit', 'beauty-gel']],
  ['brightening-care', '亮肤淡斑管理', '面部护理', 90, 588, 'brightening facial care in a spa room', ['niacinamide-serum', 'repair-mask', 'toner']],
  ['firming-anti-aging', '紧致抗衰护理', '面部护理', 100, 688, 'firming anti aging facial massage and skincare', ['firming-eye-cream', 'neck-cream', 'barrier-lotion']],
  ['neck-shoulder', '肩颈舒压养护', '身体护理', 60, 268, 'shoulder and neck relaxation massage in salon', ['body-oil', 'massage-cream', 'care-towel']],
  ['bubble-cleanse', '小气泡清洁护理', '仪器护理', 45, 258, 'small bubble cleansing skincare treatment', ['amino-cleanser', 'beauty-gel', 'aqua-care-kit']],
  ['seasonal-barrier', '季节屏障养护', '面部护理', 70, 428, 'seasonal skin barrier care treatment', ['barrier-lotion', 'repair-mask', 'repair-ampoule']],
  ['collagen-lift', '胶原焕活提拉', '面部护理', 90, 568, 'collagen lifting facial treatment', ['collagen-mask', 'hyaluronic-serum', 'firming-eye-cream']],
  ['sunscreen-repair', '晒后舒缓修护', '面部护理', 60, 328, 'after sun calming facial repair', ['aftercare-spray', 'repair-mask', 'barrier-lotion']],
  ['eye-care', '眼周紧致护理', '局部护理', 50, 298, 'eye area firming care service', ['firming-eye-cream', 'hyaluronic-serum', 'care-towel']],
  ['hand-care', '手部细嫩护理', '手部护理', 45, 188, 'hand care and moisturizing spa service', ['hand-mask', 'barrier-lotion', 'care-towel']],
  ['scalp-care', '头皮舒缓养护', '头皮护理', 60, 338, 'relaxing scalp care in beauty salon', ['hair-scalp-serum', 'care-towel', 'body-oil']],
  ['body-oil-spa', '全身精油 SPA', '身体护理', 100, 598, 'full body essential oil spa service', ['body-oil', 'massage-cream', 'care-towel']],
  ['device-introduction', '精华导入护理', '仪器护理', 75, 458, 'skincare essence infusion device treatment', ['beauty-gel', 'repair-ampoule', 'toner']],
].map(([slug, name, type, duration, price, scene, bom]) => ({
  slug: String(slug),
  name: String(name),
  type: String(type),
  duration: Number(duration),
  price: Number(price),
  scene: String(scene),
  bom: bom as string[],
}));

const cardCatalog = [
  ['补水护理 10 次卡', 10, 2680, ['深层补水护理']],
  ['敏感修护 8 次卡', 8, 2880, ['敏感肌舒缓修护']],
  ['焕肤清洁 12 次卡', 12, 3280, ['小气泡清洁护理', '水氧清洁焕肤']],
  ['抗衰管理 6 次卡', 6, 3680, ['紧致抗衰护理']],
  ['综合养护 20 次卡', 20, 5980, ['深层补水护理', '肩颈舒压养护', '季节屏障养护']],
];

const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗'];
const femaleNames = ['美琳', '雅婷', '诗涵', '欣怡', '梦瑶', '紫萱', '思琪', '佳慧', '晓雯', '婉清', '若兰', '静怡', '雨薇', '芷若', '心怡', '语嫣'];
const maleNames = ['俊杰', '浩然', '子轩', '文博', '天佑', '志强', '建国', '伟明'];
const memberLevels = [
  { value: '无', weight: 15 },
  { value: '普通会员', weight: 35 },
  { value: '银卡会员', weight: 25 },
  { value: '金卡会员', weight: 18 },
  { value: '钻石会员', weight: 7 },
];
const customerSources = [
  { value: '朋友介绍', weight: 30 },
  { value: '门店', weight: 25 },
  { value: '小红书', weight: 15 },
  { value: '抖音', weight: 10 },
  { value: '美团/大众点评', weight: 8 },
  { value: '线上广告', weight: 5 },
  { value: '活动', weight: 4 },
  { value: '其他', weight: 3 },
];
const skinTypes = ['油性', '混油', '混干', '干性', '敏感', '中性'];
const skinProblems = ['T区出油', '毛孔粗大', '闭口粉刺', '黑头', '色斑', '细纹', '法令纹', '皮肤松弛', '敏感泛红', '肤色暗沉'];
const carePlans = ['清痘+消炎修复', '控油+补水平衡', '补水保湿+光子嫩肤', '美白精华导入+面膜', '射频紧致+胶原修复', '热玛吉+修复面膜'];
const payMethods = ['微信支付', '支付宝', '会员余额', '银行卡', '现金'];

function imagePath(kind: 'products' | 'projects', slug: string) {
  return `/demo-assets/ami-demo-full/${kind}/ami-demo-full-${kind === 'products' ? 'product' : 'project'}-${slug}.png`;
}

function imageDiskPath(kind: 'products' | 'projects', slug: string) {
  return resolve(PUBLIC_ASSET_ROOT, kind, `ami-demo-full-${kind === 'products' ? 'product' : 'project'}-${slug}.png`);
}

function productPrompt(product: (typeof productCatalog)[number]) {
  return [
    'Use case: product-mockup',
    'Asset type: product catalog image for a beauty salon admin system',
    `Primary request: create a clean product photo for "${product.name}"`,
    `Subject: ${product.subject}`,
    'Style/medium: premium ecommerce product photography',
    'Composition/framing: centered square composition, full product visible, generous padding',
    'Lighting/mood: soft studio lighting, clean professional beauty brand feel',
    'Color palette: warm white, soft champagne, muted pastel accents',
    'Materials/textures: realistic cosmetic packaging texture',
    'Constraints: no readable brand logo, no watermark, no promotional text, no medical claims',
    'Avoid: distorted packaging, extra products, hands, faces, cluttered background',
  ].join('\n');
}

function projectPrompt(project: (typeof projectCatalog)[number]) {
  return [
    'Use case: photorealistic-natural',
    'Asset type: beauty service project image for a salon admin system',
    `Primary request: create a realistic beauty salon service scene for "${project.name}"`,
    'Scene/backdrop: clean modern beauty salon treatment room',
    `Subject: ${project.scene}`,
    'Style/medium: photorealistic editorial service photography',
    'Composition/framing: horizontal composition, service action visible, no identifiable face',
    'Lighting/mood: soft natural spa lighting, professional and hygienic',
    'Color palette: warm white, muted rose, light wood, clean neutral tones',
    'Constraints: no readable text, no watermark, avoid identifiable faces, no invasive medical procedure',
    'Avoid: hospital surgery feel, exaggerated before-after results, messy tools, dark atmosphere',
  ].join('\n');
}

function buildAssetEntries() {
  const products = productCatalog.map((product) => ({
    kind: 'product',
    slug: product.slug,
    name: product.name,
    path: imagePath('products', product.slug),
    diskPath: imageDiskPath('products', product.slug),
    prompt: productPrompt(product),
  }));
  const projects = projectCatalog.map((project) => ({
    kind: 'project',
    slug: project.slug,
    name: project.name,
    path: imagePath('projects', project.slug),
    diskPath: imageDiskPath('projects', project.slug),
    prompt: projectPrompt(project),
  }));
  return [...products, ...projects];
}

function ensureAssetReports() {
  mkdirSync(resolve(PUBLIC_ASSET_ROOT, 'products'), { recursive: true });
  mkdirSync(resolve(PUBLIC_ASSET_ROOT, 'projects'), { recursive: true });
  mkdirSync(resolve(REPO_ROOT, 'docs', '04-测试数据'), { recursive: true });

  const entries = buildAssetEntries().map((entry) => ({
    kind: entry.kind,
    slug: entry.slug,
    name: entry.name,
    path: entry.path,
    exists: existsSync(entry.diskPath),
    prompt: entry.prompt,
  }));
  const missing = entries.filter((entry) => !entry.exists);
  if (missing.length) {
    report.warnings.push(`图片生成工具当前不可用，${missing.length} 个图片文件尚未生成；manifest 已写入待生成提示词。`);
  }

  writeFileSync(
    ASSET_MANIFEST_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), storeName: STORE_NAME, prefix: PREFIX, entries }, null, 2)}\n`,
    'utf8',
  );

  const lines = [
    '# Ami 全量演示门店图片资产清单',
    '',
    `生成时间：${new Date().toISOString()}`,
    `门店：${STORE_NAME}`,
    `资产总数：${entries.length}`,
    `缺图数量：${missing.length}`,
    '',
    '| 类型 | 名称 | 路径 | 状态 |',
    '| --- | --- | --- | --- |',
    ...entries.map((entry) => `| ${entry.kind} | ${entry.name} | \`${entry.path}\` | ${entry.exists ? 'ready' : 'pending-imagegen'} |`),
    '',
    '## Prompts',
    '',
    ...entries.flatMap((entry) => [`### ${entry.name}`, '', '```text', entry.prompt, '```', '']),
  ];
  writeFileSync(ASSET_REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  inc(report.createdCounts, 'imageAssets', entries.filter((entry) => entry.exists).length);
}

async function countCurrentStoreData(storeId?: number | null) {
  const counts: Partial<Record<CountKey, number>> = { imageAssets: buildAssetEntries().filter((entry) => existsSync(entry.diskPath)).length };
  if (!storeId) return counts;
  const customers = await prisma.customer.findMany({ where: { storeId }, select: { id: true } });
  const customerIds = customers.map((customer) => customer.id);
  const products = await prisma.product.findMany({ where: { storeId }, select: { id: true } });
  const productIds = products.map((product) => product.id);
  const projects = await prisma.project.findMany({ where: { storeId }, select: { id: true } });
  const projectIds = projects.map((project) => project.id);
  const tasks = await prisma.serviceTask.findMany({ where: { storeId }, select: { id: true } });
  const taskIds = tasks.map((task) => task.id);
  const orders = await prisma.productOrder.findMany({ where: { storeId }, select: { id: true } });
  const orderIds = orders.map((order) => order.id);

  return {
    ...counts,
    stores: 1,
    users: await prisma.user.count({ where: { username: { startsWith: USER_PREFIX } } }),
    customers: customerIds.length,
    consumptionRecords: customerIds.length ? await prisma.consumptionRecord.count({ where: { customerId: { in: customerIds } } }) : 0,
    healthProfiles: customerIds.length ? await prisma.customerHealthProfile.count({ where: { customerId: { in: customerIds } } }) : 0,
    products: productIds.length,
    stockBatches: productIds.length ? await prisma.stockBatch.count({ where: { productId: { in: productIds } } }) : 0,
    stockMovements: await prisma.stockMovement.count({ where: { storeId } }),
    purchaseOrders: await prisma.purchaseOrder.count({ where: { orderNo: { startsWith: PREFIX } } }),
    transferOrders: await prisma.transferOrder.count({ where: { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] } }),
    projects: projectIds.length,
    projectBomItems: projectIds.length ? await prisma.projectBomItem.count({ where: { projectId: { in: projectIds } } }) : 0,
    beauticians: await prisma.beautician.count({ where: { storeId } }),
    schedules: await prisma.schedule.count({ where: { storeId } }),
    reservations: await prisma.reservation.count({ where: { storeId } }),
    terminalDevices: await prisma.terminalDevice.count({ where: { storeId } }),
    serviceTasks: taskIds.length,
    skinTests: await prisma.skinTest.count({ where: { OR: [{ customerId: { in: customerIds } }, { taskId: { in: taskIds } }] } }),
    cards: await prisma.card.count({ where: { description: { startsWith: PREFIX } } }),
    customerCards: customerIds.length ? await prisma.customerCard.count({ where: { customerId: { in: customerIds } } }) : 0,
    cardUsageRecords: customerIds.length ? await prisma.cardUsageRecord.count({ where: { customerId: { in: customerIds } } }) : 0,
    balanceAccounts: await prisma.customerBalanceAccount.count({ where: { storeId } }),
    balanceTransactions: await prisma.customerBalanceTransaction.count({ where: { storeId } }),
    productOrders: orderIds.length,
    orderItems: orderIds.length ? await prisma.orderItem.count({ where: { orderId: { in: orderIds } } }) : 0,
    paymentRecords: orderIds.length ? await prisma.paymentRecord.count({ where: { orderId: { in: orderIds } } }) : 0,
    refundRecords: orderIds.length ? await prisma.refundRecord.count({ where: { orderId: { in: orderIds } } }) : 0,
    promotions: await prisma.promotion.count({ where: { storeId } }),
    printJobs: await prisma.printJob.count({ where: { storeId } }),
    predictionRuns: await prisma.predictionRun.count({ where: { storeId } }),
    predictionSnapshots: await prisma.customerPredictionSnapshot.count({ where: { storeId } }),
    marketingStrategies: await prisma.marketingAutomationStrategy.count({ where: { description: { startsWith: PREFIX } } }),
    marketingExecutions: await prisma.marketingAutomationExecution.count({ where: { strategy: { description: { startsWith: PREFIX } } } }),
    marketingTouches: customerIds.length ? await prisma.marketingAutomationTouch.count({ where: { customerId: { in: customerIds } } }) : 0,
    marketingAttributions: customerIds.length ? await prisma.marketingAttribution.count({ where: { customerId: { in: customerIds } } }) : 0,
    recommendationEvents: await prisma.recommendationEvent.count({ where: { storeId } }),
  };
}

function plannedCounts(): Partial<Record<CountKey, number>> {
  return {
    stores: 1,
    users: 8,
    customers: 1240,
    consumptionRecords: 5300,
    healthProfiles: 740,
    products: productCatalog.length,
    stockBatches: productCatalog.length * 2,
    stockMovements: 120,
    purchaseOrders: 4,
    transferOrders: 1,
    projects: projectCatalog.length,
    projectBomItems: projectCatalog.reduce((sum, project) => sum + project.bom.length, 0),
    beauticians: 12,
    schedules: 168,
    reservations: 360,
    terminalDevices: 3,
    serviceTasks: 220,
    skinTests: 180,
    cards: cardCatalog.length,
    customerCards: 320,
    cardUsageRecords: 180,
    balanceAccounts: 320,
    balanceTransactions: 420,
    productOrders: 400,
    orderItems: 520,
    paymentRecords: 400,
    refundRecords: 36,
    promotions: 5,
    printJobs: 60,
    predictionRuns: 1,
    predictionSnapshots: 1240,
    marketingStrategies: 3,
    marketingExecutions: 6,
    marketingTouches: 300,
    marketingAttributions: 80,
    recommendationEvents: 220,
    imageAssets: 35,
  };
}

async function findTargetStore() {
  return prisma.store.findFirst({ where: { name: STORE_NAME, deletedAt: null } });
}

async function refreshStoreData(storeId: number) {
  const before = await countCurrentStoreData(storeId);
  report.deletedCounts = before;

  const customers = await prisma.customer.findMany({ where: { storeId }, select: { id: true } });
  const customerIds = customers.map((customer) => customer.id);
  const products = await prisma.product.findMany({ where: { storeId }, select: { id: true } });
  const productIds = products.map((product) => product.id);
  const projects = await prisma.project.findMany({ where: { storeId }, select: { id: true } });
  const projectIds = projects.map((project) => project.id);
  const tasks = await prisma.serviceTask.findMany({ where: { storeId }, select: { id: true } });
  const taskIds = tasks.map((task) => task.id);
  const orders = await prisma.productOrder.findMany({ where: { storeId }, select: { id: true } });
  const orderIds = orders.map((order) => order.id);

  await prisma.marketingAttribution.deleteMany({ where: { OR: [{ customerId: { in: customerIds } }, { orderId: { in: orderIds } }] } });
  await prisma.marketingAutomationTouch.deleteMany({ where: { customerId: { in: customerIds } } });
  const executions = await prisma.marketingAutomationExecution.findMany({
    where: { strategy: { description: { startsWith: PREFIX } } },
    select: { id: true },
  });
  await prisma.marketingAutomationExecution.deleteMany({ where: { id: { in: executions.map((item) => item.id) } } });
  await prisma.marketingAutomationStrategy.deleteMany({ where: { description: { startsWith: PREFIX } } });
  await prisma.customerPredictionSnapshot.deleteMany({ where: { storeId } });
  await prisma.predictionRun.deleteMany({ where: { storeId } });
  await prisma.recommendationEvent.deleteMany({ where: { storeId } });
  await prisma.printJob.deleteMany({ where: { storeId } });
  await prisma.promotion.deleteMany({ where: { storeId } });
  await prisma.refundRecord.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.paymentRecord.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.productOrder.deleteMany({ where: { storeId } });
  await prisma.customerBalanceTransaction.deleteMany({ where: { storeId } });
  await prisma.customerBalanceAccount.deleteMany({ where: { storeId } });
  await prisma.cardUsageRecord.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customerCard.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.card.deleteMany({ where: { description: { startsWith: PREFIX } } });
  await prisma.skinTest.deleteMany({ where: { OR: [{ customerId: { in: customerIds } }, { taskId: { in: taskIds } }] } });
  await prisma.serviceTask.deleteMany({ where: { storeId } });
  await prisma.terminalDevice.deleteMany({ where: { storeId } });
  await prisma.reservation.deleteMany({ where: { storeId } });
  await prisma.schedule.deleteMany({ where: { storeId } });
  await prisma.beautician.deleteMany({ where: { storeId } });
  await prisma.projectBomItem.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { productId: { in: productIds } }] } });
  await prisma.project.deleteMany({ where: { storeId } });
  await prisma.stockMovement.deleteMany({ where: { storeId } });
  await prisma.stockBatch.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.transferOrder.deleteMany({ where: { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }, { orderNo: { startsWith: PREFIX } }] } });
  await prisma.purchaseOrder.deleteMany({ where: { orderNo: { startsWith: PREFIX } } });
  await prisma.customerHealthProfile.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.consumptionRecord.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customer.deleteMany({ where: { storeId } });
  await prisma.user.deleteMany({ where: { username: { startsWith: USER_PREFIX } } });
}

async function ensureStore() {
  const existing = await findTargetStore();
  if (existing) {
    return prisma.store.update({
      where: { id: existing.id },
      data: {
        city: '杭州市',
        address: '西湖区未来科技美业中心 18 号',
        phone: '0571-88008888',
        status: 'active',
      },
    });
  }
  inc(report.createdCounts, 'stores');
  return prisma.store.create({
    data: {
      name: STORE_NAME,
      city: '杭州市',
      address: '西湖区未来科技美业中心 18 号',
      phone: '0571-88008888',
      status: 'active',
    },
  });
}

async function ensureAdminAccess(storeId: number) {
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) {
    report.warnings.push('未找到 admin 用户，已跳过 admin 门店授权。');
    return;
  }
  await prisma.userStore.upsert({
    where: { userId_storeId: { userId: admin.id, storeId } },
    update: {},
    create: { userId: admin.id, storeId },
  });
}

async function ensureRole(key: string, name: string, permissions: string[]) {
  return prisma.role.upsert({
    where: { key },
    update: {},
    create: {
      key,
      name,
      description: `${PREFIX} 演示角色`,
      isSystem: false,
      permissions,
      platformScopes: { core: true, terminal: true, assist: true },
      dataScopes: { store: 'own_store' },
    },
  });
}

async function ensureBaseDictionaries() {
  const categoryRoot = await upsertCategory('Ami 全量演示商品');
  const categoryIds = new Map<string, number>();
  for (const name of Array.from(new Set(productCatalog.map((product) => product.category)))) {
    const category = await upsertCategory(name, categoryRoot.id);
    categoryIds.set(name, category.id);
  }
  const typeIds = new Map<string, number>();
  for (const type of Array.from(new Set(projectCatalog.map((project) => project.type)))) {
    const projectType = await prisma.projectType.findFirst({ where: { name: type } });
    const result =
      projectType ??
      (await prisma.projectType.create({
        data: { name: type, description: `${PREFIX} 演示项目分类`, status: 'active' },
      }));
    typeIds.set(type, result.id);
  }
  const levels = [];
  for (const [index, name] of ['初级美容师', '中级美容师', '高级美容师', '明星顾问'].entries()) {
    const existing = await prisma.beauticianLevel.findFirst({ where: { name } });
    levels.push(existing ?? (await prisma.beauticianLevel.create({ data: { name, description: `${PREFIX} 等级`, sortOrder: index + 1 } })));
  }
  return { categoryIds, typeIds, levels };
}

async function upsertCategory(name: string, parentId?: number) {
  const existing = await prisma.category.findFirst({ where: { name, parentId: parentId ?? null } });
  if (existing) return existing;
  return prisma.category.create({ data: { name, parentId: parentId ?? null } });
}

async function seedUsersAndBeauticians(storeId: number, levelIds: number[]) {
  const managerRole = await ensureRole(`${USER_PREFIX}_manager`, 'Ami 演示店长', ['*']);
  const cashierRole = await ensureRole(`${USER_PREFIX}_cashier`, 'Ami 演示收银员', ['core:order:create', 'core:order:products', 'core:order:projects', 'core:goods:cards']);
  const beauticianRole = await ensureRole(`${USER_PREFIX}_beautician`, 'Ami 演示美容师', ['core:store:reservations', 'terminal:service:start', 'terminal:service:complete']);
  const passwordHash = await bcrypt.hash(readSeedPassword('DEMO_USER_DEFAULT_PASSWORD'), 12);
  const users = [
    [`${USER_PREFIX}_manager`, '林店长', managerRole.id],
    [`${USER_PREFIX}_cashier`, '许收银', cashierRole.id],
    [`${USER_PREFIX}_consultant`, '周顾问', managerRole.id],
    [`${USER_PREFIX}_frontdesk`, '陈前台', cashierRole.id],
    [`${USER_PREFIX}_beautician_01`, '沈晴', beauticianRole.id],
    [`${USER_PREFIX}_beautician_02`, '唐伊', beauticianRole.id],
    [`${USER_PREFIX}_beautician_03`, '顾然', beauticianRole.id],
    [`${USER_PREFIX}_beautician_04`, '宋乔', beauticianRole.id],
  ];
  const userByName = new Map<string, number>();
  for (const [username, name, roleId] of users) {
    const user = await prisma.user.create({
      data: {
        username: String(username),
        passwordHash,
        name: String(name),
        phone: `13988${String(rand(100000, 999999))}`,
        roles: { create: [{ roleId: Number(roleId) }] },
        stores: { create: [{ storeId }] },
      },
    });
    userByName.set(String(name), user.id);
    inc(report.createdCounts, 'users');
  }

  const names = ['沈晴', '唐伊', '顾然', '宋乔', '韩雨', '林雅', '周宁', '赵悦', '王璐', '刘敏', '许诺', '何佳'];
  const beauticians = [];
  for (const [index, name] of names.entries()) {
    const beautician = await prisma.beautician.create({
      data: {
        storeId,
        name,
        phone: `13866${String(index + 1).padStart(2, '0')}${String(rand(1000, 9999))}`,
        levelId: levelIds[index % levelIds.length],
        status: 'active',
        userId: userByName.get(name),
      },
    });
    beauticians.push(beautician);
    inc(report.createdCounts, 'beauticians');
  }
  return beauticians;
}

async function seedProducts(storeId: number, categoryIds: Map<string, number>) {
  const products = new Map<string, any>();
  for (const [index, product] of productCatalog.entries()) {
    const currentStock = product.safetyStock + 45 + (index % 5) * 8;
    const created = await prisma.product.create({
      data: {
        storeId,
        categoryId: categoryIds.get(product.category),
        sku: product.sku,
        name: product.name,
        brand: 'Ami Lab',
        spec: product.spec,
        unit: product.unit,
        costPrice: product.costPrice,
        retailPrice: product.retailPrice,
        shelfLife: product.shelfLife,
        supplier: 'Ami 官方演示供应链',
        minPurchaseQty: Math.max(5, Math.round(product.safetyStock / 3)),
        image: imagePath('products', product.slug),
        currentStock,
        safetyStock: product.safetyStock,
        status: 'active',
      } as any,
    });
    products.set(product.slug, created);
    inc(report.createdCounts, 'products');
    for (let batchIndex = 0; batchIndex < 2; batchIndex++) {
      const batch = await prisma.stockBatch.create({
        data: {
          productId: created.id,
          batchNo: `${PREFIX}-BATCH-${String(index + 1).padStart(3, '0')}-${batchIndex + 1}`,
          stock: batchIndex === 0 ? Math.round(currentStock * 0.6) : Math.round(currentStock * 0.4),
          productionDate: daysFromBase(-120 - index * 3),
          expiryDate: daysFromBase(batchIndex === 0 && index % 6 === 0 ? 28 : 240 + index * 5),
        },
      });
      inc(report.createdCounts, 'stockBatches');
      await prisma.stockMovement.create({
        data: {
          storeId,
          productId: created.id,
          batchId: batch.id,
          movementNo: `${PREFIX}-SM-IN-${String(index + 1).padStart(3, '0')}-${batchIndex + 1}`,
          movementType: 'inbound',
          quantity: batch.stock,
          beforeStock: 0,
          afterStock: batch.stock,
          unit: product.unit,
          sourceType: 'seed_batch',
          sourceNo: batch.batchNo,
          remark: `${PREFIX} 期初入库`,
          occurredAt: daysFromBase(-90 + batchIndex),
        },
      });
      inc(report.createdCounts, 'stockMovements');
    }
    for (let movementIndex = 0; movementIndex < 4; movementIndex++) {
      await prisma.stockMovement.create({
        data: {
          storeId,
          productId: created.id,
          movementNo: `${PREFIX}-SM-ADJ-${String(index + 1).padStart(3, '0')}-${movementIndex + 1}`,
          movementType: movementIndex % 2 === 0 ? 'service_consumption' : 'stock_adjustment',
          quantity: movementIndex % 2 === 0 ? -rand(1, 4) : rand(1, 3),
          beforeStock: currentStock,
          afterStock: currentStock - movementIndex,
          unit: product.unit,
          sourceType: 'seed_demo',
          sourceNo: `${PREFIX}-ADJ-${String(index + 1).padStart(3, '0')}-${movementIndex + 1}`,
          remark: `${PREFIX} 演示库存流水`,
          occurredAt: daysFromBase(-rand(1, 45)),
        },
      });
      inc(report.createdCounts, 'stockMovements');
    }
  }
  for (let i = 0; i < 4; i++) {
    await prisma.purchaseOrder.create({
      data: {
        orderNo: `${PREFIX}-PUR-${String(i + 1).padStart(3, '0')}`,
        supplier: 'Ami 官方演示供应链',
        totalAmount: 18000 + i * 4200,
        status: i === 0 ? 'pending' : 'approved',
        items: productCatalog.slice(i * 5, i * 5 + 5).map((product) => ({
          sku: product.sku,
          name: product.name,
          quantity: 20 + i * 3,
          unitPrice: product.costPrice,
        })),
      },
    });
    inc(report.createdCounts, 'purchaseOrders');
  }
  await prisma.transferOrder.create({
    data: {
      orderNo: `${PREFIX}-TRF-001`,
      fromStoreId: storeId,
      toStoreId: storeId,
      productCount: 3,
      status: 'completed',
      items: productCatalog.slice(0, 3).map((product) => ({ sku: product.sku, name: product.name, quantity: 2 })),
    },
  });
  inc(report.createdCounts, 'transferOrders');
  return products;
}

async function seedProjects(storeId: number, typeIds: Map<string, number>, products: Map<string, any>) {
  const projects = new Map<string, any>();
  for (const project of projectCatalog) {
    const created = await prisma.project.create({
      data: {
        storeId,
        typeId: typeIds.get(project.type),
        name: project.name,
        description: `${PREFIX} ${project.name}，用于演示预约、服务、核销、推荐闭环。`,
        price: project.price,
        duration: project.duration,
        image: imagePath('projects', project.slug),
        status: 'active',
      } as any,
    });
    projects.set(project.name, created);
    inc(report.createdCounts, 'projects');
    for (const slug of project.bom) {
      const product = products.get(slug);
      if (!product) continue;
      await prisma.projectBomItem.create({
        data: {
          projectId: created.id,
          productId: product.id,
          standardQty: slug.includes('towel') || slug.includes('mask') ? 1 : rand(2, 8),
          unit: product.unit || '件',
        },
      });
      inc(report.createdCounts, 'projectBomItems');
    }
  }
  return projects;
}

function generateAge() {
  const roll = random();
  if (roll < 0.08) return rand(18, 22);
  if (roll < 0.25) return rand(23, 27);
  if (roll < 0.55) return rand(28, 35);
  if (roll < 0.8) return rand(36, 42);
  if (roll < 0.93) return rand(43, 50);
  return rand(51, 60);
}

function customerSpend(level: string) {
  if (level === '无') return { totalSpent: 0, visitCount: 0 };
  if (level === '普通会员') return { totalSpent: rand(200, 5000), visitCount: rand(1, 15) };
  if (level === '银卡会员') return { totalSpent: rand(5000, 20000), visitCount: rand(10, 40) };
  if (level === '金卡会员') return { totalSpent: rand(20000, 60000), visitCount: rand(30, 80) };
  return { totalSpent: rand(50000, 200000), visitCount: rand(60, 200) };
}

async function seedCustomers(storeId: number) {
  const usedPhones = new Set<string>();
  const customerRows = [];
  for (let i = 0; i < 1240; i++) {
    const gender = random() < 0.95 ? '女' : '男';
    const age = generateAge();
    const memberLevel = weightedPick(memberLevels);
    const { totalSpent, visitCount } = customerSpend(memberLevel);
    let phone = '';
    do {
      phone = `${pick(['138', '139', '136', '137', '135', '158', '159', '188'])}${rand(10000000, 99999999)}`;
    } while (usedPhones.has(phone));
    usedPhones.add(phone);
    const tags = pickN(
      age < 28
        ? ['痘痘肌', '油性肌', '美白需求', '新客户', '学生党', '敏感肌', '控油需求']
        : age < 42
          ? ['补水需求', '抗衰需求', '高消费', 'VIP', '混合肌', '敏感肌', '美白需求', '紧致需求']
          : ['抗衰需求', '高消费', 'VIP', '干性肌', '沉睡客户', '紧致需求', '淡斑需求', '敏感肌'],
      rand(1, 3),
    );
    const name = `${pick(surnames)}${gender === '女' ? pick(femaleNames) : pick(maleNames)}`;
    customerRows.push({
      storeId,
      name,
      phone,
      email: random() < 0.28 ? `ami${i + 1}@example.com` : null,
      wechat: random() < 0.55 ? `wx_${phone.slice(-4)}_${rand(10, 99)}` : null,
      gender,
      maritalStatus: age < 28 ? '未婚' : random() < 0.75 ? '已婚' : '未知',
      birthday: daysFromBase(-(age * 365 + rand(0, 330))),
      age,
      height: gender === '女' ? rand(155, 172) : rand(168, 183),
      weight: gender === '女' ? rand(43, 68) : rand(58, 85),
      occupation: pick(['教师', '设计师', '企业主', '销售经理', '自由职业', '全职妈妈', '医生', '会计', '新媒体运营']),
      workplace: random() < 0.7 ? pick(['杭州未来科技有限公司', '浙江省人民医院', '自营美甲工作室', '阿里巴巴', '网易', '某外贸公司']) : null,
      address: `杭州市西湖区文三路${rand(1, 500)}号`,
      hasAllergy: random() < 0.12 ? '有' : '无',
      hasSurgery: random() < 0.08 ? '有' : '无',
      skinCondition: pickN(skinProblems, rand(1, 2)).join('，'),
      memberLevel,
      source: weightedPick(customerSources),
      totalSpent,
      visitCount,
      lastVisitDate: visitCount > 0 ? daysFromBase(-rand(1, tags.includes('沉睡客户') ? 240 : 45)) : null,
      skinType: pick(skinTypes),
      tags,
      remark: tags.includes('沉睡客户') ? '超过3个月未到店，建议回访' : random() < 0.2 ? '偏好安静护理环境' : null,
      createdAt: daysFromBase(-rand(15, 1000)),
    });
  }
  for (const rows of chunk(customerRows, 300)) {
    const result = await prisma.customer.createMany({ data: rows as any });
    inc(report.createdCounts, 'customers', result.count);
  }
  return prisma.customer.findMany({ where: { storeId }, orderBy: { id: 'asc' } });
}

async function seedCustomerProfilesAndConsumption(customers: any[]) {
  const profileRows = [];
  const consumptionRows = [];
  for (const [index, customer] of customers.entries()) {
    if (customer.visitCount >= 2 && index % 5 !== 0) {
      profileRows.push({
        customerId: customer.id,
        skinType: customer.skinType || pick(skinTypes),
        skinStatus: pick(['易出油', '毛孔粗大', '肤色不均', '偏干缺水', '轻微松弛', '状态良好']),
        mainProblems: pickN(skinProblems, rand(1, 3)).join(', '),
        allergyHistory: customer.hasAllergy === '有' ? pick(['花粉过敏', '酒精成分过敏', '果酸过敏']) : '没有',
        goals: pickN(['控油祛痘', '收缩毛孔', '美白提亮', '补水保湿', '抗衰紧致', '淡斑祛皱'], rand(1, 2)).join(', '),
        recommendedCare: pick(carePlans),
        instrument: pick(['面部皮肤检测器', 'VISIA皮肤分析仪', '水分检测仪', '毛孔分析仪']),
        lastCheck: daysFromBase(-rand(1, 180)),
      });
    }
    const recordCount = customer.visitCount === 0 ? 0 : Math.max(1, Math.min(8, Math.ceil(customer.visitCount * 0.6)));
    for (let i = 0; i < recordCount; i++) {
      const type = weightedPick([
        { value: '服务消费', weight: 60 },
        { value: '产品消费', weight: 20 },
        { value: '套餐消费', weight: 12 },
        { value: '充值消费', weight: 8 },
      ]);
      consumptionRows.push({
        customerId: customer.id,
        consumeType: type,
        consumeContent: pick(['深层清洁护理', '补水保湿护理', '美白焕肤疗程', '抗衰紧致项目', '玻尿酸精华液', '会员充值']),
        payMethod: pick(payMethods),
        amount: type === '充值消费' ? pick([1000, 2000, 3000, 5000, 10000]) : rand(98, 5000),
        campaign: random() < 0.35 ? pick(['春季焕肤活动', '会员专享优惠', '老带新优惠', '生日专属折扣']) : '无',
        consumeTime: daysFromBase(-rand(1, 720), rand(9, 21), rand(0, 59)),
      });
    }
  }
  for (const rows of chunk(profileRows, 300)) {
    const result = await prisma.customerHealthProfile.createMany({ data: rows as any });
    inc(report.createdCounts, 'healthProfiles', result.count);
  }
  for (const rows of chunk(consumptionRows, 500)) {
    const result = await prisma.consumptionRecord.createMany({ data: rows as any });
    inc(report.createdCounts, 'consumptionRecords', result.count);
  }
}

async function seedSchedules(storeId: number, beauticians: any[]) {
  const rows = [];
  for (let day = 0; day < 14; day++) {
    for (const beautician of beauticians) {
      rows.push({
        storeId,
        beauticianId: beautician.id,
        date: dateOnly(daysFromBase(day)),
        startTime: day % 7 === 0 ? '10:00' : '09:30',
        endTime: '18:30',
        status: day % 6 === 0 ? 'busy' : 'available',
      });
    }
  }
  const result = await prisma.schedule.createMany({ data: rows });
  inc(report.createdCounts, 'schedules', result.count);
}

async function seedCardsAndBalances(storeId: number, customers: any[]) {
  const cards = [];
  for (const [name, totalTimes, price, projects] of cardCatalog) {
    const card = await prisma.card.create({
      data: {
        name: String(name),
        description: `${PREFIX} ${name}`,
        totalTimes: Number(totalTimes),
        price: Number(price),
        projects: (projects as string[]).map((projectName) => ({ projectName, timesPerCard: Number(totalTimes) })),
        status: 'active',
      },
    });
    cards.push(card);
    inc(report.createdCounts, 'cards');
  }
  const customerCardRows = [];
  const accountRows = [];
  for (const [index, customer] of customers.slice(0, 320).entries()) {
    const card = cards[index % cards.length];
    const remainingTimes = Math.max(1, Number(card.totalTimes) - rand(0, Math.min(4, Number(card.totalTimes) - 1)));
    customerCardRows.push({
      customerId: customer.id,
      cardId: card.id,
      cardName: card.name,
      totalTimes: card.totalTimes,
      remainingTimes,
      expiryDate: daysFromBase(180 + (index % 120)),
      status: remainingTimes > 0 ? 'active' : 'used_up',
    });
    accountRows.push({
      customerId: customer.id,
      storeId,
      cashBalance: rand(100, 6000),
      giftBalance: rand(0, 1200),
      status: 'active',
    });
  }
  const customerCardResult = await prisma.customerCard.createMany({ data: customerCardRows as any });
  inc(report.createdCounts, 'customerCards', customerCardResult.count);
  const accountResult = await prisma.customerBalanceAccount.createMany({ data: accountRows as any });
  inc(report.createdCounts, 'balanceAccounts', accountResult.count);
  const accounts = await prisma.customerBalanceAccount.findMany({ where: { storeId }, orderBy: { id: 'asc' } });
  const txRows = [];
  for (const [index, account] of accounts.entries()) {
    const customer = customers.find((item) => item.id === account.customerId) ?? customers[index];
    for (let tx = 0; tx < (index < 100 ? 2 : 1); tx++) {
      txRows.push({
        accountId: account.id,
        customerId: customer.id,
        storeId,
        transactionNo: `${PREFIX}-BAL-${String(index + 1).padStart(4, '0')}-${tx + 1}`,
        type: tx === 0 ? 'recharge' : 'consume',
        amount: tx === 0 ? 1000 + (index % 5) * 500 : -rand(80, 680),
        giftAmount: tx === 0 ? 100 + (index % 3) * 50 : 0,
        cashBalanceBefore: 0,
        cashBalanceAfter: Number(account.cashBalance),
        giftBalanceBefore: 0,
        giftBalanceAfter: Number(account.giftBalance),
        paymentMethod: pick(payMethods),
        remark: `${PREFIX} 余额演示流水`,
        createdAt: daysFromBase(-rand(1, 120)),
      });
    }
  }
  for (const rows of chunk(txRows, 500)) {
    const txResult = await prisma.customerBalanceTransaction.createMany({ data: rows as any });
    inc(report.createdCounts, 'balanceTransactions', txResult.count);
  }
  return cards;
}

async function seedTerminalAndServices(storeId: number, customers: any[], beauticians: any[], projectsByName: Map<string, any>) {
  const devices = [];
  for (let i = 0; i < 3; i++) {
    const device = await prisma.terminalDevice.create({
      data: {
        storeId,
        deviceCode: `${PREFIX}-AURA-${String(i + 1).padStart(2, '0')}`,
        activationCode: `AURA${rand(100000, 999999)}`,
        name: ['Ami Aura 前台终端', 'Ami Aura 护理间终端', 'Ami Aura 顾问终端'][i],
        model: 'Ami Aura Lite',
        status: i === 0 ? TerminalDeviceStatus.online : TerminalDeviceStatus.offline,
        appVersion: '1.0.0-demo',
        firmwareVersion: '2026.06',
        batteryLevel: 88 - i * 12,
        networkStatus: i === 0 ? 'wifi' : 'offline',
        lastOnlineAt: daysFromBase(-i),
        boundAt: daysFromBase(-30),
      },
    });
    devices.push(device);
    inc(report.createdCounts, 'terminalDevices');
  }
  const projects = [...projectsByName.values()];
  const reservationRows = [];
  const taskRows = [];
  for (let i = 0; i < 360; i++) {
    const customer = customers[i % customers.length];
    const project = projects[i % projects.length];
    const beautician = beauticians[i % beauticians.length];
    const appointmentDate = daysFromBase((i % 70) - 35, 9 + (i % 9), (i % 2) * 30);
    reservationRows.push({
      storeId,
      customerId: customer.id,
      projectId: project.id,
      beauticianId: beautician.id,
      date: dateOnly(appointmentDate),
      startTime: timeText(appointmentDate),
      endTime: timeText(new Date(appointmentDate.getTime() + project.duration * 60_000)),
      status: pick(['pending', 'confirmed', 'completed', 'cancelled']),
      remark: `${PREFIX} 演示预约`,
      checkedInAt: i % 4 === 0 ? appointmentDate : null,
    });
    if (i < 220) {
      const status = i % 5 === 0 ? ServiceTaskStatus.completed : i % 5 === 1 ? ServiceTaskStatus.in_progress : ServiceTaskStatus.pending;
      taskRows.push({
        taskNo: `${PREFIX}-TASK-${String(i + 1).padStart(4, '0')}`,
        customerId: customer.id,
        projectId: project.id,
        beauticianId: beautician.id,
        deviceId: devices[i % devices.length].id,
        storeId,
        appointmentTime: appointmentDate,
        duration: project.duration,
        status,
        startedAt: status !== ServiceTaskStatus.pending ? appointmentDate : null,
        completedAt: status === ServiceTaskStatus.completed ? new Date(appointmentDate.getTime() + project.duration * 60_000) : null,
        remark: `${PREFIX} 终端服务任务`,
        consumptionItems: [{ projectName: project.name, duration: project.duration }],
        images: [],
      });
    }
  }
  const reservationResult = await prisma.reservation.createMany({ data: reservationRows as any });
  inc(report.createdCounts, 'reservations', reservationResult.count);
  const taskResult = await prisma.serviceTask.createMany({ data: taskRows as any });
  inc(report.createdCounts, 'serviceTasks', taskResult.count);
  const tasks = await prisma.serviceTask.findMany({ where: { storeId }, orderBy: { id: 'asc' } });
  const skinRows = [];
  for (const [index, task] of tasks.slice(0, 180).entries()) {
    const customer = customers[index % customers.length];
    skinRows.push({
      customerId: customer.id,
      taskId: task.id,
      deviceId: task.deviceId,
      images: [],
      metrics: {
        moisture: 42 + (index % 26),
        oil: 30 + (index % 30),
        elasticity: 58 + (index % 22),
        sensitivity: 18 + (index % 35),
      },
      skinType: customer.skinType || pick(skinTypes),
      skinStatus: pick(['偏干缺水', '肤色暗沉', '毛孔粗大', '状态良好']),
      mainProblems: pickN(skinProblems, 2).join(', '),
      recommendationText: pick(carePlans),
      createdAt: daysFromBase(-index),
    });
  }
  const skinResult = await prisma.skinTest.createMany({ data: skinRows as any });
  inc(report.createdCounts, 'skinTests', skinResult.count);
  return { devices, tasks };
}

async function seedOrdersAndUsage(storeId: number, customers: any[], products: Map<string, any>, projectsByName: Map<string, any>, beauticians: any[], devices: any[]) {
  const productList = [...products.values()];
  const projectList = [...projectsByName.values()];
  const orderRows = [];
  const itemRows = [];
  const paymentRows = [];
  const refundRows = [];
  for (let i = 0; i < 400; i++) {
    const customer = customers[i % customers.length];
    const isProject = i % 3 !== 0;
    const item = isProject ? projectList[i % projectList.length] : productList[i % productList.length];
    const unitPrice = Number(isProject ? item.price : item.retailPrice);
    const quantity = isProject ? 1 : 1 + (i % 3);
    const totalAmount = unitPrice * quantity;
    const status = i < 36 ? 'refunded' : 'completed';
    const orderNo = `${PREFIX}-ORD-${String(i + 1).padStart(4, '0')}`;
    const createdAt = daysFromBase(-rand(1, 240));
    orderRows.push({
      orderNo,
      customerId: customer.id,
      customerName: customer.name,
      storeId,
      totalAmount,
      status,
      payMethod: pick(payMethods),
      items: [{ itemType: isProject ? 'project' : 'product', itemId: item.id, name: item.name, quantity, unitPrice }],
      remark: `${PREFIX} 演示订单`,
      createdAt,
    });
    itemRows.push({
      orderNo,
      itemType: isProject ? 'project' : 'product',
      itemId: item.id,
      name: item.name,
      quantity,
      unitPrice,
      subtotal: totalAmount,
      discount: i % 7 === 0 ? 20 : 0,
      payload: { source: PREFIX },
    });
    if (i < 120) {
      itemRows.push({
        orderNo,
        itemType: 'product',
        itemId: productList[(i + 3) % productList.length].id,
        name: productList[(i + 3) % productList.length].name,
        quantity: 1,
        unitPrice: Number(productList[(i + 3) % productList.length].retailPrice),
        subtotal: Number(productList[(i + 3) % productList.length].retailPrice),
        payload: { source: PREFIX, addOn: true },
      });
    }
    paymentRows.push({
      orderNo,
      paymentNo: `${PREFIX}-PAY-${String(i + 1).padStart(4, '0')}`,
      method: pick(payMethods),
      amount: totalAmount,
      status: 'success',
      transactionNo: `${PREFIX}-TXN-${String(i + 1).padStart(4, '0')}`,
      paidAt: createdAt,
    });
    if (i < 36) {
      refundRows.push({
        orderNo,
        refundNo: `${PREFIX}-REF-${String(i + 1).padStart(4, '0')}`,
        amount: Math.round(totalAmount * 0.8),
        reason: `${PREFIX} 演示退款`,
        status: 'success',
        refundedAt: daysFromBase(-rand(1, 30)),
      });
    }
  }
  const orderResult = await prisma.productOrder.createMany({ data: orderRows as any });
  inc(report.createdCounts, 'productOrders', orderResult.count);
  const orders = await prisma.productOrder.findMany({ where: { storeId }, orderBy: { id: 'asc' } });
  const orderByNo = new Map(orders.map((order) => [order.orderNo, order]));
  const orderItemResult = await prisma.orderItem.createMany({
    data: itemRows.map((item) => ({ ...item, orderId: orderByNo.get(item.orderNo)!.id, orderNo: undefined })) as any,
  });
  inc(report.createdCounts, 'orderItems', orderItemResult.count);
  const paymentResult = await prisma.paymentRecord.createMany({
    data: paymentRows.map((payment) => ({ ...payment, orderId: orderByNo.get(payment.orderNo)!.id, orderNo: undefined })) as any,
  });
  inc(report.createdCounts, 'paymentRecords', paymentResult.count);
  const refundResult = await prisma.refundRecord.createMany({
    data: refundRows.map((refund) => ({ ...refund, orderId: orderByNo.get(refund.orderNo)!.id, orderNo: undefined })) as any,
  });
  inc(report.createdCounts, 'refundRecords', refundResult.count);
  const cards = await prisma.customerCard.findMany({ where: { customerId: { in: customers.slice(0, 320).map((customer) => customer.id) } } });
  const usageRows = [];
  for (const [index, card] of cards.slice(0, 180).entries()) {
    const customer = customers[index % customers.length];
    const project = projectList[index % projectList.length];
    usageRows.push({
      customerId: customer.id,
      customerName: customer.name,
      cardName: card.cardName,
      projectName: project.name,
      times: 1,
      remainingTimes: Math.max(0, card.remainingTimes - 1),
      beauticianId: beauticians[index % beauticians.length].id,
      deviceId: devices[index % devices.length].id,
      verifiedAt: daysFromBase(-index),
    });
  }
  const usageResult = await prisma.cardUsageRecord.createMany({ data: usageRows });
  inc(report.createdCounts, 'cardUsageRecords', usageResult.count);
  return orders;
}

async function seedMarketingAndRecommendations(storeId: number, customers: any[], orders: any[], devices: any[], tasks: any[]) {
  const promotions = ['新客补水体验', '敏感修护月卡权益', '老客回访护理', '抗衰管理升级', '生日专属护理'];
  const promotionResult = await prisma.promotion.createMany({
    data: promotions.map((name, index) => ({
        storeId,
        name: `${PREFIX} ${name}`,
        description: `${PREFIX} 演示促销活动`,
        discountText: index % 2 === 0 ? '到店护理立减 80' : '组合护理 8.8 折',
        applicableProjectIds: [],
        startAt: daysFromBase(-7),
        endAt: daysFromBase(60 + index * 5),
        status: 'active',
      })),
  });
  inc(report.createdCounts, 'promotions', promotionResult.count);
  const printResult = await prisma.printJob.createMany({
    data: Array.from({ length: 60 }, (_, i) => {
      const order = orders[i % orders.length];
      return {
        storeId,
        jobNo: `${PREFIX}-PRINT-${String(i + 1).padStart(3, '0')}`,
        sourceType: 'product_order',
        sourceId: order.id,
        title: `${PREFIX} 演示小票`,
        content: `${STORE_NAME}\n订单：${order.orderNo}\n金额：${order.totalAmount}`,
        copies: 1,
        status: i % 8 === 0 ? 'pending' : 'completed',
        completedAt: i % 8 === 0 ? null : daysFromBase(-rand(1, 30)),
      };
    }),
  });
  inc(report.createdCounts, 'printJobs', printResult.count);

  const run = await prisma.predictionRun.create({
    data: {
      storeId,
      modelVersion: 'ami-demo-full-v1',
      status: 'completed',
      startedAt: daysFromBase(-1),
      finishedAt: daysFromBase(-1, 10, 30),
      customerCount: customers.length,
      summaryJson: { source: PREFIX, churnHigh: 186, ltvHigh: 280 },
    },
  });
  inc(report.createdCounts, 'predictionRuns');
  const snapshots = [];
  const snapshotRows = [];
  for (const [index, customer] of customers.entries()) {
    const churnScore = rand(15, 95);
    const ltv12m = Number(customer.totalSpent ?? 0) * (1.1 + (index % 5) / 10);
    snapshotRows.push({
      runId: run.id,
      customerId: customer.id,
      storeId,
      modelVersion: 'ami-demo-full-v1',
      churnScore,
      churnLevel: churnScore > 75 ? 'high' : churnScore > 45 ? 'medium' : 'low',
      repurchase30dScore: rand(20, 96),
      marketingResponseScore: rand(18, 92),
      ltv6m: Math.round(ltv12m * 0.55),
      ltv12m: Math.round(ltv12m),
      ltvTier: ltv12m > 60000 ? 'S' : ltv12m > 20000 ? 'A' : ltv12m > 5000 ? 'B' : 'C',
      featureJson: { memberLevel: customer.memberLevel, visitCount: customer.visitCount, source: PREFIX },
      reasonJson: [{ reason: '消费频次与最近到店周期综合判断' }],
      recommendedActionsJson: [{ action: churnScore > 75 ? '沉睡唤醒' : '周期护理邀约' }],
    });
  }
  for (const rows of chunk(snapshotRows, 500)) {
    const snapshotResult = await prisma.customerPredictionSnapshot.createMany({ data: rows as any });
    inc(report.createdCounts, 'predictionSnapshots', snapshotResult.count);
  }
  snapshots.push(...(await prisma.customerPredictionSnapshot.findMany({ where: { runId: run.id }, orderBy: { id: 'asc' } })));

  const strategies = [];
  for (const [index, name] of ['沉睡客户唤醒策略', '高价值会员复购策略', '生日关怀自动触达'].entries()) {
    const strategy = await prisma.marketingAutomationStrategy.create({
      data: {
        name: `${PREFIX} ${name}`,
        description: `${PREFIX} 演示营销自动化策略`,
        status: MarketingStrategyStatus.enabled,
        executionType: 'auto',
        schedule: { type: 'daily', time: '10:00' },
        triggerRules: [{ type: index === 0 ? 'inactive_days' : 'member_level', params: { source: PREFIX } }],
        ruleRelation: 'AND',
        actions: [{ type: 'wechat', template: `${name}话术` }],
        targetCount: index === 0 ? 120 : 90,
        lastExecutedAt: daysFromBase(-1),
      },
    });
    strategies.push(strategy);
    inc(report.createdCounts, 'marketingStrategies');
    const executionResult = await prisma.marketingAutomationExecution.createMany({
      data: [0, 1].map((e) => ({
          strategyId: strategy.id,
          strategyName: strategy.name,
          status: 'completed',
          triggeredCount: 50 + e * 8,
          reachedCount: 45 + e * 8,
          channel: 'wechat',
          executedAt: daysFromBase(-(e + 1)),
          message: `${PREFIX} 演示执行`,
        })),
    });
    inc(report.createdCounts, 'marketingExecutions', executionResult.count);
  }
  const executions = await prisma.marketingAutomationExecution.findMany({
    where: { strategyId: { in: strategies.map((strategy) => strategy.id) } },
    orderBy: { id: 'asc' },
  });
  const touchRows = [];
  for (let i = 0; i < 300; i++) {
    const customer = customers[i % customers.length];
    const strategy = strategies[i % strategies.length];
    const execution = executions[i % executions.length];
    touchRows.push({
      executionId: execution.id,
      strategyId: strategy.id,
      customerId: customer.id,
      predictionSnapshotId: snapshots[i % snapshots.length].id,
      predictedConversionScore: rand(30, 95),
      predictedRevenue: rand(198, 3000),
      channel: pick(['wechat', 'sms', 'store']),
      status: i < 80 ? 'converted' : 'reached',
      touchedAt: daysFromBase(-rand(1, 30)),
      convertedAt: i < 80 ? daysFromBase(-rand(1, 20)) : null,
      conversionType: i < 80 ? 'order' : null,
      actualRevenue: i < 80 ? rand(198, 3600) : null,
    });
  }
  const touchResult = await prisma.marketingAutomationTouch.createMany({ data: touchRows as any });
  inc(report.createdCounts, 'marketingTouches', touchResult.count);
  const touches = await prisma.marketingAutomationTouch.findMany({
    where: { strategyId: { in: strategies.map((strategy) => strategy.id) } },
    orderBy: { id: 'asc' },
  });
  const attributionRows = [];
  for (let i = 0; i < 80; i++) {
    const touch = touches[i];
    const order = orders[i % orders.length];
    attributionRows.push({
      touchId: touch.id,
      strategyId: touch.strategyId,
      executionId: touch.executionId,
      customerId: touch.customerId,
      orderId: order.id,
      attributionType: 'last_touch',
      attributedRevenue: order.totalAmount,
      attributionWindowDays: 30,
      occurredAt: daysFromBase(-rand(1, 20)),
    });
  }
  const attributionResult = await prisma.marketingAttribution.createMany({ data: attributionRows as any });
  inc(report.createdCounts, 'marketingAttributions', attributionResult.count);
  const recommendationRows = [];
  for (let i = 0; i < 220; i++) {
    const customer = customers[i % customers.length];
    const order = orders[i % orders.length];
    recommendationRows.push({
      storeId,
      customerId: customer.id,
      deviceId: devices[i % devices.length].id,
      recommendationId: 10000 + i,
      eventType: i % 4 === 0 ? 'accepted' : 'shown',
      taskId: tasks[i % tasks.length]?.id,
      orderId: i % 4 === 0 ? order.id : null,
      note: `${PREFIX} 演示推荐反馈`,
      payload: { source: PREFIX, score: rand(60, 96) },
      createdAt: daysFromBase(-rand(1, 60)),
    });
  }
  const recommendationResult = await prisma.recommendationEvent.createMany({ data: recommendationRows as any });
  inc(report.createdCounts, 'recommendationEvents', recommendationResult.count);
}

function writeRunReport() {
  mkdirSync(resolve(REPO_ROOT, 'docs', '04-测试数据'), { recursive: true });
  const rows = Object.keys(plannedCounts()).map((key) => {
    const countKey = key as CountKey;
    return `| ${countKey} | ${report.beforeCounts[countKey] ?? 0} | ${report.deletedCounts[countKey] ?? 0} | ${report.createdCounts[countKey] ?? 0} | ${report.afterCounts[countKey] ?? 0} |`;
  });
  const lines = [
    '# Ami 全量演示门店数据写入报告',
    '',
    `执行时间：${new Date().toISOString()}`,
    `模式：${report.mode}`,
    `门店：${STORE_NAME}`,
    `前缀：${PREFIX}`,
    `随机种子：${RANDOM_SEED}`,
    '',
    '## 数量统计',
    '',
    '| 模块 | 写入前 | 删除/刷新 | 新建 | 写入后 |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    '## 图片资产',
    '',
    `图片资产清单：\`${ASSET_REPORT_PATH.replace(REPO_ROOT, '').replace(/^\\/, '')}\``,
    `Manifest：\`${ASSET_MANIFEST_PATH.replace(REPO_ROOT, '').replace(/^\\/, '')}\``,
    '',
    '## Warnings',
    '',
    ...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ['- 无']),
    '',
    '## JSON',
    '',
    '```json',
    JSON.stringify(report, null, 2),
    '```',
  ];
  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未配置，无法连接数据库。');
  }

  report.plannedCounts = plannedCounts();
  const existingStore = await findTargetStore();
  report.beforeCounts = await countCurrentStoreData(existingStore?.id);

  if (dryRun) {
    report.deletedCounts = report.beforeCounts;
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  ensureAssetReports();
  const store = await ensureStore();
  await refreshStoreData(store.id);
  await ensureAdminAccess(store.id);
  const dictionaries = await ensureBaseDictionaries();
  const beauticians = await seedUsersAndBeauticians(store.id, dictionaries.levels.map((level) => level.id));
  await seedSchedules(store.id, beauticians);
  const products = await seedProducts(store.id, dictionaries.categoryIds);
  const projects = await seedProjects(store.id, dictionaries.typeIds, products);
  const customers = await seedCustomers(store.id);
  await seedCustomerProfilesAndConsumption(customers);
  await seedCardsAndBalances(store.id, customers);
  const { devices, tasks } = await seedTerminalAndServices(store.id, customers, beauticians, projects);
  const orders = await seedOrdersAndUsage(store.id, customers, products, projects, beauticians, devices);
  await seedMarketingAndRecommendations(store.id, customers, orders, devices, tasks);
  report.afterCounts = await countCurrentStoreData(store.id);
  writeRunReport();
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
