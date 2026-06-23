import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type ReconcileArgs = {
  storeId?: number;
  from: Date;
  to: Date;
  sampleSize: number;
};

type ReconcileRow = {
  type: 'product' | 'project';
  orderId: number;
  orderNo: string | null;
  orderCreatedAt: string;
  orderSource: string | null;
  orderItemId: number;
  itemObjectId: number | null;
  itemName: string;
  quantity: number;
  salesAmount: number;
  refundShare: number;
  netSalesAmount: number;
  costSource: string;
  productCost?: number;
  standardMaterialCost?: number;
  actualMaterialCost?: number;
  materialCost?: number;
  commissionCost: number;
  grossProfit: number;
  marginRate: number;
  missingReasons: string[];
  formula: string;
};

type ProductCostRecord = {
  id: number;
  categoryId: number | null;
  costPrice: unknown;
};

type ProjectCostRecord = {
  id: number;
  name: string;
  typeId: number | null;
  bomItems: Array<{
    productId: number;
    standardQty: unknown;
    product: { costPrice: unknown };
  }>;
};

type CommissionAmountRecord = {
  orderItemId: number | null;
  amount: unknown;
};

type CommissionRuleRecord = {
  type: string;
  targetType: string;
  targetId: number | null;
  levelId: number | null;
  userId: number | null;
  status: string;
};

type MaterialMovementRecord = {
  productId: number;
  sourceId: number | null;
  quantity: unknown;
  remark: string | null;
  product: { costPrice: unknown };
};

type SchemaCapabilities = {
  commissionRuleUserId: boolean;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

function parseArgs(): ReconcileArgs {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }

  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = `${now.getFullYear()}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  const fromText = args.get('from') ?? defaultFrom;
  const toText = args.get('to') ?? defaultTo;
  const storeId = args.get('storeId') ? Number(args.get('storeId')) : undefined;
  const sampleSize = Number(args.get('sampleSize') ?? 3);

  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }
  if (!Number.isInteger(sampleSize) || sampleSize <= 0 || sampleSize > 20) {
    throw new Error('--sampleSize must be an integer between 1 and 20');
  }

  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('--from/--to must be valid date strings like 2026-06-01');
  }

  return { storeId, from, to, sampleSize };
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function itemType(value: unknown) {
  return String(value ?? '').toLowerCase();
}

function getPayloadNumber(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== 'object') return undefined;
  const source = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined || value === '') continue;
    const normalized = Number(value);
    if (Number.isFinite(normalized) && normalized > 0) return normalized;
  }
  return undefined;
}

function getRefundShare(item: { subtotal: unknown; order: any }) {
  const orderTotal = Math.max(toNumber(item.order.totalAmount), 0);
  if (orderTotal <= 0) return 0;
  const refundAmount = (item.order.refundRecords ?? [])
    .filter((refund: any) => ['completed', 'success', 'paid', 'refunded'].includes(String(refund.status)))
    .reduce((sum: number, refund: any) => sum + toNumber(refund.amount), 0);
  if (refundAmount <= 0) return 0;
  const subtotal = toNumber(item.subtotal);
  return Math.min(subtotal, refundAmount * (subtotal / orderTotal));
}

function resolveProductCost(item: any, productCostById: Map<number, number>) {
  const quantity = toNumber(item.quantity) || 1;
  const costAmount = getPayloadNumber(item.payload, ['costAmount', 'productCostAmount']);
  if (costAmount !== undefined) {
    return { amount: costAmount, source: 'order_snapshot' };
  }
  const unitCost = getPayloadNumber(item.payload, ['costPrice', 'unitCost', 'productCostPrice']);
  if (unitCost !== undefined) {
    return { amount: unitCost * quantity, source: 'order_snapshot' };
  }
  const productId = Number(item.itemId);
  const masterCost = toNumber(productCostById.get(productId));
  if (masterCost > 0) {
    return { amount: masterCost * quantity, source: 'product_master' };
  }
  return { amount: 0, source: 'missing' };
}

function marginStatus(marginRate: number, grossProfit: number, missingReasons: string[]) {
  if (missingReasons.length) return 'needs_data_fix';
  if (grossProfit < 0) return 'loss';
  if (marginRate < 0.3) return 'low_margin';
  if (marginRate >= 0.5) return 'high_profit';
  return 'normal';
}

function movementBelongsToProject(movement: any, project: any) {
  const bomProductIds = new Set((project?.bomItems ?? []).map((item: any) => Number(item.productId)).filter(Boolean));
  if (bomProductIds.size > 0 && !bomProductIds.has(Number(movement.productId))) return false;

  const remark = String(movement.remark ?? '').trim();
  if (remark && project?.name && !remark.includes(project.name)) return false;

  return true;
}

async function columnExists(tableName: string, columnName: string) {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    'select exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = $1 and column_name = $2) as exists',
    tableName,
    columnName,
  );
  return Boolean(rows[0]?.exists);
}

async function getSchemaCapabilities(): Promise<SchemaCapabilities> {
  return {
    commissionRuleUserId: await columnExists('CommissionRule', 'userId'),
  };
}

async function getCommissionRules(storeId: number | undefined, hasUserIdColumn: boolean): Promise<CommissionRuleRecord[]> {
  const rows = await prisma.$queryRawUnsafe<CommissionRuleRecord[]>(
    `select "type",
            "targetType",
            "targetId",
            "levelId",
            ${hasUserIdColumn ? '"userId"' : 'null::integer as "userId"'},
            "status"
       from "CommissionRule"
      where "type" in ('product', 'project')
        and "status" = 'active'
        and ($1::integer is null or "storeId" = $1::integer)`,
    storeId ?? null,
  );
  return rows;
}

function ruleMatchesAssignee(rule: CommissionRuleRecord, assignee?: { userId?: number | null; levelId?: number | null }) {
  const userId = toNumber(rule.userId);
  const levelId = toNumber(rule.levelId);
  if (userId > 0 && userId !== toNumber(assignee?.userId)) return false;
  if (levelId > 0 && levelId !== toNumber(assignee?.levelId)) return false;
  return true;
}

function hasCommissionRuleCoverage(
  rules: CommissionRuleRecord[],
  item: any,
  type: 'product' | 'project',
  categoryId?: number | null,
  assignee?: { userId?: number | null; levelId?: number | null },
) {
  return rules.some((rule) => {
    if (rule.type !== type || rule.status !== 'active' || !ruleMatchesAssignee(rule, assignee)) return false;
    const targetType = String(rule.targetType ?? 'all').toLowerCase();
    if (targetType === 'all') return true;
    if (targetType === 'category') return Boolean(categoryId && toNumber(rule.targetId) === categoryId);
    if (targetType === 'specific') return Boolean(item.itemId && toNumber(rule.targetId) === toNumber(item.itemId));
    return false;
  });
}

async function main() {
  const args = parseArgs();
  const schemaCapabilities = await getSchemaCapabilities();
  const orders = await prisma.productOrder.findMany({
    where: {
      ...(args.storeId ? { storeId: args.storeId } : {}),
      createdAt: { gte: args.from, lte: args.to },
      status: { in: ['completed', 'paid', '已完成', '已付款'] },
    },
    select: {
      id: true,
      orderNo: true,
      storeId: true,
      totalAmount: true,
      source: true,
      status: true,
      createdAt: true,
      orderItems: {
        select: {
          id: true,
          itemType: true,
          itemId: true,
          name: true,
          quantity: true,
          subtotal: true,
          beauticianId: true,
          payload: true,
        },
      },
      refundRecords: { select: { amount: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const orderItems = orders.flatMap((order) => order.orderItems.map((item) => ({ ...item, order })));
  const productItems = orderItems.filter((item) => ['product', 'goods'].includes(itemType(item.itemType))).slice(0, args.sampleSize);
  const allProjectItems = orderItems.filter((item) => ['project', 'service', 'service_project'].includes(itemType(item.itemType)));
  const projectItems = allProjectItems.slice(0, args.sampleSize);

  const productIds = [...new Set(productItems.map((item) => item.itemId).filter((id): id is number => Boolean(id)))];
  const projectIds = [...new Set(allProjectItems.map((item) => item.itemId).filter((id): id is number => Boolean(id)))];
  const orderItemIds = [...new Set([...productItems, ...projectItems].map((item) => item.id))];
  const orderIds = [...new Set(projectItems.map((item) => item.order.id))];
  const beauticianIds = [...new Set([...productItems, ...projectItems].map((item) => item.beauticianId).filter((id): id is number => Boolean(id)))];

  const [products, projects, commissionRecords, stockMovements, commissionRules, beauticians]: [
    ProductCostRecord[],
    ProjectCostRecord[],
    CommissionAmountRecord[],
    MaterialMovementRecord[],
    CommissionRuleRecord[],
    Array<{ id: number; userId: number | null; levelId: number | null }>,
  ] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds }, ...(args.storeId ? { storeId: args.storeId } : {}) },
          select: { id: true, categoryId: true, costPrice: true },
        })
      : [],
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: {
            name: true,
            id: true,
            typeId: true,
            bomItems: {
              select: {
                productId: true,
                standardQty: true,
                product: { select: { costPrice: true } },
              },
            },
          },
        })
      : [],
    orderItemIds.length
      ? prisma.commissionRecord.findMany({
          where: { orderItemId: { in: orderItemIds }, status: { not: 'cancelled' } },
          select: { orderItemId: true, type: true, amount: true },
        })
      : [],
    orderIds.length
      ? prisma.stockMovement.findMany({
          where: {
            ...(args.storeId ? { storeId: args.storeId } : {}),
            movementType: { in: ['service_consume', 'service_consumption'] },
            sourceType: 'project_order',
            sourceId: { in: orderIds },
            occurredAt: { gte: args.from, lte: args.to },
          },
          select: {
            productId: true,
            sourceId: true,
            quantity: true,
            remark: true,
            product: { select: { costPrice: true } },
          },
        })
      : [],
    [...productItems, ...projectItems].length ? getCommissionRules(args.storeId, schemaCapabilities.commissionRuleUserId) : [],
    beauticianIds.length
      ? prisma.beautician.findMany({
          where: { id: { in: beauticianIds }, ...(args.storeId ? { storeId: args.storeId } : {}) },
          select: { id: true, userId: true, levelId: true },
        })
      : [],
  ]);

  const productCostById = new Map<number, number>(products.map((product): [number, number] => [product.id, toNumber(product.costPrice)]));
  const productCategoryById = new Map<number, number | null>(products.map((product): [number, number | null] => [product.id, product.categoryId ?? null]));
  const projectById = new Map<number, (typeof projects)[number]>(projects.map((project): [number, (typeof projects)[number]] => [project.id, project]));
  const assigneeByBeauticianId = new Map<number, { userId?: number | null; levelId?: number | null }>(
    beauticians.map((beautician): [number, { userId?: number | null; levelId?: number | null }] => [
      beautician.id,
      { userId: beautician.userId, levelId: beautician.levelId },
    ]),
  );
  const commissionByOrderItemId = new Map<number, number>();
  for (const record of commissionRecords) {
    if (!record.orderItemId) continue;
    commissionByOrderItemId.set(record.orderItemId, toNumber(commissionByOrderItemId.get(record.orderItemId)) + toNumber(record.amount));
  }
  const productRows: ReconcileRow[] = productItems.map((item) => {
    const missingReasons: string[] = [];
    const salesAmount = toNumber(item.subtotal);
    const refundShare = getRefundShare(item);
    const netSalesAmount = Math.max(0, salesAmount - refundShare);
    const productCost = resolveProductCost(item, productCostById);
    const commissionCost = toNumber(commissionByOrderItemId.get(item.id));
    if (!item.beauticianId) missingReasons.push('missing_assignee');
    const commissionRuleCovered = hasCommissionRuleCoverage(
      commissionRules,
      item,
      'product',
      item.itemId ? productCategoryById.get(item.itemId) : undefined,
      assigneeByBeauticianId.get(toNumber(item.beauticianId)),
    );
    if (productCost.source === 'missing') missingReasons.push('missing_cost');
    if (salesAmount > 0 && commissionCost <= 0) {
      missingReasons.push('missing_commission');
      if (!commissionRuleCovered) missingReasons.push('missing_commission_rule');
    }
    const grossProfit = netSalesAmount - productCost.amount - commissionCost;
    const marginRate = netSalesAmount > 0 ? grossProfit / netSalesAmount : 0;
    return {
      type: 'product',
      orderId: item.order.id,
      orderNo: item.order.orderNo,
      orderCreatedAt: item.order.createdAt.toISOString(),
      orderSource: item.order.source,
      orderItemId: item.id,
      itemObjectId: item.itemId,
      itemName: item.name,
      quantity: round(toNumber(item.quantity)),
      salesAmount: round(salesAmount),
      refundShare: round(refundShare),
      netSalesAmount: round(netSalesAmount),
      costSource: productCost.source,
      productCost: round(productCost.amount),
      commissionCost: round(commissionCost),
      grossProfit: round(grossProfit),
      marginRate: round(marginRate, 4),
      missingReasons,
      formula: `${round(netSalesAmount)} - ${round(productCost.amount)} - ${round(commissionCost)} = ${round(grossProfit)}`,
    };
  });

  const projectRows: ReconcileRow[] = projectItems.map((item) => {
    const missingReasons: string[] = [];
    const project = item.itemId ? projectById.get(item.itemId) : undefined;
    const quantity = toNumber(item.quantity) || 1;
    const salesAmount = toNumber(item.subtotal);
    const refundShare = getRefundShare(item);
    const netSalesAmount = Math.max(0, salesAmount - refundShare);
    if (!project) missingReasons.push('missing_project_master');
    if (!project || !project.bomItems.length) missingReasons.push('missing_bom');
    const standardMaterialCost = project
      ? project.bomItems.reduce((sum, bom) => sum + toNumber(bom.standardQty) * toNumber(bom.product?.costPrice), 0) * quantity
      : 0;
    const actualMaterialCost = stockMovements.reduce((sum, movement) => {
      if (!project) return sum;
      if (movement.sourceId !== item.order.id) return sum;
      if (!movementBelongsToProject(movement, project)) return sum;
      return sum + Math.abs(toNumber(movement.quantity)) * toNumber(movement.product?.costPrice);
    }, 0);
    if (project && netSalesAmount > 0 && actualMaterialCost <= 0) missingReasons.push('missing_actual_consumption');
    const materialCost = actualMaterialCost > 0 ? actualMaterialCost : standardMaterialCost;
    const costSource = !project ? 'missing_project_master' : actualMaterialCost > 0 ? 'stock_movement' : standardMaterialCost > 0 ? 'project_bom' : 'missing';
    const commissionCost = toNumber(commissionByOrderItemId.get(item.id));
    if (!item.beauticianId) missingReasons.push('missing_assignee');
    const commissionRuleCovered = hasCommissionRuleCoverage(
      commissionRules,
      item,
      'project',
      project?.typeId,
      assigneeByBeauticianId.get(toNumber(item.beauticianId)),
    );
    if (salesAmount > 0 && commissionCost <= 0) {
      missingReasons.push('missing_commission');
      if (!commissionRuleCovered) missingReasons.push('missing_commission_rule');
    }
    const grossProfit = netSalesAmount - materialCost - commissionCost;
    const marginRate = netSalesAmount > 0 ? grossProfit / netSalesAmount : 0;
    return {
      type: 'project',
      orderId: item.order.id,
      orderNo: item.order.orderNo,
      orderCreatedAt: item.order.createdAt.toISOString(),
      orderSource: item.order.source,
      orderItemId: item.id,
      itemObjectId: item.itemId,
      itemName: item.name,
      quantity: round(quantity),
      salesAmount: round(salesAmount),
      refundShare: round(refundShare),
      netSalesAmount: round(netSalesAmount),
      costSource,
      standardMaterialCost: round(standardMaterialCost),
      actualMaterialCost: round(actualMaterialCost),
      materialCost: round(materialCost),
      commissionCost: round(commissionCost),
      grossProfit: round(grossProfit),
      marginRate: round(marginRate, 4),
      missingReasons,
      formula: `${round(netSalesAmount)} - ${round(materialCost)} - ${round(commissionCost)} = ${round(grossProfit)}`,
    };
  });

  const rows = [...productRows, ...projectRows];
  const projectMasterGapItems = allProjectItems.filter((item) => !item.itemId || !projectById.has(item.itemId));
  const projectMasterGapSamples = projectMasterGapItems.slice(0, args.sampleSize).map((item) => ({
    orderId: item.order.id,
    orderNo: item.order.orderNo,
    orderCreatedAt: item.order.createdAt.toISOString(),
    orderItemId: item.id,
    itemObjectId: item.itemId,
    itemName: item.name,
    quantity: round(toNumber(item.quantity) || 1),
    salesAmount: round(toNumber(item.subtotal)),
    missingReasons: ['missing_project_master', 'missing_bom'],
  }));
  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        purpose: 'operation-profit-margin-sample-reconciliation',
        storeId: args.storeId ?? null,
        from: args.from.toISOString(),
        to: args.to.toISOString(),
        sampleSize: args.sampleSize,
        schemaCapabilities,
        commissionRuleCoverageMode: schemaCapabilities.commissionRuleUserId ? 'full' : 'legacy_without_user_scope',
        summary: {
          orderCount: orders.length,
          productSamples: productRows.length,
          projectSamples: projectRows.length,
          readySamples: rows.filter((row) => !row.missingReasons.length).length,
          samplesWithGaps: rows.filter((row) => row.missingReasons.length).length,
          projectMasterGapItems: projectMasterGapItems.length,
        },
        dataGaps: {
          projectMasterGapSamples,
        },
        samples: {
          product: productRows.map((row) => ({ ...row, status: marginStatus(row.marginRate, row.grossProfit, row.missingReasons) })),
          project: projectRows.map((row) => ({ ...row, status: marginStatus(row.marginRate, row.grossProfit, row.missingReasons) })),
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
