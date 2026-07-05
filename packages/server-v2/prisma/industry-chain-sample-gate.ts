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
const FLOW_KEY = 'supply-platform-mvp-flow';

type GateStatus = 'pass' | 'fail' | 'warning';

type Gate = {
  id: string;
  name: string;
  status: GateStatus;
  evidence: string;
  nextAction: string;
};

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function money(value: unknown) {
  return Number(value ?? 0);
}

function text(value: unknown) {
  return String(value ?? '').trim();
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

function statusLabel(status: GateStatus) {
  return {
    pass: '通过',
    fail: '未通过',
    warning: '待关注',
  }[status];
}

function hasActiveQuote(quote: any, now: Date) {
  if (!quote) return false;
  if (quote.status !== 'active') return false;
  if (quote.auditStatus !== 'approved') return false;
  if (quote.deletedAt) return false;
  if (['out_of_stock', 'unavailable'].includes(String(quote.stockStatus ?? ''))) return false;
  if (quote.validFrom && new Date(quote.validFrom) > now) return false;
  if (quote.validTo && new Date(quote.validTo) < now) return false;
  return true;
}

async function resolveStore() {
  const storeId = Number(argValue('store-id') ?? argValue('storeId') ?? 0);
  if (storeId > 0) {
    return {
      id: storeId,
      name: argValue('store-name') ?? (storeId === 6 ? 'Ami 全量演示门店' : `门店 ${storeId}`),
    };
  }

  const store = await prisma.store.findFirst({
    where: { name: 'Ami 全量演示门店' },
    select: { id: true, name: true },
  });
  if (!store) throw new Error('未找到 Ami 全量演示门店');
  return store;
}

async function findSampleProduct(storeId: number) {
  const productId = Number(argValue('productId') ?? 0);
  if (productId > 0) {
    return prisma.product.findFirst({ where: { id: productId, storeId, deletedAt: null } });
  }

  const sku = await prisma.supplySku.findFirst({
    where: { barcode: { startsWith: `${FLOW_KEY}:` } },
    orderBy: { id: 'desc' },
  });
  if (sku) {
    const parsedProductId = Number(String(sku.barcode ?? '').split(':').pop());
    if (parsedProductId > 0) {
      const product = await prisma.product.findFirst({ where: { id: parsedProductId, storeId, deletedAt: null } });
      if (product) return product;
    }
  }

  return prisma.product.findFirst({ where: { storeId, deletedAt: null, status: 'active' }, orderBy: { id: 'asc' } });
}

async function adoptionInvalidCount(storeId: number) {
  const records = await prisma.industryAdoptionRecord.findMany({
    where: { storeId, productTemplateId: { not: null }, localProductId: { not: null } },
    select: { id: true, productTemplateId: true, localProductId: true },
  });
  const productIds = [...new Set(records.map((record: any) => record.localProductId).filter(Boolean))];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, storeId: true, deletedAt: true } })
    : [];
  const templates = await prisma.industryProductTemplate.findMany({ where: { deletedAt: null }, select: { id: true } });
  const productMap = new Map(products.map((product: any) => [product.id, product]));
  const templateIds = new Set(templates.map((template: any) => template.id));
  const invalid = records.filter((record: any) => {
    const product = productMap.get(record.localProductId);
    return !product || product.deletedAt || product.storeId !== storeId || !templateIds.has(record.productTemplateId);
  });
  return { total: records.length, invalid: invalid.length, invalidIds: invalid.slice(0, 10).map((record: any) => record.id) };
}

async function bomUnitIssues(storeId: number) {
  const rows = await prisma.projectBomItem.findMany({
    where: { project: { storeId, deletedAt: null } },
    include: {
      project: { select: { id: true, name: true } },
      product: { select: { id: true, sku: true, name: true, specUnit: true, deletedAt: true } },
    },
    orderBy: { id: 'asc' },
  });
  return rows
    .filter((row: any) => !row.product?.deletedAt && text(row.product?.specUnit) && !unitEqual(row.unit, row.product.specUnit))
    .map((row: any) => ({
      id: row.id,
      projectName: row.project?.name,
      productName: row.product?.name,
      sku: row.product?.sku,
      currentUnit: row.unit,
      targetUnit: row.product?.specUnit,
    }));
}

async function collectSample(storeId: number, product: any) {
  const now = new Date();
  const supplier = await prisma.supplySupplier.findFirst({ where: { companyName: FLOW_KEY } });
  const supplySku = product ? await prisma.supplySku.findFirst({ where: { barcode: `${FLOW_KEY}:${product.id}` } }) : null;
  const quotes = supplySku
    ? await prisma.supplyQuote.findMany({ where: { supplySkuId: supplySku.id }, orderBy: { id: 'desc' } })
    : [];
  const activeQuote = quotes.find((quote: any) => hasActiveQuote(quote, now)) ?? null;
  const mapping = supplySku && product
    ? await prisma.supplyCatalogMapping.findFirst({
        where: { storeId, productId: product.id, supplySkuId: supplySku.id, mappingStatus: 'active', isPreferred: true },
      })
    : null;
  const order = supplier
    ? await prisma.procurementOrder.findFirst({
        where: { storeId, supplierId: supplier.id, sourceType: FLOW_KEY },
        include: {
          items: true,
          shipments: { include: { items: true } },
          supplier: { select: { id: true, companyName: true } },
          store: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : null;
  const orderItem = order && product && supplySku
    ? order.items.find((item: any) => Number(item.productId) === Number(product.id) && Number(item.supplySkuId) === Number(supplySku.id))
    : null;
  const shipmentItems = orderItem
    ? order.shipments.flatMap((shipment: any) =>
        shipment.items
          .filter((item: any) => Number(item.orderItemId) === Number(orderItem.id) && Number(item.supplySkuId) === Number(supplySku?.id))
          .map((item: any) => ({ ...item, shipmentNo: shipment.shipmentNo, shipmentStatus: shipment.status })),
      )
    : [];
  const movements = order && product
    ? await prisma.stockMovement.findMany({
        where: { storeId, productId: product.id, sourceType: 'supply_platform_order', sourceId: order.id, movementType: 'purchase_inbound' },
        include: { batch: { select: { id: true, batchNo: true, stock: true } } },
        orderBy: { id: 'asc' },
      })
    : [];
  const settlement = supplier
    ? await prisma.supplySettlement.findFirst({
        where: { supplierId: supplier.id, settleMonth: new Date().toISOString().slice(0, 7) },
        orderBy: [{ settleMonth: 'desc' }, { createdAt: 'desc' }],
      })
    : null;

  return {
    product,
    supplier,
    supplySku,
    quotes,
    activeQuote,
    mapping,
    order,
    orderItem,
    shipmentItems,
    movements,
    settlement,
  };
}

async function main() {
  const store = await resolveStore();
  const product = await findSampleProduct(store.id);
  const adoption = await adoptionInvalidCount(store.id);
  const bomIssues = await bomUnitIssues(store.id);
  const sample = await collectSample(store.id, product);

  const lowStockExpected = !hasFlag('skip-low-stock-sample');
  const productCurrentStock = money(sample.product?.currentStock);
  const productSafetyStock = money(sample.product?.safetyStock);
  const receivedQty = sample.movements.reduce((sum: number, movement: any) => sum + money(movement.quantity), 0);

  const gates: Gate[] = [
    {
      id: '1',
      name: '采用记录无失效指向',
      status: adoption.invalid === 0 ? 'pass' : 'fail',
      evidence: `采用记录 ${adoption.total} 条；失效 ${adoption.invalid} 条；样本 ${adoption.invalidIds.join(', ') || '-'}`,
      nextAction: '授权后执行 industry-chain:repair 清理失效 localProductId。',
    },
    {
      id: '2',
      name: 'BOM 单位已按规格单位修复',
      status: bomIssues.length === 0 ? 'pass' : 'fail',
      evidence: `门店 BOM 单位异常 ${bomIssues.length} 条；样本 ${bomIssues.slice(0, 3).map((item) => `${item.id}:${item.currentUnit}->${item.targetUnit}`).join(', ') || '-'}`,
      nextAction: '授权后执行 product-unit:repair 修复 BOM 单位。',
    },
    {
      id: '3',
      name: '样本商品存在',
      status: sample.product ? 'pass' : 'fail',
      evidence: sample.product ? `${sample.product.name} / ${sample.product.sku} / ID ${sample.product.id}` : '缺失',
      nextAction: '检查门店是否有可用于供应链 MVP 的本地商品。',
    },
    {
      id: '4',
      name: '样本供应商/SKU/报价可采购',
      status: sample.supplier && sample.supplySku && sample.activeQuote ? 'pass' : 'fail',
      evidence: `supplier=${sample.supplier?.id ?? '-'}；supplySku=${sample.supplySku?.id ?? '-'}；activeQuote=${sample.activeQuote?.id ?? '-'}`,
      nextAction: '授权后由 supply-platform:mvp-flow 创建或修正供应商、供应 SKU 和有效报价。',
    },
    {
      id: '5',
      name: '样本商品有首选供应链映射',
      status: sample.mapping ? 'pass' : 'fail',
      evidence: `mapping=${sample.mapping?.id ?? '-'}；product=${sample.product?.id ?? '-'}；supplySku=${sample.supplySku?.id ?? '-'}`,
      nextAction: '授权后由 supply-platform:mvp-flow 创建或修正首选映射。',
    },
    {
      id: '6',
      name: '样本平台采购单与明细匹配',
      status: sample.order && sample.orderItem ? 'pass' : 'fail',
      evidence: `order=${sample.order?.orderNo ?? '-'} / ${sample.order?.status ?? '-'}；orderItem=${sample.orderItem?.id ?? '-'}`,
      nextAction: '授权后创建补货/MVP 来源采购单，并确保明细匹配样本商品和供应 SKU。',
    },
    {
      id: '7',
      name: '样本发货与收货完成',
      status: sample.order?.status === 'received' && sample.shipmentItems.length > 0 && sample.shipmentItems.some((item: any) => item.receivedQty > 0) ? 'pass' : 'fail',
      evidence: `orderStatus=${sample.order?.status ?? '-'}；shipmentItems=${sample.shipmentItems.length}；receivedQty=${sample.shipmentItems.reduce((sum: number, item: any) => sum + Number(item.receivedQty ?? 0), 0)}`,
      nextAction: '授权后执行供应商发货和门店收货入库。',
    },
    {
      id: '8',
      name: '样本入库批次与库存流水可追溯',
      status: sample.movements.length > 0 && receivedQty > 0 ? 'pass' : 'fail',
      evidence: `purchase_inbound=${sample.movements.length} 条；入库数量=${receivedQty}；批次=${sample.movements.map((movement: any) => movement.batch?.batchNo ?? '-').join(', ') || '-'}`,
      nextAction: '授权后收货写入 StockBatch、Product.currentStock 和 StockMovement。',
    },
    {
      id: '9',
      name: '样本低库存路由可复验',
      status: !lowStockExpected ? 'warning' : productSafetyStock > 0 && productCurrentStock <= productSafetyStock ? 'pass' : 'fail',
      evidence: `currentStock=${productCurrentStock}；safetyStock=${productSafetyStock}；低库存样本=${lowStockExpected}`,
      nextAction: lowStockExpected ? '授权 apply 后将安全库存调到收货后库存之上，形成低库存路由样本。' : '本次跳过低库存样本，仅验证履约闭环。',
    },
    {
      id: '10',
      name: '样本供应商结算可追溯',
      status: sample.settlement ? 'pass' : 'fail',
      evidence: `settlement=${sample.settlement?.id ?? '-'}；settleMonth=${sample.settlement?.settleMonth ?? '-'}；status=${sample.settlement?.status ?? '-'}`,
      nextAction: '授权后为样本供应商生成当月结算记录。',
    },
  ];

  const complete = gates.every((gate) => gate.status === 'pass');
  const statusCounts = gates.reduce(
    (acc, gate) => {
      acc[gate.status] += 1;
      return acc;
    },
    { pass: 0, fail: 0, warning: 0 } as Record<GateStatus, number>,
  );
  const report = {
    checkedAt: new Date().toISOString(),
    store,
    flowKey: FLOW_KEY,
    complete,
    statusCounts,
    sample: {
      product: sample.product
        ? {
            id: sample.product.id,
            name: sample.product.name,
            sku: sample.product.sku,
            currentStock: productCurrentStock,
            safetyStock: productSafetyStock,
            specUnit: sample.product.specUnit,
            packageUnit: sample.product.packageUnit,
          }
        : null,
      supplierId: sample.supplier?.id ?? null,
      supplySkuId: sample.supplySku?.id ?? null,
      activeQuoteId: sample.activeQuote?.id ?? null,
      mappingId: sample.mapping?.id ?? null,
      procurementOrderId: sample.order?.id ?? null,
      procurementOrderNo: sample.order?.orderNo ?? null,
      orderItemId: sample.orderItem?.id ?? null,
      shipmentItemIds: sample.shipmentItems.map((item: any) => item.id),
      stockMovementIds: sample.movements.map((movement: any) => movement.id),
      settlementId: sample.settlement?.id ?? null,
    },
    adoption,
    bomIssues,
    gates,
  };

  const outMd = resolve(process.cwd(), argValue('out-md') ?? `../../docs/04-测试数据/industry-chain-sample-gate-${today}.md`);
  const outJson = resolve(process.cwd(), argValue('out-json') ?? `../../docs/04-测试数据/industry-chain-sample-gate-${today}.json`);

  const markdown = `# 行业标准品到库存采购 BOM 销售链路样本级闸门报告

生成时间：${report.checkedAt}

验收门店：${store.name}（ID ${store.id}）

样本标识：${FLOW_KEY}

总状态：${complete ? '已完成' : '未完成'}

## 1. 样本对象

${table(
  ['对象', '值'],
  [
    ['商品', report.sample.product ? `${report.sample.product.name} / ${report.sample.product.sku} / ${report.sample.product.id}` : '缺失'],
    ['供应商', report.sample.supplierId ?? '-'],
    ['供应 SKU', report.sample.supplySkuId ?? '-'],
    ['有效报价', report.sample.activeQuoteId ?? '-'],
    ['首选映射', report.sample.mappingId ?? '-'],
    ['采购单', report.sample.procurementOrderNo ?? '-'],
    ['采购明细', report.sample.orderItemId ?? '-'],
    ['发货明细', report.sample.shipmentItemIds.join(', ') || '-'],
    ['入库流水', report.sample.stockMovementIds.join(', ') || '-'],
    ['结算单', report.sample.settlementId ?? '-'],
  ],
)}

## 2. 样本级闸门

${table(
  ['序号', '闸门', '状态', '证据', '下一步'],
  gates.map((gate) => [gate.id, gate.name, statusLabel(gate.status), gate.evidence, gate.nextAction]),
)}

## 3. BOM 异常样本

${table(
  ['BOM项ID', '项目', '产品', 'SKU', '当前单位', '目标单位'],
  bomIssues.slice(0, 20).map((item: any) => [item.id, item.projectName, item.productName, item.sku, item.currentUnit, item.targetUnit]),
)}

说明：本报告只读，不会创建、修复或删除任何业务数据。
`;

  ensureOutput(outMd);
  ensureOutput(outJson);
  writeFileSync(outMd, markdown, 'utf8');
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`样本级闸门报告生成完成：${outMd}`);
  console.log(`总状态：${complete ? '已完成' : '未完成'}`);
  console.log(`通过 ${statusCounts.pass}，未通过 ${statusCounts.fail}，待关注 ${statusCounts.warning}`);

  if (hasFlag('strict') && !complete) {
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
