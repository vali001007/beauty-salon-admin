import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import { ASK_DATA_ANSWER_SCHEMA, buildAnswerMessages } from './ask-data-free-sql.prompts.js';
import { detectAskDataAnswerScopeFailure, isAskDataAnswerGrounded } from './ask-data-answer-eval-quality.js';
import type { AskDataAnswer, AskDataFreeSqlContext } from './ask-data-free-sql.types.js';
import type { AskDataControlledQueryPlan } from './ask-data-query-plan.js';

type AnswerQueryPlan = Partial<Pick<
  AskDataControlledQueryPlan,
  'answerShape' | 'metricKeys' | 'dimensions' | 'comparisonMode' | 'requiredOutputFields' | 'aggregations' | 'sort' | 'limit' | 'resultMode' | 'timeGrain'
>>;

@Injectable()
export class AskDataFreeSqlAnswerService {
  constructor(private readonly aiService: AiService) {}

  async compose(input: {
    question: string;
    explanation: string;
    rows: Array<Record<string, unknown>>;
    selectedViews: ReadOnlySqlView[];
    context: AskDataFreeSqlContext;
    timeRange: string;
    truncated: boolean;
    assumptions?: string[];
    requiredAnswerFacts?: string[];
    controlledQueryPlan?: AnswerQueryPlan;
  }): Promise<AskDataAnswer> {
    const fallback = this.applyGovernedCaveats(
      this.fallback(
        input.question,
        input.rows,
        input.truncated,
        input.requiredAnswerFacts ?? [],
        input.controlledQueryPlan,
        input.selectedViews,
      ),
      input.controlledQueryPlan,
    );
    if (!input.rows.length) return { ...fallback, summary: '当前筛选范围内没有匹配数据。' };
    if (
      this.shouldUseDeterministicAnswer(
        input.rows,
        input.requiredAnswerFacts ?? [],
        input.controlledQueryPlan,
      )
    ) {
      return { ...fallback, compositionMode: 'deterministic' };
    }
    try {
      const sampledRows = this.sampleRows(input.rows, input.controlledQueryPlan);
      const messages = buildAnswerMessages({
        question: input.question,
        explanation: input.explanation,
        rows: sampledRows,
        totalRowCount: input.rows.length,
        rowsSampled: sampledRows.length,
        sources: input.selectedViews.map((view) => view.label),
        timeRange: input.timeRange,
        storeScope: `门店 ${input.context.storeId}`,
        truncated: input.truncated,
        assumptions: input.assumptions,
        requiredAnswerFacts: input.requiredAnswerFacts,
        controlledQueryPlan: input.controlledQueryPlan,
      });
      const result = await this.aiService.generateStructured<AskDataAnswer>({
        scenario: 'ask_data_free_sql_answer',
        messages,
        allowFallback: true,
        fallbackMessages: messages,
        schema: ASK_DATA_ANSWER_SCHEMA,
        timeoutMs: this.answerTimeoutMs(),
        temperature: 0,
        userId: input.context.userId,
        storeId: input.context.storeId,
      });
      const answer = this.applyGovernedCaveats(
        this.normalize(result.data, fallback),
        input.controlledQueryPlan,
      );
      const grounded = this.isGrounded(answer, input.rows, input.timeRange);
      const complete = this.isComplete(answer, input.requiredAnswerFacts ?? [], input.rows, input.controlledQueryPlan);
      const scopeFailure = detectAskDataAnswerScopeFailure(answer, {
        rows: input.rows,
        nonNullableRequiredFields: input.controlledQueryPlan?.aggregations
          ?.filter((aggregation) => aggregation.zeroOnEmpty)
          .map((aggregation) => aggregation.alias),
      });
      return grounded && complete && !scopeFailure
        ? { ...answer, compositionMode: 'model' }
        : {
            ...fallback,
            compositionMode: 'deterministic_fallback',
            caveats: [
              ...fallback.caveats,
              scopeFailure
                ? '模型总结错误声明无法完成查询，已回退为确定性摘要。'
                : grounded
                  ? '模型总结未覆盖查询要求的全部事实，已回退为确定性摘要。'
                  : '模型总结包含结果外数字，已回退为确定性摘要。',
            ],
          };
    } catch {
      return { ...fallback, compositionMode: 'deterministic_fallback' };
    }
  }

  private normalize(value: AskDataAnswer, fallback: AskDataAnswer): AskDataAnswer {
    return {
      summary: String(value?.summary ?? '').trim() || fallback.summary,
      keyFindings: Array.isArray(value?.keyFindings)
        ? value.keyFindings
            .map(String)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 5)
        : [],
      caveats: Array.isArray(value?.caveats)
        ? value.caveats
            .map(String)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 5)
        : fallback.caveats,
      displayMode: ['table', 'ranking', 'trend', 'metric'].includes(value?.displayMode)
        ? value.displayMode
        : fallback.displayMode,
      coveredFacts: Array.isArray(value?.coveredFacts)
        ? value.coveredFacts.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12)
        : [],
    };
  }

  private applyGovernedCaveats(answer: AskDataAnswer, plan?: AnswerQueryPlan): AskDataAnswer {
    const metricKeys = new Set(plan?.metricKeys ?? []);
    const caveats = [...answer.caveats];
    const add = (value: string) => {
      if (!caveats.includes(value)) caveats.push(value);
    };
    if ([...metricKeys].some((metricKey) => metricKey.startsWith('supplier_'))) {
      add('供应商报价为当前门店商品映射下的已审批报价，不等于最终采购成交价。');
    }
    if (metricKeys.has('supplier_price_comparison')) {
      add('最低已审批报价只代表同商品价格比较，不代表质量或综合性价比，也不构成更换供应商建议。');
    }
    return { ...answer, caveats: caveats.slice(0, 5) };
  }

  private sampleRows(rows: Array<Record<string, unknown>>, plan?: AnswerQueryPlan) {
    const limit = 24;
    if (rows.length <= limit) return rows;
    if (plan?.answerShape !== 'trend') return rows.slice(0, limit);
    const indexes = new Set<number>([0, rows.length - 1]);
    for (let position = 1; position < limit - 1; position += 1) {
      indexes.add(Math.round((position * (rows.length - 1)) / (limit - 1)));
    }
    return [...indexes].sort((left, right) => left - right).slice(0, limit).map((index) => rows[index]);
  }

  private answerTimeoutMs() {
    const parsed = Number(process.env.ASK_DATA_FREE_SQL_ANSWER_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 12000;
  }

  private fallback(
    question: string,
    rows: Array<Record<string, unknown>>,
    truncated: boolean,
    requiredAnswerFacts: string[],
    plan?: AnswerQueryPlan,
    selectedViews: ReadOnlySqlView[] = [],
  ): AskDataAnswer {
    const first = rows[0] ?? {};
    const preferredFields = plan?.requiredOutputFields?.filter((field) => field in first) ?? [];
    const displayFields = this.orderDisplayFields(
      question,
      preferredFields.length ? preferredFields : Object.keys(first),
      plan,
    );
    const displayFieldLimit = rows.length === 1 ? 8 : 5;
    const fieldLabels = this.fieldLabels(selectedViews);
    const values = displayFields
      .slice(0, displayFieldLimit)
      .map((key) => [key, first[key]] as const)
      .map(([key, value]) => {
        const formatted = this.formatValue(key, value);
        return formatted === undefined ? undefined : `${this.fieldLabel(key, fieldLabels)}=${formatted}`;
      })
      .filter((item): item is string => Boolean(item));
    const keyFindings = rows
      .slice(0, 5)
      .map((row) => displayFields
        .slice(0, displayFieldLimit)
        .map((key) => {
          const formatted = this.formatValue(key, row[key]);
          return formatted === undefined ? undefined : `${this.fieldLabel(key, fieldLabels)}=${formatted}`;
        })
        .filter((item): item is string => Boolean(item))
        .join('、'))
      .filter(Boolean);
    const coveredFacts = requiredAnswerFacts.filter((fact) => this.rowsSupportFact(fact, rows, plan));
    const insufficientTrend = plan?.answerShape === 'trend' && rows.length === 1 && this.hasTimeDimension(rows);
    const summary = insufficientTrend
      ? `当前范围仅查询到 1 个趋势点，数据不足以形成变化结论；该点为 ${values.join('、')}。`
      : rows.length
        ? rows.length === 1
          ? `查询结果为${values.length ? `：${values.join('、')}` : ' 1 条记录'}。`
          : `已查询到 ${rows.length} 条结果${values.length ? `，首条为 ${values.join('、')}` : ''}。`
        : '当前筛选范围内没有匹配数据。';
    return {
      summary,
      keyFindings,
      caveats: [
        ...(insufficientTrend ? ['仅有一个有效趋势点，数据不足以判断变化方向。'] : []),
        ...(truncated ? ['结果超过展示上限，当前仅展示前 100 条。'] : []),
        ...(/每个月|逐月/.test(question) && rows.length < 2
          ? ['当前有记录的完整月份不足两个，不能据此代表通常的月均水平。']
          : []),
      ],
      displayMode:
        plan?.answerShape === 'ranking'
          ? 'ranking'
          : plan?.answerShape === 'trend'
            ? 'trend'
            : rows.length === 1
              ? 'metric'
              : 'table',
      coveredFacts,
      compositionMode: 'deterministic_fallback',
    };
  }

  private shouldUseDeterministicAnswer(
    rows: Array<Record<string, unknown>>,
    requiredFacts: string[],
    plan?: AnswerQueryPlan,
  ) {
    if (process.env.ASK_DATA_FREE_SQL_DETERMINISTIC_ANSWER_ENABLED === 'false') return false;
    if (!plan || !['scalar', 'list'].includes(plan.answerShape ?? '')) return false;
    if (plan.comparisonMode || plan.answerShape === 'trend' || plan.answerShape === 'ranking') return false;
    if (requiredFacts.some((fact) => fact.startsWith('comparison_') || fact.startsWith('trend_') || fact.startsWith('ranking_'))) {
      return false;
    }
    return requiredFacts.every((fact) => this.rowsSupportFact(fact, rows, plan));
  }

  private fieldLabels(views: ReadOnlySqlView[]) {
    return new Map(
      views.flatMap((view) => (view.fields ?? []).map((field) => [field.name, field.description] as const)),
    );
  }

  private fieldLabel(key: string, labels: Map<string, string>) {
    const exact = labels.get(key);
    if (exact) return exact.split(/[；;]/)[0]?.trim() || exact;
    const known: Record<string, string> = {
      count: '数量',
      total_count: '总数',
      total_amount: '总金额',
      current_amount: '本期金额',
      previous_amount: '上期金额',
      difference: '差额',
      trend_day: '日期',
      trend_month: '月份',
      period_day: '日期',
      period_month: '月份',
      settlement_day: '结算日期',
      business_date: '业务日期',
      work_date: '排班日期',
      effect_date: '效果日期',
      snapshot_date: '快照日期',
      latest_task_at: '最近任务时间',
      latest_event_at: '最近事件时间',
      confirmed_at: '确认时间',
      consumed_quantity: '消耗数量',
      current_stock: '当前库存',
      movement_quantity: '库存变动数量',
      movement_count: '库存流水笔数',
      sales_quantity: '销售数量',
      net_sales_amount: '净销售额',
      service_count: '服务次数',
      project_revenue: '项目净销售额',
      net_revenue: '订单净收入',
      net_receipts: '日结净收',
      payment_amount: '支付金额',
      refund_amount: '退款金额',
      flow_count: '支付退款记录数',
      operating_revenue: '营业收入',
      gross_profit: '毛利',
      operating_profit: '经营利润',
      gross_margin_rate: '毛利率',
      operating_margin_rate: '经营利润率',
      task_count: '任务数',
      completed_count: '完成数',
      completion_rate: '完成率',
      lead_count: '线索数',
      conversion_count: '转化数',
      conversion_rate: '转化率',
      arrival_conversion_rate: '预约到店转化率',
      utilization_rate: '工时利用率',
      deviation_rate: '耗材偏差率',
      inventory_loss_rate: '库存损耗率',
      refund_rate: '退款率',
      roi: '投入产出比',
      category_name: '商品品类',
      top_score: '机会评分',
      total_balance: '储值总余额',
      stored_value_liability: '储值负债',
      card_liability: '次卡负债',
      activity_id: '活动 ID',
      activity_title: '活动名称',
      promotion_id: '优惠 ID',
      promotion_name: '优惠名称',
      average_order_value: '平均客单价',
      average_procurement_amount: '平均采购金额',
      average_loss_amount: '平均损耗金额',
      average_rating: '平均评分',
      average_return_interval_days: '平均复购间隔天数',
      acquisition_cost: '获客成本',
      material_cost_rate: '耗材成本率',
      marketing_profit: '营销收益差额',
      payment_order_difference: '到账与开单差额',
      current_period_net_revenue: '本期订单净收入',
      previous_period_net_revenue: '上期订单净收入',
      revenue_difference: '订单收入差额',
      current_period_refund_amount: '本期退款金额',
      previous_period_refund_amount: '上期退款金额',
      refund_amount_difference: '退款金额差额',
      current_period_cost: '本期经营成本',
      previous_period_cost: '上期经营成本',
      cost_difference: '经营成本差额',
      current_period_paid_amount: '本期员工业绩',
      previous_period_paid_amount: '上期员工业绩',
      paid_amount_difference: '员工业绩增量',
      cash_payment_amount: '现金收款',
      wechat_payment_amount: '微信收款',
      alipay_payment_amount: '支付宝收款',
      bank_card_payment_amount: '银行卡收款',
      member_balance_payment_amount: '会员余额支付',
      inbound_transfer_count: '调入单数量',
      outbound_transfer_count: '调出单数量',
      transfer_count_difference: '调拨单数量差额',
      face_reservation_count: '面部项目预约数',
      body_reservation_count: '身体项目预约数',
      completed_reservation_count: '已到店预约数',
      scrap_out_quantity: '报废出库数量',
      outbound_quantity: '出库数量',
      abnormal_record_count: '异常记录数',
      latest_feedback_at: '最近反馈时间',
    };
    if (known[key]) return known[key];
    if (!labels.size) return key;
    return key
      .replace(/_id$/, ' ID')
      .replace(/_count$/, '数量')
      .replace(/_amount$/, '金额')
      .replace(/_rate$/, '率')
      .replace(/_ratio$/, '占比')
      .replace(/_/g, ' ');
  }

  private orderDisplayFields(
    question: string,
    fields: string[],
    plan?: AnswerQueryPlan,
  ) {
    const available = new Set(fields);
    const ordered: string[] = [];
    const add = (...candidates: string[]) => {
      for (const candidate of candidates) {
        if (available.has(candidate) && !ordered.includes(candidate)) ordered.push(candidate);
      }
    };

    if (/客户|会员|顾客/.test(question)) add('customer_id', 'customer_name_masked');
    if (/员工|美容师/.test(question)) add('staff_id', 'staff_name', 'beautician_id', 'beautician_name');
    if (/品类|分类/.test(question)) add('category_name');
    if (/商品|产品|耗材/.test(question)) add('product_name');
    if (/sku/i.test(question)) add('product_sku', 'sku');
    if (/供应商/.test(question)) add('supplier_name');
    if (/项目|护理/.test(question)) add('project_name');
    if (/活动/.test(question)) add('activity_title', 'activity_name');

    if (/报价.*(?:差额|差多少)|最低报价.*(?:差额|差多少)/.test(question)) {
      add('quote_price', 'lowest_current_quote_price', 'price_difference_from_lowest', 'price_premium_rate');
    } else if (/报价|价格/.test(question)) {
      add('quote_price', 'lowest_current_quote_price');
    }
    if (/最低采购量|最小采购量|起订量|moq/i.test(question)) add('minimum_order_quantity');
    if (/含税/.test(question)) add('tax_included');
    if (/库存状态|供应商库存/.test(question)) add('stock_status', 'available_stock');
    if (/账期|付款条件|月结条款/.test(question)) add('payment_terms');
    if (/结算方式/.test(question)) add('settlement_mode');
    if (/报价交期|供应商交期|交付天数|供货要几天|交货周期/.test(question)) add('lead_days');
    if (/(?:首选|优选)供应商/.test(question)) add('is_preferred_supplier');

    for (const aggregation of plan?.aggregations ?? []) add(aggregation.alias);
    for (const field of fields.filter((field) => /_name(?:_masked)?$/.test(field))) add(field);
    for (const field of fields.filter((field) => !/_id$/.test(field) && !/(?:^|_)sku$/i.test(field))) add(field);
    if (/\b(?:id|编号)\b/i.test(question)) add(...fields.filter((field) => /_id$/.test(field)));
    return ordered;
  }

  private isComplete(
    answer: AskDataAnswer,
    requiredFacts: string[],
    rows: Array<Record<string, unknown>>,
    plan?: AnswerQueryPlan,
  ) {
    const covered = new Set(answer.coveredFacts);
    return requiredFacts.every((fact) => {
      if (!covered.has(fact) || !this.rowsSupportFact(fact, rows, plan)) return false;
      if (fact === 'trend_points' && rows.length < 2) return this.disclosesInsufficientTrend(answer);
      return true;
    });
  }

  private rowsSupportFact(
    fact: string,
    rows: Array<Record<string, unknown>>,
    plan?: AnswerQueryPlan,
  ) {
    if (['metric_value', 'data_policy', 'time_range', 'ranking_order', 'ranking_limit', 'list_items'].includes(fact)) {
      return rows.length > 0;
    }
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    if (fact === 'trend_granularity') return rows.length > 0 && this.hasTimeDimension(rows);
    if (fact === 'trend_points') return rows.length > 0 && this.hasTimeDimension(rows);
    if (fact === 'comparison_current') {
      return keys.some((key) => /current|本期|当前/.test(key)) ||
        (plan?.comparisonMode === 'multi_metric' && this.numericColumnCount(rows) >= 2) ||
        (plan?.comparisonMode === 'dimension' && rows.length >= 2 && this.numericColumnCount(rows) >= 1);
    }
    if (fact === 'comparison_previous') {
      return keys.some((key) => /previous|prior|上期|上月|去年/.test(key)) ||
        (plan?.comparisonMode === 'multi_metric' && this.numericColumnCount(rows) >= 2) ||
        (plan?.comparisonMode === 'dimension' && rows.length >= 2 && this.numericColumnCount(rows) >= 1);
    }
    if (fact === 'comparison_difference') {
      return keys.some((key) => /difference|diff|change|growth|差额|变化|同比|环比/.test(key)) ||
        (plan?.comparisonMode === 'multi_metric' && this.numericColumnCount(rows) >= 2) ||
        (plan?.comparisonMode === 'dimension' && rows.length >= 2 && this.numericColumnCount(rows) >= 1);
    }
    if (fact === 'all_requested_metrics') {
      const aggregationAliases = plan?.aggregations?.length
        ? plan.aggregations.map((aggregation) => aggregation.alias)
        : (plan?.requiredOutputFields ?? []).filter((field) => rows.some((row) => this.isNumericValue(row[field])));
      const presentAliases = aggregationAliases.filter((alias) => rows.some((row) => this.isNumericValue(row[alias])));
      return presentAliases.length >= Math.max(2, plan?.metricKeys?.length ?? 2);
    }
    if (fact === 'all_requested_dimensions') {
      const required = plan?.requiredOutputFields ?? [];
      return required.length > 1 && required.every((field) => keys.includes(field));
    }
    return true;
  }

  private hasTimeDimension(rows: Array<Record<string, unknown>>) {
    return [...new Set(rows.flatMap((row) => Object.keys(row)))].some((key) => /date|day|week|month|period|time/.test(key));
  }

  private disclosesInsufficientTrend(answer: AskDataAnswer) {
    return /数据不足|不足以|仅有一个|只有一个|仅查询到\s*1\s*个/.test(
      [answer.summary, ...answer.keyFindings, ...answer.caveats].join(' '),
    );
  }

  private numericColumnCount(rows: Array<Record<string, unknown>>) {
    const first = rows[0] ?? {};
    return Object.values(first).filter((value) => this.isNumericValue(value)).length;
  }

  private isNumericValue(value: unknown) {
    return typeof value === 'number' || (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value));
  }

  private isGrounded(answer: AskDataAnswer, rows: Array<Record<string, unknown>>, timeRange: string) {
    return isAskDataAnswerGrounded(answer, rows, timeRange);
  }

  private formatValue(key: string, value: unknown) {
    if (value === null || value === undefined || value === '') return undefined;
    const governedTextLabels: Record<string, Record<string, string>> = {
      slow_moving_status: {
        no_outbound_90d: '近 90 天无出库',
        low_turnover: '低周转',
        moving: '正常流动',
      },
      replenishment_fact_status: {
        below_safety_no_open_procurement: '达到安全库存预警且无未完成采购',
        below_safety_with_open_procurement: '达到安全库存预警且已有未完成采购',
        covered: '库存与采购覆盖正常',
      },
      turnover_policy: {
        operational_event_weighted_not_financial_turnover: '库存事件加权运营口径（非财务会计周转率）',
      },
      cost_policy: {
        catalog_cost_estimated_not_batch_actual: '商品档案成本估算（非批次实际成本）',
      },
      tax_included: {
        true: '含税',
        false: '未含税',
      },
      stock_status: {
        available: '可供货',
        limited: '库存紧张',
        out_of_stock: '无库存',
        unavailable: '不可供货',
      },
      settlement_mode: {
        monthly: '月结',
        prepay: '预付',
        cod: '货到付款',
        per_order: '逐单结算',
      },
      is_preferred_supplier: {
        true: '是',
        false: '否',
      },
    };
    const governedText = governedTextLabels[key]?.[String(value)];
    if (governedText) return governedText;
    if (value instanceof Date) return this.formatBusinessDate(value.toISOString(), key);
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      return this.formatBusinessDate(value, key);
    }
    const numeric = typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
        ? Number(value)
        : undefined;
    if (numeric !== undefined && Number.isFinite(numeric)) {
      if (/_rate$|_ratio$|utilization_rate$/.test(key)) return `${this.formatNumber(numeric * 100, 2)}%`;
      if (key === 'roi') return this.formatNumber(numeric, 2);
      if (/(?:amount|revenue|profit|cost|balance|receipts|liability|stock_value|price|price_difference_from_lowest)$/.test(key)) {
        return `${this.formatNumber(numeric, 2)} 元`;
      }
      if (/(?:count|quantity|times|minutes|duration|capacity|current_stock|standard_qty|actual_qty|deviation_qty)$/.test(key)) {
        return this.formatNumber(numeric, Number.isInteger(numeric) ? 0 : 2);
      }
      return this.formatNumber(numeric, Number.isInteger(numeric) ? 0 : 2);
    }
    return String(value).slice(0, 40);
  }

  private formatNumber(value: number, maximumFractionDigits: number) {
    return value.toFixed(maximumFractionDigits).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  }

  private formatBusinessDate(value: string, key: string) {
    const iso = value.replace(' ', 'T');
    if (/(?:date|day|month)$/.test(key) || /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z?)?$/.test(value)) {
      return iso.slice(0, 10);
    }
    return iso.slice(0, 16).replace('T', ' ');
  }
}
