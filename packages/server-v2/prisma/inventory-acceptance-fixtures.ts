import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');
const verifyOnly = process.argv.includes('--verify') || process.argv.includes('--verify-only');
const dryRun = !verifyOnly && (!apply || !confirmed || process.argv.includes('--dry-run'));
const DEFAULT_STORE_NAME = 'Ami 全量演示门店';
const FIXTURE_PREFIX = '库存验收';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

function argValue(name: string, fallback?: string) {
  const dashName = name.startsWith('--') ? name : `--${name}`;
  const index = process.argv.indexOf(dashName);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  const prefix = `${dashName}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function codeBlock(value: unknown) {
  return ['```json', JSON.stringify(value ?? null, null, 2), '```'].join('\n');
}

function fixtureBlockerDetails(plan: any) {
  if (!plan.store) {
    return [{
      key: 'store',
      type: 'data_fix_required',
      owner: '技术/数据',
      action: '确认 --store-id 或 --store-name 指向有效门店。',
    }];
  }
  return [
    !plan.candidates?.projectWithBom
      ? {
          key: 'projectWithBom',
          type: 'data_fix_required',
          owner: '业务/数据',
          action: '先准备至少一个已配置 BOM 且有可扣库存的项目。',
        }
      : null,
    (!plan.skuIndex?.storeScoped || plan.skuIndex?.globalUnique)
      ? {
          key: 'skuMigration',
          type: 'authorization_required',
          owner: '技术/授权',
          action: '授权后执行 Product SKU 门店唯一 migration，解除跨店同 SKU 样本写入阻断。',
        }
      : null,
    !plan.candidates?.noBomProject
      ? {
          key: 'noBomProject',
          type: 'authorization_required',
          owner: '技术/授权',
          action: '授权执行 inventory:acceptance-fixtures --apply --yes，写入未配置 BOM 项目样本。',
        }
      : null,
    plan.candidates?.projectWithBom && !plan.candidates?.cardUsageCandidate
      ? {
          key: 'cardUsageCandidate',
          type: 'authorization_required',
          owner: '技术/授权',
          action: '授权执行 inventory:acceptance-fixtures --apply --yes，写入验收客户、次卡和客户次卡。',
        }
      : null,
    !plan.candidates?.transferFixtureSourceProduct
      ? {
          key: 'transferSourceProduct',
          type: 'data_fix_required',
          owner: '业务/数据',
          action: '先准备一个当前门店有库存且有 SKU 的商品，作为调拨源。',
        }
      : null,
    !plan.candidates?.transferCandidate
      ? {
          key: 'transferCandidate',
          type: (!plan.skuIndex?.storeScoped || plan.skuIndex?.globalUnique) ? 'authorization_required' : 'authorization_required',
          owner: '技术/授权',
          action: (!plan.skuIndex?.storeScoped || plan.skuIndex?.globalUnique)
            ? '先授权应用 SKU migration，再执行 fixtures 写入跨店同 SKU 调拨样本。'
            : '授权执行 inventory:acceptance-fixtures --apply --yes，写入跨店同 SKU 调拨样本。',
        }
      : null,
  ].filter(Boolean);
}

function parseProjectIdsFromCard(cardProjects: unknown) {
  const rawItems = Array.isArray(cardProjects) ? cardProjects : [];
  return rawItems
    .map((item: any) => Number(item?.projectId ?? item?.id ?? item))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function hasStoreScopedSkuIndex() {
  const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `select indexname from pg_indexes where schemaname = current_schema() and tablename = 'Product' and indexname in ('Product_storeId_sku_key', 'Product_sku_key')`,
  );
  const names = new Set(rows.map((row) => row.indexname));
  return {
    storeScoped: names.has('Product_storeId_sku_key'),
    globalUnique: names.has('Product_sku_key'),
    indexes: [...names],
  };
}

async function selectStore() {
  const storeId = Number(argValue('store-id') ?? argValue('storeId'));
  if (Number.isInteger(storeId) && storeId > 0) {
    return prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
  }
  const storeName = argValue('store-name') ?? argValue('storeName') ?? DEFAULT_STORE_NAME;
  return prisma.store.findFirst({ where: { name: storeName, deletedAt: null } });
}

async function findNoBomProject(storeId: number) {
  return prisma.project.findFirst({
    where: { storeId, deletedAt: null, bomItems: { none: {} } },
    orderBy: { id: 'asc' },
  });
}

async function findProjectWithBom(storeId: number) {
  return prisma.project.findFirst({
    where: { storeId, deletedAt: null, bomItems: { some: {} } },
    include: { bomItems: { take: 3, include: { product: true } } },
    orderBy: { id: 'asc' },
  });
}

async function findProjectWithDeductibleBom(storeId: number) {
  const projects = await prisma.project.findMany({
    where: { storeId, deletedAt: null, bomItems: { some: {} } },
    include: {
      bomItems: {
        include: { product: { select: { id: true, name: true, sku: true, currentStock: true } } },
        take: 20,
      },
    },
    orderBy: { id: 'asc' },
    take: 100,
  });
  const scored = projects.map((project: any) => {
    const deductibleCount = project.bomItems.filter((item: any) => toNumber(item.product?.currentStock) > 0 && toNumber(item.standardQty) > 0).length;
    const enoughCount = project.bomItems.filter((item: any) => toNumber(item.product?.currentStock) >= toNumber(item.standardQty) && toNumber(item.standardQty) > 0).length;
    return { project, deductibleCount, enoughCount };
  });
  return scored.sort((a, b) => b.enoughCount - a.enoughCount || b.deductibleCount - a.deductibleCount || a.project.id - b.project.id)[0]?.project ?? null;
}

async function findCardUsageCandidate(projectId: number) {
  const cards = await prisma.customerCard.findMany({
    where: { status: 'active', remainingTimes: { gt: 0 }, card: { status: 'active' } },
    include: { customer: true, card: true },
    take: 1000,
    orderBy: { id: 'asc' },
  });
  return cards.find((customerCard: any) => parseProjectIdsFromCard(customerCard.card?.projects).includes(projectId)) ?? null;
}

async function findTransferCandidate() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, sku: { not: '' } },
    select: {
      id: true,
      storeId: true,
      sku: true,
      name: true,
      currentStock: true,
      safetyStock: true,
      unit: true,
      store: { select: { name: true } },
    },
    take: 3000,
  });
  const bySku = new Map<string, any[]>();
  for (const product of products) {
    const list = bySku.get(product.sku) ?? [];
    list.push(product);
    bySku.set(product.sku, list);
  }
  for (const list of bySku.values()) {
    if (list.length < 2) continue;
    const source = [...list].sort((a, b) => toNumber(b.currentStock) - toNumber(a.currentStock))[0];
    const target = [...list].sort((a, b) => toNumber(a.currentStock) - toNumber(b.currentStock))[0];
    if (source.id !== target.id && toNumber(source.currentStock) > 0) return { source, target };
  }
  return null;
}

async function buildPlan() {
  const store = await selectStore();
  if (!store) {
    return {
      mode: verifyOnly ? 'verify' : dryRun ? 'dry-run' : 'apply',
      dryRun,
      applyAllowed: false,
      blockers: [`门店不存在：${argValue('store-id') ?? argValue('store-name') ?? DEFAULT_STORE_NAME}`],
      plannedSteps: [],
    };
  }

  const [skuIndex, noBomProject, projectWithBom, transferCandidate] = await Promise.all([
    hasStoreScopedSkuIndex(),
    findNoBomProject(store.id),
    findProjectWithDeductibleBom(store.id),
    findTransferCandidate(),
  ]);
  const cardUsageCandidate = projectWithBom ? await findCardUsageCandidate(projectWithBom.id) : null;
  const sourceProduct = await prisma.product.findFirst({
    where: { storeId: store.id, deletedAt: null, currentStock: { gt: 0 }, sku: { not: '' } },
    orderBy: { currentStock: 'desc' },
  });
  const otherStore = await prisma.store.findFirst({
    where: { id: { not: store.id }, deletedAt: null },
    orderBy: { id: 'asc' },
  });

  const blockers = [
    !projectWithBom ? '当前门店缺少可扣库存的 BOM 项目，无法准备次卡核销验收样本' : null,
    !sourceProduct ? '当前门店缺少有库存且有 SKU 的商品，无法准备调拨验收样本' : null,
    !skuIndex.storeScoped || skuIndex.globalUnique
      ? '数据库尚未应用 Product SKU 门店唯一迁移，跨店同 SKU 调拨样本无法写入'
      : null,
  ].filter(Boolean);

  return {
    mode: verifyOnly ? 'verify' : dryRun ? 'dry-run' : 'apply',
    dryRun,
    applyAllowed: blockers.length === 0 && apply && confirmed,
    store: { id: store.id, name: store.name },
    skuIndex,
    candidates: {
      noBomProject: noBomProject ? { id: noBomProject.id, name: noBomProject.name } : null,
      projectWithBom: projectWithBom
        ? {
            id: projectWithBom.id,
            name: projectWithBom.name,
            bomItems: projectWithBom.bomItems.map((item: any) => ({
              productId: item.productId,
              productName: item.product?.name,
              standardQty: toNumber(item.standardQty),
              unit: item.unit,
            })),
          }
        : null,
      cardUsageCandidate: cardUsageCandidate
        ? {
            customerCardId: cardUsageCandidate.id,
            customerName: cardUsageCandidate.customer?.name,
            cardName: cardUsageCandidate.cardName,
            remainingTimes: cardUsageCandidate.remainingTimes,
          }
        : null,
      transferCandidate: transferCandidate
        ? {
            source: {
              productId: transferCandidate.source.id,
              storeId: transferCandidate.source.storeId,
              storeName: transferCandidate.source.store?.name,
              sku: transferCandidate.source.sku,
              stock: toNumber(transferCandidate.source.currentStock),
            },
            target: {
              productId: transferCandidate.target.id,
              storeId: transferCandidate.target.storeId,
              storeName: transferCandidate.target.store?.name,
              sku: transferCandidate.target.sku,
              stock: toNumber(transferCandidate.target.currentStock),
            },
          }
        : null,
      transferFixtureSourceProduct: sourceProduct
        ? { id: sourceProduct.id, sku: sourceProduct.sku, name: sourceProduct.name, stock: toNumber(sourceProduct.currentStock) }
        : null,
      transferFixtureTargetStore: otherStore ? { id: otherStore.id, name: otherStore.name } : { name: `${FIXTURE_PREFIX}调拨门店` },
    },
    blockers,
    blockerDetails: null,
    plannedSteps: [
      noBomProject ? '未配置 BOM 项目已存在，无需写入' : '创建一个未配置 BOM 的服务项目',
      cardUsageCandidate ? '次卡核销候选已存在，无需写入' : '创建验收客户、关联 BOM 项目的次卡和客户次卡',
      transferCandidate ? '跨店同 SKU 调拨候选已存在，无需写入' : '创建或复用目标门店，并复制一个同 SKU 低库存商品作为调拨目标',
    ],
  };
}

async function applyFixtures(plan: any) {
  const storeId = Number(plan.store.id);
  const now = new Date();
  const expiryDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

  let noBomProject = await findNoBomProject(storeId);
  if (!noBomProject) {
    noBomProject = await prisma.project.create({
      data: {
        storeId,
        name: `${FIXTURE_PREFIX}-未配置BOM项目`,
        description: '用于库存补齐 T0.2/T8.3 验收的无 BOM 项目样本。',
        price: 99,
        duration: 30,
        online: false,
        status: 'active',
      },
    });
  }

  const projectWithBom = await findProjectWithDeductibleBom(storeId);
  let cardUsageCandidate = projectWithBom ? await findCardUsageCandidate(projectWithBom.id) : null;
  if (projectWithBom && !cardUsageCandidate) {
    const customer =
      (await prisma.customer.findFirst({ where: { storeId, name: `${FIXTURE_PREFIX}客户`, deletedAt: null } })) ??
      (await prisma.customer.create({
        data: {
          storeId,
          name: `${FIXTURE_PREFIX}客户`,
          phone: `199${String(storeId).padStart(8, '0')}`,
          memberLevel: '体验会员',
          source: 'inventory_acceptance_fixture',
        },
      }));
    const existingCard = await prisma.card.findFirst({ where: { storeId, name: `${FIXTURE_PREFIX}-BOM核销次卡` } });
    const cardProjects = [{ projectId: projectWithBom.id, name: projectWithBom.name }];
    const card = existingCard
      ? await prisma.card.update({
          where: { id: existingCard.id },
          data: {
            projects: cardProjects,
            status: 'active',
          },
        })
      : await prisma.card.create({
          data: {
            storeId,
            name: `${FIXTURE_PREFIX}-BOM核销次卡`,
            description: '用于库存补齐 T8.3 次卡核销扣 BOM 验收。',
            totalTimes: 3,
            price: 0,
            projects: cardProjects,
            validDays: 365,
            status: 'active',
          },
        });
    const reusableCustomerCard = await prisma.customerCard.findFirst({
      where: {
        customerId: customer.id,
        cardId: card.id,
        status: 'active',
        remainingTimes: { gt: 0 },
      },
      include: { customer: true, card: true },
      orderBy: { id: 'desc' },
    });
    cardUsageCandidate = reusableCustomerCard ?? await prisma.customerCard.create({
      data: {
        customerId: customer.id,
        cardId: card.id,
        cardName: card.name,
        totalTimes: 3,
        remainingTimes: 3,
        paidAmount: 0,
        expiryDate,
        status: 'active',
      },
      include: { customer: true, card: true },
    });
  }

  let transferCandidate = await findTransferCandidate();
  if (!transferCandidate) {
    const sourceProduct = await prisma.product.findFirst({
      where: { storeId, deletedAt: null, currentStock: { gt: 0 }, sku: { not: '' } },
      orderBy: { currentStock: 'desc' },
    });
    if (sourceProduct) {
      const targetStore =
        (await prisma.store.findFirst({ where: { id: { not: storeId }, deletedAt: null }, orderBy: { id: 'asc' } })) ??
        (await prisma.store.create({
          data: {
            name: `${FIXTURE_PREFIX}调拨门店`,
            city: '杭州市',
            address: '库存验收样本门店',
            status: 'active',
          },
        }));
      await prisma.product.upsert({
        where: { storeId_sku: { storeId: targetStore.id, sku: sourceProduct.sku } },
        update: {
          name: sourceProduct.name,
          categoryId: sourceProduct.categoryId,
          brand: sourceProduct.brand,
          spec: sourceProduct.spec,
          unit: sourceProduct.unit,
          costPrice: sourceProduct.costPrice,
          retailPrice: sourceProduct.retailPrice,
          currentStock: 0,
          safetyStock: Math.max(1, toNumber(sourceProduct.safetyStock) || 1),
          status: 'active',
          deletedAt: null,
        },
        create: {
          storeId: targetStore.id,
          categoryId: sourceProduct.categoryId,
          sku: sourceProduct.sku,
          name: sourceProduct.name,
          brand: sourceProduct.brand,
          spec: sourceProduct.spec,
          unit: sourceProduct.unit,
          costPrice: sourceProduct.costPrice,
          retailPrice: sourceProduct.retailPrice,
          currentStock: 0,
          safetyStock: Math.max(1, toNumber(sourceProduct.safetyStock) || 1),
          status: 'active',
        },
      });
      transferCandidate = await findTransferCandidate();
    }
  }

  return {
    noBomProject: noBomProject ? { id: noBomProject.id, name: noBomProject.name } : null,
    cardUsageCandidate: cardUsageCandidate
      ? {
          customerCardId: cardUsageCandidate.id,
          customerName: cardUsageCandidate.customer?.name,
          cardName: cardUsageCandidate.cardName,
          remainingTimes: cardUsageCandidate.remainingTimes,
        }
      : null,
    transferCandidate: transferCandidate
      ? {
          sourceProductId: transferCandidate.source.id,
          targetProductId: transferCandidate.target.id,
          sku: transferCandidate.source.sku,
          sourceStoreId: transferCandidate.source.storeId,
          targetStoreId: transferCandidate.target.storeId,
        }
      : null,
  };
}

function renderMarkdown(report: any) {
  const candidates = report.candidates ?? {};
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  const blockerDetails = Array.isArray(report.blockerDetails) ? report.blockerDetails : fixtureBlockerDetails(report);
  const plannedSteps = Array.isArray(report.plannedSteps) ? report.plannedSteps : [];
  const applied = report.applied ?? null;

  return `# 库存验收样本预检报告

生成时间：${new Date().toISOString()}
模式：${report.mode ?? '-'}
门店：${report.store ? `${report.store.name}（ID: ${report.store.id}）` : '未找到'}
是否允许写入：${report.applyAllowed ? '是' : '否'}

## 1. 前置状态

${table(['检查项', '状态', '说明'], [
  ['门店', report.store ? '已找到' : '缺失', report.store ? `${report.store.name} / ${report.store.id}` : '请检查 --store-id 或 --store-name'],
  [
    'SKU 唯一索引',
    report.skuIndex?.storeScoped && !report.skuIndex?.globalUnique ? '已就绪' : '未就绪',
    `门店内唯一：${report.skuIndex?.storeScoped ? '是' : '否'}；全局唯一：${report.skuIndex?.globalUnique ? '是' : '否'}；索引：${(report.skuIndex?.indexes ?? []).join(', ') || '-'}`,
  ],
  ['未配置 BOM 项目', candidates.noBomProject ? '已存在' : '缺失', candidates.noBomProject ? `${candidates.noBomProject.name} / ${candidates.noBomProject.id}` : '需要 fixtures 写入样本'],
  ['可扣 BOM 项目', candidates.projectWithBom ? '已存在' : '缺失', candidates.projectWithBom ? `${candidates.projectWithBom.name} / ${candidates.projectWithBom.id}` : '当前门店无可扣库存 BOM 项目'],
  ['次卡核销候选', candidates.cardUsageCandidate ? '已存在' : '缺失', candidates.cardUsageCandidate ? `${candidates.cardUsageCandidate.cardName} / ${candidates.cardUsageCandidate.customerName ?? '-'}` : '需要 fixtures 写入验收次卡'],
  ['调拨候选', candidates.transferCandidate ? '已存在' : '缺失', candidates.transferCandidate ? `${candidates.transferCandidate.source.storeName ?? candidates.transferCandidate.source.storeId} -> ${candidates.transferCandidate.target.storeName ?? candidates.transferCandidate.target.storeId} / ${candidates.transferCandidate.source.sku}` : '需要 migration 后写入跨店同 SKU 商品'],
])}

## 2. 阻塞项

${blockers.length ? blockers.map((item: string) => `- ${item}`).join('\n') : '- 无'}

## 3. 阻断归类

${blockerDetails.length ? table(['阻断项', '类型', '责任', '下一步'], blockerDetails.map((item: any) => [item.key, item.type, item.owner, item.action])) : '- 无'}

## 4. 计划写入步骤

${plannedSteps.length ? plannedSteps.map((item: string) => `- ${item}`).join('\n') : '- 无'}

## 5. 候选对象明细

${codeBlock(candidates)}

## 6. 本次写入结果

${applied ? codeBlock(applied) : '- 未执行写入；这是预检/验证报告。'}

## 7. 下一步

${report.applyAllowed
  ? '- 样本写入条件已满足，可执行真实验收前的样本准备。'
  : '- 先完成阻塞项，再执行 `inventory:acceptance-fixtures -- --store-id <门店ID> --apply --yes`。'}
`;
}

function writeReportIfRequested(report: any) {
  const outPath = argValue('out');
  if (!outPath) return;
  const resolvedOutPath = resolve(process.cwd(), outPath);
  mkdirSync(dirname(resolvedOutPath), { recursive: true });
  writeFileSync(resolvedOutPath, renderMarkdown(report), 'utf8');
}

async function main() {
  const plan = await buildPlan();
  plan.blockerDetails = fixtureBlockerDetails(plan);
  if (!plan.applyAllowed) {
    writeReportIfRequested(plan);
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const applied = await applyFixtures(plan);
  const refreshed = await buildPlan();
  const report = { ...refreshed, applied };
  writeReportIfRequested(report);
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
