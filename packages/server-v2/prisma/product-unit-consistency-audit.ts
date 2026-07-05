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

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function unitEqual(left: unknown, right: unknown) {
  return text(left).toLowerCase() === text(right).toLowerCase();
}

function payloadUnit(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const record = payload as Record<string, unknown>;
  return text(record.unit ?? record.specUnit ?? record.packageUnit);
}

function unitRelation(unit: unknown, product: { specUnit?: unknown; packageUnit?: unknown } | null | undefined) {
  if (!text(unit)) return 'missing';
  if (product?.specUnit && unitEqual(unit, product.specUnit)) return 'spec';
  if (product?.packageUnit && unitEqual(unit, product.packageUnit)) return 'package';
  return 'other';
}

function relationLabel(relation: string) {
  const labels: Record<string, string> = {
    missing: '缺单位',
    spec: '规格单位',
    package: '包装单位',
    other: '其他单位',
    no_movement: '无销售出库流水',
  };
  return labels[relation] ?? relation;
}

function countBy<T>(items: T[], keyGetter: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyGetter(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

async function resolveStore(storeId: number) {
  if (!storeId) return null;
  return {
    id: storeId,
    name: argValue('store-name') ?? (storeId === 6 ? 'Ami 全量演示门店' : `门店 ${storeId}`),
  };
}

async function main() {
  const storeId = Number(argValue('store-id') ?? argValue('storeId') ?? 0);
  const store = await resolveStore(storeId);
  const productWhere = { deletedAt: null, ...(store ? { storeId: store.id } : {}) };
  const projectWhere = store ? { storeId: store.id, deletedAt: null } : { deletedAt: null };
  const stockMovementWhere = store ? { storeId: store.id } : {};
  const productOrderWhere = store ? { storeId: store.id } : {};
  const outMd = resolve(process.cwd(), argValue('out-md') ?? `../../docs/04-测试数据/product-unit-consistency-audit-${today}.md`);
  const outJson = resolve(process.cwd(), argValue('out-json') ?? `../../docs/04-测试数据/product-unit-consistency-audit-${today}.json`);

  const products = await prisma.product.findMany({
    where: productWhere,
    select: { id: true, sku: true, name: true, specQuantity: true, specUnit: true, packageUnit: true, unit: true },
    orderBy: { id: 'asc' },
  });
  const bomItems = await prisma.projectBomItem.findMany({
    where: store ? { project: projectWhere } : {},
    include: {
      project: { select: { id: true, name: true } },
      product: { select: { id: true, sku: true, name: true, specUnit: true, packageUnit: true, unit: true } },
    },
    orderBy: { id: 'asc' },
  });
  const stockMovements = await prisma.stockMovement.findMany({
    where: stockMovementWhere,
    include: { product: { select: { id: true, sku: true, name: true, specUnit: true, packageUnit: true, unit: true } } },
    orderBy: { id: 'asc' },
  });
  const orderItems = await prisma.orderItem.findMany({
    where: {
      itemType: { in: ['product', 'goods', 'retail_product'] },
      itemId: { not: null },
      ...(store ? { order: productOrderWhere } : {}),
    },
    select: { id: true, orderId: true, itemType: true, itemId: true, name: true, quantity: true, payload: true },
    orderBy: { id: 'desc' },
    take: 200,
  });

  const productMap = new Map(products.map((product: any) => [product.id, product]));
  const saleOutMovementsByOrderProduct = new Map<string, any[]>();
  for (const movement of stockMovements) {
    if (
      ['sale_out', 'sales_out', 'sales_outbound', 'product_sale'].includes(String(movement.movementType ?? '')) ||
      movement.sourceType === 'product_order'
    ) {
      const key = `${Number(movement.sourceId ?? 0)}:${Number(movement.productId ?? 0)}`;
      const existing = saleOutMovementsByOrderProduct.get(key) ?? [];
      existing.push(movement);
      saleOutMovementsByOrderProduct.set(key, existing);
    }
  }

  const movementUnitRelationSummary = countBy(stockMovements, (movement: any) =>
    [movement.movementType ?? '-', movement.sourceType ?? '-', unitRelation(movement.unit, movement.product)].join('|'),
  ).map((item) => {
    const [movementType, sourceType, relation] = item.key.split('|');
    return { movementType, sourceType, relation, count: item.count };
  });

  const saleOutMovementUnitSummary = movementUnitRelationSummary.filter((item) =>
    ['sale_out', 'sales_out', 'sales_outbound', 'product_sale'].includes(item.movementType) || item.sourceType === 'product_order',
  );
  const productFieldIssues = products
    .filter((product: any) => !product.specQuantity || !text(product.specUnit) || !text(product.packageUnit))
    .map((product: any) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      specQuantity: product.specQuantity === null || product.specQuantity === undefined ? '' : String(product.specQuantity),
      specUnit: product.specUnit ?? '',
      packageUnit: product.packageUnit ?? '',
      legacyUnit: product.unit ?? '',
      suggestion: '补齐规格数量、规格单位和包装；旧 unit 仅作兼容读取。',
    }));

  const bomUnitIssues = bomItems
    .filter((item: any) => text(item.product?.specUnit) && !unitEqual(item.unit, item.product.specUnit))
    .map((item: any) => ({
      bomItemId: item.id,
      projectName: item.project?.name ?? '',
      productName: item.product?.name ?? '',
      sku: item.product?.sku ?? '',
      bomUnit: item.unit,
      productSpecUnit: item.product?.specUnit ?? '',
      packageUnit: item.product?.packageUnit ?? '',
      suggestion: '服务 BOM 建议使用产品规格单位；若确需按包装扣耗，应补包装换算规则。',
    }));

  const movementUnitIssues = stockMovements
    .filter((movement: any) => {
      const specUnit = text(movement.product?.specUnit);
      if (!text(movement.unit)) return true;
      if (!specUnit) return false;
      return !unitEqual(movement.unit, specUnit);
    })
    .map((movement: any) => ({
      movementId: movement.id,
      movementType: movement.movementType,
      sourceType: movement.sourceType ?? '',
      productName: movement.product?.name ?? '',
      sku: movement.product?.sku ?? '',
      movementUnit: movement.unit ?? '',
      productSpecUnit: movement.product?.specUnit ?? '',
      packageUnit: movement.product?.packageUnit ?? '',
      suggestion: !text(movement.unit)
        ? '库存流水缺少单位，历史流水不自动回填；后续写入应带规格单位。'
        : '库存流水单位与规格单位不一致，需按业务口径确认是否为包装销售或历史异常。',
    }));

  const salesUnitIssues = orderItems
    .map((item: any) => {
      const product = productMap.get(Number(item.itemId));
      const unit = payloadUnit(item.payload);
      const relatedMovements = saleOutMovementsByOrderProduct.get(`${Number(item.orderId)}:${Number(item.itemId)}`) ?? [];
      const movementRelations = [...new Set(relatedMovements.map((movement: any) => unitRelation(movement.unit, movement.product)))];
      const payloadRelation = unitRelation(unit, product);
      const movementRelationText = movementRelations.length
        ? movementRelations.map((relation) => relationLabel(relation)).join(' / ')
        : relationLabel('no_movement');
      const hasPackageMovement = movementRelations.includes('package');
      const hasSpecMovement = movementRelations.includes('spec');
      const needsDecision =
        product &&
        text(product.specUnit) &&
        text(product.packageUnit) &&
        (!unit || payloadRelation === 'spec' || (!relatedMovements.length && payloadRelation !== 'package'));
      return {
        orderItemId: item.id,
        orderId: item.orderId,
        itemType: item.itemType,
        productName: product?.name ?? item.name,
        sku: product?.sku ?? '',
        quantity: String(item.quantity ?? ''),
        payloadUnit: unit,
        payloadUnitRelation: payloadRelation,
        saleOutMovementCount: relatedMovements.length,
        saleOutMovementUnits: [...new Set(relatedMovements.map((movement: any) => text(movement.unit)).filter(Boolean))].join(' / '),
        saleOutMovementRelation: movementRelationText,
        productSpecUnit: product?.specUnit ?? '',
        packageUnit: product?.packageUnit ?? '',
        needsDecision,
        suggestion: !unit && hasPackageMovement
          ? '订单明细未存单位，但关联销售出库流水按包装单位落库；建议后续订单 payload 固化 packageUnit。'
          : hasSpecMovement
            ? '销售出库流水按规格单位落库，需确认是否已按规格库存扣减。'
            : needsDecision
              ? '商品销售建议明确按包装销售还是按规格库存扣减；当前记录缺少包装/换算证据。'
              : '当前样本未发现明显销售单位风险。',
      };
    })
    .filter((item) => item.needsDecision);

  const salesUnitEvidence = orderItems.map((item: any) => {
    const product = productMap.get(Number(item.itemId));
    const unit = payloadUnit(item.payload);
    const relatedMovements = saleOutMovementsByOrderProduct.get(`${Number(item.orderId)}:${Number(item.itemId)}`) ?? [];
    const movementRelations = relatedMovements.map((movement: any) => unitRelation(movement.unit, movement.product));
    return {
      orderItemId: item.id,
      orderId: item.orderId,
      productName: product?.name ?? item.name,
      sku: product?.sku ?? '',
      payloadUnit: unit,
      payloadUnitRelation: unitRelation(unit, product),
      saleOutMovementCount: relatedMovements.length,
      saleOutMovementRelation: movementRelations.length ? [...new Set(movementRelations)].join('/') : 'no_movement',
    };
  });

  const salesUnitEvidenceSummary = {
    sampledOrderItems: orderItems.length,
    payloadUnitMissing: salesUnitEvidence.filter((item) => !item.payloadUnit).length,
    linkedSaleOutOrderItems: salesUnitEvidence.filter((item) => item.saleOutMovementCount > 0).length,
    noLinkedSaleOutOrderItems: salesUnitEvidence.filter((item) => item.saleOutMovementCount === 0).length,
    saleOutUsesPackageUnit: salesUnitEvidence.filter((item) => item.saleOutMovementRelation.includes('package')).length,
    saleOutUsesSpecUnit: salesUnitEvidence.filter((item) => item.saleOutMovementRelation.includes('spec')).length,
    saleOutUsesOtherOrMissingUnit: salesUnitEvidence.filter(
      (item) => item.saleOutMovementRelation.includes('other') || item.saleOutMovementRelation.includes('missing'),
    ).length,
  };

  const result = {
    checkedAt: new Date().toISOString(),
    scope: store ? { storeId: store.id, storeName: store.name } : { storeId: null, storeName: '全部门店' },
    totals: {
      products: products.length,
      bomItems: bomItems.length,
      stockMovements: stockMovements.length,
      sampledProductOrderItems: orderItems.length,
      productFieldIssueCount: productFieldIssues.length,
      bomUnitIssueCount: bomUnitIssues.length,
      movementUnitIssueCount: movementUnitIssues.length,
      salesUnitDecisionIssueCount: salesUnitIssues.length,
    },
    movementUnitRelationSummary,
    saleOutMovementUnitSummary,
    salesUnitEvidenceSummary,
    productFieldIssues,
    bomUnitIssues,
    movementUnitIssues,
    salesUnitIssues,
    recommendation: [
      '短期保持库存主数量口径不变；服务扣耗新增写入带 product.specUnit，商品销售新增写入带 product.packageUnit。',
      '商品销售页面文案使用包装，服务 BOM 和服务扣耗页面使用规格单位。',
    '历史流水只输出异常清单，不自动批量修改。',
      '新增商品订单写入已要求把 packageUnit 固化到 OrderItem.payload，形成可审计证据；历史订单不自动回填。',
    '中期新增包装换算字段后，再决定是否把库存主数量切换为最小规格单位。',
    ],
  };

const md = `# 产品规格/包装/库存单位一致性巡检报告

生成时间：${result.checkedAt}

验收范围：${store ? `${store.name}（ID ${store.id}）` : '全部门店'}

## 1. 汇总

${table(
  ['检查项', '数量'],
  [
    ['有效产品', result.totals.products],
    ['BOM 明细', result.totals.bomItems],
    ['库存流水', result.totals.stockMovements],
    ['抽样商品销售明细', result.totals.sampledProductOrderItems],
    ['产品规格/包装字段缺失', result.totals.productFieldIssueCount],
    ['BOM 单位与规格单位不一致', result.totals.bomUnitIssueCount],
    ['库存流水单位缺失或不一致', result.totals.movementUnitIssueCount],
    ['商品销售单位口径待确认', result.totals.salesUnitDecisionIssueCount],
  ],
)}

### 1.1 销售口径证据汇总

${table(
  ['检查项', '数量'],
  [
    ['抽样商品销售明细', result.salesUnitEvidenceSummary.sampledOrderItems],
    ['订单明细未固化单位', result.salesUnitEvidenceSummary.payloadUnitMissing],
    ['可关联销售出库流水的订单明细', result.salesUnitEvidenceSummary.linkedSaleOutOrderItems],
    ['未关联销售出库流水的订单明细', result.salesUnitEvidenceSummary.noLinkedSaleOutOrderItems],
    ['销售出库按包装单位落库', result.salesUnitEvidenceSummary.saleOutUsesPackageUnit],
    ['销售出库按规格单位落库', result.salesUnitEvidenceSummary.saleOutUsesSpecUnit],
    ['销售出库单位缺失/其他', result.salesUnitEvidenceSummary.saleOutUsesOtherOrMissingUnit],
  ],
)}

### 1.2 库存流水单位关系 Top 20

${table(
  ['流水类型', '来源', '单位关系', '数量'],
  result.movementUnitRelationSummary.slice(0, 20).map((item) => [item.movementType, item.sourceType, relationLabel(item.relation), item.count]),
)}

## 2. 产品字段缺失

${productFieldIssues.length ? table(
  ['产品ID', 'SKU', '产品', '规格数量', '规格单位', '包装', '旧unit', '建议'],
  productFieldIssues.slice(0, 80).map((item) => [item.productId, item.sku, item.name, item.specQuantity, item.specUnit, item.packageUnit, item.legacyUnit, item.suggestion]),
) : '未发现产品规格/包装字段缺失。'}

## 3. BOM 单位异常

${bomUnitIssues.length ? table(
  ['BOM项ID', '项目', '产品', 'SKU', 'BOM单位', '产品规格单位', '包装', '建议'],
  bomUnitIssues.slice(0, 80).map((item) => [item.bomItemId, item.projectName, item.productName, item.sku, item.bomUnit, item.productSpecUnit, item.packageUnit, item.suggestion]),
) : '未发现 BOM 单位与产品规格单位不一致。'}

## 4. 库存流水单位异常

${movementUnitIssues.length ? table(
  ['流水ID', '类型', '来源', '产品', 'SKU', '流水单位', '规格单位', '包装', '建议'],
  movementUnitIssues.slice(0, 120).map((item) => [item.movementId, item.movementType, item.sourceType, item.productName, item.sku, item.movementUnit, item.productSpecUnit, item.packageUnit, item.suggestion]),
) : '未发现库存流水单位缺失或与规格单位不一致。'}

## 5. 商品销售单位口径待确认

${salesUnitIssues.length ? table(
  ['订单明细ID', '订单ID', '产品', 'SKU', '数量', '订单单位', '销售出库单位', '销售出库关系', '规格单位', '包装', '建议'],
  salesUnitIssues.slice(0, 80).map((item) => [
    item.orderItemId,
    item.orderId,
    item.productName,
    item.sku,
    item.quantity,
    item.payloadUnit,
    item.saleOutMovementUnits,
    item.saleOutMovementRelation,
    item.productSpecUnit,
    item.packageUnit,
    item.suggestion,
  ]),
) : '抽样商品销售明细未发现明显单位口径风险。'}

## 6. 建议

${result.recommendation.map((item) => `- ${item}`).join('\n')}
`;

  ensureOutput(outMd);
  ensureOutput(outJson);
  writeFileSync(outMd, md, 'utf8');
  writeFileSync(outJson, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
