import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const yes = args.has('--yes');
const dryRun = args.has('--dry-run') || !apply;

function readArg(name: string, fallback = '') {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const RETAIN_STORE_NAME = readArg('--retain-store-name', 'Ami 全量演示门店');
const CONFIRM_RETAIN_STORE_NAME = readArg('--confirm-retain-store-name');
const FULL_DEMO_PREFIX = 'AMI-DEMO-FULL';
const FULL_DEMO_USER_PREFIX = 'ami_demo_full';

if (apply && (!yes || CONFIRM_RETAIN_STORE_NAME !== RETAIN_STORE_NAME)) {
  throw new Error(
    `真实清理必须显式传入 --apply --yes --confirm-retain-store-name="${RETAIN_STORE_NAME}"`,
  );
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

type CountMap = Record<string, number>;

function normalizeStoreName(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function idIn(ids: number[]) {
  return ids.length ? { in: ids } : { in: [-1] };
}

function addCount(target: CountMap, key: string, value: number) {
  target[key] = value;
}

async function count(delegate: any, where: any = {}) {
  return delegate.count({ where });
}

async function collectIds(delegate: any, where: any = {}) {
  const rows = await delegate.findMany({ where, select: { id: true } });
  return rows.map((row: { id: number }) => row.id);
}

async function collectPlan() {
  const stores = await prisma.store.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  const matches = stores.filter((store) => normalizeStoreName(store.name) === normalizeStoreName(RETAIN_STORE_NAME));
  if (matches.length !== 1) {
    throw new Error(`保留门店匹配数量异常：${matches.length}。请先确认门店名唯一：${RETAIN_STORE_NAME}`);
  }

  const retainStore = matches[0];
  const deleteStoreIds = stores.filter((store) => store.id !== retainStore.id).map((store) => store.id);
  const deleteStoreWhere = { id: idIn(deleteStoreIds) };
  const storeScopeWhere = { storeId: idIn(deleteStoreIds) };

  const customerIds = await collectIds(prisma.customer, { storeId: idIn(deleteStoreIds) });
  const productIds = await collectIds(prisma.product, { storeId: idIn(deleteStoreIds) });
  const projectIds = await collectIds(prisma.project, { storeId: idIn(deleteStoreIds) });
  const beauticianIds = await collectIds(prisma.beautician, { storeId: idIn(deleteStoreIds) });
  const deviceIds = await collectIds(prisma.terminalDevice, { storeId: idIn(deleteStoreIds) });
  const taskIds = await collectIds(prisma.serviceTask, { storeId: idIn(deleteStoreIds) });
  const orderIds = await collectIds(prisma.productOrder, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { customerId: idIn(customerIds) }],
  });
  const supplierIds = await collectIds(prisma.supplier, { storeId: idIn(deleteStoreIds) });
  const supplierOrderIds = await collectIds(prisma.supplierOrder, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { supplierId: idIn(supplierIds) }],
  });
  const marketingPageIds = await collectIds(prisma.marketingPage, { storeId: idIn(deleteStoreIds) });
  const marketingPageLeadIds = await collectIds(prisma.marketingPageLead, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { customerId: idIn(customerIds) }, { pageId: idIn(marketingPageIds) }],
  });
  const customerAppIdentityIds = await collectIds(prisma.customerAppIdentity, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { customerId: idIn(customerIds) }],
  });
  const fullDemoCardIds = await collectIds(prisma.card, { description: { startsWith: FULL_DEMO_PREFIX } });
  const globalUserIds = await collectIds(prisma.user, {
    AND: [
      { username: { not: 'admin' } },
      { username: { not: { startsWith: FULL_DEMO_USER_PREFIX } } },
    ],
  });
  const globalCleanupWhere = {
    purchaseOrders: {
      AND: [
        { orderNo: { not: { startsWith: FULL_DEMO_PREFIX } } },
        { OR: [{ orderNo: { startsWith: 'MVP-' } }, { orderNo: { startsWith: 'TEST-AMI' } }] },
      ],
    },
    cards: {
      AND: [
        { id: { notIn: fullDemoCardIds.length ? fullDemoCardIds : [-1] } },
        { customerCards: { none: {} } },
        {
          OR: [
            { description: { contains: 'MVP' } },
            { description: { contains: '演示' } },
            { name: { contains: '次卡' } },
          ],
        },
      ],
    },
    marketingStrategies: {
      AND: [
        { description: { not: { startsWith: FULL_DEMO_PREFIX } } },
        {
          OR: [
            { description: { contains: 'MVP' } },
            { description: { contains: 'demo' } },
            { name: { contains: 'MVP' } },
            { name: { contains: '演示' } },
          ],
        },
      ],
    },
    users: {
      id: idIn(globalUserIds),
    },
  };

  const where = {
    stores: deleteStoreWhere,
    userStores: { storeId: idIn(deleteStoreIds) },
    customers: { id: idIn(customerIds) },
    products: { id: idIn(productIds) },
    projects: { id: idIn(projectIds) },
    beauticians: { id: idIn(beauticianIds) },
    devices: { id: idIn(deviceIds) },
    tasks: { id: idIn(taskIds) },
    orders: { id: idIn(orderIds) },
    suppliers: { id: idIn(supplierIds) },
    supplierOrders: { id: idIn(supplierOrderIds) },
    marketingPages: { id: idIn(marketingPageIds) },
    marketingPageLeads: { id: idIn(marketingPageLeadIds) },
    customerAppIdentities: { id: idIn(customerAppIdentityIds) },
  };

  const counts: CountMap = {};
  addCount(counts, 'Store', await count(prisma.store, where.stores));
  addCount(counts, 'UserStore', await count(prisma.userStore, where.userStores));
  addCount(counts, 'Customer', await count(prisma.customer, where.customers));
  addCount(counts, 'CustomerHealthProfile', await count(prisma.customerHealthProfile, { customerId: idIn(customerIds) }));
  addCount(counts, 'ConsumptionRecord', await count(prisma.consumptionRecord, { customerId: idIn(customerIds) }));
  addCount(counts, 'CustomerCard', await count(prisma.customerCard, { customerId: idIn(customerIds) }));
  addCount(counts, 'CardUsageRecord', await count(prisma.cardUsageRecord, {
    OR: [{ customerId: idIn(customerIds) }, { beauticianId: idIn(beauticianIds) }, { deviceId: idIn(deviceIds) }],
  }));
  addCount(counts, 'CustomerBalanceAccount', await count(prisma.customerBalanceAccount, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { customerId: idIn(customerIds) }],
  }));
  addCount(counts, 'CustomerBalanceTransaction', await count(prisma.customerBalanceTransaction, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { customerId: idIn(customerIds) }, { orderId: idIn(orderIds) }],
  }));
  addCount(counts, 'ProductOrder', await count(prisma.productOrder, where.orders));
  addCount(counts, 'OrderItem', await count(prisma.orderItem, {
    OR: [{ orderId: idIn(orderIds) }, { beauticianId: idIn(beauticianIds) }],
  }));
  addCount(counts, 'PaymentRecord', await count(prisma.paymentRecord, { orderId: idIn(orderIds) }));
  addCount(counts, 'RefundRecord', await count(prisma.refundRecord, { orderId: idIn(orderIds) }));
  addCount(counts, 'Product', await count(prisma.product, where.products));
  addCount(counts, 'StockBatch', await count(prisma.stockBatch, { productId: idIn(productIds) }));
  addCount(counts, 'StockMovement', await count(prisma.stockMovement, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { productId: idIn(productIds) }, { operatorId: idIn(globalUserIds) }],
  }));
  addCount(counts, 'Project', await count(prisma.project, where.projects));
  addCount(counts, 'ProjectBomItem', await count(prisma.projectBomItem, {
    OR: [{ projectId: idIn(projectIds) }, { productId: idIn(productIds) }],
  }));
  addCount(counts, 'Beautician', await count(prisma.beautician, where.beauticians));
  addCount(counts, 'Schedule', await count(prisma.schedule, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { beauticianId: idIn(beauticianIds) }],
  }));
  addCount(counts, 'Reservation', await count(prisma.reservation, {
    OR: [
      { storeId: idIn(deleteStoreIds) },
      { customerId: idIn(customerIds) },
      { projectId: idIn(projectIds) },
      { beauticianId: idIn(beauticianIds) },
    ],
  }));
  addCount(counts, 'TerminalDevice', await count(prisma.terminalDevice, where.devices));
  addCount(counts, 'ServiceTask', await count(prisma.serviceTask, where.tasks));
  addCount(counts, 'SkinTest', await count(prisma.skinTest, {
    OR: [{ customerId: idIn(customerIds) }, { taskId: idIn(taskIds) }, { deviceId: idIn(deviceIds) }],
  }));
  addCount(counts, 'PredictionRun', await count(prisma.predictionRun, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'CustomerPredictionSnapshot', await count(prisma.customerPredictionSnapshot, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { customerId: idIn(customerIds) }],
  }));
  addCount(counts, 'MarketingAutomationTouch', await count(prisma.marketingAutomationTouch, { customerId: idIn(customerIds) }));
  addCount(counts, 'MarketingAttribution', await count(prisma.marketingAttribution, {
    OR: [{ customerId: idIn(customerIds) }, { orderId: idIn(orderIds) }],
  }));
  addCount(counts, 'RecommendationEvent', await count(prisma.recommendationEvent, {
    OR: [
      { storeId: idIn(deleteStoreIds) },
      { customerId: idIn(customerIds) },
      { deviceId: idIn(deviceIds) },
      { taskId: idIn(taskIds) },
      { orderId: idIn(orderIds) },
    ],
  }));
  addCount(counts, 'CustomerBehaviorEvent', await count(prisma.customerBehaviorEvent, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { customerId: idIn(customerIds) }],
  }));
  addCount(counts, 'MarketingPage', await count(prisma.marketingPage, where.marketingPages));
  addCount(counts, 'MarketingPageEvent', await count(prisma.marketingPageEvent, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { customerId: idIn(customerIds) }, { pageId: idIn(marketingPageIds) }],
  }));
  addCount(counts, 'MarketingPageLead', await count(prisma.marketingPageLead, where.marketingPageLeads));
  addCount(counts, 'MarketingPageAttribution', await count(prisma.marketingPageAttribution, {
    OR: [
      { customerId: idIn(customerIds) },
      { orderId: idIn(orderIds) },
      { pageId: idIn(marketingPageIds) },
      { leadId: idIn(marketingPageLeadIds) },
    ],
  }));
  addCount(counts, 'CustomerAppIdentity', await count(prisma.customerAppIdentity, where.customerAppIdentities));
  addCount(counts, 'CustomerAppEvent', await count(prisma.customerAppEvent, {
    OR: [
      { storeId: idIn(deleteStoreIds) },
      { customerId: idIn(customerIds) },
      { identityId: idIn(customerAppIdentityIds) },
    ],
  }));
  addCount(counts, 'Promotion', await count(prisma.promotion, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'PrintJob', await count(prisma.printJob, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'CommissionRule', await count(prisma.commissionRule, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'CommissionRecord', await count(prisma.commissionRecord, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { beauticianId: idIn(beauticianIds) }, { orderId: idIn(orderIds) }],
  }));
  addCount(counts, 'CommissionSettlement', await count(prisma.commissionSettlement, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { beauticianId: idIn(beauticianIds) }],
  }));
  addCount(counts, 'CashierShift', await count(prisma.cashierShift, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { deviceId: idIn(deviceIds) }, { operatorId: idIn(globalUserIds) }],
  }));
  addCount(counts, 'DailySettlement', await count(prisma.dailySettlement, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'AmiPerformanceRecord', await count(prisma.amiPerformanceRecord, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { customerId: idIn(customerIds) }, { orderId: idIn(orderIds) }],
  }));
  addCount(counts, 'AmiMonthlyBill', await count(prisma.amiMonthlyBill, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'AiAuditLog', await count(prisma.aiAuditLog, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { deviceId: idIn(deviceIds) }, { userId: idIn(globalUserIds) }],
  }));
  addCount(counts, 'Supplier', await count(prisma.supplier, where.suppliers));
  addCount(counts, 'ProductSupplier', await count(prisma.productSupplier, {
    OR: [{ productId: idIn(productIds) }, { supplierId: idIn(supplierIds) }],
  }));
  addCount(counts, 'SupplierOrder', await count(prisma.supplierOrder, where.supplierOrders));
  addCount(counts, 'SupplierOrderItem', await count(prisma.supplierOrderItem, {
    OR: [{ orderId: idIn(supplierOrderIds) }, { productId: idIn(productIds) }],
  }));
  addCount(counts, 'SupplierSettlement', await count(prisma.supplierSettlement, { supplierId: idIn(supplierIds) }));
  addCount(counts, 'TransferOrder', await count(prisma.transferOrder, {
    OR: [{ fromStoreId: idIn(deleteStoreIds) }, { toStoreId: idIn(deleteStoreIds) }],
  }));
  addCount(counts, 'SchedulingRuleConfig', await count(prisma.schedulingRuleConfig, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'BeauticianAvailability', await count(prisma.beauticianAvailability, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { beauticianId: idIn(beauticianIds) }],
  }));
  addCount(counts, 'BeauticianTimeOff', await count(prisma.beauticianTimeOff, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { beauticianId: idIn(beauticianIds) }],
  }));
  addCount(counts, 'BeauticianProjectSkill', await count(prisma.beauticianProjectSkill, {
    OR: [{ beauticianId: idIn(beauticianIds) }, { projectId: idIn(projectIds) }],
  }));
  addCount(counts, 'SmartSchedulingRun', await count(prisma.smartSchedulingRun, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { createdById: idIn(globalUserIds) }],
  }));
  addCount(counts, 'UserRole', await count(prisma.userRole, { userId: idIn(globalUserIds) }));
  addCount(counts, 'RefreshToken', await count(prisma.refreshToken, { userId: idIn(globalUserIds) }));
  addCount(counts, 'GlobalUserStore', await count(prisma.userStore, { userId: idIn(globalUserIds) }));
  addCount(counts, 'TerminalConversation', await count(prisma.terminalConversation, {
    OR: [{ storeId: idIn(deleteStoreIds) }, { operatorId: idIn(globalUserIds) }],
  }));
  addCount(counts, 'StoreResource', await count(prisma.storeResource, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'ResourceBooking', await count(prisma.resourceBooking, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'AmiGlowDisplayConfig', await count(prisma.amiGlowDisplayConfig, { storeId: idIn(deleteStoreIds) }));
  addCount(counts, 'GlobalPurchaseOrder', await count(prisma.purchaseOrder, globalCleanupWhere.purchaseOrders));
  addCount(counts, 'GlobalCard', await count(prisma.card, globalCleanupWhere.cards));
  addCount(counts, 'GlobalMarketingAutomationStrategy', await count(prisma.marketingAutomationStrategy, globalCleanupWhere.marketingStrategies));
  addCount(counts, 'GlobalUser', await count(prisma.user, globalCleanupWhere.users));

  return {
    retainStore,
    deleteStores: stores.filter((store) => store.id !== retainStore.id),
    ids: {
      deleteStoreIds,
      customerIds,
      productIds,
      projectIds,
      beauticianIds,
      deviceIds,
      taskIds,
      orderIds,
      supplierIds,
      supplierOrderIds,
      marketingPageIds,
      marketingPageLeadIds,
      customerAppIdentityIds,
      fullDemoCardIds,
      globalUserIds,
    },
    where,
    globalCleanupWhere,
    counts,
  };
}

async function del(label: string, action: () => Promise<{ count: number }>, deleted: CountMap) {
  const result = await action();
  deleted[label] = result.count;
}

async function applyCleanup(plan: Awaited<ReturnType<typeof collectPlan>>) {
  const { ids, where, globalCleanupWhere } = plan;
  const deleted: CountMap = {};
  await del('AiAuditLog', () => prisma.aiAuditLog.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { deviceId: idIn(ids.deviceIds) }, { userId: idIn(ids.globalUserIds) }] },
  }), deleted);
  await del('MarketingPageAttribution', () => prisma.marketingPageAttribution.deleteMany({
    where: {
      OR: [
        { customerId: idIn(ids.customerIds) },
        { orderId: idIn(ids.orderIds) },
        { pageId: idIn(ids.marketingPageIds) },
        { leadId: idIn(ids.marketingPageLeadIds) },
      ],
    },
  }), deleted);
  await del('MarketingPageLead', () => prisma.marketingPageLead.deleteMany({ where: where.marketingPageLeads }), deleted);
  await del('MarketingPageEvent', () => prisma.marketingPageEvent.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { customerId: idIn(ids.customerIds) }, { pageId: idIn(ids.marketingPageIds) }] },
  }), deleted);
  await del('MarketingPage', () => prisma.marketingPage.deleteMany({ where: where.marketingPages }), deleted);
  await del('CustomerAppEvent', () => prisma.customerAppEvent.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { customerId: idIn(ids.customerIds) }, { identityId: idIn(ids.customerAppIdentityIds) }] },
  }), deleted);
  await del('CustomerAppIdentity', () => prisma.customerAppIdentity.deleteMany({ where: where.customerAppIdentities }), deleted);
  await del('AmiGlowDisplayConfig', () => prisma.amiGlowDisplayConfig.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('CustomerBehaviorEvent', () => prisma.customerBehaviorEvent.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { customerId: idIn(ids.customerIds) }] },
  }), deleted);
  await del('MarketingAttribution', () => prisma.marketingAttribution.deleteMany({
    where: { OR: [{ customerId: idIn(ids.customerIds) }, { orderId: idIn(ids.orderIds) }] },
  }), deleted);
  await del('MarketingAutomationTouch', () => prisma.marketingAutomationTouch.deleteMany({ where: { customerId: idIn(ids.customerIds) } }), deleted);
  await del('RecommendationEvent', () => prisma.recommendationEvent.deleteMany({
    where: {
      OR: [
        { storeId: idIn(ids.deleteStoreIds) },
        { customerId: idIn(ids.customerIds) },
        { deviceId: idIn(ids.deviceIds) },
        { taskId: idIn(ids.taskIds) },
        { orderId: idIn(ids.orderIds) },
      ],
    },
  }), deleted);
  await del('AmiPerformanceRecord', () => prisma.amiPerformanceRecord.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { customerId: idIn(ids.customerIds) }, { orderId: idIn(ids.orderIds) }] },
  }), deleted);
  await del('CommissionRecord', () => prisma.commissionRecord.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { beauticianId: idIn(ids.beauticianIds) }, { orderId: idIn(ids.orderIds) }] },
  }), deleted);
  await del('CommissionSettlement', () => prisma.commissionSettlement.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { beauticianId: idIn(ids.beauticianIds) }] },
  }), deleted);
  await del('CommissionRule', () => prisma.commissionRule.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('CashierShift', () => prisma.cashierShift.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { deviceId: idIn(ids.deviceIds) }, { operatorId: idIn(ids.globalUserIds) }] },
  }), deleted);
  await del('DailySettlement', () => prisma.dailySettlement.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('AmiMonthlyBill', () => prisma.amiMonthlyBill.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('CustomerBalanceTransaction', () => prisma.customerBalanceTransaction.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { customerId: idIn(ids.customerIds) }, { orderId: idIn(ids.orderIds) }] },
  }), deleted);
  await del('CustomerBalanceAccount', () => prisma.customerBalanceAccount.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { customerId: idIn(ids.customerIds) }] },
  }), deleted);
  await del('PaymentRecord', () => prisma.paymentRecord.deleteMany({ where: { orderId: idIn(ids.orderIds) } }), deleted);
  await del('RefundRecord', () => prisma.refundRecord.deleteMany({ where: { orderId: idIn(ids.orderIds) } }), deleted);
  await del('OrderItem', () => prisma.orderItem.deleteMany({
    where: { OR: [{ orderId: idIn(ids.orderIds) }, { beauticianId: idIn(ids.beauticianIds) }] },
  }), deleted);
  await del('ProductOrder', () => prisma.productOrder.deleteMany({ where: where.orders }), deleted);
  await del('CardUsageRecord', () => prisma.cardUsageRecord.deleteMany({
    where: { OR: [{ customerId: idIn(ids.customerIds) }, { beauticianId: idIn(ids.beauticianIds) }, { deviceId: idIn(ids.deviceIds) }] },
  }), deleted);
  await del('CustomerCard', () => prisma.customerCard.deleteMany({ where: { customerId: idIn(ids.customerIds) } }), deleted);
  await del('SkinTest', () => prisma.skinTest.deleteMany({
    where: { OR: [{ customerId: idIn(ids.customerIds) }, { taskId: idIn(ids.taskIds) }, { deviceId: idIn(ids.deviceIds) }] },
  }), deleted);
  await del('ServiceTask', () => prisma.serviceTask.deleteMany({ where: where.tasks }), deleted);
  await del('Reservation', () => prisma.reservation.deleteMany({
    where: {
      OR: [
        { storeId: idIn(ids.deleteStoreIds) },
        { customerId: idIn(ids.customerIds) },
        { projectId: idIn(ids.projectIds) },
        { beauticianId: idIn(ids.beauticianIds) },
      ],
    },
  }), deleted);
  await del('Schedule', () => prisma.schedule.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { beauticianId: idIn(ids.beauticianIds) }] },
  }), deleted);
  await del('BeauticianAvailability', () => prisma.beauticianAvailability.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { beauticianId: idIn(ids.beauticianIds) }] },
  }), deleted);
  await del('BeauticianTimeOff', () => prisma.beauticianTimeOff.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { beauticianId: idIn(ids.beauticianIds) }] },
  }), deleted);
  await del('BeauticianProjectSkill', () => prisma.beauticianProjectSkill.deleteMany({
    where: { OR: [{ beauticianId: idIn(ids.beauticianIds) }, { projectId: idIn(ids.projectIds) }] },
  }), deleted);
  await del('SmartSchedulingRun', () => prisma.smartSchedulingRun.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { createdById: idIn(ids.globalUserIds) }] },
  }), deleted);
  await del('TerminalConversation', () => prisma.terminalConversation.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { operatorId: idIn(ids.globalUserIds) }] },
  }), deleted);
  await del('SchedulingRuleConfig', () => prisma.schedulingRuleConfig.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('ResourceBooking', () => prisma.resourceBooking.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('StoreResource', () => prisma.storeResource.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('Promotion', () => prisma.promotion.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('PrintJob', () => prisma.printJob.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('StockMovement', () => prisma.stockMovement.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { productId: idIn(ids.productIds) }, { operatorId: idIn(ids.globalUserIds) }] },
  }), deleted);
  await del('SupplierSettlement', () => prisma.supplierSettlement.deleteMany({ where: { supplierId: idIn(ids.supplierIds) } }), deleted);
  await del('SupplierOrderItem', () => prisma.supplierOrderItem.deleteMany({
    where: { OR: [{ orderId: idIn(ids.supplierOrderIds) }, { productId: idIn(ids.productIds) }] },
  }), deleted);
  await del('SupplierOrder', () => prisma.supplierOrder.deleteMany({ where: where.supplierOrders }), deleted);
  await del('ProductSupplier', () => prisma.productSupplier.deleteMany({
    where: { OR: [{ productId: idIn(ids.productIds) }, { supplierId: idIn(ids.supplierIds) }] },
  }), deleted);
  await del('Supplier', () => prisma.supplier.deleteMany({ where: where.suppliers }), deleted);
  await del('ProjectBomItem', () => prisma.projectBomItem.deleteMany({
    where: { OR: [{ projectId: idIn(ids.projectIds) }, { productId: idIn(ids.productIds) }] },
  }), deleted);
  await del('StockBatch', () => prisma.stockBatch.deleteMany({ where: { productId: idIn(ids.productIds) } }), deleted);
  await del('Product', () => prisma.product.deleteMany({ where: where.products }), deleted);
  await del('Project', () => prisma.project.deleteMany({ where: where.projects }), deleted);
  await del('Beautician', () => prisma.beautician.deleteMany({ where: where.beauticians }), deleted);
  await del('TerminalDevice', () => prisma.terminalDevice.deleteMany({ where: where.devices }), deleted);
  await del('CustomerPredictionSnapshot', () => prisma.customerPredictionSnapshot.deleteMany({
    where: { OR: [{ storeId: idIn(ids.deleteStoreIds) }, { customerId: idIn(ids.customerIds) }] },
  }), deleted);
  await del('PredictionRun', () => prisma.predictionRun.deleteMany({ where: { storeId: idIn(ids.deleteStoreIds) } }), deleted);
  await del('CustomerHealthProfile', () => prisma.customerHealthProfile.deleteMany({ where: { customerId: idIn(ids.customerIds) } }), deleted);
  await del('ConsumptionRecord', () => prisma.consumptionRecord.deleteMany({ where: { customerId: idIn(ids.customerIds) } }), deleted);
  await del('Customer', () => prisma.customer.deleteMany({ where: where.customers }), deleted);
  await del('TransferOrder', () => prisma.transferOrder.deleteMany({
    where: { OR: [{ fromStoreId: idIn(ids.deleteStoreIds) }, { toStoreId: idIn(ids.deleteStoreIds) }] },
  }), deleted);
  await del('UserStore', () => prisma.userStore.deleteMany({
    where: { OR: [where.userStores, { userId: idIn(ids.globalUserIds) }] },
  }), deleted);
  await del('Store', () => prisma.store.deleteMany({ where: where.stores }), deleted);
  await del('UserRole', () => prisma.userRole.deleteMany({ where: { userId: idIn(ids.globalUserIds) } }), deleted);
  await del('RefreshToken', () => prisma.refreshToken.deleteMany({ where: { userId: idIn(ids.globalUserIds) } }), deleted);
  await del('GlobalPurchaseOrder', () => prisma.purchaseOrder.deleteMany({ where: globalCleanupWhere.purchaseOrders }), deleted);
  await del('GlobalCard', () => prisma.card.deleteMany({ where: globalCleanupWhere.cards }), deleted);
  await del('GlobalMarketingAutomationStrategy', () => prisma.marketingAutomationStrategy.deleteMany({ where: globalCleanupWhere.marketingStrategies }), deleted);
  await del('GlobalUser', () => prisma.user.deleteMany({ where: globalCleanupWhere.users }), deleted);
  return deleted;
}

async function main() {
  const plan = await collectPlan();
  const payload: Record<string, unknown> = {
    mode: dryRun ? 'dry-run' : 'apply',
    retainStore: plan.retainStore,
    deleteStores: plan.deleteStores,
    plannedDeleteCounts: plan.counts,
    safety: {
      requiresApplyYes: true,
      requiredConfirmArg: `--confirm-retain-store-name="${RETAIN_STORE_NAME}"`,
      note: '默认 dry-run 不修改数据库。真实执行前必须确认数据库备份已完成。',
    },
  };

  if (!dryRun) {
    payload.deletedCounts = await applyCleanup(plan);
  }

  console.log(JSON.stringify(payload, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
