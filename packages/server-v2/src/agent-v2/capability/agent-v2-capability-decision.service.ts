import { Injectable, Optional } from '@nestjs/common';
import type { AgentToolPlanItem } from '../../agent/agent.types.js';
import { AgentV2ManifestProviderService } from '../capability-center/agent-v2-manifest-provider.service.js';
import { listAgentV2CapabilityManifests } from './agent-v2-capability-manifest.js';
import type {
  AgentV2CapabilityCandidate,
  AgentV2CapabilityDecision,
  AgentV2CapabilityManifest,
  AgentV2DecisionInput,
} from './agent-v2-capability.types.js';

@Injectable()
export class AgentV2CapabilityDecisionService {
  private readonly builtinManifests = listAgentV2CapabilityManifests();

  constructor(@Optional() private readonly manifestProvider?: AgentV2ManifestProviderService) {}

  private get manifests() {
    return this.manifestProvider?.listManifests() ?? this.builtinManifests;
  }

  decide(input: AgentV2DecisionInput): AgentV2CapabilityDecision {
    const text = this.normalize(input.message);
    const excludedCapabilityIds = new Set(input.excludedCapabilityIds ?? []);
    const explicit = this.explicitCapability(text);
    const candidates = this.scoreCandidates(text, input).sort((a, b) => b.score - a.score);
    const availableCandidates = candidates.filter((candidate) => !excludedCapabilityIds.has(candidate.capabilityId));
    const selected =
      (explicit && !excludedCapabilityIds.has(explicit.capabilityId) ? explicit : null) ??
      this.manifests.find((item) => item.capabilityId === availableCandidates[0]?.capabilityId && (availableCandidates[0]?.score ?? 0) >= 0.62) ??
      null;
    const selectedScore = selected
      ? Math.max(candidates.find((item) => item.capabilityId === selected.capabilityId)?.score ?? 0.78, explicit ? 0.9 : 0)
      : 0;
    const excluded = candidates
      .filter((candidate) => candidate.capabilityId !== selected?.capabilityId)
      .slice(0, 4);

    return {
      selected,
      confidence: selected ? Number(Math.min(selectedScore, 0.98).toFixed(2)) : 0,
      reason: selected ? this.reasonForSelection(selected, input.legacyCapabilityId) : 'V2 能力目录未找到足够确定的能力，交给旧链路回退。',
      candidates,
      excluded: this.uniqueCandidates([
        ...candidates.filter((candidate) => excludedCapabilityIds.has(candidate.capabilityId)).map((candidate) => ({
          ...candidate,
          reason: `${candidate.reason},contract_retry_excluded`,
        })),
        ...excluded,
      ]).slice(0, 6),
      outputIntent: selected?.outputKinds.includes('chart')
        ? 'show_chart'
        : selected?.outputKinds.includes('table')
          ? 'show_table'
          : selected?.outputKinds.includes('action_card')
            ? 'confirm_action'
            : selected?.outputKinds.includes('kpi')
              ? 'show_kpi'
              : 'answer_text',
      toolPlan: selected ? [this.toolPlanFor(selected, input)] : [],
      boundaryWarnings: this.boundaryWarnings(selected, text),
    };
  }

  find(capabilityId: string) {
    return this.manifests.find((item) => item.capabilityId === capabilityId) ?? null;
  }

  private uniqueCandidates(candidates: AgentV2CapabilityCandidate[]) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      if (seen.has(candidate.capabilityId)) return false;
      seen.add(candidate.capabilityId);
      return true;
    });
  }

  private explicitCapability(text: string): AgentV2CapabilityManifest | null {
    if (this.isMultiDomainSummaryQuestion(text)) return this.find('agent.multi-domain.summary');
    if (this.isNavigationCashierQuestion(text)) return this.find('navigation.cashier.open');
    if (this.isNavigationCardUsageQuestion(text)) return this.find('navigation.card-usage.open');
    if (this.isCustomerCouponStatusQuestion(text)) return this.find('customer.coupon.status.lookup');
    if (this.isCouponRedemptionMetricQuestion(text)) return this.find('marketing.coupon-redemption.metric');
    if (this.isCardInactiveCustomerQuestion(text)) return this.find('card.package.inactive-customers.list');
    if (this.isCardFreeVsPaidBehaviorQuestion(text)) return this.find('card.package.free-vs-paid.behavior.metric');
    if (this.isCardPackageStatusQuestion(text)) return this.find('card.package.status.lookup');
    if (this.isDiscountPermissionRiskQuestion(text)) return this.find('finance.discount-permission-risk.metric');
    if (this.isCommissionCostOptimizationQuestion(text)) return this.find('finance.commission-cost-optimization.advice');
    if (this.isFinanceRiskDiagnosticsQuestion(text)) return this.find('finance.risk-diagnostics.metric');
    if (this.isRefundMetricQuestion(text)) return this.find('finance.refund.metric');
    if (this.isPaymentChannelFeeMetricQuestion(text)) return this.find('finance.payment-channel-fee.metric');
    if (this.isPaymentMethodMetricQuestion(text)) return this.find('finance.payment-method-breakdown.metric');
    if (this.isRevenueTrendQuestion(text)) return this.find('finance.revenue.trend');
    if (this.isStaffCommissionMetricQuestion(text)) return this.find('finance.staff-commission.metric');
    if (this.isProductGrossProfitMetricQuestion(text)) return this.find('finance.product-gross-profit.metric');
    if (this.isProjectGrossProfitMetricQuestion(text)) return this.find('finance.project-gross-profit.metric');
    if (this.isOverallGrossMarginMetricQuestion(text)) return this.find('finance.overall-gross-margin.metric');
    if (this.isCardPackageSalesMetricQuestion(text)) return this.find('finance.card-package-sales.metric');
    if (this.isDailySettlementQuestion(text)) return this.find('finance.daily-settlement.metric');
    if (this.isCardUsageQuestion(text)) return this.find('card.usage.records.list');
    if (this.isOrderDetailLookupQuestion(text)) return this.find('order.detail.lookup');
    if (this.isCardPackageOrderQuestion(text)) return this.find('order.card-package.records.list');
    if (this.isMemberCardOrderQuestion(text)) return this.find('order.member-card.records.list');
    if (this.isProjectOrderQuestion(text)) return this.find('order.project.records.list');
    if (this.isProductOrderQuestion(text)) return this.find('order.product.records.list');
    if (this.isCashierPaymentQuestion(text)) return this.find('cashier.payment.records.list');
    if (this.isStaffCommissionRecordQuestion(text)) return this.find('finance.staff-commission.records.list');
    if (this.isCustomerConsumptionQuestion(text)) return this.find('customer.consumption.records.list');
    if (this.isScrapRecordQuestion(text)) return this.find('inventory.scrap.records.list');
    if (this.isInventoryOperationDraft(text)) return this.find('inventory.stock.operation.draft');
    if (this.isExpiringRiskQuestion(text)) return this.find('inventory.expiring-risk.list');
    return null;
  }

  private scoreCandidates(text: string, input: AgentV2DecisionInput): AgentV2CapabilityCandidate[] {
    return this.manifests.map((manifest) => {
      let score = 0;
      const reasons: string[] = [];
      if (manifest.domain === input.task?.domain) {
        score += 0.18;
        reasons.push(`domain:${manifest.domain}`);
      }
      if (input.task?.outputIntent === 'show_table' && manifest.outputKinds.includes('table')) {
        score += 0.12;
        reasons.push('output:table');
      }
      const keywordHits = manifest.triggerKeywords.filter((keyword) => text.includes(this.normalize(keyword)));
      if (keywordHits.length) {
        score += Math.min(0.36, keywordHits.length * 0.12);
        reasons.push(`keyword:${keywordHits.join('|')}`);
      }
      if (this.matchesExamples(text, manifest.examples)) {
        score += 0.22;
        reasons.push('example');
      }
      if (this.matchesExamples(text, manifest.negativeExamples)) {
        score -= 0.4;
        reasons.push('negative_example');
      }
      if (manifest.capabilityId === 'inventory.scrap.records.list' && this.isScrapRecordQuestion(text)) {
        score += 0.42;
        reasons.push('boundary:occurred_scrap_record');
      }
      if (manifest.capabilityId === 'inventory.expiring-risk.list' && this.isExpiringRiskQuestion(text)) {
        score += 0.38;
        reasons.push('boundary:future_or_risk');
      }
      if (manifest.capabilityId === 'inventory.stock.operation.draft' && this.isInventoryOperationDraft(text)) {
        score += 0.4;
        reasons.push('boundary:draft_write_intent');
      }
      if (manifest.capabilityId === 'finance.revenue.trend' && this.isRevenueTrendQuestion(text)) {
        score += 0.42;
        reasons.push('boundary:revenue_trend');
      }
      if (manifest.capabilityId === 'order.detail.lookup' && this.isOrderDetailLookupQuestion(text)) {
        score += 0.42;
        reasons.push('boundary:order_detail_lookup');
      }
      if (this.matchesBusinessBoundary(manifest.capabilityId, text)) {
        score += 0.44;
        reasons.push('boundary:business_object');
      }
      return {
        capabilityId: manifest.capabilityId,
        score: Number(Math.max(0, Math.min(1, score)).toFixed(2)),
        reason: reasons.join(',') || 'no_strong_signal',
      };
    });
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

  private reasonForSelection(manifest: AgentV2CapabilityManifest, legacyCapabilityId?: string | null) {
    const legacy = legacyCapabilityId && legacyCapabilityId !== manifest.capabilityId ? `；已覆盖旧候选 ${legacyCapabilityId}` : '';
    if (manifest.capabilityId === 'inventory.scrap.records.list') {
      return `命中“已发生报废记录”语义，只查询 StockMovement.scrap_out，不走临期风险${legacy}。`;
    }
    if (manifest.capabilityId === 'inventory.expiring-risk.list') {
      return `命中“临期/报废风险”语义，查询风险清单，不当作已发生报废记录${legacy}。`;
    }
    if (manifest.capabilityId === 'inventory.stock.operation.draft') {
      return `命中库存写入意图，但发布策略为人工确认，仅生成操作草稿${legacy}。`;
    }
    if (
      manifest.executor.type === 'business_record_query' ||
      manifest.executor.type === 'business_metric_query' ||
      manifest.executor.type === 'business_trend_query' ||
      manifest.executor.type === 'business_detail_query' ||
      manifest.executor.type === 'business_action_draft'
    ) {
      return `命中 V2 能力目录：${manifest.displayName}；按 ${manifest.sourceModels.join(' / ')} 授权取数${legacy}。`;
    }
    return `命中 V2 能力目录：${manifest.displayName}${legacy}。`;
  }

  private boundaryWarnings(selected: AgentV2CapabilityManifest | null, text: string) {
    const warnings: string[] = [];
    if (!selected) return warnings;
    if (selected.capabilityId === 'inventory.expiring-risk.list' && this.hasOccurredRecordWords(text)) {
      warnings.push('question_asks_occurred_records_but_selected_risk_capability');
    }
    if (selected.capabilityId === 'inventory.scrap.records.list' && this.hasRiskWords(text) && !this.hasOccurredRecordWords(text)) {
      warnings.push('question_asks_risk_but_selected_record_capability');
    }
    return warnings;
  }

  private isScrapRecordQuestion(text: string) {
    if (!text.includes('报废')) return false;
    if (this.isInventoryOperationDraft(text)) return false;
    if (this.hasRiskWords(text) && !this.hasOccurredRecordWords(text)) return false;
    return this.hasOccurredRecordWords(text) || /哪些|哪个|清单|列表|流水|记录|明细/.test(text);
  }

  private isExpiringRiskQuestion(text: string) {
    if (!/临期|过期|到期|快报废|报废风险|风险|预警/.test(text)) return false;
    if (this.hasOccurredRecordWords(text) && text.includes('报废')) return false;
    return /快|即将|临期|风险|预警|预计|可能|还剩|过期/.test(text);
  }

  private isInventoryOperationDraft(text: string) {
    if (!/报废|出库|盘点|领用|消耗/.test(text)) return false;
    return /帮我|生成|创建|新增|登记|记录一下|处理|草稿|录入/.test(text) && !/哪些|哪个|清单|列表|查询|有没有/.test(text);
  }

  private matchesBusinessBoundary(capabilityId: string, text: string) {
    const checks: Record<string, (value: string) => boolean> = {
      'order.product.records.list': (value) => this.isProductOrderQuestion(value),
      'order.project.records.list': (value) => this.isProjectOrderQuestion(value),
      'order.member-card.records.list': (value) => this.isMemberCardOrderQuestion(value),
      'order.card-package.records.list': (value) => this.isCardPackageOrderQuestion(value),
      'cashier.payment.records.list': (value) => this.isCashierPaymentQuestion(value),
      'card.usage.records.list': (value) => this.isCardUsageQuestion(value),
      'order.detail.lookup': (value) => this.isOrderDetailLookupQuestion(value),
      'finance.daily-settlement.metric': (value) => this.isDailySettlementQuestion(value),
      'finance.revenue.trend': (value) => this.isRevenueTrendQuestion(value),
      'finance.product-gross-profit.metric': (value) => this.isProductGrossProfitMetricQuestion(value),
      'finance.project-gross-profit.metric': (value) => this.isProjectGrossProfitMetricQuestion(value),
      'finance.overall-gross-margin.metric': (value) => this.isOverallGrossMarginMetricQuestion(value),
      'finance.card-package-sales.metric': (value) => this.isCardPackageSalesMetricQuestion(value),
      'finance.payment-channel-fee.metric': (value) => this.isPaymentChannelFeeMetricQuestion(value),
      'finance.payment-method-breakdown.metric': (value) => this.isPaymentMethodMetricQuestion(value),
      'finance.refund.metric': (value) => this.isRefundMetricQuestion(value),
      'marketing.coupon-redemption.metric': (value) => this.isCouponRedemptionMetricQuestion(value),
      'customer.coupon.status.lookup': (value) => this.isCustomerCouponStatusQuestion(value),
      'card.package.inactive-customers.list': (value) => this.isCardInactiveCustomerQuestion(value),
      'card.package.free-vs-paid.behavior.metric': (value) => this.isCardFreeVsPaidBehaviorQuestion(value),
      'card.package.status.lookup': (value) => this.isCardPackageStatusQuestion(value),
      'navigation.cashier.open': (value) => this.isNavigationCashierQuestion(value),
      'navigation.card-usage.open': (value) => this.isNavigationCardUsageQuestion(value),
      'finance.discount-permission-risk.metric': (value) => this.isDiscountPermissionRiskQuestion(value),
      'finance.commission-cost-optimization.advice': (value) => this.isCommissionCostOptimizationQuestion(value),
      'finance.risk-diagnostics.metric': (value) => this.isFinanceRiskDiagnosticsQuestion(value),
      'agent.multi-domain.summary': (value) => this.isMultiDomainSummaryQuestion(value),
      'finance.staff-commission.metric': (value) => this.isStaffCommissionMetricQuestion(value),
      'finance.staff-commission.records.list': (value) => this.isStaffCommissionRecordQuestion(value),
      'customer.consumption.records.list': (value) => this.isCustomerConsumptionQuestion(value),
    };
    return Boolean(checks[capabilityId]?.(text));
  }

  private isProductOrderQuestion(text: string) {
    if (this.isOrderDetailLookupQuestion(text)) return false;
    if (!/订单|收银|销售|购买|明细|流水|记录|p[o0]m|po\d/i.test(text)) return false;
    if (this.isProjectOrderQuestion(text) || this.isMemberCardOrderQuestion(text) || this.isCardPackageOrderQuestion(text)) return false;
    return /商品|产品|零售|货品|商品订单|产品订单|商品销售/.test(text);
  }

  private isProjectOrderQuestion(text: string) {
    if (this.isOrderDetailLookupQuestion(text)) return false;
    if (this.isCardUsageQuestion(text)) return false;
    return /项目订单|服务订单|项目收银|项目消费|服务项目订单|po\d/i.test(text) && /项目|服务/.test(text);
  }

  private isMemberCardOrderQuestion(text: string) {
    if (this.isCardPackageOrderQuestion(text) || this.isCardUsageQuestion(text)) return false;
    return /会员卡|储值卡|储值|充值|会员开卡|开卡充值|会员卡管理/.test(text);
  }

  private isCardPackageOrderQuestion(text: string) {
    if (this.isCardUsageQuestion(text)) return false;
    return /次卡开卡|次卡订单|次卡购买|套餐卡|开次卡|次卡开卡管理/.test(text);
  }

  private isCashierPaymentQuestion(text: string) {
    if (this.isPaymentMethodMetricQuestion(text) || this.isRefundMetricQuestion(text)) return false;
    if (this.isDailySettlementQuestion(text)) return false;
    if (/订单/.test(text) && !/入账|进财务|支付|付款|退款|收银|对账/.test(text)) return false;
    return /收银流水|支付流水|付款记录|退款记录|支付方式|对账|进财务|入账/.test(text);
  }

  private isCardUsageQuestion(text: string) {
    return /次卡核销|核销记录|核销流水|核销服务|核销人|使用次卡/.test(text);
  }

  private isNavigationCashierQuestion(text: string) {
    return /打开|进入|跳转|切到/.test(text) && /收银|结账|买单|开单/.test(text);
  }

  private isNavigationCardUsageQuestion(text: string) {
    return /打开|进入|跳转|切到/.test(text) && /核销|扣次|用次卡|用卡/.test(text) && /次卡|客人|客户|核销/.test(text);
  }

  private isCustomerCouponStatusQuestion(text: string) {
    if (!/优惠券|权益|券/.test(text)) return false;
    if (!/这位|这个客人|这个客户|客人|客户|会员|她|他/.test(text)) return false;
    return /未核销|有没有|还有|可用|未用|未使用|剩余/.test(text);
  }

  private isCouponRedemptionMetricQuestion(text: string) {
    if (this.isCustomerCouponStatusQuestion(text)) return false;
    if (!/优惠券|权益|券/.test(text)) return false;
    if (/发券|发放给|给客户|给客人/.test(text) && !/多少|统计|核销/.test(text)) return false;
    return /核销|使用|用掉|核销率|周期|多少|平均|统计/.test(text);
  }

  private isCardPackageStatusQuestion(text: string) {
    if (this.isNavigationCardUsageQuestion(text) || this.isCardUsageQuestion(text) || this.isCardPackageOrderQuestion(text)) return false;
    if (!/次卡|套餐卡/.test(text)) return false;
    return /余量|剩余|还有|有效期|到期|过期|多久|确认|情况/.test(text);
  }

  private isCardInactiveCustomerQuestion(text: string) {
    if (!/次卡|套餐卡/.test(text)) return false;
    if (!/客户|客人|会员/.test(text)) return false;
    return /买了|购买|开了|办了/.test(text) && /不来用|一直不来|很久没用|未使用|没核销|沉睡/.test(text);
  }

  private isCardFreeVsPaidBehaviorQuestion(text: string) {
    if (!/免费次卡|赠送次卡/.test(text)) return false;
    if (!/付费客户|付费/.test(text)) return false;
    return /消费行为|消费|差异|对比|复购|核销/.test(text);
  }

  private isDiscountPermissionRiskQuestion(text: string) {
    if (!/折扣|打折|优惠/.test(text)) return false;
    return /超权限|额外|越权|权限|手工/.test(text);
  }

  private isCommissionCostOptimizationQuestion(text: string) {
    if (!/提成|佣金|员工|人员/.test(text)) return false;
    return /员工积极性|积极性|提成成本|控制提成|员工激励|激励|提成优化|成本优化/.test(text);
  }

  private isFinanceRiskDiagnosticsQuestion(text: string) {
    if (!/财务|报销|退款|收银|日结|营收|成本|利润|月报|报告/.test(text)) return false;
    return /漏洞|异常|不符|风险|压力|简报|报告什么时候|需要什么数据|检查一下|分析一下/.test(text);
  }

  private isMultiDomainSummaryQuestion(text: string) {
    if (!/同时|多件事|六件事|几件事/.test(text)) return false;
    const domains = [/营收|收入|财务/, /预约/, /库存/, /员工|人员|提成/, /客户|沉睡/, /月报|报告/];
    return domains.filter((pattern) => pattern.test(text)).length >= 3;
  }

  private isDailySettlementQuestion(text: string) {
    if (this.isRevenueTrendQuestion(text)) return false;
    return /日结|日结报表|每日结算|财务报表|净收|实收/.test(text);
  }

  private isRevenueTrendQuestion(text: string) {
    if (!/趋势|走势|变化|对比|连续|曲线/.test(text)) return false;
    if (!/营业额|营收|收入|实收|净收|收款|销售额/.test(text)) return false;
    return !/日结|单笔|订单号|p[o0]m|po\d/i.test(text);
  }

  private isOrderDetailLookupQuestion(text: string) {
    if (!/[a-z]{2,}[a-z0-9]{5,}|po\d{6,}/i.test(text)) return false;
    if (/日结|入账|进财务|同步|消费记录|商品订单|项目订单|会员卡|次卡|收银流水|为什么/.test(text)) return false;
    return /订单|单号|详情|明细|看一下|查一下|状态|支付|退款/.test(text);
  }

  private isStaffCommissionRecordQuestion(text: string) {
    if (this.isStaffCommissionMetricQuestion(text)) return false;
    return /提成流水|提成明细|员工提成|人员提成|佣金记录|提成记录/.test(text);
  }

  private isPaymentMethodMetricQuestion(text: string) {
    if (this.isPaymentChannelFeeMetricQuestion(text)) return false;
    if (!/现金|微信|支付宝|银行卡|会员卡划扣|会员卡余额|支付方式/.test(text)) return false;
    return /各收|各是多少|收了多少|收款|营收|实收|拆分|占比|合计|多少/.test(text);
  }

  private isPaymentChannelFeeMetricQuestion(text: string) {
    if (!/手续费/.test(text)) return false;
    return /支付|渠道|微信|支付宝|银行卡|收银|本月|今天|昨天|本周|多少|统计/.test(text);
  }

  private isRefundMetricQuestion(text: string) {
    if (!/退款/.test(text)) return false;
    if (/帮我(退款|退费)|发起退款|执行退款|操作退款|直接退款|处理这笔退款/.test(text)) return false;
    return /几笔|多少|金额|合计|统计|有没有|异常|今天|昨天|本月|本周|记录|明细|申请|待审批|处理时间|报告|情况|看一下/.test(text);
  }

  private isStaffCommissionMetricQuestion(text: string) {
    if (!/提成|佣金/.test(text)) return false;
    if (/规则|配置|修改|编辑|设置/.test(text)) return false;
    if (/流水|明细|记录/.test(text) && !/总|合计|最高|排名|多少|大概/.test(text)) return false;
    return /总|合计|最高|排名|多少|大概|我的|本月|这个月|今天|昨天|本周/.test(text);
  }

  private isProductGrossProfitMetricQuestion(text: string) {
    if (!/毛利|毛利率|利润/.test(text)) return false;
    if (this.isProjectGrossProfitMetricQuestion(text) || this.isOverallGrossMarginMetricQuestion(text)) return false;
    return /商品|产品|货品|零售|sku/.test(text);
  }

  private isProjectGrossProfitMetricQuestion(text: string) {
    if (!/毛利|毛利率|利润|成本/.test(text)) return false;
    if (this.isOverallGrossMarginMetricQuestion(text)) return false;
    return /项目|服务|护理|疗程/.test(text);
  }

  private isOverallGrossMarginMetricQuestion(text: string) {
    if (!/毛利率|毛利|利润/.test(text)) return false;
    if (/商品|产品|货品|项目|服务|护理|员工|人员|提成/.test(text)) return false;
    return /本月|这个月|上个月|今天|昨天|本周|整体|总|全店|为什么|是多少|多少|低|高/.test(text);
  }

  private isCardPackageSalesMetricQuestion(text: string) {
    if (this.isCardUsageQuestion(text)) return false;
    if (!/次卡|套餐卡/.test(text)) return false;
    if (/订单|记录|明细|管理|清单/.test(text) && !/销售额|销售金额|卖了多少|多少金额|开卡金额/.test(text)) return false;
    return /销售|卖了多少|销售额|金额|开卡金额|开卡|本月|这个月|今天|本周|多少/.test(text);
  }

  private isCustomerConsumptionQuestion(text: string) {
    if (/小程序行为|客户画像分析/.test(text)) return false;
    return /客户消费|消费记录|消费流水|客户画像消费|消费内容/.test(text);
  }

  private hasOccurredRecordWords(text: string) {
    return /已|已经|本周|本月|今天|昨日|昨天|刚才|发生|记录|流水|明细|历史/.test(text);
  }

  private hasRiskWords(text: string) {
    return /风险|临期|快|即将|可能|预计|预警|还剩/.test(text);
  }

  private matchesExamples(text: string, examples: string[]) {
    return examples.some((example) => {
      const normalized = this.normalize(example);
      return text === normalized || text.includes(normalized) || normalized.includes(text);
    });
  }

  private normalize(value: string) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  }
}
