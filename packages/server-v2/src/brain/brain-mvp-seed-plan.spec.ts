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
    expect(plan.inspectionRules.length).toBeGreaterThanOrEqual(6);
    expect(plan.evalCases).toHaveLength(40);
  });

  it('includes all skill families required by the PRD', () => {
    const plan = buildBrainMvpSeedPlan();

    expect(new Set(plan.skills.map((skill) => skill.type))).toEqual(
      new Set(['query', 'analysis', 'risk', 'action', 'prediction']),
    );
  });
});
