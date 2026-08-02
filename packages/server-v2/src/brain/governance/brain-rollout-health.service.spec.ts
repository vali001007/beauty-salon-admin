import { BrainRolloutHealthService } from './brain-rollout-health.service.js';

describe('BrainRolloutHealthService', () => {
  it('derives rollout health from release-bound runs and feedback', async () => {
    const service = new BrainRolloutHealthService({
      brainRunStep: {
        findMany: jest.fn().mockResolvedValue([
          { runId: 1, output: { releaseId: 101 }, run: { status: 'completed', error: null, createdAt: new Date() } },
          { runId: 2, output: { releaseId: 101 }, run: { status: 'failed', error: { message: 'timeout' }, createdAt: new Date() } }, // ami-brain-unit-only: rollout metric fixture.
          { runId: 3, output: { releaseId: 999 }, run: { status: 'failed', error: { message: 'unrelated' }, createdAt: new Date() } }, // ami-brain-unit-only: release filtering fixture.
        ]),
      },
      brainFeedback: { findMany: jest.fn().mockResolvedValue([{ runId: 1, rating: 'helpful' }, { runId: 2, rating: 'needs_improvement' }]) },
    } as never);
    const now = new Date('2026-08-02T01:00:00.000Z');

    const result = await service.observe({
      releaseId: 101,
      activatedAt: new Date('2026-08-02T00:00:00.000Z'),
      promotionPolicy: { observationMinutes: 30, minimumSampleSize: 2 },
      healthThresholds: { maxErrorRate: 0.6, maxTimeoutRate: 0.6, maxPermissionViolationCount: 0, maxNegativeFeedbackRate: 0.6 },
      now,
    });

    expect(result.status).toBe('ready');
    expect(result.sampleSize).toBe(2);
    expect(result.metrics).toMatchObject({ errorRate: 0.5, timeoutRate: 0.5, negativeFeedbackRate: 0.5 });
    expect(result.source).toBe('brain_run_trace_and_feedback');
  });

  it('blocks when the observation window or sample size is insufficient', async () => {
    const service = new BrainRolloutHealthService({
      brainRunStep: { findMany: jest.fn().mockResolvedValue([]) },
      brainFeedback: { findMany: jest.fn() },
    } as never);
    const now = new Date('2026-08-02T00:10:00.000Z');

    const result = await service.observe({
      releaseId: 101,
      activatedAt: new Date('2026-08-02T00:00:00.000Z'),
      promotionPolicy: { observationMinutes: 30, minimumSampleSize: 20 },
      healthThresholds: { maxErrorRate: 0.02, maxTimeoutRate: 0.01, maxPermissionViolationCount: 0 },
      now,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      'rollout_observation_window_incomplete',
      'rollout_observation_sample_insufficient',
    ]));
  });
});
