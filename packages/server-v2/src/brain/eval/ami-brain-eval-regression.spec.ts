import {
  buildAmiBrainEvalRegressionManifest,
  compareAmiBrainEvalRegression,
  selectAmiBrainEvalRegressionRecords,
} from './ami-brain-eval-regression.js';

const source = {
  metadata: {
    generatedAt: '2026-07-21T00:00:00.000Z',
    releaseId: 362,
    releaseSnapshot: { releaseFingerprint: 'a'.repeat(64) },
  },
  records: [
    { questionId: 'ok', status: 'usable_exact', latencyMs: 10 },
    { questionId: 'metric', status: 'metric_failed', failureReason: 'query failed', latencyMs: 20 },
    { questionId: 'intent', status: 'unsupported_intent', latencyMs: 30 },
    { questionId: 'provider', status: 'provider_unavailable', latencyMs: 40 },
  ],
};

describe('Ami Brain eval regression governance', () => {
  it('separates product failures from provider infrastructure failures', () => {
    expect(selectAmiBrainEvalRegressionRecords(source, 'product').map((item) => item.questionId)).toEqual([
      'metric',
      'intent',
    ]);
    expect(selectAmiBrainEvalRegressionRecords(source, 'provider').map((item) => item.questionId)).toEqual([
      'provider',
    ]);
    expect(selectAmiBrainEvalRegressionRecords(source, 'all').map((item) => item.questionId)).toEqual([
      'metric',
      'intent',
      'provider',
    ]);
  });

  it('reports resolved, unresolved, provider unavailable, and missing regression cases', () => {
    expect(
      compareAmiBrainEvalRegression({
        sourceResultsPath: 'source.json',
        sourcePayload: source,
        scope: 'all',
        currentRecords: [
          { questionId: 'metric', status: 'usable_partial' },
          { questionId: 'intent', status: 'unsupported_intent' },
          { questionId: 'provider', status: 'provider_unavailable' },
        ],
      }),
    ).toMatchObject({
      selectedCount: 3,
      resolvedCount: 1,
      unresolvedCount: 1,
      providerUnavailableCount: 1,
      missingCount: 0,
      passed: false,
    });
  });

  it('compares only the deliberately selected subset for a bounded smoke regression', () => {
    expect(
      compareAmiBrainEvalRegression({
        sourceResultsPath: 'source.json',
        sourcePayload: source,
        scope: 'product',
        selectedQuestionIds: ['metric'],
        currentRecords: [{ questionId: 'metric', status: 'usable_exact' }],
      }),
    ).toMatchObject({ selectedCount: 1, resolvedCount: 1, missingCount: 0, passed: true });
  });

  it('builds a machine-readable next-run manifest without treating provider failures as product defects', () => {
    expect(
      buildAmiBrainEvalRegressionManifest({
        sourceResultsPath: 'current.json',
        sourcePayload: source,
        currentRecords: source.records,
      }),
    ).toMatchObject({
      schemaVersion: '1.0',
      sourceReleaseId: 362,
      sourceReleaseFingerprint: 'a'.repeat(64),
      productFailures: { count: 2, questionIds: ['metric', 'intent'] },
      providerFailures: { count: 1, questionIds: ['provider'] },
      allFailures: { count: 3 },
    });
  });
});
