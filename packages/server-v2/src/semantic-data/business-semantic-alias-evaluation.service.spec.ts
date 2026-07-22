import { BusinessSemanticAliasEvaluationService } from './business-semantic-alias-evaluation.service.js';

function projection(targetType: string, data: Record<string, unknown>) {
  return { targetType, payload: { data } };
}

describe('BusinessSemanticAliasEvaluationService', () => {
  const regressionCase = {
    id: 201,
    caseKey: 'semantic-evidence:case-201',
    input: { message: '到账金额' },
    expected: { definitionType: 'metric', definitionKey: 'paid_amount' },
  };

  it('passes only when both semantic projections contain the alias and every regression case passes', async () => {
    const service = new BusinessSemanticAliasEvaluationService();

    const result = await service.evaluate({
      alias: '到账金额',
      definitionId: 12,
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      projections: [
        projection('intent_semantic_index', { aliases: ['实收', '到账金额'] }),
        projection('eval_case_projection', { cases: [{ input: '到账金额' }] }),
      ],
      regressionCases: [regressionCase],
    });

    expect(result).toMatchObject({
      passed: true,
      checks: {
        intentSemanticIndexContainsAlias: true,
        evalCaseProjectionContainsAlias: true,
        regressionCasesPassed: true,
      },
      caseResults: [{ caseId: 201, caseKey: regressionCase.caseKey, passed: true }],
    });
  });

  it.each([
    {
      name: 'intent projection misses alias',
      projections: [
        projection('intent_semantic_index', { aliases: ['实收'] }),
        projection('eval_case_projection', { cases: [{ input: '到账金额' }] }),
      ],
      cases: [regressionCase],
      error: 'intent_semantic_index_alias_missing',
    },
    {
      name: 'eval projection misses alias',
      projections: [
        projection('intent_semantic_index', { aliases: ['到账金额'] }),
        projection('eval_case_projection', { cases: [{ input: '实收' }] }),
      ],
      cases: [regressionCase],
      error: 'eval_case_projection_alias_missing',
    },
    {
      name: 'regression case points to another definition',
      projections: [
        projection('intent_semantic_index', { aliases: ['到账金额'] }),
        projection('eval_case_projection', { cases: [{ input: '到账金额' }] }),
      ],
      cases: [{ ...regressionCase, expected: { definitionType: 'metric', definitionKey: 'refund_amount' } }],
      error: 'regression_case_failed',
    },
  ])('fails when $name', async ({ projections, cases, error }) => {
    const service = new BusinessSemanticAliasEvaluationService();

    const result = await service.evaluate({
      alias: '到账金额',
      definitionId: 12,
      definitionType: 'metric',
      definitionKey: 'paid_amount',
      projections,
      regressionCases: cases,
    });

    expect(result.passed).toBe(false);
    expect(result.errors).toContain(error);
  });
});
