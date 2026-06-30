import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value?: Date | string | null) {
  if (!value) return '-';
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return '-';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

function parseProjectIdsFromCard(cardProjects: unknown) {
  const rawItems = Array.isArray(cardProjects) ? cardProjects : [];
  return rawItems
    .map((item: any) => Number(item?.projectId ?? item?.id ?? item))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

async function selectStore() {
  const requestedStoreId = Number(argValue('--store-id'));
  if (Number.isInteger(requestedStoreId) && requestedStoreId > 0) {
    const store = await prisma.store.findUnique({ where: { id: requestedStoreId } });
    if (!store) throw new Error(`未找到门店：${requestedStoreId}`);
    return store;
  }

  const stores = await prisma.store.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, city: true, _count: { select: { products: true } } },
    orderBy: { id: 'asc' },
  });
  if (!stores.length) throw new Error('当前数据库没有可用门店');
  const scoredStores = await Promise.all(stores.map(async (store: any) => {
    const [normalCount, lowStockCount, batchProductCount, projectWithBomCount, projectWithoutBomCount, movementCount] = await Promise.all([
      prisma.product.count({ where: { storeId: store.id, deletedAt: null, currentStock: { gt: prisma.product.fields.safetyStock } } }),
      prisma.product.count({ where: { storeId: store.id, deletedAt: null, currentStock: { lte: prisma.product.fields.safetyStock } } }),
      prisma.product.count({ where: { storeId: store.id, deletedAt: null, batches: { some: { stock: { gt: 0 }, expiryDate: { not: null } } } } }),
      prisma.project.count({ where: { storeId: store.id, deletedAt: null, bomItems: { some: {} } } }),
      prisma.project.count({ where: { storeId: store.id, deletedAt: null, bomItems: { none: {} } } }),
      prisma.stockMovement.count({ where: { storeId: store.id } }),
    ]);
    const score = [
      normalCount > 0 ? 1000 : 0,
      lowStockCount > 0 ? 1000 : 0,
      batchProductCount > 0 ? 1000 : 0,
      projectWithBomCount > 0 ? 1000 : 0,
      projectWithoutBomCount > 0 ? 1000 : 0,
      movementCount > 0 ? 500 : 0,
      store._count.products,
    ].reduce((sum, value) => sum + value, 0);
    return { ...store, score };
  }));
  return scoredStores.sort((a: any, b: any) => b.score - a.score || b._count.products - a._count.products)[0];
}

async function latestMovement(productId: number) {
  return prisma.stockMovement.findFirst({
    where: { productId },
    include: { batch: { select: { batchNo: true } }, operator: { select: { name: true, username: true } } },
    orderBy: { occurredAt: 'desc' },
  });
}

async function productRow(product: any) {
  const batches = await prisma.stockBatch.findMany({
    where: { productId: product.id },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    take: 5,
  });
  const movement = await latestMovement(product.id);
  return [
    product.id,
    product.sku,
    product.name,
    toNumber(product.currentStock),
    toNumber(product.safetyStock),
    batches.length ? batches.map((batch: any) => `${batch.batchNo}(${toNumber(batch.stock)},${formatDate(batch.expiryDate)})`).join('; ') : '无批次',
    movement ? `${movement.movementType}/${movement.movementNo}/${formatDateTime(movement.occurredAt)}` : '无流水',
  ];
}

async function main() {
  const store = await selectStore();
  const storeId = Number(store.id);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const defaultOut = resolve(process.cwd(), '..', '..', 'docs', '04-测试数据', `库存回归基线-${today}.md`);
  const outPath = resolve(process.cwd(), argValue('--out') ?? defaultOut);

  const [
    productCount,
    lowStockCount,
    batchCount,
    movementCount,
    bomCount,
    purchaseOrderCount,
    transferOrderCount,
  ] = await Promise.all([
    prisma.product.count({ where: { storeId, deletedAt: null } }),
    prisma.product.count({ where: { storeId, deletedAt: null, currentStock: { lte: prisma.product.fields.safetyStock } } }),
    prisma.stockBatch.count({ where: { product: { storeId, deletedAt: null } } }),
    prisma.stockMovement.count({ where: { storeId } }),
    prisma.projectBomItem.count({ where: { project: { storeId, deletedAt: null } } }),
    prisma.purchaseOrder.count(),
    prisma.transferOrder.count({ where: { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] } }),
  ]);

  const normalProduct = await prisma.product.findFirst({
    where: { storeId, deletedAt: null, currentStock: { gt: prisma.product.fields.safetyStock } },
    orderBy: { currentStock: 'desc' },
  });
  const lowStockProduct = await prisma.product.findFirst({
    where: { storeId, deletedAt: null, currentStock: { lte: prisma.product.fields.safetyStock } },
    orderBy: { currentStock: 'asc' },
  });
  const batchProduct = await prisma.product.findFirst({
    where: {
      storeId,
      deletedAt: null,
      batches: { some: { stock: { gt: 0 }, expiryDate: { not: null } } },
    },
    include: { batches: { orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }], take: 1 } },
    orderBy: { id: 'asc' },
  });
  const productSamples = [normalProduct, lowStockProduct, batchProduct].filter(Boolean);
  const uniqueProductSamples = [...new Map(productSamples.map((product: any) => [product.id, product])).values()];

  const projectWithBom = await prisma.project.findFirst({
    where: { storeId, deletedAt: null, bomItems: { some: {} } },
    include: { bomItems: { include: { product: true }, take: 5 } },
    orderBy: { id: 'asc' },
  });
  const projectWithoutBom = await prisma.project.findFirst({
    where: { storeId, deletedAt: null, bomItems: { none: {} } },
    include: { store: { select: { id: true, name: true } }, bomItems: true },
    orderBy: { id: 'asc' },
  });
  const fallbackProjectWithoutBom = projectWithoutBom
    ? null
    : await prisma.project.findFirst({
        where: { deletedAt: null, bomItems: { none: {} } },
        include: { store: { select: { id: true, name: true } }, bomItems: true },
        orderBy: { id: 'asc' },
      });
  const noBomProjectSample = projectWithoutBom ?? fallbackProjectWithoutBom;

  const productRows = [];
  for (const product of uniqueProductSamples) {
    productRows.push(await productRow(product));
  }
  const sampleCoverageRows = [
    ['正常库存商品', normalProduct ? `已覆盖：${normalProduct.name} / ${normalProduct.sku}` : '缺失'],
    ['低库存商品', lowStockProduct ? `已覆盖：${lowStockProduct.name} / ${lowStockProduct.sku}` : '缺失'],
    ['有批次且临期商品', batchProduct ? `已覆盖：${batchProduct.name} / ${batchProduct.sku}` : '缺失'],
    ['已配置 BOM 项目', projectWithBom ? `已覆盖：${projectWithBom.name}` : '缺失'],
    ['未配置 BOM 项目', noBomProjectSample
      ? `已覆盖：${noBomProjectSample.name}${projectWithoutBom ? '' : `（跨门店候选：${noBomProjectSample.store?.name ?? `门店 ${noBomProjectSample.storeId}`}）`}`
      : '缺失：当前数据库没有未配置 BOM 项目，需补真实样本或授权造数'],
  ];

  const projectRows = [projectWithBom, noBomProjectSample].filter(Boolean).map((project: any) => [
    project.id,
    `${project.name}${project.store?.name && Number(project.store?.id) !== storeId ? `（${project.store.name}）` : ''}`,
    project.bomItems?.length ? '已配置 BOM' : '未配置 BOM',
    project.bomItems?.length
      ? project.bomItems.map((item: any) => `${item.product?.name ?? item.productId} x ${toNumber(item.standardQty)}${item.unit ?? ''}`).join('; ')
      : '-',
  ]);

  const latestMovements = await prisma.stockMovement.findMany({
    where: { storeId },
    include: {
      product: { select: { name: true, sku: true } },
      batch: { select: { batchNo: true } },
      operator: { select: { name: true, username: true } },
    },
    orderBy: { occurredAt: 'desc' },
    take: 10,
  });
  const latestMovement = await prisma.stockMovement.findFirst({
    where: { storeId },
    orderBy: { id: 'desc' },
  });

  const expiringBatch = await prisma.stockBatch.findFirst({
    where: { stock: { gt: 0 }, expiryDate: { not: null }, product: { storeId, deletedAt: null } },
    include: { product: true },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  const transferProducts = await prisma.product.findMany({
    where: { deletedAt: null, sku: { not: '' } },
    select: { id: true, storeId: true, sku: true, name: true, currentStock: true, safetyStock: true, unit: true, store: { select: { name: true } } },
    take: 2000,
  });
  const transferBySku = new Map<string, any[]>();
  for (const product of transferProducts) {
    const list = transferBySku.get(product.sku) ?? [];
    list.push(product);
    transferBySku.set(product.sku, list);
  }
  let transferCandidate: any = null;
  for (const products of transferBySku.values()) {
    if (products.length < 2) continue;
    const target = [...products].sort((a, b) => (toNumber(a.currentStock) - toNumber(a.safetyStock)) - (toNumber(b.currentStock) - toNumber(b.safetyStock)))[0];
    const source = [...products].sort((a, b) => toNumber(b.currentStock) - toNumber(a.currentStock))[0];
    const targetShortage = Math.max(0, toNumber(target.safetyStock) - toNumber(target.currentStock));
    const sourceSurplus = Math.max(0, toNumber(source.currentStock) - toNumber(source.safetyStock));
    const stockGap = Math.max(0, toNumber(source.currentStock) - toNumber(target.currentStock));
    if (source.id !== target.id && toNumber(source.currentStock) > 0 && (targetShortage > 0 || sourceSurplus > 0 || stockGap > 0)) {
      transferCandidate = { source, target, suggestedQty: Math.max(1, Math.min(sourceSurplus || stockGap || toNumber(source.currentStock), targetShortage || stockGap || Math.ceil(toNumber(source.currentStock) / 4))) };
      break;
    }
  }

  let cardUsageCandidate: any = null;
  const bomProjects = await prisma.project.findMany({
    where: { deletedAt: null, bomItems: { some: {} } },
    select: { id: true, name: true, storeId: true },
    take: 1000,
  });
  const bomProjectIds = new Set(bomProjects.map((project: any) => Number(project.id)));
  const cards = await prisma.customerCard.findMany({
    where: { status: 'active', remainingTimes: { gt: 0 }, card: { status: 'active' } },
    include: { customer: { select: { id: true, name: true } }, card: true },
    take: 1000,
    orderBy: { id: 'asc' },
  });
  cardUsageCandidate = cards
    .map((customerCard: any) => {
      const projectId = parseProjectIdsFromCard(customerCard.card?.projects).find((id) => bomProjectIds.has(id));
      const project = bomProjects.find((item: any) => Number(item.id) === Number(projectId));
      return project ? { ...customerCard, project } : null;
    })
    .find(Boolean) ?? null;

  const acceptanceRows = [
    ['打开库存页', `/inventory/stock`, '用管理端登录态打开，确认库存列表、批次侧栏和库存流水入口可见'],
    ['真实入库', normalProduct ? `${normalProduct.name} / ${normalProduct.sku} / 商品ID ${normalProduct.id}` : '缺候选', '入库后复跑基线，校验当前库存、批次和 inbound 流水增加'],
    ['手工出库/报废/盘点', batchProduct ? `${batchProduct.name} / ${batchProduct.sku} / 商品ID ${batchProduct.id}` : '缺候选', '选择批次后出库或报废，校验 StockBatch.stock、Product.currentStock 和 StockMovement'],
    ['项目订单或终端收银扣 BOM', projectWithBom ? `${projectWithBom.name} / 项目ID ${projectWithBom.id}` : '缺候选', '完成项目订单或终端收银，校验 BOM 商品 service_consume 流水'],
    ['次卡核销扣 BOM', cardUsageCandidate ? `${cardUsageCandidate.cardName} / 客户 ${cardUsageCandidate.customer?.name ?? cardUsageCandidate.customerId} / 项目 ${cardUsageCandidate.project?.name} / 剩余 ${cardUsageCandidate.remainingTimes}` : '缺候选：需要一张关联已配置 BOM 项目的有效次卡', '核销后校验剩余次数和 card_usage 来源耗材流水'],
    ['补货建议生成采购单', lowStockProduct ? `${lowStockProduct.name} / ${lowStockProduct.sku} / 当前 ${toNumber(lowStockProduct.currentStock)} / 安全 ${toNumber(lowStockProduct.safetyStock)}` : '缺候选', '从采购页补货建议生成采购单，确认未收货前库存不变'],
    ['采购单收货入库', lowStockProduct ? `${lowStockProduct.name} / ${lowStockProduct.sku}` : '缺候选', '收货后校验批次、库存和 purchase_order/supply_platform_order 流水'],
    ['生成并完成调拨', transferCandidate ? `${transferCandidate.source.store?.name} -> ${transferCandidate.target.store?.name} / ${transferCandidate.source.sku} / 建议 ${transferCandidate.suggestedQty}${transferCandidate.source.unit ?? ''}` : '缺候选：需先执行 Product SKU 门店唯一迁移，并准备两个门店同 SKU 商品', '先草稿不改库存，完成后校验 transfer_out/transfer_in 双向流水'],
    ['临期报废', expiringBatch ? `${expiringBatch.product?.name} / 批次 ${expiringBatch.batchNo} / 库存 ${toNumber(expiringBatch.stock)} / 到期 ${formatDate(expiringBatch.expiryDate)}` : '缺候选', '从过期管理执行报废，校验批次减少和损耗统计变化'],
  ];

  const content = `# 库存回归基线快照

生成时间：${now.toISOString()}
门店：${store.name}（ID: ${store.id}${store.city ? `，${store.city}` : ''}）
脚本：\`npm.cmd --prefix packages/server-v2 run inventory:baseline\`

## 1. 基线统计

${table(['指标', '数量'], [
  ['商品数', productCount],
  ['低库存商品数', lowStockCount],
  ['批次数', batchCount],
  ['库存流水数', movementCount],
  ['项目 BOM 明细数', bomCount],
  ['手动采购单数', purchaseOrderCount],
  ['相关调拨单数', transferOrderCount],
])}

## 2. 验收窗口

${table(['字段', '值'], [
  ['基线最大 StockMovement.id', latestMovement?.id ?? '-'],
  ['基线最大 StockMovement 时间', latestMovement ? formatDateTime(latestMovement.occurredAt) : '-'],
  ['发布前核验命令', latestMovement ? `npm.cmd --prefix packages/server-v2 run inventory:acceptance-verify -- --store-id ${storeId} --since-movement-id ${latestMovement.id} --strict` : '当前门店没有库存流水，首次核验可不传 since-movement-id'],
])}

## 3. 样本覆盖

${table(['样本要求', '当前覆盖'], sampleCoverageRows)}

## 4. 商品回归样本

${productRows.length ? table(['商品ID', 'SKU', '商品', '当前库存', '安全库存', '批次样本', '最近流水'], productRows) : '当前门店没有可用商品样本。'}

## 5. 项目回归样本

${projectRows.length ? table(['项目ID', '项目', 'BOM状态', 'BOM样本'], projectRows) : '当前门店没有可用项目样本。'}

## 6. 最近库存流水样本

${latestMovements.length ? table(['流水ID', '商品', '类型', '数量', '库存前后', '来源', '批次', '操作人', '时间'], latestMovements.map((movement: any) => [
  movement.id,
  `${movement.product?.name ?? movement.productId} / ${movement.product?.sku ?? '-'}`,
  movement.movementType,
  `${toNumber(movement.quantity)}${movement.unit ?? ''}`,
  `${movement.beforeStock === null ? '-' : toNumber(movement.beforeStock)} -> ${movement.afterStock === null ? '-' : toNumber(movement.afterStock)}`,
  [movement.sourceType, movement.sourceNo ?? movement.sourceId].filter(Boolean).join(' / ') || '-',
  movement.batch?.batchNo ?? '-',
  movement.operator?.name ?? movement.operator?.username ?? '-',
  formatDateTime(movement.occurredAt),
])) : '当前门店没有库存流水。'}

## 7. T8.3 真实写库验收候选

${table(['验收项', '候选对象', '验收口径'], acceptanceRows)}

## 8. 使用说明

- 这是只读基线快照，用于后续真实入库、出库、采购收货、调拨和 BOM 自动扣减前后对比。
- 真实写库验收前先保留本文件；执行验收动作后，先运行“发布前核验命令”，再重新运行同一脚本比较商品库存、批次和最近库存流水。
- 若需要固定门店，使用：\`npm.cmd --prefix packages/server-v2 run inventory:baseline -- --store-id <门店ID>\`。
`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    storeId,
    storeName: store.name,
    outPath,
    baselineWindow: {
      latestMovementId: latestMovement?.id ?? null,
      latestMovementAt: latestMovement?.occurredAt ?? null,
    },
    counts: { productCount, lowStockCount, batchCount, movementCount, bomCount, purchaseOrderCount, transferOrderCount },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
