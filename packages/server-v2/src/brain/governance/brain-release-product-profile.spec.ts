import {
  BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
  brainReleaseActionsEnabled,
  filterCapabilitiesForBrainReleaseProductProfile,
  normalizeBrainReleaseProductProfileRollout,
  queryOnlyProductProfileFingerprint,
  validateBrainReleaseProductProfile,
} from './brain-release-product-profile.js';

describe('Brain release product profile', () => {
  const capabilities = BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.map((key) => ({
    key,
    readOnly: true,
    sideEffect: false,
  }));

  it('freezes the query-only contract and validates the exact 33 capability manifest', () => {
    const rollout = normalizeBrainReleaseProductProfileRollout({
      productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
    });

    expect(rollout).toMatchObject({
      productProfile: 'query_only_v1',
      actionsEnabled: false,
      actionExecutionPolicy: 'deny',
      allowedCapabilityManifest: 'ami-brain-query-only-v1',
      allowedCapabilityCount: 33,
      sideEffectCapabilityCount: 0,
      productProfileFingerprint: queryOnlyProductProfileFingerprint(),
    });
    expect(validateBrainReleaseProductProfile(rollout, capabilities)).toEqual([]);
    expect(brainReleaseActionsEnabled(rollout)).toBe(false);
  });

  it('blocks disabled, missing, extra, or side-effect capabilities', () => {
    const rollout = normalizeBrainReleaseProductProfileRollout({ productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE });
    const invalid = [
      ...capabilities.slice(1),
      { key: BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS[0], readOnly: false, sideEffect: true },
    ];

    expect(validateBrainReleaseProductProfile(rollout, invalid)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('brain_query_only_capability_manifest_mismatch'),
        `brain_query_only_side_effect_capability:${BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS[0]}`,
      ]),
    );
    expect(filterCapabilitiesForBrainReleaseProductProfile(rollout, invalid)).toHaveLength(32);
  });

  it('rejects attempts to weaken the query-only contract', () => {
    expect(() =>
      normalizeBrainReleaseProductProfileRollout({
        productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
        actionsEnabled: true,
      }),
    ).toThrow('brain_query_only_actions_must_be_disabled');
  });
});
