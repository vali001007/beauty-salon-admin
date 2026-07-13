import { Injectable } from '@nestjs/common';
import { BusinessOntologyRegistry } from './business-ontology.registry.js';
import type { AgentV5Intent, AgentV5RouteDecision } from '../agent-v5.types.js';

@Injectable()
export class AgentV5SemanticRouterService {
  constructor(private readonly registry: BusinessOntologyRegistry) {}

  route(message: string, context: Record<string, unknown> = {}): AgentV5RouteDecision {
    const text = String(message ?? '');
    const normalized = text.toLowerCase();
    const contextIntent = typeof context.agentV5Intent === 'string'
      ? context.agentV5Intent
      : typeof context.agentV5ClarificationSelection === 'string'
        ? context.agentV5ClarificationSelection
        : undefined;
    const concepts = this.registry.findConcepts(text);
    const conceptCodes = concepts.map((item) => item.code);
    const domains = Array.from(new Set(concepts.map((item) => item.domain)));
    const explicit = this.explicitIntent(contextIntent);
    const intent = explicit ?? this.resolveIntent(text, normalized, conceptCodes);
    const capability = this.capabilityForIntent(intent);
    const capabilityDef = this.registry.findCapabilityByCode(capability);
    const fallbackPolicy = intent === 'clarify' ? 'ask_clarification' : intent === 'readonly_query' ? 'readonly_query' : 'domain_summary';
    const missingSlots = this.missingSlots(intent, text);
    return {
      intent,
      domains: domains.length ? domains : this.domainsForIntent(intent),
      concepts: conceptCodes.length ? conceptCodes : this.conceptsForIntent(intent),
      entities: this.extractEntities(text, context),
      capabilityCandidates: [capability],
      adapterCandidates: capabilityDef ? [capabilityDef.adapter] : [],
      confidence: explicit ? 0.96 : this.confidence(intent, conceptCodes),
      riskLevel: capabilityDef?.riskLevel ?? 'read',
      missingSlots,
      fallbackPolicy: missingSlots.length ? 'ask_clarification' : fallbackPolicy,
      reason: capabilityDef ? `命中 V5 ontology capability：${capabilityDef.label}` : '未命中明确能力，进入澄清或通用问数。',
    };
  }

  private explicitIntent(value?: string): AgentV5Intent | null {
    const allowed: AgentV5Intent[] = [
      'business_overview',
      'readonly_query',
      'lifecycle_diagnosis',
      'business_plan',
      'submit_business_plan',
      'attribution_review',
      'quality_review',
      'reception_lookup',
      'cashier_reconciliation',
      'beautician_service',
      'inventory_risk',
      'finance_margin',
      'reservation_coordination',
      'staff_performance',
      'marketing_growth',
      'failure_diagnosis',
      'clarify',
    ];
    return allowed.includes(value as AgentV5Intent) ? value as AgentV5Intent : null;
  }

  private resolveIntent(message: string, normalized: string, concepts: string[]): AgentV5Intent {
    if (/提交|审批|确认/.test(message) && /计划|经营/.test(message)) return 'submit_business_plan';
    if (/为什么.*答不上|为什么.*无用|失败|无用|能力缺口|诊断/.test(message)) return 'failure_diagnosis';
    if (/归因|触达.*效果|效果.*复盘|转化|核销.*复盘/.test(message)) return 'attribution_review';
    if (/质量|规则|覆盖率|命中率|治理|回滚|发布/.test(message)) return 'quality_review';
    if (/经营计划|本周.*计划|生成.*计划|经营.*动作/.test(message)) return 'business_plan';
    if (/店里情况|门店情况|经营概览|今日总结|情况怎么样|来个总结/.test(message)) return 'business_overview';
    if (/核销|扣次|划扣|用卡|收银单|小票|充值|办卡/.test(message)) return 'cashier_reconciliation';
    if (/卡和权益|还有什么卡|手机号后四位|客户.*资料|顾客.*资料|会员.*资料/.test(message)) return 'reception_lookup';
    if (/我今天|下一个客户|护理准备|服务记录/.test(message)) return 'beautician_service';
    if (/预约|排班|今日服务|现场协调|到店/.test(message)) return 'reservation_coordination';
    if (/库存|缺货|临期|损耗|补货|采购|耗材/.test(message)) return 'inventory_risk';
    if (/毛利|利润|成本|对账|提成/.test(message)) return 'finance_margin';
    if (/员工|美容师|业绩|绩效|服务完成率/.test(message)) return 'staff_performance';
    if (/哪些客户|客户.*跟进|生命周期|护理周期|沉睡|召回|到期|领券未核销/.test(message)) return 'lifecycle_diagnosis';
    if (/活动|触达|自动化|优惠券|权益|营销/.test(message)) return 'marketing_growth';
    if (/销售|营收|营业额|订单|排行|统计|多少|趋势|同比|环比|top|TOP|退款|折扣/.test(normalized)) return 'readonly_query';
    if (concepts.includes('store_business')) return 'business_overview';
    return 'readonly_query';
  }

  private capabilityForIntent(intent: AgentV5Intent) {
    const map: Record<AgentV5Intent, string> = {
      business_overview: 'business.overview.today',
      readonly_query: 'readonly.query',
      lifecycle_diagnosis: 'lifecycle.opportunities',
      business_plan: 'lifecycle.business_plan',
      submit_business_plan: 'lifecycle.business_plan',
      attribution_review: 'marketing.attribution.review',
      quality_review: 'agent.failure.diagnosis',
      reception_lookup: 'reception.customer.lookup',
      cashier_reconciliation: 'cashier.card_usage.review',
      beautician_service: 'beautician.service.today',
      inventory_risk: 'inventory.risk.project',
      finance_margin: 'finance.margin.review',
      reservation_coordination: 'reservation.coordination.today',
      staff_performance: 'staff.performance.review',
      marketing_growth: 'marketing.growth.review',
      failure_diagnosis: 'agent.failure.diagnosis',
      clarify: 'agent.failure.diagnosis',
    };
    return map[intent];
  }

  private domainsForIntent(intent: AgentV5Intent) {
    const map: Record<AgentV5Intent, string[]> = {
      business_overview: ['business_overview'],
      readonly_query: ['order'],
      lifecycle_diagnosis: ['customer'],
      business_plan: ['customer', 'marketing'],
      submit_business_plan: ['customer', 'governance'],
      attribution_review: ['marketing'],
      quality_review: ['governance'],
      reception_lookup: ['customer'],
      cashier_reconciliation: ['order'],
      beautician_service: ['service', 'staff'],
      inventory_risk: ['inventory'],
      finance_margin: ['finance'],
      reservation_coordination: ['service'],
      staff_performance: ['staff'],
      marketing_growth: ['marketing'],
      failure_diagnosis: ['governance'],
      clarify: ['governance'],
    };
    return map[intent];
  }

  private conceptsForIntent(intent: AgentV5Intent) {
    const map: Record<AgentV5Intent, string[]> = {
      business_overview: ['store_business'],
      readonly_query: ['order'],
      lifecycle_diagnosis: ['lifecycle_opportunity'],
      business_plan: ['lifecycle_opportunity'],
      submit_business_plan: ['lifecycle_opportunity'],
      attribution_review: ['marketing_attribution'],
      quality_review: ['agent_governance'],
      reception_lookup: ['customer'],
      cashier_reconciliation: ['order'],
      beautician_service: ['reservation', 'staff_performance'],
      inventory_risk: ['inventory'],
      finance_margin: ['finance_margin'],
      reservation_coordination: ['reservation'],
      staff_performance: ['staff_performance'],
      marketing_growth: ['marketing_attribution'],
      failure_diagnosis: ['agent_governance'],
      clarify: ['agent_governance'],
    };
    return map[intent];
  }

  private missingSlots(intent: AgentV5Intent, message: string) {
    if (intent === 'submit_business_plan' && !/(计划|plan|#)\s*#?\d+/i.test(message) && !/\b\d{1,9}\b/.test(message)) return ['businessPlanId'];
    return [];
  }

  private confidence(intent: AgentV5Intent, concepts: string[]) {
    if (intent === 'readonly_query' && !concepts.length) return 0.7;
    return concepts.length ? 0.88 : 0.78;
  }

  private extractEntities(message: string, context: Record<string, unknown>) {
    const entities = [];
    const memory = context.agentV5Memory as { working?: Array<{ key?: string; value?: string; entityType?: string; entityId?: string | number }> } | undefined;
    const memoryCustomer = memory?.working?.find((item) => item.key === 'last_customer_name');
    if (memoryCustomer?.value && /(她|他|这个客户|那个客户)/.test(message)) {
      entities.push({
        type: memoryCustomer.entityType ?? 'Customer',
        id: memoryCustomer.entityId,
        name: memoryCustomer.value,
        confidence: 0.82,
        source: 'memory' as const,
      });
    }
    const customer = message.match(/([\u4e00-\u9fa5]{2,4})(今天|还有|预约|客户|顾客|会员|卡|消费|来了吗|有没有)/)?.[1];
    if (customer && !entities.some((item) => item.type === 'Customer' && item.name === customer)) {
      entities.push({ type: 'Customer', name: customer, confidence: 0.78, source: 'message' as const });
    }
    const product = message.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,20})(库存|缺货|临期|补货|耗材)/)?.[1];
    if (product && product !== customer) entities.push({ type: 'Product', name: product, confidence: 0.72, source: 'message' as const });
    const staff = message.match(/([\u4e00-\u9fa5]{2,4})(这个月|本月|今天)?(业绩|绩效|提成|服务完成率)/)?.[1];
    if (staff && staff !== customer) entities.push({ type: 'Beautician', name: staff, confidence: 0.72, source: 'message' as const });
    return entities;
  }
}
