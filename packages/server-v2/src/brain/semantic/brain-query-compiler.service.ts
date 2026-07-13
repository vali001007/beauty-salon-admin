import { Injectable } from '@nestjs/common';

interface SemanticQueryIntent {
  metrics: string[];
  dimensions: string[];
  filters: Array<{ field: string; op: 'eq' | 'between' | 'in'; value: unknown }>;
  storeId: number;
  permissions: string[];
  answerShape?: 'scalar_metric' | 'comparison' | 'ranking' | 'list';
  groupBy?: 'beautician' | 'project' | 'customer';
  limit?: number;
}

interface MetricSqlDefinition {
  requiredPermission: string;
  label: string;
  definition: string;
  queryKey?: string;
  valueField: string;
  sqlPreview?: string;
  unsupportedReason?: string;
  dateColumn?: string;
  rejectDateFilter?: boolean;
}

const METRIC_SQL: Record<string, MetricSqlDefinition> = {
  appointment_count: {
    requiredPermission: 'core:store:reservations',
    label: '预约数',
    definition: '按当前门店过滤且排除已取消状态的预约记录数量',
    queryKey: 'appointment_count',
    valueField: 'appointment_count',
    sqlPreview:
      'select count(*)::int as appointment_count from "Reservation" where "storeId" = $1 and "status" not in (\'cancelled\', \'canceled\', \'已取消\', \'取消\')',
    dateColumn: '"date"',
  },
  repurchase_rate: {
    requiredPermission: 'core:customer:view',
    label: '复购率',
    definition: '当前门店有复购订单客户占有消费客户的比例',
    queryKey: 'repurchase_rate',
    valueField: 'repurchase_rate',
    sqlPreview:
      'select coalesce(count(*) filter (where order_count >= 2)::float / nullif(count(*), 0), 0)::float as repurchase_rate from (select "customerId", count(*) as order_count from "ProductOrder" where "storeId" = $1 and "customerId" is not null and "status" not in (\'cancelled\', \'refunded\') group by "customerId") customer_orders',
    dateColumn: '"createdAt"',
  },
  paid_revenue: {
    requiredPermission: 'core:finance:view',
    label: '实收流水',
    definition: '当前门店订单实收金额汇总，退款口径由后续指标版本细化',
    queryKey: 'paid_revenue',
    valueField: 'paid_revenue',
    sqlPreview:
      'select coalesce(sum("netAmount"), 0)::float as paid_revenue from "ProductOrder" where "storeId" = $1 and "status" not in (\'cancelled\', \'refunded\')',
    dateColumn: '"createdAt"',
  },
  gross_margin: {
    requiredPermission: 'core:operation-profit:view',
    label: '毛利额',
    definition: '当前门店经营利润模块沉淀的毛利额口径',
    queryKey: 'gross_margin',
    valueField: 'gross_margin',
    sqlPreview: 'select coalesce(sum("grossProfit"), 0)::float as gross_margin from "DailySettlement" where "storeId" = $1',
    dateColumn: '"settleDate"',
  },
  gross_margin_rate: {
    requiredPermission: 'core:operation-profit:view',
    label: '毛利率',
    definition: '当前门店经营利润模块沉淀的毛利率口径',
    queryKey: 'gross_margin_rate',
    valueField: 'gross_margin_rate',
    sqlPreview:
      'select coalesce(sum("grossProfit")::float / nullif(sum("totalRevenue")::float, 0), 0)::float as gross_margin_rate from "DailySettlement" where "storeId" = $1',
    dateColumn: '"settleDate"',
  },
  card_liability: {
    requiredPermission: 'core:prepaid-liability:view',
    label: '次卡/储值负债',
    definition: '当前门店会员资产和次卡未履约负债汇总',
    queryKey: 'card_liability',
    valueField: 'card_liability',
    sqlPreview:
      'select coalesce(sum("CustomerCard"."remainingTimes" * "CustomerCard"."recognizedUnitValue"), 0)::float as card_liability from "CustomerCard" join "Customer" on "Customer"."id" = "CustomerCard"."customerId" where "Customer"."storeId" = $1 and "CustomerCard"."status" = \'active\'',
    rejectDateFilter: true,
  },
  stockout_sku_count: {
    requiredPermission: 'core:inventory:stock',
    label: '低库存 SKU 数',
    definition: '当前门店安全库存大于 0 且当前库存低于安全库存的 SKU 数量',
    queryKey: 'stockout_sku_count',
    valueField: 'stockout_sku_count',
    sqlPreview:
      'select count(*)::int as stockout_sku_count from "Product" where "storeId" = $1 and "deletedAt" is null and "status" = \'active\' and "safetyStock" > 0 and "currentStock" < "safetyStock"',
  },
  expiring_stock_value: {
    requiredPermission: 'core:inventory:expiry',
    label: '临期库存金额',
    definition: '当前门店临期批次库存金额汇总',
    queryKey: 'expiring_stock_value',
    valueField: 'expiring_stock_value',
    sqlPreview:
      'select coalesce(sum(coalesce("StockBatch"."totalAmount", "StockBatch"."stock" * coalesce("StockBatch"."unitCost", "Product"."costPrice"))), 0)::float as expiring_stock_value from "StockBatch" join "Product" on "Product"."id" = "StockBatch"."productId" where "Product"."storeId" = $1 and "StockBatch"."stock" > 0 and "StockBatch"."expiryDate" is not null and "StockBatch"."expiryDate" <= now() + interval \'30 days\'',
    dateColumn: '"StockBatch"."expiryDate"',
  },
  marketing_roi: {
    requiredPermission: 'core:marketing:analytics',
    label: '营销 ROI',
    definition: '当前门店营销活动归因收益与成本比',
    valueField: 'marketing_roi',
    unsupportedReason: '当前 schema 缺少门店级活动成本口径，不能返回估算 ROI。',
  },
  churn_high_risk_customer_count: {
    requiredPermission: 'core:marketing:analytics',
    label: '高流失风险客户数',
    definition: '当前门店预测快照中高流失风险客户数量',
    queryKey: 'churn_high_risk_customer_count',
    valueField: 'churn_high_risk_customer_count',
    sqlPreview:
      'select count(*)::int as churn_high_risk_customer_count from "CustomerPredictionSnapshot" where "storeId" = $1 and "churnLevel" in (\'high\', \'critical\', \'高\', \'高风险\')',
    dateColumn: '"createdAt"',
  },
};

export interface CompiledBrainQuery {
  metric: string;
  queryKey: string;
  sql: string;
  params: unknown[];
  filters: { storeId: number; startDate?: Date; endDate?: Date };
  label: string;
  valueField: string;
  answerShape?: 'scalar_metric' | 'comparison' | 'ranking' | 'list';
  comparison?: {
    current: { startDate: Date; endDate: Date };
    previous: { startDate: Date; endDate: Date };
  };
  groupBy?: 'beautician' | 'project' | 'customer';
  limit?: number;
  citations: Array<{ sourceType: string; sourceId: string; label: string; definition: string }>;
}

@Injectable()
export class BrainQueryCompilerService {
  getRequiredPermission(metric: string) {
    const definition = METRIC_SQL[metric];
    return definition?.requiredPermission;
  }

  compile(intent: SemanticQueryIntent): CompiledBrainQuery {
    const metric = intent.metrics[0];
    const definition = METRIC_SQL[metric];
    if (!definition) {
      throw new Error(`unsupported_metric:${metric}`);
    }

    if (!intent.permissions.includes('*') && !intent.permissions.includes(definition.requiredPermission)) {
      throw new Error(`missing_permission:${definition.requiredPermission}`);
    }

    const groupedQuery = this.compileGroupedQuery(intent, metric, definition);
    if (groupedQuery) return groupedQuery;

    const comparisonQuery = this.compileComparisonQuery(intent, metric, definition);
    if (comparisonQuery) return comparisonQuery;

    if (!definition.queryKey || !definition.sqlPreview || definition.unsupportedReason) {
      throw new Error(`unsupported_metric_formula:${metric}`);
    }

    const params: unknown[] = [intent.storeId];
    const filters: CompiledBrainQuery['filters'] = { storeId: intent.storeId };
    const dateFilter = intent.filters.find((filter) => filter.field === 'date' && filter.op === 'between');
    if (definition.rejectDateFilter && dateFilter) {
      throw new Error(`unsupported_metric_formula:${metric}_period`);
    }
    if (definition.dateColumn && dateFilter && Array.isArray(dateFilter.value) && dateFilter.value.length === 2) {
      filters.startDate = new Date(String(dateFilter.value[0]));
      filters.endDate = new Date(String(dateFilter.value[1]));
      params.push(filters.startDate.toISOString(), filters.endDate.toISOString());
    }

    return {
      metric,
      queryKey: definition.queryKey,
      sql: `${definition.sqlPreview}${this.buildDatePreviewClause(definition.dateColumn, params.length)}`,
      params,
      filters,
      label: definition.label,
      valueField: definition.valueField,
      answerShape: intent.answerShape ?? 'scalar_metric',
      citations: [{ sourceType: 'metric', sourceId: metric, label: definition.label, definition: definition.definition }],
    };
  }

  private compileGroupedQuery(
    intent: SemanticQueryIntent,
    metric: string,
    definition: MetricSqlDefinition,
  ): CompiledBrainQuery | undefined {
    if (metric !== 'paid_revenue' || intent.answerShape !== 'ranking' || intent.groupBy !== 'beautician') {
      return undefined;
    }

    const params: unknown[] = [intent.storeId];
    const filters: CompiledBrainQuery['filters'] = { storeId: intent.storeId };
    const dateFilter = intent.filters.find((filter) => filter.field === 'date' && filter.op === 'between');
    if (dateFilter && Array.isArray(dateFilter.value) && dateFilter.value.length === 2) {
      filters.startDate = new Date(String(dateFilter.value[0]));
      filters.endDate = new Date(String(dateFilter.value[1]));
      params.push(filters.startDate.toISOString(), filters.endDate.toISOString());
    }

    const dateClause = params.length >= 3 ? ' and "ProductOrder"."createdAt" between $2::timestamp and $3::timestamp' : '';
    return {
      metric,
      queryKey: 'paid_revenue_by_beautician',
      sql: `select coalesce("Beautician"."name", '未分配') as dimension_label, "OrderItem"."beauticianId" as dimension_id, coalesce(sum("OrderItem"."netAmount"), 0)::float as paid_revenue from "OrderItem" join "ProductOrder" on "ProductOrder"."id" = "OrderItem"."orderId" left join "Beautician" on "Beautician"."id" = "OrderItem"."beauticianId" where "ProductOrder"."storeId" = $1 and "ProductOrder"."status" not in ('cancelled', 'refunded') and "OrderItem"."beauticianId" is not null${dateClause} group by "OrderItem"."beauticianId", "Beautician"."name" order by paid_revenue desc limit ${Math.min(Math.max(intent.limit ?? 5, 1), 20)}`,
      params,
      filters,
      label: '员工业绩排行',
      valueField: definition.valueField,
      answerShape: 'ranking',
      groupBy: 'beautician',
      limit: Math.min(Math.max(intent.limit ?? 5, 1), 20),
      citations: [{ sourceType: 'metric', sourceId: metric, label: definition.label, definition: definition.definition }],
    };
  }

  private compileComparisonQuery(
    intent: SemanticQueryIntent,
    metric: string,
    definition: MetricSqlDefinition,
  ): CompiledBrainQuery | undefined {
    if (metric !== 'paid_revenue' || intent.answerShape !== 'comparison') {
      return undefined;
    }

    const currentFilter = intent.filters.find((filter) => filter.field === 'date' && filter.op === 'between');
    const previousFilter = intent.filters.find((filter) => filter.field === 'previous_date' && filter.op === 'between');
    if (!currentFilter || !previousFilter || !Array.isArray(currentFilter.value) || !Array.isArray(previousFilter.value)) {
      throw new Error('unsupported_metric_formula:paid_revenue_comparison');
    }

    const current = {
      startDate: new Date(String(currentFilter.value[0])),
      endDate: new Date(String(currentFilter.value[1])),
    };
    const previous = {
      startDate: new Date(String(previousFilter.value[0])),
      endDate: new Date(String(previousFilter.value[1])),
    };

    return {
      metric,
      queryKey: 'paid_revenue_comparison',
      sql:
        'select current_value, previous_value, delta_value, delta_rate from "ProductOrder" where "storeId" = $1 and "status" not in (\'cancelled\', \'refunded\')',
      params: [
        intent.storeId,
        current.startDate.toISOString(),
        current.endDate.toISOString(),
        previous.startDate.toISOString(),
        previous.endDate.toISOString(),
      ],
      filters: { storeId: intent.storeId },
      label: definition.label,
      valueField: 'current_value',
      answerShape: 'comparison',
      comparison: { current, previous },
      citations: [{ sourceType: 'metric', sourceId: metric, label: definition.label, definition: definition.definition }],
    };
  }

  private buildDatePreviewClause(dateColumn: string | undefined, paramCount: number) {
    if (!dateColumn || paramCount < 3) return '';
    return ` and ${dateColumn} between $2::timestamp and $3::timestamp`;
  }
}
