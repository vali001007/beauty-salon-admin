import * as preflight from '../../prisma/marketing-recommendation-v2-preflight';

const { collectMarketingRecommendationV2Preflight } = preflight;

describe('marketing recommendation v2 preflight', () => {
  it('blocks marketing deploy when the pending migration batch contains other modules', () => {
    const buildMigrationBatchGate = (preflight as any).buildMarketingMigrationBatchGate;
    expect(typeof buildMigrationBatchGate).toBe('function');

    const report = buildMigrationBatchGate(
      [
        '20260712210000_ami_brain_model_driven_capability_catalog',
        '20260713180000_marketing_recommendation_instance_foundation',
        '20260713200000_marketing_delivery_jobs',
        '20260713213000_marketing_effect_facts',
        '20260714230000_finance_reconciliation_automation',
      ],
      [],
    );

    expect(report).toMatchObject({
      status: 'blocked_mixed_batch',
      safeForMarketingOnlyDeploy: false,
      pendingMarketingMigrations: [
        '20260713180000_marketing_recommendation_instance_foundation',
        '20260713200000_marketing_delivery_jobs',
        '20260713213000_marketing_effect_facts',
      ],
      pendingNonMarketingMigrations: [
        '20260712210000_ami_brain_model_driven_capability_catalog',
        '20260714230000_finance_reconciliation_automation',
      ],
    });
  });

  it('allows deploy only when every pending migration belongs to the reviewed marketing batch', () => {
    const buildMigrationBatchGate = (preflight as any).buildMarketingMigrationBatchGate;
    expect(typeof buildMigrationBatchGate).toBe('function');

    const report = buildMigrationBatchGate(
      [
        '20260713180000_marketing_recommendation_instance_foundation',
        '20260713200000_marketing_delivery_jobs',
        '20260713213000_marketing_effect_facts',
      ],
      [],
    );

    expect(report).toMatchObject({
      status: 'ready',
      safeForMarketingOnlyDeploy: true,
      pendingNonMarketingMigrations: [],
      missingRequiredMarketingMigrations: [],
    });
  });

  it('returns a blocking exit code only when strict migration gating is requested', () => {
    const resolveExitCode = (preflight as any).resolveMarketingMigrationGateExitCode;
    expect(typeof resolveExitCode).toBe('function');

    expect(resolveExitCode({ safeForMarketingOnlyDeploy: false }, true)).toBe(2);
    expect(resolveExitCode({ safeForMarketingOnlyDeploy: false }, false)).toBe(0);
    expect(resolveExitCode({ safeForMarketingOnlyDeploy: true }, true)).toBe(0);
  });

  it('collects the cross-store, legacy status, adoption and running execution risks without writes', async () => {
    const prisma = {
      predictionRun: { count: jest.fn().mockResolvedValue(42) },
      customerPredictionSnapshot: { count: jest.fn().mockResolvedValue(39817) },
      customerOpportunity: { count: jest.fn().mockResolvedValue(228) },
      marketingActivity: { count: jest.fn().mockResolvedValue(14) },
      terminalFollowUpTask: { count: jest.fn().mockResolvedValue(16) },
      marketingRecommendationAdoption: { count: jest.fn().mockResolvedValue(0) },
      marketingAutomationTouch: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'delivered', _count: { _all: 1770 } },
          { status: 'failed', _count: { _all: 1374 } },
        ]),
        count: jest.fn().mockResolvedValue(65),
      },
      marketingAutomationExecution: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'success', _count: { _all: 92 } },
          { status: 'running', _count: { _all: 2 } },
        ]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 108,
            strategyId: 12,
            queuedCount: 1009,
            executedAt: new Date('2026-07-13T02:00:01.853Z'),
          },
        ]),
      },
    } as any;

    const report = await collectMarketingRecommendationV2Preflight(
      prisma,
      new Date('2026-07-13T08:00:00.000Z'),
    );

    expect(report).toEqual({
      mode: 'read-only',
      generatedAt: '2026-07-13T08:00:00.000Z',
      globalPredictionRuns: 42,
      storeSnapshotsLinkedToGlobalRuns: 39817,
      storeOpportunitiesLinkedToGlobalRuns: 228,
      legacyRecommendationActivities: 14,
      legacyRecommendationTasks: 16,
      recommendationAdoptions: 0,
      touchStatusDistribution: { delivered: 1770, failed: 1374 },
      executionStatusDistribution: { success: 92, running: 2 },
      runningExecutions: [
        {
          executionId: 108,
          strategyId: 12,
          queuedCount: 1009,
          touchCount: 65,
          executedAt: '2026-07-13T02:00:01.853Z',
        },
      ],
    });
    expect(prisma.predictionRun.count).toHaveBeenCalledWith({ where: { storeId: null } });
  });
});
