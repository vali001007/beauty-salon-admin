export interface AmiBrainGoldRuntimeIdentity {
  contractVersion: 'ami-brain-gold-standard-runtime/v1';
  parentStandardRegressionRunId: number;
  releaseId: number;
  storeId: number;
  releaseFingerprint: string;
  sourceCommit: string;
  runtimeCommit: string;
  sourceChecksum: string;
  suiteManifestVersion: string;
  suiteManifestChecksum: string;
  goldStandardManifestChecksum: string;
  standardRegressionCaseIdsChecksum: string;
}

export interface AmiBrainGoldExistingResult {
  caseKey: string;
  deterministicPassed: boolean;
  deterministicGrade: unknown;
}

export function buildAmiBrainGoldRuntimeIdentity(
  input: Omit<AmiBrainGoldRuntimeIdentity, 'contractVersion'>,
): AmiBrainGoldRuntimeIdentity {
  return { contractVersion: 'ami-brain-gold-standard-runtime/v1', ...input };
}

export function planAmiBrainGoldSubrun(input: {
  runStatus: string;
  expectedIdentity: AmiBrainGoldRuntimeIdentity;
  storedIdentity: unknown;
  expectedCaseIds: string[];
  existingResults: AmiBrainGoldExistingResult[];
  maxCasesPerInvocation: number;
  providerFailureThreshold: number;
}) {
  const storedIdentity = record(input.storedIdentity);
  const identityMismatches = Object.entries(input.expectedIdentity)
    .filter(([key, value]) => storedIdentity[key] !== value)
    .map(([key]) => key);
  if (identityMismatches.length) {
    throw new Error(`ami_brain_gold_runtime_identity_mismatch:${identityMismatches.join(',')}`);
  }
  if (!['running', 'completed'].includes(input.runStatus)) {
    throw new Error(`ami_brain_gold_runtime_status_not_resumable:${input.runStatus}`);
  }
  if (!Number.isInteger(input.maxCasesPerInvocation) || input.maxCasesPerInvocation <= 0) {
    throw new Error('ami_brain_gold_runtime_batch_limit_invalid');
  }
  if (!Number.isInteger(input.providerFailureThreshold) || input.providerFailureThreshold <= 0) {
    throw new Error('ami_brain_gold_runtime_provider_threshold_invalid');
  }
  const expectedIds = new Set(input.expectedCaseIds);
  if (expectedIds.size !== input.expectedCaseIds.length || expectedIds.has('')) {
    throw new Error('ami_brain_gold_runtime_expected_case_ids_invalid');
  }
  const existingIds = input.existingResults.map((item) => item.caseKey);
  if (new Set(existingIds).size !== existingIds.length) {
    throw new Error('ami_brain_gold_runtime_duplicate_results');
  }
  const unexpected = existingIds.filter((caseKey) => !expectedIds.has(caseKey));
  if (unexpected.length) {
    throw new Error(`ami_brain_gold_runtime_unexpected_results:${unexpected.join(',')}`);
  }
  const invalidResults = input.existingResults.filter((item) => {
    const grade = record(item.deterministicGrade);
    return (
      typeof item.deterministicPassed !== 'boolean' ||
      grade.goldCaseId !== item.caseKey ||
      typeof grade.passed !== 'boolean' ||
      grade.passed !== item.deterministicPassed ||
      typeof grade.status !== 'string' ||
      !grade.status
    );
  });
  if (invalidResults.length) {
    throw new Error(
      `ami_brain_gold_runtime_existing_results_invalid:${invalidResults.slice(0, 20).map((item) => item.caseKey).join(',')}`,
    );
  }
  const completedIds = new Set(existingIds);
  const pendingCaseIds = input.expectedCaseIds.filter((caseKey) => !completedIds.has(caseKey));
  if (input.runStatus === 'completed' && pendingCaseIds.length) {
    throw new Error(`ami_brain_gold_runtime_completed_run_incomplete:${pendingCaseIds.slice(0, 20).join(',')}`);
  }
  const providerFailureCount = input.existingResults.filter(
    (item) => record(item.deterministicGrade).status === 'provider_unavailable',
  ).length;
  const providerFailureThresholdReached = providerFailureCount >= input.providerFailureThreshold;
  return {
    completedCaseIds: existingIds,
    pendingCaseIds,
    batchCaseIds:
      input.runStatus === 'completed' || providerFailureThresholdReached
        ? []
        : pendingCaseIds.slice(0, input.maxCasesPerInvocation),
    providerFailureCount,
    providerFailureThresholdReached,
    alreadyCompleted: input.runStatus === 'completed',
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
