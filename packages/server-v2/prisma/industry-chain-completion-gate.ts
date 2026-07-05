import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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

type GateStatus = 'pass' | 'fail' | 'warning' | 'not_applicable';

type Gate = {
  id: string;
  requirement: string;
  status: GateStatus;
  evidence: string;
  nextAction: string;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function unitEqual(left: unknown, right: unknown) {
  return text(left).toLowerCase() === text(right).toLowerCase();
}

function statusLabel(status: GateStatus) {
  return {
    pass: '通过',
    fail: '未通过',
    warning: '待关注',
    not_applicable: '当前无样本',
  }[status];
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function distinctNumbers(values: Array<unknown>) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
}

function unitAuditPath() {
  return resolve(process.cwd(), `../../docs/04-测试数据/product-unit-consistency-audit-${today}.json`);
}

function readUnitAuditSummary() {
  const path = unitAuditPath();
  if (!existsSync(path)) {
    return {
      available: false,
      path,
      salesUnitEvidenceSummary: null,
      error: '文件不存在',
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return {
      available: true,
      path,
      salesUnitEvidenceSummary: parsed.salesUnitEvidenceSummary ?? null,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      path,
      salesUnitEvidenceSummary: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveStore() {
  const explicit = Number(argValue('store-id') ?? argValue('storeId') ?? 0);
  if (explicit > 0) {
    const store = await prisma.store.findFirst({ where: { id: explicit }, select: { id: true, name: true } });
    if (!store) throw new Error(`未找到门店：${explicit}`);
    return store;
  }

  const demoStore = await prisma.store.findFirst({
    where: { name: 'Ami 全量演示门店' },
    select: { id: true, name: true },
  });
  if (demoStore) return demoStore;

  const firstStore = await prisma.store.findFirst({
    where: { status: { not: 'disabled' } },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  });
  if (!firstStore) throw new Error('未找到可用于验收的门店');
  return firstStore;
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

async function adoptionHealth(storeId: number) {
  const [records, templates] = await Promise.all([
    prisma.industryAdoptionRecord.findMany({
      where: { storeId, productTemplateId: { not: null }, localProductId: { not: null } },
      select: { id: true, productTemplateId: true, localProductId: true },
      orderBy: { id: 'asc' },
    }),
    prisma.industryProductTemplate.findMany({
      where: { deletedAt: null },
      select: { id: true, status: true, deletedAt: true },
    }),
  ]);
  const productIds = distinctNumbers(records.map((record: any) => record.localProductId));
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, storeId: true, deletedAt: true, status: true },
      })
    : [];
  const productsById = new Map(products.map((product: any) => [product.id, product]));
  const templatesById = new Map(templates.map((template: any) => [template.id, template]));

  const invalidRecords = records.filter((record: any) => {
    const product = productsById.get(record.localProductId);
    const template = templatesById.get(record.productTemplateId);
    return !product || product.deletedAt || product.storeId !== storeId || !template || template.deletedAt;
  });

  return {
    total: records.length,
    valid: records.length - invalidRecords.length,
    invalid: invalidRecords.length,
    validLocalProductIds: distinctNumbers(
      records
        .filter((record: any) => !invalidRecords.some((invalid: any) => invalid.id === record.id))
        .map((record: any) => record.localProductId),
    ),
    invalidSampleIds: invalidRecords.slice(0, 10).map((record: any) => record.id),
  };
}

async function productUnitHealth(storeId: number) {
  const [products, bomItems] = await Promise.all([
    prisma.product.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, sku: true, name: true, specQuantity: true, specUnit: true, packageUnit: true, unit: true },
      orderBy: { id: 'asc' },
    }),
    prisma.projectBomItem.findMany({
      include: {
        project: { select: { storeId: true, deletedAt: true, name: true } },
        product: { select: { id: true, sku: true, name: true, specUnit: true, packageUnit: true, deletedAt: true } },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const productFieldIssues = products.filter(
    (product: any) => !product.specQuantity || !text(product.specUnit) || !text(product.packageUnit),
  );
  const bomUnitIssues = bomItems
    .filter((item: any) => item.project?.storeId === storeId && !item.project?.deletedAt && !item.product?.deletedAt)
    .filter((item: any) => text(item.product?.specUnit) && !unitEqual(item.unit, item.product.specUnit))
    .map((item: any) => ({
      id: item.id,
      projectName: item.project?.name,
      productName: item.product?.name,
      sku: item.product?.sku,
      bomUnit: item.unit,
      productSpecUnit: item.product?.specUnit,
    }));

  return {
    productFieldIssues: productFieldIssues.length,
    bomUnitIssues: bomUnitIssues.length,
    bomUnitIssueSamples: bomUnitIssues.slice(0, 10),
  };
}

async function collectCounts(storeId: number) {
  const now = new Date();
  const [publishedTemplates, activeProducts, productsInBom, allMovements, orderItems, activeMappings, preferredMappings, mappingsWithQuote] =
    await Promise.all([
      prisma.industryProductTemplate.count({ where: { status: 'published', deletedAt: null } }),
      prisma.product.count({ where: { storeId, deletedAt: null } }),
      prisma.product.count({ where: { storeId, deletedAt: null, bomItems: { some: {} } } }),
      prisma.stockMovement.findMany({
        where: { storeId },
        select: { id: true, productId: true, batchId: true, movementType: true, sourceType: true, sourceId: true },
        orderBy: { id: 'asc' },
      }),
      prisma.orderItem.findMany({
        where: {
          itemType: { in: ['product', 'goods', 'retail_product'] },
          itemId: { not: null },
          order: { storeId },
        },
        select: { id: true, itemId: true },
      }),
      prisma.supplyCatalogMapping.count({ where: { storeId, mappingStatus: 'active' } }),
      prisma.supplyCatalogMapping.count({ where: { storeId, mappingStatus: 'active', isPreferred: true } }),
      prisma.supplyCatalogMapping.count({
        where: {
          storeId,
          mappingStatus: 'active',
          supplySku: {
            status: 'active',
            auditStatus: 'approved',
            deletedAt: null,
            quotes: {
              some: {
                status: 'active',
                auditStatus: 'approved',
                deletedAt: null,
                stockStatus: { notIn: ['out_of_stock', 'unavailable'] },
                AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }],
              },
            },
          },
        },
      }),
    ]);

  const procurementOrders = await prisma.procurementOrder.findMany({
    where: { storeId },
    include: { items: true, shipments: { include: { items: true } } },
    orderBy: { id: 'asc' },
  });
  const replenishmentOrders = procurementOrders.filter((order: any) =>
    ['inventory_replenishment', 'replenishment', 'supply-platform-mvp-flow'].includes(String(order.sourceType ?? '')),
  );
  const replenishmentOrderIds = new Set(replenishmentOrders.map((order: any) => Number(order.id)));
  const receivedOrders = replenishmentOrders.filter((order: any) => ['received', 'settlement_pending', 'settled'].includes(String(order.status ?? '')));
  const shipmentCount = replenishmentOrders.reduce((sum: number, order: any) => sum + order.shipments.length, 0);
  const shipmentItemCount = procurementOrders.reduce(
    (sum: number, order: any) =>
      !replenishmentOrderIds.has(Number(order.id))
        ? sum
        : sum + order.shipments.reduce((inner: number, shipment: any) => inner + shipment.items.length, 0),
    0,
  );

  const supplierIds = distinctNumbers(replenishmentOrders.map((order: any) => order.supplierId));
  const settlements = supplierIds.length
    ? await prisma.supplySettlement.count({ where: { supplierId: { in: supplierIds } } })
    : 0;

  const procurementInboundMovements = allMovements.filter(
    (movement: any) =>
      movement.movementType === 'purchase_inbound' && ['supply_platform_order', 'procurement_order'].includes(String(movement.sourceType ?? '')),
  ).filter((movement: any) => replenishmentOrderIds.has(Number(movement.sourceId)));
  const saleOutboundMovements = allMovements.filter(
    (movement: any) =>
      ['sale_out', 'sales_out', 'sales_outbound', 'product_sale'].includes(String(movement.movementType ?? '')) ||
      movement.sourceType === 'product_order',
  );
  const serviceConsumptionMovements = allMovements.filter((movement: any) =>
    ['service_consume', 'service_consumption'].includes(String(movement.movementType ?? '')),
  );

  const lowStockProducts = await prisma.product.findMany({
    where: { storeId, deletedAt: null, safetyStock: { gt: 0 } },
    include: {
      supplyMappings: {
        where: { mappingStatus: 'active' },
        include: { supplySku: { include: { quotes: true } } },
      },
    },
    orderBy: { id: 'asc' },
  });
  const lowStockRows = lowStockProducts
    .filter((product: any) => numberValue(product.currentStock) <= numberValue(product.safetyStock))
    .map((product: any) => {
      const activeProductMappings = product.supplyMappings.filter((mapping: any) => mapping.productId === product.id);
      const quoteReady = activeProductMappings.some((mapping: any) => mapping.supplySku?.quotes?.some((quote: any) => hasActiveQuote(quote, now)));
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        mappingReady: activeProductMappings.length > 0,
        quoteReady,
      };
    });

  return {
    publishedTemplates,
    activeProducts,
    productsInBom,
    productsWithStockMovements: distinctNumbers(allMovements.map((movement: any) => movement.productId)).length,
    productsWithSalesOrderItems: distinctNumbers(orderItems.map((item: any) => item.itemId)).length,
    stockMovementCount: allMovements.length,
    serviceConsumptionMovements: serviceConsumptionMovements.length,
    saleOutboundMovements: saleOutboundMovements.length,
    activeMappings,
    preferredMappings,
    mappingsWithQuote,
    procurementOrders: procurementOrders.length,
    replenishmentOrders: replenishmentOrders.length,
    procurementOrderItems: replenishmentOrders.reduce((sum: number, order: any) => sum + order.items.length, 0),
    shipments: shipmentCount,
    shipmentItems: shipmentItemCount,
    receivedOrders: receivedOrders.length,
    procurementInboundMovements: procurementInboundMovements.length,
    procurementInboundBatches: distinctNumbers(procurementInboundMovements.map((movement: any) => movement.batchId)).length,
    settlements,
    lowStockProducts: lowStockRows.length,
    lowStockWithMapping: lowStockRows.filter((row: any) => row.mappingReady).length,
    lowStockWithQuote: lowStockRows.filter((row: any) => row.quoteReady).length,
    lowStockWithoutDecision: lowStockRows.filter((row: any) => !row.mappingReady && !row.quoteReady).length,
    lowStockSamples: lowStockRows.slice(0, 10),
  };
}

async function main() {
  const outMd = resolve(
    process.cwd(),
    argValue('out-md') ?? `../../docs/04-测试数据/industry-chain-completion-gate-${today}.md`,
  );
  const outJson = resolve(
    process.cwd(),
    argValue('out-json') ?? `../../docs/04-测试数据/industry-chain-completion-gate-${today}.json`,
  );

  const store = await resolveStore();
  const unitAuditSummary = readUnitAuditSummary();
  const [adoption, unitHealth, counts] = await Promise.all([
    adoptionHealth(store.id),
    productUnitHealth(store.id),
    collectCounts(store.id),
  ]);
  const salesEvidence: any = unitAuditSummary.salesUnitEvidenceSummary;
  const salesUnitEvidenceText = salesEvidence
    ? `；抽样销售明细 ${salesEvidence.sampledOrderItems ?? '-'} 条，订单明细未固化单位 ${salesEvidence.payloadUnitMissing ?? '-'} 条，可关联销售出库 ${salesEvidence.linkedSaleOutOrderItems ?? '-'} 条，其中按包装单位落库 ${salesEvidence.saleOutUsesPackageUnit ?? '-'} 条、按规格单位落库 ${salesEvidence.saleOutUsesSpecUnit ?? '-'} 条`
    : `；单位巡检销售证据${unitAuditSummary.available ? '缺少 salesUnitEvidenceSummary' : `不可用：${unitAuditSummary.error}`}`;

  const gates: Gate[] = [
    {
      id: '1',
      requirement: '已发布标准品能展示采用状态和本地产品',
      status: counts.publishedTemplates > 0 && adoption.invalid === 0 ? 'pass' : 'fail',
      evidence: `已发布标准品 ${counts.publishedTemplates} 个；有效采用 ${adoption.valid} 条；失效采用 ${adoption.invalid} 条`,
      nextAction: adoption.invalid > 0 ? '先修复或标记失效采用记录，避免来源追溯指向已删除产品。' : '保持采用巡检纳入回归。',
    },
    {
      id: '2',
      requirement: '本地产品能展示来源、BOM、库存流水、采购、销售/扣耗',
      status:
        adoption.valid > 0 &&
        counts.productsInBom > 0 &&
        counts.productsWithStockMovements > 0 &&
        counts.productsWithSalesOrderItems > 0 &&
        counts.serviceConsumptionMovements > 0
          ? 'pass'
          : 'fail',
      evidence: `有效采用产品 ${adoption.validLocalProductIds.length} 个；BOM 产品 ${counts.productsInBom} 个；有库存流水产品 ${counts.productsWithStockMovements} 个；销售商品 ${counts.productsWithSalesOrderItems} 个；服务扣耗流水 ${counts.serviceConsumptionMovements} 条`,
      nextAction: '继续保证产品详情链路视图使用同一套真实聚合口径。',
    },
    {
      id: '3',
      requirement: '低库存产品能判断供应链映射和可用报价',
      status:
        counts.lowStockProducts === 0
          ? 'not_applicable'
          : counts.lowStockProducts === counts.lowStockWithMapping + counts.lowStockWithoutDecision
            ? 'pass'
            : 'fail',
      evidence:
        counts.lowStockProducts === 0
          ? '当前门店没有触发安全库存阈值的低库存产品，代码路径已具备判断字段，但真实库暂无低库存样本。'
          : `低库存 ${counts.lowStockProducts} 个；有映射 ${counts.lowStockWithMapping} 个；有可用报价 ${counts.lowStockWithQuote} 个`,
      nextAction:
        counts.lowStockProducts === 0 ? '补一个可控低库存样本复验平台/手工采购分流。' : '检查低库存样本的映射/报价状态是否在采购建议页完整展示。',
    },
    {
      id: '4',
      requirement: '有映射和报价的商品能从补货建议生成平台采购单',
      status: counts.mappingsWithQuote > 0 && counts.replenishmentOrders > 0 ? 'pass' : 'fail',
      evidence: `有效映射 ${counts.activeMappings} 条；首选映射 ${counts.preferredMappings} 条；有可用报价映射 ${counts.mappingsWithQuote} 条；补货来源平台采购单 ${counts.replenishmentOrders} 张`,
      nextAction: '需要先建立真实映射+报价，再从采购建议生成平台采购单或执行授权后的 MVP flow 样本。',
    },
    {
      id: '5',
      requirement: '平台采购单能完成供应商确认、发货、门店收货',
      status: counts.replenishmentOrders > 0 && counts.shipments > 0 && counts.receivedOrders > 0 ? 'pass' : 'fail',
      evidence: `平台/补货采购单 ${counts.replenishmentOrders} 张；发货单 ${counts.shipments} 张；发货明细 ${counts.shipmentItems} 条；已收货订单 ${counts.receivedOrders} 张`,
      nextAction: '对样本采购单执行供应商确认、发货和门店收货，形成真实履约记录。',
    },
    {
      id: '6',
      requirement: '收货写入批次、产品库存和采购入库流水',
      status: counts.procurementInboundMovements > 0 && counts.procurementInboundBatches > 0 ? 'pass' : 'fail',
      evidence: `平台采购入库流水 ${counts.procurementInboundMovements} 条；关联批次 ${counts.procurementInboundBatches} 个`,
      nextAction: '完成平台采购收货后复验 StockBatch、Product.currentStock、StockMovement 是否同步写入。',
    },
    {
      id: '7',
      requirement: '服务完成能按 BOM 扣减库存',
      status: counts.serviceConsumptionMovements > 0 && unitHealth.bomUnitIssues === 0 ? 'pass' : 'warning',
      evidence: `服务扣耗流水 ${counts.serviceConsumptionMovements} 条；BOM 单位异常 ${unitHealth.bomUnitIssues} 条`,
      nextAction:
        unitHealth.bomUnitIssues > 0 ? '授权后执行 BOM 单位修复，再复验服务扣耗单位口径。' : '保持服务扣耗回归测试覆盖。',
    },
    {
      id: '8',
      requirement: '商品销售能生成销售出库库存流水',
      status: counts.saleOutboundMovements > 0 ? 'pass' : 'fail',
      evidence: `商品销售/商品订单来源出库流水 ${counts.saleOutboundMovements} 条${salesUnitEvidenceText}`,
      nextAction:
        salesEvidence?.payloadUnitMissing > 0
          ? '新增订单写入已固化 packageUnit 到 OrderItem.payload；当前不回填历史订单，继续用巡检跟踪新旧数据差异。'
          : '保持商品销售出库回归测试覆盖。',
    },
    {
      id: '9',
      requirement: '链路总览能展示各阶段数量和缺口',
      status: counts.publishedTemplates > 0 && counts.activeProducts > 0 ? 'pass' : 'fail',
      evidence: `标准品 ${counts.publishedTemplates} 个；本地产品 ${counts.activeProducts} 个；供应链映射 ${counts.activeMappings} 条；平台采购单 ${counts.procurementOrders} 张；库存流水 ${counts.stockMovementCount} 条`,
      nextAction: '运营报表继续按未生成本地 SKU、缺映射、BOM 无库存、低库存分流输出缺口。',
    },
    {
      id: '10',
      requirement: '真实数据库有可复验样本，不只停留在 mock/unit test',
      status:
        adoption.invalid === 0 &&
        counts.mappingsWithQuote > 0 &&
        counts.replenishmentOrders > 0 &&
        counts.receivedOrders > 0 &&
        counts.procurementInboundMovements > 0 &&
        counts.settlements > 0 &&
        unitHealth.bomUnitIssues === 0
          ? 'pass'
          : 'fail',
      evidence: `失效采用 ${adoption.invalid}；有报价映射 ${counts.mappingsWithQuote}；平台采购单 ${counts.replenishmentOrders}；已收货 ${counts.receivedOrders}；采购入库流水 ${counts.procurementInboundMovements}；结算 ${counts.settlements}；BOM 单位异常 ${unitHealth.bomUnitIssues}`,
      nextAction: '需要授权真实写库：修复采用/BOM 单位，建立映射+报价并完成一条平台采购履约闭环。',
    },
  ];

  const statusCounts = gates.reduce(
    (acc, gate) => {
      acc[gate.status] += 1;
      return acc;
    },
    { pass: 0, fail: 0, warning: 0, not_applicable: 0 } as Record<GateStatus, number>,
  );
  const complete = gates.every((gate) => gate.status === 'pass');

  const blockingItems = [
    adoption.invalid > 0 ? `失效采用记录 ${adoption.invalid} 条，样本 ID：${adoption.invalidSampleIds.join(', ') || '-'}` : null,
    counts.activeMappings === 0 ? '供应链映射为 0，采购建议不能平台化。' : null,
    counts.mappingsWithQuote === 0 ? '有可用报价的供应链映射为 0。' : null,
    counts.replenishmentOrders === 0 ? '补货来源平台采购单为 0。' : null,
    counts.shipments === 0 ? '供应商发货单为 0。' : null,
    counts.receivedOrders === 0 ? '已收货平台采购单为 0。' : null,
    counts.procurementInboundMovements === 0 ? '平台采购入库库存流水为 0。' : null,
    counts.settlements === 0 ? '供应商结算单为 0。' : null,
    unitHealth.bomUnitIssues > 0 ? `BOM 单位异常 ${unitHealth.bomUnitIssues} 条。` : null,
  ].filter(Boolean) as string[];

  const report = {
    checkedAt: new Date().toISOString(),
    store,
    complete,
    statusCounts,
    counts,
    adoption,
    unitHealth,
    unitAuditSummary,
    gates,
    blockingItems,
  };

  const markdown = `# 行业标准品到库存采购 BOM 销售链路完成度闸门报告

生成时间：${report.checkedAt}

验收门店：${store.name}（ID ${store.id}）

总状态：${complete ? '已完成' : '未完成'}

## 1. 闸门汇总

${table(
  ['状态', '数量'],
  [
    ['通过', statusCounts.pass],
    ['未通过', statusCounts.fail],
    ['待关注', statusCounts.warning],
    ['当前无样本', statusCounts.not_applicable],
  ],
)}

## 2. 十条完成标准

${table(
  ['序号', '完成标准', '状态', '真实库证据', '下一步'],
  gates.map((gate) => [gate.id, gate.requirement, statusLabel(gate.status), gate.evidence, gate.nextAction]),
)}

## 3. 关键对象计数

${table(
  ['对象', '数量'],
  [
    ['已发布标准品', counts.publishedTemplates],
    ['门店有效产品', counts.activeProducts],
    ['有效采用记录', adoption.valid],
    ['失效采用记录', adoption.invalid],
    ['BOM 产品', counts.productsInBom],
    ['服务扣耗流水', counts.serviceConsumptionMovements],
    ['商品销售出库流水', counts.saleOutboundMovements],
    ['供应链映射', counts.activeMappings],
    ['首选供应链映射', counts.preferredMappings],
    ['有可用报价映射', counts.mappingsWithQuote],
    ['平台采购单', counts.procurementOrders],
    ['补货来源平台采购单', counts.replenishmentOrders],
    ['采购明细', counts.procurementOrderItems],
    ['发货单', counts.shipments],
    ['发货明细', counts.shipmentItems],
    ['已收货平台采购单', counts.receivedOrders],
    ['平台采购入库流水', counts.procurementInboundMovements],
    ['平台采购入库批次', counts.procurementInboundBatches],
    ['供应商结算单', counts.settlements],
    ['BOM 单位异常', unitHealth.bomUnitIssues],
  ],
)}

## 4. 当前阻断项

${blockingItems.length ? blockingItems.map((item) => `- ${item}`).join('\n') : '- 暂无阻断项。'}

## 5. 建议补齐顺序

1. 授权后修复失效采用记录，避免标准品来源追溯指向已删除商品。
2. 授权后执行 BOM 单位修复，让服务扣耗按规格单位落库。
3. 为 1-2 个真实本地 SKU 建立首选供应链映射，并确保供应链 SKU 有已审核、有效期内、非缺货报价。
4. 从库存采购建议生成平台采购单，走供应商确认、发货、门店收货。
5. 复验收货是否写入批次、产品库存、采购入库流水和供应商结算。
6. 再次执行本完成度闸门，要求 10 条完成标准全部通过。

说明：本报告只读，不会创建、修复或删除任何业务数据。
`;

  ensureOutput(outMd);
  ensureOutput(outJson);
  writeFileSync(outMd, markdown, 'utf8');
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`完成度闸门报告生成完成：${outMd}`);
  console.log(`总状态：${complete ? '已完成' : '未完成'}`);
  console.log(`通过 ${statusCounts.pass}，未通过 ${statusCounts.fail}，待关注 ${statusCounts.warning}，当前无样本 ${statusCounts.not_applicable}`);

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
