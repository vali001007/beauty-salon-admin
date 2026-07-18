import { Injectable } from '@nestjs/common';
import { AMI_CORE_BUSINESS_METRIC_CONTRACTS } from '../semantic-data/ami-core-business-semantic-contracts.js';
import type { SemanticQueryOutputShape } from './query-plan.types.js';

export type SemanticQueryTemplateDefinition = {
  id: string;
  title: string;
  description: string;
  capabilityIds?: string[];
  metricKeys: string[];
  requiredMetricKeys?: string[];
  defaultDimensions: string[];
  supportedOutputShapes: SemanticQueryOutputShape[];
  sourceModels: string[];
  defaultOrderBy?: Array<{ key: string; direction: 'asc' | 'desc' }>;
  defaultLimit?: number;
};

@Injectable()
export class QueryTemplateRegistryService {
  private readonly templates: SemanticQueryTemplateDefinition[] = this.withCanonicalCapabilityBindings([
    {
      id: 'order_revenue',
      title: '收银收入查询',
      description: '查询订单收入、实收、订单数、客单价和收银趋势。',
      capabilityIds: [
        'order_revenue_analysis',
        'revenue_diagnosis',
        'finance_payment_breakdown',
        'finance_risk_overview',
        'store_operations_overview',
      ],
      metricKeys: ['paid_amount', 'revenue', 'order_count', 'average_order_value', 'net_revenue'],
      defaultDimensions: ['paymentMethod'],
      supportedOutputShapes: ['summary', 'table', 'trend'],
      sourceModels: ['ProductOrder', 'PaymentRecord', 'RefundRecord'],
    },
    {
      id: 'finance_risk',
      title: '财务风险查询',
      description: '查询退款、经营成本及财务风险构成。',
      capabilityIds: ['finance_risk_overview'],
      metricKeys: ['refund_amount', 'refund_count', 'discount_amount', 'operating_cost_amount'],
      defaultDimensions: [],
      supportedOutputShapes: ['summary', 'table', 'trend'],
      sourceModels: ['RefundRecord', 'ProductOrder', 'OperatingCost'],
    },
    {
      id: 'finance_cost',
      title: '经营成本查询',
      description: '按成本类别查询门店经营成本。',
      capabilityIds: ['finance_risk_overview'],
      metricKeys: ['operating_cost_amount'],
      defaultDimensions: ['costCategory'],
      supportedOutputShapes: ['summary', 'table', 'trend'],
      sourceModels: ['OperatingCost'],
    },
    {
      id: 'order_customer_consumption_list',
      title: '消费客户清单查询',
      description: '按客户聚合指定周期内的有效消费订单，输出客户、实收金额、订单数和最近消费信息。',
      capabilityIds: ['order_customer_consumption_list'],
      metricKeys: ['paid_amount', 'order_count'],
      defaultDimensions: ['customerId', 'customerName'],
      supportedOutputShapes: ['table', 'list'],
      sourceModels: ['ProductOrder', 'PaymentRecord', 'OrderItem', 'Customer'],
      defaultOrderBy: [{ key: 'paid_amount', direction: 'desc' }],
      defaultLimit: 20,
    },
    {
      id: 'product_sales',
      title: '商品销量查询',
      description: '查询商品销量、销售额和周期增长。',
      capabilityIds: ['product_sales_ranking', 'product_sales_trend', 'finance_risk_overview'],
      metricKeys: [
        'product_sales_quantity',
        'product_sales_amount',
        'product_sales_growth',
        'product_gross_margin_rate',
        'product_below_cost_sale_count',
      ],
      defaultDimensions: ['productId', 'productName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['ProductOrder', 'OrderItem', 'RefundRecord', 'RefundItem', 'Product'],
    },
    {
      id: 'project_service',
      title: '项目服务查询',
      description: '查询项目服务次数、项目收入和增长排行。',
      capabilityIds: [
        'project_service_ranking',
        'project_business_diagnosis',
        'project_service_trend',
        'store_operations_overview',
      ],
      metricKeys: ['project_service_count', 'project_service_growth'],
      defaultDimensions: ['projectId', 'projectName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['ProductOrder', 'OrderItem', 'Project', 'CardUsageRecord'],
    },
    {
      id: 'customer_follow_up',
      title: '客户跟进查询',
      description: '查询优先跟进、流失风险和复购机会客户。',
      capabilityIds: [
        'customer_priority_recommendation',
        'customer_growth_opportunity',
        'customer_churn_risk',
        'marketing_growth_overview',
      ],
      metricKeys: ['follow_up_priority_score', 'churn_risk_score', 'repurchase_opportunity_score'],
      defaultDimensions: ['customerId', 'customerName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['CustomerOpportunity', 'Customer', 'CustomerPredictionSnapshot', 'TerminalFollowUpTask'],
    },
    {
      id: 'inventory_risk',
      title: '库存风险查询',
      description: '查询低于安全库存的商品排行。',
      capabilityIds: [
        'inventory_risk_ranking',
        'inventory_alert',
        'product_replenishment_opportunity',
        'inventory_operations_overview',
        'inventory_procurement_advice',
      ],
      metricKeys: ['stock_risk_score', 'inventory_consumption_quantity'],
      defaultDimensions: ['productId', 'productName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['Product', 'StockMovement'],
    },
    {
      id: 'member_balance',
      title: '会员余额查询',
      description: '查询会员储值余额排行。',
      capabilityIds: ['member_balance_analysis'],
      metricKeys: ['member_balance'],
      defaultDimensions: ['customerId', 'customerName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['CustomerBalanceAccount', 'Customer'],
    },
    {
      id: 'card_usage',
      title: '卡项核销查询',
      description: '查询次卡、卡项核销次数排行。',
      capabilityIds: ['card_usage_analysis'],
      metricKeys: ['card_usage_times'],
      defaultDimensions: ['cardName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['CardUsageRecord'],
    },
    {
      id: 'card_expiry',
      title: '卡项到期风险查询',
      description: '查询即将到期且仍有剩余次数的客户次卡。',
      capabilityIds: ['card_expiry_risk'],
      metricKeys: ['card_expiry_risk'],
      defaultDimensions: ['customerId', 'customerName', 'cardName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['CustomerCard', 'Customer'],
    },
    {
      id: 'staff_performance',
      title: '员工表现查询',
      description: '查询员工服务、业绩和综合表现排行。',
      capabilityIds: [
        'staff_performance_ranking',
        'beautician_service_overview',
        'store_operations_overview',
        'manager_staff_overview',
      ],
      metricKeys: [
        'staff_service_count',
        'staff_unique_customer_count',
        'staff_customer_repurchase_rate',
        'staff_commission_amount',
        'staff_performance_score',
      ],
      defaultDimensions: ['beauticianId', 'beauticianName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['Beautician', 'ServiceTask', 'Customer', 'CommissionRecord', 'BeauticianTimeOff'],
    },
    {
      id: 'customer_feedback',
      title: '客户投诉与满意度查询',
      description: '查询客户投诉、未解决投诉、平均满意度、评价采集覆盖率和美容师客诉排行。',
      capabilityIds: ['customer_feedback_overview'],
      metricKeys: [
        'customer_complaint_count',
        'customer_unresolved_complaint_count',
        'customer_average_satisfaction_rating',
        'customer_feedback_collection_coverage_rate',
      ],
      defaultDimensions: [],
      supportedOutputShapes: ['summary', 'table', 'list'],
      sourceModels: ['CustomerServiceFeedback', 'ServiceTask', 'Beautician'],
    },
    {
      id: 'customer_feedback_staff',
      title: '美容师客诉排行',
      description: '按美容师查询客户投诉数量和未解决投诉风险。',
      capabilityIds: ['customer_feedback_overview'],
      metricKeys: ['staff_customer_complaint_count'],
      defaultDimensions: ['beauticianId', 'beauticianName'],
      supportedOutputShapes: ['table', 'list'],
      sourceModels: ['CustomerServiceFeedback', 'Beautician'],
      defaultOrderBy: [{ key: 'staff_customer_complaint_count', direction: 'desc' }],
      defaultLimit: 10,
    },
    {
      id: 'customer_waiting',
      title: '客户等待与离店查询',
      description: '查询客户等待、因等待过久离店和等待记录采集覆盖率。',
      capabilityIds: ['customer_waiting_loss_overview'],
      metricKeys: ['customer_long_wait_departure_count', 'customer_waiting_collection_coverage_rate'],
      defaultDimensions: [],
      supportedOutputShapes: ['summary', 'table', 'list'],
      sourceModels: ['CustomerWaitingEpisode', 'Reservation', 'Customer'],
    },
    {
      id: 'customer_retention',
      title: '客户留存查询',
      description: '查询客户复购率和重复消费客户的平均回访间隔。',
      capabilityIds: ['customer_facts'],
      metricKeys: ['average_return_interval_days'],
      defaultDimensions: [],
      supportedOutputShapes: ['summary'],
      sourceModels: ['Customer', 'ProductOrder'],
    },
    {
      id: 'customer_reactivation',
      title: '沉睡客户唤醒迹象查询',
      description: '查询触达前满足沉睡证据、触达后出现预约、到店、消费或互动信号的客户。',
      capabilityIds: ['customer_facts'],
      metricKeys: ['dormant_reactivation_customer_count'],
      defaultDimensions: ['customerId', 'customerName'],
      supportedOutputShapes: ['summary', 'table', 'list'],
      sourceModels: [
        'Customer',
        'MarketingAutomationTouch',
        'MarketingAttribution',
        'Reservation',
        'ProductOrder',
        'CustomerPredictionSnapshot',
        'CustomerOpportunity',
      ],
    },
    {
      id: 'customer_acquisition',
      title: '新客获取与转化查询',
      description: '查询周期新增客户、周期内首单转化人数和转化率。',
      capabilityIds: ['customer_facts'],
      metricKeys: ['new_customer_count', 'new_customer_conversion_count', 'new_customer_conversion_rate'],
      defaultDimensions: [],
      supportedOutputShapes: ['summary'],
      sourceModels: ['Customer', 'ProductOrder'],
    },
    {
      id: 'reservation_schedule',
      title: '预约到店查询',
      description: '查询预约数量、到店率和时段趋势。',
      capabilityIds: ['reservation_schedule_diagnosis', 'reservation_today'],
      metricKeys: ['reservation_count', 'arrival_rate'],
      requiredMetricKeys: ['reservation_count', 'arrival_rate'],
      defaultDimensions: ['date'],
      supportedOutputShapes: ['summary', 'trend', 'table'],
      sourceModels: ['Reservation'],
    },
    {
      id: 'marketing_conversion',
      title: '营销转化查询',
      description: '查询活动曝光、线索和转化表现。',
      capabilityIds: ['marketing_conversion_diagnosis', 'marketing_effect_diagnosis'],
      metricKeys: ['campaign_conversion_rate'],
      defaultDimensions: ['campaignId', 'campaignName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['MarketingActivity', 'MarketingPageEvent', 'MarketingPageLead'],
    },
    {
      id: 'marketing_activity_list',
      title: '营销活动清单查询',
      description: '查询近期营销活动、活动草稿、已发布活动和进行中活动清单。',
      capabilityIds: ['marketing_activity_list', 'marketing_growth_execution'],
      metricKeys: ['marketing_activity_count'],
      defaultDimensions: ['campaignId', 'campaignName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['MarketingActivity', 'MarketingPage'],
      defaultOrderBy: [{ key: 'updatedAt', direction: 'desc' }],
      defaultLimit: 10,
    },
  ]);

  private withCanonicalCapabilityBindings(
    templates: SemanticQueryTemplateDefinition[],
  ): SemanticQueryTemplateDefinition[] {
    const explicitlyAssignedCapabilities = new Set(templates.flatMap((template) => template.capabilityIds ?? []));
    return templates.map((template) => {
      const canonicalCapabilities = AMI_CORE_BUSINESS_METRIC_CONTRACTS.filter((contract) =>
        template.metricKeys.includes(contract.metricKey),
      )
        .flatMap((contract) => contract.payload.bindings.capability)
        .filter(
          (capabilityId) =>
            !explicitlyAssignedCapabilities.has(capabilityId) || template.capabilityIds?.includes(capabilityId),
        );
      return {
        ...template,
        capabilityIds: [...new Set([...(template.capabilityIds ?? []), ...canonicalCapabilities])],
      };
    });
  }

  list() {
    return [...this.templates];
  }

  findById(id: string) {
    return this.templates.find((template) => template.id === id);
  }

  findByMetric(metricKey: string) {
    return this.templates.find((template) => template.metricKeys.includes(metricKey));
  }

  findByCapability(capabilityId?: string) {
    if (!capabilityId) return undefined;
    return this.templates.find((template) => template.capabilityIds?.includes(capabilityId));
  }

  findForMetrics(metricKeys: string[]) {
    return this.templates.find((template) => metricKeys.some((metricKey) => template.metricKeys.includes(metricKey)));
  }

  supportsMetric(metricKey: string) {
    return Boolean(this.findByMetric(metricKey));
  }
}
