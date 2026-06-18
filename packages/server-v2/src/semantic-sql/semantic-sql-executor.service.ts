import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SemanticSqlRequest, SemanticSqlResult } from './semantic-sql.types.js';

const MAX_LIMIT = 100;
const PAID_ORDER_STATUSES = ['completed', 'paid', '已完成', '已付款'];

type DateRange = { start: Date; end: Date; label: string };

@Injectable()
export class SemanticSqlExecutorService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(request: SemanticSqlRequest & { betaEnabled?: boolean }): Promise<SemanticSqlResult> {
    const auditId = this.createAuditId(request);
    const rejectedReason = this.validateRequest(request);
    if (!request.betaEnabled) {
      return this.rejected(request, auditId, 'semantic_sql_beta_disabled');
    }
    if (rejectedReason) return this.rejected(request, auditId, rejectedReason);

    const limit = this.clampLimit(request.limit);
    const metric = this.pickMetric(request.metricKeys);
    if (!metric) return this.rejected(request, auditId, 'metric_not_supported_by_executor');

    if (metric === 'product_sales_growth') return this.queryProductSalesGrowth(request, limit, auditId);
    if (metric === 'stock_risk_score') return this.queryStockRisk(request, limit, auditId);
    if (metric === 'revenue') return this.queryRevenue(request, auditId);
    if (metric === 'member_balance') return this.queryMemberBalance(request, limit, auditId);

    return this.rejected(request, auditId, 'metric_not_supported_by_executor');
  }

  private async queryProductSalesGrowth(request: SemanticSqlRequest, limit: number, auditId: string): Promise<SemanticSqlResult> {
    const range = this.resolveDateRange(request.timeRange);
    const previous = this.previousSameLengthRange(range);
    const records = await (this.prisma as any).orderItem.findMany({
      where: {
        itemType: 'product',
        itemId: { not: null },
        order: {
          storeId: request.storeId,
          status: { in: PAID_ORDER_STATUSES },
          createdAt: { gte: previous.start, lt: range.end },
        },
      },
      include: { order: { select: { id: true, customerId: true, createdAt: true, status: true } } },
      take: 5000,
    });
    const bucket = new Map<
      number,
      { productId: number; productName: string; currentQuantity: number; previousQuantity: number; salesAmount: number; customers: Set<number> }
    >();
    for (const item of records as any[]) {
      const productId = Number(item.itemId);
      if (!productId) continue;
      const orderTime = new Date(item.order?.createdAt).getTime();
      const isCurrent = orderTime >= range.start.getTime() && orderTime < range.end.getTime();
      const target =
        bucket.get(productId) ??
        { productId, productName: item.name, currentQuantity: 0, previousQuantity: 0, salesAmount: 0, customers: new Set<number>() };
      if (isCurrent) {
        target.currentQuantity += this.toNumber(item.quantity);
        target.salesAmount += this.toNumber(item.subtotal);
        if (item.order?.customerId) target.customers.add(Number(item.order.customerId));
      } else {
        target.previousQuantity += this.toNumber(item.quantity);
      }
      bucket.set(productId, target);
    }
    const rows = Array.from(bucket.values())
      .map((item) => {
        const growth = item.currentQuantity - item.previousQuantity;
        const growthRate = item.previousQuantity > 0 ? growth / item.previousQuantity : item.currentQuantity > 0 ? 1 : 0;
        return {
          productId: item.productId,
          productName: item.productName,
          quantity: item.currentQuantity,
          previousQuantity: item.previousQuantity,
          growth,
          growthRate,
          salesAmount: item.salesAmount,
          customerCount: item.customers.size,
        };
      })
      .filter((item) => item.quantity > 0)
      .sort((a, b) => b.growthRate - a.growthRate || b.quantity - a.quantity)
      .slice(0, limit);
    return this.result(request, auditId, rows, {
      source: ['OrderItem', 'ProductOrder'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: 'product_sales_growth = 当前周期商品销量与上一等长周期销量变化，仅返回聚合排行。',
      filters: ['storeId=当前门店', 'itemType=product', '订单状态 in completed/paid', `limit=${limit}`],
      sampleSize: (records as any[]).length,
      limitations: ['Semantic SQL Beta 仅执行白名单聚合，不返回客户明细。'],
    });
  }

  private async queryStockRisk(request: SemanticSqlRequest, limit: number, auditId: string): Promise<SemanticSqlResult> {
    const products = await (this.prisma as any).product.findMany({
      where: { storeId: request.storeId, deletedAt: null },
      select: { id: true, name: true, sku: true, currentStock: true, safetyStock: true, unit: true, status: true },
      take: 5000,
    });
    const rows = (products as any[])
      .map((product) => {
        const currentStock = this.toNumber(product.currentStock);
        const safetyStock = this.toNumber(product.safetyStock);
        const stockGap = Math.max(0, safetyStock - currentStock);
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          currentStock,
          safetyStock,
          stockGap,
          unit: product.unit,
          riskScore: stockGap > 0 ? Math.min(100, 50 + stockGap * 5) : 0,
        };
      })
      .filter((item) => item.stockGap > 0)
      .sort((a, b) => b.riskScore - a.riskScore || b.stockGap - a.stockGap)
      .slice(0, limit);
    return this.result(request, auditId, rows, {
      source: ['Product'],
      metricDefinition: 'stock_risk_score = currentStock 与 safetyStock 的缺口聚合，仅用于低库存探索查询。',
      filters: ['storeId=当前门店', 'Product.deletedAt is null', 'stockGap>0', `limit=${limit}`],
      sampleSize: (products as any[]).length,
      limitations: ['Semantic SQL Beta 库存风险仅按安全库存缺口聚合，不生成采购单。'],
    });
  }

  private async queryRevenue(request: SemanticSqlRequest, auditId: string): Promise<SemanticSqlResult> {
    const range = this.resolveDateRange(request.timeRange);
    const orders = await (this.prisma as any).productOrder.findMany({
      where: { storeId: request.storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: range.start, lt: range.end } },
      select: { id: true, totalAmount: true, customerId: true, createdAt: true },
      take: 5000,
    });
    const customers = new Set((orders as any[]).map((order) => Number(order.customerId)).filter(Boolean));
    const totalRevenue = (orders as any[]).reduce((sum, order) => sum + this.toNumber(order.totalAmount), 0);
    const rows = [
      {
        dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
        revenue: Math.round(totalRevenue * 100) / 100,
        orderCount: (orders as any[]).length,
        customerCount: customers.size,
        averageOrderValue: (orders as any[]).length ? Math.round((totalRevenue / (orders as any[]).length) * 100) / 100 : 0,
      },
    ].filter((row) => row.orderCount > 0);
    return this.result(request, auditId, rows, {
      source: ['ProductOrder'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: 'revenue = 指定周期内有效订单 totalAmount 聚合。',
      filters: ['storeId=当前门店', '订单状态 in completed/paid'],
      sampleSize: (orders as any[]).length,
      limitations: ['Semantic SQL Beta 收入查询仅返回聚合，不做归因诊断。'],
    });
  }

  private async queryMemberBalance(request: SemanticSqlRequest, limit: number, auditId: string): Promise<SemanticSqlResult> {
    const accounts = await (this.prisma as any).customerBalanceAccount.findMany({
      where: { storeId: request.storeId, status: 'active' },
      include: { customer: { select: { id: true, name: true, memberLevel: true } } },
      take: 5000,
    });
    const rows = (accounts as any[])
      .map((account) => {
        const cashBalance = this.toNumber(account.cashBalance);
        const giftBalance = this.toNumber(account.giftBalance);
        return {
          customerId: account.customerId,
          customerName: account.customer?.name,
          memberLevel: account.customer?.memberLevel,
          cashBalance,
          giftBalance,
          totalBalance: cashBalance + giftBalance,
        };
      })
      .filter((item) => item.totalBalance > 0)
      .sort((a, b) => b.totalBalance - a.totalBalance)
      .slice(0, limit);
    return this.result(request, auditId, rows, {
      source: ['CustomerBalanceAccount', 'Customer'],
      metricDefinition: 'member_balance = active 储值账户 cashBalance + giftBalance 聚合排行。',
      filters: ['storeId=当前门店', 'CustomerBalanceAccount.status=active', 'totalBalance>0', `limit=${limit}`],
      sampleSize: (accounts as any[]).length,
      limitations: ['Semantic SQL Beta 不返回手机号等敏感明细，不执行充值/退款/调整。'],
    });
  }

  private validateRequest(request: SemanticSqlRequest) {
    if (!request.storeId || request.storeId <= 0) return 'missing_store_scope';
    if (!request.actorRole || !['manager', 'reception'].includes(request.actorRole)) return 'role_not_allowed';
    if (!request.metricKeys?.length) return 'missing_metric_keys';
    if (!request.dimensions?.length) return 'missing_dimensions';
    if (!request.limit || request.limit <= 0) return 'missing_limit';
    if (request.limit > MAX_LIMIT) return 'limit_exceeds_max';
    const metric = this.pickMetric(request.metricKeys);
    if (!metric) return 'metric_not_supported_by_executor';
    const allowedDimensions = this.allowedDimensions(metric);
    const invalidDimension = request.dimensions.find((dimension) => !allowedDimensions.includes(dimension));
    if (invalidDimension) return `dimension_${invalidDimension}_not_allowed`;
    return null;
  }

  private pickMetric(keys: string[]) {
    return keys.find((key) => ['product_sales_growth', 'stock_risk_score', 'revenue', 'member_balance'].includes(key));
  }

  private allowedDimensions(metric: string) {
    if (metric === 'product_sales_growth' || metric === 'stock_risk_score') return ['productId', 'productName', 'date'];
    if (metric === 'member_balance') return ['customerId', 'customerName', 'date'];
    if (metric === 'revenue') return ['date'];
    return [];
  }

  private result(
    request: SemanticSqlRequest,
    auditId: string,
    rows: Record<string, unknown>[],
    evidence: NonNullable<SemanticSqlResult['evidence']>,
  ): SemanticSqlResult {
    return {
      status: rows.length ? 'success' : 'no_data',
      rows,
      sqlFingerprint: this.createFingerprint(request),
      evidence,
      auditId,
    };
  }

  private rejected(request: SemanticSqlRequest, auditId: string, rejectedReason: string): SemanticSqlResult {
    return {
      status: 'rejected',
      rows: [],
      sqlFingerprint: this.createFingerprint(request),
      rejectedReason,
      auditId,
    };
  }

  private resolveDateRange(value?: SemanticSqlRequest['timeRange']): DateRange {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (value?.preset === 'today') return { start: startOfToday, end: new Date(startOfToday.getTime() + 86_400_000), label: '今天' };
    if (value?.preset === 'this_month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: '本月' };
    if (value?.preset === 'last_7_days') return { start: new Date(now.getTime() - 7 * 86_400_000), end: now, label: '近7天' };
    if (value?.preset === 'custom' && value.startDate && value.endDate) {
      const start = new Date(value.startDate);
      const end = new Date(value.endDate);
      end.setDate(end.getDate() + 1);
      return { start, end, label: value.label || '自定义' };
    }
    return { start: new Date(now.getTime() - 30 * 86_400_000), end: now, label: '近30天' };
  }

  private previousSameLengthRange(range: DateRange): DateRange {
    const duration = range.end.getTime() - range.start.getTime();
    return {
      start: new Date(range.start.getTime() - duration),
      end: new Date(range.start.getTime()),
      label: `上一${range.label}`,
    };
  }

  private createFingerprint(request: SemanticSqlRequest) {
    const normalized = JSON.stringify({
      metrics: [...request.metricKeys].sort(),
      dimensions: [...request.dimensions].sort(),
      filters: Object.keys(request.filters ?? {}).sort(),
      timeRange: request.timeRange?.preset,
      limit: this.clampLimit(request.limit),
    });
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  private createAuditId(request: SemanticSqlRequest) {
    return `ssql_${request.taskId}_${this.createFingerprint(request)}`;
  }

  private clampLimit(value: number) {
    return Math.min(Math.max(Math.trunc(Number(value) || 10), 1), MAX_LIMIT);
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') {
      return (value as any).toNumber();
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
