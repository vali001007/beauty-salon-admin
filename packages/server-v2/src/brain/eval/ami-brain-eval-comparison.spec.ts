import { compareAmiBrainEvalResults } from './ami-brain-eval-comparison.js';

describe('compareAmiBrainEvalResults', () => {
  it('separates new failures, persistent failures, recovered cases and incomplete previous evidence', () => {
    const result = compareAmiBrainEvalResults({
      comparable: true,
      previous: [
        { caseKey: 'A', deterministicPassed: true },
        { caseKey: 'B', deterministicPassed: false, failureCluster: 'old_cluster' },
        { caseKey: 'C', deterministicPassed: false, failureCluster: 'recovered_cluster' },
      ],
      current: [
        { caseKey: 'A', deterministicPassed: false, failureCluster: 'new_cluster' },
        { caseKey: 'B', deterministicPassed: false, failureCluster: 'new_persistent_cluster' },
        { caseKey: 'C', deterministicPassed: true },
        { caseKey: 'D', deterministicPassed: false, failureCluster: 'missing_previous' },
      ],
    });
    expect(result.newFailures.map((item) => item.caseKey)).toEqual(['A']);
    expect(result.persistentFailures.map((item) => item.caseKey)).toEqual(['B']);
    expect(result.recovered.map((item) => item.caseKey)).toEqual(['C']);
    expect(result.missingPrevious).toEqual(['D']);
  });

  it('does not compare cases from a different suite identity', () => {
    const result = compareAmiBrainEvalResults({
      comparable: false,
      previous: [{ caseKey: 'A', deterministicPassed: true }],
      current: [{ caseKey: 'A', deterministicPassed: false }],
    });
    expect(result.comparable).toBe(false);
    expect(result.unavailableReason).toBe('suite_identity_mismatch');
    expect(result.newFailures).toEqual([]);
  });
});
