import { AgentV2AnswerContractValidatorService } from './agent-v2-answer-contract-validator.service.js';

describe('AgentV2AnswerContractValidatorService', () => {
  const service = new AgentV2AnswerContractValidatorService();

  it('blocks risk capability when the user asks occurred scrap records', () => {
    const result = service.validate({
      question: '本周有哪些报废产品',
      plan: { capabilityPlan: { capabilityId: 'inventory.expiring-risk.list', reason: '' } } as any,
      answer: '库存风险最高的是面膜。',
      toolResults: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('question_capability_mismatch:asked_scrap_records_but_selected_inventory_risk');
  });

  it('requires table and evidence for scrap record answers', () => {
    const result = service.validate({
      question: '本周有哪些报废产品',
      plan: { capabilityPlan: { capabilityId: 'inventory.scrap.records.list', reason: '' } } as any,
      answer: '没有数据。',
      toolResults: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'missing_required_output_kind:table',
      'missing_required_output_kind:evidence_panel',
    ]));
  });

  it('requires chart output for revenue trend answers', () => {
    const result = service.validate({
      question: '最近三天营业额趋势怎么样',
      plan: {
        capabilityPlan: { capabilityId: 'finance.revenue.trend', reason: '' },
        outputContract: { requiredKinds: ['chart', 'kpi', 'table', 'evidence_panel'] },
      } as any,
      answer: '最近三天营业额上升。',
      toolResults: [
        {
          data: { metrics: { totalRevenueText: '¥570.00' }, items: [{ date: '2026-07-01' }] },
          evidence: { source: ['ProductOrder'], metricDefinition: '营业额趋势', filters: [], sampleSize: 3 },
        } as any,
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('missing_required_output_kind:chart');
  });

  it('requires action card output for action draft answers', () => {
    const result = service.validate({
      question: '帮我报废2片舒缓修护面膜',
      plan: {
        capabilityPlan: { capabilityId: 'inventory.stock.operation.draft', reason: '' },
        outputContract: { requiredKinds: ['action_card', 'evidence_panel'] },
      } as any,
      answer: '可以报废。',
      toolResults: [
        {
          data: { items: [{ productName: '舒缓修护面膜' }] },
          evidence: { source: ['Product'], metricDefinition: '库存动作草稿', filters: [], sampleSize: 1 },
        } as any,
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('missing_required_output_kind:action_card');
  });

  it('accepts chart and action card outputs when the required blocks are present', () => {
    const trendResult = service.validate({
      question: '最近三天营业额趋势怎么样',
      plan: {
        capabilityPlan: { capabilityId: 'finance.revenue.trend', reason: '' },
        outputContract: { requiredKinds: ['chart', 'kpi', 'table', 'evidence_panel'] },
      } as any,
      answer: '近三天营业额 ¥570.00。',
      toolResults: [
        {
          data: {
            metrics: { totalRevenueText: '¥570.00' },
            chart: { chartType: 'line', data: [{ date: '2026-07-01', revenue: 270 }] },
            items: [{ date: '2026-07-01' }],
          },
          evidence: { source: ['ProductOrder'], metricDefinition: '营业额趋势', filters: [], sampleSize: 3, limitations: ['按已落库订单统计。'] },
        } as any,
      ],
    });
    const actionResult = service.validate({
      question: '帮我报废2片舒缓修护面膜',
      plan: {
        capabilityPlan: { capabilityId: 'inventory.stock.operation.draft', reason: '' },
        outputContract: { requiredKinds: ['action_card', 'evidence_panel'] },
      } as any,
      answer: '已生成库存报废草稿。',
      toolResults: [
        {
          data: { actionDraft: { operationTypeLabel: '报废', productName: '舒缓修护面膜' } },
          evidence: { source: ['Product'], metricDefinition: '库存动作草稿', filters: [], sampleSize: 1, limitations: ['仅生成草稿，不直接写入。'] },
        } as any,
      ],
    });

    expect(trendResult.valid).toBe(true);
    expect(actionResult.valid).toBe(true);
  });

  it('rejects numeric answers when no traceable evidence package exists', () => {
    const result = service.validate({
      question: '今天日结报表是多少',
      plan: {
        capabilityPlan: { capabilityId: 'finance.daily-settlement.metric', reason: '' },
        outputContract: { requiredKinds: ['kpi', 'table', 'evidence_panel'] },
      } as any,
      answer: '今日实收 ¥100.00。',
      toolResults: [
        {
          data: { metrics: { totalRevenueText: '¥100.00' }, items: [{ settleDate: '2026-07-03' }] },
          evidence: { source: [], metricDefinition: '', filters: [] },
        } as any,
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'missing_required_output_kind:evidence_panel',
      'numeric_answer_missing_evidence_source',
    ]));
  });

  it('requires evidence and limitation text for reason-style questions', () => {
    const result = service.validate({
      question: '为什么订单 POMQPDGTF8 没有进入日结报表',
      plan: {
        capabilityPlan: { capabilityId: 'finance.daily-settlement.metric', reason: '' },
        outputContract: { requiredKinds: ['kpi', 'table', 'evidence_panel'] },
      } as any,
      answer: '这笔订单没有纳入当前日结。',
      toolResults: [
        {
          data: { metrics: { orderCount: 0 }, items: [{ orderNo: 'POMQPDGTF8' }] },
          evidence: { source: ['DailySettlement'], metricDefinition: '日结报表', filters: ['storeId=1'], sampleSize: 1 },
        } as any,
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('reasoning_answer_missing_limitations');
  });
});
