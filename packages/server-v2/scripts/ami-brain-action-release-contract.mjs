import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export const AMI_BRAIN_ACTION_RELEASE_CONTRACT_SCHEMA = 'ami-brain-action-release-contract/v1';
export const AMI_BRAIN_ACTION_LEXICAL_FRAME_SCHEMA = '1.0';
export const AMI_BRAIN_ACTION_SITUATION_CONTEXT_SCHEMA = '1.0';
export const AMI_BRAIN_ACTION_MODALITY_POLICY_SCHEMA = '1.0';
export const AMI_BRAIN_ACTION_INFORMATION_ARTIFACT_SCHEMA = '1.0';
export const AMI_BRAIN_ACTION_SIDE_EFFECT_INVARIANT_SCHEMA = '1.2';
export const AMI_BRAIN_ACTION_PARTICIPANT_PROFILE_SCHEMA = '1.0';
export const AMI_BRAIN_ACTION_RELATION_PROFILE_SCHEMA = '1.0';
export const AMI_BRAIN_ACTION_INSTITUTIONAL_EFFECT_SCHEMA = '1.0';
export const AMI_BRAIN_ACTION_INSTITUTIONAL_EFFECT_CONTRACTS = Object.freeze({
  'action.cancel_reservation': Object.freeze({
    effectKind: 'reservation_cancellation',
    requiredPermission: 'core:store:reservations',
    requiredEffectKey: 'reservation_cancelled',
    requiredBusinessObjectType: 'reservation',
    fromStatePolicy: 'non_terminal_reservation_state',
    toState: 'cancelled',
  }),
  'action.submit_purchase_order_for_approval': Object.freeze({
    effectKind: 'purchase_order_submission_for_approval',
    requiredPermission: 'core:inventory:purchase',
    requiredEffectKey: 'purchase_order_submitted_for_approval',
    requiredBusinessObjectType: 'purchase_order',
    fromStatePolicy: 'purchase_order_draft',
    toState: 'pending_approval',
  }),
});
export const AMI_BRAIN_ACTION_GATEWAY_SOURCE =
  'packages/server-v2/src/brain/skills/brain-capability-gateway.service.ts';
export const AMI_BRAIN_ACTION_PREDICATE_EFFECT_MANIFEST_SCHEMA = 'ami-brain-action-predicate-effect-manifest/v1';
export const AMI_BRAIN_ACTION_PREDICATE_EFFECT_MANIFEST_SOURCE =
  'packages/server-v2/scripts/fixtures/ami-brain-action-predicate-effect-manifest-v1.json';
export const AMI_BRAIN_ACTION_PREDICATE_EFFECT_CATALOG_SOURCE =
  'packages/server-v2/src/semantic-data/brain-action-predicate-effect-catalog.ts';
export const AMI_BRAIN_ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE =
  'packages/server-v2/src/brain/domain/brain-action-predicate-effect-evaluator.service.ts';
export const AMI_BRAIN_ACTION_INVARIANT_MANIFEST_SCHEMA = 'ami-brain-action-invariant-manifest/v1';
export const AMI_BRAIN_ACTION_INVARIANT_MANIFEST_SOURCE =
  'packages/server-v2/scripts/fixtures/ami-brain-action-invariant-manifest-v1.json';
export const AMI_BRAIN_ACTION_INVARIANT_CATALOG_SOURCE =
  'packages/server-v2/src/semantic-data/brain-action-invariant-catalog.ts';
export const AMI_BRAIN_ACTION_RELATION_MANIFEST_SCHEMA = 'ami-brain-action-relation-manifest/v1';
export const AMI_BRAIN_ACTION_RELATION_MANIFEST_SOURCE =
  'packages/server-v2/scripts/fixtures/ami-brain-action-relation-manifest-v1.json';
export const AMI_BRAIN_ACTION_RELATION_CATALOG_SOURCE =
  'packages/server-v2/src/semantic-data/brain-action-relation-catalog.ts';

export const AMI_BRAIN_REQUIRED_ACTION_BINDINGS = Object.freeze([
  Object.freeze({
    actionKey: 'action.create_customer',
    capabilityKey: 'customer_create_preview',
    gatewayActionKey: 'create_customer',
  }),
  Object.freeze({
    actionKey: 'action.create_purchase_order',
    capabilityKey: 'purchase_order_draft',
    gatewayActionKey: 'create_purchase_order',
  }),
  Object.freeze({
    actionKey: 'action.submit_purchase_order_for_approval',
    capabilityKey: 'purchase_order_submit_for_approval_preview',
    gatewayActionKey: 'submit_purchase_order_for_approval',
  }),
  Object.freeze({
    actionKey: 'action.create_reservation',
    capabilityKey: 'reservation_action_preview',
    gatewayActionKey: 'create_reservation',
  }),
  Object.freeze({
    actionKey: 'action.reschedule_reservation',
    capabilityKey: 'reservation_action_preview',
    gatewayActionKey: 'reschedule_reservation',
  }),
  Object.freeze({
    actionKey: 'action.cancel_reservation',
    capabilityKey: 'reservation_action_preview',
    gatewayActionKey: 'cancel_reservation',
  }),
]);

export const AMI_BRAIN_ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM = sha256(
  stableStringify({
    schemaVersion: AMI_BRAIN_ACTION_RELEASE_CONTRACT_SCHEMA,
    gatewaySourcePath: AMI_BRAIN_ACTION_GATEWAY_SOURCE,
    predicateEffectManifestSourcePath: AMI_BRAIN_ACTION_PREDICATE_EFFECT_MANIFEST_SOURCE,
    actionInvariantManifestSourcePath: AMI_BRAIN_ACTION_INVARIANT_MANIFEST_SOURCE,
    actionRelationManifestSourcePath: AMI_BRAIN_ACTION_RELATION_MANIFEST_SOURCE,
    lexicalFrameSchemaVersion: AMI_BRAIN_ACTION_LEXICAL_FRAME_SCHEMA,
    situationContextSchemaVersion: AMI_BRAIN_ACTION_SITUATION_CONTEXT_SCHEMA,
    modalityPolicySchemaVersion: AMI_BRAIN_ACTION_MODALITY_POLICY_SCHEMA,
    informationArtifactSchemaVersion: AMI_BRAIN_ACTION_INFORMATION_ARTIFACT_SCHEMA,
    sideEffectInvariantSchemaVersion: AMI_BRAIN_ACTION_SIDE_EFFECT_INVARIANT_SCHEMA,
    participantProfileSchemaVersion: AMI_BRAIN_ACTION_PARTICIPANT_PROFILE_SCHEMA,
    relationProfileSchemaVersion: AMI_BRAIN_ACTION_RELATION_PROFILE_SCHEMA,
    institutionalEffectSchemaVersion: AMI_BRAIN_ACTION_INSTITUTIONAL_EFFECT_SCHEMA,
    institutionalEffectContracts: AMI_BRAIN_ACTION_INSTITUTIONAL_EFFECT_CONTRACTS,
    requiredBindings: AMI_BRAIN_REQUIRED_ACTION_BINDINGS,
  }),
);

export async function inspectAmiBrainActionReleaseContract({
  prisma,
  releaseId,
  repoRoot,
  headCommit,
  now = new Date(),
}) {
  try {
    const release = await prisma.brainRelease.findUnique({
      where: { id: releaseId },
      include: {
        items: {
          include: {
            resourceVersion: {
              select: {
                id: true,
                resourceType: true,
                resourceKey: true,
                version: true,
                status: true,
                snapshot: true,
                checksum: true,
              },
            },
          },
          orderBy: [{ resourceType: 'asc' }, { resourceKey: 'asc' }],
        },
      },
    });
    const definitionVersionIds = release ? collectActionDefinitionRefs(release.items).map((ref) => ref.versionId) : [];
    const definitionVersions = definitionVersionIds.length
      ? await prisma.businessDefinitionVersion.findMany({
          where: { id: { in: [...new Set(definitionVersionIds)] } },
          select: {
            id: true,
            version: true,
            lifecycleStatus: true,
            validationStatus: true,
            fingerprint: true,
            sourceFingerprint: true,
            payload: true,
            definition: {
              select: {
                id: true,
                definitionKey: true,
                name: true,
                kind: true,
                status: true,
                currentPublishedVersionId: true,
              },
            },
            projections: {
              where: { targetType: 'intent_semantic_index' },
              select: {
                definitionVersionId: true,
                targetType: true,
                targetKey: true,
                definitionKey: true,
                definitionVersion: true,
                definitionFingerprint: true,
                sourceFingerprint: true,
                payload: true,
                projectionFingerprint: true,
                readOnly: true,
              },
              orderBy: { id: 'asc' },
            },
          },
        })
      : [];
    const gateway = readAmiBrainGatewayDescriptors(repoRoot);
    const predicateEffectManifest = readAmiBrainActionPredicateEffectManifest(repoRoot);
    const actionInvariantManifest = readAmiBrainActionInvariantManifest(repoRoot);
    const actionRelationManifest = readAmiBrainActionRelationManifest(repoRoot);
    return buildAmiBrainActionReleaseContract({
      expectedReleaseId: releaseId,
      headCommit,
      release,
      definitionVersions,
      gatewayDescriptors: gateway.descriptors,
      gatewaySourceChecksum: gateway.sourceChecksum,
      predicateEffectManifest: predicateEffectManifest.manifest,
      predicateEffectManifestChecksum: predicateEffectManifest.sourceChecksum,
      actionInvariantManifest: actionInvariantManifest.manifest,
      actionInvariantManifestChecksum: actionInvariantManifest.sourceChecksum,
      actionRelationManifest: actionRelationManifest.manifest,
      actionRelationManifestChecksum: actionRelationManifest.sourceChecksum,
      now,
    });
  } catch (error) {
    return unavailableContract({
      expectedReleaseId: releaseId,
      headCommit,
      error: sanitizeError(error),
      now,
    });
  }
}

export function buildAmiBrainActionReleaseContract({
  expectedReleaseId,
  headCommit,
  release,
  definitionVersions = [],
  gatewayDescriptors = {},
  gatewaySourceChecksum = null,
  predicateEffectManifest = {},
  predicateEffectManifestChecksum = null,
  actionInvariantManifest = {},
  actionInvariantManifestChecksum = null,
  actionRelationManifest = {},
  actionRelationManifestChecksum = null,
  requiredBindings = AMI_BRAIN_REQUIRED_ACTION_BINDINGS,
  now = new Date(),
}) {
  const blockingReasons = [];
  const candidateCommit = normalizeCommit(headCommit);
  const normalizedReleaseId = positiveInteger(release?.id);
  const items = Array.isArray(release?.items) ? release.items : [];
  const releaseFingerprint = items.length ? createReleaseFingerprint(items) : null;
  const normalizedPredicateEffectManifest = normalizePredicateEffectManifest(predicateEffectManifest);
  const actualPredicateEffectManifestChecksum = validPredicateEffectManifest(normalizedPredicateEffectManifest)
    ? sha256(stableStringify(normalizedPredicateEffectManifest))
    : null;
  const normalizedActionInvariantManifest = normalizeActionInvariantManifest(actionInvariantManifest);
  const actualActionInvariantManifestChecksum = validActionInvariantManifest(normalizedActionInvariantManifest)
    ? sha256(stableStringify(normalizedActionInvariantManifest))
    : null;
  const normalizedActionRelationManifest = normalizeActionRelationManifest(actionRelationManifest);
  const actualActionRelationManifestChecksum = validActionRelationManifest(normalizedActionRelationManifest)
    ? sha256(stableStringify(normalizedActionRelationManifest))
    : null;
  const rollout = record(release?.rollout);
  const evaluationOnly = rollout.evaluationOnly === true;
  const declaredSemanticSnapshotFingerprint = normalizedHex(rollout.semanticSnapshotFingerprint);
  const actualSemanticSnapshotFingerprint = items.length ? createSemanticSnapshotFingerprint(items) : null;
  const versionMapMatches = release ? validateReleaseVersionMap(release.versionMap, items) : false;
  const releaseItemsConsistent = items.length > 0 && items.every(validReleaseItem);
  const definitionsById = new Map(
    definitionVersions
      .filter((version) => positiveInteger(version?.id))
      .map((version) => [Number(version.id), version]),
  );

  if (!release) blockingReasons.push('action_release_missing');
  if (release && normalizedReleaseId !== positiveInteger(expectedReleaseId)) {
    blockingReasons.push('action_release_id_mismatch');
  }
  if (!items.length) blockingReasons.push('action_release_items_missing');
  if (items.length && !releaseItemsConsistent) blockingReasons.push('action_release_item_identity_mismatch');
  if (release && !versionMapMatches) blockingReasons.push('action_release_version_map_mismatch');
  if (!declaredSemanticSnapshotFingerprint) {
    blockingReasons.push('action_release_semantic_snapshot_fingerprint_missing');
  } else if (declaredSemanticSnapshotFingerprint !== actualSemanticSnapshotFingerprint) {
    blockingReasons.push('action_release_semantic_snapshot_fingerprint_mismatch');
  }
  if (!normalizedHex(releaseFingerprint)) blockingReasons.push('action_release_fingerprint_invalid');
  if (!normalizedHex(gatewaySourceChecksum)) blockingReasons.push('action_gateway_source_checksum_invalid');
  if (!validPredicateEffectManifest(normalizedPredicateEffectManifest)) {
    blockingReasons.push('action_predicate_effect_manifest_invalid');
  }
  if (!normalizedHex(predicateEffectManifestChecksum)) {
    blockingReasons.push('action_predicate_effect_manifest_checksum_invalid');
  } else if (normalizedHex(predicateEffectManifestChecksum) !== actualPredicateEffectManifestChecksum) {
    blockingReasons.push('action_predicate_effect_manifest_checksum_mismatch');
  }
  if (!validActionInvariantManifest(normalizedActionInvariantManifest)) {
    blockingReasons.push('action_invariant_manifest_invalid');
  }
  if (!normalizedHex(actionInvariantManifestChecksum)) {
    blockingReasons.push('action_invariant_manifest_checksum_invalid');
  } else if (normalizedHex(actionInvariantManifestChecksum) !== actualActionInvariantManifestChecksum) {
    blockingReasons.push('action_invariant_manifest_checksum_mismatch');
  }
  if (!validActionRelationManifest(normalizedActionRelationManifest)) {
    blockingReasons.push('action_relation_manifest_invalid');
  }
  if (!normalizedHex(actionRelationManifestChecksum)) {
    blockingReasons.push('action_relation_manifest_checksum_invalid');
  } else if (normalizedHex(actionRelationManifestChecksum) !== actualActionRelationManifestChecksum) {
    blockingReasons.push('action_relation_manifest_checksum_mismatch');
  }

  const actionResults = requiredBindings.map((requirement) =>
    validateRequiredAction({
      requirement,
      items,
      definitionsById,
      gatewayDescriptors,
      predicateEffectManifest: normalizedPredicateEffectManifest,
      actionInvariantManifest: normalizedActionInvariantManifest,
      actionRelationManifest: normalizedActionRelationManifest,
      evaluationOnly,
    }),
  );
  for (const action of actionResults) blockingReasons.push(...action.blockingReasons);

  const descriptorChecksum = sha256(stableStringify(normalizeGatewayDescriptorMap(gatewayDescriptors)));
  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  const contractFingerprint = sha256(
    stableStringify({
      candidateCommit,
      releaseId: normalizedReleaseId,
      releaseFingerprint,
      semanticSnapshotFingerprint: actualSemanticSnapshotFingerprint,
      gatewaySourceChecksum: normalizedHex(gatewaySourceChecksum),
      gatewayDescriptorChecksum: descriptorChecksum,
      predicateEffectManifestChecksum: normalizedHex(predicateEffectManifestChecksum),
      actionInvariantManifestChecksum: normalizedHex(actionInvariantManifestChecksum),
      actionRelationManifestChecksum: normalizedHex(actionRelationManifestChecksum),
      actions: actionResults.map((action) => ({
        actionKey: action.actionKey,
        capabilityKey: action.capabilityKey,
        capabilityVersion: action.capabilityVersion,
        capabilitySourceFingerprint: action.capabilitySourceFingerprint,
        definitionVersionId: action.definitionVersionId,
        definitionVersion: action.definitionVersion,
        definitionFingerprint: action.definitionFingerprint,
        definitionSourceFingerprint: action.definitionSourceFingerprint,
        bindingFingerprint: action.bindingFingerprint,
        predicateContractFingerprint: action.predicateContractFingerprint,
        effectContractFingerprint: action.effectContractFingerprint,
        lexicalFrameFingerprint: action.lexicalFrameFingerprint,
        situationContextFingerprint: action.situationContextFingerprint,
        modalityPolicyFingerprint: action.modalityPolicyFingerprint,
        informationArtifactFingerprint: action.informationArtifactFingerprint,
        sideEffectInvariantFingerprint: action.sideEffectInvariantFingerprint,
        actionInvariantContractFingerprint: action.actionInvariantContractFingerprint,
        participantProfileFingerprint: action.participantProfileFingerprint,
        relationProfileFingerprint: action.relationProfileFingerprint,
        institutionalEffectFingerprint: action.institutionalEffectFingerprint,
        gatewayActionKey: action.gatewayActionKey,
        gatewayVersion: action.gatewayVersion,
      })),
    }),
  );

  return {
    schemaVersion: AMI_BRAIN_ACTION_RELEASE_CONTRACT_SCHEMA,
    identityChecksum: AMI_BRAIN_ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
    checked: true,
    passed: uniqueBlockingReasons.length === 0,
    candidate: { headCommit: candidateCommit },
    release: {
      expectedId: positiveInteger(expectedReleaseId),
      id: normalizedReleaseId,
      releaseKey: optionalString(release?.releaseKey),
      status: optionalString(release?.status),
      itemCount: items.length,
      fingerprint: normalizedHex(releaseFingerprint),
      versionMapMatches,
      itemIdentityMatches: releaseItemsConsistent,
      semanticSnapshotFingerprint: actualSemanticSnapshotFingerprint,
      declaredSemanticSnapshotFingerprint,
      semanticSnapshotMatches:
        Boolean(declaredSemanticSnapshotFingerprint) &&
        declaredSemanticSnapshotFingerprint === actualSemanticSnapshotFingerprint,
    },
    gateway: {
      sourcePath: AMI_BRAIN_ACTION_GATEWAY_SOURCE,
      sourceChecksum: normalizedHex(gatewaySourceChecksum),
      descriptorChecksum,
      descriptorCount: Object.keys(gatewayDescriptors).length,
    },
    predicateEffectManifest: {
      sourcePath: AMI_BRAIN_ACTION_PREDICATE_EFFECT_MANIFEST_SOURCE,
      sourceChecksum: normalizedHex(predicateEffectManifestChecksum),
      schemaVersion: optionalString(normalizedPredicateEffectManifest.schemaVersion),
      catalogSchemaVersion: optionalString(normalizedPredicateEffectManifest.catalogSchemaVersion),
      catalogSource: normalizedPredicateEffectManifest.catalogSource,
      evaluatorSource: normalizedPredicateEffectManifest.evaluatorSource,
      predicateCount: normalizedPredicateEffectManifest.predicates.length,
      effectCount: normalizedPredicateEffectManifest.effects.length,
    },
    actionInvariantManifest: {
      sourcePath: AMI_BRAIN_ACTION_INVARIANT_MANIFEST_SOURCE,
      sourceChecksum: normalizedHex(actionInvariantManifestChecksum),
      schemaVersion: optionalString(normalizedActionInvariantManifest.schemaVersion),
      catalogSchemaVersion: optionalString(normalizedActionInvariantManifest.catalogSchemaVersion),
      catalogSource: normalizedActionInvariantManifest.catalogSource,
      contractCount: normalizedActionInvariantManifest.contracts.length,
    },
    actionRelationManifest: {
      sourcePath: AMI_BRAIN_ACTION_RELATION_MANIFEST_SOURCE,
      sourceChecksum: normalizedHex(actionRelationManifestChecksum),
      schemaVersion: optionalString(normalizedActionRelationManifest.schemaVersion),
      catalogSchemaVersion: optionalString(normalizedActionRelationManifest.catalogSchemaVersion),
      catalogSource: normalizedActionRelationManifest.catalogSource,
      relationCount: normalizedActionRelationManifest.relations.length,
    },
    actions: actionResults,
    summary: {
      requiredActionCount: requiredBindings.length,
      passedActionCount: actionResults.filter((action) => action.passed).length,
      failedActionCount: actionResults.filter((action) => !action.passed).length,
      failedActionKeys: actionResults.filter((action) => !action.passed).map((action) => action.actionKey),
    },
    contractFingerprint,
    blockingReasons: uniqueBlockingReasons,
    error: null,
    checkedAt: now.toISOString(),
  };
}

export function readAmiBrainGatewayDescriptors(repoRoot) {
  const sourcePath = resolve(repoRoot, AMI_BRAIN_ACTION_GATEWAY_SOURCE);
  const source = readFileSync(sourcePath, 'utf8');
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let initializer = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name?.getText(sourceFile) === 'CAPABILITY_MAP') {
      initializer = unwrapExpression(ts, node.initializer);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    throw new Error('action_gateway_capability_map_missing');
  }
  const descriptors = literalValue(ts, sourceFile, initializer);
  if (!descriptors || typeof descriptors !== 'object' || Array.isArray(descriptors)) {
    throw new Error('action_gateway_capability_map_invalid');
  }
  return {
    descriptors,
    sourceChecksum: sha256(source),
  };
}

export function readAmiBrainActionPredicateEffectManifest(repoRoot) {
  const sourcePath = resolve(repoRoot, AMI_BRAIN_ACTION_PREDICATE_EFFECT_MANIFEST_SOURCE);
  const source = readFileSync(sourcePath, 'utf8');
  const manifest = JSON.parse(source);
  const normalized = normalizePredicateEffectManifest(manifest);
  for (const governedSource of [normalized.catalogSource, normalized.evaluatorSource]) {
    const actualChecksum = sha256(readFileSync(resolve(repoRoot, governedSource.path), 'utf8'));
    if (actualChecksum !== governedSource.checksum) {
      throw new Error(`action_predicate_effect_source_checksum_mismatch:${governedSource.path}`);
    }
  }
  return {
    manifest,
    sourceChecksum: sha256(stableStringify(normalized)),
  };
}

export function readAmiBrainActionInvariantManifest(repoRoot) {
  const sourcePath = resolve(repoRoot, AMI_BRAIN_ACTION_INVARIANT_MANIFEST_SOURCE);
  const source = readFileSync(sourcePath, 'utf8');
  const manifest = JSON.parse(source);
  const normalized = normalizeActionInvariantManifest(manifest);
  const actualChecksum = sha256(readFileSync(resolve(repoRoot, normalized.catalogSource.path), 'utf8'));
  if (actualChecksum !== normalized.catalogSource.checksum) {
    throw new Error(`action_invariant_source_checksum_mismatch:${normalized.catalogSource.path}`);
  }
  return { manifest, sourceChecksum: sha256(stableStringify(normalized)) };
}

export function readAmiBrainActionRelationManifest(repoRoot) {
  const sourcePath = resolve(repoRoot, AMI_BRAIN_ACTION_RELATION_MANIFEST_SOURCE);
  const source = readFileSync(sourcePath, 'utf8');
  const manifest = JSON.parse(source);
  const normalized = normalizeActionRelationManifest(manifest);
  const actualChecksum = sha256(readFileSync(resolve(repoRoot, normalized.catalogSource.path), 'utf8'));
  if (actualChecksum !== normalized.catalogSource.checksum) {
    throw new Error(`action_relation_source_checksum_mismatch:${normalized.catalogSource.path}`);
  }
  return { manifest, sourceChecksum: sha256(stableStringify(normalized)) };
}

function validateRequiredAction({
  requirement,
  items,
  definitionsById,
  gatewayDescriptors,
  predicateEffectManifest,
  actionInvariantManifest,
  actionRelationManifest,
  evaluationOnly,
}) {
  const blockingReasons = [];
  const capabilityItem = items.find(
    (item) => item?.resourceType === 'skill' && item?.resourceKey === requirement.capabilityKey,
  );
  const capabilitySnapshot = record(capabilityItem?.resourceVersion?.snapshot ?? capabilityItem?.snapshot);
  const actionRef = normalizeDefinitionRefs(capabilitySnapshot.definitionRefs).find(
    (ref) => ref.definitionKey === requirement.actionKey,
  );
  const definitionVersion = actionRef ? definitionsById.get(actionRef.versionId) : null;
  const actionPayload = record(definitionVersion?.payload);
  const bindings = normalizeActionBindings(actionPayload.capabilityBindings);
  const matchingBindings = bindings.filter(
    (binding) => binding.enabled && binding.capabilityKey === requirement.capabilityKey,
  );
  const binding = matchingBindings.find((item) => item.gatewayActionKey === requirement.gatewayActionKey) ?? null;
  const gatewayDescriptor = record(gatewayDescriptors[requirement.gatewayActionKey]);
  const capabilityVersion = positiveInteger(capabilitySnapshot.version);
  const capabilitySourceFingerprint = normalizedHex(capabilitySnapshot.sourceFingerprint);
  const definitionFingerprint = normalizedHex(actionRef?.definitionFingerprint);
  const definitionSourceFingerprint = normalizedHex(actionRef?.sourceFingerprint);
  const bindingFingerprint = actionRef
    ? sha256(stableStringify({ actionKey: requirement.actionKey, capabilityBindings: bindings }))
    : null;
  const predicateRefs = normalizeSemanticContractRefs(actionPayload.preconditionPredicateRefs);
  const effectRefs = normalizeSemanticContractRefs(actionPayload.effectAssertionRefs);
  const predicateContractFingerprint = sha256(
    stableStringify({ actionKey: requirement.actionKey, preconditions: actionPayload.preconditions, predicateRefs }),
  );
  const effectContractFingerprint = sha256(
    stableStringify({ actionKey: requirement.actionKey, effects: actionPayload.effects, effectRefs }),
  );
  const lexicalFrameFingerprint = validActionLexicalFrame(
    actionPayload,
    requirement.actionKey,
    optionalString(definitionVersion?.definition?.name),
  )
    ? normalizedHex(record(actionPayload.lexicalFrame).fingerprint)
    : null;
  const situationContextFingerprint = validActionSituationContext(actionPayload, requirement.actionKey)
    ? normalizedHex(record(actionPayload.situationContext).fingerprint)
    : null;
  const modalityPolicyFingerprint = validActionModalityPolicy(actionPayload, requirement.actionKey)
    ? normalizedHex(record(actionPayload.modalityPolicy).fingerprint)
    : null;
  const informationArtifactFingerprint = validActionInformationArtifact(actionPayload, requirement.actionKey)
    ? normalizedHex(record(actionPayload.informationArtifact).fingerprint)
    : null;
  const sideEffectInvariantFingerprint = validActionSideEffectInvariant(actionPayload, requirement.actionKey)
    ? normalizedHex(record(actionPayload.sideEffectInvariant).fingerprint)
    : null;
  const actionInvariantContractFingerprint = normalizedHex(
    record(record(actionPayload.sideEffectInvariant).invariantContractRef).fingerprint,
  );
  const participantProfileFingerprint = validActionParticipantProfile(actionPayload, requirement.actionKey)
    ? normalizedHex(record(actionPayload.participantProfile).fingerprint)
    : null;
  const relationProfileFingerprint = validActionRelationProfile(
    actionPayload,
    requirement.actionKey,
    actionRelationManifest,
  )
    ? normalizedHex(record(actionPayload.relationProfile).fingerprint)
    : null;
  const institutionalEffectValid = validActionInstitutionalEffect(actionPayload, requirement.actionKey);
  const institutionalEffectFingerprint = institutionalEffectValid
    ? normalizedHex(record(actionPayload.institutionalEffect).fingerprint)
    : null;

  if (!capabilityItem) blockingReasons.push(`required_action_capability_missing:${requirement.capabilityKey}`);
  if (capabilityItem && !validReleaseItem(capabilityItem)) {
    blockingReasons.push(`required_action_capability_item_invalid:${requirement.capabilityKey}`);
  }
  if (capabilityItem && !validCapabilitySnapshot(capabilitySnapshot, capabilityItem, requirement.capabilityKey)) {
    blockingReasons.push(`required_action_capability_contract_invalid:${requirement.capabilityKey}`);
  }
  if (!actionRef) blockingReasons.push(`required_action_definition_ref_missing:${requirement.actionKey}`);
  if (actionRef && !definitionVersion) {
    blockingReasons.push(`required_action_definition_version_missing:${requirement.actionKey}`);
  }
  if (
    definitionVersion &&
    !validDefinitionIdentity(definitionVersion, actionRef, requirement.actionKey, evaluationOnly)
  ) {
    blockingReasons.push(`required_action_definition_identity_mismatch:${requirement.actionKey}`);
  }
  if (definitionVersion && !validEvaluationDefinition(definitionVersion, evaluationOnly)) {
    blockingReasons.push(`required_action_definition_not_validated:${requirement.actionKey}`);
  }
  if (definitionVersion && !validActionProjection(definitionVersion)) {
    blockingReasons.push(`required_action_projection_invalid:${requirement.actionKey}`);
  }
  if (
    definitionVersion &&
    !validPredicateEffectContracts(actionPayload, predicateRefs, effectRefs, predicateEffectManifest)
  ) {
    blockingReasons.push(`required_action_predicate_effect_contract_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && !lexicalFrameFingerprint) {
    blockingReasons.push(`required_action_lexical_frame_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && !situationContextFingerprint) {
    blockingReasons.push(`required_action_situation_context_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && !modalityPolicyFingerprint) {
    blockingReasons.push(`required_action_modality_policy_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && !informationArtifactFingerprint) {
    blockingReasons.push(`required_action_information_artifact_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && !sideEffectInvariantFingerprint) {
    blockingReasons.push(`required_action_side_effect_invariant_invalid:${requirement.actionKey}`);
  }
  if (
    definitionVersion &&
    !validActionInvariantContractRef(actionPayload, requirement.actionKey, actionInvariantManifest)
  ) {
    blockingReasons.push(`required_action_invariant_contract_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && !participantProfileFingerprint) {
    blockingReasons.push(`required_action_participant_profile_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && !relationProfileFingerprint) {
    blockingReasons.push(`required_action_relation_profile_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && !institutionalEffectValid) {
    blockingReasons.push(`required_action_institutional_effect_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && actionPayload.actionKey !== requirement.actionKey) {
    blockingReasons.push(`required_action_payload_key_mismatch:${requirement.actionKey}`);
  }
  if (definitionVersion && matchingBindings.length !== 1) {
    blockingReasons.push(`required_action_binding_cardinality_invalid:${requirement.actionKey}`);
  }
  if (definitionVersion && !binding) {
    blockingReasons.push(`required_action_binding_gateway_mismatch:${requirement.actionKey}`);
  }
  if (
    definitionVersion &&
    (actionPayload.confirmationPolicy === 'none' || actionPayload.idempotencyPolicy !== 'required')
  ) {
    blockingReasons.push(`required_action_safety_policy_invalid:${requirement.actionKey}`);
  }
  if (!Object.keys(gatewayDescriptor).length) {
    blockingReasons.push(`required_action_gateway_descriptor_missing:${requirement.gatewayActionKey}`);
  } else if (
    capabilityItem &&
    definitionVersion &&
    binding &&
    !validGatewayContract(gatewayDescriptor, requirement, actionPayload, capabilitySnapshot)
  ) {
    blockingReasons.push(`required_action_gateway_contract_mismatch:${requirement.actionKey}`);
  }

  return {
    actionKey: requirement.actionKey,
    capabilityKey: requirement.capabilityKey,
    gatewayActionKey: requirement.gatewayActionKey,
    passed: blockingReasons.length === 0,
    capabilityVersion,
    capabilitySourceFingerprint,
    definitionVersionId: positiveInteger(actionRef?.versionId),
    definitionVersion: positiveInteger(actionRef?.version),
    definitionFingerprint,
    definitionSourceFingerprint,
    bindingFingerprint: normalizedHex(bindingFingerprint),
    predicateContractFingerprint: normalizedHex(predicateContractFingerprint),
    effectContractFingerprint: normalizedHex(effectContractFingerprint),
    lexicalFrameFingerprint,
    situationContextFingerprint,
    modalityPolicyFingerprint,
    informationArtifactFingerprint,
    sideEffectInvariantFingerprint,
    actionInvariantContractFingerprint,
    participantProfileFingerprint,
    relationProfileFingerprint,
    institutionalEffectFingerprint,
    gatewayVersion: positiveInteger(gatewayDescriptor.version),
    gatewayPermission: optionalString(gatewayDescriptor.permission),
    gatewayRiskLevel: optionalString(gatewayDescriptor.riskLevel),
    blockingReasons,
  };
}

function validActionModalityPolicy(actionPayload, actionKey) {
  const policy = record(actionPayload.modalityPolicy);
  const fingerprint = normalizedHex(policy.fingerprint);
  const fingerprintInput = { ...policy };
  delete fingerprintInput.fingerprint;
  return Boolean(
    hasOnlyKeys(policy, [
      'schemaVersion',
      'policyKey',
      'supportedModalities',
      'unsupportedModalityPolicy',
      'confirmationReferencePolicy',
      'schedulePolicy',
      'cancellationReferencePolicy',
      'fingerprint',
    ]) &&
    policy.schemaVersion === AMI_BRAIN_ACTION_MODALITY_POLICY_SCHEMA &&
    policy.policyKey === `${actionKey}.speech_act_modality` &&
    stableStringify(stringArray(policy.supportedModalities)) === stableStringify(['request']) &&
    policy.unsupportedModalityPolicy === 'fail_closed' &&
    policy.confirmationReferencePolicy === 'existing_confirmation_required' &&
    policy.schedulePolicy === 'action_plan_required' &&
    policy.cancellationReferencePolicy === 'existing_preview_or_plan_required' &&
    fingerprint &&
    fingerprint === sha256(stableStringify(fingerprintInput)),
  );
}

function validActionParticipantProfile(actionPayload, actionKey) {
  const profile = record(actionPayload.participantProfile);
  const bindings = Array.isArray(profile.roleBindings) ? profile.roleBindings.map(record) : [];
  const slots = Array.isArray(actionPayload.inputSlots) ? actionPayload.inputSlots.map(record) : [];
  const slotsByKey = new Map(slots.map((slot) => [optionalString(slot.slotKey), optionalString(slot.semanticRole)]));
  const roles = new Set([
    'requester',
    'authorizer',
    'approver',
    'performer',
    'assignee',
    'service_provider',
    'beneficiary',
    'counterparty',
    'accountable_party',
  ]);
  const sources = new Set([
    'authenticated_user',
    'confirmation_actor',
    'gateway_executor',
    'action_slot',
    'workflow_assignment',
  ]);
  const qualificationPolicies = new Set([
    'same_authenticated_user',
    'revalidate_current_role_and_permission',
    'released_gateway_binding',
    'resolved_same_store_business_subject',
    'explicit_workflow_assignment',
  ]);
  const runtimeVisibilities = new Set(['model_visible', 'validator_only', 'execution_only']);
  const seen = new Set();
  let validBindings = bindings.length > 0;
  for (const binding of bindings) {
    const role = optionalString(binding.role);
    const source = optionalString(binding.source);
    const slotKey = optionalString(binding.slotKey);
    const bindingKey = `${role}:${slotKey ?? source}`;
    if (
      !hasOnlyKeys(binding, ['role', 'source', 'slotKey', 'requiredAt', 'qualificationPolicy', 'runtimeVisibility']) ||
      !roles.has(role) ||
      !sources.has(source) ||
      !validParticipantBindingSource(role, source) ||
      !qualificationPolicies.has(optionalString(binding.qualificationPolicy)) ||
      !runtimeVisibilities.has(optionalString(binding.runtimeVisibility)) ||
      stringArray(binding.requiredAt).some((stage) => !['recognition', 'preview', 'execution'].includes(stage)) ||
      seen.has(bindingKey) ||
      (source === 'action_slot' && (!slotKey || slotsByKey.get(slotKey) !== role)) ||
      (source !== 'action_slot' && Boolean(slotKey))
    ) {
      validBindings = false;
    }
    seen.add(bindingKey);
  }
  const fingerprint = normalizedHex(profile.fingerprint);
  const fingerprintInput = { ...profile };
  delete fingerprintInput.fingerprint;
  return Boolean(
    hasOnlyKeys(profile, [
      'schemaVersion',
      'profileKey',
      'actorAliasPolicy',
      'unboundRolePolicy',
      'roleBindings',
      'fingerprint',
    ]) &&
    profile.schemaVersion === AMI_BRAIN_ACTION_PARTICIPANT_PROFILE_SCHEMA &&
    profile.profileKey === `${actionKey}.participant` &&
    profile.actorAliasPolicy === 'legacy_requester_only' &&
    profile.unboundRolePolicy === 'fail_closed' &&
    ['requester', 'authorizer', 'performer', 'accountable_party'].every((role) =>
      bindings.some((binding) => binding.role === role),
    ) &&
    validBindings &&
    fingerprint &&
    fingerprint === sha256(stableStringify(fingerprintInput)),
  );
}

function validParticipantBindingSource(role, source) {
  const fixedSources = {
    requester: 'authenticated_user',
    authorizer: 'confirmation_actor',
    performer: 'gateway_executor',
    accountable_party: 'confirmation_actor',
  };
  return fixedSources[role]
    ? fixedSources[role] === source
    : source === 'action_slot' || source === 'workflow_assignment';
}

function validActionRelationProfile(actionPayload, actionKey, manifest) {
  const profile = record(actionPayload.relationProfile);
  const relationRefs = Array.isArray(profile.relationRefs) ? profile.relationRefs.map(record) : [];
  const relationsByKey = new Map(manifest.relations.map((relation) => [relation.key, relation]));
  const participantProfile = record(actionPayload.participantProfile);
  const participantBindings = Array.isArray(participantProfile.roleBindings)
    ? participantProfile.roleBindings.map(record)
    : [];
  const participantRoles = new Set(participantBindings.map((binding) => optionalString(binding.role)));
  const targetEntityRefs = stringArray(actionPayload.targetEntityRefs);
  const seen = new Set();
  let validRefs = relationRefs.length > 0;
  for (const relation of relationRefs) {
    const [definitionRef] = normalizeSemanticContractRefs([relation.relationDefinitionRef]);
    const definition = definitionRef ? relationsByKey.get(definitionRef.key) : null;
    const fromRef = optionalString(relation.fromRef);
    const toRef = optionalString(relation.toRef);
    const slotKey = optionalString(relation.slotKey);
    const participantRole = optionalString(relation.participantRole);
    const key = `${definitionRef?.key}:${fromRef}:${toRef}:${slotKey}`;
    const expectedTruthStatusPolicy =
      definition?.truthMode === 'declared' ? 'declared_only' : 'runtime_evaluator_required';
    if (
      !hasOnlyKeys(relation, [
        'relationDefinitionRef',
        'fromRef',
        'toRef',
        'qualificationKeys',
        'slotKey',
        'participantRole',
        'truthStatusPolicy',
      ]) ||
      !definitionRef ||
      !definition ||
      !sameSemanticContractRef(definitionRef, definition) ||
      !fromRef ||
      !toRef ||
      seen.has(key) ||
      stableStringify(stringArray(relation.qualificationKeys).sort()) !==
        stableStringify([...definition.requiredKeys].sort()) ||
      relation.truthStatusPolicy !== expectedTruthStatusPolicy ||
      (participantRole && !participantRoles.has(participantRole)) ||
      (slotKey &&
        !participantBindings.some(
          (binding) => binding.role === participantRole && optionalString(binding.slotKey) === slotKey,
        )) ||
      (['action_relation.acts_on', 'action_relation.creates'].includes(definition.key) &&
        (fromRef !== actionKey || !targetEntityRefs.includes(toRef))) ||
      (definition.key === 'action_relation.state_transition' &&
        (fromRef !== '$action_execution' || !targetEntityRefs.includes(toRef)))
    ) {
      validRefs = false;
    }
    seen.add(key);
  }
  const actionClass = optionalString(actionPayload.actionClass);
  const relationKeys = relationRefs.map((relation) => optionalString(record(relation.relationDefinitionRef).key));
  const institutionalEffectRelations = relationRefs.filter(
    (relation) => record(relation.relationDefinitionRef).key === 'action_relation.institutional_effect',
  );
  const requiresInstitutionalEffect = Boolean(AMI_BRAIN_ACTION_INSTITUTIONAL_EFFECT_CONTRACTS[actionKey]);
  const fingerprint = normalizedHex(profile.fingerprint);
  const fingerprintInput = { ...profile };
  delete fingerprintInput.fingerprint;
  return Boolean(
    hasOnlyKeys(profile, [
      'schemaVersion',
      'profileKey',
      'unknownRelationPolicy',
      'inferencePolicy',
      'relationRefs',
      'fingerprint',
    ]) &&
    profile.schemaVersion === AMI_BRAIN_ACTION_RELATION_PROFILE_SCHEMA &&
    profile.profileKey === `${actionKey}.relations` &&
    profile.unknownRelationPolicy === 'fail_closed' &&
    profile.inferencePolicy === 'explicit_only' &&
    relationRefs.some(
      (relation) =>
        record(relation.relationDefinitionRef).key === 'action_relation.occurrence_of' &&
        relation.fromRef === '$action_execution' &&
        relation.toRef === actionKey,
    ) &&
    targetEntityRefs.every((targetRef) =>
      relationRefs.some(
        (relation) =>
          record(relation.relationDefinitionRef).key === 'action_relation.acts_on' &&
          relation.fromRef === actionKey &&
          relation.toRef === targetRef,
      ),
    ) &&
    (!['create', 'reserve'].includes(actionClass) || relationKeys.includes('action_relation.creates')) &&
    (!['transition', 'update'].includes(actionClass) || relationKeys.includes('action_relation.state_transition')) &&
    ((requiresInstitutionalEffect &&
      institutionalEffectRelations.length === 1 &&
      institutionalEffectRelations[0].fromRef === '$action_execution' &&
      institutionalEffectRelations[0].toRef === `${actionKey}.institutional_effect`) ||
      (!requiresInstitutionalEffect && institutionalEffectRelations.length === 0)) &&
    validRefs &&
    fingerprint &&
    fingerprint === sha256(stableStringify(fingerprintInput)),
  );
}

function validActionInformationArtifact(actionPayload, actionKey) {
  const profile = record(actionPayload.informationArtifact);
  const fingerprint = normalizedHex(profile.fingerprint);
  const fingerprintInput = { ...profile };
  delete fingerprintInput.fingerprint;
  return Boolean(
    hasOnlyKeys(profile, [
      'schemaVersion',
      'profileKey',
      'referencePolicy',
      'artifactTypePolicy',
      'sourcePolicy',
      'versionPolicy',
      'contentIntegrityPolicy',
      'supersessionPolicy',
      'fingerprint',
    ]) &&
    profile.schemaVersion === AMI_BRAIN_ACTION_INFORMATION_ARTIFACT_SCHEMA &&
    profile.profileKey === `${actionKey}.information_artifact` &&
    profile.referencePolicy === 'bind_if_present' &&
    profile.artifactTypePolicy === 'governed_result_reference' &&
    profile.sourcePolicy === 'completed_brain_run_same_conversation_store_user' &&
    profile.versionPolicy === 'source_run_and_capability_version' &&
    profile.contentIntegrityPolicy === 'canonical_content_fingerprint' &&
    profile.supersessionPolicy === 'explicit_new_reference_only' &&
    fingerprint &&
    fingerprint === sha256(stableStringify(fingerprintInput)),
  );
}

function validActionSideEffectInvariant(actionPayload, actionKey) {
  const profile = record(actionPayload.sideEffectInvariant);
  const fingerprint = normalizedHex(profile.fingerprint);
  const predicateRefs = normalizeSemanticContractRefs(actionPayload.preconditionPredicateRefs);
  const effectRefs = normalizeSemanticContractRefs(actionPayload.effectAssertionRefs);
  const expectedGuardContractFingerprint = sha256(
    stableStringify({
      actionKey,
      preconditions: stringArray(actionPayload.preconditions).sort(),
      predicateRefs: [...predicateRefs].sort((left, right) => left.key.localeCompare(right.key)),
    }),
  );
  const expectedEffectContractFingerprint = sha256(
    stableStringify({
      actionKey,
      effects: stringArray(actionPayload.effects).sort(),
      effectRefs: [...effectRefs].sort((left, right) => left.key.localeCompare(right.key)),
    }),
  );
  const fingerprintInput = { ...profile };
  delete fingerprintInput.fingerprint;
  return Boolean(
    hasOnlyKeys(profile, [
      'schemaVersion',
      'profileKey',
      'guardContractFingerprint',
      'effectContractFingerprint',
      'invariantContractRef',
      'undeclaredSideEffectPolicy',
      'gatewayEffectPolicy',
      'mutationFootprintEvidencePolicy',
      'successEvidencePolicy',
      'partialSuccessPolicy',
      'recoveryPolicy',
      'compensationPolicy',
      'outcomeObservationPolicy',
      'fingerprint',
    ]) &&
    profile.schemaVersion === AMI_BRAIN_ACTION_SIDE_EFFECT_INVARIANT_SCHEMA &&
    profile.profileKey === `${actionKey}.side_effect_invariant` &&
    profile.guardContractFingerprint === expectedGuardContractFingerprint &&
    profile.effectContractFingerprint === expectedEffectContractFingerprint &&
    normalizeSemanticContractRefs([profile.invariantContractRef]).length === 1 &&
    profile.undeclaredSideEffectPolicy === 'forbid' &&
    profile.gatewayEffectPolicy === 'exact_declared_effect_match' &&
    profile.mutationFootprintEvidencePolicy === 'exact_database_trigger_observed_write_set' &&
    profile.successEvidencePolicy === 'all_declared_effects_observed' &&
    profile.partialSuccessPolicy === 'explicit_partially_succeeded' &&
    profile.recoveryPolicy === 'gateway_declared_strategy_only' &&
    profile.compensationPolicy === 'explicit_compensation_action_required' &&
    profile.outcomeObservationPolicy === 'required_for_async_effects' &&
    fingerprint &&
    fingerprint === sha256(stableStringify(fingerprintInput)),
  );
}

export function validActionInstitutionalEffect(actionPayload, actionKey) {
  const contract = AMI_BRAIN_ACTION_INSTITUTIONAL_EFFECT_CONTRACTS[actionKey];
  const rawProfile = actionPayload.institutionalEffect;
  if (!contract) return rawProfile === undefined || rawProfile === null;
  const profile = record(rawProfile);
  const constitutionPolicy = record(profile.constitutionPolicy);
  const formalStateTransition = record(profile.formalStateTransition);
  const fingerprint = normalizedHex(profile.fingerprint);
  const fingerprintInput = { ...profile };
  delete fingerprintInput.fingerprint;
  return Boolean(
    hasOnlyKeys(profile, [
      'schemaVersion',
      'profileKey',
      'effectKind',
      'requiredPermission',
      'empoweredRolePolicy',
      'authorizationBasis',
      'constitutionPolicy',
      'formalStateTransition',
      'effectivenessPolicy',
      'effectiveAtPolicy',
      'truthPolicy',
      'invalidityPolicy',
      'fingerprint',
    ]) &&
    profile.schemaVersion === AMI_BRAIN_ACTION_INSTITUTIONAL_EFFECT_SCHEMA &&
    profile.profileKey === `${actionKey}.institutional_effect` &&
    profile.effectKind === contract.effectKind &&
    profile.requiredPermission === contract.requiredPermission &&
    profile.empoweredRolePolicy === 'current_authenticated_role_with_permission' &&
    profile.authorizationBasis === 'explicit_confirmation_and_current_permission' &&
    hasOnlyKeys(constitutionPolicy, [
      'requiredPreconditionKeys',
      'requiredEffectKey',
      'requiredMutationKind',
      'requiredBusinessObjectType',
      'requiredChangedFields',
      'requiredParticipantRoles',
    ]) &&
    stableStringify(stringArray(constitutionPolicy.requiredPreconditionKeys).sort()) ===
      stableStringify(stringArray(actionPayload.preconditions).sort()) &&
    constitutionPolicy.requiredEffectKey === contract.requiredEffectKey &&
    constitutionPolicy.requiredMutationKind === 'state_transition' &&
    constitutionPolicy.requiredBusinessObjectType === contract.requiredBusinessObjectType &&
    stableStringify(stringArray(constitutionPolicy.requiredChangedFields).sort()) === stableStringify(['status']) &&
    stableStringify(stringArray(constitutionPolicy.requiredParticipantRoles).sort()) ===
      stableStringify(['accountable_party', 'authorizer', 'performer', 'requester']) &&
    hasOnlyKeys(formalStateTransition, ['fromStatePolicy', 'toState']) &&
    formalStateTransition.fromStatePolicy === contract.fromStatePolicy &&
    formalStateTransition.toState === contract.toState &&
    profile.effectivenessPolicy === 'observed_state_transition_and_transactional_receipt' &&
    profile.effectiveAtPolicy === 'mutation_receipt_committed_at' &&
    profile.truthPolicy === 'observed_only' &&
    profile.invalidityPolicy === 'fail_closed_with_reason' &&
    fingerprint &&
    fingerprint === sha256(stableStringify(fingerprintInput)),
  );
}

function validActionInvariantContractRef(actionPayload, actionKey, manifest) {
  const [ref] = normalizeSemanticContractRefs([record(actionPayload.sideEffectInvariant).invariantContractRef]);
  const contract = manifest.contracts.find((item) => item.actionKey === actionKey);
  return Boolean(ref && contract && sameSemanticContractRef(ref, contract));
}

function validActionSituationContext(actionPayload, actionKey) {
  const profile = record(actionPayload.situationContext);
  const businessTimePolicy = record(profile.businessTimePolicy);
  const actorPolicy = record(profile.actorPolicy);
  const fingerprint = normalizedHex(profile.fingerprint);
  const fingerprintInput = { ...profile };
  delete fingerprintInput.fingerprint;
  return Boolean(
    hasOnlyKeys(profile, [
      'schemaVersion',
      'profileKey',
      'tenantBoundary',
      'requestChannelPolicy',
      'devicePolicy',
      'conversationPolicy',
      'businessTimePolicy',
      'actorPolicy',
      'fingerprint',
    ]) &&
    profile.schemaVersion === AMI_BRAIN_ACTION_SITUATION_CONTEXT_SCHEMA &&
    profile.profileKey === `${actionKey}.situation_context` &&
    profile.tenantBoundary === 'current_store' &&
    profile.requestChannelPolicy === 'bind_if_present' &&
    profile.devicePolicy === 'bind_if_present' &&
    profile.conversationPolicy === 'same_conversation' &&
    hasOnlyKeys(businessTimePolicy, ['timezone', 'businessDatePolicy', 'clockSource']) &&
    businessTimePolicy.timezone === 'Asia/Shanghai' &&
    businessTimePolicy.businessDatePolicy === 'same_business_date' &&
    businessTimePolicy.clockSource === 'server' &&
    hasOnlyKeys(actorPolicy, ['subjectPolicy', 'qualificationPolicy']) &&
    actorPolicy.subjectPolicy === 'same_authenticated_user' &&
    actorPolicy.qualificationPolicy === 'revalidate_current_role_and_permission' &&
    fingerprint &&
    fingerprint === sha256(stableStringify(fingerprintInput)),
  );
}

function validActionLexicalFrame(actionPayload, actionKey, actionName) {
  const frame = record(actionPayload.lexicalFrame);
  const lexicalUnits = stringArray(frame.lexicalUnits);
  const thematicRoles = Array.isArray(frame.thematicRoles) ? frame.thematicRoles.map(record) : [];
  const semanticPredicates = stringArray(frame.semanticPredicates);
  const contrasts = Array.isArray(frame.contrasts) ? frame.contrasts.map(record) : [];
  const fingerprint = normalizedHex(frame.fingerprint);
  const slots = Array.isArray(actionPayload.inputSlots) ? actionPayload.inputSlots.map(record) : [];
  const slotsByKey = new Map(slots.map((slot) => [optionalString(slot.slotKey), optionalString(slot.semanticRole)]));
  const coveredSlots = new Set();
  const aliases = stringArray(actionPayload.aliases);
  const semanticRoles = new Set([
    'actor',
    'requester',
    'authorizer',
    'approver',
    'performer',
    'assignee',
    'service_provider',
    'accountable_party',
    'beneficiary',
    'counterparty',
    'object',
    'target',
    'instrument',
    'origin',
    'destination',
    'quantity',
    'time',
    'condition',
  ]);
  const dimensions = new Set([
    'modality',
    'action_class',
    'target_entity',
    'required_role',
    'required_slot',
    'precondition',
    'effect',
    'state_transition',
    'resource_flow',
    'spatial_direction',
    'responsibility',
    'commitment',
  ]);
  const validContrasts =
    contrasts.length > 0 &&
    new Set(contrasts.map((contrast) => optionalString(contrast.conceptKey))).size === contrasts.length &&
    contrasts.every((contrast) => {
      const conceptKey = optionalString(contrast.conceptKey);
      const discriminators = Array.isArray(contrast.discriminators) ? contrast.discriminators.map(record) : [];
      return Boolean(
        hasOnlyKeys(contrast, ['conceptKey', 'name', 'discriminators']) &&
        conceptKey &&
        /^(?:action|speech)\.[a-z][a-z0-9_]*$/u.test(conceptKey) &&
        conceptKey !== actionKey &&
        optionalString(contrast.name) &&
        discriminators.length > 0 &&
        discriminators.every(
          (item) =>
            hasOnlyKeys(item, ['dimension', 'currentActionValue', 'contrastActionValue']) &&
            dimensions.has(optionalString(item.dimension)) &&
            optionalString(item.currentActionValue) &&
            optionalString(item.contrastActionValue),
        ),
      );
    });
  const fingerprintInput = { ...frame };
  delete fingerprintInput.fingerprint;
  return Boolean(
    frame.schemaVersion === AMI_BRAIN_ACTION_LEXICAL_FRAME_SCHEMA &&
    hasOnlyKeys(frame, [
      'schemaVersion',
      'frameKey',
      'lexicalUnits',
      'thematicRoles',
      'semanticPredicates',
      'contrasts',
      'fingerprint',
    ]) &&
    frame.frameKey === `${actionKey}.lexical_frame` &&
    lexicalUnits.length > 0 &&
    actionName &&
    lexicalUnits.includes(actionName) &&
    aliases.every((alias) => lexicalUnits.includes(alias)) &&
    thematicRoles.length > 0 &&
    thematicRoles.every((role) => {
      const semanticRole = optionalString(role.semanticRole);
      const slotKeys = stringArray(role.slotKeys);
      if (
        !hasOnlyKeys(role, ['semanticRole', 'slotKeys']) ||
        !semanticRole ||
        !semanticRoles.has(semanticRole) ||
        !slotKeys.length
      )
        return false;
      return slotKeys.every((slotKey) => {
        const valid = slotsByKey.get(slotKey) === semanticRole && !coveredSlots.has(slotKey);
        coveredSlots.add(slotKey);
        return valid;
      });
    }) &&
    coveredSlots.size === slotsByKey.size &&
    validActionSemanticPredicates(actionPayload, actionKey, semanticPredicates) &&
    validContrasts &&
    fingerprint &&
    fingerprint === sha256(stableStringify(fingerprintInput)),
  );
}

function validActionSemanticPredicates(actionPayload, actionKey, predicates) {
  const actionClass = optionalString(actionPayload.actionClass);
  const targetEntityRefs = stringArray(actionPayload.targetEntityRefs);
  const required = [
    `occurrence_of:${actionKey}`,
    ...stringArray(actionPayload.preconditions).map((key) => `precondition_ref:${key}`),
    ...stringArray(actionPayload.effects).map((key) => `effect_ref:${key}`),
  ];
  if (
    !predicates.length ||
    predicates.some((predicate) => !/^[a-z][a-z0-9_]*:[a-z][a-z0-9_.:]*$/u.test(predicate)) ||
    required.some((predicate) => !predicates.includes(predicate))
  ) {
    return false;
  }
  const targetsActionEntity = (predicate) => {
    const value = predicate.slice(predicate.indexOf(':') + 1);
    return targetEntityRefs.some((entityRef) => value === entityRef || value.startsWith(`${entityRef}.`));
  };
  if (
    predicates.some(
      (predicate) =>
        (predicate.startsWith('creates:') || predicate.startsWith('updates:')) && !targetsActionEntity(predicate),
    )
  ) {
    return false;
  }
  if (
    (actionClass === 'create' || actionClass === 'reserve') &&
    !predicates.some((predicate) => predicate.startsWith('creates:') && targetsActionEntity(predicate))
  ) {
    return false;
  }
  if (
    ['update', 'transition', 'delete', 'approve', 'consume'].includes(actionClass) &&
    !predicates.some(
      (predicate) =>
        predicate.startsWith('updates:') ||
        predicate.startsWith('invalidates:') ||
        predicate.startsWith('state_transition:'),
    )
  ) {
    return false;
  }
  return true;
}

function validReleaseItem(item) {
  const resourceVersion = record(item?.resourceVersion);
  return Boolean(
    positiveInteger(item?.resourceVersionId) &&
    positiveInteger(resourceVersion.id) === positiveInteger(item?.resourceVersionId) &&
    item?.resourceType === resourceVersion.resourceType &&
    item?.resourceKey === resourceVersion.resourceKey &&
    positiveInteger(item?.version) === positiveInteger(resourceVersion.version) &&
    normalizedHex(resourceVersion.checksum) &&
    stableStringify(item?.snapshot) === stableStringify(resourceVersion.snapshot),
  );
}

function validCapabilitySnapshot(snapshot, item, capabilityKey) {
  const requiredPermissions = stringArray(snapshot.requiredPermissions);
  return Boolean(
    snapshot.key === capabilityKey &&
    positiveInteger(snapshot.version) === positiveInteger(item?.version) &&
    normalizedHex(snapshot.sourceFingerprint) &&
    snapshot.sideEffect === true &&
    snapshot.requiresConfirmation === true &&
    snapshot.idempotency === 'required' &&
    requiredPermissions.length > 0,
  );
}

function validDefinitionIdentity(version, ref, actionKey, evaluationOnly) {
  const definition = record(version.definition);
  return Boolean(
    definition.definitionKey === actionKey &&
    definition.kind === 'action' &&
    definition.status === 'active' &&
    (evaluationOnly || positiveInteger(definition.currentPublishedVersionId) === positiveInteger(version.id)) &&
    positiveInteger(version.id) === ref.versionId &&
    positiveInteger(version.version) === ref.version &&
    normalizedHex(version.fingerprint) === ref.definitionFingerprint &&
    normalizedHex(version.sourceFingerprint) === ref.sourceFingerprint,
  );
}

function validEvaluationDefinition(version, evaluationOnly) {
  return (
    version.validationStatus === 'passed' &&
    (version.lifecycleStatus === 'published' || (evaluationOnly && version.lifecycleStatus === 'validated'))
  );
}

function validActionProjection(version) {
  const projections = Array.isArray(version.projections) ? version.projections : [];
  if (projections.length !== 1) return false;
  const projection = projections[0];
  const definition = record(version.definition);
  const payload = record(projection.payload);
  const definitionRef = record(payload.definitionRef);
  const data = record(payload.data);
  const runtimeDefinition = record(data.runtimeDefinition);
  const expectedFingerprint = sha256(
    stableStringify({
      targetType: projection.targetType,
      targetKey: projection.targetKey,
      definitionVersionId: projection.definitionVersionId,
      definitionRef: {
        definitionKey: definition.definitionKey,
        definitionVersion: version.version,
        definitionFingerprint: version.fingerprint,
        sourceFingerprint: version.sourceFingerprint,
      },
      payload: projection.payload,
      readOnly: true,
    }),
  );
  return Boolean(
    projection.readOnly === true &&
    projection.targetType === 'intent_semantic_index' &&
    projection.targetKey === `${definition.definitionKey}@${version.version}` &&
    projection.definitionVersionId === version.id &&
    projection.definitionKey === definition.definitionKey &&
    projection.definitionVersion === version.version &&
    projection.definitionFingerprint === version.fingerprint &&
    projection.sourceFingerprint === version.sourceFingerprint &&
    payload.projectionSchemaVersion === '2.0' &&
    payload.preview === false &&
    payload.projectionType === 'intent_semantic_index' &&
    definitionRef.definitionKey === definition.definitionKey &&
    definitionRef.definitionVersion === version.version &&
    definitionRef.definitionFingerprint === version.fingerprint &&
    definitionRef.sourceFingerprint === version.sourceFingerprint &&
    data.definitionKind === 'action' &&
    stableStringify(runtimeDefinition) === stableStringify(version.payload) &&
    normalizedHex(projection.projectionFingerprint) === expectedFingerprint,
  );
}

function validGatewayContract(descriptor, requirement, actionPayload, capabilitySnapshot) {
  const requiredPermissions = stringArray(capabilitySnapshot.requiredPermissions);
  return Boolean(
    descriptor.key === requirement.gatewayActionKey &&
    positiveInteger(descriptor.version) &&
    optionalString(descriptor.permission) &&
    requiredPermissions.includes(descriptor.permission) &&
    descriptor.riskLevel === actionPayload.riskPolicy &&
    riskRank(capabilitySnapshot.riskLevel) >= riskRank(descriptor.riskLevel) &&
    Array.isArray(descriptor.requiredFields) &&
    Array.isArray(descriptor.allowedFields) &&
    stableStringify(stringArray(descriptor.effectKeys).sort()) ===
      stableStringify(stringArray(actionPayload.effects).sort()) &&
    optionalString(descriptor.transactionBoundary) &&
    optionalString(descriptor.receiptType) &&
    ['safe_replay', 'manual_reconcile'].includes(descriptor.failureRecovery),
  );
}

function validPredicateEffectContracts(actionPayload, predicateRefs, effectRefs, manifest) {
  const preconditions = stringArray(actionPayload.preconditions);
  const effects = stringArray(actionPayload.effects);
  const predicateManifest = semanticContractMap(manifest.predicates);
  const effectManifest = semanticContractMap(manifest.effects);
  return Boolean(
    preconditions.length > 0 &&
    effects.length > 0 &&
    predicateRefs.length === preconditions.length &&
    effectRefs.length === effects.length &&
    stableStringify(predicateRefs.map((item) => item.key)) === stableStringify(preconditions) &&
    stableStringify(effectRefs.map((item) => item.key)) === stableStringify(effects) &&
    predicateRefs.every((ref) => sameSemanticContractRef(ref, predicateManifest.get(ref.key))) &&
    effectRefs.every((ref) => sameSemanticContractRef(ref, effectManifest.get(ref.key))),
  );
}

function normalizePredicateEffectManifest(value) {
  const manifest = record(value);
  const catalogSource = record(manifest.catalogSource);
  const evaluatorSource = record(manifest.evaluatorSource);
  return {
    schemaVersion: optionalString(manifest.schemaVersion),
    catalogSchemaVersion: optionalString(manifest.catalogSchemaVersion),
    catalogSource: {
      path: optionalString(catalogSource.path),
      checksum: normalizedHex(catalogSource.checksum),
    },
    evaluatorSource: {
      path: optionalString(evaluatorSource.path),
      checksum: normalizedHex(evaluatorSource.checksum),
    },
    predicates: normalizeSemanticContractRefs(manifest.predicates),
    effects: normalizeSemanticContractRefs(manifest.effects),
  };
}

function normalizeActionInvariantManifest(value) {
  const manifest = record(value);
  const catalogSource = record(manifest.catalogSource);
  const contracts = Array.isArray(manifest.contracts)
    ? manifest.contracts.flatMap((item) => {
        const contract = record(item);
        const actionKey = optionalString(contract.actionKey);
        const [ref] = normalizeSemanticContractRefs([contract]);
        return actionKey && ref ? [{ actionKey, ...ref }] : [];
      })
    : [];
  return {
    schemaVersion: optionalString(manifest.schemaVersion),
    catalogSchemaVersion: optionalString(manifest.catalogSchemaVersion),
    catalogSource: {
      path: optionalString(catalogSource.path),
      checksum: normalizedHex(catalogSource.checksum),
    },
    contracts,
  };
}

function normalizeActionRelationManifest(value) {
  const manifest = record(value);
  const catalogSource = record(manifest.catalogSource);
  const relations = Array.isArray(manifest.relations)
    ? manifest.relations.flatMap((item) => {
        const relation = record(item);
        const [ref] = normalizeSemanticContractRefs([relation]);
        const truthMode = optionalString(relation.truthMode);
        if (!ref || !['declared', 'computed', 'observed', 'asserted', 'inferred'].includes(truthMode)) return [];
        return [{ ...ref, requiredKeys: stringArray(relation.requiredKeys).sort(), truthMode }];
      })
    : [];
  return {
    schemaVersion: optionalString(manifest.schemaVersion),
    catalogSchemaVersion: optionalString(manifest.catalogSchemaVersion),
    catalogSource: {
      path: optionalString(catalogSource.path),
      checksum: normalizedHex(catalogSource.checksum),
    },
    relations: relations.sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function validActionInvariantManifest(manifest) {
  return Boolean(
    manifest.schemaVersion === AMI_BRAIN_ACTION_INVARIANT_MANIFEST_SCHEMA &&
    manifest.catalogSchemaVersion === '1.1' &&
    manifest.catalogSource.path === AMI_BRAIN_ACTION_INVARIANT_CATALOG_SOURCE &&
    Boolean(manifest.catalogSource.checksum) &&
    manifest.contracts.length === AMI_BRAIN_REQUIRED_ACTION_BINDINGS.length &&
    new Set(manifest.contracts.map((item) => item.actionKey)).size === manifest.contracts.length &&
    new Set(manifest.contracts.map((item) => item.key)).size === manifest.contracts.length,
  );
}

function validActionRelationManifest(manifest) {
  return Boolean(
    manifest.schemaVersion === AMI_BRAIN_ACTION_RELATION_MANIFEST_SCHEMA &&
    manifest.catalogSchemaVersion === '1.0' &&
    manifest.catalogSource.path === AMI_BRAIN_ACTION_RELATION_CATALOG_SOURCE &&
    Boolean(manifest.catalogSource.checksum) &&
    manifest.relations.length >= 12 &&
    new Set(manifest.relations.map((item) => item.key)).size === manifest.relations.length &&
    manifest.relations.every(
      (item) =>
        item.key.startsWith('action_relation.') &&
        positiveInteger(item.version) &&
        normalizedHex(item.fingerprint) &&
        ['declared', 'computed', 'observed', 'asserted', 'inferred'].includes(item.truthMode),
    ),
  );
}

function validPredicateEffectManifest(manifest) {
  return Boolean(
    manifest.schemaVersion === AMI_BRAIN_ACTION_PREDICATE_EFFECT_MANIFEST_SCHEMA &&
    manifest.catalogSchemaVersion === '1.0' &&
    manifest.catalogSource.path === AMI_BRAIN_ACTION_PREDICATE_EFFECT_CATALOG_SOURCE &&
    Boolean(manifest.catalogSource.checksum) &&
    manifest.evaluatorSource.path === AMI_BRAIN_ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE &&
    Boolean(manifest.evaluatorSource.checksum) &&
    manifest.predicates.length > 0 &&
    manifest.effects.length > 0 &&
    semanticContractMap(manifest.predicates).size === manifest.predicates.length &&
    semanticContractMap(manifest.effects).size === manifest.effects.length,
  );
}

function semanticContractMap(refs) {
  return new Map(refs.map((ref) => [ref.key, ref]));
}

function sameSemanticContractRef(left, right) {
  return Boolean(
    right && left.key === right.key && left.version === right.version && left.fingerprint === right.fingerprint,
  );
}

function riskRank(value) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[String(value)] ?? -1;
}

function validateReleaseVersionMap(value, items) {
  const versionMap = record(value);
  const expected = Object.fromEntries(
    items
      .map((item) => [`${item.resourceType}:${item.resourceKey}`, positiveInteger(item.version)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return stableStringify(versionMap) === stableStringify(expected);
}

function collectActionDefinitionRefs(items) {
  return items.flatMap((item) => {
    if (item?.resourceType !== 'skill') return [];
    return normalizeDefinitionRefs(record(item?.resourceVersion?.snapshot ?? item?.snapshot).definitionRefs).filter(
      (ref) => ref.definitionKey.startsWith('action.'),
    );
  });
}

function normalizeDefinitionRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const ref = record(item);
    const definitionKey = optionalString(ref.definitionKey);
    const versionId = positiveInteger(ref.versionId);
    const version = positiveInteger(ref.version);
    const definitionFingerprint = normalizedHex(ref.definitionFingerprint);
    const sourceFingerprint = normalizedHex(ref.sourceFingerprint);
    if (!definitionKey || !versionId || !version || !definitionFingerprint || !sourceFingerprint) return [];
    return [{ definitionKey, versionId, version, definitionFingerprint, sourceFingerprint }];
  });
}

function normalizeActionBindings(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const binding = record(item);
    return {
      capabilityKey: optionalString(binding.capabilityKey),
      bindingMode: optionalString(binding.bindingMode),
      gatewayActionKey: optionalString(binding.gatewayActionKey),
      priority: Number.isInteger(binding.priority) ? binding.priority : null,
      enabled: binding.enabled === true,
    };
  });
}

function normalizeSemanticContractRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const ref = record(item);
    const key = optionalString(ref.key);
    const version = positiveInteger(ref.version);
    const fingerprint = normalizedHex(ref.fingerprint);
    return key && version && fingerprint ? [{ key, version, fingerprint }] : [];
  });
}

function createReleaseFingerprint(items) {
  const resources = items
    .map((item) => ({
      resourceVersionId: positiveInteger(item?.resourceVersionId) ?? 0,
      checksum: optionalString(item?.resourceVersion?.checksum) ?? '',
    }))
    .sort(
      (left, right) => left.resourceVersionId - right.resourceVersionId || left.checksum.localeCompare(right.checksum),
    );
  return sha256(JSON.stringify(resources));
}

function createSemanticSnapshotFingerprint(items) {
  const contracts = items
    .filter((item) => item?.resourceVersion?.resourceType === 'skill')
    .map((item) => {
      const snapshot = record(item.resourceVersion.snapshot);
      const definitionRefs = normalizeDefinitionRefs(snapshot.definitionRefs)
        .map((ref) => ({
          definitionKey: ref.definitionKey,
          versionId: ref.versionId,
          version: ref.version,
          definitionFingerprint: ref.definitionFingerprint,
          sourceFingerprint: ref.sourceFingerprint,
        }))
        .sort((left, right) => left.definitionKey.localeCompare(right.definitionKey));
      return { resourceKey: item.resourceVersion.resourceKey, definitionRefs };
    })
    .sort((left, right) => String(left.resourceKey).localeCompare(String(right.resourceKey)));
  return sha256(JSON.stringify(contracts));
}

function normalizeGatewayDescriptorMap(value) {
  return Object.fromEntries(
    Object.entries(record(value))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, descriptor]) => [key, record(descriptor)]),
  );
}

function literalValue(ts, sourceFile, input) {
  const node = unwrapExpression(ts, input);
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((item) => literalValue(ts, sourceFile, item));
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(
      node.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) throw new Error('action_gateway_non_literal_property');
        const key = propertyName(ts, sourceFile, property.name);
        return [key, literalValue(ts, sourceFile, property.initializer)];
      }),
    );
  }
  throw new Error(`action_gateway_non_literal_value:${node.getText(sourceFile).slice(0, 80)}`);
}

function unwrapExpression(ts, input) {
  let node = input;
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(node)))
  ) {
    node = node.expression;
  }
  return node;
}

function propertyName(ts, sourceFile, node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  throw new Error(`action_gateway_property_name_invalid:${node.getText(sourceFile)}`);
}

function unavailableContract({ expectedReleaseId, headCommit, error, now }) {
  return {
    schemaVersion: AMI_BRAIN_ACTION_RELEASE_CONTRACT_SCHEMA,
    identityChecksum: AMI_BRAIN_ACTION_RELEASE_CONTRACT_IDENTITY_CHECKSUM,
    checked: false,
    passed: false,
    candidate: { headCommit: normalizeCommit(headCommit) },
    release: {
      expectedId: positiveInteger(expectedReleaseId),
      id: null,
      releaseKey: null,
      status: null,
      itemCount: 0,
      fingerprint: null,
      versionMapMatches: false,
      itemIdentityMatches: false,
      semanticSnapshotFingerprint: null,
      declaredSemanticSnapshotFingerprint: null,
      semanticSnapshotMatches: false,
    },
    gateway: {
      sourcePath: AMI_BRAIN_ACTION_GATEWAY_SOURCE,
      sourceChecksum: null,
      descriptorChecksum: null,
      descriptorCount: 0,
    },
    predicateEffectManifest: {
      sourcePath: AMI_BRAIN_ACTION_PREDICATE_EFFECT_MANIFEST_SOURCE,
      sourceChecksum: null,
      schemaVersion: null,
      catalogSchemaVersion: null,
      catalogSource: null,
      evaluatorSource: null,
      predicateCount: 0,
      effectCount: 0,
    },
    actions: [],
    summary: {
      requiredActionCount: AMI_BRAIN_REQUIRED_ACTION_BINDINGS.length,
      passedActionCount: 0,
      failedActionCount: AMI_BRAIN_REQUIRED_ACTION_BINDINGS.length,
      failedActionKeys: AMI_BRAIN_REQUIRED_ACTION_BINDINGS.map((item) => item.actionKey),
    },
    contractFingerprint: null,
    blockingReasons: ['action_release_contract_unavailable'],
    error,
    checkedAt: now.toISOString(),
  };
}

function sanitizeError(error) {
  if (!error || typeof error !== 'object') return 'unknown_error';
  const code = optionalString(error.code);
  if (code) return code;
  const name = optionalString(error.name);
  return name || 'unknown_error';
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasOnlyKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(record(value)).every((key) => allowed.has(key));
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/iu.test(value.trim()) ? value.trim().toLowerCase() : null;
}

function normalizedHex(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value.trim()) ? value.trim().toLowerCase() : null;
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
