import { Injectable } from '@nestjs/common';
import type { BrainDateRange } from '../../cognition/brain-time-range-parser.service.js';
import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import type { BrainDomainAdapter, BrainDomainAdapterExecution, BrainDomainAnswer } from '../brain-domain-adapter.types.js';
import { defaultBrainDateRange, formatBrainMoney, formatBrainPercent } from '../brain-domain-formatters.js';

@Injectable()
export class BrainFinanceDomainAdapter implements BrainDomainAdapter {
  readonly key = 'finance_risk' as const;
  readonly role = 'finance' as const;
  readonly requiredPermissions = ['core:finance:view'];

  constructor(
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
  ) {}

  canHandle(plan: BrainDomainAdapterExecution['plan']) {
    return plan.adapterKey === this.key;
  }

  async execute(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer | undefined> {
    const range = this.resolveRange(input.dto.message);
    const discountRate = this.parseDiscountRate(input.dto.message);
    if (discountRate !== undefined && /(毛利|利润)/.test(input.dto.message)) {
      const summary = await this.skillRuntime.buildFinanceRiskSummary({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      if (summary.grossMarginRate === undefined) {
        return {
          status: 'completed',
          answer: `${range.label}缺少已确认的毛利率数据，无法做折扣毛利模拟；Ami Brain 不会用售价替代完整成本。`,
          citations: [{ sourceType: 'skill', sourceId: 'finance_discount_margin_simulation', label: '折扣毛利模拟' }],
          grounding: 'db_skill',
          metadata: { adapterKey: this.key, unsupportedReason: 'gross_margin_missing' },
        };
      }
      const costRatio = 1 - summary.grossMarginRate;
      const projectedMarginRate = discountRate > 0 ? (discountRate - costRatio) / discountRate : -1;
      return {
        status: 'completed',
        answer: `${range.label}当前毛利率 ${formatBrainPercent(summary.grossMarginRate)}。按成本不变模拟，打 ${Math.round(
          discountRate * 10,
        )} 折后毛利率约 ${formatBrainPercent(projectedMarginRate)}；${projectedMarginRate <= 0 ? '该折扣会使毛利转负，不建议直接执行。' : '执行前仍需确认具体项目成本、券叠加和员工提成。'}`,
        citations: [{ sourceType: 'skill', sourceId: 'finance_discount_margin_simulation', label: '折扣毛利模拟' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, discountRate, projectedMarginRate, rangeLabel: range.label },
      };
    }
    if (/(耗材成本|材料成本|员工提成|提成.*花了多少|房租|水电|经营成本|成本占|实际毛利|毛利情况|储值负债|未消耗余额|预付.*未使用|卡项负债)/.test(input.dto.message)) {
      const analysis = await this.skillRuntime.buildFinanceCostAnalysis({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const categoryText = analysis.costCategories.length
        ? analysis.costCategories.map((item) => `${item.category} ${formatBrainMoney(item.amount)}`).join('，')
        : '暂无已录入经营费用';
      return {
        status: 'completed',
        answer: `${range.label}成本与负债分析：收入 ${formatBrainMoney(analysis.revenue)}，耗材成本 ${formatBrainMoney(analysis.materialCost)}，提成 ${formatBrainMoney(analysis.commissionCost)}，经营费用 ${formatBrainMoney(analysis.operatingCost)}，毛利 ${formatBrainMoney(analysis.grossProfit)}，毛利率 ${analysis.grossMarginRate == null ? '暂无结算数据' : formatBrainPercent(analysis.grossMarginRate)}，卡项未履约负债 ${formatBrainMoney(analysis.cardLiability)}。\n费用分类：${categoryText}。`,
        citations: [{ sourceType: 'skill', sourceId: 'finance_cost_liability_analysis', label: '财务成本、毛利与卡项负债分析' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    if (/(收入汇总|收入情况|收款|现金|微信|支付宝|支付方式|收入趋势|收入明细|客单价|项目收入|产品销售|最大的一笔|储值收款|储值卡消费|刷卡消费|次卡销售|到账的钱|开单的钱)/.test(input.dto.message)) {
      const analysis = await this.skillRuntime.buildFinanceIncomeAnalysis({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const paymentText = analysis.paymentBreakdown.length
        ? analysis.paymentBreakdown.map((item) => `${item.method}${item.count > 0 ? ` ${item.count} 笔` : ''} ${formatBrainMoney(item.amount)}`).join('，')
        : '暂无支付记录';
      const kindText = analysis.orderKindBreakdown.length
        ? analysis.orderKindBreakdown.map((item) => `${item.kind} ${formatBrainMoney(item.amount)}`).join('，')
        : '暂无订单分类数据';
      const trendText = analysis.dailyTrend.length
        ? analysis.dailyTrend.map((item) => `${item.date} ${formatBrainMoney(item.revenue)}（${item.orderCount} 单，客单 ${formatBrainMoney(item.avgTransaction)}）`).join('\n')
        : '当前时间范围没有日结趋势数据。';
      const largestText = analysis.largestOrder
        ? `${analysis.largestOrder.orderNo} ${formatBrainMoney(analysis.largestOrder.amount)}${analysis.largestOrder.customerName ? `，客户 ${analysis.largestOrder.customerName}` : ''}`
        : '暂无';
      return {
        status: 'completed',
        answer: `${range.label}收入分析：实收 ${formatBrainMoney(analysis.totalCollected)}。\n支付拆分：${paymentText}。\n订单类型：${kindText}。\n每日趋势：\n${trendText}\n最大订单：${largestText}。`,
        citations: [{ sourceType: 'skill', sourceId: 'finance_income_analysis', label: '财务收入与支付分析' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    const summary = await this.skillRuntime.buildFinanceRiskSummary({
      storeId: input.context.storeId,
      startDate: range.startDate,
      endDate: range.endDate,
    });
    const marginText =
      summary.grossMarginRate === undefined ? '毛利率暂无结算数据' : `毛利率 ${formatBrainPercent(summary.grossMarginRate)}`;
    const riskText = summary.riskItems.length > 0 ? `风险：${summary.riskItems.join('；')}` : '风险：当前未发现明确财务预警。';
    return {
      status: 'completed' as const,
      answer: `财务风险摘要：退款 ${summary.refundCount} 笔，金额 ${formatBrainMoney(summary.refundAmount)}；优惠 ${formatBrainMoney(summary.discountAmount)}；${marginText}。${riskText}`,
      citations: [{ sourceType: 'skill', sourceId: 'finance_risk_summary', label: '财务风险摘要' }],
      grounding: 'db_skill' as const,
      metadata: { adapterKey: this.key, rangeLabel: range.label },
    };
  }

  private resolveRange(message: string): BrainDateRange {
    const parsed = this.timeRangeParser.parse(message);
    return parsed.range ?? defaultBrainDateRange();
  }

  private parseDiscountRate(message: string) {
    const chineseDigits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const chinese = message.match(/打([一二三四五六七八九])折/)?.[1];
    if (chinese) return chineseDigits[chinese] / 10;
    const numeric = message.match(/打(\d{1,2}(?:\.\d+)?)折/)?.[1];
    if (!numeric) return undefined;
    const value = Number(numeric);
    if (!Number.isFinite(value) || value <= 0 || value >= 10) return undefined;
    return value >= 1 ? value / 10 : value;
  }
}
