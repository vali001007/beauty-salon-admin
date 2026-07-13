import { Injectable, Optional } from '@nestjs/common';
import type { AgentToolPlanItem } from '../../agent/agent.types.js';
import { AgentV2ManifestProviderService } from '../capability-center/agent-v2-manifest-provider.service.js';
import type { StructuredIntent } from '../intent/agent-v2-intent.types.js';
import { listAgentV2CapabilityManifests } from './agent-v2-capability-manifest.js';
import type {
  AgentV2CapabilityCandidate,
  AgentV2CapabilityDecision,
  AgentV2CapabilityManifest,
  AgentV2DecisionInput,
} from './agent-v2-capability.types.js';

export type AgentV2CapabilityMappingInput = {
  intent: StructuredIntent;
  decisionInput: AgentV2DecisionInput;
};

@Injectable()
export class AgentV2CapabilityMappingService {
  private readonly builtinManifests = listAgentV2CapabilityManifests();

  constructor(@Optional() private readonly manifestProvider?: AgentV2ManifestProviderService) {}

  private get manifests() {
    return this.manifestProvider?.listManifests() ?? this.builtinManifests;
  }

  map(input: AgentV2CapabilityMappingInput): AgentV2CapabilityDecision {
    const excludedCapabilityIds = new Set(input.decisionInput.excludedCapabilityIds ?? []);
    const manifestById = new Map(this.manifests.map((manifest) => [manifest.capabilityId, manifest]));
    const candidates = input.intent.candidateCapabilities.map((capabilityId, index) =>
      this.toCandidate(capabilityId, index, input.intent, manifestById.get(capabilityId)),
    );
    const selected = this.selectManifest(input, manifestById, excludedCapabilityIds);
    const excluded = this.excludedCandidates(input, candidates, manifestById, excludedCapabilityIds, selected?.capabilityId);

    return {
      selected,
      confidence: selected ? input.intent.confidence : 0,
      reason: selected
        ? `StructuredIntent 映射到 Active Manifest：${selected.displayName}。`
        : input.intent.unsupportedReason ?? 'StructuredIntent 未能映射到已发布且启用的 Manifest。',
      candidates,
      excluded,
      outputIntent: selected?.outputKinds.includes('chart')
        ? 'show_chart'
        : selected?.outputKinds.includes('table')
          ? 'show_table'
          : selected?.outputKinds.includes('action_card')
            ? 'confirm_action'
            : selected?.outputKinds.includes('kpi')
              ? 'show_kpi'
              : 'answer_text',
      toolPlan: selected ? [this.toolPlanFor(selected, input.decisionInput)] : [],
      boundaryWarnings: this.boundaryWarnings(input.intent, selected),
      intent: input.intent,
    };
  }

  private selectManifest(
    input: AgentV2CapabilityMappingInput,
    manifestById: Map<string, AgentV2CapabilityManifest>,
    excludedCapabilityIds: Set<string>,
  ) {
    const normalizedQuestion = normalize(input.decisionInput.message);
    const boundaryManifest = this.boundaryManifest(normalizedQuestion, manifestById, excludedCapabilityIds);
    if (boundaryManifest) return boundaryManifest;
    for (const capabilityId of input.intent.candidateCapabilities) {
      if (excludedCapabilityIds.has(capabilityId)) continue;
      const manifest = manifestById.get(capabilityId);
      if (!manifest) continue;
      if (manifest.status !== 'enabled') continue;
      if (this.matchesNegativeExamples(normalizedQuestion, manifest)) continue;
      if (!this.outputKindCompatible(input.intent, manifest)) continue;
      return manifest;
    }
    return null;
  }

  private boundaryManifest(
    question: string,
    manifestById: Map<string, AgentV2CapabilityManifest>,
    excludedCapabilityIds: Set<string>,
  ) {
    const candidates = [
      this.isInventoryOperationDraftQuestion(question) ? 'inventory.stock.operation.draft' : '',
      this.isInventoryExpiringRiskQuestion(question) ? 'inventory.expiring-risk.list' : '',
      this.isMultiDomainSummaryQuestion(question) ? 'agent.multi-domain.summary' : '',
      this.isNavigationCardUsageQuestion(question) ? 'navigation.card-usage.open' : '',
      this.isCardUsageRecordQuestion(question) ? 'card.usage.records.list' : '',
      this.isCardPackageStatusQuestion(question) ? 'card.package.status.lookup' : '',
      this.isMemberCardOrderQuestion(question) ? 'order.member-card.records.list' : '',
      this.isCashierPaymentQuestion(question) ? 'cashier.payment.records.list' : '',
      this.isFinanceRiskDiagnosticsQuestion(question) ? 'finance.risk-diagnostics.metric' : '',
      this.isDiscountPermissionRiskQuestion(question) ? 'finance.discount-permission-risk.metric' : '',
      this.isStaffCommissionMetricQuestion(question) ? 'finance.staff-commission.metric' : '',
      this.isProductGrossProfitQuestion(question) ? 'finance.product-gross-profit.metric' : '',
      this.isProjectGrossProfitQuestion(question) ? 'finance.project-gross-profit.metric' : '',
      this.isOverallGrossMarginQuestion(question) ? 'finance.overall-gross-margin.metric' : '',
      this.isCardPackageSalesQuestion(question) ? 'finance.card-package-sales.metric' : '',
      this.isCustomerCouponStatusQuestion(question) ? 'customer.coupon.status.lookup' : '',
      this.isCouponRedemptionMetricQuestion(question) ? 'marketing.coupon-redemption.metric' : '',
      this.isCouponIssueActionQuestion(question) ? 'marketing.coupon.issue.blocked' : '',
      this.isInventoryStockHealthQuestion(question) ? 'inventory.bom.consumption.records.records.list' : '',
      this.isRefundQuestion(question) ? 'finance.refund.metric' : '',
      this.isStaffEfficiencyQuestion(question) ? 'finance.staff-efficiency.metric' : '',
    ].filter(Boolean);
    for (const capabilityId of candidates) {
      if (excludedCapabilityIds.has(capabilityId)) continue;
      const manifest = manifestById.get(capabilityId);
      if (manifest?.status === 'enabled' && !this.matchesNegativeExamples(question, manifest)) return manifest;
    }
    return null;
  }

  private excludedCandidates(
    input: AgentV2CapabilityMappingInput,
    candidates: AgentV2CapabilityCandidate[],
    manifestById: Map<string, AgentV2CapabilityManifest>,
    excludedCapabilityIds: Set<string>,
    selectedCapabilityId?: string,
  ) {
    const normalizedQuestion = normalize(input.decisionInput.message);
    return candidates
      .filter((candidate) => candidate.capabilityId !== selectedCapabilityId)
      .map((candidate) => {
        const manifest = manifestById.get(candidate.capabilityId);
        const reasons: string[] = [];
        if (!manifest) reasons.push('manifest_missing');
        if (manifest?.status !== 'enabled') reasons.push('manifest_disabled');
        if (excludedCapabilityIds.has(candidate.capabilityId)) reasons.push('contract_retry_excluded');
        if (manifest && this.matchesNegativeExamples(normalizedQuestion, manifest)) reasons.push('negative_example');
        if (manifest && !this.outputKindCompatible(input.intent, manifest)) reasons.push('output_kind_mismatch');
        return {
          ...candidate,
          reason: reasons.length ? `${candidate.reason},${reasons.join(',')}` : candidate.reason,
        };
      })
      .slice(0, 8);
  }

  private toCandidate(
    capabilityId: string,
    index: number,
    intent: StructuredIntent,
    manifest?: AgentV2CapabilityManifest,
  ): AgentV2CapabilityCandidate {
    const base = Math.max(0.2, intent.confidence - index * 0.08);
    return {
      capabilityId,
      score: Number(Math.min(0.98, base).toFixed(2)),
      reason: manifest ? `structured_intent_rank:${index + 1}` : `structured_intent_rank:${index + 1},manifest_missing`,
    };
  }

  private outputKindCompatible(intent: StructuredIntent, manifest: AgentV2CapabilityManifest) {
    if (intent.action === 'list') return manifest.outputKinds.includes('table') || manifest.outputKinds.includes('data_gap');
    if (intent.action === 'summary') return manifest.outputKinds.includes('kpi') || manifest.outputKinds.includes('table');
    if (intent.action === 'analyze' || intent.action === 'compare') return manifest.outputKinds.includes('chart') || manifest.outputKinds.includes('kpi') || manifest.outputKinds.includes('table');
    if (intent.action === 'draft') return manifest.outputKinds.includes('action_card') || manifest.releaseStrategy !== 'auto_publish';
    return true;
  }

  private matchesNegativeExamples(question: string, manifest: AgentV2CapabilityManifest) {
    return manifest.negativeExamples.some((example) => {
      const normalized = normalize(example);
      return normalized && (question.includes(normalized) || normalized.includes(question));
    });
  }

  private boundaryWarnings(intent: StructuredIntent, selected: AgentV2CapabilityManifest | null) {
    if (!selected) return [];
    const warnings: string[] = [];
    if (intent.timeIntent === 'risk' && selected.capabilityId.includes('records')) {
      warnings.push('risk_intent_selected_record_capability');
    }
    if (intent.action === 'draft' && selected.releaseStrategy === 'auto_publish') {
      warnings.push('draft_intent_selected_auto_publish_capability');
    }
    return warnings;
  }

  private isInventoryExpiringRiskQuestion(question: string) {
    if (/次卡|套餐卡/.test(question)) return false;
    if (!/临期|过期|快过期|即将过期|快报废|报废风险|缺货风险/.test(question)) return false;
    if (/已|已经|记录|流水|明细/.test(question) && /报废/.test(question)) return false;
    return /临期|过期|快过期|即将过期|快报废|风险|消化|处理|促销|退换货|损失|优惠|搭配|供应商|减少/.test(question);
  }

  private isInventoryStockHealthQuestion(question: string) {
    if (!/库存|安全库存|耗材|补货|周转|损耗率/.test(question)) return false;
    if (this.isInventoryExpiringRiskQuestion(question)) return false;
    if (/报废记录|报废流水|已经报废|已报废/.test(question)) return false;
    return /库存|安全库存|缺货|补货|耗材|周转|损耗率|够用|低于/.test(question);
  }

  private isInventoryOperationDraftQuestion(question: string) {
    if (!/盘点|报废|出库|领用|消耗/.test(question)) return false;
    if (/哪些|哪个|清单|列表|查询|有没有|风险|缺货/.test(question)) return false;
    return /帮我|生成|创建|新增|登记|记录一下|处理|草稿|录入|临近年底|年底|做一个|做个/.test(question);
  }

  private isRefundQuestion(question: string) {
    if (!/退款|退费|退款率/.test(question)) return false;
    if (this.isFinanceRiskDiagnosticsQuestion(question)) return false;
    if (/直接退款|帮我退款|发起退款|执行退款|操作退款|处理这笔退款/.test(question)) return false;
    return /原因|主要|流程|合规|退款率|最高|投诉|应该|还是|怎么处理|怎么办|几笔|金额|统计|记录|明细|异常|最近|影响|情况/.test(question);
  }

  private isMultiDomainSummaryQuestion(question: string) {
    if (/同时.*(营收|预约|库存|员工|客户|月报)/.test(question)) return true;
    if (/多个维度|多维度|经营.*客户.*库存|拉新.*复购.*库存|生成月报/.test(question)) return true;
    return /复杂的活动/.test(question) && /(拉新|复购|清库存|客单价|员工收入)/.test(question);
  }

  private isNavigationCardUsageQuestion(question: string) {
    return /打开|进入|跳转/.test(question) && /核销/.test(question) && /界面|入口/.test(question);
  }

  private isCardUsageRecordQuestion(question: string) {
    if (!/次卡|套餐卡/.test(question)) return false;
    if (this.isNavigationCardUsageQuestion(question)) return false;
    return /核销|使用|扣次/.test(question) && /记录|流水|情况|看一下|确认/.test(question);
  }

  private isCardPackageStatusQuestion(question: string) {
    if (!/次卡|套餐卡/.test(question)) return false;
    if (this.isCardUsageRecordQuestion(question) || this.isNavigationCardUsageQuestion(question)) return false;
    return /余量|剩余|还有|有效期|到期|过期|快过期|即将过期|温馨提醒|发消息|提醒|确认/.test(question);
  }

  private isMemberCardOrderQuestion(question: string) {
    if (/退款.*(原支付方式|储值余额)/.test(question)) return true;
    return /会员卡|储值|充值/.test(question) && /记录|订单|套餐|有哪些|金额|余额/.test(question);
  }

  private isCashierPaymentQuestion(question: string) {
    if (this.isRefundQuestion(question)) return false;
    if (/手续费|各收了多少|拆分|统计|汇总/.test(question)) return false;
    return /支付方式|微信|现金|支付宝|银行卡/.test(question) && /这笔|单子|订单|用什么|还是|流水/.test(question);
  }

  private isFinanceRiskDiagnosticsQuestion(question: string) {
    if (/异常.*退款|大额异常退款|退款.*异常|退款后马上重新消费|经常退款/.test(question)) return true;
    if (/财务健康|风险点|财务压力|漏洞|不符|风险/.test(question)) return true;
    return /经营.*异常|检查.*财务|健康检查/.test(question);
  }

  private isDiscountPermissionRiskQuestion(question: string) {
    return /折扣|打折|优惠/.test(question) && /权限|超权限|额外|自主|员工/.test(question);
  }

  private isStaffCommissionMetricQuestion(question: string) {
    if (this.isStaffEfficiencyQuestion(question)) return false;
    return /提成|佣金|工资/.test(question) && /多少|总|占比|最高|花了|比例|本月|这个月/.test(question);
  }

  private isProductGrossProfitQuestion(question: string) {
    if (/项目|服务项目|服务/.test(question)) return false;
    return /产品|商品/.test(question) && /毛利|毛利率/.test(question);
  }

  private isProjectGrossProfitQuestion(question: string) {
    if (/产品销售.*服务项目.*毛利/.test(question)) return true;
    return /项目|服务项目|服务/.test(question) && /毛利|成本|实际毛利|毛利异常|影响毛利/.test(question);
  }

  private isOverallGrossMarginQuestion(question: string) {
    if (/产品|商品|项目|服务项目/.test(question)) return false;
    return /打.*折|折扣|整体毛利|毛利还剩|总毛利|毛利率为什么/.test(question) && /毛利/.test(question);
  }

  private isCardPackageSalesQuestion(question: string) {
    if (!/次卡|套餐卡/.test(question)) return false;
    if (this.isCardPackageStatusQuestion(question) || this.isCardUsageRecordQuestion(question)) return false;
    return /销售|开卡|促销|折扣力度|卖了|金额|从来不来消费|不来消费/.test(question);
  }

  private isCouponRedemptionMetricQuestion(question: string) {
    if (!/优惠券|权益|券/.test(question)) return false;
    if (this.isCouponIssueActionQuestion(question)) return false;
    if (this.isCustomerCouponStatusQuestion(question)) return false;
    return /核销|核销率|使用|用掉|周期|高不高|多少|统计|平均/.test(question);
  }

  private isCustomerCouponStatusQuestion(question: string) {
    if (!/优惠券|权益|券/.test(question)) return false;
    if (this.isCouponIssueActionQuestion(question)) return false;
    return /这位|这个客户|这名|客人|客户/.test(question) && /有没有|还有|可用|未核销|未使用|状态/.test(question);
  }

  private isCouponIssueActionQuestion(question: string) {
    if (!/发券|发优惠券|发放优惠券|下发优惠券|发放权益|下发权益|给.*券|给.*优惠券/.test(question)) return false;
    if (/多少|统计|核销|核销率|平均|周期|有没有|还有|可用|未使用|未核销/.test(question)) return false;
    return /客户|客人|会员|沉睡|流失|所有|这些|这批|人群|客群/.test(question);
  }

  private isStaffEfficiencyQuestion(question: string) {
    if (/提成|佣金|工资|薪资|规则/.test(question)) return false;
    return /人效|员工效率|员工表现|表现排行|服务完成率|员工业绩/.test(question);
  }

  private toolPlanFor(manifest: AgentV2CapabilityManifest, input: AgentV2DecisionInput): AgentToolPlanItem {
    return {
      tool: manifest.executor.tool,
      args: {
        question: input.message,
        capabilityId: manifest.capabilityId,
        queryKey: manifest.executor.queryKey,
        timeRange: input.task?.timeRange,
        limit: input.task?.limit,
        filters: input.task?.filters ?? {},
      },
    };
  }
}

function normalize(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}
