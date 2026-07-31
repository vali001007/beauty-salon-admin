import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  resolveFinanceGrossMarginValue,
  resolveFinanceOrderProfitValue,
} from './ami-brain-gold-standard-audit-core.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const MANIFEST_PATH = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-事实金标准/ami-brain-gold-standard-manifest-v1.json',
);
const SUPPORTED_RESOLVERS = new Set([
  'finance.payment_method_amounts',
  'finance.card_recognized_revenue',
  'finance.order_profit',
  'finance.gross_margin',
  'finance.stored_value_liability',
  'finance.cash_shift_reconciliation',
  'finance.operating_profit',
  'finance.unfulfilled_card_liability',
  'finance.cost_income_ratio',
  'finance.staff_commission_composition',
  'catalog.project_sales',
  'catalog.project_bom_items',
  'inventory.stock_or_consumption_fact',
  'inventory.stock_risk_fact',
  'inventory.procurement_fact',
  'customer.consumption_records',
  'customer.new_customer_count',
  'customer.profile_scalar',
  'customer.last_visit_at',
  'customer.expiring_card_unbooked',
  'customer.card_holders_without_visit',
  'customer.visited_member_tier_set',
  'customer.new_customer_repeat_purchase_count',
  'customer.member_tier_count',
  'customer.cumulative_spend',
  'customer.visited_customer_count',
  'customer.tag_set',
  'fulfillment.arrival_or_task_count',
  'fulfillment.card_usage_count',
  'fulfillment.reservation_fact',
  'staff.active_beautician_count',
  'staff.schedule_fact',
  'staff.served_customer_count',
  'staff.level_scalar',
  'staff.project_skill_set',
]);
const ARRIVED_STATUSES = [
  'checked_in',
  'in_service',
  'arrived',
  'completed',
  'served',
  '已到店',
  '服务中',
  '已完成',
];
const INVALID_ORDER_STATUSES = ['cancelled', 'canceled', 'refunded', '已取消'];
const CANCELLED_RESERVATION_STATUSES = ['cancelled', 'canceled', '已取消'];
const PENDING_CONFIRMATION_STATUSES = ['pending', '待确认'];
const PENDING_ARRIVAL_STATUSES = ['pending', 'confirmed', 'scheduled', '待确认', '已确认'];
const NO_SHOW_STATUSES = ['no_show', 'missed', '爽约', '未到店'];
const EFFECTIVE_SCHEDULE_STATUSES = ['available', 'working', 'published'];
const INVALID_PROCUREMENT_STATUSES = ['cancelled', 'canceled', 'rejected', 'closed'];
const RECEIVED_PROCUREMENT_STATUSES = ['received', 'settled', 'completed', 'closed'];
const INVALID_PAYMENT_STATUSES = ['failed', 'cancelled', 'canceled', 'refunded', 'rejected'];
const INVALID_COMMISSION_STATUSES = ['cancelled', 'canceled', 'rejected'];
const MEMBER_TIER_ORDER = ['无', '普通', '普通会员', '银卡', '金卡', '钻石', '钻石会员'];

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const storeId = Number(valueArg('--store-id'));
const groupKey = valueArg('--group') ?? 'customer';
const refreshCaseId = valueArg('--refresh-case-id');
if (!['finance', 'catalog', 'customer', 'staff', 'fulfillment', 'inventory'].includes(groupKey)) {
  throw new Error(`gold standard audit group unsupported:${groupKey}`);
}
const outputPath = resolve(
  REPO_ROOT,
  `docs/04-测试数据/Ami-Brain-事实金标准/ami-brain-gold-standard-truth-${groupKey}-v1.json`,
);
const rawManifest = readFileSync(MANIFEST_PATH, 'utf8');
const manifest = JSON.parse(rawManifest);
const groupCases = manifest.cases.filter((item) => item.groupKey === groupKey);
const supportedCases = groupCases.filter((item) => SUPPORTED_RESOLVERS.has(item.audit?.resolverKey));
const unsupportedCases = groupCases.filter((item) => !SUPPORTED_RESOLVERS.has(item.audit?.resolverKey));
const casesToResolve = refreshCaseId
  ? supportedCases.filter((item) => item.sourceCaseId === refreshCaseId)
  : supportedCases;

if (refreshCaseId && casesToResolve.length !== 1) {
  throw new Error(`gold standard refresh case unavailable:${groupKey}:${refreshCaseId}`);
}

if (!execute) {
  console.log(
    JSON.stringify(
      {
        schemaVersion: 'ami-brain-gold-standard-audit-coverage/v1',
        groupKey,
        manifestVersion: manifest.manifestVersion,
        manifestChecksum: sha256(rawManifest),
        supportedCaseCount: supportedCases.length,
        unsupportedCaseCount: unsupportedCases.length,
        supportedResolvers: [...SUPPORTED_RESOLVERS].sort(),
        supportedCaseIds: supportedCases.map((item) => item.sourceCaseId),
        unsupportedResolvers: countBy(unsupportedCases.map((item) => item.audit?.resolverKey ?? 'missing')),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('store-id is required for audit execution');
if (storeId !== Number(manifest.fixedDataContract?.storeId)) throw new Error('gold standard audit store-id mismatch');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const databaseHost = new URL(databaseUrl).hostname;
if (!databaseHost.endsWith('.supabase.com')) throw new Error('gold standard audit database host is not approved');

const snapshotAt = new Date();
const snapshotAtLabel = new Intl.DateTimeFormat('zh-CN', {
  timeZone: manifest.fixedDataContract.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}).format(snapshotAt);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 10_000 }),
});

try {
  const snapshots = await prisma.$transaction(
    async (tx) => {
      const store = await tx.store.findUniqueOrThrow({
        where: { id: storeId },
        select: { id: true, createdAt: true, updatedAt: true },
      });
      const customers = await tx.customer.findMany({
        where: { storeId, deletedAt: null },
        select: {
          id: true,
          name: true,
          memberLevel: true,
          source: true,
          totalSpent: true,
          lastVisitDate: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      });
      const beauticians = await tx.beautician.findMany({
        where: { storeId },
        select: {
          id: true,
          name: true,
          status: true,
          levelId: true,
          level: { select: { id: true, name: true, createdAt: true } },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      });
      const projects = await tx.project.findMany({
        where: { storeId, deletedAt: null },
        select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
        orderBy: { id: 'asc' },
      });
      const products = await tx.product.findMany({
        where: { storeId, deletedAt: null },
        select: {
          id: true,
          categoryId: true,
          sku: true,
          name: true,
          status: true,
          currentStock: true,
          safetyStock: true,
          costPrice: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
      });
      const context = {
        tx,
        storeId,
        snapshotAt,
        store,
        customers,
        beauticians,
        projects,
        products,
        stockAtCache: new Map(),
        timezone: manifest.fixedDataContract.timezone,
      };
      const values = [];
      const blocked = [];
      for (const item of casesToResolve) {
        try {
          const resolved = await resolveCase(context, item);
          const valueChecksum = sha256(stableJson(resolved.value));
          values.push({
            goldCaseId: item.goldCaseId,
            sourceCaseId: item.sourceCaseId,
            resolverKey: item.audit.resolverKey,
            queryVersion: item.audit.queryVersion,
            evaluationQuestion: item.evaluationQuestion.replaceAll('{{snapshotAtLabel}}', snapshotAtLabel),
            snapshotAt: snapshotAt.toISOString(),
            sourceRowCount: resolved.sourceKeys.length,
            sourceChecksum: sha256([...resolved.sourceKeys].sort().join('\n')),
            value: resolved.value,
            valueChecksum,
            comparison: item.audit.comparison,
            definition: resolved.definition,
            status: 'ready',
          });
        } catch (error) {
          blocked.push({
            goldCaseId: item.goldCaseId,
            sourceCaseId: item.sourceCaseId,
            resolverKey: item.audit.resolverKey,
            status: 'blocked',
            reason: error instanceof Error ? error.message : 'audit_resolver_failed',
          });
        }
      }
      return { values, blocked };
    },
    { isolationLevel: 'RepeatableRead', timeout: 120_000 },
  );
  const output = refreshCaseId
    ? refreshReadyTruthArtifact({
        outputPath,
        groupKey,
        groupCases,
        manifestVersion: manifest.manifestVersion,
        manifestRaw: rawManifest,
        snapshotAt,
        databaseHost,
        storeId,
        timezone: manifest.fixedDataContract.timezone,
        refreshedCaseId: refreshCaseId,
        values: snapshots.values,
        blocked: snapshots.blocked,
      })
    : {
    schemaVersion: 'ami-brain-gold-standard-truth/v1',
    truthVersion: `${groupKey}-v1-${snapshotAt.toISOString()}`,
    status:
      snapshots.values.length === groupCases.length && snapshots.blocked.length === 0 && supportedCases.length === groupCases.length
        ? 'ready'
        : 'partial',
    generatedAt: snapshotAt.toISOString(),
    environment: 'approved_supabase_development_read_only',
    databaseHost,
    storeId,
    groupKey,
    timezone: manifest.fixedDataContract.timezone,
    manifestVersion: manifest.manifestVersion,
    manifestChecksum: sha256(rawManifest),
    supportedCaseCount: supportedCases.length,
    groupCaseCount: groupCases.length,
    readyCaseCount: snapshots.values.length,
    blockedCaseCount: snapshots.blocked.length,
    remainingCaseCount: groupCases.length - snapshots.values.length,
    manifestRemainingCaseCount: manifest.caseCount - snapshots.values.length,
    sourceDatasetChecksum: sha256(
      snapshots.values.map((item) => `${item.sourceCaseId}:${item.sourceChecksum}`).sort().join('\n'),
    ),
    snapshots: snapshots.values,
    blockedCases: snapshots.blocked,
      };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        output: relative(outputPath),
        groupKey,
        status: output.status,
        readyCaseCount: output.readyCaseCount,
        blockedCaseCount: output.blockedCaseCount,
        remainingCaseCount: output.remainingCaseCount,
        checksum: sha256(`${JSON.stringify(output, null, 2)}\n`),
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}

function refreshReadyTruthArtifact({
  outputPath,
  groupKey,
  groupCases,
  manifestVersion,
  manifestRaw,
  snapshotAt,
  databaseHost,
  storeId,
  timezone,
  refreshedCaseId,
  values,
  blocked,
}) {
  if (blocked.length || values.length !== 1 || values[0]?.sourceCaseId !== refreshedCaseId) {
    throw new Error(`gold standard ready truth refresh failed:${refreshedCaseId}`);
  }
  const previousRaw = readFileSync(outputPath, 'utf8');
  const previous = JSON.parse(previousRaw);
  if (
    previous.schemaVersion !== 'ami-brain-gold-standard-truth/v1' ||
    previous.status !== 'ready' ||
    previous.groupKey !== groupKey ||
    previous.groupCaseCount !== groupCases.length ||
    previous.readyCaseCount !== groupCases.length ||
    previous.snapshots?.length !== groupCases.length
  ) {
    throw new Error(`gold standard existing ready truth invalid:${groupKey}`);
  }
  const replacement = values[0];
  const previousSnapshot = previous.snapshots.find((item) => item.sourceCaseId === refreshedCaseId);
  if (!previousSnapshot) throw new Error(`gold standard existing truth case missing:${refreshedCaseId}`);
  const nextSnapshots = previous.snapshots.map((item) =>
    item.sourceCaseId === refreshedCaseId ? replacement : item,
  );
  const expectedCaseIds = new Set(groupCases.map((item) => item.sourceCaseId));
  if (
    nextSnapshots.some((item) => !expectedCaseIds.has(item.sourceCaseId)) ||
    new Set(nextSnapshots.map((item) => item.sourceCaseId)).size !== groupCases.length
  ) {
    throw new Error(`gold standard refreshed truth set invalid:${groupKey}`);
  }
  const generatedAt = snapshotAt.toISOString();
  return {
    ...previous,
    truthVersion: `${groupKey}-v1-${generatedAt}`,
    status: 'ready',
    generatedAt,
    environment: 'approved_supabase_development_read_only',
    databaseHost,
    storeId,
    groupKey,
    timezone,
    manifestVersion,
    manifestChecksum: sha256(manifestRaw),
    supportedCaseCount: groupCases.length,
    groupCaseCount: groupCases.length,
    readyCaseCount: groupCases.length,
    blockedCaseCount: 0,
    remainingCaseCount: 0,
    sourceDatasetChecksum: sha256(
      nextSnapshots.map((item) => `${item.sourceCaseId}:${item.sourceChecksum}`).sort().join('\n'),
    ),
    snapshots: nextSnapshots,
    blockedCases: [],
    refreshHistory: [
      ...(Array.isArray(previous.refreshHistory) ? previous.refreshHistory : []),
      {
        refreshedAt: generatedAt,
        sourceCaseId: refreshedCaseId,
        previousTruthVersion: previous.truthVersion,
        previousArtifactChecksum: sha256(previousRaw),
        previousValueChecksum: previousSnapshot.valueChecksum,
        valueChecksum: replacement.valueChecksum,
        sourceManifestChecksum: sha256(manifestRaw),
        policy: 'single_case_read_only_repeatable_read_refresh_preserving_other_ready_snapshots',
      },
    ],
  };
}

async function resolveCase(context, item) {
  const key = item.audit.resolverKey;
  if (key === 'finance.payment_method_amounts') return financePaymentMethodAmounts(context, item);
  if (key === 'finance.card_recognized_revenue') return financeCardRecognizedRevenue(context, item);
  if (key === 'finance.order_profit') return financeOrderProfit(context, item);
  if (key === 'finance.gross_margin') return financeGrossMargin(context, item);
  if (key === 'finance.stored_value_liability') return financeStoredValueLiability(context, item);
  if (key === 'finance.cash_shift_reconciliation') return financeCashShiftReconciliation(context, item);
  if (key === 'finance.operating_profit') return financeOperatingProfit(context, item);
  if (key === 'finance.unfulfilled_card_liability') return financeUnfulfilledCardLiability(context, item);
  if (key === 'finance.cost_income_ratio') return financeCostIncomeRatio(context, item);
  if (key === 'finance.staff_commission_composition') return financeStaffCommissionComposition(context, item);
  if (key === 'catalog.project_sales') return catalogProjectSales(context, item);
  if (key === 'catalog.project_bom_items') return catalogProjectBomItems(context, item);
  if (key === 'inventory.stock_or_consumption_fact') return inventoryStockOrConsumptionFact(context, item);
  if (key === 'inventory.stock_risk_fact') return inventoryStockRiskFact(context, item);
  if (key === 'inventory.procurement_fact') return inventoryProcurementFact(context, item);
  if (key === 'customer.new_customer_count') return newCustomerCount(context, item);
  if (key === 'customer.profile_scalar') return customerProfileScalar(context, item);
  if (key === 'customer.last_visit_at') return customerLastVisit(context, item);
  if (key === 'customer.member_tier_count') return memberTierCount(context, item);
  if (key === 'customer.cumulative_spend') return cumulativeSpend(context, item);
  if (key === 'customer.tag_set') return customerTagSet(context, item);
  if (key === 'customer.consumption_records') return consumptionRecords(context, item);
  if (key === 'customer.visited_customer_count') return visitedCustomerCount(context, item);
  if (key === 'customer.visited_member_tier_set') return visitedMemberTierSet(context, item);
  if (key === 'customer.new_customer_repeat_purchase_count') return newCustomerRepeatPurchaseCount(context, item);
  if (key === 'customer.expiring_card_unbooked') return expiringCardUnbooked(context, item);
  if (key === 'customer.card_holders_without_visit') return cardHoldersWithoutVisit(context, item);
  if (key === 'fulfillment.reservation_fact') return fulfillmentReservationFact(context, item);
  if (key === 'fulfillment.arrival_or_task_count') return fulfillmentArrivalOrTaskCount(context, item);
  if (key === 'fulfillment.card_usage_count') return fulfillmentCardUsageCount(context, item);
  if (key === 'staff.active_beautician_count') return staffActiveBeauticianCount(context, item);
  if (key === 'staff.schedule_fact') return staffScheduleFact(context, item);
  if (key === 'staff.served_customer_count') return staffServedCustomerCount(context, item);
  if (key === 'staff.level_scalar') return staffLevelScalar(context, item);
  if (key === 'staff.project_skill_set') return staffProjectSkillSet(context, item);
  throw new Error(`gold standard audit resolver not implemented:${key}`);
}

async function financePaymentMethodAmounts(context, item) {
  const range = closedRange(item);
  const rows = await context.tx.paymentRecord.findMany({
    where: {
      order: { storeId: context.storeId },
      status: { notIn: INVALID_PAYMENT_STATUSES },
      OR: [
        { paidAt: { gte: range.start, lt: range.end } },
        { paidAt: null, createdAt: { gte: range.start, lt: range.end } },
      ],
    },
    select: { id: true, orderId: true, method: true, amount: true, status: true, paidAt: true, createdAt: true },
    orderBy: { id: 'asc' },
  });
  const grouped = groupedSum(rows, (row) => row.method || 'unknown', (row) => toNumber(row.amount));
  const value = [...grouped.entries()]
    .map(([method, amount]) => ({ method, amount: roundMoney(amount) }))
    .sort((left, right) => right.amount - left.amount || left.method.localeCompare(right.method));
  return fact(value, rows.map(paymentRecordKey), `${rangeDefinition(context, item, range)}；有效 PaymentRecord 按 method 汇总 amount`);
}

async function financeCardRecognizedRevenue(context, item) {
  const cardName = await matchedCardName(context, item);
  const range = item.timeContract?.mode === 'closed_period'
    ? closedRange(item)
    : { start: context.store.createdAt, end: context.snapshotAt };
  const rows = await context.tx.cardUsageRecord.findMany({
    where: {
      storeId: context.storeId,
      ...(cardName ? { cardName } : {}),
      verifiedAt: { gte: range.start, lt: range.end },
    },
    select: {
      id: true,
      customerId: true,
      customerCardId: true,
      projectId: true,
      cardName: true,
      times: true,
      recognizedUnitValue: true,
      recognizedAmount: true,
      verifiedAt: true,
    },
    orderBy: { id: 'asc' },
  });
  const amount = rows.reduce((sum, row) => {
    const recognized = toNumber(row.recognizedAmount);
    return sum + (recognized > 0 ? recognized : toNumber(row.recognizedUnitValue) * row.times);
  }, 0);
  return fact(
    roundMoney(amount),
    rows.map(cardUsageRevenueKey),
    `${item.timeContract?.mode === 'closed_period' ? rangeDefinition(context, item, range) : 'Store.createdAt 至 snapshotAt'}；${cardName ? `cardName=${cardName}，` : ''}优先汇总 recognizedAmount，缺失时使用 recognizedUnitValue×times`,
  );
}

async function financeOrderProfit(context, item) {
  const range = closedRange(item);
  const parameters = item.audit?.parameters;
  if (item.audit?.queryVersion !== 'v2' || !parameters || typeof parameters !== 'object') {
    throw new Error(`finance order profit audit parameters unavailable:${item.sourceCaseId}`);
  }
  const projection = parameters.projection;
  const scope = parameters.scope && typeof parameters.scope === 'object' ? parameters.scope : {};
  const projectNames = Array.isArray(scope.projectNames) ? scope.projectNames.map(String) : [];
  const projects = projectNames.length
    ? context.projects.filter((project) => projectNames.includes(project.name))
    : [];
  if (projects.length !== new Set(projectNames).size) {
    throw new Error(`finance order profit project scope unavailable:${item.sourceCaseId}`);
  }
  const projectIds = new Set(projects.map((project) => project.id));
  const businessTypes = Array.isArray(scope.businessTypes) ? scope.businessTypes.map(String) : [];
  if (!projectIds.size && !businessTypes.length) {
    throw new Error(`finance order profit scope unavailable:${item.sourceCaseId}`);
  }
  const queriedOrders = await context.tx.productOrder.findMany({
    where: {
      storeId: context.storeId,
      createdAt: { gte: range.start, lt: range.end },
      status: { notIn: INVALID_ORDER_STATUSES },
    },
    select: {
      id: true,
      orderNo: true,
      orderKind: true,
      netAmount: true,
      totalAmount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      refundRecords: {
        where: { status: { notIn: INVALID_PAYMENT_STATUSES } },
        select: { id: true, amount: true, status: true, refundedAt: true, createdAt: true },
      },
      orderItems: {
        select: {
          id: true,
          itemType: true,
          itemId: true,
          name: true,
          quantity: true,
          listAmount: true,
          subtotal: true,
          netAmount: true,
          isGift: true,
          payload: true,
          createdAt: true,
          commissionRecords: {
            where: { status: { notIn: INVALID_COMMISSION_STATUSES } },
            select: { id: true, type: true, amount: true, status: true, createdAt: true },
          },
        },
        orderBy: { id: 'asc' },
      },
      commissionRecords: {
        where: { orderItemId: null, status: { notIn: INVALID_COMMISSION_STATUSES } },
        select: { id: true, type: true, amount: true, status: true, createdAt: true },
      },
    },
    orderBy: { id: 'asc' },
  });
  const orders = queriedOrders.filter((order) => {
    const matchesProject = !projectIds.size || order.orderItems.some(
      (orderItem) => isProjectOrderItem(orderItem) && orderItem.itemId !== null && projectIds.has(Number(orderItem.itemId)),
    );
    const matchesBusinessType = !businessTypes.length || businessTypes.some((businessType) => financeOrderMatchesBusinessType(order, businessType));
    return matchesProject && matchesBusinessType;
  });
  const orderItemIds = orders.flatMap((order) => order.orderItems.map((orderItem) => orderItem.id));
  const projectItemIds = orders
    .flatMap((order) => order.orderItems)
    .filter((orderItem) => isProjectOrderItem(orderItem) && orderItem.itemId !== null)
    .map((orderItem) => Number(orderItem.itemId));
  const [bomItems, movements] = await Promise.all([
    projectItemIds.length
      ? context.tx.projectBomItem.findMany({
          where: { projectId: { in: uniqueNumbers(projectItemIds) } },
          select: {
            id: true,
            projectId: true,
            productId: true,
            standardQty: true,
            unit: true,
            product: { select: { id: true, name: true, costPrice: true, updatedAt: true } },
          },
          orderBy: { id: 'asc' },
        })
      : [],
    orders.length
      ? context.tx.stockMovement.findMany({
          where: {
            storeId: context.storeId,
            movementType: { in: ['service_consume', 'service_consumption', 'sale_out'] },
            OR: [
              ...(orderItemIds.length ? [{ orderItemId: { in: orderItemIds } }] : []),
              { sourceType: { in: ['project_order', 'product_order'] }, sourceId: { in: orders.map((order) => order.id) } },
            ],
          },
          select: {
            id: true,
            movementType: true,
            productId: true,
            orderItemId: true,
            sourceType: true,
            sourceId: true,
            quantity: true,
            unitCost: true,
            costAmount: true,
            costSource: true,
            occurredAt: true,
            product: { select: { costPrice: true } },
          },
          orderBy: { id: 'asc' },
        })
      : [],
  ]);
  const bomByProject = groupRows(bomItems, (row) => row.projectId);
  const productById = new Map(context.products.map((product) => [product.id, product]));
  const profits = orders.map((order) => {
    const refundAmount = order.refundRecords.reduce((sum, refund) => sum + toNumber(refund.amount), 0);
    const orderNetAmount = Math.max(0, toNumber(order.netAmount || order.totalAmount));
    const selectedItems = order.orderItems.filter((orderItem) => financeOrderItemMatchesScope(orderItem, { businessTypes, projectIds }));
    const income = selectedItems.reduce((sum, orderItem) => {
      const itemIncome = Math.max(0, toNumber(orderItem.netAmount || orderItem.subtotal));
      const refundShare = orderNetAmount > 0 ? Math.min(itemIncome, refundAmount * (itemIncome / orderNetAmount)) : 0;
      return sum + Math.max(0, itemIncome - refundShare);
    }, 0);
    let productCost = 0;
    let projectCost = 0;
    for (const orderItem of selectedItems) {
      const quantity = toNumber(orderItem.quantity) || 1;
      if (isProductOrderItem(orderItem) && orderItem.itemId !== null) {
        const product = productById.get(Number(orderItem.itemId));
        const snapshotCost = payloadNumber(orderItem.payload, ['costPrice', 'unitCost', 'productCostPrice']);
        const snapshotCostAmount = payloadNumber(orderItem.payload, ['costAmount', 'productCostAmount']);
        const movement = movements.find(
          (candidate) => candidate.movementType === 'sale_out' &&
            (candidate.orderItemId === orderItem.id || candidate.sourceId === order.id) &&
            candidate.productId === Number(orderItem.itemId),
        );
        const movementCost = movement
          ? toNumber(movement.costAmount) || Math.abs(toNumber(movement.quantity)) * (toNumber(movement.unitCost) || toNumber(movement.product.costPrice))
          : 0;
        productCost += movementCost > 0
          ? movementCost
          : snapshotCostAmount > 0
            ? snapshotCostAmount
            : quantity * (snapshotCost > 0 ? snapshotCost : toNumber(product?.costPrice));
      }
      if (isProjectOrderItem(orderItem) && orderItem.itemId !== null) {
        const itemMovements = movements.filter(
          (movement) => ['service_consume', 'service_consumption'].includes(movement.movementType) &&
            (movement.orderItemId === orderItem.id || (movement.orderItemId === null && movement.sourceId === order.id)),
        );
        const actualCost = itemMovements.reduce((sum, movement) => {
          const recorded = toNumber(movement.costAmount);
          return sum + (recorded > 0
            ? recorded
            : Math.abs(toNumber(movement.quantity)) * (toNumber(movement.unitCost) || toNumber(movement.product.costPrice)));
        }, 0);
        const standardCost = (bomByProject.get(Number(orderItem.itemId)) ?? []).reduce(
          (sum, bomItem) => sum + quantity * toNumber(bomItem.standardQty) * toNumber(bomItem.product.costPrice),
          0,
        );
        projectCost += actualCost > 0 ? actualCost : standardCost;
      }
    }
    const commissionCost = [
      ...(selectedItems.length ? order.commissionRecords : []),
      ...selectedItems.flatMap((orderItem) => orderItem.commissionRecords),
    ].reduce((sum, commission) => sum + toNumber(commission.amount), 0);
    const totalCost = productCost + projectCost + commissionCost;
    return {
      order,
      orderId: order.id,
      totalCost: roundMoney(totalCost),
      grossProfit: roundMoney(income - totalCost),
    };
  });
  const sourceKeys = [
    ...orders.map(productOrderKey),
    ...orders.flatMap((order) => order.orderItems.map(orderItemKey)),
    ...orders.flatMap((order) => order.refundRecords.map(refundRecordKey)),
    ...orders.flatMap((order) => [...order.commissionRecords, ...order.orderItems.flatMap((orderItem) => orderItem.commissionRecords)]).map(commissionRecordKey),
    ...bomItems.map(projectBomItemKey),
    ...movements.map(stockMovementCostKey),
    ...projects.map(projectKey),
  ];
  const scopeDefinition = projectNames.length
    ? `项目=${projectNames.join('、')}`
    : `业务类型=${businessTypes.join('、')}`;
  const definition = `${rangeDefinition(context, item, range)}；${scopeDefinition}；仅商品/项目履约明细确认经营收入，开卡和充值预收不在收款时确认利润；毛利 = 明细净收入 - 有效退款分摊 - 商品或项目成本 - 有效提成`;
  return fact(
    resolveFinanceOrderProfitValue({ projection, rows: profits }),
    sourceKeys,
    projection === 'per_order_gross_profit' ? `${definition}；按 ProductOrder.id 升序` : definition,
  );
}

function financeOrderMatchesBusinessType(order, businessType) {
  if (businessType === 'all') return true;
  if (businessType === 'member_card_open') return order.orderKind === 'member_card_open';
  if (businessType === 'card_sale') return order.orderItems.some((orderItem) => isCardSaleOrderItem(orderItem));
  if (businessType === 'product_sale') return order.orderItems.some((orderItem) => isProductOrderItem(orderItem));
  if (businessType === 'project_sale') return order.orderItems.some((orderItem) => isProjectOrderItem(orderItem));
  throw new Error(`finance order profit business type unsupported:${businessType}`);
}

function financeOrderItemMatchesScope(orderItem, { businessTypes, projectIds }) {
  if (projectIds.size) {
    return isProjectOrderItem(orderItem) && orderItem.itemId !== null && projectIds.has(Number(orderItem.itemId));
  }
  if (businessTypes.includes('all')) return isProductOrderItem(orderItem) || isProjectOrderItem(orderItem);
  if (businessTypes.includes('product_sale')) return isProductOrderItem(orderItem);
  if (businessTypes.includes('project_sale')) return isProjectOrderItem(orderItem);
  return false;
}

function isProductOrderItem(orderItem) {
  return ['product', 'goods'].includes(String(orderItem.itemType ?? '').toLowerCase());
}

function isProjectOrderItem(orderItem) {
  return ['project', 'service', 'service_project'].includes(String(orderItem.itemType ?? '').toLowerCase());
}

function isCardSaleOrderItem(orderItem) {
  return ['card', 'customer_card', 'card_sale', 'member_card'].includes(String(orderItem.itemType ?? '').toLowerCase());
}

async function financeGrossMargin(context, item) {
  const range = closedRange(item);
  const rows = await financeSettlementRows(context, range);
  const selected = selectAuthoritativeSettlements(rows, context.timezone);
  const value = resolveFinanceGrossMarginValue({
    expectedAnswerShape: item.expectedAnswerShape,
    settlements: selected,
  });
  const definition =
    item.expectedAnswerShape === 'ratio'
      ? `${rangeDefinition(context, item, range)}；按上海营业日选择 confirmed/passed 优先的权威 DailySettlement，毛利率 = 汇总 grossProfit / 汇总 totalRevenue`
      : `${rangeDefinition(context, item, range)}；按上海营业日选择 confirmed/passed 优先的权威 DailySettlement 后汇总 grossProfit`;
  return fact(
    value,
    rows.map(dailySettlementKey),
    definition,
  );
}

async function financeStoredValueLiability(context) {
  const rows = await context.tx.customerBalanceAccount.findMany({
    where: { storeId: context.storeId, status: 'active' },
    select: { id: true, customerId: true, cashBalance: true, giftBalance: true, status: true, updatedAt: true },
    orderBy: { id: 'asc' },
  });
  return fact(
    roundMoney(rows.reduce((sum, row) => sum + toNumber(row.cashBalance) + toNumber(row.giftBalance), 0)),
    rows.map(balanceAccountKey),
    '截至 snapshotAt 的 active CustomerBalanceAccount，储值负债 = cashBalance + giftBalance',
  );
}

async function financeCashShiftReconciliation(context, item) {
  const range = closedRange(item);
  const rows = await financeSettlementRows(context, range);
  const selected = selectAuthoritativeSettlements(rows, context.timezone);
  const reconciled = selected.length > 0 && selected.every((row) => row.status === 'confirmed' && row.reconciliationStatus === 'passed');
  return fact(
    reconciled,
    rows.map(dailySettlementKey),
    `${rangeDefinition(context, item, range)}；每个上海营业日选择权威 DailySettlement，全部 confirmed 且 reconciliationStatus=passed 才视为对平`,
  );
}

async function financeOperatingProfit(context, item) {
  const range = closedRange(item);
  const components = await financeCostComponents(context, range);
  return fact(
    roundMoney(components.grossProfit - components.commissionCost - components.operatingCost),
    components.sourceKeys,
    `${rangeDefinition(context, item, range)}；经营利润 = DailySettlement.grossProfit - 有效提成 - OperatingCost`,
  );
}

async function financeUnfulfilledCardLiability(context) {
  const rows = await context.tx.customerCard.findMany({
    where: {
      status: 'active',
      remainingTimes: { gt: 0 },
      customer: { storeId: context.storeId, deletedAt: null },
    },
    select: { id: true, customerId: true, remainingTimes: true, recognizedUnitValue: true, status: true, createdAt: true },
    orderBy: { id: 'asc' },
  });
  return fact(
    roundMoney(rows.reduce((sum, row) => sum + row.remainingTimes * toNumber(row.recognizedUnitValue), 0)),
    rows.map(customerCardLiabilityKey),
    '截至 snapshotAt 的 active CustomerCard；未履约负债 = remainingTimes × recognizedUnitValue',
  );
}

async function financeCostIncomeRatio(context, item) {
  const range = closedRange(item);
  const components = await financeCostComponents(context, range);
  const totalCost = components.materialCost + components.commissionCost + components.operatingCost;
  const ratio = components.revenue > 0 ? Number((totalCost / components.revenue).toFixed(4)) : 0;
  return fact(
    ratio,
    components.sourceKeys,
    `${rangeDefinition(context, item, range)}；成本收入比 = (耗材成本 + 有效提成 + 经营费用) / 收入`,
  );
}

async function financeStaffCommissionComposition(context, item) {
  const beautician = namedBeautician(context, item);
  const range = closedRange(item);
  const rows = await context.tx.commissionRecord.findMany({
    where: {
      storeId: context.storeId,
      beauticianId: beautician.id,
      createdAt: { gte: range.start, lt: range.end },
      status: { notIn: INVALID_COMMISSION_STATUSES },
    },
    select: { id: true, type: true, amount: true, status: true, createdAt: true },
    orderBy: { id: 'asc' },
  });
  const grouped = groupedSum(rows, (row) => row.type, (row) => toNumber(row.amount));
  const value = [...grouped.entries()]
    .map(([type, amount]) => ({ type, amount: roundMoney(amount) }))
    .sort((left, right) => right.amount - left.amount || left.type.localeCompare(right.type));
  return fact(
    value,
    [beauticianKey(beautician), ...rows.map(commissionRecordKey)],
    `${rangeDefinition(context, item, range)}；按 CommissionRecord.type 汇总有效提成，金额降序`,
  );
}

async function catalogProjectSales(context, item) {
  const projects = namedProjects(context, item);
  const range = closedRange(item);
  const rows = await context.tx.orderItem.findMany({
    where: {
      itemType: 'project',
      itemId: { in: projects.map((project) => project.id) },
      order: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end }, status: { notIn: INVALID_ORDER_STATUSES } },
    },
    select: { id: true, orderId: true, itemId: true, quantity: true, netAmount: true, createdAt: true },
    orderBy: { id: 'asc' },
  });
  const quantity = rows.reduce((sum, row) => sum + toNumber(row.quantity), 0);
  return fact(
    exactInteger(quantity, `catalog project sales quantity is not integer:${item.sourceCaseId}`),
    [...projects.map(projectKey), ...rows.map(orderItemKey)],
    `${rangeDefinition(context, item, range)}；有效项目订单行 quantity 汇总，Project.name 精确匹配 ${projects[0].name}`,
  );
}

async function catalogProjectBomItems(context, item) {
  const project = namedProjects(context, item)[0];
  const rows = await context.tx.projectBomItem.findMany({
    where: { projectId: project.id },
    select: {
      id: true,
      projectId: true,
      productId: true,
      standardQty: true,
      unit: true,
      product: { select: { id: true, name: true, costPrice: true, updatedAt: true } },
    },
    orderBy: { productId: 'asc' },
  });
  const sourceKeys = [projectKey(project), ...rows.map(projectBomItemKey), ...rows.map((row) => productKey(row.product))];
  if (/成本/u.test(item.sourceQuestion)) {
    return fact(
      roundMoney(rows.reduce((sum, row) => sum + toNumber(row.standardQty) * toNumber(row.product.costPrice), 0)),
      sourceKeys,
      `ProjectBomItem.standardQty × Product.costPrice 汇总；projectId=${project.id}`,
    );
  }
  return fact(uniqueNumbers(rows.map((row) => row.productId)), sourceKeys, `projectId=${project.id} 的 ProjectBomItem.productId 集合`);
}

async function inventoryStockOrConsumptionFact(context, item) {
  const question = item.sourceQuestion;
  if (/库存总价值/u.test(question)) {
    const range = closedRange(item);
    const snapshot = await stocksAt(context, range.end);
    const rows = activeProducts(context);
    const value = rows.reduce((sum, product) => sum + (snapshot.values.get(product.id) ?? 0) * toNumber(product.costPrice), 0);
    return fact(
      roundMoney(value),
      [...rows.map(productKey), ...snapshot.sourceKeys],
      `${rangeDefinition(context, item, range)}；期末库存价值 = 每个 active Product 的期末库存 × 当前 costPrice`,
    );
  }
  if (/够用吗/u.test(question)) {
    const project = namedProjects(context, item)[0];
    const range = closedRange(item);
    const snapshot = await stocksAt(context, range.end);
    const rows = await context.tx.projectBomItem.findMany({
      where: { projectId: project.id },
      select: { id: true, projectId: true, productId: true, standardQty: true, unit: true },
      orderBy: { id: 'asc' },
    });
    const enough = rows.length > 0 && rows.every((row) => (snapshot.values.get(row.productId) ?? 0) >= toNumber(row.standardQty));
    return fact(
      enough,
      [projectKey(project), ...rows.map(projectBomItemKey), ...snapshot.sourceKeys],
      `${rangeDefinition(context, item, range)}；项目每项期末库存均不少于单次标准耗用量才算够用`,
    );
  }
  const product = namedProduct(context, item);
  if (/批次信息/u.test(question)) {
    const rows = await context.tx.stockBatch.findMany({
      where: { productId: product.id, createdAt: { lte: context.snapshotAt } },
      select: {
        id: true,
        batchNo: true,
        stock: true,
        unitCost: true,
        totalAmount: true,
        supplierName: true,
        productionDate: true,
        expiryDate: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return fact(
      rows.map((row) => ({
        batchId: row.id,
        batchNo: row.batchNo,
        stock: decimalNumber(row.stock),
        unitCost: nullableDecimalNumber(row.unitCost),
        totalAmount: nullableDecimalNumber(row.totalAmount),
        supplierName: row.supplierName,
        productionDate: row.productionDate?.toISOString().slice(0, 10) ?? null,
        expiryDate: row.expiryDate?.toISOString().slice(0, 10) ?? null,
      })),
      [productKey(product), ...rows.map(stockBatchKey)],
      '截至 snapshotAt 的 StockBatch，按 createdAt、id 升序返回批次事实',
    );
  }
  if (/安全库存/u.test(question)) {
    return fact(exactInteger(toNumber(product.safetyStock), `safety stock is not integer:${item.sourceCaseId}`), [productKey(product)], 'Product.safetyStock 当前配置值');
  }
  if (/够做多少次/u.test(question)) {
    const project = namedProjects(context, item)[0];
    const bom = await context.tx.projectBomItem.findFirst({
      where: { projectId: project.id, productId: product.id },
      select: { id: true, projectId: true, productId: true, standardQty: true, unit: true },
    });
    if (!bom || toNumber(bom.standardQty) <= 0) throw new Error(`project product bom missing:${item.sourceCaseId}`);
    const value = Math.floor(toNumber(product.currentStock) / toNumber(bom.standardQty));
    return fact(value, [productKey(product), projectKey(project), projectBomItemKey(bom)], '当前 Product.currentStock ÷ ProjectBomItem.standardQty，向下取整');
  }
  if (/库存变化/u.test(question)) {
    const range = closedRange(item);
    const rows = await stockMovements(context, product.id, range);
    return fact(
      rows.map((row) => ({
        movementId: row.id,
        occurredAt: row.occurredAt.toISOString(),
        type: row.movementType,
        quantity: decimalNumber(row.quantity),
        beforeStock: nullableDecimalNumber(row.beforeStock),
        afterStock: nullableDecimalNumber(row.afterStock),
      })),
      [productKey(product), ...rows.map(stockMovementKey)],
      `${rangeDefinition(context, item, range)}；按 occurredAt、id 升序返回 StockMovement`,
    );
  }
  if (/消耗了多少/u.test(question)) {
    const range = closedRange(item);
    const rows = (await stockMovements(context, product.id, range)).filter((row) => /consume|consumption|usage|deduct|消耗/iu.test(row.movementType));
    const quantity = rows.reduce((sum, row) => sum + Math.abs(toNumber(row.quantity)), 0);
    return fact(
      exactInteger(quantity, `inventory consumption is not integer:${item.sourceCaseId}`),
      [productKey(product), ...rows.map(stockMovementKey)],
      `${rangeDefinition(context, item, range)}；只汇总消费/服务耗用类 StockMovement.quantity 绝对值`,
    );
  }
  if (/还有多少库存/u.test(question)) {
    const value = item.timeContract?.mode === 'snapshot_at'
      ? toNumber(product.currentStock)
      : (await stocksAt(context, closedRange(item).end)).values.get(product.id) ?? 0;
    return fact(exactInteger(value, `inventory stock is not integer:${item.sourceCaseId}`), [productKey(product)], 'Product.currentStock 或固定周期期末库存');
  }
  throw new Error(`inventory stock question unsupported:${item.sourceCaseId}`);
}

async function inventoryStockRiskFact(context, item) {
  const question = item.sourceQuestion;
  const range = closedRange(item);
  const products = activeProducts(context);
  if (/缺货/u.test(question)) {
    const startSnapshot = await stocksAt(context, range.start);
    const movements = await context.tx.stockMovement.findMany({
      where: { storeId: context.storeId, occurredAt: { gte: range.start, lt: range.end }, afterStock: { not: null } },
      select: { id: true, productId: true, movementType: true, quantity: true, beforeStock: true, afterStock: true, occurredAt: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    const activeIds = new Set(products.map((product) => product.id));
    const ids = new Set(products.filter((product) => (startSnapshot.values.get(product.id) ?? 0) <= 0).map((product) => product.id));
    for (const movement of movements) if (activeIds.has(movement.productId) && toNumber(movement.afterStock) <= 0) ids.add(movement.productId);
    return fact(
      [...ids].sort((a, b) => a - b),
      [...products.filter((product) => ids.has(product.id)).map(productKey), ...startSnapshot.sourceKeys, ...movements.map(stockMovementKey)],
      `${rangeDefinition(context, item, range)}；期初已为 0 或周期内任一 StockMovement.afterStock<=0 的 active Product`,
    );
  }
  if (/低于安全库存/u.test(question)) {
    const snapshot = await stocksAt(context, range.end);
    const selected = products.filter((product) => toNumber(product.safetyStock) > 0 && (snapshot.values.get(product.id) ?? 0) < toNumber(product.safetyStock));
    return fact(
      selected.length,
      [...selected.map(productKey), ...snapshot.sourceKeys],
      `${rangeDefinition(context, item, range)}；期末库存低于当前 Product.safetyStock 且 safetyStock>0`,
    );
  }
  if (/临期/u.test(question)) {
    const rows = await context.tx.stockBatch.findMany({
      where: {
        stock: { gt: 0 },
        expiryDate: { gte: range.start, lt: range.end },
        product: { storeId: context.storeId, deletedAt: null, status: 'active' },
      },
      select: { id: true, productId: true, stock: true, expiryDate: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
    return fact(
      uniqueNumbers(rows.map((row) => row.productId)).length,
      rows.map(stockBatchKey),
      `${rangeDefinition(context, item, range)}；当前仍有库存且 expiryDate 落在周期内的 StockBatch，按 Product.id 去重`,
    );
  }
  throw new Error(`inventory stock risk question unsupported:${item.sourceCaseId}`);
}

async function inventoryProcurementFact(context, item) {
  const question = item.sourceQuestion;
  if (/有多少个供应商/u.test(question)) {
    const rows = await context.tx.supplySupplier.findMany({
      where: { deletedAt: null, status: 'active', qualificationStatus: 'approved' },
      select: { id: true, name: true, status: true, qualificationStatus: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    return fact(rows.length, rows.map(supplySupplierKey), 'active、approved 且未删除的 SupplySupplier 数量');
  }
  if (/待收货/u.test(question)) {
    const rows = await context.tx.procurementOrder.findMany({
      where: { storeId: context.storeId, status: { notIn: [...INVALID_PROCUREMENT_STATUSES, ...RECEIVED_PROCUREMENT_STATUSES] } },
      select: { id: true, orderNo: true, supplierId: true, status: true, netAmount: true, createdAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    return fact(rows.length, rows.map(procurementOrderKey), `ProcurementOrder.status 不属于 ${[...INVALID_PROCUREMENT_STATUSES, ...RECEIVED_PROCUREMENT_STATUSES].join('/')}`);
  }
  if (/哪个供应商最便宜/u.test(question)) {
    const product = namedProduct(context, item);
    const rows = await context.tx.supplyQuote.findMany({
      where: {
        deletedAt: null,
        status: 'active',
        auditStatus: 'approved',
        supplier: { deletedAt: null, status: 'active', qualificationStatus: 'approved' },
        OR: [
          { sku: { name: { contains: product.name } } },
          { sku: { mappings: { some: { productId: product.id, mappingStatus: 'active' } } } },
        ],
      },
      select: {
        id: true,
        supplierId: true,
        supplySkuId: true,
        price: true,
        moq: true,
        leadDays: true,
        updatedAt: true,
        supplier: { select: { id: true, name: true, updatedAt: true } },
      },
      orderBy: [{ price: 'asc' }, { supplierId: 'asc' }, { id: 'asc' }],
    });
    if (!rows.length) {
      return fact(null, [productKey(product)], '截至 snapshotAt 未找到该产品的 active/approved 供应商报价');
    }
    const minimum = toNumber(rows[0].price);
    const selected = rows.filter((row) => toNumber(row.price) === minimum);
    return fact(
      selected.length === 1
        ? { supplierId: selected[0].supplierId, quoteId: selected[0].id, price: roundMoney(minimum) }
        : selected.map((row) => ({ supplierId: row.supplierId, quoteId: row.id, price: roundMoney(minimum) })),
      [productKey(product), ...rows.map(supplyQuoteKey), ...rows.map((row) => supplySupplierKey(row.supplier))],
      'active/approved 报价按 price、supplierId、quoteId 升序，返回最低有效报价；并列时返回全部',
    );
  }
  if (/采购结算待付款/u.test(question)) {
    const range = closedRange(item);
    const rows = await context.tx.supplySettlement.findMany({
      where: { createdAt: { gte: range.start, lt: range.end }, paidAt: null, status: { notIn: INVALID_PROCUREMENT_STATUSES } },
      select: { id: true, supplierId: true, settleMonth: true, netPayable: true, status: true, paidAt: true, createdAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    return fact(
      roundMoney(rows.reduce((sum, row) => sum + toNumber(row.netPayable), 0)),
      rows.map(supplySettlementKey),
      `${rangeDefinition(context, item, range)}；未付款且非取消的 SupplySettlement.netPayable 汇总`,
    );
  }
  const range = closedRange(item);
  const orders = await context.tx.procurementOrder.findMany({
    where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end }, status: { notIn: INVALID_PROCUREMENT_STATUSES } },
    select: {
      id: true,
      orderNo: true,
      supplierId: true,
      status: true,
      totalAmount: true,
      netAmount: true,
      createdAt: true,
      updatedAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          subtotal: true,
          product: { select: { id: true, categoryId: true, updatedAt: true, category: { select: { id: true, name: true } } } },
        },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  });
  if (/各供应商的采购金额/u.test(question)) {
    const grouped = groupedSum(orders, (row) => row.supplierId, (row) => toNumber(row.totalAmount));
    const value = [...grouped.entries()]
      .map(([supplierId, amount]) => ({ supplierId: Number(supplierId), amount: roundMoney(amount) }))
      .sort((left, right) => right.amount - left.amount || left.supplierId - right.supplierId);
    return fact(value, orders.map(procurementOrderKey), `${rangeDefinition(context, item, range)}；有效 ProcurementOrder 按 supplierId 汇总 totalAmount`);
  }
  if (/采购成本最高的品类/u.test(question)) {
    const items = orders.flatMap((order) => order.items);
    const grouped = groupedSum(items, (row) => row.product?.categoryId ?? 0, (row) => toNumber(row.subtotal));
    const maximum = Math.max(0, ...grouped.values());
    const value = [...grouped.entries()]
      .filter(([, amount]) => amount === maximum)
      .map(([categoryId, amount]) => ({ categoryId: Number(categoryId), amount: roundMoney(amount) }))
      .sort((left, right) => left.categoryId - right.categoryId);
    return fact(
      value,
      [...orders.map(procurementOrderKey), ...items.map(procurementOrderItemKey)],
      `${rangeDefinition(context, item, range)}；ProcurementOrderItem.subtotal 按 Product.categoryId 汇总，返回并列最高品类`,
    );
  }
  if (/采购总额/u.test(question)) {
    return fact(
      roundMoney(orders.reduce((sum, row) => sum + toNumber(row.totalAmount), 0)),
      orders.map(procurementOrderKey),
      `${rangeDefinition(context, item, range)}；有效 ProcurementOrder.totalAmount 汇总`,
    );
  }
  throw new Error(`inventory procurement question unsupported:${item.sourceCaseId}`);
}

async function financeCostComponents(context, range) {
  const [settlements, operatingCosts, commissions] = await Promise.all([
    financeSettlementRows(context, range),
    context.tx.operatingCost.findMany({
      where: { storeId: context.storeId, costDate: { gte: range.start, lt: range.end } },
      select: { id: true, category: true, amount: true, costDate: true, updatedAt: true },
      orderBy: { id: 'asc' },
    }),
    context.tx.commissionRecord.findMany({
      where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end }, status: { notIn: INVALID_COMMISSION_STATUSES } },
      select: { id: true, type: true, amount: true, status: true, createdAt: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  const selected = selectAuthoritativeSettlements(settlements, context.timezone);
  return {
    revenue: selected.reduce((sum, row) => sum + toNumber(row.totalRevenue), 0),
    materialCost: selected.reduce((sum, row) => sum + toNumber(row.materialCost), 0),
    grossProfit: selected.reduce((sum, row) => sum + toNumber(row.grossProfit), 0),
    commissionCost: commissions.length
      ? commissions.reduce((sum, row) => sum + toNumber(row.amount), 0)
      : selected.reduce((sum, row) => sum + toNumber(row.commissionTotal), 0),
    operatingCost: operatingCosts.reduce((sum, row) => sum + toNumber(row.amount), 0),
    sourceKeys: [...settlements.map(dailySettlementKey), ...operatingCosts.map(operatingCostKey), ...commissions.map(commissionRecordKey)],
  };
}

async function financeSettlementRows(context, range) {
  return context.tx.dailySettlement.findMany({
    where: { storeId: context.storeId, settleDate: { gte: range.start, lt: range.end } },
    select: {
      id: true,
      settleDate: true,
      totalRevenue: true,
      materialCost: true,
      grossProfit: true,
      grossMargin: true,
      commissionTotal: true,
      status: true,
      reconciliationStatus: true,
      confirmedAt: true,
      updatedAt: true,
    },
    orderBy: [{ settleDate: 'asc' }, { id: 'asc' }],
  });
}

async function stockMovements(context, productId, range) {
  return context.tx.stockMovement.findMany({
    where: { storeId: context.storeId, productId, occurredAt: { gte: range.start, lt: range.end } },
    select: { id: true, productId: true, movementType: true, quantity: true, beforeStock: true, afterStock: true, occurredAt: true },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  });
}

async function stocksAt(context, at) {
  const cacheKey = at.toISOString();
  const cached = context.stockAtCache.get(cacheKey);
  if (cached) return cached;
  const [past, future] = await Promise.all([
    context.tx.stockMovement.findMany({
      where: { storeId: context.storeId, occurredAt: { lt: at }, afterStock: { not: null } },
      select: { id: true, productId: true, movementType: true, quantity: true, beforeStock: true, afterStock: true, occurredAt: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }),
    context.tx.stockMovement.findMany({
      where: { storeId: context.storeId, occurredAt: { gte: at }, beforeStock: { not: null } },
      select: { id: true, productId: true, movementType: true, quantity: true, beforeStock: true, afterStock: true, occurredAt: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const values = new Map();
  const sourceByProduct = new Map();
  for (const row of past) {
    values.set(row.productId, toNumber(row.afterStock));
    sourceByProduct.set(row.productId, stockMovementKey(row));
  }
  for (const row of future) {
    if (values.has(row.productId)) continue;
    values.set(row.productId, toNumber(row.beforeStock));
    sourceByProduct.set(row.productId, stockMovementKey(row));
  }
  for (const product of context.products) {
    if (!values.has(product.id)) {
      values.set(product.id, toNumber(product.currentStock));
      sourceByProduct.set(product.id, productKey(product));
    }
  }
  const result = { values, sourceKeys: [...sourceByProduct.values()] };
  context.stockAtCache.set(cacheKey, result);
  return result;
}

function selectAuthoritativeSettlements(rows, timezone) {
  const selected = new Map();
  for (const row of rows) {
    const date = formatBusinessDate(row.settleDate, timezone);
    const current = selected.get(date);
    if (!current || compareSettlementAuthority(row, current) > 0) selected.set(date, row);
  }
  return [...selected.values()].sort((left, right) => left.settleDate.getTime() - right.settleDate.getTime());
}

function compareSettlementAuthority(left, right) {
  const leftScore = [
    left.status === 'confirmed' ? 1 : 0,
    left.reconciliationStatus === 'passed' ? 1 : 0,
    left.confirmedAt?.getTime() ?? 0,
    left.updatedAt.getTime(),
  ];
  const rightScore = [
    right.status === 'confirmed' ? 1 : 0,
    right.reconciliationStatus === 'passed' ? 1 : 0,
    right.confirmedAt?.getTime() ?? 0,
    right.updatedAt.getTime(),
  ];
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] !== rightScore[index]) return leftScore[index] - rightScore[index];
  }
  return 0;
}

function namedProduct(context, item) {
  const matches = context.products
    .filter((product) => item.sourceQuestion.includes(product.name))
    .sort((left, right) => right.name.length - left.name.length || left.id - right.id);
  const longest = matches[0]?.name.length ?? 0;
  const strongest = matches.filter((product) => product.name.length === longest);
  if (strongest.length !== 1) throw new Error(`product identity ambiguous:${item.sourceCaseId}:${strongest.length}`);
  return strongest[0];
}

function activeProducts(context) {
  return context.products.filter((product) => product.status === 'active');
}

function groupRows(rows, keyOf) {
  const result = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const values = result.get(key) ?? [];
    values.push(row);
    result.set(key, values);
  }
  return result;
}

function groupedSum(rows, keyOf, valueOf) {
  const result = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    result.set(key, (result.get(key) ?? 0) + valueOf(row));
  }
  return result;
}

function payloadNumber(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  for (const key of keys) {
    const candidate = toNumber(value[key]);
    if (Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return 0;
}

function exactInteger(value, error) {
  if (!Number.isInteger(value)) throw new Error(error);
  return value;
}

function decimalNumber(value) {
  const number = toNumber(value);
  return Number.isInteger(number) ? number : Number(number.toFixed(4));
}

function nullableDecimalNumber(value) {
  return value === null || value === undefined ? null : decimalNumber(value);
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
  return 0;
}

async function newCustomerCount(context, item) {
  const range = closedRange(item);
  const rows = context.customers.filter((customer) => customer.createdAt >= range.start && customer.createdAt < range.end);
  return fact(rows.length, rows.map((row) => `Customer:${row.id}:${row.updatedAt.toISOString()}`), 'Customer.createdAt 左闭右开计数');
}

async function customerProfileScalar(context, item) {
  const customer = namedCustomer(context, item);
  const question = item.sourceQuestion;
  if (/会员等级/u.test(question)) return fact(customer.memberLevel, [customerKey(customer)], 'Customer.memberLevel 原值');
  if (/渠道/u.test(question)) return fact(customer.source ?? null, [customerKey(customer)], 'Customer.source 原值');
  throw new Error(`customer profile field unsupported:${item.sourceCaseId}`);
}

async function customerLastVisit(context, item) {
  const customer = namedCustomer(context, item);
  return fact(
    customer.lastVisitDate?.toISOString().slice(0, 10) ?? null,
    [customerKey(customer)],
    'Customer.lastVisitDate，输出 YYYY-MM-DD',
  );
}

async function memberTierCount(context, item) {
  const tier = memberTier(context, item);
  const rows = context.customers.filter((customer) => normalizeTier(customer.memberLevel) === normalizeTier(tier));
  return fact(rows.length, rows.map(customerKey), `Customer.memberLevel 精确匹配 ${tier}`);
}

async function cumulativeSpend(context, item) {
  const customer = namedCustomer(context, item);
  return fact(customer.totalSpent.toString(), [customerKey(customer)], 'Customer.totalSpent，金额精确到分');
}

async function customerTagSet(context, item) {
  const customer = namedCustomer(context, item);
  return fact([...customer.tags].sort(), [customerKey(customer)], 'Customer.tags 去重排序');
}

async function consumptionRecords(context, item) {
  const customer = namedCustomer(context, item);
  const rows = await context.tx.consumptionRecord.findMany({
    where: { customerId: customer.id, consumeTime: { lte: context.snapshotAt } },
    select: { id: true, consumeTime: true },
    orderBy: { id: 'asc' },
  });
  return fact(
    rows.map((row) => row.id),
    rows.map((row) => `ConsumptionRecord:${row.id}:${row.consumeTime.toISOString()}`),
    '截至 snapshotAt 的 ConsumptionRecord.id 集合',
  );
}

async function visitedCustomerCount(context, item) {
  const rows = await arrivedReservations(context, closedRange(item));
  return fact(new Set(rows.map((row) => row.customerId)).size, rows.map(reservationKey), '到店口径：checkedInAt 或已治理到店状态');
}

async function visitedMemberTierSet(context, item) {
  const range = visitRange(context, item);
  const rows = await arrivedReservations(context, range);
  const minimumTier = '金卡';
  const minimumRank = tierRank(minimumTier);
  const customerIds = [...new Set(rows.map((row) => row.customerId))];
  const selected = context.customers
    .filter((customer) => customerIds.includes(customer.id) && tierRank(customer.memberLevel) >= minimumRank)
    .map((customer) => customer.id)
    .sort((left, right) => left - right);
  return fact(
    selected,
    [
      `Store:${context.store.id}:${context.store.updatedAt.toISOString()}`,
      ...rows.map(reservationKey),
      ...selected.map((id) => `Customer:${id}`),
    ],
    `${visitRangeDefinition(item, range)}；会员等级顺序 ${MEMBER_TIER_ORDER.join('<')}，最低金卡`,
  );
}

async function newCustomerRepeatPurchaseCount(context, item) {
  const range = closedRange(item);
  const customers = context.customers.filter((customer) => customer.createdAt >= range.start && customer.createdAt < range.end);
  const orders = customers.length
    ? await context.tx.productOrder.findMany({
        where: {
          storeId: context.storeId,
          customerId: { in: customers.map((customer) => customer.id) },
          status: { notIn: INVALID_ORDER_STATUSES },
          netAmount: { gt: 0 },
          createdAt: { lt: range.end },
        },
        select: { id: true, customerId: true, createdAt: true },
        orderBy: { id: 'asc' },
      })
    : [];
  const counts = new Map();
  for (const order of orders) counts.set(order.customerId, (counts.get(order.customerId) ?? 0) + 1);
  const repeated = customers.filter((customer) => (counts.get(customer.id) ?? 0) >= 2);
  return fact(
    repeated.length,
    [...customers.map(customerKey), ...orders.map((order) => `ProductOrder:${order.id}:${order.createdAt.toISOString()}`)],
    '周期内新建客户，截至周期结束有效净额订单不少于 2 单',
  );
}

async function expiringCardUnbooked(context, item) {
  const cardName = await namedCard(context, item);
  const expiryCutoff = new Date(context.snapshotAt.getTime() + 30 * 86_400_000);
  const cards = await context.tx.customerCard.findMany({
    where: {
      cardName,
      status: 'active',
      remainingTimes: { gt: 0 },
      expiryDate: { gte: context.snapshotAt, lte: expiryCutoff },
      customer: { storeId: context.storeId, deletedAt: null },
    },
    select: { id: true, customerId: true, expiryDate: true },
    orderBy: { id: 'asc' },
  });
  const reservations = cards.length
    ? await context.tx.reservation.findMany({
        where: {
          storeId: context.storeId,
          customerId: { in: cards.map((card) => card.customerId) },
          date: { gte: context.snapshotAt },
          status: { notIn: ['cancelled', 'canceled', 'no_show', '已取消', '爽约'] },
        },
        select: { id: true, customerId: true, updatedAt: true },
      })
    : [];
  const booked = new Set(reservations.map((row) => row.customerId));
  const customerIds = [...new Set(cards.filter((card) => !booked.has(card.customerId)).map((card) => card.customerId))].sort(
    (left, right) => left - right,
  );
  return fact(
    customerIds,
    [
      ...cards.map((card) => `CustomerCard:${card.id}:${card.expiryDate.toISOString()}`),
      ...reservations.map((row) => `Reservation:${row.id}:${row.updatedAt.toISOString()}`),
    ],
    `指定卡项 30 天内到期、剩余次数大于 0，且 snapshotAt 之后无有效预约；cardName=${cardName}`,
  );
}

async function cardHoldersWithoutVisit(context, item) {
  const cardName = await namedCard(context, item);
  const range = closedRange(item);
  const cards = await context.tx.customerCard.findMany({
    where: { cardName, customer: { storeId: context.storeId, deletedAt: null } },
    select: { id: true, customerId: true, createdAt: true },
    orderBy: { id: 'asc' },
  });
  const visits = cards.length ? await arrivedReservations(context, range, cards.map((card) => card.customerId)) : [];
  const visited = new Set(visits.map((row) => row.customerId));
  const customerIds = [...new Set(cards.filter((card) => !visited.has(card.customerId)).map((card) => card.customerId))].sort(
    (left, right) => left - right,
  );
  return fact(
    customerIds,
    [...cards.map((card) => `CustomerCard:${card.id}:${card.createdAt.toISOString()}`), ...visits.map(reservationKey)],
    `持有指定卡项且周期内无到店记录；cardName=${cardName}`,
  );
}

async function staffActiveBeauticianCount(context) {
  const rows = activeBeauticians(context);
  return fact(rows.length, rows.map(beauticianKey), 'Beautician.status = active 的当前在职人数');
}

async function staffLevelScalar(context, item) {
  const beautician = activeNamedBeautician(context, item);
  return fact(
    beautician.level ? { levelId: beautician.level.id, name: beautician.level.name } : null,
    [beauticianKey(beautician), ...(beautician.level ? [beauticianLevelKey(beautician.level)] : [])],
    'Beautician.levelId 关联 BeauticianLevel，输出 levelId 和职级名称',
  );
}

async function staffProjectSkillSet(context, item) {
  const beautician = activeNamedBeautician(context, item);
  const rows = await context.tx.beauticianProjectSkill.findMany({
    where: {
      beauticianId: beautician.id,
      project: { storeId: context.storeId, status: 'active', deletedAt: null },
    },
    select: {
      id: true,
      beauticianId: true,
      projectId: true,
      skillLevel: true,
      certified: true,
      priority: true,
      updatedAt: true,
      project: { select: { id: true, name: true, updatedAt: true } },
    },
    orderBy: [{ priority: 'desc' }, { skillLevel: 'desc' }, { projectId: 'asc' }],
  });
  return fact(
    uniqueNumbers(rows.map((row) => row.projectId)),
    [beauticianKey(beautician), ...rows.map(projectSkillKey), ...rows.map((row) => projectKey(row.project))],
    '有效 BeauticianProjectSkill 关联本店 active 且未删除 Project，输出 Project.id 集合',
  );
}

async function staffServedCustomerCount(context, item) {
  const beautician = activeNamedBeautician(context, item);
  const range = closedRange(item);
  const rows = await context.tx.serviceTask.findMany({
    where: {
      storeId: context.storeId,
      beauticianId: beautician.id,
      appointmentTime: { gte: range.start, lt: range.end },
      status: { not: 'cancelled' },
    },
    select: { id: true, customerId: true, projectId: true, status: true, appointmentTime: true },
    orderBy: { id: 'asc' },
  });
  const customerIds = uniqueNumbers(rows.map((row) => row.customerId));
  return fact(
    customerIds.length,
    [beauticianKey(beautician), ...rows.map(staffServiceTaskKey), ...customerIds.map((id) => `Customer:${id}`)],
    `固定周期 ${range.start.toISOString()} 至 ${range.end.toISOString()} 左闭右开；ServiceTask.status != cancelled，按 Customer.id 去重`,
  );
}

async function staffScheduleFact(context, item) {
  const range = closedRange(item);
  const beauticians = activeBeauticians(context);
  const activeIds = beauticians.map((item) => item.id);
  const [schedules, timeOffs] = await Promise.all([
    context.tx.schedule.findMany({
      where: {
        storeId: context.storeId,
        beauticianId: { in: activeIds },
        date: { gte: range.start, lt: range.end },
        status: { notIn: ['cancelled', 'canceled', 'deleted'] },
      },
      select: {
        id: true,
        beauticianId: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        source: true,
        createdAt: true,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    }),
    context.tx.beauticianTimeOff.findMany({
      where: {
        storeId: context.storeId,
        beauticianId: { in: activeIds },
        date: { gte: range.start, lt: range.end },
        status: 'approved',
      },
      select: {
        id: true,
        beauticianId: true,
        date: true,
        startTime: true,
        endTime: true,
        reason: true,
        updatedAt: true,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    }),
  ]);

  if (/请假/u.test(item.sourceQuestion)) {
    const beauticianIds = uniqueNumbers(timeOffs.map((row) => row.beauticianId));
    return fact(
      beauticianIds,
      [
        ...beauticians.filter((row) => beauticianIds.includes(row.id)).map(beauticianKey),
        ...timeOffs.map(timeOffKey),
      ],
      `${rangeDefinition(context, item, range)}；BeauticianTimeOff.status = approved，输出在职 Beautician.id 集合`,
    );
  }

  if (/排班/u.test(item.sourceQuestion)) {
    const beautician = activeNamedBeautician(context, item);
    const selected = schedules.filter((row) => row.beauticianId === beautician.id);
    return fact(
      selected.map((row) => ({
        scheduleId: row.id,
        date: formatBusinessDate(row.date, context.timezone),
        startTime: row.startTime,
        endTime: row.endTime,
        status: row.status,
        source: row.source,
      })),
      [beauticianKey(beautician), ...selected.map(scheduleKey)],
      `${rangeDefinition(context, item, range)}；排除 cancelled/canceled/deleted，按日期、开始时间、Schedule.id 确定排序`,
    );
  }

  let candidateIds = new Set(activeIds);
  let skillRows = [];
  let matchedProjects = [];
  if (/在岗/u.test(item.sourceQuestion)) {
    matchedProjects = namedProjects(context, item).filter((project) => project.status === 'active');
    const projectIds = matchedProjects.map((project) => project.id);
    skillRows = await context.tx.beauticianProjectSkill.findMany({
      where: { beauticianId: { in: activeIds }, projectId: { in: projectIds } },
      select: { id: true, beauticianId: true, projectId: true, skillLevel: true, certified: true, priority: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    candidateIds = new Set(skillRows.map((row) => row.beauticianId));
  }
  const selectedIds = beauticians
    .filter((beautician) => candidateIds.has(beautician.id))
    .filter((beautician) =>
      hasEffectiveSchedule(
        schedules.filter((row) => row.beauticianId === beautician.id),
        timeOffs.filter((row) => row.beauticianId === beautician.id),
      ),
    )
    .map((beautician) => beautician.id)
    .sort((left, right) => left - right);
  return fact(
    selectedIds,
    [
      ...beauticians.filter((row) => selectedIds.includes(row.id)).map(beauticianKey),
      ...schedules.filter((row) => selectedIds.includes(row.beauticianId)).map(scheduleKey),
      ...timeOffs.filter((row) => selectedIds.includes(row.beauticianId)).map(timeOffKey),
      ...skillRows.map(projectSkillKey),
      ...matchedProjects.map(projectKey),
    ],
    `${rangeDefinition(context, item, range)}；Schedule.status 属于 ${EFFECTIVE_SCHEDULE_STATUSES.join('/')} 且未被 approved 请假完全覆盖${matchedProjects.length ? '，并具备指定项目技能' : ''}`,
  );
}

async function fulfillmentReservationFact(context, item) {
  const question = item.sourceQuestion;
  const range = auditRange(context, item);
  const rows = await reservationRows(context, range);
  const active = rows.filter((row) => !CANCELLED_RESERVATION_STATUSES.includes(row.status));

  if (/未确认|待确认/u.test(question)) {
    const selected = rows.filter((row) => PENDING_CONFIRMATION_STATUSES.includes(row.status));
    return fact(
      selected.map((row) => row.id).sort((left, right) => left - right),
      reservationSourceKeys(context, selected),
      `${rangeDefinition(context, item, range)}；Reservation.status 属于 ${PENDING_CONFIRMATION_STATUSES.join('/')}`,
    );
  }

  if (/有预约吗/u.test(question)) {
    const customer = namedCustomer(context, item);
    const selected = active.filter((row) => row.customerId === customer.id);
    return fact(
      selected.length > 0,
      [customerKey(customer), ...reservationSourceKeys(context, selected)],
      `${rangeDefinition(context, item, range)}；指定唯一客户后判断有效预约是否存在`,
    );
  }

  if (/预约.*客户有哪些/u.test(question)) {
    const projects = namedProjects(context, item);
    const projectIds = new Set(projects.map((project) => project.id));
    const selected = active.filter((row) => projectIds.has(row.projectId));
    const customerIds = uniqueNumbers(selected.map((row) => row.customerId));
    return fact(
      customerIds,
      [...projects.map(projectKey), ...reservationSourceKeys(context, selected)],
      `${rangeDefinition(context, item, range)}；Project.name 精确匹配 ${projects[0].name}，返回有效预约客户 ID 集合`,
    );
  }

  if (/预约都有谁/u.test(question)) {
    return fact(
      uniqueNumbers(active.map((row) => row.customerId)),
      reservationSourceKeys(context, active),
      `${rangeDefinition(context, item, range)}；排除已取消预约后返回客户 ID 集合`,
    );
  }

  if (/预约了还没到店/u.test(question)) {
    const selected = active.filter((row) => PENDING_ARRIVAL_STATUSES.includes(row.status) && !isArrivedReservation(row));
    return fact(
      uniqueNumbers(selected.map((row) => row.customerId)),
      reservationSourceKeys(context, selected),
      `${rangeDefinition(context, item, range)}；待到店状态为 ${PENDING_ARRIVAL_STATUSES.join('/')} 且无 checkedInAt`,
    );
  }

  if (/有几个预约/u.test(question)) {
    const beautician = namedBeautician(context, item);
    const selected = active.filter((row) => row.beauticianId === beautician.id);
    return fact(
      selected.length,
      [beauticianKey(beautician), ...reservationSourceKeys(context, selected)],
      `${rangeDefinition(context, item, range)}；排除已取消预约，Beautician.name 精确匹配 ${beautician.name}`,
    );
  }

  if (/接了哪些预约/u.test(question)) {
    const beautician = namedBeautician(context, item);
    const selected = active.filter((row) => row.beauticianId === beautician.id);
    return fact(
      selected.map((row) => row.id).sort((left, right) => left - right),
      [beauticianKey(beautician), ...reservationSourceKeys(context, selected)],
      `${rangeDefinition(context, item, range)}；排除已取消预约，返回 ${beautician.name} 的 Reservation.id 集合`,
    );
  }

  if (/预约到店转化率/u.test(question)) {
    const arrived = active.filter(isArrivedReservation);
    const value = active.length ? Number((arrived.length / active.length).toFixed(4)) : 0;
    return fact(
      value,
      reservationSourceKeys(context, active),
      `${rangeDefinition(context, item, range)}；分母为非取消预约 ${active.length}，分子为 checkedInAt 非空或已治理到店状态 ${arrived.length}`,
    );
  }

  if (/时段.*预约最满/u.test(question)) {
    const groups = groupedCount(active, (row) => `${formatBusinessDate(row.date, context.timezone)}|${row.startTime}`);
    const maximum = Math.max(0, ...groups.values());
    const value = [...groups.entries()]
      .filter(([, count]) => count === maximum)
      .map(([key, count]) => {
        const [date, startTime] = key.split('|');
        return { date, startTime, count };
      })
      .sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime));
    return fact(value, reservationSourceKeys(context, active), `${rangeDefinition(context, item, range)}；按业务日期和开始时刻分组，返回并列最大预约量时段`);
  }

  if (/爽约.*客户有哪些/u.test(question)) {
    const selected = rows.filter((row) => NO_SHOW_STATUSES.includes(row.status));
    return fact(
      uniqueNumbers(selected.map((row) => row.customerId)),
      reservationSourceKeys(context, selected),
      `${rangeDefinition(context, item, range)}；Reservation.status 属于 ${NO_SHOW_STATUSES.join('/')}`,
    );
  }

  if (/哪个项目预约最多/u.test(question)) {
    const groups = groupedCount(active, (row) => String(row.projectId));
    const maximum = Math.max(0, ...groups.values());
    const value = [...groups.entries()]
      .filter(([, count]) => count === maximum)
      .map(([projectId, count]) => ({ projectId: Number(projectId), count }))
      .sort((left, right) => left.projectId - right.projectId);
    const projects = context.projects.filter((project) => value.some((row) => row.projectId === project.id));
    return fact(
      value,
      [...projects.map(projectKey), ...reservationSourceKeys(context, active)],
      `${rangeDefinition(context, item, range)}；排除已取消预约后按 Project.id 分组，返回并列最大预约量项目`,
    );
  }

  if (/各美容师的预约量/u.test(question)) {
    const assigned = active.filter((row) => row.beauticianId !== null);
    const groups = groupedCount(assigned, (row) => String(row.beauticianId));
    const value = [...groups.entries()]
      .map(([beauticianId, count]) => ({ beauticianId: Number(beauticianId), count }))
      .sort((left, right) => right.count - left.count || left.beauticianId - right.beauticianId);
    const beauticians = context.beauticians.filter((beautician) => value.some((row) => row.beauticianId === beautician.id));
    return fact(
      value,
      [...beauticians.map(beauticianKey), ...reservationSourceKeys(context, assigned)],
      `${rangeDefinition(context, item, range)}；排除已取消和未分配美容师的预约，按 Beautician.id 分组后按预约量降序`,
    );
  }

  if (/有多少个预约/u.test(question)) {
    return fact(active.length, reservationSourceKeys(context, active), `${rangeDefinition(context, item, range)}；排除已取消预约计数`);
  }

  throw new Error(`fulfillment reservation question unsupported:${item.sourceCaseId}`);
}

async function fulfillmentArrivalOrTaskCount(context, item) {
  const range = closedRange(item);
  if (/服务任务/u.test(item.sourceQuestion)) {
    const rows = await context.tx.serviceTask.findMany({
      where: { storeId: context.storeId, appointmentTime: { gte: range.start, lt: range.end } },
      select: { id: true, status: true, appointmentTime: true, startedAt: true, completedAt: true },
      orderBy: { id: 'asc' },
    });
    return fact(
      rows.length,
      rows.map(serviceTaskKey),
      `${rangeDefinition(context, item, range)}；ServiceTask.appointmentTime 左闭右开计数，不按执行状态排除`,
    );
  }
  if (/到店人数/u.test(item.sourceQuestion)) {
    const rows = await reservationRows(context, range);
    const arrived = rows.filter(isArrivedReservation);
    return fact(
      uniqueNumbers(arrived.map((row) => row.customerId)).length,
      reservationSourceKeys(context, arrived),
      `${rangeDefinition(context, item, range)}；checkedInAt 非空或已治理到店状态，按 Customer.id 去重计人数`,
    );
  }
  throw new Error(`fulfillment arrival/task question unsupported:${item.sourceCaseId}`);
}

async function fulfillmentCardUsageCount(context, item) {
  const range = closedRange(item);
  const rows = await context.tx.cardUsageRecord.findMany({
    where: { storeId: context.storeId, verifiedAt: { gte: range.start, lt: range.end } },
    select: { id: true, times: true, verifiedAt: true, customerId: true, customerCardId: true, projectId: true },
    orderBy: { id: 'asc' },
  });
  return fact(
    rows.reduce((sum, row) => sum + row.times, 0),
    rows.map(cardUsageKey),
    `${rangeDefinition(context, item, range)}；CardUsageRecord.verifiedAt 左闭右开，汇总 times 而不是记录条数`,
  );
}

async function reservationRows(context, range) {
  return context.tx.reservation.findMany({
    where: { storeId: context.storeId, date: { gte: range.start, lt: range.end } },
    select: {
      id: true,
      customerId: true,
      projectId: true,
      beauticianId: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      checkedInAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
  });
}

async function arrivedReservations(context, range, customerIds) {
  return context.tx.reservation.findMany({
    where: {
      storeId: context.storeId,
      ...(customerIds ? { customerId: { in: [...new Set(customerIds)] } } : {}),
      OR: [
        { checkedInAt: { gte: range.start, lt: range.end } },
        { checkedInAt: null, date: { gte: range.start, lt: range.end }, status: { in: ARRIVED_STATUSES } },
      ],
    },
    select: { id: true, customerId: true, checkedInAt: true, date: true, updatedAt: true },
    orderBy: { id: 'asc' },
  });
}

function namedCustomer(context, item) {
  const matches = context.customers
    .filter((customer) => item.sourceQuestion.includes(customer.name))
    .sort((left, right) => right.name.length - left.name.length || left.id - right.id);
  const longest = matches[0]?.name.length ?? 0;
  const strongest = matches.filter((customer) => customer.name.length === longest);
  if (strongest.length !== 1) throw new Error(`customer identity ambiguous:${item.sourceCaseId}:${strongest.length}`);
  return strongest[0];
}

async function namedCard(context, item) {
  const matched = await matchedCardName(context, item);
  if (!matched) throw new Error(`card identity missing:${item.sourceCaseId}`);
  return matched;
}

async function matchedCardName(context, item) {
  const rows = await context.tx.customerCard.findMany({
    where: { customer: { storeId: context.storeId, deletedAt: null } },
    distinct: ['cardName'],
    select: { cardName: true },
  });
  const matches = rows.map((row) => row.cardName).filter((name) => item.sourceQuestion.includes(name)).sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

function memberTier(context, item) {
  const levels = [...new Set(context.customers.map((customer) => customer.memberLevel))].sort((a, b) => b.length - a.length);
  const exact = levels.find((level) => item.sourceQuestion.includes(level));
  if (exact) return exact;
  const match = item.sourceQuestion.match(/(钻石|金卡|银卡)(?:会员)?/u)?.[1];
  if (!match) throw new Error(`member tier missing:${item.sourceCaseId}`);
  return match;
}

function closedRange(item) {
  if (item.timeContract?.mode !== 'closed_period') throw new Error(`closed period required:${item.sourceCaseId}`);
  return { start: new Date(item.timeContract.periodStart), end: new Date(item.timeContract.periodEndExclusive) };
}

function visitRange(context, item) {
  if (item.timeContract?.mode === 'closed_period') return closedRange(item);
  if (item.timeContract?.mode === 'snapshot_at') return { start: context.store.createdAt, end: context.snapshotAt };
  throw new Error(`visit range unsupported:${item.sourceCaseId}:${item.timeContract?.mode ?? 'missing'}`);
}

function visitRangeDefinition(item, range) {
  if (item.timeContract?.mode === 'snapshot_at') {
    return `开业至 snapshotAt，开业时间取 Store.createdAt=${range.start.toISOString()}`;
  }
  return `固定周期 ${range.start.toISOString()} 至 ${range.end.toISOString()}，左闭右开`;
}

function auditRange(context, item) {
  if (item.timeContract?.mode === 'closed_period') return closedRange(item);
  if (item.timeContract?.mode === 'snapshot_at') return snapshotDayRange(context);
  throw new Error(`audit range unsupported:${item.sourceCaseId}:${item.timeContract?.mode ?? 'missing'}`);
}

function snapshotDayRange(context) {
  if (context.timezone !== 'Asia/Shanghai') throw new Error(`snapshot day timezone unsupported:${context.timezone}`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: context.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(context.snapshotAt)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const start = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function rangeDefinition(context, item, range) {
  if (item.timeContract?.mode === 'snapshot_at') {
    return `snapshotAt 所在业务日 ${formatBusinessDate(range.start, context.timezone)}，Asia/Shanghai 左闭右开`;
  }
  return `固定周期 ${range.start.toISOString()} 至 ${range.end.toISOString()}，左闭右开`;
}

function namedBeautician(context, item) {
  const matches = context.beauticians
    .filter((beautician) => item.sourceQuestion.includes(beautician.name))
    .sort((left, right) => right.name.length - left.name.length || left.id - right.id);
  const longest = matches[0]?.name.length ?? 0;
  const strongest = matches.filter((beautician) => beautician.name.length === longest);
  if (strongest.length !== 1) throw new Error(`beautician identity ambiguous:${item.sourceCaseId}:${strongest.length}`);
  return strongest[0];
}

function activeBeauticians(context) {
  return context.beauticians.filter((beautician) => beautician.status === 'active');
}

function activeNamedBeautician(context, item) {
  const beautician = namedBeautician(context, item);
  if (beautician.status !== 'active') throw new Error(`beautician is not active:${item.sourceCaseId}:${beautician.id}`);
  return beautician;
}

function hasEffectiveSchedule(schedules, timeOffs) {
  return schedules.some((schedule) => {
    if (!EFFECTIVE_SCHEDULE_STATUSES.includes(schedule.status)) return false;
    const scheduleStart = clockMinutes(schedule.startTime);
    let scheduleEnd = clockMinutes(schedule.endTime);
    if (scheduleEnd <= scheduleStart) scheduleEnd += 24 * 60;
    const covered = timeOffs
      .filter((timeOff) => timeOff.date.getTime() === schedule.date.getTime())
      .map((timeOff) => {
        const rawStart = clockMinutes(timeOff.startTime);
        let rawEnd = clockMinutes(timeOff.endTime);
        if (rawEnd <= rawStart) rawEnd += 24 * 60;
        return [Math.max(scheduleStart, rawStart), Math.min(scheduleEnd, rawEnd)];
      })
      .filter(([start, end]) => end > start)
      .sort((left, right) => left[0] - right[0]);
    let coveredMinutes = 0;
    let cursorStart = -1;
    let cursorEnd = -1;
    for (const [start, end] of covered) {
      if (cursorStart < 0) {
        cursorStart = start;
        cursorEnd = end;
      } else if (start <= cursorEnd) {
        cursorEnd = Math.max(cursorEnd, end);
      } else {
        coveredMinutes += cursorEnd - cursorStart;
        cursorStart = start;
        cursorEnd = end;
      }
    }
    if (cursorStart >= 0) coveredMinutes += cursorEnd - cursorStart;
    return coveredMinutes < scheduleEnd - scheduleStart;
  });
}

function clockMinutes(value) {
  const [hours = 0, minutes = 0] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function namedProjects(context, item) {
  const matches = context.projects
    .filter((project) => item.sourceQuestion.includes(project.name))
    .sort((left, right) => right.name.length - left.name.length || left.id - right.id);
  const longest = matches[0]?.name.length ?? 0;
  const strongest = matches.filter((project) => project.name.length === longest);
  if (!strongest.length) throw new Error(`project identity missing:${item.sourceCaseId}`);
  const names = new Set(strongest.map((project) => project.name));
  if (names.size !== 1) throw new Error(`project identity ambiguous:${item.sourceCaseId}:${strongest.length}`);
  return strongest;
}

function reservationSourceKeys(context, rows) {
  const customers = new Map(context.customers.map((item) => [item.id, item]));
  const projects = new Map(context.projects.map((item) => [item.id, item]));
  const beauticians = new Map(context.beauticians.map((item) => [item.id, item]));
  return [
    ...rows.map(reservationKey),
    ...rows.map((row) => customers.get(row.customerId)).filter(Boolean).map(customerKey),
    ...rows.map((row) => projects.get(row.projectId)).filter(Boolean).map(projectKey),
    ...rows
      .map((row) => (row.beauticianId === null ? null : beauticians.get(row.beauticianId)))
      .filter(Boolean)
      .map(beauticianKey),
  ];
}

function isArrivedReservation(row) {
  return row.checkedInAt !== null || ARRIVED_STATUSES.includes(row.status);
}

function uniqueNumbers(values) {
  return [...new Set(values.map(Number))].sort((left, right) => left - right);
}

function groupedCount(rows, keyOf) {
  const result = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

function formatBusinessDate(value, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function normalizeTier(value) {
  return String(value).replace(/会员$/u, '');
}

function tierRank(value) {
  const normalized = normalizeTier(value);
  const index = MEMBER_TIER_ORDER.map(normalizeTier).lastIndexOf(normalized);
  return index >= 0 ? index : -1;
}

function fact(value, sourceKeys, definition) {
  return { value, sourceKeys: [...new Set(sourceKeys)], definition };
}

function customerKey(customer) {
  return `Customer:${customer.id}:${customer.updatedAt.toISOString()}`;
}

function beauticianKey(beautician) {
  return `Beautician:${beautician.id}:${beautician.updatedAt.toISOString()}`;
}

function beauticianLevelKey(level) {
  return `BeauticianLevel:${level.id}:${level.name}:${level.createdAt.toISOString()}`;
}

function projectSkillKey(row) {
  return `BeauticianProjectSkill:${row.id}:${row.beauticianId ?? ''}:${row.projectId}:${row.skillLevel}:${row.certified}:${row.priority}:${row.updatedAt.toISOString()}`;
}

function projectKey(project) {
  return `Project:${project.id}:${project.updatedAt.toISOString()}`;
}

function reservationKey(row) {
  return `Reservation:${row.id}:${row.updatedAt.toISOString()}`;
}

function serviceTaskKey(row) {
  return `ServiceTask:${row.id}:${row.status}:${row.appointmentTime.toISOString()}:${row.startedAt?.toISOString() ?? ''}:${row.completedAt?.toISOString() ?? ''}`;
}

function staffServiceTaskKey(row) {
  return `ServiceTask:${row.id}:${row.customerId}:${row.projectId}:${row.status}:${row.appointmentTime.toISOString()}`;
}

function scheduleKey(row) {
  return `Schedule:${row.id}:${row.beauticianId}:${row.date.toISOString()}:${row.startTime}:${row.endTime}:${row.status}:${row.source}:${row.createdAt.toISOString()}`;
}

function timeOffKey(row) {
  return `BeauticianTimeOff:${row.id}:${row.beauticianId}:${row.date.toISOString()}:${row.startTime}:${row.endTime}:${row.reason ?? ''}:${row.updatedAt.toISOString()}`;
}

function cardUsageKey(row) {
  return `CardUsageRecord:${row.id}:${row.times}:${row.verifiedAt.toISOString()}:${row.customerId}:${row.customerCardId ?? ''}:${row.projectId ?? ''}`;
}

function cardUsageRevenueKey(row) {
  return `CardUsageRecord:${row.id}:${row.cardName}:${row.times}:${row.recognizedUnitValue}:${row.recognizedAmount}:${row.verifiedAt.toISOString()}`;
}

function paymentRecordKey(row) {
  return `PaymentRecord:${row.id}:${row.orderId}:${row.method}:${row.amount}:${row.status}:${row.paidAt?.toISOString() ?? ''}:${row.createdAt.toISOString()}`;
}

function productOrderKey(row) {
  return `ProductOrder:${row.id}:${row.orderNo}:${row.orderKind ?? ''}:${row.netAmount}:${row.totalAmount}:${row.status}:${row.createdAt.toISOString()}:${row.updatedAt.toISOString()}`;
}

function orderItemKey(row) {
  return `OrderItem:${row.id}:${row.orderId ?? ''}:${row.itemType ?? ''}:${row.itemId ?? ''}:${row.name ?? ''}:${row.quantity ?? ''}:${row.listAmount ?? ''}:${row.subtotal ?? ''}:${row.netAmount ?? ''}:${row.isGift ?? ''}:${stableJson(row.payload ?? null)}:${row.createdAt?.toISOString() ?? ''}`;
}

function refundRecordKey(row) {
  return `RefundRecord:${row.id}:${row.amount}:${row.status}:${row.refundedAt?.toISOString() ?? ''}:${row.createdAt.toISOString()}`;
}

function commissionRecordKey(row) {
  return `CommissionRecord:${row.id}:${row.type}:${row.amount}:${row.status}:${row.createdAt.toISOString()}`;
}

function projectBomItemKey(row) {
  return `ProjectBomItem:${row.id}:${row.projectId}:${row.productId}:${row.standardQty}:${row.unit}`;
}

function stockMovementCostKey(row) {
  return `StockMovement:${row.id}:${row.movementType ?? ''}:${row.productId}:${row.orderItemId ?? ''}:${row.sourceType ?? ''}:${row.sourceId ?? ''}:${row.quantity}:${row.unitCost ?? ''}:${row.costAmount ?? ''}:${row.costSource ?? ''}:${row.occurredAt.toISOString()}`;
}

function stockMovementKey(row) {
  return `StockMovement:${row.id}:${row.productId}:${row.movementType}:${row.quantity}:${row.beforeStock ?? ''}:${row.afterStock ?? ''}:${row.occurredAt.toISOString()}`;
}

function dailySettlementKey(row) {
  return `DailySettlement:${row.id}:${row.settleDate.toISOString()}:${row.totalRevenue}:${row.materialCost}:${row.grossProfit}:${row.commissionTotal}:${row.status}:${row.reconciliationStatus}:${row.confirmedAt?.toISOString() ?? ''}:${row.updatedAt.toISOString()}`;
}

function balanceAccountKey(row) {
  return `CustomerBalanceAccount:${row.id}:${row.customerId}:${row.cashBalance}:${row.giftBalance}:${row.status}:${row.updatedAt.toISOString()}`;
}

function customerCardLiabilityKey(row) {
  return `CustomerCard:${row.id}:${row.customerId}:${row.remainingTimes}:${row.recognizedUnitValue}:${row.status}:${row.createdAt.toISOString()}`;
}

function operatingCostKey(row) {
  return `OperatingCost:${row.id}:${row.category}:${row.amount}:${row.costDate.toISOString()}:${row.updatedAt.toISOString()}`;
}

function productKey(product) {
  return `Product:${product.id}:${product.name}:${product.status ?? ''}:${product.currentStock ?? ''}:${product.safetyStock ?? ''}:${product.costPrice}:${product.updatedAt.toISOString()}`;
}

function stockBatchKey(row) {
  return `StockBatch:${row.id}:${row.productId ?? ''}:${row.batchNo ?? ''}:${row.stock}:${row.unitCost ?? ''}:${row.totalAmount ?? ''}:${row.expiryDate?.toISOString() ?? ''}:${row.createdAt.toISOString()}`;
}

function supplySupplierKey(row) {
  return `SupplySupplier:${row.id}:${row.name}:${row.status ?? ''}:${row.qualificationStatus ?? ''}:${row.updatedAt.toISOString()}`;
}

function supplyQuoteKey(row) {
  return `SupplyQuote:${row.id}:${row.supplierId}:${row.supplySkuId}:${row.price}:${row.moq}:${row.leadDays ?? ''}:${row.updatedAt.toISOString()}`;
}

function procurementOrderKey(row) {
  return `ProcurementOrder:${row.id}:${row.orderNo}:${row.supplierId}:${row.status}:${row.totalAmount ?? ''}:${row.netAmount}:${row.createdAt.toISOString()}:${row.updatedAt.toISOString()}`;
}

function procurementOrderItemKey(row) {
  return `ProcurementOrderItem:${row.id}:${row.productId ?? ''}:${row.subtotal}:${row.product?.categoryId ?? ''}:${row.product?.updatedAt?.toISOString() ?? ''}`;
}

function supplySettlementKey(row) {
  return `SupplySettlement:${row.id}:${row.supplierId}:${row.settleMonth}:${row.netPayable}:${row.status}:${row.paidAt?.toISOString() ?? ''}:${row.createdAt.toISOString()}:${row.updatedAt.toISOString()}`;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    if (value.constructor?.name === 'Decimal') return String(value);
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function valueArg(name) {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function relative(value) {
  return value.replace(`${REPO_ROOT}/`, '');
}
