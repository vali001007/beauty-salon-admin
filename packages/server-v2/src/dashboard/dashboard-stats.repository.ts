import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type DashboardStatsScope = {
  storeId: number | null;
  accessibleStoreIds: readonly number[];
  isSuperAdmin: boolean;
};

export type DashboardStatsRanges = {
  todayStart: Date;
  tomorrowStart: Date;
  yesterdayStart: Date;
  monthStart: Date;
  expiringBefore: Date;
};

export type DashboardStatsResult = {
  totalCustomers: number;
  monthNewCustomers: number;
  todayIncome: number;
  yesterdayIncome: number;
  incomeHint: string;
  lowStockCount: number;
  expiringBatchCount: number;
  inventoryWarningCount: number;
  activeActivities: number;
  todayReservations: number;
  pendingReservations: number;
  pendingCheckIn: number;
  pendingTasks: number;
  inProgressTasks: number;
  todayCardUsage: number;
  todayNewCustomers: number;
  pendingPurchaseOrders: number;
  pendingTransferOrders: number;
  activeStores: number;
  totalTerminals: number;
  onlineTerminals: number;
  offlineTerminals: number;
};

const ACTIVE_ORDER_STATUSES = ['completed', 'paid', '已完成', '已付款'];
const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', '进行中', '待确认', '已确认'];
const PENDING_RESERVATION_STATUSES = ['pending', '待确认'];
const PENDING_TASK_STATUSES = ['pending', 'in_progress'];
const PENDING_PURCHASE_STATUSES = ['pending', 'ordered', 'draft', '待处理', '待入库'];
const PENDING_TRANSFER_STATUSES = ['pending', 'in_transit', 'draft', '待确认', '调拨中'];

@Injectable()
export class DashboardStatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async collect(scope: DashboardStatsScope, ranges: DashboardStatsRanges): Promise<DashboardStatsResult> {
    const [customers, revenue, inventory, service, supply, terminals] = await Promise.all([
      this.customerStats(scope, ranges),
      this.revenueStats(scope, ranges),
      this.inventoryStats(scope, ranges),
      this.serviceStats(scope, ranges),
      this.supplyStats(scope),
      this.terminalStats(scope),
    ]);

    const todayIncome = number(revenue.todayProductIncome) + number(revenue.todayCardIncome);
    const yesterdayIncome = number(revenue.yesterdayProductIncome) + number(revenue.yesterdayCardIncome);
    return {
      totalCustomers: number(customers.totalCustomers),
      monthNewCustomers: number(customers.monthNewCustomers),
      todayNewCustomers: number(customers.todayNewCustomers),
      todayIncome,
      yesterdayIncome,
      incomeHint: yesterdayIncome > 0 ? `较昨日 ${formatPercent((todayIncome - yesterdayIncome) / yesterdayIncome)}` : '今日开卡/收银汇总',
      lowStockCount: number(inventory.lowStockCount),
      expiringBatchCount: number(inventory.expiringBatchCount),
      inventoryWarningCount: number(inventory.lowStockCount) + number(inventory.expiringBatchCount),
      activeActivities: number(inventory.activeActivities),
      todayReservations: number(service.todayReservations),
      pendingReservations: number(service.pendingReservations),
      pendingCheckIn: number(service.pendingCheckIn),
      pendingTasks: number(service.pendingTasks),
      inProgressTasks: number(service.inProgressTasks),
      todayCardUsage: number(service.todayCardUsage),
      pendingPurchaseOrders: number(supply.pendingPurchaseOrders),
      pendingTransferOrders: number(supply.pendingTransferOrders),
      activeStores: number(terminals.activeStores),
      totalTerminals: number(terminals.totalTerminals),
      onlineTerminals: number(terminals.onlineTerminals),
      offlineTerminals: Math.max(number(terminals.totalTerminals) - number(terminals.onlineTerminals), 0),
    };
  }

  private async customerStats(scope: DashboardStatsScope, ranges: DashboardStatsRanges) {
    const filter = storeFilter(scope, 'c."storeId"');
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE c."deletedAt" IS NULL) AS "totalCustomers",
        COUNT(*) FILTER (WHERE c."deletedAt" IS NULL AND c."createdAt" >= ${ranges.monthStart}) AS "monthNewCustomers",
        COUNT(*) FILTER (WHERE c."deletedAt" IS NULL AND c."createdAt" >= ${ranges.todayStart} AND c."createdAt" < ${ranges.tomorrowStart}) AS "todayNewCustomers"
      FROM "Customer" c
      WHERE ${filter}
    `);
    return rows[0] ?? {};
  }

  private async revenueStats(scope: DashboardStatsScope, ranges: DashboardStatsRanges) {
    const orderFilter = storeFilter(scope, 'o."storeId"');
    const customerFilter = storeFilter(scope, 'customer."storeId"');
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COALESCE((SELECT SUM(o."totalAmount") FROM "ProductOrder" o WHERE ${orderFilter} AND o."status" IN (${Prisma.join(ACTIVE_ORDER_STATUSES)}) AND o."createdAt" >= ${ranges.todayStart} AND o."createdAt" < ${ranges.tomorrowStart}), 0) AS "todayProductIncome",
        COALESCE((SELECT SUM(o."totalAmount") FROM "ProductOrder" o WHERE ${orderFilter} AND o."status" IN (${Prisma.join(ACTIVE_ORDER_STATUSES)}) AND o."createdAt" >= ${ranges.yesterdayStart} AND o."createdAt" < ${ranges.todayStart}), 0) AS "yesterdayProductIncome",
        COALESCE((SELECT SUM(card."price") FROM "CustomerCard" cc INNER JOIN "Customer" customer ON customer."id" = cc."customerId" INNER JOIN "Card" card ON card."id" = cc."cardId" WHERE ${customerFilter} AND cc."createdAt" >= ${ranges.todayStart} AND cc."createdAt" < ${ranges.tomorrowStart}), 0) AS "todayCardIncome",
        COALESCE((SELECT SUM(card."price") FROM "CustomerCard" cc INNER JOIN "Customer" customer ON customer."id" = cc."customerId" INNER JOIN "Card" card ON card."id" = cc."cardId" WHERE ${customerFilter} AND cc."createdAt" >= ${ranges.yesterdayStart} AND cc."createdAt" < ${ranges.todayStart}), 0) AS "yesterdayCardIncome"
    `);
    return rows[0] ?? {};
  }

  private async inventoryStats(scope: DashboardStatsScope, ranges: DashboardStatsRanges) {
    const productFilter = storeFilter(scope, 'p."storeId"');
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COALESCE((SELECT COUNT(*) FROM "Product" p WHERE ${productFilter} AND p."deletedAt" IS NULL AND p."currentStock" < p."safetyStock"), 0) AS "lowStockCount",
        COALESCE((SELECT COUNT(*) FROM "StockBatch" b INNER JOIN "Product" p ON p."id" = b."productId" WHERE ${productFilter} AND p."deletedAt" IS NULL AND b."expiryDate" >= ${ranges.todayStart} AND b."expiryDate" <= ${ranges.expiringBefore}), 0) AS "expiringBatchCount",
        COALESCE((SELECT COUNT(*) FROM "MarketingActivity" a WHERE a."status" IN ('active', 'enabled', 'running', 'published', '进行中')), 0) AS "activeActivities"
    `);
    return rows[0] ?? {};
  }

  private async serviceStats(scope: DashboardStatsScope, ranges: DashboardStatsRanges) {
    const reservationFilter = storeFilter(scope, 'r."storeId"');
    const taskFilter = storeFilter(scope, 't."storeId"');
    const usageFilter = storeFilter(scope, 'customer."storeId"');
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COALESCE((SELECT COUNT(*) FROM "Reservation" r WHERE ${reservationFilter} AND r."date" >= ${ranges.todayStart} AND r."date" < ${ranges.tomorrowStart} AND r."status" IN (${Prisma.join(ACTIVE_RESERVATION_STATUSES)})), 0) AS "todayReservations",
        COALESCE((SELECT COUNT(*) FROM "Reservation" r WHERE ${reservationFilter} AND r."date" >= ${ranges.todayStart} AND r."date" < ${ranges.tomorrowStart} AND r."status" IN (${Prisma.join(PENDING_RESERVATION_STATUSES)})), 0) AS "pendingReservations",
        COALESCE((SELECT COUNT(*) FROM "Reservation" r WHERE ${reservationFilter} AND r."date" >= ${ranges.todayStart} AND r."date" < ${ranges.tomorrowStart} AND r."checkedInAt" IS NULL AND r."status" IN (${Prisma.join(ACTIVE_RESERVATION_STATUSES)})), 0) AS "pendingCheckIn",
        COALESCE((SELECT COUNT(*) FROM "ServiceTask" t WHERE ${taskFilter} AND t."status" IN (${Prisma.join(PENDING_TASK_STATUSES)})), 0) AS "pendingTasks",
        COALESCE((SELECT COUNT(*) FROM "ServiceTask" t WHERE ${taskFilter} AND t."status" = 'in_progress'), 0) AS "inProgressTasks",
        COALESCE((SELECT COUNT(*) FROM "CardUsageRecord" u INNER JOIN "Customer" customer ON customer."id" = u."customerId" WHERE ${usageFilter} AND u."verifiedAt" >= ${ranges.todayStart} AND u."verifiedAt" < ${ranges.tomorrowStart}), 0) AS "todayCardUsage"
    `);
    return rows[0] ?? {};
  }

  private async supplyStats(scope: DashboardStatsScope) {
    const purchaseFilter = storeFilter(scope, 'p."storeId"');
    const transferFilter = transferStoreFilter(scope);
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        COALESCE((SELECT COUNT(*) FROM "PurchaseOrder" p WHERE ${purchaseFilter} AND p."status" IN (${Prisma.join(PENDING_PURCHASE_STATUSES)})), 0) AS "pendingPurchaseOrders",
        COALESCE((SELECT COUNT(*) FROM "TransferOrder" t WHERE ${transferFilter} AND t."status" IN (${Prisma.join(PENDING_TRANSFER_STATUSES)})), 0) AS "pendingTransferOrders"
    `);
    return rows[0] ?? {};
  }

  private async terminalStats(scope: DashboardStatsScope) {
    const terminalFilter = storeFilter(scope, 'd."storeId"');
    const activeStores = scope.storeId
      ? Prisma.sql`1`
      : Prisma.sql`COALESCE((SELECT COUNT(*) FROM "Store" s WHERE s."status" = 'active' AND s."deletedAt" IS NULL), 0)`;
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        ${activeStores} AS "activeStores",
        COALESCE((SELECT COUNT(*) FROM "TerminalDevice" d WHERE ${terminalFilter}), 0) AS "totalTerminals",
        COALESCE((SELECT COUNT(*) FROM "TerminalDevice" d WHERE ${terminalFilter} AND d."status" = 'online'), 0) AS "onlineTerminals"
    `);
    return rows[0] ?? {};
  }
}

function storeFilter(scope: DashboardStatsScope, column: string): Prisma.Sql {
  if (scope.storeId) return Prisma.sql`${Prisma.raw(column)} = ${scope.storeId}`;
  if (scope.isSuperAdmin) return Prisma.sql`TRUE`;
  if (scope.accessibleStoreIds.length) return Prisma.sql`${Prisma.raw(column)} IN (${Prisma.join(scope.accessibleStoreIds)})`;
  return Prisma.sql`${Prisma.raw(column)} = -1`;
}

function transferStoreFilter(scope: DashboardStatsScope): Prisma.Sql {
  if (scope.storeId) return Prisma.sql`(t."fromStoreId" = ${scope.storeId} OR t."toStoreId" = ${scope.storeId})`;
  if (scope.isSuperAdmin) return Prisma.sql`TRUE`;
  if (scope.accessibleStoreIds.length) {
    return Prisma.sql`(t."fromStoreId" IN (${Prisma.join(scope.accessibleStoreIds)}) OR t."toStoreId" IN (${Prisma.join(scope.accessibleStoreIds)}))`;
  }
  return Prisma.sql`(t."fromStoreId" = -1 OR t."toStoreId" = -1)`;
}

function number(value: unknown): number {
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return Number(value.toNumber());
  }
  return Number(value ?? 0);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
}
