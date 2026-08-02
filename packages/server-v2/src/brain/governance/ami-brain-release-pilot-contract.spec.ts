import {
  assertAmiBrainReleasePilotProductProfile,
  parseAmiBrainReleasePilotOptions,
} from './ami-brain-release-pilot-contract.js';
import {
  BRAIN_QUERY_ONLY_ACTION_EXECUTION_POLICY,
  BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_CAPABILITY_MANIFEST,
  BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
  queryOnlyProductProfileFingerprint,
} from './brain-release-product-profile.js';

const REQUIRED_ARGS = [
  '--release-key=ami-brain-query-only-001',
  '--resource-version-ids=11,12,13',
  '--product-profile=query_only_v1',
  '--store-id=6',
  '--user-id=9',
];

describe('Ami Brain release pilot contract', () => {
  it('requires the exact query_only_v1 product profile', () => {
    expect(parseAmiBrainReleasePilotOptions(REQUIRED_ARGS)).toMatchObject({
      releaseKey: 'ami-brain-query-only-001',
      resourceVersionIds: [11, 12, 13],
      productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
      storeId: 6,
      userId: 9,
    });
    expect(() =>
      parseAmiBrainReleasePilotOptions(REQUIRED_ARGS.filter((arg) => !arg.startsWith('--product-profile='))),
    ).toThrow('missing --product-profile');
    expect(() =>
      parseAmiBrainReleasePilotOptions(
        REQUIRED_ARGS.map((arg) => arg.startsWith('--product-profile=') ? '--product-profile=full_actions_v1' : arg),
      ),
    ).toThrow('product-profile must be query_only_v1');
  });

  it('accepts only the complete frozen query-only rollout contract', () => {
    const rollout = {
      productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
      actionsEnabled: false,
      actionExecutionPolicy: BRAIN_QUERY_ONLY_ACTION_EXECUTION_POLICY,
      allowedCapabilityManifest: BRAIN_QUERY_ONLY_CAPABILITY_MANIFEST,
      allowedCapabilityCount: BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.length,
      sideEffectCapabilityCount: 0,
      productProfileFingerprint: queryOnlyProductProfileFingerprint(),
    };
    expect(() => assertAmiBrainReleasePilotProductProfile(rollout, BRAIN_QUERY_ONLY_PRODUCT_PROFILE)).not.toThrow();
    expect(() => assertAmiBrainReleasePilotProductProfile(
      { ...rollout, actionsEnabled: true },
      BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
    )).toThrow('release_product_profile_contract_invalid:actionsEnabled');
    expect(() => assertAmiBrainReleasePilotProductProfile(
      { ...rollout, productProfileFingerprint: 'stale' },
      BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
    )).toThrow('release_product_profile_contract_invalid:productProfileFingerprint');
  });
});
