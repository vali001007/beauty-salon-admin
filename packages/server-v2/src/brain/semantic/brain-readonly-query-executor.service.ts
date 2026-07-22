import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CompiledBrainQuery } from './brain-query-compiler.service.js';

@Injectable()
export class BrainReadonlyQueryExecutorService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(compiled: CompiledBrainQuery) {
    switch (compiled.queryKey) {
      case 'appointment_count':
        return this.executeAppointmentCount(compiled);
      case 'paid_revenue':
        return this.executePaidRevenue(compiled);
      case 'paid_revenue_comparison':
        return this.executePaidRevenueComparison(compiled);
      case 'paid_revenue_by_beautician':
        return this.executePaidRevenueByBeautician(compiled);
      case 'repurchase_rate':
        return this.executeRepurchaseRate(compiled);
      case 'gross_margin':
        return this.executeGrossMargin(compiled);
      case 'gross_margin_rate':
        return this.executeGrossMarginRate(compiled);
      case 'card_liability':
        return this.executeCardLiability(compiled);
      case 'stockout_sku_count':
        return this.executeStockoutSkuCount(compiled);
      case 'expiring_stock_value':
        return this.executeExpiringStockValue(compiled);
      case 'churn_high_risk_customer_count':
        return this.executeChurnHighRiskCustomerCount(compiled);
      default:
        throw new Error(`unsupported_metric_formula:${compiled.metric}`);
    }
  }

  private executeAppointmentCount(compiled: CompiledBrainQuery) {
    const { storeId, startDate, endDate } = compiled.filters;
    if (startDate && endDate) {
      return this.prisma.$queryRaw(
        Prisma.sql`select count(*)::int as appointment_count from "Reservation" where "storeId" = ${storeId} and "status" not in ('cancelled', 'canceled', '已取消', '取消') and "date" between ${startDate} and ${endDate}`,
      );
    }

    return this.prisma.$queryRaw(
      Prisma.sql`select count(*)::int as appointment_count from "Reservation" where "storeId" = ${storeId} and "status" not in ('cancelled', 'canceled', '已取消', '取消')`,
    );
  }

  private executePaidRevenue(compiled: CompiledBrainQuery) {
    const { storeId, startDate, endDate } = compiled.filters;
    if (startDate && endDate) {
      return this.prisma.$queryRaw(
        Prisma.sql`select coalesce(sum("netAmount"), 0)::float as paid_revenue from "ProductOrder" where "storeId" = ${storeId} and "status" not in ('cancelled', 'refunded') and "createdAt" between ${startDate} and ${endDate}`,
      );
    }

    return this.prisma.$queryRaw(
      Prisma.sql`select coalesce(sum("netAmount"), 0)::float as paid_revenue from "ProductOrder" where "storeId" = ${storeId} and "status" not in ('cancelled', 'refunded')`,
    );
  }

  private executePaidRevenueComparison(compiled: CompiledBrainQuery) {
    const comparison = compiled.comparison;
    if (!comparison) throw new Error('unsupported_metric_formula:paid_revenue_comparison');
    const { storeId } = compiled.filters;

    return this.prisma.$queryRaw(
      Prisma.sql`
        select
          coalesce(sum("netAmount") filter (where "createdAt" between ${comparison.current.startDate} and ${comparison.current.endDate}), 0)::float as current_value,
          coalesce(sum("netAmount") filter (where "createdAt" between ${comparison.previous.startDate} and ${comparison.previous.endDate}), 0)::float as previous_value,
          (
            coalesce(sum("netAmount") filter (where "createdAt" between ${comparison.current.startDate} and ${comparison.current.endDate}), 0)
            -
            coalesce(sum("netAmount") filter (where "createdAt" between ${comparison.previous.startDate} and ${comparison.previous.endDate}), 0)
          )::float as delta_value,
          (
            (
              coalesce(sum("netAmount") filter (where "createdAt" between ${comparison.current.startDate} and ${comparison.current.endDate}), 0)
              -
              coalesce(sum("netAmount") filter (where "createdAt" between ${comparison.previous.startDate} and ${comparison.previous.endDate}), 0)
            )::float
            / nullif(coalesce(sum("netAmount") filter (where "createdAt" between ${comparison.previous.startDate} and ${comparison.previous.endDate}), 0)::float, 0)
          )::float as delta_rate
        from "ProductOrder"
        where "storeId" = ${storeId}
          and "status" not in ('cancelled', 'refunded')
      `,
    );
  }

  private executePaidRevenueByBeautician(compiled: CompiledBrainQuery) {
    const { storeId, startDate, endDate } = compiled.filters;
    const limit = compiled.limit ?? 5;
    if (startDate && endDate) {
      return this.prisma.$queryRaw(
        Prisma.sql`
          select coalesce("Beautician"."name", '未分配') as dimension_label,
                 "OrderItem"."beauticianId" as dimension_id,
                 coalesce(sum("OrderItem"."netAmount"), 0)::float as paid_revenue
          from "OrderItem"
          join "ProductOrder" on "ProductOrder"."id" = "OrderItem"."orderId"
          left join "Beautician" on "Beautician"."id" = "OrderItem"."beauticianId"
          where "ProductOrder"."storeId" = ${storeId}
            and "ProductOrder"."status" not in ('cancelled', 'refunded')
            and "OrderItem"."beauticianId" is not null
            and "ProductOrder"."createdAt" between ${startDate} and ${endDate}
          group by "OrderItem"."beauticianId", "Beautician"."name"
          order by paid_revenue desc
          limit ${limit}
        `,
      );
    }

    return this.prisma.$queryRaw(
      Prisma.sql`
        select coalesce("Beautician"."name", '未分配') as dimension_label,
               "OrderItem"."beauticianId" as dimension_id,
               coalesce(sum("OrderItem"."netAmount"), 0)::float as paid_revenue
        from "OrderItem"
        join "ProductOrder" on "ProductOrder"."id" = "OrderItem"."orderId"
        left join "Beautician" on "Beautician"."id" = "OrderItem"."beauticianId"
        where "ProductOrder"."storeId" = ${storeId}
          and "ProductOrder"."status" not in ('cancelled', 'refunded')
          and "OrderItem"."beauticianId" is not null
        group by "OrderItem"."beauticianId", "Beautician"."name"
        order by paid_revenue desc
        limit ${limit}
      `,
    );
  }

  private executeRepurchaseRate(compiled: CompiledBrainQuery) {
    const { storeId, startDate, endDate } = compiled.filters;
    if (startDate && endDate) {
      return this.prisma.$queryRaw(
        Prisma.sql`
          select coalesce(count(*) filter (where order_count >= 2)::float / nullif(count(*), 0), 0)::float as repurchase_rate
          from (
            select "customerId", count(*) as order_count
            from "ProductOrder"
            where "storeId" = ${storeId}
              and "customerId" is not null
              and "status" not in ('cancelled', 'refunded')
              and "createdAt" between ${startDate} and ${endDate}
            group by "customerId"
          ) customer_orders
        `,
      );
    }

    return this.prisma.$queryRaw(
      Prisma.sql`
        select coalesce(count(*) filter (where order_count >= 2)::float / nullif(count(*), 0), 0)::float as repurchase_rate
        from (
          select "customerId", count(*) as order_count
          from "ProductOrder"
          where "storeId" = ${storeId}
            and "customerId" is not null
            and "status" not in ('cancelled', 'refunded')
          group by "customerId"
        ) customer_orders
      `,
    );
  }

  private executeGrossMargin(compiled: CompiledBrainQuery) {
    const { storeId, startDate, endDate } = compiled.filters;
    if (startDate && endDate) {
      return this.prisma.$queryRaw(
        Prisma.sql`select coalesce(sum("grossProfit"), 0)::float as gross_margin from "DailySettlement" where "storeId" = ${storeId} and "settleDate" between ${startDate} and ${endDate}`,
      );
    }

    return this.prisma.$queryRaw(
      Prisma.sql`select coalesce(sum("grossProfit"), 0)::float as gross_margin from "DailySettlement" where "storeId" = ${storeId}`,
    );
  }

  private executeGrossMarginRate(compiled: CompiledBrainQuery) {
    const { storeId, startDate, endDate } = compiled.filters;
    if (startDate && endDate) {
      return this.prisma.$queryRaw(
        Prisma.sql`select coalesce(sum("grossProfit")::float / nullif(sum("totalRevenue")::float, 0), 0)::float as gross_margin_rate from "DailySettlement" where "storeId" = ${storeId} and "settleDate" between ${startDate} and ${endDate}`,
      );
    }

    return this.prisma.$queryRaw(
      Prisma.sql`select coalesce(sum("grossProfit")::float / nullif(sum("totalRevenue")::float, 0), 0)::float as gross_margin_rate from "DailySettlement" where "storeId" = ${storeId}`,
    );
  }

  private executeCardLiability(compiled: CompiledBrainQuery) {
    const { storeId } = compiled.filters;

    return this.prisma.$queryRaw(
      Prisma.sql`
        select coalesce(sum("CustomerCard"."remainingTimes" * "CustomerCard"."recognizedUnitValue"), 0)::float as card_liability
        from "CustomerCard"
        join "Customer" on "Customer"."id" = "CustomerCard"."customerId"
        where "Customer"."storeId" = ${storeId}
          and "CustomerCard"."status" = 'active'
      `,
    );
  }

  private executeStockoutSkuCount(compiled: CompiledBrainQuery) {
    const { storeId } = compiled.filters;

    return this.prisma.$queryRaw(
      Prisma.sql`select count(*)::int as stockout_sku_count from "Product" where "storeId" = ${storeId} and "deletedAt" is null and "status" = 'active' and "safetyStock" > 0 and "currentStock" < "safetyStock"`,
    );
  }

  private executeExpiringStockValue(compiled: CompiledBrainQuery) {
    const { storeId, startDate, endDate } = compiled.filters;
    if (startDate && endDate) {
      return this.prisma.$queryRaw(
        Prisma.sql`
          select coalesce(sum(coalesce("StockBatch"."totalAmount", "StockBatch"."stock" * coalesce("StockBatch"."unitCost", "Product"."costPrice"))), 0)::float as expiring_stock_value
          from "StockBatch"
          join "Product" on "Product"."id" = "StockBatch"."productId"
          where "Product"."storeId" = ${storeId}
            and "StockBatch"."stock" > 0
            and "StockBatch"."expiryDate" is not null
            and "StockBatch"."expiryDate" between ${startDate} and ${endDate}
        `,
      );
    }

    return this.prisma.$queryRaw(
      Prisma.sql`
        select coalesce(sum(coalesce("StockBatch"."totalAmount", "StockBatch"."stock" * coalesce("StockBatch"."unitCost", "Product"."costPrice"))), 0)::float as expiring_stock_value
        from "StockBatch"
        join "Product" on "Product"."id" = "StockBatch"."productId"
        where "Product"."storeId" = ${storeId}
          and "StockBatch"."stock" > 0
          and "StockBatch"."expiryDate" is not null
          and "StockBatch"."expiryDate" <= now() + interval '30 days'
      `,
    );
  }

  private executeChurnHighRiskCustomerCount(compiled: CompiledBrainQuery) {
    const { storeId, startDate, endDate } = compiled.filters;
    if (startDate && endDate) {
      return this.prisma.$queryRaw(
        Prisma.sql`select count(*)::int as churn_high_risk_customer_count from "CustomerPredictionSnapshot" where "storeId" = ${storeId} and "churnLevel" in ('high', 'critical', '高', '高风险') and "createdAt" between ${startDate} and ${endDate}`,
      );
    }

    return this.prisma.$queryRaw(
      Prisma.sql`select count(*)::int as churn_high_risk_customer_count from "CustomerPredictionSnapshot" where "storeId" = ${storeId} and "churnLevel" in ('high', 'critical', '高', '高风险')`,
    );
  }
}
