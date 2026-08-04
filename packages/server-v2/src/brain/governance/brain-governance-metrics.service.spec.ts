import { BrainGovernanceMetricsService } from './brain-governance-metrics.service.js';

describe('BrainGovernanceMetricsService', () => {
  it('aggregates server-side run and trace timestamps without inventing missing segments', async () => {
    const createdAt = new Date('2026-08-02T00:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        input: { message: '今天营收' }, // ami-brain-unit-only: latency aggregation fixture, not a release-eval input.
        output: { provider: 'openai', model: 'gpt-test', capabilityKey: 'daily_revenue' },
        latencyMs: 20_000,
        createdAt,
        steps: [
          { stepKey: 'model_intent_compile', layer: 'cognition', latencyMs: 10_000, createdAt: new Date(createdAt.getTime() + 10_000) },
          { stepKey: 'semantic_query', layer: 'semantic', latencyMs: 5_000, createdAt: new Date(createdAt.getTime() + 15_000) },
          { stepKey: 'response_persistence', layer: 'response', latencyMs: 2_000, createdAt: new Date(createdAt.getTime() + 22_000) },
        ],
      },
      {
        id: 2,
        input: { message: '门店概况' }, // ami-brain-unit-only: missing-segment fixture, not a release-eval input.
        output: { provider: null, model: null, capabilityKey: null },
        latencyMs: null,
        createdAt: new Date('2026-08-02T01:00:00.000Z'),
        steps: [],
      },
    ]);
    const service = new BrainGovernanceMetricsService({ brainRun: { findMany } } as never);

    const result = await service.getQualityLatency({ days: 7 });

    expect(result.metrics.endToEnd).toMatchObject({ p50Ms: 22_000, p95Ms: 22_000, sampleSize: 1 });
    expect(result.metrics.firstVisibleAnswer).toMatchObject({ p50Ms: 22_000, sampleSize: 1 });
    expect(result.metrics.model).toMatchObject({ p50Ms: 10_000, sampleSize: 1 });
    expect(result.metrics.toolData).toMatchObject({ p50Ms: 5_000, sampleSize: 1 });
    expect(result.dataCompleteness.firstVisibleAnswer).toMatchObject({ available: 1, total: 2, rate: 0.5 });
    expect(result.dataCompleteness.firstVisibleAnswerMode).toBe('buffered_answer_ready');
  });

  it('filters latency by the candidate rollout release identity and returns the requested percentile', async () => {
    const createdAt = new Date('2026-08-02T00:00:00.000Z');
    const run = (id: number, releaseId: number, latencyMs: number) => ({
      id,
      input: {},
      output: { provider: 'openai', model: 'gpt-test', capabilityKey: 'daily_revenue' },
      latencyMs,
      createdAt,
      steps: [
        { stepKey: 'release_runtime_selection', layer: 'governance', latencyMs: 1, output: { releaseId, releaseKey: `runtime-${releaseId}` }, createdAt },
        { stepKey: 'response_persistence', layer: 'response', latencyMs: 0, output: {}, createdAt: new Date(createdAt.getTime() + latencyMs) },
      ],
    });
    const service = new BrainGovernanceMetricsService({
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          rolloutSequence: { releases: [{ id: 21, releaseKey: 'runtime-21' }] },
        }),
      },
      brainRun: { findMany: jest.fn().mockResolvedValue([run(1, 21, 20_000), run(2, 22, 80_000)]) },
    } as never);

    const result = await service.getQualityLatency({ candidateKey: 'candidate-21', percentile: 95 });

    expect(result.sampleSize).toBe(1);
    expect(result.appliedFilters.candidateKey).toBe('candidate-21');
    expect(result.selectedPercentile).toMatchObject({ percentile: 95, endToEndMs: 20_000 });
  });

  it('calculates governance lead times and child gate reuse from append-only evidence', async () => {
    const start = new Date('2026-08-02T00:00:00.000Z');
    const service = new BrainGovernanceMetricsService({
      brainGovernanceEvent: {
        findMany: jest.fn().mockResolvedValue([
          { candidateId: 9, eventType: 'candidate_created', createdAt: start },
          { candidateId: 9, eventType: 'candidate_check_started', createdAt: new Date(start.getTime() + 1_000) },
          { candidateId: 9, eventType: 'receipt_verified', createdAt: new Date(start.getTime() + 11_000) },
          { candidateId: 9, eventType: 'rollout_shadow_activated', createdAt: new Date(start.getTime() + 60_000) },
          { candidateId: 9, eventType: 'rollout_full_activated', createdAt: new Date(start.getTime() + 180_000) },
        ]),
      },
      brainGateReceipt: {
        findMany: jest.fn().mockResolvedValue([{
          ingestedAt: new Date(start.getTime() + 13_000),
          result: {
            createdAt: new Date(start.getTime() + 8_000).toISOString(),
            results: [
              { status: 'passed', modelInvocationCount: 1 },
              { status: 'reused', reused: true, modelInvocationCount: 2 },
            ],
          },
        }]),
      },
      brainGovernanceTask: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'approved', attemptCount: 1 },
          { status: 'approved', attemptCount: 2 },
          { status: 'failed', attemptCount: 3 },
        ]),
      },
    } as never);

    const result = await service.getGovernanceLatency({ days: 7 });

    expect(result.metrics.candidateGate).toMatchObject({ p50Ms: 10_000, sampleSize: 1 });
    expect(result.metrics.candidateToShadow).toMatchObject({ p50Ms: 60_000, sampleSize: 1 });
    expect(result.metrics.shadowToFull).toMatchObject({ p50Ms: 120_000, sampleSize: 1 });
    expect(result.metrics.receiptIngest).toMatchObject({ p50Ms: 5_000, sampleSize: 1 });
    expect(result.gateReuse).toEqual({
      reused: 1,
      total: 2,
      rate: 0.5,
      avoidedModelInvocations: 2,
      executedModelInvocations: 1,
    });
    expect(result.taskOutcomes).toEqual({
      terminal: 3,
      firstPass: 1,
      retried: 2,
      firstPassRate: 1 / 3,
      retryRate: 2 / 3,
    });
  });
});
