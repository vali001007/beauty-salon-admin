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
      missingKinds: ['table', 'evidence_panel'],
      errors: ['missing_required_output_kind:table', 'missing_required_output_kind:evidence_panel'],
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
          evidence: {
            source: ['订单'],
            sourceTables: ['ProductOrder'],
            metricDefinition: '有效订单',
            filters: ['status=paid'],
          },
        },
      ],
      renderedBlocks: [{ kind: 'text', content: '昨天共有 1 位消费客户。' }],
    });

    expect(result.valid).toBe(true);
    expect(result.missingKinds).toEqual([]);
  });

  it('uses plan outputContract before skill fallback and supports evidence_panel', () => {
    const result = service.validate({
      plan: {
        intentType: 'query',
        goal: '查询本月营业额',
        toolPlan: [],
        confidence: 0.9,
        clarificationNeeded: false,
        outputContract: {
          requiredKinds: ['kpi', 'evidence_panel'],
          evidenceRequired: true,
        },
      },
      answer: '本月营业额 ¥263,794。',
      toolResults: [],
      renderedBlocks: [
        { kind: 'kpi_card', label: '营业额', value: '¥263,794' },
        { kind: 'evidence_panel', sources: ['ProductOrder'], metricDefinition: '有效订单' },
      ],
    });

    expect(result).toMatchObject({
      valid: true,
      contract: expect.objectContaining({ source: 'business_task' }),
      missingKinds: [],
    });
  });

  it('passes clarification_card contracts when a structured clarification block exists', () => {
    const result = service.validate({
      plan: {
        intentType: 'clarify',
        goal: '确认营销活动对象',
        toolPlan: [],
        confidence: 0.7,
        clarificationNeeded: true,
        outputContract: {
          requiredKinds: ['clarification_card'],
        },
      },
      answer: '我找到了多个可能对象，请确认。',
      toolResults: [],
      renderedBlocks: [
        {
          kind: 'clarification_card',
          title: '需要确认对象',
          question: '你是指哪个回店礼活动？',
          options: [
            { label: '老朋友回店护理礼', value: '查询老朋友回店护理礼活动链接' },
            { label: '老朋友回店礼', value: '查询老朋友回店礼活动链接' },
          ],
        },
      ],
    });

    expect(result).toMatchObject({
      valid: true,
      missingKinds: [],
      errors: [],
    });
  });
});
