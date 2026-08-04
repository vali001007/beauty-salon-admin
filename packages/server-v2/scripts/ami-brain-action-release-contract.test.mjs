import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  AMI_BRAIN_ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
  buildAmiBrainActionReleaseContract,
  readAmiBrainActionInvariantManifest,
  readAmiBrainActionPredicateEffectManifest,
  readAmiBrainActionRelationManifest,
  readAmiBrainQueryOnlyProductProfile,
  validActionInstitutionalEffect,
} from './ami-brain-action-release-contract.mjs';

const COMMIT = '1'.repeat(40);
const REPO_ROOT = resolve(process.cwd(), '../..');
const ACTION_KEY = 'action.create_reservation';
const CAPABILITY_KEY = 'reservation_action_preview';
const GATEWAY_ACTION_KEY = 'create_reservation';
const DEFINITION_FINGERPRINT = 'a'.repeat(64);
const DEFINITION_SOURCE_FINGERPRINT = 'b'.repeat(64);
const CAPABILITY_SOURCE_FINGERPRINT = 'c'.repeat(64);
const PREDICATE_FINGERPRINT = '873b367c9c5355e64f27266e1a5772afdb4595fc5335c45332a6c0d87af26c53';
const EFFECT_FINGERPRINT = 'e0d4f41cc2dca7066f80206e0a6766bcfdcacc931e90a44ecab0713b4350e31c';
const ACTION_INVARIANT_FINGERPRINT = 'f693c56dbba1def25a8a8056daf343d28f7e555cf3ca98d9fa729d8d17050904';

test('accepts one published action when Release, definition, binding, capability, projection, and Gateway agree', () => {
  const fixture = contractFixture();
  const contract = buildAmiBrainActionReleaseContract(fixture);

  assert.equal(contract.passed, true);
  assert.equal(contract.identityChecksum, AMI_BRAIN_ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM);
  assert.deepEqual(contract.blockingReasons, []);
  assert.equal(contract.release.semanticSnapshotMatches, true);
  assert.equal(contract.actions[0].passed, true);
  assert.match(contract.actions[0].lexicalFrameFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(contract.actions[0].situationContextFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(contract.actions[0].modalityPolicyFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(contract.actions[0].informationArtifactFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(contract.actions[0].sideEffectInvariantFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(contract.actions[0].participantProfileFingerprint, /^[a-f0-9]{64}$/u);
  assert.match(contract.actions[0].relationProfileFingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(contract.actions[0].institutionalEffectFingerprint, null);
  assert.equal(contract.actions[0].actionInvariantContractFingerprint, ACTION_INVARIANT_FINGERPRINT);
});

test('accepts a passed validated Action definition only for an evaluation-only Release', () => {
  const fixture = contractFixture();
  fixture.release.rollout.evaluationOnly = true;
  fixture.release.rollout.mode = 'shadow';
  fixture.release.rollout.stage = 'shadow';
  fixture.definitionVersions[0].lifecycleStatus = 'validated';
  fixture.definitionVersions[0].definition.currentPublishedVersionId = null;

  const contract = buildAmiBrainActionReleaseContract(fixture);

  assert.equal(contract.passed, true);
  assert.deepEqual(contract.blockingReasons, []);
});

test('accepts query_only_v1 only when all 33 read-only capabilities are present and all 8 Action capabilities are excluded', () => {
  const queryOnly = readAmiBrainQueryOnlyProductProfile(REPO_ROOT);
  const items = queryOnly.profile.allowedCapabilityKeys.map((resourceKey, index) => {
    const snapshot = { key: resourceKey, version: 1, readOnly: true, sideEffect: false, definitionRefs: [] };
    return {
      resourceVersionId: index + 1,
      resourceType: 'skill',
      resourceKey,
      version: 1,
      snapshot,
      resourceVersion: {
        id: index + 1,
        resourceType: 'skill',
        resourceKey,
        version: 1,
        status: 'active',
        checksum: createHash('sha256').update(resourceKey).digest('hex'),
        snapshot,
      },
    };
  });
  const versionMap = Object.fromEntries(items.map((item) => [`skill:${item.resourceKey}`, 1]));
  const semanticSnapshotFingerprint = createHash('sha256')
    .update(JSON.stringify(items.map((item) => ({ resourceKey: item.resourceKey, definitionRefs: [] }))))
    .digest('hex');
  const productProfileFingerprint = createHash('sha256')
    .update(JSON.stringify({
      productProfile: queryOnly.profile.productProfile,
      actionsEnabled: false,
      allowedCapabilityManifest: queryOnly.profile.allowedCapabilityManifest,
      allowedCapabilityCount: queryOnly.profile.allowedCapabilityKeys.length,
      sideEffectCapabilityCount: 0,
      actionExecutionPolicy: queryOnly.profile.actionExecutionPolicy,
    }))
    .digest('hex');
  const release = {
    id: 453,
    releaseKey: 'ami-brain-eval-ev-001-query-only-v1',
    status: 'draft',
    items,
    versionMap,
    rollout: {
      evaluationOnly: true,
      productProfile: queryOnly.profile.productProfile,
      actionsEnabled: false,
      actionExecutionPolicy: queryOnly.profile.actionExecutionPolicy,
      allowedCapabilityManifest: queryOnly.profile.allowedCapabilityManifest,
      allowedCapabilityCount: queryOnly.profile.allowedCapabilityKeys.length,
      sideEffectCapabilityCount: 0,
      productProfileFingerprint,
      semanticSnapshotFingerprint,
    },
  };
  const contract = buildAmiBrainActionReleaseContract({
    expectedReleaseId: 453,
    headCommit: COMMIT,
    release,
    queryOnlyProductProfile: queryOnly.profile,
    queryOnlyProductProfileSourceChecksum: queryOnly.sourceChecksum,
  });

  assert.equal(contract.passed, true);
  assert.equal(contract.actionPolicyMode, 'query_only_exclusion');
  assert.equal(contract.summary.requiredActionCount, 8);
  assert.equal(contract.summary.passedActionCount, 8);
  assert.equal(contract.queryOnlyProductProfile.allowedCapabilityCount, 33);
  assert.deepEqual(contract.blockingReasons, []);

  const drifted = buildAmiBrainActionReleaseContract({
    expectedReleaseId: 453,
    headCommit: COMMIT,
    release: { ...release, rollout: { ...release.rollout, actionsEnabled: true } },
    queryOnlyProductProfile: queryOnly.profile,
    queryOnlyProductProfileSourceChecksum: queryOnly.sourceChecksum,
  });
  assert.ok(drifted.blockingReasons.includes('query_only_product_profile_contract_invalid:actionsEnabled'));
});

test('loads the governed action invariant manifest only when its catalog checksum matches this candidate', () => {
  const result = readAmiBrainActionInvariantManifest(resolve(process.cwd(), '../..'));

  assert.equal(result.manifest.contracts.length, 6);
  assert.match(result.sourceChecksum, /^[a-f0-9]{64}$/u);
});

test('loads the governed Predicate/Effect manifest only when its source checksums match this candidate', () => {
  const result = readAmiBrainActionPredicateEffectManifest(resolve(process.cwd(), '../..'));

  assert.equal(result.manifest.predicates.length, 11);
  assert.equal(result.manifest.effects.length, 6);
  assert.match(result.sourceChecksum, /^[a-f0-9]{64}$/u);
});

test('loads the governed ActionRelation manifest only when its catalog checksum matches this candidate', () => {
  const result = readAmiBrainActionRelationManifest(resolve(process.cwd(), '../..'));

  assert.ok(result.manifest.relations.length >= 14);
  assert.match(result.sourceChecksum, /^[a-f0-9]{64}$/u);
});

test('requires the exact institutional-effect contract only for governed state-changing actions', () => {
  const preconditions = ['context_store_resolved', 'reservation_belongs_to_context_store'];
  const profile = institutionalEffectProfile('action.cancel_reservation', preconditions);
  assert.equal(
    validActionInstitutionalEffect(
      { actionKey: 'action.cancel_reservation', preconditions, institutionalEffect: profile },
      'action.cancel_reservation',
    ),
    true,
  );

  const drift = structuredClone(profile);
  drift.formalStateTransition.toState = 'pending_approval';
  refreshProfileFingerprint(drift);
  assert.equal(
    validActionInstitutionalEffect(
      { actionKey: 'action.cancel_reservation', preconditions, institutionalEffect: drift },
      'action.cancel_reservation',
    ),
    false,
  );
  assert.equal(
    validActionInstitutionalEffect(
      { actionKey: ACTION_KEY, preconditions: ['context_store_resolved'], institutionalEffect: profile },
      ACTION_KEY,
    ),
    false,
  );
});

test('rejects Action definition identity, binding, Gateway, lifecycle, and semantic snapshot drift', () => {
  const definitionDrift = contractFixture();
  definitionDrift.definitionVersions[0].fingerprint = '0'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(definitionDrift).blockingReasons.includes(
      `required_action_definition_identity_mismatch:${ACTION_KEY}`,
    ),
  );

  const bindingDrift = contractFixture();
  bindingDrift.definitionVersions[0].payload.capabilityBindings[0].gatewayActionKey = 'cancel_reservation';
  assert.ok(
    buildAmiBrainActionReleaseContract(bindingDrift).blockingReasons.includes(
      `required_action_binding_gateway_mismatch:${ACTION_KEY}`,
    ),
  );

  const gatewayDrift = contractFixture();
  gatewayDrift.gatewayDescriptors[GATEWAY_ACTION_KEY].riskLevel = 'high';
  assert.ok(
    buildAmiBrainActionReleaseContract(gatewayDrift).blockingReasons.includes(
      `required_action_gateway_contract_mismatch:${ACTION_KEY}`,
    ),
  );

  const gatewayEffectDrift = contractFixture();
  gatewayEffectDrift.gatewayDescriptors[GATEWAY_ACTION_KEY].effectKeys = ['reservation_cancelled'];
  assert.ok(
    buildAmiBrainActionReleaseContract(gatewayEffectDrift).blockingReasons.includes(
      `required_action_gateway_contract_mismatch:${ACTION_KEY}`,
    ),
  );

  const lifecycleDrift = contractFixture();
  lifecycleDrift.definitionVersions[0].lifecycleStatus = 'validated';
  assert.ok(
    buildAmiBrainActionReleaseContract(lifecycleDrift).blockingReasons.includes(
      `required_action_definition_not_validated:${ACTION_KEY}`,
    ),
  );

  const semanticDrift = contractFixture();
  semanticDrift.release.rollout.semanticSnapshotFingerprint = 'f'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(semanticDrift).blockingReasons.includes(
      'action_release_semantic_snapshot_fingerprint_mismatch',
    ),
  );
});

test('rejects Predicate and Effect references that do not match the authoritative manifest', () => {
  const predicateDrift = contractFixture();
  predicateDrift.definitionVersions[0].payload.preconditionPredicateRefs[0].fingerprint = '6'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(predicateDrift).blockingReasons.includes(
      `required_action_predicate_effect_contract_invalid:${ACTION_KEY}`,
    ),
  );

  const effectDrift = contractFixture();
  effectDrift.definitionVersions[0].payload.effectAssertionRefs[0].fingerprint = '7'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(effectDrift).blockingReasons.includes(
      `required_action_predicate_effect_contract_invalid:${ACTION_KEY}`,
    ),
  );

  const missingManifest = contractFixture();
  missingManifest.predicateEffectManifest = {};
  assert.ok(
    buildAmiBrainActionReleaseContract(missingManifest).blockingReasons.includes(
      'action_predicate_effect_manifest_invalid',
    ),
  );

  const checksumDrift = contractFixture();
  checksumDrift.predicateEffectManifestChecksum = 'f'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(checksumDrift).blockingReasons.includes(
      'action_predicate_effect_manifest_checksum_mismatch',
    ),
  );
});

test('rejects an Action lexical frame whose governed fingerprint drifts', () => {
  const lexicalFrameDrift = contractFixture();
  lexicalFrameDrift.definitionVersions[0].payload.lexicalFrame.fingerprint = '5'.repeat(64);

  assert.ok(
    buildAmiBrainActionReleaseContract(lexicalFrameDrift).blockingReasons.includes(
      `required_action_lexical_frame_invalid:${ACTION_KEY}`,
    ),
  );
});

test('rejects an Action situation context whose governed fingerprint or policy drifts', () => {
  const fingerprintDrift = contractFixture();
  fingerprintDrift.definitionVersions[0].payload.situationContext.fingerprint = '4'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(fingerprintDrift).blockingReasons.includes(
      `required_action_situation_context_invalid:${ACTION_KEY}`,
    ),
  );

  const policyDrift = contractFixture();
  policyDrift.definitionVersions[0].payload.situationContext.businessTimePolicy.timezone = 'UTC';
  refreshSituationContextFingerprint(policyDrift);
  assert.ok(
    buildAmiBrainActionReleaseContract(policyDrift).blockingReasons.includes(
      `required_action_situation_context_invalid:${ACTION_KEY}`,
    ),
  );
});

test('rejects an Action modality policy whose governed fingerprint or supported modality drifts', () => {
  const fingerprintDrift = contractFixture();
  fingerprintDrift.definitionVersions[0].payload.modalityPolicy.fingerprint = '3'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(fingerprintDrift).blockingReasons.includes(
      `required_action_modality_policy_invalid:${ACTION_KEY}`,
    ),
  );

  const modalityDrift = contractFixture();
  modalityDrift.definitionVersions[0].payload.modalityPolicy.supportedModalities = ['request', 'confirm'];
  refreshProfileFingerprint(modalityDrift.definitionVersions[0].payload.modalityPolicy);
  assert.ok(
    buildAmiBrainActionReleaseContract(modalityDrift).blockingReasons.includes(
      `required_action_modality_policy_invalid:${ACTION_KEY}`,
    ),
  );
});

test('rejects an Action information artifact profile whose fingerprint or source boundary drifts', () => {
  const fingerprintDrift = contractFixture();
  fingerprintDrift.definitionVersions[0].payload.informationArtifact.fingerprint = '2'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(fingerprintDrift).blockingReasons.includes(
      `required_action_information_artifact_invalid:${ACTION_KEY}`,
    ),
  );

  const sourceDrift = contractFixture();
  sourceDrift.definitionVersions[0].payload.informationArtifact.sourcePolicy = 'any_completed_brain_run';
  refreshProfileFingerprint(sourceDrift.definitionVersions[0].payload.informationArtifact);
  assert.ok(
    buildAmiBrainActionReleaseContract(sourceDrift).blockingReasons.includes(
      `required_action_information_artifact_invalid:${ACTION_KEY}`,
    ),
  );
});

test('rejects an Action side-effect invariant whose fingerprint or effect contract drifts', () => {
  const fingerprintDrift = contractFixture();
  fingerprintDrift.definitionVersions[0].payload.sideEffectInvariant.fingerprint = '1'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(fingerprintDrift).blockingReasons.includes(
      `required_action_side_effect_invariant_invalid:${ACTION_KEY}`,
    ),
  );

  const effectDrift = contractFixture();
  effectDrift.definitionVersions[0].payload.sideEffectInvariant.successEvidencePolicy = 'gateway_accepted';
  refreshProfileFingerprint(effectDrift.definitionVersions[0].payload.sideEffectInvariant);
  assert.ok(
    buildAmiBrainActionReleaseContract(effectDrift).blockingReasons.includes(
      `required_action_side_effect_invariant_invalid:${ACTION_KEY}`,
    ),
  );

  const gatewayPolicyDrift = contractFixture();
  gatewayPolicyDrift.definitionVersions[0].payload.sideEffectInvariant.gatewayEffectPolicy = 'trust_gateway';
  refreshProfileFingerprint(gatewayPolicyDrift.definitionVersions[0].payload.sideEffectInvariant);
  assert.ok(
    buildAmiBrainActionReleaseContract(gatewayPolicyDrift).blockingReasons.includes(
      `required_action_side_effect_invariant_invalid:${ACTION_KEY}`,
    ),
  );

  const invariantDrift = contractFixture();
  invariantDrift.definitionVersions[0].payload.sideEffectInvariant.invariantContractRef.fingerprint = '2'.repeat(64);
  refreshProfileFingerprint(invariantDrift.definitionVersions[0].payload.sideEffectInvariant);
  assert.ok(
    buildAmiBrainActionReleaseContract(invariantDrift).blockingReasons.includes(
      `required_action_invariant_contract_invalid:${ACTION_KEY}`,
    ),
  );
});

test('rejects participant profiles that conflate responsibility or lose the governed fingerprint', () => {
  const sourceDrift = contractFixture();
  sourceDrift.definitionVersions[0].payload.participantProfile.roleBindings.find(
    (binding) => binding.role === 'performer',
  ).source = 'authenticated_user';
  refreshProfileFingerprint(sourceDrift.definitionVersions[0].payload.participantProfile);
  assert.ok(
    buildAmiBrainActionReleaseContract(sourceDrift).blockingReasons.includes(
      `required_action_participant_profile_invalid:${ACTION_KEY}`,
    ),
  );

  const fingerprintDrift = contractFixture();
  fingerprintDrift.definitionVersions[0].payload.participantProfile.fingerprint = '0'.repeat(64);
  assert.ok(
    buildAmiBrainActionReleaseContract(fingerprintDrift).blockingReasons.includes(
      `required_action_participant_profile_invalid:${ACTION_KEY}`,
    ),
  );
});

test('rejects ActionRelation refs that are unresolved or promote declared edges into runtime truth', () => {
  const refDrift = contractFixture();
  refDrift.definitionVersions[0].payload.relationProfile.relationRefs[0].relationDefinitionRef.fingerprint = '0'.repeat(
    64,
  );
  refreshProfileFingerprint(refDrift.definitionVersions[0].payload.relationProfile);
  assert.ok(
    buildAmiBrainActionReleaseContract(refDrift).blockingReasons.includes(
      `required_action_relation_profile_invalid:${ACTION_KEY}`,
    ),
  );

  const truthDrift = contractFixture();
  truthDrift.definitionVersions[0].payload.relationProfile.relationRefs.find(
    (relation) => relation.relationDefinitionRef.key === 'action_relation.acts_on',
  ).truthStatusPolicy = 'runtime_evaluator_required';
  refreshProfileFingerprint(truthDrift.definitionVersions[0].payload.relationProfile);
  assert.ok(
    buildAmiBrainActionReleaseContract(truthDrift).blockingReasons.includes(
      `required_action_relation_profile_invalid:${ACTION_KEY}`,
    ),
  );
});

test('rejects a lexical frame that the runtime schema or governed semantic anchors would reject', () => {
  const invalidRole = contractFixture();
  invalidRole.definitionVersions[0].payload.inputSlots[0].semanticRole = 'supplier';
  invalidRole.definitionVersions[0].payload.lexicalFrame.thematicRoles[0].semanticRole = 'supplier';
  refreshLexicalFrameFingerprint(invalidRole);
  assert.ok(
    buildAmiBrainActionReleaseContract(invalidRole).blockingReasons.includes(
      `required_action_lexical_frame_invalid:${ACTION_KEY}`,
    ),
  );

  const missingCanonicalName = contractFixture();
  missingCanonicalName.definitionVersions[0].payload.aliases = ['预约建档'];
  missingCanonicalName.definitionVersions[0].payload.lexicalFrame.lexicalUnits = ['预约建档'];
  refreshLexicalFrameFingerprint(missingCanonicalName);
  assert.ok(
    buildAmiBrainActionReleaseContract(missingCanonicalName).blockingReasons.includes(
      `required_action_lexical_frame_invalid:${ACTION_KEY}`,
    ),
  );

  const contradictoryTarget = contractFixture();
  contradictoryTarget.definitionVersions[0].payload.lexicalFrame.semanticPredicates = [
    ...contradictoryTarget.definitionVersions[0].payload.lexicalFrame.semanticPredicates.filter(
      (predicate) => !predicate.startsWith('creates:'),
    ),
    'creates:entity.purchase_order',
  ];
  refreshLexicalFrameFingerprint(contradictoryTarget);
  assert.ok(
    buildAmiBrainActionReleaseContract(contradictoryTarget).blockingReasons.includes(
      `required_action_lexical_frame_invalid:${ACTION_KEY}`,
    ),
  );
});

function contractFixture() {
  const actionRelation = readAmiBrainActionRelationManifest(resolve(process.cwd(), '../..'));
  const predicateEffectManifest = {
    schemaVersion: 'ami-brain-action-predicate-effect-manifest/v1',
    catalogSchemaVersion: '1.0',
    catalogSource: {
      path: 'packages/server-v2/src/semantic-data/brain-action-predicate-effect-catalog.ts',
      checksum: '8'.repeat(64),
    },
    evaluatorSource: {
      path: 'packages/server-v2/src/brain/domain/brain-action-predicate-effect-evaluator.service.ts',
      checksum: '9'.repeat(64),
    },
    predicates: [{ key: 'context_store_resolved', version: 1, fingerprint: PREDICATE_FINGERPRINT }],
    effects: [{ key: 'reservation_created_in_context_store', version: 1, fingerprint: EFFECT_FINGERPRINT }],
  };
  const lexicalFrameInput = {
    schemaVersion: '1.0',
    frameKey: `${ACTION_KEY}.lexical_frame`,
    lexicalUnits: ['创建预约'],
    thematicRoles: [{ semanticRole: 'object', slotKeys: ['reservation'] }],
    semanticPredicates: [
      'creates:entity.reservation',
      `effect_ref:reservation_created_in_context_store`,
      `occurrence_of:${ACTION_KEY}`,
      `precondition_ref:context_store_resolved`,
    ],
    contrasts: [
      {
        conceptKey: 'action.reschedule_reservation',
        name: '预约改期',
        discriminators: [
          {
            dimension: 'state_transition',
            currentActionValue: '创建新的预约',
            contrastActionValue: '更新已有预约时间',
          },
        ],
      },
    ],
  };
  const actionInvariantManifest = {
    schemaVersion: 'ami-brain-action-invariant-manifest/v1',
    catalogSchemaVersion: '1.1',
    catalogSource: {
      path: 'packages/server-v2/src/semantic-data/brain-action-invariant-catalog.ts',
      checksum: '7'.repeat(64),
    },
    contracts: [
      invariantManifestEntry(
        'action.create_customer',
        '5ce1c7995dda4c9494be82cb750a762044cf215dc03bf246470778f8446c12eb',
      ),
      invariantManifestEntry(
        'action.create_purchase_order',
        '4a4bbef64c90c6044a3cb42fc09370a7267401b839787231cfcc880e559a1fee',
      ),
      invariantManifestEntry(
        'action.submit_purchase_order_for_approval',
        'f98fb6280fdf9649038df5a2b8a3d29b15a81c2ba56441fe5eb2cb3b65e436fb',
      ),
      invariantManifestEntry(ACTION_KEY, ACTION_INVARIANT_FINGERPRINT),
      invariantManifestEntry(
        'action.reschedule_reservation',
        '554cffedf284387f9c9e9f26d73e0bd20f10eca66205973f2e567137d632c705',
      ),
      invariantManifestEntry(
        'action.cancel_reservation',
        'ee8b891ed8927ce578221d55c381d6bb61a5a118e9e82154144c821d14d974ca',
      ),
    ],
  };
  const actionPayload = {
    actionKey: ACTION_KEY,
    actionClass: 'reserve',
    aliases: ['创建预约'],
    targetEntityRefs: ['entity.reservation'],
    inputSlots: [
      {
        slotKey: 'reservation',
        semanticRole: 'object',
      },
    ],
    confirmationPolicy: 'required',
    idempotencyPolicy: 'required',
    riskPolicy: 'medium',
    preconditions: ['context_store_resolved'],
    preconditionPredicateRefs: [{ key: 'context_store_resolved', version: 1, fingerprint: PREDICATE_FINGERPRINT }],
    effects: ['reservation_created_in_context_store'],
    effectAssertionRefs: [{ key: 'reservation_created_in_context_store', version: 1, fingerprint: EFFECT_FINGERPRINT }],
    lexicalFrame: { ...lexicalFrameInput, fingerprint: sha256(stableStringify(lexicalFrameInput)) },
    situationContext: situationContext(ACTION_KEY),
    modalityPolicy: modalityPolicy(ACTION_KEY),
    informationArtifact: informationArtifact(ACTION_KEY),
    sideEffectInvariant: sideEffectInvariant(ACTION_KEY, {
      preconditions: ['context_store_resolved'],
      predicateRefs: [{ key: 'context_store_resolved', version: 1, fingerprint: PREDICATE_FINGERPRINT }],
      effects: ['reservation_created_in_context_store'],
      effectRefs: [{ key: 'reservation_created_in_context_store', version: 1, fingerprint: EFFECT_FINGERPRINT }],
      invariantContractRef: invariantRef(ACTION_KEY, ACTION_INVARIANT_FINGERPRINT),
    }),
    participantProfile: participantProfile(ACTION_KEY),
    capabilityBindings: [
      {
        capabilityKey: CAPABILITY_KEY,
        bindingMode: 'preview_and_execute',
        gatewayActionKey: GATEWAY_ACTION_KEY,
        priority: 0,
        enabled: true,
      },
    ],
  };
  actionPayload.relationProfile = relationProfile(
    ACTION_KEY,
    actionPayload.targetEntityRefs,
    actionPayload.participantProfile,
    actionRelation.manifest,
  );
  const definitionRef = {
    definitionKey: ACTION_KEY,
    versionId: 31,
    version: 3,
    definitionFingerprint: DEFINITION_FINGERPRINT,
    sourceFingerprint: DEFINITION_SOURCE_FINGERPRINT,
  };
  const capabilitySnapshot = {
    key: CAPABILITY_KEY,
    version: 25,
    sourceFingerprint: CAPABILITY_SOURCE_FINGERPRINT,
    sideEffect: true,
    requiresConfirmation: true,
    idempotency: 'required',
    riskLevel: 'high',
    requiredPermissions: ['core:brain:use', 'core:store:reservations'],
    definitionRefs: [definitionRef],
  };
  const resourceVersion = {
    id: 91,
    resourceType: 'skill',
    resourceKey: CAPABILITY_KEY,
    version: 25,
    status: 'active',
    snapshot: capabilitySnapshot,
    checksum: 'd'.repeat(64),
  };
  const item = {
    resourceVersionId: resourceVersion.id,
    resourceType: resourceVersion.resourceType,
    resourceKey: resourceVersion.resourceKey,
    version: resourceVersion.version,
    snapshot: capabilitySnapshot,
    resourceVersion,
  };
  const projectionPayload = {
    projectionSchemaVersion: '2.0',
    preview: false,
    projectionType: 'intent_semantic_index',
    definitionRef: {
      definitionKey: ACTION_KEY,
      definitionVersion: 3,
      definitionFingerprint: DEFINITION_FINGERPRINT,
      sourceFingerprint: DEFINITION_SOURCE_FINGERPRINT,
    },
    data: {
      definitionKind: 'action',
      domain: 'front_desk',
      name: '创建预约',
      aliases: ['创建预约'],
      searchableTerms: ['创建预约'],
      semanticKey: ACTION_KEY,
      runtimeDefinition: actionPayload,
    },
  };
  const projection = {
    definitionVersionId: 31,
    targetType: 'intent_semantic_index',
    targetKey: `${ACTION_KEY}@3`,
    definitionKey: ACTION_KEY,
    definitionVersion: 3,
    definitionFingerprint: DEFINITION_FINGERPRINT,
    sourceFingerprint: DEFINITION_SOURCE_FINGERPRINT,
    payload: projectionPayload,
    readOnly: true,
  };
  projection.projectionFingerprint = sha256(
    stableStringify({
      targetType: projection.targetType,
      targetKey: projection.targetKey,
      definitionVersionId: projection.definitionVersionId,
      definitionRef: projectionPayload.definitionRef,
      payload: projectionPayload,
      readOnly: true,
    }),
  );
  const semanticSnapshotFingerprint = sha256(
    JSON.stringify([
      {
        resourceKey: CAPABILITY_KEY,
        definitionRefs: [definitionRef],
      },
    ]),
  );
  return {
    expectedReleaseId: 416,
    headCommit: COMMIT,
    release: {
      id: 416,
      releaseKey: 'action-release-test',
      status: 'draft',
      versionMap: { [`skill:${CAPABILITY_KEY}`]: 25 },
      rollout: { semanticSnapshotFingerprint },
      items: [item],
    },
    definitionVersions: [
      {
        id: 31,
        version: 3,
        lifecycleStatus: 'published',
        validationStatus: 'passed',
        fingerprint: DEFINITION_FINGERPRINT,
        sourceFingerprint: DEFINITION_SOURCE_FINGERPRINT,
        payload: actionPayload,
        definition: {
          id: 7,
          definitionKey: ACTION_KEY,
          name: '创建预约',
          kind: 'action',
          status: 'active',
          currentPublishedVersionId: 31,
        },
        projections: [projection],
      },
    ],
    gatewayDescriptors: {
      [GATEWAY_ACTION_KEY]: {
        key: GATEWAY_ACTION_KEY,
        version: 1,
        endpoint: 'reservations',
        method: 'POST',
        permission: 'core:store:reservations',
        riskLevel: 'medium',
        requiredFields: ['customerId', 'projectId', 'appointmentTime'],
        allowedFields: ['customerId', 'projectId', 'appointmentTime'],
        effectKeys: ['reservation_created_in_context_store'],
        transactionBoundary: 'ReservationsService.create',
        receiptType: 'reservation',
        failureRecovery: 'safe_replay',
      },
    },
    gatewaySourceChecksum: 'e'.repeat(64),
    predicateEffectManifest,
    predicateEffectManifestChecksum: sha256(stableStringify(predicateEffectManifest)),
    actionInvariantManifest,
    actionInvariantManifestChecksum: sha256(stableStringify(actionInvariantManifest)),
    actionRelationManifest: actionRelation.manifest,
    actionRelationManifestChecksum: actionRelation.sourceChecksum,
    requiredBindings: [
      {
        actionKey: ACTION_KEY,
        capabilityKey: CAPABILITY_KEY,
        gatewayActionKey: GATEWAY_ACTION_KEY,
      },
    ],
    now: new Date('2026-07-30T00:00:00.000Z'),
  };
}

function refreshLexicalFrameFingerprint(fixture) {
  const frame = fixture.definitionVersions[0].payload.lexicalFrame;
  const { fingerprint: _fingerprint, ...input } = frame;
  frame.fingerprint = sha256(stableStringify(input));
}

function situationContext(actionKey) {
  const value = {
    schemaVersion: '1.0',
    profileKey: `${actionKey}.situation_context`,
    tenantBoundary: 'current_store',
    requestChannelPolicy: 'bind_if_present',
    devicePolicy: 'bind_if_present',
    conversationPolicy: 'same_conversation',
    businessTimePolicy: {
      timezone: 'Asia/Shanghai',
      businessDatePolicy: 'same_business_date',
      clockSource: 'server',
    },
    actorPolicy: {
      subjectPolicy: 'same_authenticated_user',
      qualificationPolicy: 'revalidate_current_role_and_permission',
    },
  };
  return { ...value, fingerprint: sha256(stableStringify(value)) };
}

function modalityPolicy(actionKey) {
  const value = {
    schemaVersion: '1.0',
    policyKey: `${actionKey}.speech_act_modality`,
    supportedModalities: ['request'],
    unsupportedModalityPolicy: 'fail_closed',
    confirmationReferencePolicy: 'existing_confirmation_required',
    schedulePolicy: 'action_plan_required',
    cancellationReferencePolicy: 'existing_preview_or_plan_required',
  };
  return { ...value, fingerprint: sha256(stableStringify(value)) };
}

function informationArtifact(actionKey) {
  const value = {
    schemaVersion: '1.0',
    profileKey: `${actionKey}.information_artifact`,
    referencePolicy: 'bind_if_present',
    artifactTypePolicy: 'governed_result_reference',
    sourcePolicy: 'completed_brain_run_same_conversation_store_user',
    versionPolicy: 'source_run_and_capability_version',
    contentIntegrityPolicy: 'canonical_content_fingerprint',
    supersessionPolicy: 'explicit_new_reference_only',
  };
  return { ...value, fingerprint: sha256(stableStringify(value)) };
}

function institutionalEffectProfile(actionKey, preconditions) {
  const value = {
    schemaVersion: '1.0',
    profileKey: `${actionKey}.institutional_effect`,
    effectKind: 'reservation_cancellation',
    requiredPermission: 'core:store:reservations',
    empoweredRolePolicy: 'current_authenticated_role_with_permission',
    authorizationBasis: 'explicit_confirmation_and_current_permission',
    constitutionPolicy: {
      requiredPreconditionKeys: [...preconditions].sort(),
      requiredEffectKey: 'reservation_cancelled',
      requiredMutationKind: 'state_transition',
      requiredBusinessObjectType: 'reservation',
      requiredChangedFields: ['status'],
      requiredParticipantRoles: ['requester', 'authorizer', 'performer', 'accountable_party'],
    },
    formalStateTransition: {
      fromStatePolicy: 'non_terminal_reservation_state',
      toState: 'cancelled',
    },
    effectivenessPolicy: 'observed_state_transition_and_transactional_receipt',
    effectiveAtPolicy: 'mutation_receipt_committed_at',
    truthPolicy: 'observed_only',
    invalidityPolicy: 'fail_closed_with_reason',
  };
  return { ...value, fingerprint: sha256(stableStringify(value)) };
}

function sideEffectInvariant(actionKey, contracts) {
  const value = {
    schemaVersion: '1.2',
    profileKey: `${actionKey}.side_effect_invariant`,
    guardContractFingerprint: sha256(
      stableStringify({
        actionKey,
        preconditions: [...contracts.preconditions].sort(),
        predicateRefs: [...contracts.predicateRefs].sort((left, right) => left.key.localeCompare(right.key)),
      }),
    ),
    effectContractFingerprint: sha256(
      stableStringify({
        actionKey,
        effects: [...contracts.effects].sort(),
        effectRefs: [...contracts.effectRefs].sort((left, right) => left.key.localeCompare(right.key)),
      }),
    ),
    invariantContractRef: contracts.invariantContractRef,
    undeclaredSideEffectPolicy: 'forbid',
    gatewayEffectPolicy: 'exact_declared_effect_match',
    mutationFootprintEvidencePolicy: 'exact_database_trigger_observed_write_set',
    successEvidencePolicy: 'all_declared_effects_observed',
    partialSuccessPolicy: 'explicit_partially_succeeded',
    recoveryPolicy: 'gateway_declared_strategy_only',
    compensationPolicy: 'explicit_compensation_action_required',
    outcomeObservationPolicy: 'required_for_async_effects',
  };
  return { ...value, fingerprint: sha256(stableStringify(value)) };
}

function invariantRef(actionKey, fingerprint) {
  return { key: `${actionKey}.mutation_footprint`, version: 2, fingerprint };
}

function invariantManifestEntry(actionKey, fingerprint) {
  return { actionKey, ...invariantRef(actionKey, fingerprint) };
}

function participantProfile(actionKey) {
  const value = {
    schemaVersion: '1.0',
    profileKey: `${actionKey}.participant`,
    actorAliasPolicy: 'legacy_requester_only',
    unboundRolePolicy: 'fail_closed',
    roleBindings: [
      {
        role: 'accountable_party',
        source: 'confirmation_actor',
        requiredAt: ['execution'],
        qualificationPolicy: 'revalidate_current_role_and_permission',
        runtimeVisibility: 'validator_only',
      },
      {
        role: 'authorizer',
        source: 'confirmation_actor',
        requiredAt: ['execution'],
        qualificationPolicy: 'revalidate_current_role_and_permission',
        runtimeVisibility: 'execution_only',
      },
      {
        role: 'performer',
        source: 'gateway_executor',
        requiredAt: ['execution'],
        qualificationPolicy: 'released_gateway_binding',
        runtimeVisibility: 'execution_only',
      },
      {
        role: 'requester',
        source: 'authenticated_user',
        requiredAt: ['execution', 'preview', 'recognition'],
        qualificationPolicy: 'same_authenticated_user',
        runtimeVisibility: 'execution_only',
      },
    ],
  };
  return { ...value, fingerprint: sha256(stableStringify(value)) };
}

function relationProfile(actionKey, targetEntityRefs, participant, manifest) {
  const definitions = new Map(manifest.relations.map((relation) => [relation.key, relation]));
  const ref = (key, fromRef, toRef, participantRole) => {
    const definition = definitions.get(key);
    return {
      relationDefinitionRef: {
        key: definition.key,
        version: definition.version,
        fingerprint: definition.fingerprint,
      },
      fromRef,
      toRef,
      qualificationKeys: [...definition.requiredKeys].sort(),
      ...(participantRole ? { participantRole } : {}),
      truthStatusPolicy: definition.truthMode === 'declared' ? 'declared_only' : 'runtime_evaluator_required',
    };
  };
  const relationRefs = [
    ref('action_relation.occurrence_of', '$action_execution', actionKey),
    ...targetEntityRefs.flatMap((targetRef) => [
      ref('action_relation.acts_on', actionKey, targetRef),
      ref('action_relation.creates', actionKey, targetRef),
    ]),
    ...participant.roleBindings.map((binding) =>
      ref(
        {
          requester: 'action_relation.requested_by',
          authorizer: 'action_relation.authorized_by',
          performer: 'action_relation.performed_by',
          accountable_party: 'action_relation.accountable_party',
        }[binding.role],
        '$action_execution',
        `participant.${binding.role}`,
        binding.role,
      ),
    ),
  ].sort(
    (left, right) =>
      left.relationDefinitionRef.key.localeCompare(right.relationDefinitionRef.key) ||
      left.fromRef.localeCompare(right.fromRef) ||
      left.toRef.localeCompare(right.toRef),
  );
  const value = {
    schemaVersion: '1.0',
    profileKey: `${actionKey}.relations`,
    unknownRelationPolicy: 'fail_closed',
    inferencePolicy: 'explicit_only',
    relationRefs,
  };
  return { ...value, fingerprint: sha256(stableStringify(value)) };
}

function refreshSituationContextFingerprint(fixture) {
  const profile = fixture.definitionVersions[0].payload.situationContext;
  const input = { ...profile };
  delete input.fingerprint;
  profile.fingerprint = sha256(stableStringify(input));
}

function refreshProfileFingerprint(profile) {
  const input = { ...profile };
  delete input.fingerprint;
  profile.fingerprint = sha256(stableStringify(input));
}

function stableStringify(value) {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys(value[key])]),
  );
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
