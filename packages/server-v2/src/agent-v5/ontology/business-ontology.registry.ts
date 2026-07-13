import { Injectable } from '@nestjs/common';

export type AgentV5OntologyDomain =
  | 'business_overview'
  | 'customer'
  | 'service'
  | 'order'
  | 'inventory'
  | 'finance'
  | 'marketing'
  | 'staff'
  | 'terminal'
  | 'governance'
  | 'knowledge';

export type AgentV5OntologyConcept = {
  code: string;
  label: string;
  domain: AgentV5OntologyDomain;
  aliases: string[];
  sourceModels: string[];
  piiLevel: 'none' | 'low' | 'medium' | 'high';
};

export type AgentV5OntologyCapability = {
  code: string;
  label: string;
  domain: AgentV5OntologyDomain;
  intentExamples: string[];
  requiredConcepts: string[];
  adapter:
    | 'readonly_query'
    | 'lifecycle'
    | 'business_tool'
    | 'governance'
    | 'legacy'
    | 'reception'
    | 'cashier'
    | 'beautician'
    | 'schedule'
    | 'finance'
    | 'inventory_supply'
    | 'staff_performance'
    | 'marketing';
  tool: string;
  riskLevel: 'read' | 'draft' | 'approval_required' | 'blocked';
  evidenceRequired: boolean;
};

@Injectable()
export class BusinessOntologyRegistry {
  private readonly concepts: AgentV5OntologyConcept[] = [
    { code: 'store_business', label: '门店经营', domain: 'business_overview', aliases: ['店里情况', '经营概览', '门店情况', '今日总结', '经营总结'], sourceModels: ['ProductOrder', 'Reservation', 'CustomerOpportunity', 'StockMovement'], piiLevel: 'none' },
    { code: 'customer', label: '客户', domain: 'customer', aliases: ['客户', '顾客', '会员', '客人'], sourceModels: ['Customer', 'CustomerCard'], piiLevel: 'high' },
    { code: 'lifecycle_opportunity', label: '客户生命周期机会', domain: 'customer', aliases: ['生命周期', '机会', '跟进客户', '护理周期', '沉睡', '召回', '到期', '领券未核销'], sourceModels: ['CustomerOpportunity', 'CustomerLifecycleSnapshot'], piiLevel: 'medium' },
    { code: 'reservation', label: '预约', domain: 'service', aliases: ['预约', '排班', '到店', '今日服务', '现场协调', '服务安排'], sourceModels: ['Reservation', 'Schedule', 'ServiceTask'], piiLevel: 'medium' },
    { code: 'order', label: '收银订单', domain: 'order', aliases: ['订单', '营业额', '收入', '收银', '核销', '退款', '折扣', '客单价'], sourceModels: ['ProductOrder', 'OrderItem', 'PaymentRecord', 'RefundRecord'], piiLevel: 'medium' },
    { code: 'inventory', label: '库存', domain: 'inventory', aliases: ['库存', '缺货', '临期', '损耗', '补货', '采购', '耗材'], sourceModels: ['Product', 'StockMovement', 'ProjectBomItem'], piiLevel: 'low' },
    { code: 'finance_margin', label: '财务毛利', domain: 'finance', aliases: ['财务', '毛利', '成本', '对账', '利润', '提成'], sourceModels: ['DailySettlement', 'OperationProfit', 'CommissionRecord'], piiLevel: 'medium' },
    { code: 'marketing_attribution', label: '营销归因', domain: 'marketing', aliases: ['营销', '触达', '活动', '转化', '归因', '复盘', '自动化'], sourceModels: ['MarketingActivity', 'MarketingAutomationTouch', 'LifecycleAttributionEvent'], piiLevel: 'medium' },
    { code: 'staff_performance', label: '员工绩效', domain: 'staff', aliases: ['员工', '美容师', '绩效', '业绩', '工时'], sourceModels: ['User', 'Beautician', 'CommissionRecord'], piiLevel: 'medium' },
    { code: 'agent_governance', label: 'Agent 治理', domain: 'governance', aliases: ['为什么答不上', '无用', '失败', '能力', '治理', '发布', '评测'], sourceModels: ['AgentRun', 'AgentApproval'], piiLevel: 'none' },
  ];

  private readonly capabilities: AgentV5OntologyCapability[] = [
    { code: 'business.overview.today', label: '今日经营概览', domain: 'business_overview', intentExamples: ['今天店里情况怎么样', '给我门店经营总结'], requiredConcepts: ['store_business'], adapter: 'business_tool', tool: 'business.overview', riskLevel: 'read', evidenceRequired: true },
    { code: 'readonly.query', label: '事实问数', domain: 'order', intentExamples: ['今天营业额多少', '这个月退款几笔'], requiredConcepts: ['order'], adapter: 'readonly_query', tool: 'agent_v3.controlled_text_to_sql', riskLevel: 'read', evidenceRequired: true },
    { code: 'lifecycle.opportunities', label: '生命周期机会诊断', domain: 'customer', intentExamples: ['本周哪些客户该跟进', '哪些客户护理周期到期'], requiredConcepts: ['lifecycle_opportunity'], adapter: 'lifecycle', tool: 'lifecycle.diagnoseOpportunities', riskLevel: 'read', evidenceRequired: true },
    { code: 'lifecycle.business_plan', label: '生命周期经营计划', domain: 'customer', intentExamples: ['生成本周经营计划', '提交经营计划审批'], requiredConcepts: ['lifecycle_opportunity'], adapter: 'lifecycle', tool: 'lifecycle.businessPlan', riskLevel: 'approval_required', evidenceRequired: true },
    { code: 'marketing.attribution.review', label: '营销归因复盘', domain: 'marketing', intentExamples: ['最近一次触达效果怎么样', '活动转化如何'], requiredConcepts: ['marketing_attribution'], adapter: 'lifecycle', tool: 'lifecycle.reviewAttribution', riskLevel: 'read', evidenceRequired: true },
    { code: 'reception.customer.lookup', label: '前台客户查询', domain: 'customer', intentExamples: ['这个客户还有什么卡和权益', '按手机号后四位查客户资料'], requiredConcepts: ['customer'], adapter: 'reception', tool: 'reception.customer.lookup', riskLevel: 'read', evidenceRequired: true },
    { code: 'cashier.card_usage.review', label: '收银核销复盘', domain: 'order', intentExamples: ['这笔核销是否正常', '今天扣次和收银单对得上吗'], requiredConcepts: ['order', 'customer'], adapter: 'cashier', tool: 'cashier.cardUsageReview', riskLevel: 'read', evidenceRequired: true },
    { code: 'beautician.service.today', label: '美容师今日服务', domain: 'service', intentExamples: ['我今天下一个客户要准备什么', '今天护理服务重点'], requiredConcepts: ['reservation', 'staff_performance'], adapter: 'beautician', tool: 'beautician.serviceToday', riskLevel: 'read', evidenceRequired: true },
    { code: 'inventory.risk.project', label: '库存与项目风险', domain: 'inventory', intentExamples: ['哪些商品库存风险会影响服务', '哪些耗材不足'], requiredConcepts: ['inventory'], adapter: 'inventory_supply', tool: 'inventory.projectRisk', riskLevel: 'read', evidenceRequired: true },
    { code: 'finance.margin.review', label: '财务毛利分析', domain: 'finance', intentExamples: ['这个月哪些项目毛利低', '成本和毛利怎么样'], requiredConcepts: ['finance_margin'], adapter: 'finance', tool: 'finance.margin', riskLevel: 'read', evidenceRequired: true },
    { code: 'reservation.coordination.today', label: '今日预约现场协调', domain: 'service', intentExamples: ['今天哪些预约要重点盯', '今日服务安排'], requiredConcepts: ['reservation'], adapter: 'schedule', tool: 'reservation.coordination', riskLevel: 'read', evidenceRequired: true },
    { code: 'staff.performance.review', label: '员工业绩诊断', domain: 'staff', intentExamples: ['美容师本月业绩怎么样', '员工服务完成率'], requiredConcepts: ['staff_performance'], adapter: 'staff_performance', tool: 'staff.performanceReview', riskLevel: 'read', evidenceRequired: true },
    { code: 'marketing.growth.review', label: '营销增长诊断', domain: 'marketing', intentExamples: ['活动触达效果怎么样', '优惠券转化如何'], requiredConcepts: ['marketing_attribution'], adapter: 'marketing', tool: 'marketing.growthReview', riskLevel: 'read', evidenceRequired: true },
    { code: 'agent.failure.diagnosis', label: 'Agent 失败诊断', domain: 'governance', intentExamples: ['为什么这个问题答不上来', '这个回答为什么无用'], requiredConcepts: ['agent_governance'], adapter: 'governance', tool: 'agent.failureDiagnosis', riskLevel: 'read', evidenceRequired: true },
  ];

  listConcepts() {
    return this.concepts;
  }

  listCapabilities() {
    return this.capabilities;
  }

  findConcepts(message: string) {
    return this.concepts.filter((concept) => concept.aliases.some((alias) => message.includes(alias)));
  }

  findCapabilityByCode(code: string) {
    return this.capabilities.find((capability) => capability.code === code) ?? null;
  }
}
