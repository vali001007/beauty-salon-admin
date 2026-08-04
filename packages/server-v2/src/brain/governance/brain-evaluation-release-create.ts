export function assertReusableEvaluationRelease(
  release: {
    status: string;
    scope: string;
    rollout: unknown;
    previousReleaseId: number | null;
    items: Array<{ resourceVersionId: number }>;
  },
  expectedResourceVersionIds: readonly number[],
  baseReleaseId: number,
  expectedProductProfile?: string,
) {
  const rollout = record(release.rollout);
  const actualResourceVersionIds = release.items
    .map((item) => item.resourceVersionId)
    .sort((left, right) => left - right);
  if (
    release.status !== 'draft' ||
    release.scope !== 'percentage' ||
    release.previousReleaseId !== baseReleaseId ||
    rollout.stage !== 'shadow' ||
    rollout.mode !== 'shadow' ||
    rollout.evaluationOnly !== true ||
    rollout.userPercentage !== 100 ||
    (expectedProductProfile !== undefined && rollout.productProfile !== expectedProductProfile) ||
    JSON.stringify(actualResourceVersionIds) !== JSON.stringify(expectedResourceVersionIds)
  ) {
    throw new Error('evaluation_release_existing_mismatch');
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
