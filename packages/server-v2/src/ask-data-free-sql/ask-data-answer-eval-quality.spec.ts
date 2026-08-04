import {
  detectAskDataAnswerContractFailure,
  detectAskDataAnswerScopeFailure,
  isAskDataAnswerGrounded,
} from './ask-data-answer-eval-quality.js';

describe('Ami Ask answer evaluation quality gate', () => {
  it.each([
    '数据无法判断本季度连带销售的订单比例。',
    '当前结果仅显示库存合计，无法识别具体哪些产品。',
    '缺少订单级判定字段，无法计算其订单比例。',
  ])('rejects an answer that explicitly admits it did not answer the question: %s', (summary) => {
    expect(detectAskDataAnswerScopeFailure({ summary, keyFindings: [], caveats: [] })).toContain('回答未完成问题要求');
  });

  it('accepts a grounded no-event conclusion without an unresolved-scope admission', () => {
    expect(detectAskDataAnswerScopeFailure({
      summary: '今天现金收款为 0 元，共 0 笔。',
      keyFindings: ['现金收款 0 元'],
      caveats: ['仅统计当前门店已入账支付记录。'],
    })).toBeUndefined();
  });

  it('accepts an honest single-point trend limitation', () => {
    expect(detectAskDataAnswerScopeFailure({
      summary: '当前范围仅查询到 1 个趋势点，数据不足以形成变化结论。',
      keyFindings: ['该点库存净变化为 -95.1。'],
      caveats: ['仅有一个有效趋势点，数据不足以判断变化方向。'],
    })).toBeUndefined();
  });

  it('rejects a required zero-safe metric that is still null', () => {
    expect(detectAskDataAnswerScopeFailure(
      { summary: '库存变动数量=-、库存流水笔数=0。', keyFindings: [], caveats: [] },
      {
        rows: [{ movement_quantity: null, movement_count: 0 }],
        nonNullableRequiredFields: ['movement_quantity'],
      },
    )).toContain('movement_quantity');
  });

  it('accepts rounded currency and percentage presentation grounded in raw rows', () => {
    expect(isAskDataAnswerGrounded(
      { summary: '营销成本为 7330 元，转化率为 12.35%。', keyFindings: [] },
      [{ marketing_cost: '7330.000000', conversion_rate: '0.123456789' }],
      '2026-07-01 至 2026-08-01',
    )).toBe(true);
  });

  it('does not accept a hundredfold numeric claim without a percentage sign', () => {
    expect(isAskDataAnswerGrounded(
      { summary: '投入产出比为 100。', keyFindings: [] },
      [{ roi: 1 }],
      '2026-07-01 至 2026-08-01',
    )).toBe(false);
  });

  it('grounds a PostgreSQL date by its Asia/Shanghai calendar day instead of the UTC serialization day', () => {
    expect(isAskDataAnswerGrounded(
      { summary: '月份为 2026-05-01，贡献毛利为 130 元。', keyFindings: [] },
      [{ trend_month: new Date('2026-04-30T16:00:00.000Z'), contribution_margin: 130 }],
      '2026-05-01 至 2026-08-04',
    )).toBe(true);
  });

  it('rejects a calendar date that is absent from both rows and the governed time range', () => {
    expect(isAskDataAnswerGrounded(
      { summary: '月份为 2026-06-01，贡献毛利为 130 元。', keyFindings: [] },
      [{ trend_month: new Date('2026-04-30T16:00:00.000Z'), contribution_margin: 130 }],
      '2026-05-01 至 2026-05-31',
    )).toBe(false);
  });

  it('grounds a timestamp by the store business day instead of its UTC day', () => {
    expect(isAskDataAnswerGrounded(
      { summary: '退款时间为 2026-07-13 07:10，退款金额为 298 元。', keyFindings: [] },
      [{ refunded_at: new Date('2026-07-12T23:10:00.000Z'), refund_amount: 298 }],
      '2026-07-01 至 2026-08-01',
    )).toBe(true);
  });

  it('rejects a refund detail answer that substitutes payment fields for refund facts', () => {
    expect(detectAskDataAnswerContractFailure(
      {
        summary: '支付金额=298 元、支付时间=2026-07-13 06:20。',
        keyFindings: [],
        caveats: [],
      },
      {
        question: '帮我生成一份退款明细报告',
        rows: [{
          refund_amount: 298,
          refunded_at: new Date('2026-07-12T23:10:00.000Z'),
          refund_status: 'completed',
          refund_reason_category: 'customer_request',
        }],
        requiredOutputFields: ['refund_amount', 'refunded_at', 'refund_status', 'refund_reason_category'],
        requiredAnswerFacts: ['metric_value', 'data_policy', 'amount_unit', 'list_items'],
        metricKeys: ['payment_flow'],
      },
    )).toContain('refund_amount');
  });

  it('rejects a refund answer that only reports a technical estimate counter', () => {
    expect(detectAskDataAnswerContractFailure(
      {
        summary: '查询结果为：estimated cost event数量=0。',
        keyFindings: ['estimated cost event数量=0'],
        caveats: [],
      },
      {
        question: '本月商品退款冲减了多少收入和成本',
        rows: [{ refund_amount: 0, attributed_cost: 0, estimated_cost_event_count: 0, cost_missing_event_count: 0 }],
        requiredOutputFields: ['refund_amount', 'attributed_cost', 'estimated_cost_event_count', 'cost_missing_event_count'],
        requiredAnswerFacts: ['metric_value', 'data_policy', 'amount_unit'],
        metricKeys: ['item_contribution_margin'],
      },
    )).toContain('refund_amount');
  });

  it('rejects a product-versus-project comparison that drops both dimension labels', () => {
    expect(detectAskDataAnswerContractFailure(
      {
        summary: '已查询到 2 条结果，首条贡献毛利为 2028.35 元。',
        keyFindings: ['贡献毛利=2028.35 元', '贡献毛利=9884.69 元'],
        caveats: ['贡献毛利=已识别净收入-可归属商品或耗材成本，不含提成和经营费用，不等同于经营利润。'],
      },
      {
        question: '产品销售和服务项目毛利哪个高',
        rows: [
          { item_type: 'product', contribution_margin: 2028.35 },
          { item_type: 'project', contribution_margin: 9884.69 },
        ],
        requiredOutputFields: ['item_type', 'contribution_margin'],
        requiredAnswerFacts: ['metric_value', 'data_policy', 'amount_unit', 'all_requested_dimensions'],
        metricKeys: ['item_contribution_margin'],
        dimensions: [{ key: 'item_type', field: 'item_type' }],
      },
    )).toContain('商品维度标签');
  });

  it('rejects contribution-margin answers that hide estimated-cost evidence', () => {
    expect(detectAskDataAnswerContractFailure(
      {
        summary: '商品贡献毛利为 130 元。',
        keyFindings: [],
        caveats: ['贡献毛利=已识别净收入-可归属耗材成本，不含提成和经营费用，不等同于经营利润。'],
      },
      {
        question: '本月商品贡献毛利是多少',
        rows: [{ contribution_margin: 130, estimated_cost_event_count: 2, cost_missing_event_count: 0 }],
        requiredOutputFields: ['contribution_margin', 'estimated_cost_event_count', 'cost_missing_event_count'],
        requiredAnswerFacts: ['metric_value', 'data_policy', 'amount_unit'],
        metricKeys: ['item_contribution_margin'],
      },
    )).toContain('估算成本');
  });
});
