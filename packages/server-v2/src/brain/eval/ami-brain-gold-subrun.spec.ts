import {
  buildAmiBrainGoldRuntimeIdentity,
  planAmiBrainGoldSubrun,
  type AmiBrainGoldExistingResult,
} from './ami-brain-gold-subrun.js';

const expectedCaseIds = Array.from({ length: 100 }, (_, index) => `gold-${String(index + 1).padStart(3, '0')}`);
const identity = buildAmiBrainGoldRuntimeIdentity({
  parentStandardRegressionRunId: 502,
  releaseId: 21,
  storeId: 6,
  releaseFingerprint: 'a'.repeat(64),
  sourceCommit: 'b'.repeat(40),
  runtimeCommit: 'b'.repeat(40),
  sourceChecksum: 'c'.repeat(64),
  suiteManifestVersion: '2026-07-29-v4',
  suiteManifestChecksum: 'd'.repeat(64),
  goldStandardManifestChecksum: 'e'.repeat(64),
  standardRegressionCaseIdsChecksum: 'f'.repeat(64),
});

function result(caseKey: string, status = 'passed'): AmiBrainGoldExistingResult {
  const passed = status === 'passed';
  return {
    caseKey,
    deterministicPassed: passed,
    deterministicGrade: { goldCaseId: caseKey, passed, status },
  };
}

describe('planAmiBrainGoldSubrun', () => {
  it('resumes a running checkpoint from the exact next uncompleted cases', () => {
    const state = planAmiBrainGoldSubrun({
      runStatus: 'running',
      expectedIdentity: identity,
      storedIdentity: identity,
      expectedCaseIds,
      existingResults: expectedCaseIds.slice(0, 40).map((caseKey) => result(caseKey)),
      maxCasesPerInvocation: 10,
      providerFailureThreshold: 8,
    });

    expect(state).toMatchObject({
      completedCaseIds: expectedCaseIds.slice(0, 40),
      pendingCaseIds: expectedCaseIds.slice(40),
      batchCaseIds: expectedCaseIds.slice(40, 50),
      providerFailureCount: 0,
      providerFailureThresholdReached: false,
      alreadyCompleted: false,
    });
  });

  it('returns no execution batch when a completed child has all 100 exact results', () => {
    const state = planAmiBrainGoldSubrun({
      runStatus: 'completed',
      expectedIdentity: identity,
      storedIdentity: identity,
      expectedCaseIds,
      existingResults: expectedCaseIds.map((caseKey) => result(caseKey)),
      maxCasesPerInvocation: 10,
      providerFailureThreshold: 8,
    });

    expect(state.alreadyCompleted).toBe(true);
    expect(state.pendingCaseIds).toEqual([]);
    expect(state.batchCaseIds).toEqual([]);
  });

  it('rejects a completed child with missing results', () => {
    expect(() =>
      planAmiBrainGoldSubrun({
        runStatus: 'completed',
        expectedIdentity: identity,
        storedIdentity: identity,
        expectedCaseIds,
        existingResults: expectedCaseIds.slice(0, 99).map((caseKey) => result(caseKey)),
        maxCasesPerInvocation: 10,
        providerFailureThreshold: 8,
      }),
    ).toThrow('ami_brain_gold_runtime_completed_run_incomplete:gold-100');
  });

  it('rejects an extra or duplicate result instead of silently counting it as progress', () => {
    expect(() =>
      planAmiBrainGoldSubrun({
        runStatus: 'running',
        expectedIdentity: identity,
        storedIdentity: identity,
        expectedCaseIds,
        existingResults: [result('gold-001'), result('gold-unexpected')],
        maxCasesPerInvocation: 10,
        providerFailureThreshold: 8,
      }),
    ).toThrow('ami_brain_gold_runtime_unexpected_results:gold-unexpected');
    expect(() =>
      planAmiBrainGoldSubrun({
        runStatus: 'running',
        expectedIdentity: identity,
        storedIdentity: identity,
        expectedCaseIds,
        existingResults: [result('gold-001'), result('gold-001')],
        maxCasesPerInvocation: 10,
        providerFailureThreshold: 8,
      }),
    ).toThrow('ami_brain_gold_runtime_duplicate_results');
  });

  it('rejects a child attached to another parent pipeline', () => {
    expect(() =>
      planAmiBrainGoldSubrun({
        runStatus: 'running',
        expectedIdentity: identity,
        storedIdentity: { ...identity, parentStandardRegressionRunId: 999, runtimeCommit: '9'.repeat(40) },
        expectedCaseIds,
        existingResults: [],
        maxCasesPerInvocation: 10,
        providerFailureThreshold: 8,
      }),
    ).toThrow('ami_brain_gold_runtime_identity_mismatch:parentStandardRegressionRunId,runtimeCommit');
  });

  it('carries provider failures across checkpoints and stops before executing another batch at the threshold', () => {
    const existingResults = expectedCaseIds.slice(0, 8).map((caseKey) => result(caseKey, 'provider_unavailable'));
    const state = planAmiBrainGoldSubrun({
      runStatus: 'running',
      expectedIdentity: identity,
      storedIdentity: identity,
      expectedCaseIds,
      existingResults,
      maxCasesPerInvocation: 20,
      providerFailureThreshold: 8,
    });

    expect(state.providerFailureCount).toBe(8);
    expect(state.providerFailureThresholdReached).toBe(true);
    expect(state.batchCaseIds).toEqual([]);
  });

  it('does not resume a failed child run or accept a malformed stored grade', () => {
    expect(() =>
      planAmiBrainGoldSubrun({
        runStatus: 'failed',
        expectedIdentity: identity,
        storedIdentity: identity,
        expectedCaseIds,
        existingResults: [],
        maxCasesPerInvocation: 10,
        providerFailureThreshold: 8,
      }),
    ).toThrow('ami_brain_gold_runtime_status_not_resumable:failed');
    expect(() =>
      planAmiBrainGoldSubrun({
        runStatus: 'running',
        expectedIdentity: identity,
        storedIdentity: identity,
        expectedCaseIds,
        existingResults: [
          {
            caseKey: 'gold-001',
            deterministicPassed: true,
            deterministicGrade: { goldCaseId: 'gold-999', passed: true, status: 'passed' },
          },
        ],
        maxCasesPerInvocation: 10,
        providerFailureThreshold: 8,
      }),
    ).toThrow('ami_brain_gold_runtime_existing_results_invalid:gold-001');
  });
});
