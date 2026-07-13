import { Injectable } from '@nestjs/common';
import type { AgentEvidence, AgentPlan, AgentToolResult } from './agent.types.js';

export type AgentResponseSafetyViolation = {
  path: string;
  matched: string;
  text: string;
};

type InspectResult = {
  passed: boolean;
  violations: AgentResponseSafetyViolation[];
};

const INTERNAL_DISPLAY_PATTERNS: RegExp[] = [
  /(?:保证|一定|100%|彻底)(?:治愈|根治|祛除|见效|改善)/,
  /(?:治疗|治愈|根治)(?:痘痘|痤疮|皮炎|湿疹|过敏|红血丝|斑|色斑|皱纹|毛囊炎)/,
  /诊断(?:为|是)?(?:痤疮|皮炎|湿疹|过敏|毛囊炎)/,
  /\b(recommended|opportunity|urgent)\b/i,
  /\b(today|yesterday|tomorrow|this_week|last_week|next_week|this_month|last_month|next_month|last_7_days|last_30_days|recent_30_days|previous_30_days)\b/i,
  /\b(timeRange|limit|scope|storeId|customerSegment|runId|toolPlan|capabilityId|targetType|role|operatorId|userId|deviceId|beauticianId|mode|objective)\s*=/i,
  /\b(CustomerPredictionSnapshot|PredictionSnapshot|TerminalFollowUpTask|FollowUpTask|CustomerCard|CustomerBalanceAccount|CustomerBalanceTransaction)\b/,
  /\b(ProductOrder|OrderItem|CommissionRecord|RefundRecord|TerminalDevice|MarketingAttribution|DailySettlement)\b/,
  /\b(CustomerAppIdentity|CustomerAppEvent|MarketingAutomationExecution|MarketingPageAttribution|MarketingAutomationTouch)\b/,
  /\b(UserStore|StockBatch|SupplyCatalogMapping|PurchaseOrder|SmartSchedulingRun|BeauticianAvailability|BeauticianTimeOff)\b/,
  /\b(product_sales_amount|product_sales_growth|follow_up_priority_score|staff_performance_score)\b/i,
  /\b(customer_growth_opportunity|terminal_failure_rate|stock_risk_score|member_balance)\b/i,
  /\b(marketing:activity:\d+|agent:tool:[a-z0-9_.-]+|business-query:[a-z0-9_-]+)\b/i,
];

const DISPLAY_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/(?:保证|一定|100%|彻底)(?:治愈|根治|祛除|见效|改善)/g, '建议先做护理观察'],
  [/(?:治疗|治愈|根治)(痘痘|痤疮|皮炎|湿疹|过敏|红血丝|斑|色斑|皱纹|毛囊炎)/g, '针对$1做非医疗护理建议'],
  [/诊断(?:为|是)?(痤疮|皮炎|湿疹|过敏|毛囊炎)/g, '观察到$1相关不适表现'],
  [/\brecommended\b/gi, '建议优先跟进'],
  [/\bopportunity\b/gi, '可培育机会'],
  [/\burgent\b/gi, '需立即跟进'],
  [/\bhigh\b/gi, '高'],
  [/\bmedium\b/gi, '中'],
  [/\blow\b/gi, '低'],
  [/follow_up_priority_score/gi, '客户跟进优先评分'],
  [/product_sales_amount/gi, '商品销售额'],
  [/product_sales_growth/gi, '商品销量增长'],
  [/staff_performance_score/gi, '员工表现评分'],
  [/terminal_failure_rate/gi, '终端失败率'],
  [/customer_growth_opportunity/gi, '客户增长机会'],
  [/stock_risk_score/gi, '库存风险评分'],
  [/member_balance/gi, '会员卡余额'],
  [/CustomerPredictionSnapshot/g, '客户流失与复购预测'],
  [/CustomerBalanceTransaction/g, '会员卡流水'],
  [/CustomerBalanceAccount/g, '会员卡账户'],
  [/CustomerCard/g, '客户卡项'],
  [/PredictionSnapshot/g, '客户预测'],
  [/TerminalFollowUpTask/g, '终端跟进任务'],
  [/FollowUpTask/g, '跟进任务'],
  [/ProductOrder/g, '订单'],
  [/OrderItem/g, '订单明细'],
  [/CommissionRecord/g, '提成记录'],
  [/RefundRecord/g, '退款记录'],
  [/TerminalDevice/g, '终端设备'],
  [/TerminalConversation/g, '终端会话'],
  [/MarketingAttribution/g, '营销归因'],
  [/MarketingAutomationTouch/g, '营销自动化触达'],
  [/MarketingAutomationStrategy/g, '营销自动化策略'],
  [/CustomerAppIdentity/g, '客户小程序身份'],
  [/CustomerAppEvent/g, '客户小程序行为'],
  [/MarketingAutomationExecution/g, '营销自动化执行'],
  [/MarketingPageAttribution/g, '推广页成交归因'],
  [/MarketingPageLead/g, '推广页线索'],
  [/MarketingPageEvent/g, '推广页事件'],
  [/MarketingPage/g, '推广页'],
  [/MarketingActivity/g, '营销活动'],
  [/CardUsageRecord/g, '次卡核销记录'],
  [/StockMovement/g, '库存流水'],
  [/StockBatch/g, '库存批次'],
  [/ProjectBomItem/g, '项目耗材配置'],
  [/DailySettlement/g, '日结算'],
  [/AgentApproval/g, '待确认动作'],
  [/SupplyCatalogMapping/g, '平台供货映射'],
  [/PurchaseOrder/g, '采购单'],
  [/ProcurementOrderItem/g, '平台采购单明细'],
  [/ProcurementOrder/g, '平台采购单'],
  [/SupplySettlement/g, '供应商结算'],
  [/SupplySupplier/g, '供应商'],
  [/ServiceTask/g, '服务任务'],
  [/SmartSchedulingRun/g, '智能排班记录'],
  [/BeauticianAvailability/g, '美容师可约时段'],
  [/BeauticianTimeOff/g, '美容师请假'],
  [/Beautician/g, '美容师'],
  [/Reservation/g, '预约'],
  [/Schedule/g, '排班'],
  [/Customer/g, '客户'],
  [/Project/g, '项目'],
  [/Product/g, '商品'],
  [/Store/g, '门店'],
  [/UserStore/g, '账号门店关系'],
  [/timeRange=([^；,，\s]+)/gi, '统计周期：$1'],
  [/limit=(\d+)/gi, '最多返回 $1 条'],
  [/scope=([^；,，\s]+)/gi, '范围：$1'],
  [/storeId=当前门店/gi, '当前门店'],
  [/customerSegment=([^；,，\s]+)/gi, '客户分组：$1'],
  [/role=beautician/gi, '美容师本人范围'],
  [/role=manager/gi, '店长权限范围'],
  [/role=reception/gi, '前台权限范围'],
  [/operatorId=当前用户/gi, '当前账号'],
  [/operatorId=\d+/gi, '当前账号'],
  [/userId=\d+/gi, '当前账号'],
  [/deviceId=\d+/gi, '当前终端'],
  [/beauticianId=当前登录用户映射/gi, '当前登录美容师'],
  [/beauticianId=全部/gi, '全部美容师'],
  [/beauticianId=\d+/gi, '指定美容师'],
  [/mode=([^；,，\s]+)/gi, '执行模式：$1'],
  [/objective=([^；,，\s]+)/gi, '目标：$1'],
  [/\btoday\b/gi, '今天'],
  [/\byesterday\b/gi, '昨天'],
  [/\btomorrow\b/gi, '明天'],
  [/\bthis_week\b/gi, '本周'],
  [/\blast_week\b/gi, '上周'],
  [/\bnext_week\b/gi, '下周'],
  [/\bthis_month\b/gi, '本月'],
  [/\blast_month\b/gi, '上月'],
  [/\bnext_month\b/gi, '下月'],
  [/\blast_7_days\b/gi, '近 7 天'],
  [/\blast_30_days\b/gi, '近 30 天'],
  [/\brecent_30_days\b/gi, '近 30 天'],
  [/\bprevious_30_days\b/gi, '前 30 天'],
  [/marketing:activity:\d+/gi, '营销活动'],
  [/agent:tool:[a-z0-9_.-]+/gi, 'Agent 动作'],
  [/business-query:[a-z0-9_-]+/gi, '经营问数动作'],
];

@Injectable()
export class AgentResponseSafetyService {
  sanitizeToolResult(result: AgentToolResult): AgentToolResult {
    return {
      ...result,
      title: this.normalizeDisplayText(result.title),
      summary: this.normalizeDisplayText(result.summary),
      data: this.sanitizeDisplayValue(result.data),
      evidence: result.evidence ? this.sanitizeEvidence(result.evidence) : result.evidence,
      actions: result.actions?.map((action) => ({
        ...action,
        label: this.normalizeDisplayText(action.label),
      })),
    };
  }

  inspectToolResultDisplay(result: AgentToolResult): InspectResult {
    return this.inspectTextEntries({
      title: result.title,
      summary: result.summary,
      'data': this.collectDataTextEntries(result.data),
      'evidence.source': result.evidence?.source?.join('；'),
      'evidence.dateRange': result.evidence?.dateRange,
      'evidence.metricDefinition': result.evidence?.metricDefinition,
      'evidence.filters': result.evidence?.filters?.join('；'),
      'evidence.limitations': result.evidence?.limitations?.join('；'),
      'actions.labels': result.actions?.map((action) => action.label).join('；'),
    });
  }

  inspectPlanDisplay(plan: AgentPlan | undefined): InspectResult {
    if (!plan) return { passed: true, violations: [] };
    return this.inspectTextEntries({
      goal: plan.goal,
      clarificationQuestion: plan.clarificationQuestion,
      capabilityReason: plan.capabilityPlan?.reason,
    });
  }

  inspectTextEntries(entries: Record<string, unknown>): InspectResult {
    const violations: AgentResponseSafetyViolation[] = [];
    for (const [path, value] of Object.entries(entries)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      for (const pattern of INTERNAL_DISPLAY_PATTERNS) {
        const matched = value.match(pattern)?.[0];
        if (matched) {
          violations.push({ path, matched, text: value });
        }
      }
    }
    return { passed: violations.length === 0, violations };
  }

  normalizeDisplayText(text: string): string {
    return DISPLAY_TEXT_REPLACEMENTS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
  }

  private sanitizeEvidence(evidence: AgentEvidence): AgentEvidence {
    return {
      ...evidence,
      source: Array.isArray(evidence.source) ? evidence.source.map((source) => this.normalizeDisplayText(source)) : [],
      dateRange: evidence.dateRange ? this.normalizeDisplayText(evidence.dateRange) : evidence.dateRange,
      metricDefinition: this.normalizeDisplayText(evidence.metricDefinition),
      filters: Array.isArray(evidence.filters) ? evidence.filters.map((filter) => this.normalizeDisplayText(filter)) : [],
      limitations: evidence.limitations?.map((limitation) => this.normalizeDisplayText(limitation)),
    };
  }

  private sanitizeDisplayValue(value: unknown): unknown {
    if (typeof value === 'string') return this.normalizeDisplayText(value);
    if (Array.isArray(value)) return value.map((item) => this.sanitizeDisplayValue(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.sanitizeDisplayValue(item)]));
  }

  private collectDataTextEntries(value: unknown): string {
    const entries: string[] = [];
    this.collectDisplayText(value, entries);
    return entries.join('；');
  }

  private collectDisplayText(value: unknown, entries: string[]) {
    if (typeof value === 'string') {
      entries.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.collectDisplayText(item, entries));
      return;
    }
    if (!value || typeof value !== 'object') return;
    Object.values(value).forEach((item) => this.collectDisplayText(item, entries));
  }
}
