import { parseBrainParaphraseEvalJson } from './brain-paraphrase-eval-source.js';

describe('parseBrainParaphraseEvalJson', () => {
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
      ],
    }));

    expect(questions).toHaveLength(2);
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
  });

  it('fails closed for malformed case data', () => {
    expect(() => parseBrainParaphraseEvalJson('{"cases":[{"id":"x"}]}')).toThrow(
      'ami_brain_paraphrase_case_invalid:0',
    );
  });
});
