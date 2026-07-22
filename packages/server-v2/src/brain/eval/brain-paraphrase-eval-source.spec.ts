import {
  expectedAnswerShapeForQuestion,
  parseBrainParaphraseEvalJson,
} from './brain-paraphrase-eval-source.js';

describe('parseBrainParaphraseEvalJson', () => {
  it('uses semantic intent before legacy display-kind heuristics', () => {
    expect(expectedAnswerShapeForQuestion({
      expectedSemanticIntent: 'comparison',
      expectedOutputKinds: ['kpi', 'chart'],
    } as never)).toBe('comparison');
    expect(expectedAnswerShapeForQuestion({
      expectedSemanticIntent: 'query',
      expectedMetrics: [],
      expectedOutputKinds: ['kpi', 'table'],
    } as never)).toBeUndefined();
    expect(expectedAnswerShapeForQuestion({
      expectedSemanticIntent: 'action',
      expectedOutputKinds: ['text'],
    } as never)).toBe('action_preview');
  });

  it('maps semantic paraphrase cases into the shared real-path evaluator contract', () => {
    const questions = parseBrainParaphraseEvalJson(JSON.stringify({
      cases: [
        {
          id: 'ranking-01',
          intent: 'ranking',
          input: '本月哪些货卖得最靠前',
          expected: {
            domains: ['inventory_procurement'],
            entities: ['product'],
            metrics: ['product_sales_quantity'],
            dimensions: ['product'],
            answerShape: 'ranking',
          },
        },
        {
          id: 'action-01',
          intent: 'action',
          input: '把张女士的预约改到明天下午三点',
          expected: {
            domains: ['front_desk'],
            entities: ['customer', 'reservation'],
            answerShape: 'action_preview',
            requiresConfirmation: true,
          },
        },
        {
          id: 'workflow-01',
          intent: 'workflow',
          input: '找出明天下午空档、筛合适客户、写提醒并生成触达预览',
          expected: {
            domains: ['front_desk', 'marketing_growth'],
            answerShape: 'diagnosis',
          },
        },
        {
          id: 'beautician-action-01',
          intent: 'action',
          input: '预览完成服务单 #493 并保存护理记录',
          expected: {
            domains: ['beautician', 'customer', 'project'],
            capabilityKeys: ['service_record_completion_preview'],
            answerShape: 'action_preview',
            requiresConfirmation: true,
          },
        },
      ],
    }));

    expect(questions).toHaveLength(4);
    expect(questions[0]).toMatchObject({
      id: 'paraphrase-ranking-01',
      persona: 'inventory',
      evalRole: 'manager',
      expectedSemanticIntent: 'ranking',
      expectedOutputKinds: ['table', 'evidence'],
    });
    expect(questions[1]).toMatchObject({
      id: 'paraphrase-action-01',
      persona: 'reception',
      evalRole: 'reception',
      expectedPlanShape: { requiresPreview: true },
      requiresApproval: true,
    });
    expect(questions[2]).toMatchObject({
      id: 'paraphrase-workflow-01',
      persona: 'edge',
      evalRole: 'manager',
      expectedSemanticIntent: 'workflow',
    });
    expect(questions[3]).toMatchObject({
      id: 'paraphrase-beautician-action-01',
      persona: 'beautician',
      evalRole: 'beautician',
      expectedCapabilityKeys: ['service_record_completion_preview'],
      expectedPlanShape: { requiresPreview: true },
    });
  });

  it('fails closed for malformed case data', () => {
    expect(() => parseBrainParaphraseEvalJson('{"cases":[{"id":"x"}]}')).toThrow(
      'ami_brain_paraphrase_case_invalid:0',
    );
  });

  it('parses multi-turn cases without flattening the conversation boundary', () => {
    const [scenario] = parseBrainParaphraseEvalJson(JSON.stringify({
      cases: [{
        id: 'comparison-slot-fill',
        persona: 'finance',
        turns: [
          {
            id: 'ask',
            intent: 'comparison',
            input: '把本月实收跟另一个周期比较',
            expected: {
              domains: ['finance_risk'],
              metrics: ['paid_amount'],
              answerShape: 'clarification',
              brainStatus: 'clarify',
              missingSlots: ['comparisonTarget'],
            },
          },
          {
            id: 'fill-period',
            intent: 'comparison',
            input: '上个月',
            expected: {
              domains: ['finance_risk'],
              metrics: ['paid_amount'],
              capabilityKeys: ['finance_payment_breakdown'],
              answerShape: 'comparison',
              brainStatus: 'completed',
              forbiddenMissingSlots: ['comparisonTarget'],
            },
          },
        ],
      }],
    }));

    expect(scenario).toMatchObject({
      id: 'conversation-comparison-slot-fill',
      persona: 'finance',
      expectedBrainStatus: 'clarify',
    });
    expect(scenario.conversationTurns).toHaveLength(2);
    expect(scenario.conversationTurns?.[0]).toMatchObject({
      id: 'conversation-comparison-slot-fill:ask',
      turnIndex: 1,
      expectedMissingSlots: ['comparisonTarget'],
    });
    expect(scenario.conversationTurns?.[1]).toMatchObject({
      id: 'conversation-comparison-slot-fill:fill-period',
      turnIndex: 2,
      expectedCapabilityKeys: ['finance_payment_breakdown'],
      expectedForbiddenMissingSlots: ['comparisonTarget'],
    });
  });

  it('requires at least two valid turns for a conversation case', () => {
    expect(() => parseBrainParaphraseEvalJson(JSON.stringify({
      cases: [{ id: 'broken', turns: [{ id: 'only-one' }] }],
    }))).toThrow('ami_brain_conversation_case_invalid:0');
  });
});
