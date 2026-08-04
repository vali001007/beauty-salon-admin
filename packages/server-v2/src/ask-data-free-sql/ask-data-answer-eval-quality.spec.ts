import { detectAskDataAnswerScopeFailure, isAskDataAnswerGrounded } from './ask-data-answer-eval-quality.js';

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
});
