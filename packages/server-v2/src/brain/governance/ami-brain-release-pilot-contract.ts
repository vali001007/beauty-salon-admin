import {
  BRAIN_QUERY_ONLY_ACTION_EXECUTION_POLICY,
  BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_CAPABILITY_MANIFEST,
  BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
  queryOnlyProductProfileFingerprint,
} from './brain-release-product-profile.js';

export type AmiBrainReleasePilotOptions = {
  releaseKey: string;
  resourceVersionIds: number[];
  productProfile: typeof BRAIN_QUERY_ONLY_PRODUCT_PROFILE;
  storeId: number;
  userId: number;
  rollbackAfterEval: boolean;
  preferFallback: boolean;
  dryRun: boolean;
  evaluateOnly: boolean;
  resumeEvalRunId?: number;
  caseKeys: string[];
  archiveOnFailure: boolean;
  regenerationRequirement?: string;
  evaluationReleaseId?: number;
};

export function parseAmiBrainReleasePilotOptions(args: string[]): AmiBrainReleasePilotOptions {
  const values = new Map(
    args
      .filter((arg) => arg.startsWith('--') && arg.includes('='))
      .map((arg) => {
        const separator = arg.indexOf('=');
        return [arg.slice(2, separator), arg.slice(separator + 1)] as const;
      }),
  );
  const releaseKey = required(values.get('release-key'), 'release-key');
  const resourceVersionIds = required(values.get('resource-version-ids'), 'resource-version-ids')
    .split(',')
    .map((value) => Number(value.trim()));
  const productProfile = required(values.get('product-profile'), 'product-profile');
  const storeId = Number(required(values.get('store-id'), 'store-id'));
  const userId = Number(required(values.get('user-id'), 'user-id'));
  const resumeEvalRunId = values.get('resume-eval-run-id') ? Number(values.get('resume-eval-run-id')) : undefined;
  const evaluationReleaseId = values.get('evaluation-release-id') ? Number(values.get('evaluation-release-id')) : undefined;
  if (productProfile !== BRAIN_QUERY_ONLY_PRODUCT_PROFILE) {
    throw new Error(`product-profile must be ${BRAIN_QUERY_ONLY_PRODUCT_PROFILE}`);
  }
  if (resourceVersionIds.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error('resource-version-ids must contain positive integers');
  }
  if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('store-id must be a positive integer');
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('user-id must be a positive integer');
  if (resumeEvalRunId !== undefined && (!Number.isInteger(resumeEvalRunId) || resumeEvalRunId <= 0)) {
    throw new Error('resume-eval-run-id must be a positive integer');
  }
  if (evaluationReleaseId !== undefined && (!Number.isInteger(evaluationReleaseId) || evaluationReleaseId <= 0)) {
    throw new Error('evaluation-release-id must be a positive integer');
  }
  return {
    releaseKey,
    resourceVersionIds,
    productProfile,
    storeId,
    userId,
    rollbackAfterEval: values.get('rollback-after-eval') === 'true',
    preferFallback: values.get('prefer-fallback') === 'true',
    dryRun: values.get('dry-run') === 'true',
    evaluateOnly: values.get('evaluate-only') === 'true',
    resumeEvalRunId,
    caseKeys: (values.get('case-keys') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    archiveOnFailure: values.get('archive-on-failure') === 'true',
    regenerationRequirement: values.get('regeneration-requirement')?.trim() || undefined,
    evaluationReleaseId,
  };
}

export function assertAmiBrainReleasePilotProductProfile(
  rollout: Record<string, unknown>,
  productProfile: typeof BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
): void {
  const expected = {
    productProfile,
    actionsEnabled: false,
    actionExecutionPolicy: BRAIN_QUERY_ONLY_ACTION_EXECUTION_POLICY,
    allowedCapabilityManifest: BRAIN_QUERY_ONLY_CAPABILITY_MANIFEST,
    allowedCapabilityCount: BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.length,
    sideEffectCapabilityCount: 0,
    productProfileFingerprint: queryOnlyProductProfileFingerprint(),
  } as const;
  for (const [field, value] of Object.entries(expected)) {
    if (rollout[field] !== value) {
      throw new Error(`release_product_profile_contract_invalid:${field}`);
    }
  }
}

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`missing --${name}`);
  return value.trim();
}
