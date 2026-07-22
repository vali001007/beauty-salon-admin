import { deterministicFullDomainGrade } from '../../../prisma/ami-brain-full-domain-eval-suite.js';

describe('Ami Brain full-domain multi-turn gate', () => {
  const test = {
    id: 'BQ1927',
    domain: '横切-多轮',
    role: '店长',
    roleKey: 'store_manager',
    type: 'multi_turn' as const,
    difficulty: 'hard',
    question: '第1轮:缺货的产品有哪些 → 第2轮:其中最急的先补多少',
    expectedTarget: '多轮上下文承接',
    notes: '指代承接',
    turns: ['缺货的产品有哪些', '其中最急的先补多少'],
  };

  it('fails when any turn failed even if the final turn returned a grounded answer', () => {
    const result = deterministicFullDomainGrade({
      test,
      answer: '库存采购建议：当前没有需要采购的商品。',
      status: 'completed',
      citations: [{ sourceType: 'db_skill', sourceId: 'inventory' }],
      completedTurns: 2,
      turnResults: [
        { status: 'failed', answer: '模型服务暂不可用', failureCode: 'PROVIDER_UNAVAILABLE' },
        { status: 'completed', answer: '库存采购建议：当前没有需要采购的商品。' },
      ],
    });

    expect(result).toMatchObject({
      passed: false,
      providerUnavailable: true,
      failureCluster: 'provider_unavailable',
      layers: { multiTurn: { passed: false } },
    });
  });

  it('passes only when both turns complete and the final answer is grounded', () => {
    const result = deterministicFullDomainGrade({
      test,
      answer: '补水面膜建议补货 8 件。',
      status: 'completed',
      citations: [{ sourceType: 'db_skill', sourceId: 'inventory' }],
      completedTurns: 2,
      turnResults: [
        { status: 'completed', answer: '缺货商品排行：补水面膜第一。' },
        { status: 'completed', answer: '补水面膜建议补货 8 件。' },
      ],
    });

    expect(result).toMatchObject({ passed: true, providerUnavailable: false });
  });
});
