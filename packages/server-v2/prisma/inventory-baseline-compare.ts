import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const DEFAULT_STORE_NAME = 'Ami 全量演示门店';

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

function formatDateTime(value?: Date | string | null) {
  if (!value) return '-';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function hasFlag(name: string) {
  const dashName = name.startsWith('--') ? name : `--${name}`;
  return process.argv.includes(dashName);
}

async function selectStore() {
  const storeId = Number(argValue('store-id') ?? argValue('storeId'));
  if (Number.isInteger(storeId) && storeId > 0) {
    const store = await prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) throw new Error(`门店不存在：${storeId}`);
    return store;
  }
  const storeName = argValue('store-name') ?? argValue('storeName') ?? DEFAULT_STORE_NAME;
  const store = await prisma.store.findFirst({ where: { name: storeName, deletedAt: null } });
  if (!store) throw new Error(`门店不存在：${storeName}`);
  return store;
}

function summarizeProductMovements(movements: any[]) {
  const byProduct = new Map<number, any>();
  for (const movement of movements) {
    const productId = Number(movement.productId);
    const current = byProduct.get(productId) ?? {
      productId,
      productName: movement.product?.name ?? productId,
      sku: movement.product?.sku ?? '-',
      firstBeforeStock: movement.beforeStock,
      latestAfterStock: movement.afterStock,
      netQuantity: 0,
      movementCount: 0,
      movementTypes: new Map<string, number>(),
      latestMovementId: movement.id,
    };
    current.netQuantity += toNumber(movement.quantity);
    current.movementCount += 1;
    current.latestAfterStock = movement.afterStock ?? current.latestAfterStock;
    current.latestMovementId = Math.max(current.latestMovementId, movement.id);
    current.movementTypes.set(movement.movementType, (current.movementTypes.get(movement.movementType) ?? 0) + 1);
    byProduct.set(productId, current);
  }
  return [...byProduct.values()];
}

function summarizeBatchMovements(movements: any[]) {
  const byBatch = new Map<number, any>();
  for (const movement of movements.filter((item) => item.batchId)) {
    const batchId = Number(movement.batchId);
    const current = byBatch.get(batchId) ?? {
      batchId,
      batchNo: movement.batch?.batchNo ?? batchId,
      productName: movement.product?.name ?? movement.productId,
      sku: movement.product?.sku ?? '-',
      netQuantity: 0,
      movementCount: 0,
      movementTypes: new Map<string, number>(),
    };
    current.netQuantity += toNumber(movement.quantity);
    current.movementCount += 1;
    current.movementTypes.set(movement.movementType, (current.movementTypes.get(movement.movementType) ?? 0) + 1);
    byBatch.set(batchId, current);
  }
  return [...byBatch.values()];
}

function summarizeByKey(movements: any[], key: string) {
  const counts = new Map<string, { count: number; quantity: number }>();
  for (const movement of movements) {
    const value = String(movement[key] ?? '-');
    const current = counts.get(value) ?? { count: 0, quantity: 0 };
    current.count += 1;
    current.quantity += toNumber(movement.quantity);
    counts.set(value, current);
  }
  return [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
}

function movementTypeText(values: Map<string, number>) {
  return [...values.entries()].map(([key, count]) => `${key}(${count})`).join(', ');
}

async function buildCompare() {
  const store = await selectStore();
  const storeId = Number(store.id);
  const sinceMovementId = Number(argValue('since-movement-id') ?? argValue('sinceMovementId') ?? 0);
  const requireMovements = hasFlag('require-movements') || hasFlag('requireMovements');
  if (!Number.isInteger(sinceMovementId) || sinceMovementId <= 0) {
    throw new Error('必须传入 --since-movement-id <基线最大流水ID>');
  }
  const baselineMovement = await prisma.stockMovement.findFirst({
    where: { id: sinceMovementId, storeId },
    include: { product: { select: { name: true, sku: true } } },
  });
  const movements = await prisma.stockMovement.findMany({
    where: { storeId, id: { gt: sinceMovementId } },
    include: {
      product: { select: { id: true, name: true, sku: true, currentStock: true } },
      batch: { select: { id: true, batchNo: true, stock: true } },
      operator: { select: { name: true, username: true } },
    },
    orderBy: { id: 'asc' },
    take: 1000,
  });
  const productSummaries = summarizeProductMovements(movements);
  const batchSummaries = summarizeBatchMovements(movements);
  const products = productSummaries.length
    ? await prisma.product.findMany({
        where: { id: { in: productSummaries.map((item) => item.productId) } },
        select: { id: true, name: true, sku: true, currentStock: true, safetyStock: true },
      })
    : [];
  const batches = batchSummaries.length
    ? await prisma.stockBatch.findMany({
        where: { id: { in: batchSummaries.map((item) => item.batchId) } },
        select: { id: true, batchNo: true, stock: true },
      })
    : [];
  const productById = new Map(products.map((item: any) => [Number(item.id), item]));
  const batchById = new Map(batches.map((item: any) => [Number(item.id), item]));
  const productRows = productSummaries.map((item) => {
    const currentProduct = productById.get(item.productId);
    const currentStock = toNumber(currentProduct?.currentStock);
    const latestAfterStock = item.latestAfterStock === null || item.latestAfterStock === undefined ? null : toNumber(item.latestAfterStock);
    return {
      ...item,
      currentStock,
      latestAfterStock,
      consistent: latestAfterStock === null ? true : currentStock === latestAfterStock,
    };
  });
  const batchRows = batchSummaries.map((item) => ({
    ...item,
    currentBatchStock: toNumber(batchById.get(item.batchId)?.stock),
  }));
  const inconsistentProducts = productRows.filter((item) => !item.consistent);
  const hasPostBaselineMovements = movements.length > 0;

  return {
    generatedAt: new Date().toISOString(),
    store: { id: store.id, name: store.name },
    baseline: {
      sinceMovementId,
      found: Boolean(baselineMovement),
      occurredAt: baselineMovement?.occurredAt ?? null,
      movementType: baselineMovement?.movementType ?? null,
      productName: baselineMovement?.product?.name ?? null,
    },
    summary: {
      movementCount: movements.length,
      productCount: productRows.length,
      batchCount: batchRows.length,
      inconsistentProductCount: inconsistentProducts.length,
      requireMovements,
      hasPostBaselineMovements,
    },
    byMovementType: summarizeByKey(movements, 'movementType'),
    bySourceType: summarizeByKey(movements, 'sourceType'),
    products: productRows,
    batches: batchRows,
    latestMovements: movements.slice(-20).reverse(),
    passed: Boolean(baselineMovement) && inconsistentProducts.length === 0 && (!requireMovements || hasPostBaselineMovements),
  };
}

function renderMarkdown(result: any) {
  return `# 库存基线对比报告

生成时间：${result.generatedAt}
门店：${result.store.name}（ID: ${result.store.id}）
基线：StockMovement.id ${result.baseline.sinceMovementId}（${result.baseline.found ? `${result.baseline.movementType} / ${formatDateTime(result.baseline.occurredAt)}` : '未找到'}）
总状态：${result.passed ? '通过' : '需处理'}

## 1. 对比总览

${table(['指标', '数量'], [
  ['基线后库存流水数', result.summary.movementCount],
  ['涉及商品数', result.summary.productCount],
  ['涉及批次数', result.summary.batchCount],
  ['商品当前库存与最新流水 afterStock 不一致数', result.summary.inconsistentProductCount],
  ['是否要求基线后必须有流水', result.summary.requireMovements ? '是' : '否'],
  ['基线后是否已有流水', result.summary.hasPostBaselineMovements ? '是' : '否'],
])}

## 2. 流水类型分布

${result.byMovementType.length ? table(['流水类型', '条数', '净数量'], result.byMovementType.map(([key, value]: any) => [key, value.count, value.quantity])) : '- 基线后暂无库存流水。'}

## 3. 来源类型分布

${result.bySourceType.length ? table(['来源类型', '条数', '净数量'], result.bySourceType.map(([key, value]: any) => [key, value.count, value.quantity])) : '- 基线后暂无库存流水。'}

## 4. 商品库存对比

${result.products.length ? table(['商品', 'SKU', '净变化', '首条 beforeStock', '末条 afterStock', '当前库存', '一致性', '流水类型'], result.products.map((item: any) => [
  `${item.productName} / ${item.productId}`,
  item.sku,
  item.netQuantity,
  item.firstBeforeStock ?? '-',
  item.latestAfterStock ?? '-',
  item.currentStock,
  item.consistent ? '一致' : '不一致',
  movementTypeText(item.movementTypes),
])) : '- 基线后暂无商品库存变化。'}

## 5. 批次变化对比

${result.batches.length ? table(['批次', '商品', 'SKU', '净变化', '当前批次库存', '流水类型'], result.batches.map((item: any) => [
  `${item.batchNo} / ${item.batchId}`,
  item.productName,
  item.sku,
  item.netQuantity,
  item.currentBatchStock,
  movementTypeText(item.movementTypes),
])) : '- 基线后暂无批次库存变化。'}

## 6. 最近流水

${result.latestMovements.length ? table(['流水ID', '商品', '类型', '数量', '库存前后', '来源', '批次', '操作人', '时间'], result.latestMovements.map((movement: any) => [
  movement.id,
  `${movement.product?.name ?? movement.productId} / ${movement.product?.sku ?? '-'}`,
  movement.movementType,
  movement.quantity,
  `${movement.beforeStock ?? '-'} -> ${movement.afterStock ?? '-'}`,
  [movement.sourceType, movement.sourceNo ?? movement.sourceId].filter(Boolean).join(' / ') || '-',
  movement.batch?.batchNo ?? '-',
  movement.operator?.name ?? movement.operator?.username ?? '-',
  formatDateTime(movement.occurredAt),
])) : '- 基线后暂无库存流水。'}

## 7. 说明

- 本报告只读生成，不修改库存。
- 发布后验收建议使用 \`--require-movements --strict\`；这样没有任何基线后库存流水时会失败，避免把“未执行写库验收”误判为通过。
- 若真实验收已完成但这里没有流水，说明使用了错误的基线 ID 或验收动作没有写入库存流水。
- “商品当前库存与最新流水 afterStock”不一致时，需要优先排查是否存在未写流水的库存修改或并发写入。
`;
}

async function main() {
  const result = await buildCompare();
  const outPath = argValue('out');
  if (outPath) {
    const resolvedOutPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(resolvedOutPath), { recursive: true });
    writeFileSync(resolvedOutPath, renderMarkdown(result), 'utf8');
  }
  console.log(JSON.stringify({
    store: result.store,
    baseline: result.baseline,
    summary: result.summary,
    passed: result.passed,
  }, null, 2));
  if (!result.passed && process.argv.includes('--strict')) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
