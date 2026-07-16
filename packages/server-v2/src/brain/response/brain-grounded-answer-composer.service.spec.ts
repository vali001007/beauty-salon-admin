import { BrainAnswerCompletionGuardService } from './brain-answer-completion-guard.service.js';
import { BrainGroundedAnswerComposerService } from './brain-grounded-answer-composer.service.js';

describe('BrainGroundedAnswerComposerService', () => {
  const composer = new BrainGroundedAnswerComposerService(new BrainAnswerCompletionGuardService());

  it('builds cited ranking and evidence blocks from verified observations', () => {
    const result = composer.compose({
      observations: [observation({
        data: { blocks: [{ kind: 'ranking', rows: [{ name: 'A', value: 2 }, { name: 'B', value: 1 }], columns: ['name', 'value'] }], metadata: {}, suggestedActions: [] },
      })],
      completion: { status: 'complete', missingCriteria: [] },
    });
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ranking', rows: expect.any(Array), citationIds: ['metric.sales@1'] }),
      expect.objectContaining({ kind: 'evidence' }),
    ]));
    expect(result.answer).toContain('1. 名称=A，数值=2');
    expect(result.answer).not.toContain('结构化结果见下方');
  });

  it('projects every supported structured block into readable fallback text', () => {
    const result = composer.compose({
      observations: [observation({
        data: {
          blocks: [
            { kind: 'kpi', items: [{ label: '实收', value: '100.00 元', hint: '本月' }] },
            { kind: 'table', rows: [{ customer: '张三', amount: 88 }], columns: ['customer', 'amount'] },
            { kind: 'chart', chartType: 'line', rows: [{ date: '2026-07-15', revenue: 100 }], xKey: 'date', yKeys: ['revenue'] },
            { kind: 'comparison', items: [{ label: '实收', current: '100 元', previous: '80 元', delta: '+20 元' }] },
            { kind: 'diagnosis', findings: [{ title: '退款上升', detail: '需要复核两笔退款', severity: 'warning' }] },
            { kind: 'clarification', question: '请选择门店', options: [{ id: '6', label: 'Ami 全量演示门店', value: 6 }] },
            { kind: 'limitations', items: ['不会创建或提交真实采购单'] },
          ],
          metadata: {},
          suggestedActions: [{ type: 'preview_action' }],
        },
      })],
      completion: { status: 'incomplete', missingCriteria: ['缺少昨日库存快照'] },
    });

    expect(result.answer).toContain('实收：100.00 元（本月）');
    expect(result.answer).toContain('客户=张三，金额=88');
    expect(result.answer).toContain('趋势数据');
    expect(result.answer).toContain('日期=2026-07-15，实收=100.00');
    expect(result.answer).toContain('当前 100 元，上一期 80 元，变化 +20 元');
    expect(result.answer).toContain('[预警] 退款上升');
    expect(result.answer).toContain('需要确认：请选择门店');
    expect(result.answer).toContain('待确认操作：共 1 项，尚未执行');
    expect(result.answer).toContain('未完成范围：缺少昨日库存快照');
    expect(result.answer).toContain('不会创建或提交真实采购单');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'chart' }),
      expect.objectContaining({ kind: 'comparison' }),
      expect.objectContaining({ kind: 'diagnosis' }),
      expect.objectContaining({ kind: 'clarification' }),
    ]));
  });

  it('keeps a valid one-row ranking and preserves independent partial-completion limitations', () => {
    const result = composer.compose({
      observations: [observation({ data: { blocks: [{ kind: 'ranking', rows: [{ name: 'A' }], columns: ['name'] }], metadata: {}, suggestedActions: [] } })],
      completion: { status: 'incomplete', missingCriteria: ['no_data:finance'] },
    });
    expect(result.blocks.some((block) => block.kind === 'ranking')).toBe(true);
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'limitations', items: ['no_data:finance'] }),
    ]));
  });

  it('accepts a complete one-row ranking without inventing a missing-result limitation', () => {
    const result = composer.compose({
      observations: [observation({ data: { blocks: [{ kind: 'ranking', rows: [{ name: '唯一低库存商品' }], columns: ['name'] }], metadata: {}, suggestedActions: [] } })],
      completion: { status: 'complete', missingCriteria: [] },
    });
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ranking', rows: [{ name: '唯一低库存商品' }] }),
    ]));
    expect(result.blocks.some((block) => block.kind === 'limitations')).toBe(false);
  });

  it('preserves the requested ranking shape and a grounded summary when the result has no rows', () => {
    const result = composer.compose({
      observations: [observation({
        status: 'no_data',
        grounding: 'db_skill',
        summary: '今天现金、微信和支付宝均没有实收记录。',
        data: { blocks: [{ kind: 'ranking', rows: [], columns: ['paymentMethod', 'amount'] }], metadata: {}, suggestedActions: [] },
        citations: [{ sourceType: 'db_skill', sourceId: 'finance_payment_breakdown' }],
      })],
      completion: { status: 'complete', missingCriteria: [] },
    });

    expect(result.answer).toContain('现金、微信和支付宝均没有实收记录');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ranking', rows: [], columns: ['paymentMethod', 'amount'] }),
      expect.objectContaining({ kind: 'text', text: expect.stringContaining('现金、微信和支付宝') }),
      expect.objectContaining({ kind: 'limitations', items: ['no_data:ranking'] }),
    ]));
    expect(result.answer).toContain('当前时间范围没有可排行的数据');
  });

  it('renders governed employee fields with product-facing Chinese labels and stable values', () => {
    const result = composer.compose({
      observations: [observation({
        data: {
          blocks: [{
            kind: 'ranking',
            rows: [{
              staff: '唐伊',
              performanceScore: 82.5,
              serviceCount: 8,
              uniqueCustomerCount: 6,
              repeatCustomerCount: 2,
              revenueAmount: 1234.5,
              commissionAmount: 123.45,
              timeOffHours: 0,
              nextAvailableAt: '',
            }],
            columns: [
              'staff',
              'performanceScore',
              'serviceCount',
              'uniqueCustomerCount',
              'repeatCustomerCount',
              'revenueAmount',
              'commissionAmount',
              'timeOffHours',
              'nextAvailableAt',
            ],
          }],
          metadata: {},
          suggestedActions: [],
        },
      })],
      completion: { status: 'complete', missingCriteria: [] },
    });

    expect(result.answer).toContain('员工表现评分=82.5');
    expect(result.answer).toContain('服务客户数=6');
    expect(result.answer).toContain('业绩实收=1234.50');
    expect(result.answer).toContain('提成金额=123.45');
    expect(result.answer).toContain('下次可用时间=暂无');
    expect(result.answer).not.toContain('performanceScore');
  });

  it('renders customer source rankings with product-facing Chinese labels', () => {
    const result = composer.compose({
      observations: [observation({
        data: {
          blocks: [{
            kind: 'ranking',
            rows: [{ customerSource: 'Ami Glow', newCustomerCount: 2, share: '66.7%' }],
            columns: ['customerSource', 'newCustomerCount', 'share'],
          }],
          metadata: {},
          suggestedActions: [],
        },
      })],
      completion: { status: 'complete', missingCriteria: [] },
    });

    expect(result.answer).toContain('客户来源=Ami Glow');
    expect(result.answer).toContain('新客数=2');
    expect(result.answer).toContain('占比=66.7%');
    expect(result.answer).not.toContain('customerSource');
  });

  it('renders daily comparisons and package audiences without internal field names', () => {
    const result = composer.compose({
      observations: [observation({
        data: {
          blocks: [
            {
              kind: 'ranking',
              rows: [{ day: '周三', currentDate: '2026-07-15', currentRevenue: 4904, previousDate: '2026-07-08', previousRevenue: 741.7, delta: '+4162.30 元' }],
              columns: ['day', 'currentDate', 'currentRevenue', 'previousDate', 'previousRevenue', 'delta'],
            },
            {
              kind: 'table',
              rows: [{ customerName: '马美琳', memberLevel: '钻石会员', totalSpent: 196626, matchReason: '高价值客户初筛' }],
              columns: ['customerName', 'memberLevel', 'totalSpent', 'matchReason'],
            },
            {
              kind: 'ranking',
              rows: [{ projectName: '射频紧致提升护理', projectType: '仪器护理', price: 739, recommended: false }],
              columns: ['projectName', 'projectType', 'price', 'recommended'],
            },
          ],
          metadata: {},
          suggestedActions: [],
        },
      })],
      completion: { status: 'complete', missingCriteria: [] },
    });

    expect(result.answer).toContain('星期=周三，本期日期=2026-07-15，本期实收=4904.00，上期日期=2026-07-08，上期实收=741.70，差额=+4162.30 元');
    expect(result.answer).toContain('客户=马美琳，会员等级=钻石会员，累计消费=196626.00，匹配依据=高价值客户初筛');
    expect(result.answer).toContain('项目=射频紧致提升护理，项目类型=仪器护理，价格=739.00，门店推荐=否');
    expect(result.answer).not.toMatch(/customerName|currentRevenue|projectType|recommended=/);
  });

  it('renders semantic product rankings with Chinese labels without exposing internal ids', () => {
    const result = composer.compose({
      observations: [observation({
        data: {
          blocks: [{
            kind: 'ranking',
            rows: [{ productId: 86, productName: '抗衰紧致眼霜', product_sales_quantity: 26 }],
            columns: ['productId', 'productName', 'product_sales_quantity'],
          }],
          metadata: {},
          suggestedActions: [],
        },
      })],
      completion: { status: 'complete', missingCriteria: [] },
    });

    expect(result.answer).toContain('商品=抗衰紧致眼霜，销量=26');
    expect(result.answer).not.toContain('productId');
    expect(result.answer).not.toContain('product_sales_quantity');
  });

  it('rejects arbitrary HTML and factual blocks without citations', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertValid({ answer: 'x', citations: [], suggestedActions: [], completion: { status: 'complete', missingCriteria: [] }, blocks: [{ kind: 'text', text: '<script>alert(1)</script>' }] })).toThrow('brain_response_html_forbidden');
    expect(() => guard.assertValid({ answer: 'x', citations: [], suggestedActions: [], completion: { status: 'complete', missingCriteria: [] }, blocks: [{ kind: 'kpi', items: [{ label: '收入', value: '1' }] }] })).toThrow('brain_response_citation_required:kpi');
  });
});

function observation(overrides: Record<string, unknown> = {}) {
  return {
    nodeId: 'ranking', capabilityKey: 'ranking', capabilityVersion: 1, status: 'completed', grounding: 'metric_query', summary: '排行完成',
    data: { blocks: [], metadata: {}, suggestedActions: [] }, citations: [{ sourceType: 'business_definition', sourceId: 'metric.sales@1' }],
    startedAt: new Date(0).toISOString(), completedAt: new Date(1).toISOString(), ...overrides,
  } as any;
}
