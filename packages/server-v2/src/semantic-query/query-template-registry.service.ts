import { Injectable } from '@nestjs/common';
import type { SemanticQueryOutputShape } from './query-plan.types.js';

export type SemanticQueryTemplateDefinition = {
  id: string;
  title: string;
  description: string;
  capabilityIds?: string[];
  metricKeys: string[];
  defaultDimensions: string[];
  supportedOutputShapes: SemanticQueryOutputShape[];
  sourceModels: string[];
  defaultOrderBy?: Array<{ key: string; direction: 'asc' | 'desc' }>;
  defaultLimit?: number;
};

@Injectable()
export class QueryTemplateRegistryService {
  private readonly templates: SemanticQueryTemplateDefinition[] = [
    {
      id: 'order_revenue',
      title: '收银收入查询',
      description: '查询订单收入、实收、订单数、客单价和收银趋势。',
      capabilityIds: ['order_revenue_analysis', 'revenue_diagnosis'],
      metricKeys: ['paid_amount', 'revenue', 'order_count', 'average_order_value', 'net_revenue'],
      defaultDimensions: ['payMethod'],
      supportedOutputShapes: ['summary', 'table', 'trend'],
      sourceModels: ['ProductOrder', 'PaymentRecord', 'RefundRecord'],
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
      capabilityIds: ['product_sales_ranking', 'product_sales_trend'],
      metricKeys: ['product_sales_quantity', 'product_sales_amount', 'product_sales_growth'],
      defaultDimensions: ['productId', 'productName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['ProductOrder', 'OrderItem', 'Product'],
    },
    {
      id: 'project_service',
      title: '项目服务查询',
      description: '查询项目服务次数、项目收入和增长排行。',
      capabilityIds: ['project_business_diagnosis', 'project_service_trend'],
      metricKeys: ['project_service_count', 'project_service_growth'],
      defaultDimensions: ['projectId', 'projectName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['ProductOrder', 'OrderItem', 'Project', 'CardUsageRecord'],
    },
    {
      id: 'customer_follow_up',
      title: '客户跟进查询',
      description: '查询优先跟进、流失风险和复购机会客户。',
      capabilityIds: ['customer_priority_recommendation', 'customer_growth_opportunity', 'customer_churn_risk'],
      metricKeys: ['follow_up_priority_score', 'churn_risk_score', 'repurchase_opportunity_score'],
      defaultDimensions: ['customerId', 'customerName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['Customer', 'CustomerPredictionSnapshot', 'TerminalFollowUpTask'],
    },
    {
      id: 'inventory_risk',
      title: '库存风险查询',
      description: '查询低于安全库存的商品排行。',
      capabilityIds: ['inventory_risk_ranking', 'inventory_alert', 'product_replenishment_opportunity'],
      metricKeys: ['stock_risk_score'],
      defaultDimensions: ['productId', 'productName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['Product'],
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
      capabilityIds: ['staff_performance_ranking'],
      metricKeys: ['staff_performance_score'],
      defaultDimensions: ['beauticianId', 'beauticianName'],
      supportedOutputShapes: ['list', 'table'],
      sourceModels: ['Beautician', 'Reservation', 'ProductOrder'],
    },
    {
      id: 'reservation_schedule',
      title: '预约到店查询',
      description: '查询预约数量、到店率和时段趋势。',
      capabilityIds: ['reservation_schedule_diagnosis', 'reservation_today'],
      metricKeys: ['reservation_count', 'arrival_rate'],
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
  ];

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
