import { Injectable } from '@nestjs/common';

interface SemanticQueryIntent {
  metrics: string[];
  dimensions: string[];
  filters: Array<{ field: string; op: 'eq' | 'between' | 'in'; value: unknown }>;
  storeId: number;
  permissions: string[];
}

interface MetricSqlDefinition {
  requiredPermission: string;
  label: string;
  definition: string;
  selectSql: string;
  fromSql: string;
  dateColumn?: string;
}

const METRIC_SQL: Record<string, MetricSqlDefinition> = {
  appointment_count: {
    requiredPermission: 'core:store:reservations',
    label: '预约数',
    definition: '按当前门店过滤的预约记录数量',
    selectSql: 'count(*)::int as appointment_count',
    fromSql: 'from "Reservation"',
    dateColumn: '"date"',
  },
  repurchase_rate: {
    requiredPermission: 'core:customer:view',
    label: '复购率',
    definition: '当前门店有复购订单客户占有消费客户的比例',
    selectSql: '0::float as repurchase_rate',
    fromSql: 'from "Customer"',
    dateColumn: '"createdAt"',
  },
  paid_revenue: {
    requiredPermission: 'core:finance:view',
    label: '实收流水',
    definition: '当前门店订单实收金额汇总，退款口径由后续指标版本细化',
    selectSql: '0::float as paid_revenue',
    fromSql: 'from "ProductOrder"',
    dateColumn: '"createdAt"',
  },
  gross_margin: {
    requiredPermission: 'core:operation-profit:view',
    label: '毛利额',
    definition: '当前门店经营利润模块沉淀的毛利额口径',
    selectSql: '0::float as gross_margin',
    fromSql: 'from "OperationCost"',
    dateColumn: '"createdAt"',
  },
  gross_margin_rate: {
    requiredPermission: 'core:operation-profit:view',
    label: '毛利率',
    definition: '当前门店经营利润模块沉淀的毛利率口径',
    selectSql: '0::float as gross_margin_rate',
    fromSql: 'from "OperationCost"',
    dateColumn: '"createdAt"',
  },
  card_liability: {
    requiredPermission: 'core:prepaid-liability:view',
    label: '次卡/储值负债',
    definition: '当前门店会员资产和次卡未履约负债汇总',
    selectSql: '0::float as card_liability',
    fromSql: 'from "MemberCard"',
    dateColumn: '"createdAt"',
  },
  stockout_sku_count: {
    requiredPermission: 'core:inventory:stock',
    label: '缺货 SKU 数',
    definition: '当前门店库存量小于等于 0 的 SKU 数量',
    selectSql: '0::int as stockout_sku_count',
    fromSql: 'from "Product"',
    dateColumn: '"createdAt"',
  },
  expiring_stock_value: {
    requiredPermission: 'core:inventory:expiry',
    label: '临期库存金额',
    definition: '当前门店临期批次库存金额汇总',
    selectSql: '0::float as expiring_stock_value',
    fromSql: 'from "StockBatch"',
    dateColumn: '"createdAt"',
  },
  marketing_roi: {
    requiredPermission: 'core:marketing:analytics',
    label: '营销 ROI',
    definition: '当前门店营销活动归因收益与成本比',
    selectSql: '0::float as marketing_roi',
    fromSql: 'from "MarketingCampaign"',
    dateColumn: '"createdAt"',
  },
  churn_high_risk_customer_count: {
    requiredPermission: 'core:marketing:analytics',
    label: '高流失风险客户数',
    definition: '当前门店预测快照中高流失风险客户数量',
    selectSql: '0::int as churn_high_risk_customer_count',
    fromSql: 'from "CustomerPredictionSnapshot"',
    dateColumn: '"createdAt"',
  },
};

export interface CompiledBrainQuery {
  sql: string;
  params: unknown[];
  citations: Array<{ sourceType: string; sourceId: string; label: string; definition: string }>;
}

@Injectable()
export class BrainQueryCompilerService {
  compile(intent: SemanticQueryIntent): CompiledBrainQuery {
    const metric = intent.metrics[0];
    const definition = METRIC_SQL[metric];
    if (!definition) {
      throw new Error(`unsupported_metric:${metric}`);
    }

    if (!intent.permissions.includes('*') && !intent.permissions.includes(definition.requiredPermission)) {
      throw new Error(`missing_permission:${definition.requiredPermission}`);
    }

    const params: unknown[] = [intent.storeId];
    const clauses = ['"storeId" = $1'];
    const dateFilter = intent.filters.find((filter) => filter.field === 'date' && filter.op === 'between');
    if (definition.dateColumn && dateFilter && Array.isArray(dateFilter.value) && dateFilter.value.length === 2) {
      params.push(dateFilter.value[0], dateFilter.value[1]);
      clauses.push(`${definition.dateColumn} between $2::timestamp and $3::timestamp`);
    }

    return {
      sql: `select ${definition.selectSql} ${definition.fromSql} where ${clauses.join(' and ')}`,
      params,
      citations: [{ sourceType: 'metric', sourceId: metric, label: definition.label, definition: definition.definition }],
    };
  }
}
