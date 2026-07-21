import { Injectable } from '@nestjs/common';
import type { BrainDateRange } from '../../cognition/brain-time-range-parser.service.js';
import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import type { BrainDomainAdapter, BrainDomainAdapterExecution, BrainDomainAnswer } from '../brain-domain-adapter.types.js';
import { defaultBrainDateRange, formatBrainMoney, formatBrainPercent } from '../brain-domain-formatters.js';

@Injectable()
export class BrainStoreManagerDomainAdapter implements BrainDomainAdapter {
  readonly key = 'store_manager' as const;
  readonly role = 'store_manager' as const;
  readonly requiredPermissions = ['core:dashboard:view'];

  constructor(
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
  ) {}

  canHandle(plan: BrainDomainAdapterExecution['plan']) {
    return plan.adapterKey === this.key;
  }

  async execute(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer | undefined> {
    const message = input.dto.message;
    const range = this.resolveRange(message);
    if (/预测.*(?:营业额|营收|收入)|下个季度.*(?:营业额|营收|收入)/.test(message)) {
      const forecast = await this.skillRuntime.buildManagerRevenueForecastBaseline({
        storeId: input.context.storeId,
        asOf: new Date(),
      });
      const qualitySummary = `90 天窗口有 ${forecast.sampleDays} 个营业日样本，覆盖率 ${formatBrainPercent(forecast.dataCoverageRate)}，已确认且对账通过 ${formatBrainPercent(forecast.reconciliationRate)}。`;
      const backtestSummary = forecast.backtest.weightedAbsolutePercentageError === null
        ? '历史样本不足，尚不能形成有效回测。'
        : `滚动回测 ${forecast.backtest.evaluationDays} 天，误差 ${formatBrainPercent(forecast.backtest.weightedAbsolutePercentageError)}，回测准确度 ${formatBrainPercent(forecast.backtest.accuracyRate ?? 0)}。`;
      if (
        forecast.status === 'insufficient'
        || forecast.estimatedRevenue === null
        || forecast.lowerBound === null
        || forecast.upperBound === null
        || forecast.averageDailyRevenue === null
      ) {
        const limitation = forecast.limitations.join('；') || '当前日结样本不足。';
        return {
          status: 'completed',
          answer: `当前无法形成下季度营业额预测：${qualitySummary}${backtestSummary}${limitation} Ami Brain 不会在样本不足时输出伪精确金额。`,
          citations: [{ sourceType: 'skill', sourceId: 'store_manager_revenue_forecast_baseline', label: '下季度营业额透明基线预测' }],
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'diagnosis',
              findings: [{ title: '预测证据不足', detail: `${qualitySummary}${backtestSummary}`, severity: 'warning' }],
              citationIds: ['store_manager_revenue_forecast_baseline'],
            },
            { kind: 'limitations', items: [qualitySummary, backtestSummary, ...forecast.limitations] },
          ],
          metadata: {
            adapterKey: this.key,
            answerScope: 'manager_revenue_forecast_insufficient',
            modelVersion: forecast.modelVersion,
            generatedAt: forecast.generatedAt,
            sampleDays: forecast.sampleDays,
            dataCoverageRate: forecast.dataCoverageRate,
            reconciliationRate: forecast.reconciliationRate,
            confidence: forecast.confidence,
            confidenceLabel: forecast.confidenceLabel,
            backtest: forecast.backtest,
          },
        };
      }
      const limitation = [
        ...forecast.limitations,
        '预测未包含节假日、活动预算和人员变化，不是经营承诺值。',
      ];
      return {
        status: 'completed',
        answer: `下季度营业额基线预测 ${formatBrainMoney(forecast.estimatedRevenue)}，区间 ${formatBrainMoney(forecast.lowerBound)} 至 ${formatBrainMoney(forecast.upperBound)}，置信度 ${formatBrainPercent(forecast.confidence)}（${forecast.confidenceLabel}）。${qualitySummary}${backtestSummary}最近 28 个可用营业日日均 ${formatBrainMoney(forecast.averageDailyRevenue)}，预测周期 ${forecast.forecastDays} 天；模型版本 ${forecast.modelVersion}。${limitation.join('；')}`,
        citations: [{ sourceType: 'skill', sourceId: 'store_manager_revenue_forecast_baseline', label: '下季度营业额透明基线预测' }],
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'kpi',
            items: [
              { label: '下季度基线预测', value: formatBrainMoney(forecast.estimatedRevenue) },
              { label: '预测区间', value: `${formatBrainMoney(forecast.lowerBound)} - ${formatBrainMoney(forecast.upperBound)}` },
              { label: '置信度', value: `${formatBrainPercent(forecast.confidence)}（${forecast.confidenceLabel}）` },
              { label: '回测准确度', value: forecast.backtest.accuracyRate === null ? '样本不足' : formatBrainPercent(forecast.backtest.accuracyRate) },
            ],
            citationIds: ['store_manager_revenue_forecast_baseline'],
          },
          {
            kind: 'diagnosis',
            findings: [
              { title: '数据覆盖', detail: qualitySummary, severity: forecast.dataCoverageRate >= 0.8 ? 'info' : 'warning' },
              { title: '历史回测', detail: backtestSummary, severity: (forecast.backtest.accuracyRate ?? 0) >= 0.65 ? 'info' : 'warning' },
            ],
            citationIds: ['store_manager_revenue_forecast_baseline'],
          },
          { kind: 'limitations', items: limitation },
        ],
        metadata: {
          adapterKey: this.key,
          answerScope: 'manager_revenue_forecast_backtested',
          modelVersion: forecast.modelVersion,
          generatedAt: forecast.generatedAt,
          confidence: forecast.confidence,
          confidenceLabel: forecast.confidenceLabel,
          forecastStart: forecast.forecastStart,
          forecastEnd: forecast.forecastEnd,
          sampleDays: forecast.sampleDays,
          dataCoverageRate: forecast.dataCoverageRate,
          reconciliationRate: forecast.reconciliationRate,
          duplicateBusinessDateCount: forecast.duplicateBusinessDateCount,
          backtest: forecast.backtest,
        },
      };
    }
    if (/(美容师|员工|技师).*(接客|客人|服务|业绩|提成|复购|请假|迟到|排名|排行|最多|最高|下滑)|谁.*(接客|服务|业绩|提成|复购|请假)/.test(message)) {
      const analysis = await this.skillRuntime.buildManagerStaffAnalysis({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const lines = analysis.staff.length
        ? analysis.staff
            .slice(0, 15)
            .map((item, index) => {
              const repeatRate = item.uniqueCustomerCount > 0 ? item.repeatCustomerCount / item.uniqueCustomerCount : 0;
              return `${index + 1}. ${item.name}：服务 ${item.serviceCount} 单，完成 ${item.completedCount} 单，客户 ${item.uniqueCustomerCount} 人，重复服务客户 ${item.repeatCustomerCount} 人（${formatBrainPercent(repeatRate)}），关联业绩 ${formatBrainMoney(item.revenueAmount)}，提成 ${formatBrainMoney(item.commissionAmount)}，请假 ${item.timeOffHours.toFixed(1)} 小时。`;
            })
            .join('\n')
        : '当前门店没有活跃美容师或本期员工记录。';
      return {
        status: 'completed',
        answer: `${range.label}员工经营分析：\n${lines}\n业绩与提成来自已生成提成记录；满意度和升单率未建立统一事实口径时不做猜测。`,
        citations: [{ sourceType: 'skill', sourceId: 'store_manager_staff_analysis', label: '员工服务、业绩、提成与请假分析' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    if (/(目标完成率|目标.*完成|还差多远|来了几个客人|还有几个在店|客单价|新客老客|哪个项目做得最多|最大的一笔消费|营业额趋势|哪天特别差|现金收了多少|微信支付宝)/.test(message)) {
      const analysis = await this.skillRuntime.buildManagerOperationsAnalysis({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      if (/(目标完成率|目标.*完成|还差多远)/.test(message)) {
        if (!analysis.target) {
          return {
            status: 'completed',
            answer: `${range.label}尚未配置经营目标。请先在门店目标配置中录入收入、预约和新客目标，Ami Brain 不会自行编造目标值。`,
            citations: [{ sourceType: 'skill', sourceId: 'store_operating_target', label: '门店经营目标配置' }],
            grounding: 'db_skill',
            metadata: { adapterKey: this.key, unsupportedReason: 'store_target_not_configured' },
          };
        }
        const rate = analysis.target.revenueTarget > 0 ? analysis.revenue / analysis.target.revenueTarget : 0;
        return {
          status: 'completed',
          answer: `${range.label}收入目标 ${formatBrainMoney(analysis.target.revenueTarget)}，已完成 ${formatBrainMoney(analysis.revenue)}，完成率 ${formatBrainPercent(rate)}，还差 ${formatBrainMoney(Math.max(0, analysis.target.revenueTarget - analysis.revenue))}；预约目标 ${analysis.target.appointmentTarget}，新客目标 ${analysis.target.newCustomerTarget}。`,
          citations: [{ sourceType: 'skill', sourceId: 'store_operating_target', label: '门店经营目标完成率' }],
          grounding: 'db_skill',
          metadata: { adapterKey: this.key, rangeLabel: range.label },
        };
      }
      const projectLines = analysis.projectRanking.length
        ? analysis.projectRanking.map((item, index) => `${index + 1}. ${item.name} ${item.count} 次`).join('；')
        : '暂无项目数据';
      const staffLines = analysis.beauticianRanking.length
        ? analysis.beauticianRanking.map((item, index) => `${index + 1}. ${item.name} ${item.count} 次`).join('；')
        : '暂无员工服务数据';
      const paymentLines = analysis.paymentBreakdown.length
        ? analysis.paymentBreakdown.map((item) => `${item.method} ${formatBrainMoney(item.amount)}`).join('，')
        : '暂无支付拆分';
      const trendLines = analysis.dailyTrend.length
        ? analysis.dailyTrend.map((item) => `${item.date} ${formatBrainMoney(item.revenue)}`).join('；')
        : '暂无日结趋势';
      return {
        status: 'completed',
        answer: `${range.label}经营分析：实收 ${formatBrainMoney(analysis.revenue)}，${analysis.orderCount} 单，客单价 ${formatBrainMoney(analysis.avgTransaction)}，到店客户 ${analysis.customerCount} 人、当前在店 ${analysis.inStoreCount} 人，新客 ${analysis.newCustomerCount} 人、老客 ${analysis.returningCustomerCount} 人。\n项目排行：${projectLines}。\n员工服务量：${staffLines}。\n支付拆分：${paymentLines}。\n营业额趋势：${trendLines}。\n最大订单：${analysis.largestOrder ? `${analysis.largestOrder.orderNo} ${formatBrainMoney(analysis.largestOrder.amount)}` : '暂无'}。`,
        citations: [{ sourceType: 'skill', sourceId: 'store_manager_operations_analysis', label: '店长经营深度分析' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }

    const overview = await this.skillRuntime.buildManagerDailyOverview({
      storeId: input.context.storeId,
      startDate: range.startDate,
      endDate: range.endDate,
    });
    const riskText = overview.riskItems.length > 0 ? `风险：${overview.riskItems.join('；')}。` : '风险：当前未发现明确预警。';
    const trendText = /(趋势|复盘|异常|为什么|原因|诊断)/.test(message)
      ? '趋势诊断：P4 先返回当前周期事实摘要；跨天归因诊断进入 P5。'
      : '';

    return {
      status: 'completed' as const,
      answer: `${range.label}经营概览：实收流水 ${formatBrainMoney(overview.revenue)}，预约 ${overview.appointmentCount} 个，活跃客户 ${overview.activeCustomerCount} 人，毛利率 ${formatBrainPercent(overview.grossMarginRate)}。${riskText}${trendText}`,
      citations: [{ sourceType: 'skill', sourceId: 'store_manager_overview_summary', label: '店长经营概览' }],
      grounding: 'db_skill' as const,
      metadata: { adapterKey: this.key, rangeLabel: range.label },
    };
  }

  private resolveRange(message: string): BrainDateRange {
    const parsed = this.timeRangeParser.parse(message);
    return parsed.range ?? defaultBrainDateRange();
  }
}
