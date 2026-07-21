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

  it('deduplicates the same confirmation action from blocks and suggested actions', () => {
    const action = { actionId: 'act_1', actionType: 'execute_marketing_strategy', requiresConfirmation: true };
    const result = composer.compose({
      observations: [observation({
        data: {
          blocks: [{ kind: 'action_preview', actions: [action] }],
          metadata: {},
          suggestedActions: [action],
        },
      })],
      completion: { status: 'complete', missingCriteria: [] },
    });

    expect(result.blocks.filter((block) => block.kind === 'action_preview')).toHaveLength(1);
    expect(result.suggestedActions).toEqual([action]);
    expect(result.answer.match(/待确认操作/g)).toHaveLength(1);
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

  it('fails closed when a single capability returns the wrong answer shape', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertMatchesIntent(
      { intent: 'draft', answerShape: 'draft' },
      {
        answer: '实收金额为 100 元。',
        citations: [{ sourceType: 'business_definition', sourceId: 'metric.paid_amount@1' }],
        suggestedActions: [],
        completion: { status: 'complete', missingCriteria: [] },
        blocks: [{ kind: 'kpi', items: [{ label: '实收', value: '100 元' }], citationIds: ['metric.paid_amount@1'] }],
      },
    )).toThrow('brain_response_answer_contract_mismatch:draft:text');

    expect(() => guard.assertMatchesIntent(
      { intent: 'ranking', answerShape: 'ranking' },
      { answer: '总计 100 元。', citations: [], suggestedActions: [], completion: { status: 'complete', missingCriteria: [] }, blocks: [] },
    )).toThrow('brain_response_answer_contract_mismatch:ranking:ranking');
  });

  it('accepts a grounded draft text response', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertMatchesIntent(
      { intent: 'draft', answerShape: 'draft' },
      {
        answer: '活动方案：先小范围试发。',
        citations: [{ sourceType: 'skill', sourceId: 'marketing_campaign_plan' }],
        suggestedActions: [],
        completion: { status: 'complete', missingCriteria: [] },
        blocks: [{ kind: 'text', text: '活动方案：先小范围试发。', citationIds: ['marketing_campaign_plan'] }],
      },
    )).not.toThrow();
  });

  it('accepts a grounded empty table as an explicit no-data list result', () => {
    const result = composer.composeDomainAnswer(
      {
        status: 'completed',
        answer: '今天没有找到匹配预约。',
        blocks: [{ kind: 'table', rows: [], columns: ['customerName', 'startTime'] }],
        citations: [{ sourceType: 'db_skill', sourceId: 'beautician_service_summary' }],
        grounding: 'db_skill',
        suggestedActions: [],
        metadata: { capabilityKey: 'beautician_service_overview', capabilityVersion: 1 },
      },
      { intent: 'query', answerShape: 'list' },
    );

    expect(result.answer).toContain('当前没有匹配数据');
    expect(result.answer).toContain('当前时间范围没有匹配的明细数据');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'limitations', items: expect.arrayContaining(['no_data:table']) }),
    ]));
  });

  it('accepts grounded recommendation text with a supporting fact list', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertMatchesIntent(
      { intent: 'recommendation', answerShape: 'diagnosis' },
      {
        answer: '当前没有必须续卡的统一规则，先查看卡项余次。',
        citations: [{ sourceType: 'db_skill', sourceId: 'customer_card_progress' }],
        suggestedActions: [],
        completion: { status: 'complete', missingCriteria: [] },
        blocks: [
          { kind: 'text', text: '当前没有必须续卡的统一规则，先查看卡项余次。', citationIds: ['customer_card_progress'] },
          { kind: 'table', rows: [], columns: ['customerName', 'remainingTimes'], citationIds: ['customer_card_progress'] },
          { kind: 'limitations', items: ['no_data:table'] },
        ],
      },
    )).not.toThrow();
  });

  it('accepts governed guidance when a recommendation is modeled with an action-preview shape', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertMatchesIntent(
      { intent: 'recommendation', answerShape: 'action_preview' },
      {
        answer: '先核对采购明细，再逐行确认一致部分。',
        citations: [{ sourceType: 'template_skill', sourceId: 'inventory_receipt_discrepancy_advice' }],
        suggestedActions: [],
        completion: { status: 'complete', missingCriteria: [] },
        blocks: [{
          kind: 'text',
          text: '先核对采购明细，再逐行确认一致部分。',
          citationIds: ['inventory_receipt_discrepancy_advice'],
        }],
      },
    )).not.toThrow();
  });

  it('accepts a ranking for cross-entity comparison but keeps time comparison strict', () => {
    const guard = new BrainAnswerCompletionGuardService();
    const envelope = {
      answer: '美容师服务次数排行。',
      citations: [{ sourceType: 'db_skill', sourceId: 'manager_staff_analysis' }],
      suggestedActions: [],
      completion: { status: 'complete' as const, missingCriteria: [] },
      blocks: [{
        kind: 'ranking' as const,
        rows: [{ staff: '王美容师', serviceCount: 8 }],
        columns: ['staff', 'serviceCount'],
        citationIds: ['manager_staff_analysis'],
      }],
    };

    expect(() => guard.assertMatchesIntent(
      { intent: 'comparison', answerShape: 'comparison' },
      envelope,
    )).not.toThrow();
    expect(() => guard.assertMatchesIntent(
      {
        intent: 'comparison',
        answerShape: 'comparison',
        comparisonTarget: { type: 'time', timeRange: { label: '上月', timezone: 'Asia/Shanghai' } },
      },
      envelope,
    )).toThrow('brain_response_answer_contract_mismatch:comparison:comparison');
  });

  it('accepts an explicit no-data action result without inventing a confirmation action', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertMatchesIntent(
      { intent: 'workflow', answerShape: 'action_preview' },
      {
        answer: '明天下午没有可补位空档，本轮不生成触达任务。',
        citations: [{ sourceType: 'db_skill', sourceId: 'gap_opportunity_readonly_preview' }],
        suggestedActions: [],
        completion: { status: 'complete', missingCriteria: [] },
        blocks: [
          { kind: 'table', rows: [], columns: ['appointmentWindow'], citationIds: ['gap_opportunity_readonly_preview'] },
          { kind: 'limitations', items: ['no_data:table'] },
        ],
      },
    )).not.toThrow();
  });

  it('accepts cited KPIs as supporting evidence for a recommendation with ranked candidates', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertMatchesIntent(
      { intent: 'recommendation', answerShape: 'list' },
      {
        answer: '建议优先联系评分最高的客户，名单和依据如下。',
        citations: [{ sourceType: 'db_skill', sourceId: 'customer_priority_recommendation' }],
        suggestedActions: [],
        completion: { status: 'complete', missingCriteria: [] },
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: '候选客户', value: '10 人' }],
            citationIds: ['customer_priority_recommendation'],
          },
          {
            kind: 'ranking',
            rows: [{ customerName: '张女士', score: 92 }],
            columns: ['customerName', 'score'],
            citationIds: ['customer_priority_recommendation'],
          },
        ],
      },
    )).not.toThrow();
  });

  it('rejects a recommendation answered only by a scalar KPI', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertMatchesIntent(
      { intent: 'recommendation', answerShape: 'diagnosis' },
      {
        answer: '候选客户 10 人。',
        citations: [{ sourceType: 'db_skill', sourceId: 'customer_priority_recommendation' }],
        suggestedActions: [],
        completion: { status: 'complete', missingCriteria: [] },
        blocks: [{
          kind: 'kpi',
          items: [{ label: '候选客户', value: '10 人' }],
          citationIds: ['customer_priority_recommendation'],
        }],
      },
    )).toThrow('brain_response_answer_contract_mismatch:recommendation:content');
  });

  it('accepts a diagnosis backed by cited operating facts when no risk finding exists', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertMatchesIntent(
      { intent: 'diagnosis', answerShape: 'diagnosis' },
      {
        answer: '今日经营概览已完成，当前已接入事实没有形成风险发现。',
        citations: [{ sourceType: 'db_skill', sourceId: 'store_manager_operations_analysis' }],
        suggestedActions: [],
        completion: { status: 'complete', missingCriteria: [] },
        blocks: [{
          kind: 'kpi',
          items: [{ label: '实收', value: '19907.10 元' }],
          citationIds: ['store_manager_operations_analysis'],
        }],
      },
    )).not.toThrow();
  });

  it('still rejects an ungrounded text-only diagnosis', () => {
    const guard = new BrainAnswerCompletionGuardService();
    expect(() => guard.assertMatchesIntent(
      { intent: 'diagnosis', answerShape: 'diagnosis' },
      {
        answer: '今天经营情况不错。',
        citations: [],
        suggestedActions: [],
        completion: { status: 'complete', missingCriteria: [] },
        blocks: [{ kind: 'text', text: '今天经营情况不错。' }],
      },
    )).toThrow('brain_response_answer_contract_mismatch:diagnosis:grounded_context');
  });
});

function observation(overrides: Record<string, unknown> = {}) {
  return {
    nodeId: 'ranking', capabilityKey: 'ranking', capabilityVersion: 1, status: 'completed', grounding: 'metric_query', summary: '排行完成',
    data: { blocks: [], metadata: {}, suggestedActions: [] }, citations: [{ sourceType: 'business_definition', sourceId: 'metric.sales@1' }],
    startedAt: new Date(0).toISOString(), completedAt: new Date(1).toISOString(), ...overrides,
  } as any;
}
