import { AnswerContractValidatorService } from './answer-contract-validator.service.js';

describe('AnswerContractValidatorService', () => {
  const service = new AnswerContractValidatorService();

  it('passes a skill table contract when table and evidence blocks exist', () => {
    const result = service.validate({
      plan: {
        intentType: 'query',
        goal: '查询消费客户清单',
        toolPlan: [],
        confidence: 0.9,
        clarificationNeeded: false,
        skillPlan: {
          skillId: 'order.customer.consumption.list',
          capabilityId: 'order_customer_consumption_list',
          confidence: 0.9,
          reason: '命中消费客户清单',
          outputContract: {
            requiredKinds: ['table', 'evidence'],
            evidenceRequired: true,
          },
        },
      },
      answer: '昨天共有 1 位消费客户。',
      toolResults: [],
      renderedBlocks: [
        { kind: 'text', content: '昨天共有 1 位消费客户。' },
        { kind: 'table', columns: ['customerName'], rows: [['马美琳']] },
        { kind: 'evidence_panel', sources: ['订单'], metricDefinition: '有效订单', limitations: [] },
      ],
    });

    expect(result).toMatchObject({
      valid: true,
      contract: expect.objectContaining({ source: 'skill' }),
      missingKinds: [],
      errors: [],
    });
  });

  it('fails a list contract when no table or tool items are present', () => {
    const result = service.validate({
      plan: {
        intentType: 'query',
        goal: '查询消费客户清单',
        toolPlan: [],
        confidence: 0.9,
        clarificationNeeded: false,
        businessTask: { outputIntent: 'show_table' },
      },
      answer: '建议优先关注高价值客户。',
      toolResults: [],
      renderedBlocks: [{ kind: 'text', content: '建议优先关注高价值客户。' }],
    });

    expect(result).toMatchObject({
      valid: false,
      contract: expect.objectContaining({ source: 'business_task' }),
      missingKinds: ['table'],
      errors: ['missing_required_output_kind:table'],
    });
  });

  it('accepts tool items as a fallback for table contracts', () => {
    const result = service.validate({
      plan: {
        intentType: 'query',
        goal: '查询消费客户清单',
        toolPlan: [],
        confidence: 0.9,
        clarificationNeeded: false,
        businessTask: { outputIntent: 'show_table' },
      },
      answer: '昨天共有 1 位消费客户。',
      toolResults: [
        {
          status: 'success',
          title: '消费客户清单',
          summary: '昨天共有 1 位消费客户。',
          data: { card: { items: [{ customerName: '马美琳' }] } },
        },
      ],
      renderedBlocks: [{ kind: 'text', content: '昨天共有 1 位消费客户。' }],
    });

    expect(result.valid).toBe(true);
    expect(result.missingKinds).toEqual([]);
  });
});
