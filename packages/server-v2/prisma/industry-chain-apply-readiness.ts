import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 1),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const flowKey = 'supply-platform-mvp-flow';

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number) {
  const value = Number(argValue(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function money(value: unknown) {
  return Number(value ?? 0);
}

function unitEqual(left: unknown, right: unknown) {
  return text(left).toLowerCase() === text(right).toLowerCase();
}

function table(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  if (!rows.length) return '暂无。';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

async function resolveStore() {
  const storeId = Number(argValue('store-id') ?? argValue('storeId') ?? 0);
  if (storeId > 0) {
    const store = await prisma.store.findFirst({ where: { id: storeId }, select: { id: true, name: true } });
    if (!store) throw new Error(`未找到门店：${storeId}`);
    return store;
  }
  const store = await prisma.store.findFirst({
    where: { name: 'Ami 全量演示门店' },
    select: { id: true, name: true },
  });
  if (!store) throw new Error('未找到 Ami 全量演示门店');
  return store;
}

async function findProduct(storeId: number) {
  const productId = Number(argValue('productId') ?? 0);
  if (productId > 0) {
    return prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        currentStock: true,
        safetyStock: true,
        specUnit: true,
        unit: true,
      },
    });
  }
  return prisma.product.findFirst({
    where: { storeId, deletedAt: null, status: 'active' },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      sku: true,
      currentStock: true,
      safetyStock: true,
      specUnit: true,
      unit: true,
    },
  });
}

async function brokenAdoptions(storeId: number) {
  const adoptions = await prisma.industryAdoptionRecord.findMany({
    where: { storeId, productTemplateId: { not: null }, localProductId: { not: null } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      storeId: true,
      productTemplateId: true,
      localProductId: true,
      adoptionType: true,
      payload: true,
    },
  });
  const products = await prisma.product.findMany({
    where: { id: { in: adoptions.map((item: any) => item.localProductId).filter(Boolean) } },
    select: { id: true, storeId: true, sku: true, name: true, deletedAt: true },
  });
  const productsById = new Map(products.map((product: any) => [product.id, product]));
  return adoptions
    .filter((adoption: any) => {
      const product = productsById.get(adoption.localProductId);
      return !product || product.deletedAt || product.storeId !== storeId;
    })
    .map((adoption: any) => ({
      adoptionId: adoption.id,
      productTemplateId: adoption.productTemplateId,
      oldLocalProductId: adoption.localProductId,
      adoptionType: adoption.adoptionType,
      plannedAction: 'clear localProductId and mark payload.chainStatus=invalid',
    }));
}

async function bomUnitRepairs(storeId: number) {
  const items = await prisma.projectBomItem.findMany({
    include: {
      project: { select: { id: true, name: true, storeId: true, deletedAt: true } },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          specUnit: true,
          packageUnit: true,
          deletedAt: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  return items
    .filter((item: any) => item.project?.storeId === storeId && !item.project?.deletedAt && !item.product?.deletedAt)
    .filter((item: any) => text(item.product?.specUnit) && !unitEqual(item.unit, item.product.specUnit))
    .map((item: any) => ({
      bomItemId: item.id,
      projectId: item.project?.id,
      projectName: item.project?.name,
      productId: item.productId,
      productName: item.product?.name,
      sku: item.product?.sku,
      currentUnit: item.unit,
      targetUnit: item.product?.specUnit,
      packageUnit: item.product?.packageUnit,
      plannedAction: 'update ProjectBomItem.unit to Product.specUnit',
    }));
}

async function supplyFlowImpact(storeId: number, product: any) {
  if (!product) return null;
  const quantity = Math.max(5, Number(argValue('quantity', '5')));
  const supplier = await prisma.supplySupplier.findFirst({ where: { companyName: flowKey } });
  const sku = await prisma.supplySku.findFirst({ where: { barcode: `${flowKey}:${product.id}` } });
  const quote = sku ? await prisma.supplyQuote.findFirst({ where: { supplySkuId: sku.id } }) : null;
  const mapping = sku
    ? await prisma.supplyCatalogMapping.findFirst({ where: { supplySkuId: sku.id, productId: product.id, storeId } })
    : null;
  const order = supplier
    ? await prisma.procurementOrder.findFirst({
        where: { sourceType: flowKey, storeId, supplierId: supplier.id },
        include: { items: true, shipments: { include: { items: true } } },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  const movements = order
    ? await prisma.stockMovement.findMany({
        where: { sourceType: 'supply_platform_order', sourceId: order.id, productId: product.id },
        select: { id: true, quantity: true, beforeStock: true, afterStock: true, unit: true },
      })
    : [];
  const settlement = supplier
    ? await prisma.supplySettlement.findFirst({
        where: { supplierId: supplier.id, settleMonth: new Date().toISOString().slice(0, 7) },
      })
    : null;

  const hasInboundMovement = movements.length > 0;
  const expectedStockIncrement = hasInboundMovement ? 0 : quantity;
  const afterStock = money(product.currentStock) + expectedStockIncrement;
  const lowStockSampleEnabled = !hasFlag('skip-low-stock-sample');
  return {
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      currentStock: money(product.currentStock),
      currentSafetyStock: money(product.safetyStock),
      movementUnit: product.specUnit ?? product.unit,
    },
    existingObjects: {
      supplierId: supplier?.id ?? null,
      supplySkuId: sku?.id ?? null,
      quoteId: quote?.id ?? null,
      mappingId: mapping?.id ?? null,
      procurementOrderId: order?.id ?? null,
      shipmentCount: order?.shipments?.length ?? 0,
      stockMovementCount: movements.length,
      settlementId: settlement?.id ?? null,
    },
    plannedWrites: {
      supplier: supplier ? 'update status/rates to active approved' : 'create supply supplier',
      supplySku: sku ? 'update status/auditStatus to active approved' : 'create supply sku',
      quote: quote ? 'update quote to active approved available' : 'create active quote',
      mapping: mapping ? 'update mapping active preferred' : 'create preferred mapping',
      procurementOrder: order ? 'reuse latest flow order if present' : 'create procurement order and item',
      shipment: order?.shipments?.length ? 'reuse existing shipment' : 'create shipment and shipment item',
      stockInbound: hasInboundMovement ? 'skip because inbound movement exists' : 'create stock batch, increment product stock, write stock movement',
      lowStockSample: lowStockSampleEnabled
        ? `set safetyStock to ${afterStock + 10} after receipt`
        : 'skip low-stock safetyStock adjustment',
      settlement: settlement ? 'upsert current month settlement' : 'create current month settlement',
    },
    expectedStock: {
      quantity,
      before: money(product.currentStock),
      increment: expectedStockIncrement,
      after: afterStock,
      targetSafetyStockAfterReceipt: lowStockSampleEnabled ? afterStock + 10 : null,
    },
  };
}

function applyCommands(storeId: number, strategy: string, quantity?: string) {
  const mvpArgs = [quantity ? `--quantity=${quantity}` : null, `--storeId=${storeId}`].filter(Boolean);
  return [
    `npm.cmd --prefix packages/server-v2 run industry-chain:baseline -- --store-id=${storeId}`,
    `npm.cmd --prefix packages/server-v2 run product-unit:audit -- --store-id=${storeId}`,
    `npm.cmd --prefix packages/server-v2 run industry-chain:repair -- --strategy=${strategy} --store-id=${storeId} --apply --yes`,
    `npm.cmd --prefix packages/server-v2 run product-unit:repair -- --store-id=${storeId} --apply --yes`,
    `npm.cmd --prefix packages/server-v2 run supply-platform:mvp-flow -- ${mvpArgs.join(' ')}`.trim(),
    `npm.cmd --prefix packages/server-v2 run supply-platform:fulfillment-readiness -- --store-id=${storeId}`,
    `npm.cmd --prefix packages/server-v2 run supply-platform:mvp-flow:verify -- ${mvpArgs.join(' ')}`.trim(),
    `npm.cmd --prefix packages/server-v2 run industry-chain:sample-gate:strict -- --store-id=${storeId}`,
    `npm.cmd --prefix packages/server-v2 run industry-chain:completion-gate:strict -- --store-id=${storeId}`,
  ];
}

function buildGuard(report: any) {
  const maxBrokenAdoptions = numberArg('max-broken-adoptions', 1);
  const maxBomUnitRepairs = numberArg('max-bom-unit-repairs', 1);
  const maxStockIncrement = numberArg('max-stock-increment', 20);
  const failures = [
    report.brokenAdoptions.length > maxBrokenAdoptions
      ? `失效采用记录待修复 ${report.brokenAdoptions.length} 条，超过上限 ${maxBrokenAdoptions}。`
      : null,
    report.bomUnitRepairs.length > maxBomUnitRepairs
      ? `BOM 单位待修复 ${report.bomUnitRepairs.length} 条，超过上限 ${maxBomUnitRepairs}。`
      : null,
    !report.supplyFlowImpact?.product ? '未找到供应链履约样本产品。' : null,
    money(report.supplyFlowImpact?.expectedStock?.increment) > maxStockIncrement
      ? `预计入库 ${report.supplyFlowImpact.expectedStock.increment}，超过上限 ${maxStockIncrement}。`
      : null,
  ].filter(Boolean) as string[];
  return {
    strict: hasFlag('strict'),
    pass: failures.length === 0,
    limits: {
      maxBrokenAdoptions,
      maxBomUnitRepairs,
      maxStockIncrement,
    },
    failures,
  };
}

function renderMarkdown(report: any) {
  return `# 行业标准品到库存采购 BOM 销售链路 apply readiness 报告

生成时间：${report.generatedAt}

验收门店：${report.store.name}（ID ${report.store.id}）

写库授权状态：未授权，本报告只读。

strict guard：${report.guard.pass ? '通过' : '未通过'}

## 1. 预计影响面

${table(
  ['对象', '数量/状态'],
  [
    ['失效采用记录待修复', report.brokenAdoptions.length],
    ['BOM 单位待修复', report.bomUnitRepairs.length],
    ['供应链样本产品', report.supplyFlowImpact?.product ? `${report.supplyFlowImpact.product.name} / ${report.supplyFlowImpact.product.id}` : '缺失'],
    ['预计库存增加', report.supplyFlowImpact?.expectedStock?.increment ?? 0],
    ['预计低库存安全线', report.supplyFlowImpact?.expectedStock?.targetSafetyStockAfterReceipt ?? '不调整'],
  ],
)}

## 2. Strict Guard

${table(
  ['检查项', '值'],
  [
    ['strict', report.guard.strict],
    ['pass', report.guard.pass],
    ['maxBrokenAdoptions', report.guard.limits.maxBrokenAdoptions],
    ['maxBomUnitRepairs', report.guard.limits.maxBomUnitRepairs],
    ['maxStockIncrement', report.guard.limits.maxStockIncrement],
  ],
)}

${report.guard.failures.length ? report.guard.failures.map((item: string) => `- ${item}`).join('\n') : '暂无失败项。'}

## 3. 采用记录修复清单

${table(
  ['采用ID', '模板ID', '旧本地产品ID', '动作'],
  report.brokenAdoptions.map((item: any) => [item.adoptionId, item.productTemplateId, item.oldLocalProductId, item.plannedAction]),
)}

## 4. BOM 单位修复清单

${table(
  ['BOM项ID', '项目', '产品', 'SKU', '当前单位', '目标单位', '动作'],
  report.bomUnitRepairs.map((item: any) => [
    item.bomItemId,
    item.projectName,
    item.productName,
    item.sku,
    item.currentUnit,
    item.targetUnit,
    item.plannedAction,
  ]),
)}

## 5. 供应链履约样本影响

${report.supplyFlowImpact ? table(
  ['项目', '值'],
  [
    ['产品', `${report.supplyFlowImpact.product.name} / ${report.supplyFlowImpact.product.sku}`],
    ['当前库存', report.supplyFlowImpact.expectedStock.before],
    ['预计入库', report.supplyFlowImpact.expectedStock.increment],
    ['预计入库后库存', report.supplyFlowImpact.expectedStock.after],
    ['库存流水单位', report.supplyFlowImpact.product.movementUnit],
    ['已有供应商', report.supplyFlowImpact.existingObjects.supplierId ?? '-'],
    ['已有供应 SKU', report.supplyFlowImpact.existingObjects.supplySkuId ?? '-'],
    ['已有报价', report.supplyFlowImpact.existingObjects.quoteId ?? '-'],
    ['已有映射', report.supplyFlowImpact.existingObjects.mappingId ?? '-'],
    ['已有采购单', report.supplyFlowImpact.existingObjects.procurementOrderId ?? '-'],
    ['已有入库流水', report.supplyFlowImpact.existingObjects.stockMovementCount],
    ['已有结算单', report.supplyFlowImpact.existingObjects.settlementId ?? '-'],
  ],
) : '未找到供应链履约样本产品。'}

## 6. 授权后命令顺序

${report.applyCommands.map((command: string, index: number) => `${index + 1}. \`${command}\``).join('\n')}

说明：本报告只读，不会创建、修复或删除任何业务数据。
`;
}

async function main() {
  const store = await resolveStore();
  const strategy = argValue('strategy', 'mark-invalid')!;
  const quantity = argValue('quantity');
  const product = await findProduct(store.id);
  const report = {
    generatedAt: new Date().toISOString(),
    store,
    parameters: {
      strategy,
      quantity: quantity ?? null,
      skipLowStockSample: hasFlag('skip-low-stock-sample'),
    },
    brokenAdoptions: await brokenAdoptions(store.id),
    bomUnitRepairs: await bomUnitRepairs(store.id),
    supplyFlowImpact: await supplyFlowImpact(store.id, product),
    applyCommands: applyCommands(store.id, strategy, quantity),
  };
  const reportWithGuard = {
    ...report,
    guard: buildGuard(report),
  };

  const outMd = resolve(process.cwd(), argValue('out-md') ?? `../../docs/04-测试数据/industry-chain-apply-readiness-${today}.md`);
  const outJson = resolve(process.cwd(), argValue('out-json') ?? `../../docs/04-测试数据/industry-chain-apply-readiness-${today}.json`);
  ensureOutput(outMd);
  ensureOutput(outJson);
  writeFileSync(outMd, renderMarkdown(reportWithGuard), 'utf8');
  writeFileSync(outJson, `${JSON.stringify(reportWithGuard, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
  console.log(
    `readiness brokenAdoptions=${report.brokenAdoptions.length} bomUnitRepairs=${report.bomUnitRepairs.length} sampleProduct=${report.supplyFlowImpact?.product?.id ?? 'none'} guard=${reportWithGuard.guard.pass}`,
  );
  if (reportWithGuard.guard.strict && !reportWithGuard.guard.pass) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
