import {
  buildBrainRunLatencyBreakdown,
  providerFailureAttribution,
  resolveAmiBrainUserResponseLatencyMs,
  summarizeAmiBrainEvalFailureAttribution,
  summarizeAmiBrainEvalLatencies,
} from './ami-brain-eval-latency.js';

describe('Ami Brain evaluation latency evidence', () => {
  it('measures user response at answer-ready while keeping post-answer work in request completion', () => {
    expect(
      resolveAmiBrainUserResponseLatencyMs({
        startedAtMs: 1_000,
        answerReadyAtMs: 4_500,
        requestCompletedAtMs: 7_000,
      }),
    ).toBe(3_500);
  });

  it('falls back to request completion when the answer-ready callback is unavailable', () => {
    expect(
      resolveAmiBrainUserResponseLatencyMs({
        startedAtMs: 1_000,
        requestCompletedAtMs: 7_000,
      }),
    ).toBe(6_000);
  });

  it('separates user response, judge, and total evaluation latency', () => {
    expect(
      summarizeAmiBrainEvalLatencies([
        { latencyMs: 1000, metadata: { latency: { judgeLatencyMs: 400, evaluationTotalLatencyMs: 1500 } } },
        { latencyMs: 2000, metadata: { latency: { judgeLatencyMs: 600, evaluationTotalLatencyMs: 2700 } } },
        { latencyMs: 3000, metadata: { latency: { judgeLatencyMs: 800, evaluationTotalLatencyMs: 3900 } } },
      ]),
    ).toEqual({
      userResponse: { count: 3, averageMs: 2000, p50Ms: 2000, p95Ms: 3000, maxMs: 3000 },
      judge: { count: 3, averageMs: 600, p50Ms: 600, p95Ms: 800, maxMs: 800 },
      evaluationTotal: { count: 3, averageMs: 2700, p50Ms: 2700, p95Ms: 3900, maxMs: 3900 },
    });
  });

  it('summarizes instrumented BrainRun steps without pretending missing time is measured', () => {
    expect(
      buildBrainRunLatencyBreakdown({
        latencyMs: 1000,
        steps: [
          { stepKey: 'semantic_compile', layer: 'semantic', status: 'completed', latencyMs: 200 },
          { stepKey: 'skill_query', layer: 'skill', status: 'completed', latencyMs: 300 },
          { stepKey: 'trace_without_timer', layer: 'audit', status: 'completed', latencyMs: null },
        ],
      }),
    ).toEqual({
      brainRunLatencyMs: 1000,
      instrumentedStepLatencyMs: 500,
      unattributedLatencyMs: 500,
      instrumentationCoverage: 0.5,
      byLayerMs: { semantic: 200, skill: 300 },
      byNestedPhaseMs: {},
      nestedPhases: [],
      outsideBrainRunStepLatencyMs: 0,
      outsideBrainRunByLayerMs: {},
      outsideBrainRunSteps: [],
      steps: [
        { stepKey: 'semantic_compile', layer: 'semantic', status: 'completed', latencyMs: 200 },
        { stepKey: 'skill_query', layer: 'skill', status: 'completed', latencyMs: 300 },
      ],
    });
  });

  it('reports nested DAG phases without double counting and keeps outside-run audit timing separate', () => {
    expect(
      buildBrainRunLatencyBreakdown({
        latencyMs: 1000,
        steps: [
          {
            stepKey: 'bounded_dag_execution',
            layer: 'execution',
            status: 'completed',
            latencyMs: 600,
            output: {
              phaseLatencyMs: {
                capabilityExecutionMs: 420,
                completionVerificationMs: 150,
                replanningMs: 0,
                executorOverheadMs: 30,
              },
            },
          },
          {
            stepKey: 'business_semantic_evidence_capture',
            layer: 'semantic',
            status: 'completed',
            latencyMs: 80,
            output: { timingScope: 'outside_brain_run' },
          },
        ],
      }),
    ).toMatchObject({
      instrumentedStepLatencyMs: 600,
      unattributedLatencyMs: 400,
      instrumentationCoverage: 0.6,
      byLayerMs: { execution: 600 },
      byNestedPhaseMs: {
        capabilityExecutionMs: 420,
        completionVerificationMs: 150,
        replanningMs: 0,
        executorOverheadMs: 30,
      },
      outsideBrainRunStepLatencyMs: 80,
      outsideBrainRunByLayerMs: { semantic: 80 },
      outsideBrainRunSteps: [
        {
          stepKey: 'business_semantic_evidence_capture',
          layer: 'semantic',
          status: 'completed',
          latencyMs: 80,
        },
      ],
    });
  });

  it('attributes provider unavailable separately from product capability failures', () => {
    expect(
      summarizeAmiBrainEvalFailureAttribution([
        {
          failureCluster: 'provider_unavailable',
          error: 'AI structured output request timed out.',
          latencyMs: 10_392,
          metadata: {
            evidence: { runtimeModel: { provider: 'deepseek', model: 'deepseek-v4-flash', routeMode: 'primary' } },
            attemptCount: 3,
          },
        },
        { failureCluster: 'answer_not_grounded', latencyMs: 8_000 },
        { failureCluster: 'multi_turn_not_continued', latencyMs: 9_000 },
        { failureCluster: 'permission_not_denied', error: 'permission denied' },
        { failureCluster: 'judge_failed', error: 'judge timeout' },
      ]),
    ).toMatchObject({
      providerUnavailable: 1,
      businessAbilityFailures: 2,
      judgeFailures: 1,
      dataOrPermissionFailures: 1,
      providerFailures: [
        {
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          routeMode: 'primary',
          errorCategory: 'timeout',
          latencyMs: 10392,
          attemptCount: 3,
        },
      ],
    });
  });

  it('redacts provider attribution to public route metadata only', () => {
    expect(
      providerFailureAttribution({
        failureCluster: 'provider_unavailable',
        error: '401 invalid api key',
        metadata: {
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          apiKey: 'sk-secret',
          DATABASE_URL: 'postgresql://secret',
        },
      }),
    ).toEqual([
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        errorCategory: 'provider_auth_failed',
      }),
    ]);
    expect(JSON.stringify(providerFailureAttribution({ failureCluster: 'provider_unavailable', metadata: {} }))).not.toMatch(
      /secret|postgresql|sk-/,
    );
  });
});
