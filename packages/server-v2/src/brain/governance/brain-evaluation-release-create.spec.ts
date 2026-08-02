import { assertReusableEvaluationRelease } from './brain-evaluation-release-create.js';

describe('Ami Brain evaluation release creation', () => {
  const release = {
    status: 'draft',
    scope: 'percentage',
    rollout: { stage: 'shadow', mode: 'shadow', evaluationOnly: true, userPercentage: 100 },
    previousReleaseId: 416,
    items: [{ resourceVersionId: 3 }, { resourceVersionId: 1 }, { resourceVersionId: 2 }],
  };

  it('allows idempotent reuse only when the release identity is unchanged', () => {
    expect(() => assertReusableEvaluationRelease(release, [1, 2, 3], 416)).not.toThrow();
  });

  it.each([
    [{ ...release, status: 'active' }, 'activated release'],
    [{ ...release, rollout: { ...release.rollout, evaluationOnly: false } }, 'deployable release'],
    [{ ...release, previousReleaseId: 417 }, 'different base release'],
    [{ ...release, items: [{ resourceVersionId: 1 }, { resourceVersionId: 2 }] }, 'different resource set'],
  ])('rejects reuse of an existing %s', (candidate) => {
    expect(() => assertReusableEvaluationRelease(candidate, [1, 2, 3], 416)).toThrow(
      'evaluation_release_existing_mismatch',
    );
  });
});
