import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { MarketingStrategyStatus, PrismaClient, ServiceTaskStatus, TerminalDeviceStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { readSeedPassword } from './seed-env.ts';
import { seedMarketingRuleTemplates } from './seed-marketing-rule-templates.ts';

const dryRun = process.argv.includes('--dry-run');

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
  | 'roles'
  | 'customers'
  | 'consumptionRecords'
  | 'healthProfiles'
  | 'beauticians'
  | 'beauticianLevels'
  | 'categories'
  | 'products'
  | 'stockBatches'
  | 'stockMovements'
  | 'projectTypes'
  | 'projects'
  | 'projectBomItems'
  | 'cards'
  | 'customerCards'
  | 'cardUsageRecords'
  | 'productOrders'
  | 'orderItems'
  | 'paymentRecords'
  | 'refundRecords'
  | 'balanceAccounts'
  | 'balanceTransactions'
  | 'marketingStrategies'
  | 'marketingExecutions'
  | 'marketingTouches'
  | 'marketingAttributions'
  | 'marketingRuleTemplates'
  | 'recommendationEvents'
  | 'promotions'
  | 'printJobs'
  | 'reservations'
  | 'serviceTasks'
  | 'skinTests'
  | 'terminalDevices'
  | 'purchaseOrders'
  | 'transferOrders';

type Report = {
  mode: 'dry-run' | 'apply';
  sourceCounts: Record<string, number>;
  beforeCounts: Record<CountKey, number>;
  createdCounts: Partial<Record<CountKey, number>>;
  updatedCounts: Partial<Record<CountKey, number>>;
  skippedCounts: Partial<Record<CountKey, number>>;
  afterCounts: Record<CountKey, number>;
  warnings: string[];
};

const report: Report = {
  mode: dryRun ? 'dry-run' : 'apply',
  sourceCounts: {},
  beforeCounts: {} as Record<CountKey, number>,
  createdCounts: {},
  updatedCounts: {},
  skippedCounts: {},
  afterCounts: {} as Record<CountKey, number>,
  warnings: [],
};

const DRY_RUN_ID_BASE = 9_000_000;
const MVP_ATTRIBUTION_STRATEGY_NAME = 'MVP 鏁版嵁闂幆鍥炶绛栫暐';
const MVP_ATTRIBUTION_EXECUTION_MESSAGE = 'MVP 鏁版嵁闂幆婕旂ず鎵ц';
const dryRunMarketingPlan = {
  strategyCreated: false,
  executionCreated: false,
  touchCustomerIds: new Set<number>(),
};

const productCatalog = [
  { sku: 'AMI-SKU-001', name: '玻尿酸保湿精华', brand: 'Ami Lab', category: '精华', spec: '30ml', unit: '瓶', costPrice: 168, retailPrice: 298, shelfLife: 730, supplier: 'Ami 官方供应链', safetyStock: 30 },
  { sku: 'AMI-SKU-002', name: '舒缓修护面膜', brand: 'Ami Lab', category: '面膜', spec: '6片/盒', unit: '盒', costPrice: 86, retailPrice: 168, shelfLife: 365, supplier: 'Ami 官方供应链', safetyStock: 45 },
  { sku: 'AMI-SKU-003', name: '氨基酸洁面乳', brand: 'Ami Lab', category: '洁面', spec: '120ml', unit: '支', costPrice: 58, retailPrice: 128, shelfLife: 730, supplier: 'Ami 官方供应链', safetyStock: 35 },
  { sku: 'AMI-SKU-004', name: '烟酰胺亮肤精华', brand: 'Ami Lab', category: '精华', spec: '30ml', unit: '瓶', costPrice: 188, retailPrice: 368, shelfLife: 730, supplier: 'Ami 官方供应链', safetyStock: 25 },
  { sku: 'AMI-SKU-005', name: '抗衰紧致眼霜', brand: 'Ami Lab', category: '面霜', spec: '15ml', unit: '瓶', costPrice: 220, retailPrice: 498, shelfLife: 365, supplier: 'Ami 官方供应链', safetyStock: 18 },
  { sku: 'AMI-SKU-006', name: '屏障修护乳', brand: 'Ami Lab', category: '面霜', spec: '100ml', unit: '瓶', costPrice: 136, retailPrice: 268, shelfLife: 730, supplier: 'Ami 官方供应链', safetyStock: 28 },
  { sku: 'AMI-SKU-007', name: '水氧护理耗材包', brand: 'Ami Aura', category: '仪器耗材', spec: '10套/盒', unit: '盒', costPrice: 260, retailPrice: 480, shelfLife: 365, supplier: 'Ami Aura 耗材中心', safetyStock: 20 },
  { sku: 'AMI-SKU-008', name: '一次性护理巾', brand: 'Ami Care', category: '日用消耗品', spec: '100片/包', unit: '包', costPrice: 32, retailPrice: 68, shelfLife: 1095, supplier: 'Ami 门店耗材中心', safetyStock: 80 },
];

const projectCatalog = [
  { name: '深层补水护理', type: '面部护理', duration: 60, price: 298, bom: [{ sku: 'AMI-SKU-001', qty: 3, unit: 'ml' }, { sku: 'AMI-SKU-002', qty: 1, unit: '片' }, { sku: 'AMI-SKU-008', qty: 2, unit: '片' }] },
  { name: '敏感肌舒缓修护', type: '面部护理', duration: 75, price: 398, bom: [{ sku: 'AMI-SKU-002', qty: 1, unit: '片' }, { sku: 'AMI-SKU-006', qty: 6, unit: 'ml' }, { sku: 'AMI-SKU-008', qty: 2, unit: '片' }] },
  { name: '水氧清洁焕肤', type: '仪器护理', duration: 60, price: 368, bom: [{ sku: 'AMI-SKU-003', qty: 5, unit: 'ml' }, { sku: 'AMI-SKU-007', qty: 1, unit: '套' }, { sku: 'AMI-SKU-008', qty: 2, unit: '片' }] },
  { name: '亮肤淡斑管理', type: '面部护理', duration: 90, price: 588, bom: [{ sku: 'AMI-SKU-004', qty: 4, unit: 'ml' }, { sku: 'AMI-SKU-002', qty: 1, unit: '片' }] },
  { name: '紧致抗衰护理', type: '面部护理', duration: 100, price: 688, bom: [{ sku: 'AMI-SKU-005', qty: 2, unit: 'ml' }, { sku: 'AMI-SKU-001', qty: 4, unit: 'ml' }, { sku: 'AMI-SKU-006', qty: 6, unit: 'ml' }] },
  { name: '肩颈舒压养护', type: '身体护理', duration: 60, price: 268, bom: [{ sku: 'AMI-SKU-008', qty: 3, unit: '片' }] },
  { name: '小气泡清洁护理', type: '仪器护理', duration: 45, price: 258, bom: [{ sku: 'AMI-SKU-003', qty: 4, unit: 'ml' }, { sku: 'AMI-SKU-007', qty: 1, unit: '套' }] },
  { name: '季节屏障养护', type: '面部护理', duration: 70, price: 428, bom: [{ sku: 'AMI-SKU-006', qty: 8, unit: 'ml' }, { sku: 'AMI-SKU-002', qty: 1, unit: '片' }] },
];

const cardCatalog = [
  { name: '补水护理 10 次卡', description: '适合干燥缺水客户的基础护理卡', totalTimes: 10, price: 2680, projects: [{ projectName: '深层补水护理', timesPerCard: 10 }] },
  { name: '敏感修护 8 次卡', description: '适合敏感肌和屏障受损客户', totalTimes: 8, price: 2880, projects: [{ projectName: '敏感肌舒缓修护', timesPerCard: 8 }] },
  { name: '焕肤清洁 12 次卡', description: '小气泡和水氧清洁组合卡', totalTimes: 12, price: 3280, projects: [{ projectName: '小气泡清洁护理', timesPerCard: 6 }, { projectName: '水氧清洁焕肤', timesPerCard: 6 }] },
  { name: '抗衰管理 6 次卡', description: '高价值客户抗衰护理套餐', totalTimes: 6, price: 3680, projects: [{ projectName: '紧致抗衰护理', timesPerCard: 6 }] },
  { name: '综合养护 20 次卡', description: '覆盖补水、清洁、肩颈和季节养护', totalTimes: 20, price: 5980, projects: [{ projectName: '深层补水护理', timesPerCard: 8 }, { projectName: '肩颈舒压养护', timesPerCard: 6 }, { projectName: '季节屏障养护', timesPerCard: 6 }] },
];

const beauticianNames = [
  ['林雅', '周宁', '赵悦'],
  ['陈安', '王璐', '沈晴'],
  ['刘敏', '许诺', '何佳'],
  ['唐伊', '顾然', '马欣'],
  ['宋乔', '韩雨', '邱甜'],
];

function inc(bucket: Partial<Record<CountKey, number>>, key: CountKey, by = 1) {
  bucket[key] = (bucket[key] ?? 0) + by;
}

function daysFromNow(days: number, hour = 10, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function onlyDate(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function timeText(date: Date) {
  return date.toTimeString().slice(0, 5);
}

async function getCounts(): Promise<Record<CountKey, number>> {
  const ruleTemplateDelegate = (prisma as any).marketingRuleTemplate;
  return {
    stores: await prisma.store.count(),
    users: await prisma.user.count({ where: { deletedAt: null } }),
    roles: await prisma.role.count(),
    customers: await prisma.customer.count({ where: { deletedAt: null } }),
    consumptionRecords: await prisma.consumptionRecord.count(),
    healthProfiles: await prisma.customerHealthProfile.count(),
    beauticians: await prisma.beautician.count(),
    beauticianLevels: await prisma.beauticianLevel.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count({ where: { deletedAt: null } }),
    stockBatches: await prisma.stockBatch.count(),
    stockMovements: await prisma.stockMovement.count(),
    projectTypes: await prisma.projectType.count(),
    projects: await prisma.project.count({ where: { deletedAt: null } }),
    projectBomItems: await prisma.projectBomItem.count(),
    cards: await prisma.card.count(),
    customerCards: await prisma.customerCard.count(),
    cardUsageRecords: await prisma.cardUsageRecord.count(),
    productOrders: await prisma.productOrder.count(),
    orderItems: await prisma.orderItem.count(),
    paymentRecords: await prisma.paymentRecord.count(),
    refundRecords: await prisma.refundRecord.count(),
    balanceAccounts: await prisma.customerBalanceAccount.count(),
    balanceTransactions: await prisma.customerBalanceTransaction.count(),
    marketingStrategies: await prisma.marketingAutomationStrategy.count(),
    marketingExecutions: await prisma.marketingAutomationExecution.count(),
    marketingTouches: await prisma.marketingAutomationTouch.count(),
    marketingAttributions: await prisma.marketingAttribution.count(),
    marketingRuleTemplates: ruleTemplateDelegate?.count ? await ruleTemplateDelegate.count() : 0,
    recommendationEvents: await prisma.recommendationEvent.count(),
    promotions: await prisma.promotion.count(),
    printJobs: await prisma.printJob.count(),
    reservations: await prisma.reservation.count(),
    serviceTasks: await prisma.serviceTask.count(),
    skinTests: await prisma.skinTest.count(),
    terminalDevices: await prisma.terminalDevice.count(),
    purchaseOrders: await prisma.purchaseOrder.count(),
    transferOrders: await prisma.transferOrder.count(),
  };
}

async function syncPostgresSequences() {
  if (dryRun) return;
  const tables = [
    'Store',
    'User',
    'Role',
    'Customer',
    'CustomerHealthProfile',
    'ConsumptionRecord',
    'Category',
    'Product',
    'StockBatch',
    'StockMovement',
    'PurchaseOrder',
    'TransferOrder',
    'ProductOrder',
    'OrderItem',
    'PaymentRecord',
    'RefundRecord',
    'CustomerBalanceAccount',
    'CustomerBalanceTransaction',
    'MarketingAutomationStrategy',
    'MarketingAutomationExecution',
    'MarketingAutomationTouch',
    'MarketingAttribution',
    'RecommendationEvent',
    'Promotion',
    'PrintJob',
    'ProjectType',
    'Project',
    'ProjectBomItem',
    'Beautician',
    'BeauticianLevel',
    'Card',
    'CustomerCard',
    'CardUsageRecord',
    'Reservation',
    'TerminalDevice',
    'ServiceTask',
    'SkinTest',
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${table}"', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM "${table}"), 0), 1),
        true
      )
    `);
  }
}

async function upsertCategory(name: string, parentId?: number | null) {
  const existing = await prisma.category.findFirst({ where: { name, parentId: parentId ?? null } });
  if (existing) {
    inc(report.skippedCounts, 'categories');
    return existing;
  }
  if (dryRun) {
    inc(report.createdCounts, 'categories');
    return { id: -Math.floor(Math.random() * 100000), name, parentId: parentId ?? null };
  }
  inc(report.createdCounts, 'categories');
  return prisma.category.create({ data: { name, parentId: parentId ?? null } });
}

async function upsertProjectType(name: string, description: string) {
  const existing = await prisma.projectType.findFirst({ where: { name } });
  if (existing) {
    inc(report.skippedCounts, 'projectTypes');
    return existing;
  }
  if (dryRun) {
    inc(report.createdCounts, 'projectTypes');
    return { id: -Math.floor(Math.random() * 100000), name, description, status: 'active' };
  }
  inc(report.createdCounts, 'projectTypes');
  return prisma.projectType.create({ data: { name, description, status: 'active' } });
}

async function ensureStores() {
  const stores = await prisma.store.findMany({ where: { deletedAt: null, status: 'active' }, orderBy: { id: 'asc' } });
  if (!stores.length) throw new Error('当前数据库没有可用门店，请先运行基础 seed。');
  return stores;
}

async function ensureRoles() {
  const [beauticianRole, adminUser] = await Promise.all([
    prisma.role.findUnique({ where: { key: 'beautician' } }),
    prisma.user.findUnique({ where: { username: 'admin' } }),
  ]);
  if (!beauticianRole) report.warnings.push('未找到 beautician 角色，将只创建美容师档案，不创建美容师系统用户。');
  if (!adminUser) report.warnings.push('未找到 admin 用户，无法自动补充门店可见范围。');
  return { beauticianRole, adminUser };
}

async function seedBeauticians(stores: Awaited<ReturnType<typeof ensureStores>>, beauticianRole: any) {
  const levels = await prisma.beauticianLevel.findMany({ orderBy: { sortOrder: 'asc' } });
  if (!levels.length) {
    report.warnings.push('未找到美容师等级，美容师将不绑定 levelId。');
  }
  const passwordHash = dryRun ? '' : await bcrypt.hash(readSeedPassword('DEMO_USER_DEFAULT_PASSWORD'), 12);
  for (const [storeIndex, store] of stores.entries()) {
    const names = beauticianNames[storeIndex] ?? [`门店${store.id}美容师A`, `门店${store.id}美容师B`, `门店${store.id}美容师C`];
    for (const [idx, name] of names.entries()) {
      const phone = `139${String(store.id).padStart(2, '0')}${String(idx + 1).padStart(2, '0')}000${idx + 1}`;
      const existing = await prisma.beautician.findFirst({ where: { storeId: store.id, phone } });
      const level = levels[Math.min(idx, Math.max(0, levels.length - 1))];
      if (existing) {
        inc(report.skippedCounts, 'beauticians');
      } else if (dryRun) {
        inc(report.createdCounts, 'beauticians');
      } else {
        await prisma.beautician.create({
          data: { storeId: store.id, name, phone, levelId: level?.id, status: 'active' },
        });
        inc(report.createdCounts, 'beauticians');
      }

      if (idx < 2 && beauticianRole) {
        const username = `beautician_${store.id}_${idx + 1}`;
        const user = await prisma.user.findUnique({ where: { username } });
        if (user) {
          inc(report.skippedCounts, 'users');
        } else if (dryRun) {
          inc(report.createdCounts, 'users');
        } else {
          await prisma.user.create({
            data: {
              username,
              passwordHash,
              name,
              phone,
              roles: { create: [{ roleId: beauticianRole.id }] },
              stores: { create: [{ storeId: store.id }] },
            },
          });
          inc(report.createdCounts, 'users');
        }
      }
    }
  }
}

async function seedProducts(stores: Awaited<ReturnType<typeof ensureStores>>) {
  const root = await upsertCategory('护肤产品');
  const categoryByName = new Map<string, number>();
  for (const name of ['洁面', '精华', '面膜', '面霜', '仪器耗材', '日用消耗品']) {
    const category = await upsertCategory(name, root.id);
    categoryByName.set(name, category.id);
  }

  const productsByStoreSku = new Map<string, any>();
  for (const store of stores) {
    for (const [index, product] of productCatalog.entries()) {
      const sku = `${product.sku}-S${store.id}`;
      const existing = await prisma.product.findUnique({ where: { sku } });
      const currentStock = index % 4 === 0 ? product.safetyStock - 8 : product.safetyStock + 35 + store.id * 3;
      if (existing) {
        productsByStoreSku.set(`${store.id}:${product.sku}`, existing);
        inc(report.skippedCounts, 'products');
      } else if (dryRun) {
        productsByStoreSku.set(`${store.id}:${product.sku}`, { id: -(store.id * 100 + index), sku, name: product.name, storeId: store.id });
        inc(report.createdCounts, 'products');
      } else {
        const created = await prisma.product.create({
          data: {
            storeId: store.id,
            sku,
            name: product.name,
            brand: product.brand,
            spec: product.spec,
            unit: product.unit,
            costPrice: product.costPrice,
            retailPrice: product.retailPrice,
            shelfLife: product.shelfLife,
            supplier: product.supplier,
            minPurchaseQty: Math.max(5, Math.round(product.safetyStock / 3)),
            currentStock,
            safetyStock: product.safetyStock,
            categoryId: categoryByName.get(product.category),
            status: 'active',
          },
        });
        productsByStoreSku.set(`${store.id}:${product.sku}`, created);
        inc(report.createdCounts, 'products');
      }
      const productRef = productsByStoreSku.get(`${store.id}:${product.sku}`);
      if (productRef?.id && productRef.id > 0) {
        const batchNo = `MVP-${store.id}-${product.sku}`;
        const existingBatch = await prisma.stockBatch.findFirst({ where: { productId: productRef.id, batchNo } });
        if (existingBatch) {
          inc(report.skippedCounts, 'stockBatches');
        } else if (dryRun) {
          inc(report.createdCounts, 'stockBatches');
        } else {
          await prisma.stockBatch.create({
            data: {
              productId: productRef.id,
              batchNo,
              stock: currentStock,
              productionDate: daysFromNow(-120 - index * 8),
              expiryDate: index === 1 ? daysFromNow(18) : daysFromNow(180 + index * 30),
            },
          });
          inc(report.createdCounts, 'stockBatches');
        }
      }
    }
  }
  return productsByStoreSku;
}

async function seedProjects(stores: Awaited<ReturnType<typeof ensureStores>>, productsByStoreSku: Map<string, any>) {
  const typeByName = new Map<string, number>();
  for (const type of ['面部护理', '身体护理', '仪器护理']) {
    const projectType = await upsertProjectType(type, `${type}演示分类`);
    typeByName.set(type, projectType.id);
  }

  const projectsByStoreName = new Map<string, any>();
  for (const store of stores) {
    for (const [index, project] of projectCatalog.entries()) {
      const existing = await prisma.project.findFirst({ where: { storeId: store.id, name: project.name, deletedAt: null } });
      let projectRef = existing;
      if (existing) {
        inc(report.skippedCounts, 'projects');
      } else if (dryRun) {
        projectRef = { id: -(store.id * 1000 + index), storeId: store.id, name: project.name };
        inc(report.createdCounts, 'projects');
      } else {
        projectRef = await prisma.project.create({
          data: {
            storeId: store.id,
            typeId: typeByName.get(project.type),
            name: project.name,
            description: `${project.name}，适合门店标准服务流程演示。`,
            price: project.price,
            duration: project.duration,
            status: 'active',
          },
        });
        inc(report.createdCounts, 'projects');
      }
      projectsByStoreName.set(`${store.id}:${project.name}`, projectRef);
      if (!projectRef?.id || projectRef.id < 0) continue;

      const existingBom = await prisma.projectBomItem.count({ where: { projectId: projectRef.id } });
      if (existingBom > 0) {
        inc(report.skippedCounts, 'projectBomItems', existingBom);
        continue;
      }
      const bomItems = project.bom
        .map((item) => {
          const product = productsByStoreSku.get(`${store.id}:${item.sku}`);
          return product?.id && product.id > 0
            ? { projectId: projectRef.id, productId: product.id, standardQty: item.qty, unit: item.unit }
            : null;
        })
        .filter(Boolean) as Array<{ projectId: number; productId: number; standardQty: number; unit: string }>;
      if (dryRun) {
        inc(report.createdCounts, 'projectBomItems', bomItems.length);
      } else if (bomItems.length) {
        await prisma.projectBomItem.createMany({ data: bomItems, skipDuplicates: true });
        inc(report.createdCounts, 'projectBomItems', bomItems.length);
      }
    }
  }
  return projectsByStoreName;
}

async function seedCards() {
  const cards = new Map<string, any>();
  for (const card of cardCatalog) {
    const existing = await prisma.card.findFirst({ where: { name: card.name } });
    if (existing) {
      cards.set(card.name, existing);
      inc(report.skippedCounts, 'cards');
    } else if (dryRun) {
      cards.set(card.name, { id: -cards.size - 1, ...card });
      inc(report.createdCounts, 'cards');
    } else {
      const created = await prisma.card.create({
        data: {
          name: card.name,
          description: card.description,
          totalTimes: card.totalTimes,
          price: card.price,
          projects: card.projects,
          status: 'active',
        },
      });
      cards.set(card.name, created);
      inc(report.createdCounts, 'cards');
    }
  }
  return cards;
}

async function seedTerminalDevices(stores: Awaited<ReturnType<typeof ensureStores>>) {
  for (const store of stores) {
    const deviceCode = `AURA-${String(store.id).padStart(4, '0')}`;
    const existing = await prisma.terminalDevice.findUnique({ where: { deviceCode } });
    if (existing) {
      inc(report.skippedCounts, 'terminalDevices');
    } else if (dryRun) {
      inc(report.createdCounts, 'terminalDevices');
    } else {
      await prisma.terminalDevice.create({
        data: {
          storeId: store.id,
          deviceCode,
          activationCode: 'AURA-2026',
          name: `${store.name} Ami Aura Lite`,
          model: 'Ami Aura Lite',
          status: TerminalDeviceStatus.offline,
          appVersion: '1.0.0',
          firmwareVersion: '1.0.0',
          batteryLevel: 88,
          networkStatus: 'wifi',
        },
      });
      inc(report.createdCounts, 'terminalDevices');
    }
  }
}

async function pickCustomersByStore(storeId: number, take: number) {
  return prisma.customer.findMany({
    where: { storeId, deletedAt: null },
    orderBy: [{ totalSpent: 'desc' }, { visitCount: 'desc' }],
    take,
  });
}

async function ensureStoreDemoCustomers(stores: Awaited<ReturnType<typeof ensureStores>>) {
  const demoNames = ['顾安安', '许晴岚', '林若溪', '周诗雅', '陈曼', '王可心', '赵一宁', '沈知夏', '韩嘉悦', '刘语桐', '宋念', '唐清'];
  const skinTypes = ['干性', '混合偏干', '敏感肌', '油性', '混合偏油', '中性'];
  for (const store of stores) {
    const existingCount = await prisma.customer.count({ where: { storeId: store.id, deletedAt: null } });
    if (existingCount > 0) continue;

    for (let i = 0; i < demoNames.length; i += 1) {
      const phone = `138${String(store.id).padStart(2, '0')}${String(i + 1).padStart(2, '0')}2026`;
      const existing = await prisma.customer.findFirst({ where: { storeId: store.id, phone } });
      if (existing) {
        inc(report.skippedCounts, 'customers');
        continue;
      }

      if (dryRun) {
        inc(report.createdCounts, 'customers');
        inc(report.createdCounts, 'healthProfiles');
        inc(report.createdCounts, 'consumptionRecords', 2);
        continue;
      }

      const customer = await prisma.customer.create({
        data: {
          storeId: store.id,
          name: demoNames[i],
          phone,
          gender: i % 3 === 0 ? '女' : i % 3 === 1 ? '女士' : '未知',
          birthday: daysFromNow(-9000 - i * 120),
          age: 24 + (i % 18),
          memberLevel: i % 4 === 0 ? '钻石会员' : i % 4 === 1 ? '金卡会员' : i % 4 === 2 ? '银卡会员' : '普通会员',
          source: 'MVP演示导入',
          totalSpent: 1280 + i * 680,
          visitCount: 3 + i,
          lastVisitDate: daysFromNow(-5 - i * 4),
          skinType: skinTypes[i % skinTypes.length],
          tags: i % 2 === 0 ? ['补水护理', '活跃客户'] : ['敏感修护', '可唤醒'],
          remark: '用于补齐空门店的 MVP 演示客户，不覆盖历史客户数据。',
        },
      });
      inc(report.createdCounts, 'customers');

      await prisma.customerHealthProfile.create({
        data: {
          customerId: customer.id,
          skinType: skinTypes[i % skinTypes.length],
          skinStatus: i % 2 === 0 ? '轻度缺水，屏障稳定' : '易泛红，换季敏感',
          mainProblems: i % 2 === 0 ? '干燥、细纹、暗沉' : '敏感、泛红、屏障薄弱',
          allergyHistory: i % 5 === 0 ? '对酒精类护肤品敏感' : '无明显过敏史',
          goals: i % 2 === 0 ? '提升水润度和光泽感' : '舒缓修护，降低泛红',
          recommendedCare: i % 2 === 0 ? '建议每 14 天进行补水护理，搭配屏障修护乳。' : '建议先做敏感肌舒缓修护，再逐步加入清洁焕肤。',
          instrument: 'Ami Aura Lite',
          lastCheck: daysFromNow(-i),
        },
      });
      inc(report.createdCounts, 'healthProfiles');

      await prisma.consumptionRecord.createMany({
        data: [
          {
            customerId: customer.id,
            consumeType: '服务项目',
            consumeContent: i % 2 === 0 ? '深层补水护理' : '敏感肌舒缓修护',
            payMethod: '微信支付',
            amount: 298 + (i % 3) * 100,
            campaign: i % 2 === 0 ? '新客体验' : '会员护理',
            consumeTime: daysFromNow(-18 - i),
          },
          {
            customerId: customer.id,
            consumeType: '商品购买',
            consumeContent: i % 2 === 0 ? '玻尿酸保湿精华' : '舒缓修护面膜',
            payMethod: '会员余额',
            amount: 168 + (i % 4) * 60,
            campaign: '门店复购',
            consumeTime: daysFromNow(-7 - i),
          },
        ],
        skipDuplicates: true,
      });
      inc(report.createdCounts, 'consumptionRecords', 2);
    }
  }
}

async function seedCustomerCards(stores: Awaited<ReturnType<typeof ensureStores>>, cards: Map<string, any>) {
  const cardList = Array.from(cards.values()).filter((card) => card.id && card.id > 0);
  if (!cardList.length) return;
  for (const store of stores) {
    const customers = await pickCustomersByStore(store.id, 24);
    for (const [index, customer] of customers.entries()) {
      const card = cardList[index % cardList.length];
      const existing = await prisma.customerCard.findFirst({ where: { customerId: customer.id, cardId: card.id } });
      if (existing) {
        inc(report.skippedCounts, 'customerCards');
      } else if (dryRun) {
        inc(report.createdCounts, 'customerCards');
      } else {
        const used = index % 5;
        await prisma.customerCard.create({
          data: {
            customerId: customer.id,
            cardId: card.id,
            cardName: card.name,
            totalTimes: card.totalTimes,
            remainingTimes: Math.max(1, card.totalTimes - used),
            expiryDate: daysFromNow(360 + index),
            status: 'active',
          },
        });
        inc(report.createdCounts, 'customerCards');
      }
    }
  }
}

async function seedCustomerBalances(stores: Awaited<ReturnType<typeof ensureStores>>) {
  for (const store of stores) {
    const customers = await pickCustomersByStore(store.id, 12);
    for (const [index, customer] of customers.entries()) {
      const existing = await prisma.customerBalanceAccount.findUnique({
        where: { customerId_storeId: { customerId: customer.id, storeId: store.id } },
      });
      if (existing) {
        inc(report.skippedCounts, 'balanceAccounts');
        continue;
      }
      if (dryRun) {
        inc(report.createdCounts, 'balanceAccounts');
        inc(report.createdCounts, 'balanceTransactions');
        continue;
      }

      const amount = 500 + index * 100;
      const giftAmount = index % 3 === 0 ? 100 : 50;
      const account = await prisma.customerBalanceAccount.create({
        data: {
          customerId: customer.id,
          storeId: store.id,
          cashBalance: amount,
          giftBalance: giftAmount,
          status: 'active',
        },
      });
      await prisma.customerBalanceTransaction.create({
        data: {
          accountId: account.id,
          customerId: customer.id,
          storeId: store.id,
          transactionNo: `MVP-BAL-${store.id}-${customer.id}`,
          type: 'recharge',
          amount,
          giftAmount,
          cashBalanceBefore: 0,
          cashBalanceAfter: amount,
          giftBalanceBefore: 0,
          giftBalanceAfter: giftAmount,
          paymentMethod: 'wechat',
          remark: 'MVP 演示充值余额',
        },
      });
      inc(report.createdCounts, 'balanceAccounts');
      inc(report.createdCounts, 'balanceTransactions');
    }
  }
}

async function seedReservationsAndTasks(stores: Awaited<ReturnType<typeof ensureStores>>, projectsByStoreName: Map<string, any>) {
  const statuses: ServiceTaskStatus[] = [
    ServiceTaskStatus.pending,
    ServiceTaskStatus.in_progress,
    ServiceTaskStatus.completed,
    ServiceTaskStatus.cancelled,
  ];
  for (const store of stores) {
    const [customers, beauticians, device] = await Promise.all([
      pickCustomersByStore(store.id, 12),
      prisma.beautician.findMany({ where: { storeId: store.id, status: 'active' }, orderBy: { id: 'asc' } }),
      prisma.terminalDevice.findFirst({ where: { storeId: store.id }, orderBy: { id: 'asc' } }),
    ]);
    const projects = projectCatalog
      .map((project) => projectsByStoreName.get(`${store.id}:${project.name}`))
      .filter((project) => project?.id && project.id > 0);
    if (!customers.length || !beauticians.length || !projects.length) {
      report.warnings.push(`门店 ${store.name} 缺少客户/美容师/项目，跳过预约与服务任务生成。`);
      continue;
    }
    for (let i = 0; i < Math.min(12, customers.length); i += 1) {
      const customer = customers[i];
      const beautician = beauticians[i % beauticians.length];
      const project = projects[i % projects.length];
      const appointment = daysFromNow(i % 7, 10 + (i % 6), i % 2 ? 30 : 0);
      const reservationRemark = 'MVP 演示预约';
      const reservationExisting = await prisma.reservation.findFirst({
        where: { storeId: store.id, customerId: customer.id, projectId: project.id, remark: reservationRemark },
      });
      if (reservationExisting) {
        inc(report.skippedCounts, 'reservations');
      } else if (dryRun) {
        inc(report.createdCounts, 'reservations');
      } else {
        const end = new Date(appointment);
        end.setMinutes(end.getMinutes() + project.duration);
        await prisma.reservation.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            projectId: project.id,
            beauticianId: beautician.id,
            date: onlyDate(appointment),
            startTime: timeText(appointment),
            endTime: timeText(end),
            status: i % 5 === 4 ? 'cancelled' : i % 3 === 0 ? 'confirmed' : 'pending',
            remark: reservationRemark,
          },
        });
        inc(report.createdCounts, 'reservations');
      }

      const taskNo = `MVP-TASK-${store.id}-${String(i + 1).padStart(3, '0')}`;
      const taskExisting = await prisma.serviceTask.findUnique({ where: { taskNo } });
      if (taskExisting) {
        inc(report.skippedCounts, 'serviceTasks');
      } else if (dryRun) {
        inc(report.createdCounts, 'serviceTasks');
      } else {
        const status = statuses[i % statuses.length];
        await prisma.serviceTask.create({
          data: {
            taskNo,
            customerId: customer.id,
            projectId: project.id,
            beauticianId: beautician.id,
            deviceId: device?.id,
            storeId: store.id,
            appointmentTime: appointment,
            duration: project.duration,
            status,
            startedAt: status === ServiceTaskStatus.in_progress || status === ServiceTaskStatus.completed ? appointment : undefined,
            completedAt: status === ServiceTaskStatus.completed ? new Date(appointment.getTime() + project.duration * 60000) : undefined,
            remark: 'MVP 演示服务任务',
            consumptionItems: [
              { productName: '舒缓修护面膜', actualQty: 1, unit: '片' },
              { productName: '一次性护理巾', actualQty: 2, unit: '片' },
            ],
            images: [],
          },
        });
        inc(report.createdCounts, 'serviceTasks');
      }
    }
  }
}

async function seedSkinTests(stores: Awaited<ReturnType<typeof ensureStores>>) {
  const profiles = await prisma.customerHealthProfile.findMany({ take: 60, orderBy: { lastCheck: 'desc' } });
  for (const [index, profile] of profiles.entries()) {
    const customer = await prisma.customer.findUnique({ where: { id: profile.customerId } });
    if (!customer) continue;
    const store = stores.find((item) => item.id === customer.storeId);
    const device = store ? await prisma.terminalDevice.findFirst({ where: { storeId: store.id } }) : null;
    const existing = await prisma.skinTest.findFirst({ where: { customerId: customer.id, skinType: profile.skinType } });
    if (existing) {
      inc(report.skippedCounts, 'skinTests');
    } else if (dryRun) {
      inc(report.createdCounts, 'skinTests');
    } else {
      await prisma.skinTest.create({
        data: {
          customerId: customer.id,
          deviceId: device?.id,
          images: [],
          metrics: {
            moisture: 48 + (index % 18),
            oil: 35 + (index % 20),
            elasticity: 62 + (index % 16),
            sensitivity: 20 + (index % 30),
          },
          skinType: profile.skinType,
          skinStatus: profile.skinStatus,
          mainProblems: profile.mainProblems,
          recommendationText: profile.recommendedCare || '建议结合补水、屏障修护和周期护理进行跟进。',
          createdAt: daysFromNow(-index),
        },
      });
      inc(report.createdCounts, 'skinTests');
    }
  }
}

async function seedCardUsage() {
  const customerCards = await prisma.customerCard.findMany({ take: 30, orderBy: { createdAt: 'desc' } });
  const beauticians = await prisma.beautician.findMany({ take: 10, orderBy: { id: 'asc' } });
  const projects = await prisma.project.findMany({ where: { deletedAt: null }, take: 10, orderBy: { id: 'asc' } });
  for (const [index, customerCard] of customerCards.entries()) {
    const existing = await prisma.cardUsageRecord.findFirst({
      where: { customerId: customerCard.customerId, cardName: customerCard.cardName, verifiedAt: { gte: daysFromNow(-45) } },
    });
    if (existing) {
      inc(report.skippedCounts, 'cardUsageRecords');
    } else if (dryRun) {
      inc(report.createdCounts, 'cardUsageRecords');
    } else {
      const customer = await prisma.customer.findUnique({ where: { id: customerCard.customerId } });
      const project = projects[index % projects.length];
      await prisma.cardUsageRecord.create({
        data: {
          customerId: customerCard.customerId,
          customerName: customer?.name ?? '客户',
          cardName: customerCard.cardName,
          projectName: project?.name ?? '深层补水护理',
          times: 1,
          remainingTimes: Math.max(0, customerCard.remainingTimes - 1),
          beauticianId: beauticians[index % Math.max(1, beauticians.length)]?.id,
          verifiedAt: daysFromNow(-index),
        },
      });
      inc(report.createdCounts, 'cardUsageRecords');
    }
  }
}

async function seedPurchaseAndTransfer(stores: Awaited<ReturnType<typeof ensureStores>>) {
  const purchaseNo = 'MVP-PUR-2026-001';
  const purchase = await prisma.purchaseOrder.findUnique({ where: { orderNo: purchaseNo } });
  if (purchase) {
    inc(report.skippedCounts, 'purchaseOrders');
  } else if (dryRun) {
    inc(report.createdCounts, 'purchaseOrders');
  } else {
    await prisma.purchaseOrder.create({
      data: {
        orderNo: purchaseNo,
        supplier: 'Ami 官方供应链',
        totalAmount: 28600,
        status: 'approved',
        items: productCatalog.slice(0, 5).map((product) => ({ sku: product.sku, name: product.name, quantity: 20, unitPrice: product.costPrice })),
      },
    });
    inc(report.createdCounts, 'purchaseOrders');
  }
  if (stores.length >= 2) {
    const transferNo = 'MVP-TRF-2026-001';
    const transfer = await prisma.transferOrder.findUnique({ where: { orderNo: transferNo } });
    if (transfer) {
      inc(report.skippedCounts, 'transferOrders');
    } else if (dryRun) {
      inc(report.createdCounts, 'transferOrders');
    } else {
      await prisma.transferOrder.create({
        data: {
          orderNo: transferNo,
          fromStoreId: stores[0].id,
          toStoreId: stores[1].id,
          productCount: 3,
          status: 'pending',
          items: productCatalog.slice(0, 3).map((product) => ({ sku: product.sku, name: product.name, quantity: 6 })),
        },
      });
      inc(report.createdCounts, 'transferOrders');
    }
  }
}

async function ensureOrderItem(orderId: number, item: { itemType: string; itemId?: number; name: string; quantity: number; unitPrice: number; payload?: any }) {
  const existing = await prisma.orderItem.findFirst({ where: { orderId, itemType: item.itemType, itemId: item.itemId } });
  if (existing) {
    inc(report.skippedCounts, 'orderItems');
    return existing;
  }
  if (dryRun) {
    inc(report.createdCounts, 'orderItems');
    return null;
  }
  inc(report.createdCounts, 'orderItems');
  return prisma.orderItem.create({
    data: {
      orderId,
      itemType: item.itemType,
      itemId: item.itemId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.quantity * item.unitPrice,
      payload: item.payload ?? item,
    },
  });
}

async function ensurePaymentRecord(orderId: number, orderNo: string, method: string, amount: number) {
  const paymentNo = `MVP-PAY-${orderNo}`;
  const existing = await prisma.paymentRecord.findUnique({ where: { paymentNo } });
  if (existing) {
    inc(report.skippedCounts, 'paymentRecords');
    return existing;
  }
  if (dryRun) {
    inc(report.createdCounts, 'paymentRecords');
    return null;
  }
  inc(report.createdCounts, 'paymentRecords');
  return prisma.paymentRecord.create({
    data: {
      orderId,
      paymentNo,
      method,
      amount,
      status: 'success',
      transactionNo: `MVP-TXN-${orderNo}`,
      paidAt: daysFromNow(-2),
    },
  });
}

async function ensureRefundRecord(orderId: number, orderNo: string, amount: number) {
  const refundNo = `MVP-REF-${orderNo}`;
  const existing = await prisma.refundRecord.findUnique({ where: { refundNo } });
  if (existing) {
    inc(report.skippedCounts, 'refundRecords');
    return existing;
  }
  if (dryRun) {
    inc(report.createdCounts, 'refundRecords');
    return null;
  }
  inc(report.createdCounts, 'refundRecords');
  return prisma.refundRecord.create({
    data: {
      orderId,
      refundNo,
      amount,
      reason: 'MVP 演示退款',
      status: 'success',
      refundedAt: daysFromNow(-1),
    },
  });
}

async function ensureStockMovement(data: {
  storeId: number;
  productId: number;
  batchId?: number;
  movementNo: string;
  movementType: string;
  quantity: number;
  beforeStock: number;
  afterStock: number;
  unit?: string | null;
  sourceType: string;
  sourceId?: number;
  sourceNo?: string;
  remark?: string;
}) {
  const existing = await prisma.stockMovement.findUnique({ where: { movementNo: data.movementNo } });
  if (existing) {
    inc(report.skippedCounts, 'stockMovements');
    return existing;
  }
  if (dryRun) {
    inc(report.createdCounts, 'stockMovements');
    return null;
  }
  inc(report.createdCounts, 'stockMovements');
  return prisma.stockMovement.create({ data });
}

async function ensureMarketingAttribution(customerId: number, orderId: number, amount: number) {
  const existing = await prisma.marketingAttribution.findFirst({ where: { orderId } });
  if (existing) {
    inc(report.skippedCounts, 'marketingAttributions');
    return existing;
  }

  const strategyName = 'MVP 数据闭环回访策略';
  let strategy = await prisma.marketingAutomationStrategy.findFirst({ where: { name: strategyName } });
  if (!strategy) {
    if (dryRun) {
      if (!dryRunMarketingPlan.strategyCreated) {
        inc(report.createdCounts, 'marketingStrategies');
        dryRunMarketingPlan.strategyCreated = true;
      }
      strategy = { id: DRY_RUN_ID_BASE + 1, name: strategyName } as any;
    } else {
      strategy = await prisma.marketingAutomationStrategy.create({
      data: {
        name: strategyName,
        description: 'MVP demo strategy for order attribution.',
        status: MarketingStrategyStatus.enabled,
        executionType: 'auto',
        schedule: { type: 'manual' },
        triggerRules: [{ type: 'member_level', params: { levels: ['金卡会员', '钻石会员'] } }],
        actions: [{ type: 'wechat', value: '会员护理回访' }],
        targetCount: 1,
      },
      });
      inc(report.createdCounts, 'marketingStrategies');
    }
  } else {
    inc(report.skippedCounts, 'marketingStrategies');
  }

  let execution = await prisma.marketingAutomationExecution.findFirst({
    where: { strategyId: strategy.id, message: 'MVP 数据闭环演示执行' },
  });
  if (!execution) {
    if (dryRun) {
      if (!dryRunMarketingPlan.executionCreated) {
        inc(report.createdCounts, 'marketingExecutions');
        dryRunMarketingPlan.executionCreated = true;
      }
      execution = { id: DRY_RUN_ID_BASE + 2, strategyId: strategy.id, strategyName: strategy.name } as any;
    } else {
      execution = await prisma.marketingAutomationExecution.create({
      data: {
        strategyId: strategy.id,
        strategyName: strategy.name,
        status: 'completed',
        triggeredCount: 1,
        reachedCount: 1,
        channel: 'wechat',
        message: 'MVP 数据闭环演示执行',
      },
      });
      inc(report.createdCounts, 'marketingExecutions');
    }
  } else {
    inc(report.skippedCounts, 'marketingExecutions');
  }

  let touch = await prisma.marketingAutomationTouch.findFirst({ where: { executionId: execution.id, customerId } });
  if (!touch) {
    if (dryRun) {
      if (!dryRunMarketingPlan.touchCustomerIds.has(customerId)) {
        inc(report.createdCounts, 'marketingTouches');
        dryRunMarketingPlan.touchCustomerIds.add(customerId);
      }
      touch = { id: DRY_RUN_ID_BASE + 1000 + customerId } as any;
    } else {
      touch = await prisma.marketingAutomationTouch.create({
      data: {
        executionId: execution.id,
        strategyId: strategy.id,
        customerId,
        predictedConversionScore: 86,
        predictedRevenue: amount,
        channel: 'wechat',
        status: 'converted',
        touchedAt: daysFromNow(-3),
        convertedAt: daysFromNow(-2),
        conversionType: 'order',
        actualRevenue: amount,
        attributionWindowDays: 30,
      },
      });
      inc(report.createdCounts, 'marketingTouches');
    }
  } else {
    inc(report.skippedCounts, 'marketingTouches');
  }

  if (dryRun) {
    inc(report.createdCounts, 'marketingAttributions');
    return null;
  }
  inc(report.createdCounts, 'marketingAttributions');
  return prisma.marketingAttribution.create({
    data: {
      touchId: touch.id,
      strategyId: strategy.id,
      executionId: execution.id,
      customerId,
      orderId,
      attributionType: 'last_touch',
      attributedRevenue: amount,
      attributionWindowDays: 30,
      occurredAt: daysFromNow(-2),
    },
  });
}

async function seedOperatingLoopClosure(stores: Awaited<ReturnType<typeof ensureStores>>) {
  for (const store of stores.slice(0, 3)) {
    const [customer, product, project, task, device] = await Promise.all([
      prisma.customer.findFirst({ where: { storeId: store.id, deletedAt: null }, orderBy: [{ totalSpent: 'desc' }, { id: 'asc' }] }),
      prisma.product.findFirst({ where: { storeId: store.id, deletedAt: null }, orderBy: { id: 'asc' } }),
      prisma.project.findFirst({ where: { storeId: store.id, deletedAt: null }, orderBy: { id: 'asc' } }),
      prisma.serviceTask.findFirst({ where: { storeId: store.id }, orderBy: { id: 'asc' } }),
      prisma.terminalDevice.findFirst({ where: { storeId: store.id }, orderBy: { id: 'asc' } }),
    ]);
    if (!customer || !product) {
      report.warnings.push(`门店 ${store.name} 缺少客户或商品，跳过经营闭环演示数据。`);
      continue;
    }

    const batch = await prisma.stockBatch.findFirst({ where: { productId: product.id }, orderBy: { id: 'asc' } });
    await ensureStockMovement({
      storeId: store.id,
      productId: product.id,
      batchId: batch?.id,
      movementNo: `MVP-SM-IN-${store.id}-${product.id}`,
      movementType: 'inbound',
      quantity: Number(product.currentStock ?? 0),
      beforeStock: 0,
      afterStock: Number(product.currentStock ?? 0),
      unit: product.unit,
      sourceType: 'stock_batch',
      sourceId: batch?.id,
      sourceNo: batch?.batchNo,
      remark: 'MVP 演示期初入库流水',
    });

    const itemName = project?.name ?? product.name;
    const itemType = project ? 'project' : 'product';
    const itemId = project?.id ?? product.id;
    const unitPrice = Number(project?.price ?? product.retailPrice ?? 298);
    const orderNo = `MVP-ORD-${store.id}-001`;
    let order = await prisma.productOrder.findUnique({ where: { orderNo } });
    if (order) {
      inc(report.skippedCounts, 'productOrders');
    } else if (dryRun) {
      inc(report.createdCounts, 'productOrders');
      order = { id: DRY_RUN_ID_BASE + store.id * 10 + 1, orderNo, customerId: customer.id, storeId: store.id, totalAmount: unitPrice } as any;
    } else {
      order = await prisma.productOrder.create({
        data: {
          orderNo,
          customerId: customer.id,
          customerName: customer.name,
          storeId: store.id,
          totalAmount: unitPrice,
          payMethod: 'wechat',
          status: 'completed',
          items: [{ itemType, itemId, name: itemName, quantity: 1, unitPrice }],
          remark: 'MVP 经营闭环演示订单',
        },
      });
      inc(report.createdCounts, 'productOrders');
    }

    if (order?.id && order.id > 0) {
      await ensureOrderItem(order.id, { itemType, itemId, name: itemName, quantity: 1, unitPrice });
      await ensurePaymentRecord(order.id, orderNo, 'wechat', unitPrice);
      await ensureMarketingAttribution(customer.id, order.id, unitPrice);
      if (itemType === 'product') {
        await ensureStockMovement({
          storeId: store.id,
          productId: product.id,
          batchId: batch?.id,
          movementNo: `MVP-SM-SALE-${store.id}-${order.id}`,
          movementType: 'sale_out',
          quantity: -1,
          beforeStock: Number(product.currentStock ?? 0),
          afterStock: Math.max(0, Number(product.currentStock ?? 0) - 1),
          unit: product.unit,
          sourceType: 'product_order',
          sourceId: order.id,
          sourceNo: orderNo,
          remark: 'MVP 演示商品销售出库',
        });
      }
    }

    const refundOrderNo = `MVP-ORD-${store.id}-REFUND`;
    let refundOrder = await prisma.productOrder.findUnique({ where: { orderNo: refundOrderNo } });
    if (refundOrder) {
      inc(report.skippedCounts, 'productOrders');
    } else if (dryRun) {
      inc(report.createdCounts, 'productOrders');
      refundOrder = {
        id: DRY_RUN_ID_BASE + store.id * 10 + 2,
        orderNo: refundOrderNo,
        customerId: customer.id,
        storeId: store.id,
        totalAmount: 128,
      } as any;
    } else {
      refundOrder = await prisma.productOrder.create({
        data: {
          orderNo: refundOrderNo,
          customerId: customer.id,
          customerName: customer.name,
          storeId: store.id,
          totalAmount: 128,
          payMethod: 'cash',
          status: 'refunded',
          items: [{ itemType: 'product', itemId: product.id, name: product.name, quantity: 1, unitPrice: 128 }],
          remark: 'MVP 演示退款订单',
        },
      });
      inc(report.createdCounts, 'productOrders');
    }
    if (refundOrder?.id && refundOrder.id > 0) {
      await ensureOrderItem(refundOrder.id, { itemType: 'product', itemId: product.id, name: product.name, quantity: 1, unitPrice: 128 });
      await ensurePaymentRecord(refundOrder.id, refundOrderNo, 'cash', 128);
      await ensureRefundRecord(refundOrder.id, refundOrderNo, 128);
    }

    const recommendationExisting = await prisma.recommendationEvent.findFirst({
      where: { storeId: store.id, customerId: customer.id, eventType: 'accepted', note: 'MVP 演示推荐采纳' },
    });
    if (recommendationExisting) {
      inc(report.skippedCounts, 'recommendationEvents');
    } else if (dryRun) {
      inc(report.createdCounts, 'recommendationEvents');
    } else {
      await prisma.recommendationEvent.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          deviceId: device?.id,
          recommendationId: 1000 + store.id,
          eventType: 'accepted',
          taskId: task?.id,
          orderId: order?.id && order.id > 0 ? order.id : undefined,
          note: 'MVP 演示推荐采纳',
          payload: { source: 'seed-mvp', projectId: project?.id },
        },
      });
      inc(report.createdCounts, 'recommendationEvents');
    }

    const promotionName = `${store.name} 会员护理权益`;
    const promotion = await prisma.promotion.findFirst({ where: { storeId: store.id, name: promotionName } });
    if (promotion) {
      inc(report.skippedCounts, 'promotions');
    } else if (dryRun) {
      inc(report.createdCounts, 'promotions');
    } else {
      await prisma.promotion.create({
        data: {
          storeId: store.id,
          name: promotionName,
          description: 'MVP 演示活动，覆盖终端可用活动查询。',
          discountText: '到店护理立减 80',
          applicableProjectIds: project?.id ? [project.id] : [],
          startAt: daysFromNow(-7),
          endAt: daysFromNow(30),
          status: 'active',
        },
      });
      inc(report.createdCounts, 'promotions');
    }

    const jobNo = `MVP-PJ-${store.id}-001`;
    const printJob = await prisma.printJob.findUnique({ where: { jobNo } });
    if (printJob) {
      inc(report.skippedCounts, 'printJobs');
    } else if (dryRun) {
      inc(report.createdCounts, 'printJobs');
    } else {
      await prisma.printJob.create({
        data: {
          storeId: store.id,
          jobNo,
          sourceType: 'product_order',
          sourceId: order?.id && order.id > 0 ? order.id : undefined,
          title: 'MVP 演示小票',
          content: `${store.name}\n订单：${orderNo}\n客户：${customer.name}\n金额：${unitPrice}`,
          copies: 1,
          status: 'completed',
          completedAt: daysFromNow(-2),
        },
      });
      inc(report.createdCounts, 'printJobs');
    }
  }
}

async function ensureAdminStoreAccess(stores: Awaited<ReturnType<typeof ensureStores>>, adminUser: any) {
  if (!adminUser) return;
  for (const store of stores) {
    const existing = await prisma.userStore.findUnique({ where: { userId_storeId: { userId: adminUser.id, storeId: store.id } } });
    if (existing) continue;
    if (!dryRun) {
      await prisma.userStore.create({ data: { userId: adminUser.id, storeId: store.id } });
    }
  }
}

async function main() {
  report.sourceCounts = {
    customerGenerator: 5 * 18,
    operatingLoopGenerator: 5,
    skinTestGenerator: 5,
    productCatalog: productCatalog.length,
    projectCatalog: projectCatalog.length,
    cardCatalog: cardCatalog.length,
  };

  report.beforeCounts = await getCounts();
  await syncPostgresSequences();
  const stores = await ensureStores();
  const { beauticianRole, adminUser } = await ensureRoles();
  await ensureAdminStoreAccess(stores, adminUser);

  await seedBeauticians(stores, beauticianRole);
  const productsByStoreSku = await seedProducts(stores);
  const projectsByStoreName = await seedProjects(stores, productsByStoreSku);
  const cards = await seedCards();
  await seedTerminalDevices(stores);
  await ensureStoreDemoCustomers(stores);
  await seedCustomerCards(stores, cards);
  await seedCustomerBalances(stores);
  await seedReservationsAndTasks(stores, projectsByStoreName);
  await seedSkinTests(stores);
  await seedCardUsage();
  await seedPurchaseAndTransfer(stores);
  await seedOperatingLoopClosure(stores);
  const ruleTemplateSeedResult = await seedMarketingRuleTemplates(prisma, dryRun);
  inc(report.createdCounts, 'marketingRuleTemplates', ruleTemplateSeedResult.created);
  inc(report.skippedCounts, 'marketingRuleTemplates', ruleTemplateSeedResult.skipped);

  report.afterCounts = dryRun ? report.beforeCounts : await getCounts();
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
