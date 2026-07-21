import { buildBrainMvpSeedPlan } from './seed/brain-mvp-seed-plan.js';

describe('Brain MVP seed plan', () => {
  it('covers the full MVP governance baseline', () => {
    const plan = buildBrainMvpSeedPlan();

    expect(plan.ontologyEntities.length).toBeGreaterThanOrEqual(40);
    expect(plan.ontologyRelations.length).toBeGreaterThanOrEqual(8);
    expect(plan.metrics.length).toBeGreaterThanOrEqual(12);
    expect(plan.dimensions.length).toBeGreaterThanOrEqual(8);
    expect(plan.skills.length).toBeGreaterThanOrEqual(12);
    expect(plan.agentProfiles.map((profile) => profile.roleKey)).toEqual([
      'store_manager',
      'receptionist',
      'beautician',
      'marketing',
      'finance',
      'inventory',
      'customer_service',
    ]);
    expect(plan.inspectionRules.length).toBeGreaterThanOrEqual(10);
    expect(plan.evalCases).toHaveLength(40);
  });

  it('includes data-quality rules that require review and never auto-repair', () => {
    const plan = buildBrainMvpSeedPlan();
    const dataQualityRules = plan.inspectionRules.filter((rule) => rule.condition.factType === 'data_quality');

    expect(dataQualityRules.map((rule) => rule.ruleKey)).toEqual([
      'reception_in_store_state_stale',
      'service_task_state_inconsistent',
      'inventory_safety_stock_invalid',
      'procurement_evidence_missing',
    ]);
    expect(dataQualityRules.every((rule) => rule.suggestionTpl.autoRepair === false)).toBe(true);
    expect(dataQualityRules.every((rule) => rule.suggestionTpl.requiresUserReview === true)).toBe(true);
  });

  it('includes all skill families required by the PRD', () => {
    const plan = buildBrainMvpSeedPlan();

    expect(new Set(plan.skills.map((skill) => skill.type))).toEqual(
      new Set(['query', 'analysis', 'risk', 'action', 'prediction']),
    );
  });
});
