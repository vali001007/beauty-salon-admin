import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as ts from 'typescript';
import { findCuratedActionCatalogEntry, type CuratedActionCatalogEntry } from './brain-action-candidate-catalog.js';
import {
  resolveCuratedActionEffectContract,
  resolveCuratedActionPredicateContract,
  type CuratedActionSemanticContractRef,
} from './brain-action-predicate-effect-catalog.js';
import { resolveCuratedActionInvariantContract } from './brain-action-invariant-catalog.js';
import { resolveCuratedActionRelationDefinition } from './brain-action-relation-catalog.js';
import { canonicalizeBusinessDefinition } from './business-definition-projection-compiler.service.js';
import { validateBusinessActionSemanticPredicates } from '../brain/cognition/business-action-lexical-semantics.js';
import {
  createBusinessActionInstitutionalEffectProfile,
  INSTITUTIONAL_EFFECT_ACTION_KEYS,
} from '../brain/cognition/business-action-institutional-effect.js';
import type { BusinessActionClass } from '../brain/cognition/business-definition-snapshot.types.js';
import {
  createPrismaStoreScopeResolver,
  deriveCanonicalOntologyIdentity,
  findSemanticAliasConflicts,
  isExecutableOwnerRelation,
  normalizeSemanticAlias,
} from './brain-semantic-candidate.types.js';
import type {
  BusinessDefinitionCandidateDraft,
  BusinessDefinitionCandidateEvidence,
  CanonicalOntologyCandidateIdentity,
  PrismaDatamodelAst,
  PrismaFieldAst,
  PrismaModelAst,
  SemanticLabelEvidence,
  VerifiedBusinessDefinitionCandidate,
} from './brain-semantic-candidate.types.js';

const PRISMA_SCHEMA_PATH = 'packages/server-v2/prisma/schema.prisma';

@Injectable()
export class BrainSemanticCandidateVerifierService {
  verify(
    candidate: BusinessDefinitionCandidateDraft,
    context: {
      datamodel: PrismaDatamodelAst;
      semanticEvidence: SemanticLabelEvidence[];
      sourcePaths?: ReadonlySet<string>;
      sourceFiles?: ReadonlyMap<string, string>;
    },
  ): VerifiedBusinessDefinitionCandidate {
    const blockedReasons: string[] = [];
    const models = new Map(context.datamodel.models.map((model) => [model.name, model]));
    const enums = new Map(
      context.datamodel.enums.map((item) => [
        item.name,
        item.values.map((value) => (typeof value === 'string' ? value : value.name)),
      ]),
    );
    const resolveStoreScope = createPrismaStoreScopeResolver(context.datamodel);
    const curatedAction =
      candidate.kind === 'action' ? findCuratedActionCatalogEntry(candidate.definitionKey) : undefined;
    const identity = curatedAction?.identity ?? deriveCanonicalOntologyIdentity(candidate.kind, candidate.payload);
    const hasAliasConflictContext = Array.isArray(context.semanticEvidence);
    const aliasConflicts = collectAliasConflicts(
      candidate.evidence,
      hasAliasConflictContext ? context.semanticEvidence : [],
    );

    if (candidate.kind !== 'action' && !candidate.evidence.some(isStructuralEvidence)) {
      blockedReasons.push('structural_evidence_missing');
    }
    if (!identity) blockedReasons.push('canonical_identity_not_derivable');
    else verifyCanonicalIdentity(candidate, identity, blockedReasons);
    if (candidate.kind !== 'action' && !hasAliasConflictContext && stringArray(candidate.payload.aliases).length > 0) {
      blockedReasons.push('alias_conflict_context_missing');
    }
    if (candidate.kind !== 'action') verifyCandidateAliasConflicts(candidate, aliasConflicts, blockedReasons);

    const aliases =
      candidate.kind !== 'action' && hasAliasConflictContext ? verifiedAliases(candidate.evidence, aliasConflicts) : [];
    let payload: Record<string, unknown> = { aliases };
    let storeScope: Record<string, unknown> = { mode: 'global' };
    let evidenceOverride: readonly BusinessDefinitionCandidateEvidence[] | undefined;

    if (candidate.kind === 'entity') {
      const modelName = stringValue(candidate.payload.model);
      const model = assertModel(modelName, models, blockedReasons);
      if (model) verifyStructuralEvidence(candidate.evidence, model.name, model.sourcePath, blockedReasons);
      storeScope = verifyStoreScope(candidate, modelName, resolveStoreScope, blockedReasons);
      payload = model ? entityPayload(model, aliases) : { model: modelName, aliases };
    } else if (candidate.kind === 'field') {
      const modelName = stringValue(candidate.payload.model);
      const fieldName = stringValue(candidate.payload.field);
      const model = assertModel(modelName, models, blockedReasons);
      const field = model?.fields.find((item) => item.name === fieldName && item.kind !== 'object');
      if (!field) blockedReasons.push(`field_not_found:${modelName}.${fieldName}`);
      if (field) {
        verifyFieldContract(candidate, modelName, field, enums, blockedReasons);
        verifyStructuralEvidence(
          candidate.evidence,
          `${modelName}.${field.name}`,
          field.sourcePath ?? model?.sourcePath,
          blockedReasons,
        );
      }
      storeScope = verifyStoreScope(candidate, modelName, resolveStoreScope, blockedReasons);
      payload = field ? fieldPayload(modelName, field, aliases) : { model: modelName, field: fieldName, aliases };
    } else if (candidate.kind === 'relation') {
      const fromModelName = stringValue(candidate.payload.fromModel);
      const relationField = stringValue(candidate.payload.relationField);
      const fromModel = assertModel(fromModelName, models, blockedReasons);
      const field = fromModel?.fields.find((item) => item.name === relationField && item.kind === 'object');
      if (!field) blockedReasons.push(`relation_field_not_found:${fromModelName}.${relationField}`);
      if (field) {
        verifyRelationContract(candidate, fromModelName, field, models, blockedReasons);
        verifyStructuralEvidence(
          candidate.evidence,
          `${fromModelName}.${field.name}`,
          field.sourcePath ?? fromModel?.sourcePath,
          blockedReasons,
        );
      }
      storeScope = verifyStoreScope(candidate, fromModelName, resolveStoreScope, blockedReasons);
      payload = field
        ? relationPayload(fromModelName, field, aliases)
        : {
            fromModel: fromModelName,
            relationField,
            aliases,
          };
    } else if (candidate.kind === 'status_dictionary') {
      const enumName = stringValue(candidate.payload.enumName);
      const sourceValues = enums.get(enumName);
      if (!sourceValues) blockedReasons.push(`enum_not_found:${enumName}`);
      const values = stringArray(candidate.payload.values);
      if (!values.length) blockedReasons.push('enum_values_empty');
      if (sourceValues && !sameValues(values, sourceValues)) blockedReasons.push(`enum_values_mismatch:${enumName}`);
      const enumRecord = context.datamodel.enums.find((item) => item.name === enumName);
      if (enumRecord) verifyStructuralEvidence(candidate.evidence, enumName, enumRecord.sourcePath, blockedReasons);
      payload = {
        enumName,
        values: sourceValues ? [...sourceValues] : values,
        aliases,
      };
      storeScope = { mode: 'global' };
    } else if (candidate.kind === 'action') {
      if (!curatedAction) {
        blockedReasons.push(`action_not_in_curated_catalog:${candidate.definitionKey}`);
      } else {
        verifyActionCandidate(
          candidate,
          curatedAction,
          models,
          resolveStoreScope,
          context.sourcePaths,
          context.sourceFiles,
          blockedReasons,
        );
        payload = structuredClone(curatedAction.payload);
        storeScope = structuredClone(curatedAction.storeScope);
        evidenceOverride = curatedAction.evidence;
      }
    } else {
      blockedReasons.push(`candidate_kind_not_supported_in_ontology_slice:${candidate.kind}`);
    }

    const uniqueReasons = [...new Set(blockedReasons)].sort();
    return {
      status: uniqueReasons.length ? 'blocked' : 'draft',
      blockedReasons: uniqueReasons,
      draftInput: rebuildDraftInput(candidate, identity, payload, storeScope, evidenceOverride),
    };
  }
}

function verifyActionCandidate(
  candidate: BusinessDefinitionCandidateDraft,
  catalog: CuratedActionCatalogEntry,
  models: Map<string, PrismaModelAst>,
  resolveStoreScope: (modelName: string) => boolean,
  sourcePaths: ReadonlySet<string> | undefined,
  sourceFiles: ReadonlyMap<string, string> | undefined,
  blockedReasons: string[],
) {
  if (!sameCanonicalValue(candidate.payload, catalog.payload)) {
    blockedReasons.push(`action_catalog_payload_mismatch:${catalog.identity.definitionKey}`);
  }
  if (!sameCanonicalValue(candidate.storeScope, catalog.storeScope)) {
    blockedReasons.push(`action_store_scope_mismatch:${catalog.identity.definitionKey}:current_store`);
  }
  if (!sameCanonicalValue(candidate.evidence, catalog.evidence)) {
    blockedReasons.push(`action_catalog_evidence_mismatch:${catalog.identity.definitionKey}`);
  }

  const payload = candidate.payload;
  if (stringValue(payload.actionKey) !== catalog.identity.definitionKey) {
    blockedReasons.push(`action_key_mismatch:${catalog.identity.definitionKey}`);
  }
  if (!ACTION_CLASSES.has(stringValue(payload.actionClass))) {
    blockedReasons.push(`action_class_invalid:${stringValue(payload.actionClass) || 'missing'}`);
  }
  if (!ACTION_RISK_POLICIES.has(stringValue(payload.riskPolicy))) {
    blockedReasons.push(`action_risk_policy_invalid:${stringValue(payload.riskPolicy) || 'missing'}`);
  }
  if (!ACTION_CONFIRMATION_POLICIES.has(stringValue(payload.confirmationPolicy))) {
    blockedReasons.push(`action_confirmation_policy_invalid:${stringValue(payload.confirmationPolicy) || 'missing'}`);
  } else if (payload.confirmationPolicy === 'none') {
    blockedReasons.push('action_confirmation_policy_must_be_controlled');
  }
  if (payload.idempotencyPolicy !== 'required') blockedReasons.push('action_idempotency_policy_must_be_required');

  const targetEntityRefs = stringArray(payload.targetEntityRefs);
  if (!targetEntityRefs.length) blockedReasons.push('action_target_entity_refs_empty');
  for (const entityRef of targetEntityRefs) {
    verifyActionEntityRef(entityRef, catalog, models, resolveStoreScope, blockedReasons);
  }
  verifyActionSlots(payload.inputSlots, catalog, models, resolveStoreScope, blockedReasons);
  verifyActionLexicalFrame(payload.lexicalFrame, payload, catalog, blockedReasons);
  verifyActionSituationContext(payload.situationContext, payload, blockedReasons);
  verifyActionModalityPolicy(payload.modalityPolicy, payload, blockedReasons);
  verifyActionInformationArtifact(payload.informationArtifact, payload, blockedReasons);
  verifyActionSideEffectInvariant(payload.sideEffectInvariant, payload, blockedReasons);
  verifyActionParticipantProfile(payload.participantProfile, payload, blockedReasons);
  verifyActionRelationProfile(payload.relationProfile, payload, blockedReasons);
  verifyActionInstitutionalEffect(payload.institutionalEffect, payload, blockedReasons);
  verifyActionSemanticContractRefs(
    payload.preconditions,
    payload.preconditionPredicateRefs,
    'predicate',
    blockedReasons,
  );
  verifyActionSemanticContractRefs(payload.effects, payload.effectAssertionRefs, 'effect', blockedReasons);
  verifyActionBindings(payload.capabilityBindings, blockedReasons);
  verifyActionEvidence(candidate.evidence, catalog, sourcePaths, sourceFiles, blockedReasons);
  const permissions = Object.values(catalog.permissionContract);
  if (new Set(permissions).size !== 1) {
    blockedReasons.push(
      `action_permission_contract_mismatch:${catalog.identity.definitionKey}:${catalog.permissionContract.backendApi}:${catalog.permissionContract.capability}:${catalog.permissionContract.gateway}`,
    );
  }
}

function verifyActionParticipantProfile(value: unknown, payload: Record<string, unknown>, blockedReasons: string[]) {
  const profile = recordValue(value);
  const actionKey = stringValue(payload.actionKey);
  const slots = new Map(
    (Array.isArray(payload.inputSlots) ? payload.inputSlots : []).map((item) => {
      const slot = recordValue(item);
      return [stringValue(slot.slotKey), slot] as const;
    }),
  );
  const bindings = Array.isArray(profile.roleBindings) ? profile.roleBindings.map(recordValue) : [];
  if (
    !hasOnlyKeys(profile, [
      'schemaVersion',
      'profileKey',
      'actorAliasPolicy',
      'unboundRolePolicy',
      'roleBindings',
      'fingerprint',
    ]) ||
    profile.schemaVersion !== '1.0' ||
    stringValue(profile.profileKey) !== `${actionKey}.participant` ||
    profile.actorAliasPolicy !== 'legacy_requester_only' ||
    profile.unboundRolePolicy !== 'fail_closed' ||
    !bindings.length
  ) {
    blockedReasons.push(`action_participant_profile_invalid:${actionKey || 'missing'}`);
  }
  const seen = new Set<string>();
  for (const binding of bindings) {
    const role = stringValue(binding.role);
    const source = stringValue(binding.source);
    const slotKey = stringValue(binding.slotKey);
    const key = `${role}:${slotKey || source}`;
    if (
      !hasOnlyKeys(binding, ['role', 'source', 'slotKey', 'requiredAt', 'qualificationPolicy', 'runtimeVisibility']) ||
      !ACTION_PARTICIPANT_ROLES.has(role) ||
      !ACTION_PARTICIPANT_SOURCES.has(source) ||
      !validParticipantBindingSource(role, source) ||
      !ACTION_PARTICIPANT_QUALIFICATION_POLICIES.has(stringValue(binding.qualificationPolicy)) ||
      !ACTION_PARTICIPANT_RUNTIME_VISIBILITIES.has(stringValue(binding.runtimeVisibility)) ||
      stringArray(binding.requiredAt).some((stage) => !ACTION_REQUIRED_STAGES.has(stage)) ||
      seen.has(key)
    ) {
      blockedReasons.push(`action_participant_binding_invalid:${actionKey || 'missing'}:${key || 'missing'}`);
    }
    seen.add(key);
    if (source === 'action_slot') {
      const slot = slots.get(slotKey);
      if (!slot || stringValue(slot.semanticRole) !== role) {
        blockedReasons.push(`action_participant_slot_invalid:${actionKey || 'missing'}:${slotKey || 'missing'}`);
      }
    } else if (slotKey) {
      blockedReasons.push(`action_participant_slot_unexpected:${actionKey || 'missing'}:${role || 'missing'}`);
    }
  }
  for (const requiredRole of ['requester', 'authorizer', 'performer', 'accountable_party']) {
    if (!bindings.some((binding) => stringValue(binding.role) === requiredRole)) {
      blockedReasons.push(`action_participant_required_role_missing:${actionKey || 'missing'}:${requiredRole}`);
    }
  }
  verifyActionProfileFingerprint(
    profile,
    `action_participant_profile_fingerprint_invalid:${actionKey || 'missing'}`,
    blockedReasons,
  );
}

function verifyActionRelationProfile(value: unknown, payload: Record<string, unknown>, blockedReasons: string[]) {
  const profile = recordValue(value);
  const actionKey = stringValue(payload.actionKey);
  const actionClass = stringValue(payload.actionClass);
  const targetEntityRefs = stringArray(payload.targetEntityRefs);
  const participantProfile = recordValue(payload.participantProfile);
  const participantRoles = new Set(
    (Array.isArray(participantProfile.roleBindings) ? participantProfile.roleBindings : []).map((item) =>
      stringValue(recordValue(item).role),
    ),
  );
  const relationRefs = Array.isArray(profile.relationRefs) ? profile.relationRefs.map(recordValue) : [];
  if (
    !hasOnlyKeys(profile, [
      'schemaVersion',
      'profileKey',
      'unknownRelationPolicy',
      'inferencePolicy',
      'relationRefs',
      'fingerprint',
    ]) ||
    profile.schemaVersion !== '1.0' ||
    stringValue(profile.profileKey) !== `${actionKey}.relations` ||
    profile.unknownRelationPolicy !== 'fail_closed' ||
    profile.inferencePolicy !== 'explicit_only' ||
    !relationRefs.length
  ) {
    blockedReasons.push(`action_relation_profile_invalid:${actionKey || 'missing'}`);
  }
  const seen = new Set<string>();
  for (const relation of relationRefs) {
    const ref = recordValue(relation.relationDefinitionRef);
    const definition = resolveCuratedActionRelationDefinition({
      key: stringValue(ref.key),
      version: Number(ref.version),
      fingerprint: stringValue(ref.fingerprint),
    });
    const fromRef = stringValue(relation.fromRef);
    const toRef = stringValue(relation.toRef);
    const slotKey = stringValue(relation.slotKey);
    const participantRole = stringValue(relation.participantRole);
    const relationKey = definition?.relationKey ?? stringValue(ref.key);
    const key = `${relationKey}:${fromRef}:${toRef}:${slotKey}`;
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
      !definition ||
      !fromRef ||
      !toRef ||
      seen.has(key)
    ) {
      blockedReasons.push(`action_relation_ref_invalid:${actionKey || 'missing'}:${key || 'missing'}`);
      continue;
    }
    seen.add(key);
    if (
      JSON.stringify(stringArray(relation.qualificationKeys).sort()) !==
      JSON.stringify([...definition.qualificationPolicy.requiredKeys].sort())
    ) {
      blockedReasons.push(`action_relation_qualification_invalid:${actionKey}:${definition.relationKey}`);
    }
    const expectedTruthPolicy = definition.truthMode === 'declared' ? 'declared_only' : 'runtime_evaluator_required';
    if (relation.truthStatusPolicy !== expectedTruthPolicy) {
      blockedReasons.push(`action_relation_truth_policy_invalid:${actionKey}:${definition.relationKey}`);
    }
    if (participantRole && !participantRoles.has(participantRole)) {
      blockedReasons.push(`action_relation_participant_invalid:${actionKey}:${participantRole}`);
    }
    if (
      ['action_relation.acts_on', 'action_relation.creates', 'action_relation.state_transition'].includes(
        definition.relationKey,
      ) &&
      ((definition.relationKey === 'action_relation.state_transition'
        ? fromRef !== '$action_execution'
        : fromRef !== actionKey) ||
        !targetEntityRefs.includes(toRef))
    ) {
      blockedReasons.push(`action_relation_target_invalid:${actionKey}:${definition.relationKey}`);
    }
  }
  if (
    !relationRefs.some((relation) => {
      const ref = recordValue(relation.relationDefinitionRef);
      return (
        stringValue(ref.key) === 'action_relation.occurrence_of' &&
        relation.fromRef === '$action_execution' &&
        relation.toRef === actionKey
      );
    })
  ) {
    blockedReasons.push(`action_relation_occurrence_missing:${actionKey || 'missing'}`);
  }
  for (const targetEntityRef of targetEntityRefs) {
    if (
      !relationRefs.some((relation) => {
        const ref = recordValue(relation.relationDefinitionRef);
        return (
          ref.key === 'action_relation.acts_on' && relation.fromRef === actionKey && relation.toRef === targetEntityRef
        );
      })
    ) {
      blockedReasons.push(`action_relation_target_missing:${actionKey}:${targetEntityRef}`);
    }
  }
  if (
    (actionClass === 'create' || actionClass === 'reserve') &&
    !relationRefs.some((relation) => recordValue(relation.relationDefinitionRef).key === 'action_relation.creates')
  ) {
    blockedReasons.push(`action_relation_create_missing:${actionKey}`);
  }
  if (
    (actionClass === 'transition' || actionClass === 'update') &&
    !relationRefs.some(
      (relation) => recordValue(relation.relationDefinitionRef).key === 'action_relation.state_transition',
    )
  ) {
    blockedReasons.push(`action_relation_state_transition_missing:${actionKey}`);
  }
  const requiresInstitutionalEffect = INSTITUTIONAL_EFFECT_ACTION_KEYS.includes(actionKey);
  const institutionalEffectRefs = relationRefs.filter(
    (relation) => recordValue(relation.relationDefinitionRef).key === 'action_relation.institutional_effect',
  );
  if (
    (requiresInstitutionalEffect &&
      (institutionalEffectRefs.length !== 1 ||
        institutionalEffectRefs[0].fromRef !== '$action_execution' ||
        institutionalEffectRefs[0].toRef !== `${actionKey}.institutional_effect`)) ||
    (!requiresInstitutionalEffect && institutionalEffectRefs.length)
  ) {
    blockedReasons.push(`action_relation_institutional_effect_invalid:${actionKey}`);
  }
  verifyActionProfileFingerprint(
    profile,
    `action_relation_profile_fingerprint_invalid:${actionKey || 'missing'}`,
    blockedReasons,
  );
}

function verifyActionInstitutionalEffect(value: unknown, payload: Record<string, unknown>, blockedReasons: string[]) {
  const actionKey = stringValue(payload.actionKey);
  const expected = createBusinessActionInstitutionalEffectProfile({
    actionKey,
    preconditions: stringArray(payload.preconditions),
  });
  if (!expected) {
    if (value !== undefined && value !== null) {
      blockedReasons.push(`action_institutional_effect_unexpected:${actionKey || 'missing'}`);
    }
    return;
  }
  const profile = recordValue(value);
  if (
    !hasOnlyKeys(profile, [
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
    ]) ||
    canonicalizeBusinessDefinition(profile) !== canonicalizeBusinessDefinition(expected)
  ) {
    blockedReasons.push(`action_institutional_effect_invalid:${actionKey || 'missing'}`);
  }
}

function verifyActionModalityPolicy(value: unknown, payload: Record<string, unknown>, blockedReasons: string[]) {
  const policy = recordValue(value);
  const actionKey = stringValue(payload.actionKey);
  const supportedModalities = stringArray(policy.supportedModalities);
  if (
    policy.schemaVersion !== '1.0' ||
    stringValue(policy.policyKey) !== `${actionKey}.speech_act_modality` ||
    supportedModalities.length !== 1 ||
    supportedModalities[0] !== 'request' ||
    policy.unsupportedModalityPolicy !== 'fail_closed' ||
    policy.confirmationReferencePolicy !== 'existing_confirmation_required' ||
    policy.schedulePolicy !== 'action_plan_required' ||
    policy.cancellationReferencePolicy !== 'existing_preview_or_plan_required'
  ) {
    blockedReasons.push(`action_modality_policy_invalid:${actionKey || 'missing'}`);
  }
  verifyActionProfileFingerprint(
    policy,
    `action_modality_policy_fingerprint_invalid:${actionKey || 'missing'}`,
    blockedReasons,
  );
}

function verifyActionInformationArtifact(value: unknown, payload: Record<string, unknown>, blockedReasons: string[]) {
  const profile = recordValue(value);
  const actionKey = stringValue(payload.actionKey);
  if (
    profile.schemaVersion !== '1.0' ||
    stringValue(profile.profileKey) !== `${actionKey}.information_artifact` ||
    profile.referencePolicy !== 'bind_if_present' ||
    profile.artifactTypePolicy !== 'governed_result_reference' ||
    profile.sourcePolicy !== 'completed_brain_run_same_conversation_store_user' ||
    profile.versionPolicy !== 'source_run_and_capability_version' ||
    profile.contentIntegrityPolicy !== 'canonical_content_fingerprint' ||
    profile.supersessionPolicy !== 'explicit_new_reference_only'
  ) {
    blockedReasons.push(`action_information_artifact_invalid:${actionKey || 'missing'}`);
  }
  verifyActionProfileFingerprint(
    profile,
    `action_information_artifact_fingerprint_invalid:${actionKey || 'missing'}`,
    blockedReasons,
  );
}

function verifyActionSideEffectInvariant(value: unknown, payload: Record<string, unknown>, blockedReasons: string[]) {
  const profile = recordValue(value);
  const actionKey = stringValue(payload.actionKey);
  const expectedGuardContractFingerprint = createHash('sha256')
    .update(
      canonicalizeBusinessDefinition({
        actionKey,
        preconditions: [...new Set(stringArray(payload.preconditions))].sort(),
        predicateRefs: semanticContractRefRecords(payload.preconditionPredicateRefs).sort((left, right) =>
          left.key.localeCompare(right.key),
        ),
      }),
    )
    .digest('hex');
  const expectedEffectContractFingerprint = createHash('sha256')
    .update(
      canonicalizeBusinessDefinition({
        actionKey,
        effects: [...new Set(stringArray(payload.effects))].sort(),
        effectRefs: semanticContractRefRecords(payload.effectAssertionRefs).sort((left, right) =>
          left.key.localeCompare(right.key),
        ),
      }),
    )
    .digest('hex');
  if (
    !hasOnlyKeys(profile, [
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
    ]) ||
    profile.schemaVersion !== '1.2' ||
    stringValue(profile.profileKey) !== `${actionKey}.side_effect_invariant` ||
    profile.guardContractFingerprint !== expectedGuardContractFingerprint ||
    profile.effectContractFingerprint !== expectedEffectContractFingerprint ||
    !validActionInvariantContractRef(profile.invariantContractRef, actionKey) ||
    profile.undeclaredSideEffectPolicy !== 'forbid' ||
    profile.gatewayEffectPolicy !== 'exact_declared_effect_match' ||
    profile.mutationFootprintEvidencePolicy !== 'exact_database_trigger_observed_write_set' ||
    profile.successEvidencePolicy !== 'all_declared_effects_observed' ||
    profile.partialSuccessPolicy !== 'explicit_partially_succeeded' ||
    profile.recoveryPolicy !== 'gateway_declared_strategy_only' ||
    profile.compensationPolicy !== 'explicit_compensation_action_required' ||
    profile.outcomeObservationPolicy !== 'required_for_async_effects'
  ) {
    blockedReasons.push(`action_side_effect_invariant_invalid:${actionKey || 'missing'}`);
  }
  verifyActionProfileFingerprint(
    profile,
    `action_side_effect_invariant_fingerprint_invalid:${actionKey || 'missing'}`,
    blockedReasons,
  );
}

function validActionInvariantContractRef(value: unknown, actionKey: string) {
  const ref = recordValue(value);
  if (!hasOnlyKeys(ref, ['key', 'version', 'fingerprint'])) return false;
  const contract = resolveCuratedActionInvariantContract({
    key: stringValue(ref.key),
    version: Number(ref.version),
    fingerprint: stringValue(ref.fingerprint),
  });
  return Boolean(contract && contract.actionKey === actionKey);
}

function verifyActionProfileFingerprint(profile: Record<string, unknown>, reason: string, blockedReasons: string[]) {
  const fingerprint = stringValue(profile.fingerprint);
  const fingerprintInput = { ...profile };
  delete fingerprintInput.fingerprint;
  const expectedFingerprint = createHash('sha256')
    .update(canonicalizeBusinessDefinition(fingerprintInput))
    .digest('hex');
  if (!/^[0-9a-f]{64}$/u.test(fingerprint) || fingerprint !== expectedFingerprint) blockedReasons.push(reason);
}

function verifyActionSituationContext(value: unknown, payload: Record<string, unknown>, blockedReasons: string[]) {
  const profile = recordValue(value);
  const actionKey = stringValue(payload.actionKey);
  if (
    profile.schemaVersion !== '1.0' ||
    stringValue(profile.profileKey) !== `${actionKey}.situation_context` ||
    profile.tenantBoundary !== 'current_store' ||
    profile.requestChannelPolicy !== 'bind_if_present' ||
    profile.devicePolicy !== 'bind_if_present' ||
    profile.conversationPolicy !== 'same_conversation'
  ) {
    blockedReasons.push(`action_situation_context_identity_invalid:${actionKey || 'missing'}`);
  }
  const businessTimePolicy = recordValue(profile.businessTimePolicy);
  if (
    businessTimePolicy.timezone !== 'Asia/Shanghai' ||
    businessTimePolicy.businessDatePolicy !== 'same_business_date' ||
    businessTimePolicy.clockSource !== 'server'
  ) {
    blockedReasons.push(`action_situation_business_time_policy_invalid:${actionKey || 'missing'}`);
  }
  const actorPolicy = recordValue(profile.actorPolicy);
  if (
    actorPolicy.subjectPolicy !== 'same_authenticated_user' ||
    actorPolicy.qualificationPolicy !== 'revalidate_current_role_and_permission'
  ) {
    blockedReasons.push(`action_situation_actor_policy_invalid:${actionKey || 'missing'}`);
  }
  const fingerprint = stringValue(profile.fingerprint);
  const fingerprintInput = { ...profile };
  delete fingerprintInput.fingerprint;
  const expectedFingerprint = createHash('sha256')
    .update(canonicalizeBusinessDefinition(fingerprintInput))
    .digest('hex');
  if (!/^[0-9a-f]{64}$/u.test(fingerprint) || fingerprint !== expectedFingerprint) {
    blockedReasons.push(`action_situation_context_fingerprint_invalid:${actionKey || 'missing'}`);
  }
}

function verifyActionLexicalFrame(
  value: unknown,
  payload: Record<string, unknown>,
  catalog: CuratedActionCatalogEntry,
  blockedReasons: string[],
) {
  const frame = recordValue(value);
  const actionKey = stringValue(payload.actionKey);
  if (frame.schemaVersion !== '1.0') blockedReasons.push('action_lexical_frame_schema_version_invalid');
  if (stringValue(frame.frameKey) !== `${actionKey}.lexical_frame`) {
    blockedReasons.push(`action_lexical_frame_key_invalid:${actionKey || 'missing'}`);
  }
  const lexicalUnits = stringArray(frame.lexicalUnits);
  const expectedLexicalUnits = [catalog.identity.name, ...stringArray(payload.aliases)];
  if (!lexicalUnits.length || expectedLexicalUnits.some((item) => !lexicalUnits.includes(item))) {
    blockedReasons.push(`action_lexical_units_incomplete:${actionKey || 'missing'}`);
  }

  const slots = Array.isArray(payload.inputSlots) ? payload.inputSlots.map(recordValue) : [];
  const slotsByKey = new Map(slots.map((slot) => [stringValue(slot.slotKey), stringValue(slot.semanticRole)]));
  const coveredSlots = new Set<string>();
  if (!Array.isArray(frame.thematicRoles)) {
    blockedReasons.push('action_lexical_thematic_roles_must_be_an_array');
  } else {
    for (const item of frame.thematicRoles) {
      const role = recordValue(item);
      const semanticRole = stringValue(role.semanticRole);
      const slotKeys = stringArray(role.slotKeys);
      if (!ACTION_SEMANTIC_ROLES.has(semanticRole) || !slotKeys.length) {
        blockedReasons.push(`action_lexical_thematic_role_invalid:${semanticRole || 'missing'}`);
      }
      for (const slotKey of slotKeys) {
        if (slotsByKey.get(slotKey) !== semanticRole || coveredSlots.has(slotKey)) {
          blockedReasons.push(`action_lexical_thematic_role_slot_invalid:${slotKey || 'missing'}`);
        }
        coveredSlots.add(slotKey);
      }
    }
  }
  if (coveredSlots.size !== slotsByKey.size) {
    blockedReasons.push(`action_lexical_thematic_roles_incomplete:${actionKey || 'missing'}`);
  }

  if (!stringArray(frame.semanticPredicates).length) {
    blockedReasons.push(`action_lexical_semantic_predicates_empty:${actionKey || 'missing'}`);
  } else {
    blockedReasons.push(
      ...validateBusinessActionSemanticPredicates(stringArray(frame.semanticPredicates), {
        actionKey,
        actionClass: stringValue(payload.actionClass) as BusinessActionClass,
        targetEntityRefs: stringArray(payload.targetEntityRefs),
        preconditions: stringArray(payload.preconditions),
        effects: stringArray(payload.effects),
      }),
    );
  }
  if (!Array.isArray(frame.contrasts) || !frame.contrasts.length) {
    blockedReasons.push(`action_lexical_contrasts_empty:${actionKey || 'missing'}`);
  } else {
    const contrastKeys = new Set<string>();
    for (const item of frame.contrasts) {
      const contrast = recordValue(item);
      const conceptKey = stringValue(contrast.conceptKey);
      if (
        !/^(?:action|speech)\.[a-z][a-z0-9_]*$/u.test(conceptKey) ||
        conceptKey === actionKey ||
        contrastKeys.has(conceptKey) ||
        !stringValue(contrast.name)
      ) {
        blockedReasons.push(`action_lexical_contrast_invalid:${conceptKey || 'missing'}`);
      }
      contrastKeys.add(conceptKey);
      if (!Array.isArray(contrast.discriminators) || !contrast.discriminators.length) {
        blockedReasons.push(`action_lexical_contrast_discriminators_empty:${conceptKey || 'missing'}`);
        continue;
      }
      for (const entry of contrast.discriminators) {
        const discriminator = recordValue(entry);
        const dimension = stringValue(discriminator.dimension);
        if (
          !ACTION_LEXICAL_DISCRIMINATOR_DIMENSIONS.has(dimension) ||
          !stringValue(discriminator.currentActionValue) ||
          !stringValue(discriminator.contrastActionValue)
        ) {
          blockedReasons.push(
            `action_lexical_discriminator_invalid:${conceptKey || 'missing'}:${dimension || 'missing'}`,
          );
        }
      }
    }
  }

  const fingerprint = stringValue(frame.fingerprint);
  const fingerprintInput = { ...frame };
  delete fingerprintInput.fingerprint;
  const expectedFingerprint = createHash('sha256')
    .update(canonicalizeBusinessDefinition(fingerprintInput))
    .digest('hex');
  if (!/^[0-9a-f]{64}$/u.test(fingerprint) || fingerprint !== expectedFingerprint) {
    blockedReasons.push(`action_lexical_frame_fingerprint_invalid:${actionKey || 'missing'}`);
  }
}

function verifyActionSemanticContractRefs(
  keysValue: unknown,
  refsValue: unknown,
  kind: 'predicate' | 'effect',
  blockedReasons: string[],
) {
  const keys = stringArray(keysValue);
  if (!Array.isArray(refsValue)) {
    blockedReasons.push(`action_${kind}_refs_must_be_an_array`);
    return;
  }
  const refs = refsValue.map((item) => {
    const ref = recordValue(item);
    return {
      key: stringValue(ref.key),
      version: Number(ref.version),
      fingerprint: stringValue(ref.fingerprint),
    };
  });
  if (JSON.stringify(refs.map((item) => item.key)) !== JSON.stringify(keys)) {
    blockedReasons.push(`action_${kind}_ref_set_mismatch`);
  }
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!ref.key) {
      blockedReasons.push(`action_${kind}_ref_key_missing`);
      continue;
    }
    if (seen.has(ref.key)) blockedReasons.push(`action_${kind}_ref_duplicate:${ref.key}`);
    seen.add(ref.key);
    if (!Number.isInteger(ref.version) || ref.version <= 0) {
      blockedReasons.push(`action_${kind}_ref_version_invalid:${ref.key}`);
      continue;
    }
    if (!/^[0-9a-f]{64}$/u.test(ref.fingerprint)) {
      blockedReasons.push(`action_${kind}_ref_fingerprint_invalid:${ref.key}`);
      continue;
    }
    const contractRef = ref as CuratedActionSemanticContractRef;
    const resolved =
      kind === 'predicate'
        ? resolveCuratedActionPredicateContract(contractRef)
        : resolveCuratedActionEffectContract(contractRef);
    if (!resolved) blockedReasons.push(`action_${kind}_contract_unresolved:${ref.key}`);
  }
}

function verifyActionSlots(
  value: unknown,
  catalog: CuratedActionCatalogEntry,
  models: Map<string, PrismaModelAst>,
  resolveStoreScope: (modelName: string) => boolean,
  blockedReasons: string[],
) {
  if (!Array.isArray(value)) {
    blockedReasons.push('action_input_slots_must_be_an_array');
    return;
  }
  const seen = new Set<string>();
  for (const item of value) {
    const slot = recordValue(item);
    const slotKey = stringValue(slot.slotKey);
    if (!/^[a-z][a-zA-Z0-9_]{0,63}$/.test(slotKey))
      blockedReasons.push(`action_slot_key_invalid:${slotKey || 'missing'}`);
    else if (seen.has(slotKey)) blockedReasons.push(`action_slot_duplicate:${slotKey}`);
    seen.add(slotKey);

    const semanticRole = stringValue(slot.semanticRole);
    if (!ACTION_SEMANTIC_ROLES.has(semanticRole)) {
      blockedReasons.push(`action_slot_semantic_role_invalid:${slotKey || 'missing'}:${semanticRole || 'missing'}`);
    }
    const valueType = stringValue(slot.valueType);
    if (!ACTION_SLOT_VALUE_TYPES.has(valueType)) {
      blockedReasons.push(`action_slot_value_type_invalid:${slotKey || 'missing'}:${valueType || 'missing'}`);
    }
    const requiredAt = stringArray(slot.requiredAt);
    if (requiredAt.some((stage) => !ACTION_REQUIRED_STAGES.has(stage))) {
      blockedReasons.push(`action_slot_required_stage_invalid:${slotKey || 'missing'}`);
    }
    if (slot.cardinality !== 'one' && slot.cardinality !== 'many') {
      blockedReasons.push(`action_slot_cardinality_invalid:${slotKey || 'missing'}`);
    }
    if (typeof slot.sensitive !== 'boolean')
      blockedReasons.push(`action_slot_sensitive_invalid:${slotKey || 'missing'}`);
    if (typeof slot.confirmationDisplay !== 'boolean') {
      blockedReasons.push(`action_slot_confirmation_display_invalid:${slotKey || 'missing'}`);
    }
    const entityTypeRef = stringValue(slot.entityTypeRef);
    if (valueType === 'entity_ref') {
      if (!entityTypeRef) blockedReasons.push(`action_slot_entity_ref_missing:${slotKey || 'missing'}`);
      else verifyActionEntityRef(entityTypeRef, catalog, models, resolveStoreScope, blockedReasons);
    } else if (entityTypeRef) {
      blockedReasons.push(`action_slot_entity_ref_not_allowed:${slotKey || 'missing'}`);
    }
  }
}

function verifyActionBindings(value: unknown, blockedReasons: string[]) {
  if (!Array.isArray(value)) {
    blockedReasons.push('action_capability_bindings_must_be_an_array');
    return;
  }
  const seen = new Set<string>();
  let enabled = 0;
  for (const item of value) {
    const binding = recordValue(item);
    const capabilityKey = stringValue(binding.capabilityKey);
    if (!capabilityKey) blockedReasons.push('action_binding_capability_key_missing');
    else if (seen.has(capabilityKey)) blockedReasons.push(`action_binding_duplicate:${capabilityKey}`);
    seen.add(capabilityKey);
    const mode = stringValue(binding.bindingMode);
    if (!ACTION_BINDING_MODES.has(mode)) blockedReasons.push(`action_binding_mode_invalid:${mode || 'missing'}`);
    const gatewayActionKey = stringValue(binding.gatewayActionKey);
    if (mode !== 'preview_only' && !gatewayActionKey) {
      blockedReasons.push(`action_binding_gateway_key_missing:${capabilityKey || 'missing'}`);
    }
    if (!Number.isInteger(binding.priority) || Number(binding.priority) < 0) {
      blockedReasons.push(`action_binding_priority_invalid:${capabilityKey || 'missing'}`);
    }
    if (typeof binding.enabled !== 'boolean') {
      blockedReasons.push(`action_binding_enabled_invalid:${capabilityKey || 'missing'}`);
    } else if (binding.enabled) enabled += 1;
  }
  if (!enabled) blockedReasons.push('action_capability_bindings_have_no_enabled_binding');
}

function verifyActionEntityRef(
  entityRef: string,
  catalog: CuratedActionCatalogEntry,
  models: Map<string, PrismaModelAst>,
  resolveStoreScope: (modelName: string) => boolean,
  blockedReasons: string[],
) {
  const modelName = catalog.entityModels[entityRef];
  if (!modelName) {
    blockedReasons.push(`action_entity_ref_not_governed:${entityRef}`);
    return;
  }
  if (!models.has(modelName)) {
    blockedReasons.push(`action_entity_model_missing:${entityRef}:${modelName}`);
    return;
  }
  if (catalog.storeScope.mode === 'current_store' && !resolveStoreScope(modelName)) {
    blockedReasons.push(`action_entity_store_scope_missing:${entityRef}:${modelName}`);
  }
}

function verifyActionEvidence(
  evidence: BusinessDefinitionCandidateEvidence[],
  catalog: CuratedActionCatalogEntry,
  sourcePaths: ReadonlySet<string> | undefined,
  sourceFiles: ReadonlyMap<string, string> | undefined,
  blockedReasons: string[],
) {
  for (const requiredKind of ACTION_REQUIRED_EVIDENCE_KINDS) {
    if (!evidence.some((item) => item.evidenceKind === requiredKind && item.confidence === 1)) {
      blockedReasons.push(`action_evidence_missing:${requiredKind}`);
    }
  }
  const requiredModels = new Set(Object.values(catalog.entityModels));
  const evidencedModels = new Set(
    evidence
      .filter((item) => item.evidenceKind === 'business_data_model')
      .map((item) => item.sourceSymbol)
      .filter((item): item is string => Boolean(item)),
  );
  for (const model of requiredModels) {
    if (!evidencedModels.has(model)) blockedReasons.push(`action_data_model_evidence_missing:${model}`);
  }
  const availablePaths = sourceFiles ? new Set(sourceFiles.keys()) : sourcePaths;
  if (!availablePaths) {
    blockedReasons.push('action_source_file_context_missing');
    return;
  }
  for (const item of catalog.evidence) {
    if (item.sourcePath === PRISMA_SCHEMA_PATH) continue;
    if (!availablePaths.has(item.sourcePath))
      blockedReasons.push(`action_evidence_source_path_missing:${item.sourcePath}`);
  }
  if (!sourceFiles) {
    blockedReasons.push('action_source_file_context_missing');
    return;
  }

  const sourceFileCache = new Map<string, ts.SourceFile>();
  const sourceFile = (path: string) => {
    const cached = sourceFileCache.get(path);
    if (cached) return cached;
    const content = sourceFiles.get(path);
    if (content === undefined) return undefined;
    const parsed = ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    sourceFileCache.set(path, parsed);
    return parsed;
  };

  verifyActionCatalogDeclaration(catalog, sourceFile, blockedReasons);
  verifyActionProductEntry(catalog, sourceFile, blockedReasons);
  verifyActionBackendContract(catalog, sourceFile, blockedReasons);
  verifyActionCapabilityContract(catalog, sourceFile, blockedReasons);
  verifyActionGatewayContract(catalog, sourceFile, blockedReasons);
  verifyActionPredicateEffectSourceContracts(catalog, sourceFile, blockedReasons);
  verifyActionSituationContextSourceContracts(catalog, sourceFile, blockedReasons);
  verifyActionOntologyProfileSourceContracts(catalog, sourceFile, blockedReasons);
  verifyActionInvariantCatalogSourceContract(catalog, sourceFile, blockedReasons);
}

type ActionSourceFileLoader = (path: string) => ts.SourceFile | undefined;

function verifyActionCatalogDeclaration(
  catalog: CuratedActionCatalogEntry,
  sourceFile: ActionSourceFileLoader,
  blockedReasons: string[],
) {
  const evidence = findActionEvidence(catalog, 'action_catalog_declaration');
  if (!evidence) return;
  const source = sourceFile(evidence.sourcePath);
  if (!source || !hasActionCatalogDeclaration(source, catalog.identity.definitionKey)) {
    blockedReasons.push(`action_catalog_declaration_missing:${catalog.identity.definitionKey}`);
  }
}

function verifyActionProductEntry(
  catalog: CuratedActionCatalogEntry,
  sourceFile: ActionSourceFileLoader,
  blockedReasons: string[],
) {
  const evidence = findActionEvidence(catalog, 'product_management_entry');
  if (!evidence?.sourceSymbol) return;
  const source = sourceFile(evidence.sourcePath);
  const importedSymbol = symbolMember(evidence.sourceSymbol);
  if (!source || !importedSymbol || !hasImportedCall(source, importedSymbol)) {
    blockedReasons.push(`action_product_entry_call_missing:${evidence.sourcePath}:${importedSymbol || 'missing'}`);
  }
}

function verifyActionBackendContract(
  catalog: CuratedActionCatalogEntry,
  sourceFile: ActionSourceFileLoader,
  blockedReasons: string[],
) {
  const apiEvidence = findActionEvidence(catalog, 'backend_api_contract');
  const permissionEvidence = findActionEvidence(catalog, 'backend_permission_contract');
  if (!apiEvidence?.sourceSymbol) return;
  const source = sourceFile(apiEvidence.sourcePath);
  const method = source ? findClassMethod(source, apiEvidence.sourceSymbol) : undefined;
  if (!method) {
    blockedReasons.push(`action_backend_method_missing:${apiEvidence.sourceSymbol}`);
    return;
  }
  const expectedPermission = catalog.permissionContract.backendApi;
  if (!permissionEvidence || !decoratorStringValues(method, 'Permissions').includes(expectedPermission)) {
    blockedReasons.push(`action_backend_permission_mismatch:${apiEvidence.sourceSymbol}:${expectedPermission}`);
  }
}

function verifyActionCapabilityContract(
  catalog: CuratedActionCatalogEntry,
  sourceFile: ActionSourceFileLoader,
  blockedReasons: string[],
) {
  const bindingEvidence = findActionEvidence(catalog, 'capability_binding_contract');
  const permissionEvidence = findActionEvidence(catalog, 'capability_permission_contract');
  if (!bindingEvidence?.sourceSymbol) return;
  const source = sourceFile(bindingEvidence.sourcePath);
  const method = source ? findClassMethod(source, bindingEvidence.sourceSymbol) : undefined;
  if (!method) {
    blockedReasons.push(`action_capability_method_missing:${bindingEvidence.sourceSymbol}`);
    return;
  }
  const decorator = decoratorObject(method, 'BrainCapability');
  const binding = enabledActionBinding(catalog);
  const expectedCapabilityKey = stringValue(binding?.capabilityKey);
  if (!decorator || objectStringValue(decorator, 'key') !== expectedCapabilityKey) {
    blockedReasons.push(
      `action_capability_key_mismatch:${bindingEvidence.sourceSymbol}:${expectedCapabilityKey || 'missing'}`,
    );
  }
  const expectedPermission = catalog.permissionContract.capability;
  if (!permissionEvidence || !objectStringArray(decorator, 'permissions').includes(expectedPermission)) {
    blockedReasons.push(`action_capability_permission_mismatch:${bindingEvidence.sourceSymbol}:${expectedPermission}`);
  }
}

function verifyActionGatewayContract(
  catalog: CuratedActionCatalogEntry,
  sourceFile: ActionSourceFileLoader,
  blockedReasons: string[],
) {
  const executionEvidence = findActionEvidence(catalog, 'gateway_execution_contract');
  const permissionEvidence = findActionEvidence(catalog, 'gateway_permission_contract');
  if (!executionEvidence) return;
  const source = sourceFile(executionEvidence.sourcePath);
  const binding = enabledActionBinding(catalog);
  const gatewayActionKey = stringValue(binding?.gatewayActionKey);
  const descriptor =
    source && gatewayActionKey ? findObjectMapEntry(source, 'CAPABILITY_MAP', gatewayActionKey) : undefined;
  if (!descriptor) {
    blockedReasons.push(`action_gateway_key_missing:${gatewayActionKey || 'missing'}`);
    return;
  }
  const expectedPermission = catalog.permissionContract.gateway;
  if (!permissionEvidence || objectStringValue(descriptor, 'permission') !== expectedPermission) {
    blockedReasons.push(`action_gateway_permission_mismatch:${gatewayActionKey}:${expectedPermission}`);
  }
  const expectedEffects = stringArray(catalog.payload.effects).sort();
  const gatewayEffects = objectStringArray(descriptor, 'effectKeys').sort();
  if (!sameValues(gatewayEffects, expectedEffects)) {
    blockedReasons.push(`action_gateway_effect_contract_mismatch:${gatewayActionKey}`);
  }
}

function verifyActionPredicateEffectSourceContracts(
  catalog: CuratedActionCatalogEntry,
  sourceFile: ActionSourceFileLoader,
  blockedReasons: string[],
) {
  for (const [evidenceKind, blocker] of [
    ['action_predicate_evaluator_contract', 'action_predicate_evaluator_method_missing'],
    ['action_effect_observer_contract', 'action_effect_observer_method_missing'],
  ] as const) {
    const evidence = findActionEvidence(catalog, evidenceKind);
    if (!evidence?.sourceSymbol) continue;
    const source = sourceFile(evidence.sourcePath);
    if (!source || !findClassMethod(source, evidence.sourceSymbol)) {
      blockedReasons.push(`${blocker}:${evidence.sourceSymbol}`);
    }
  }
}

function verifyActionSituationContextSourceContracts(
  catalog: CuratedActionCatalogEntry,
  sourceFile: ActionSourceFileLoader,
  blockedReasons: string[],
) {
  for (const [evidenceKind, blocker] of [
    ['action_situation_context_profile_contract', 'action_situation_context_profile_function_missing'],
    ['action_situation_context_execution_gate', 'action_situation_context_revalidation_function_missing'],
  ] as const) {
    const evidence = findActionEvidence(catalog, evidenceKind);
    if (!evidence?.sourceSymbol) continue;
    const source = sourceFile(evidence.sourcePath);
    if (!source || !hasTopLevelFunction(source, evidence.sourceSymbol)) {
      blockedReasons.push(`${blocker}:${evidence.sourceSymbol}`);
    }
  }
}

function verifyActionOntologyProfileSourceContracts(
  catalog: CuratedActionCatalogEntry,
  sourceFile: ActionSourceFileLoader,
  blockedReasons: string[],
) {
  for (const [evidenceKind, blocker] of [
    ['action_modality_policy_contract', 'action_modality_policy_function_missing'],
    ['action_information_artifact_profile_contract', 'action_information_artifact_profile_function_missing'],
    ['action_side_effect_invariant_profile_contract', 'action_side_effect_invariant_profile_function_missing'],
    ['action_institutional_effect_profile_contract', 'action_institutional_effect_profile_function_missing'],
  ] as const) {
    const evidence = findActionEvidence(catalog, evidenceKind);
    if (!evidence?.sourceSymbol) continue;
    const source = sourceFile(evidence.sourcePath);
    if (!source || !hasTopLevelFunction(source, evidence.sourceSymbol)) {
      blockedReasons.push(`${blocker}:${evidence.sourceSymbol}`);
    }
  }
}

function verifyActionInvariantCatalogSourceContract(
  catalog: CuratedActionCatalogEntry,
  sourceFile: ActionSourceFileLoader,
  blockedReasons: string[],
) {
  const evidence = findActionEvidence(catalog, 'action_invariant_catalog_contract');
  if (!evidence?.sourceSymbol) return;
  const source = sourceFile(evidence.sourcePath);
  if (!source || !hasTopLevelFunction(source, evidence.sourceSymbol)) {
    blockedReasons.push(`action_invariant_catalog_function_missing:${evidence.sourceSymbol}`);
  }
}

function semanticContractRefRecords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const ref = recordValue(item);
    return {
      key: stringValue(ref.key),
      version: Number(ref.version),
      fingerprint: stringValue(ref.fingerprint),
    };
  });
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasTopLevelFunction(source: ts.SourceFile, name: string) {
  return source.statements.some((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
}

function findActionEvidence(catalog: CuratedActionCatalogEntry, evidenceKind: string) {
  return catalog.evidence.find((item) => item.evidenceKind === evidenceKind);
}

function enabledActionBinding(catalog: CuratedActionCatalogEntry) {
  const bindings = Array.isArray(catalog.payload.capabilityBindings) ? catalog.payload.capabilityBindings : [];
  return bindings.map(recordValue).find((binding) => binding.enabled === true);
}

function symbolMember(symbol: string) {
  const index = symbol.lastIndexOf('.');
  return index >= 0 ? symbol.slice(index + 1) : symbol;
}

function hasActionCatalogDeclaration(source: ts.SourceFile, actionKey: string) {
  let found = false;
  visit(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'action' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0]) &&
      objectStringValue(node.arguments[0], 'actionKey') === actionKey
    ) {
      found = true;
    }
  });
  return found;
}

function hasImportedCall(source: ts.SourceFile, importedSymbol: string) {
  const localNames = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === importedSymbol) localNames.add(element.name.text);
    }
  }
  if (!localNames.size) return false;
  let called = false;
  visit(source, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && localNames.has(node.expression.text)) {
      called = true;
    }
  });
  return called;
}

function findClassMethod(source: ts.SourceFile, sourceSymbol: string) {
  const [className, methodName] = sourceSymbol.split('.');
  if (!className || !methodName) return undefined;
  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement) || statement.name?.text !== className) continue;
    return statement.members.find(
      (member): member is ts.MethodDeclaration =>
        ts.isMethodDeclaration(member) && propertyNameText(member.name) === methodName,
    );
  }
  return undefined;
}

function decoratorStringValues(method: ts.MethodDeclaration, decoratorName: string) {
  const call = decoratorCall(method, decoratorName);
  return call ? call.arguments.flatMap((argument) => (ts.isStringLiteralLike(argument) ? [argument.text] : [])) : [];
}

function decoratorObject(method: ts.MethodDeclaration, decoratorName: string) {
  const call = decoratorCall(method, decoratorName);
  const argument = call?.arguments[0];
  return argument && ts.isObjectLiteralExpression(argument) ? argument : undefined;
}

function decoratorCall(method: ts.MethodDeclaration, decoratorName: string) {
  const decorators = ts.canHaveDecorators(method) ? (ts.getDecorators(method) ?? []) : [];
  for (const decorator of decorators) {
    if (!ts.isCallExpression(decorator.expression)) continue;
    const expression = decorator.expression.expression;
    if (ts.isIdentifier(expression) && expression.text === decoratorName) return decorator.expression;
  }
  return undefined;
}

function findObjectMapEntry(source: ts.SourceFile, variableName: string, entryKey: string) {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== variableName) continue;
      if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      const property = declaration.initializer.properties.find(
        (item): item is ts.PropertyAssignment =>
          ts.isPropertyAssignment(item) && propertyNameText(item.name) === entryKey,
      );
      return property?.initializer && ts.isObjectLiteralExpression(property.initializer)
        ? property.initializer
        : undefined;
    }
  }
  return undefined;
}

function objectStringValue(object: ts.ObjectLiteralExpression | undefined, propertyName: string) {
  if (!object) return '';
  const property = object.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) && propertyNameText(item.name) === propertyName,
  );
  return property?.initializer && ts.isStringLiteralLike(property.initializer) ? property.initializer.text : '';
}

function objectStringArray(object: ts.ObjectLiteralExpression | undefined, propertyName: string) {
  if (!object) return [];
  const property = object.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) && propertyNameText(item.name) === propertyName,
  );
  return property?.initializer && ts.isArrayLiteralExpression(property.initializer)
    ? property.initializer.elements.flatMap((item) => (ts.isStringLiteralLike(item) ? [item.text] : []))
    : [];
}

function propertyNameText(name: ts.PropertyName) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : '';
}

function visit(root: ts.Node, visitor: (node: ts.Node) => void) {
  const walk = (node: ts.Node) => {
    visitor(node);
    ts.forEachChild(node, walk);
  };
  walk(root);
}

const ACTION_CLASSES = new Set([
  'create',
  'update',
  'transition',
  'delete',
  'approve',
  'notify',
  'consume',
  'reserve',
  'execute',
]);
const ACTION_RISK_POLICIES = new Set(['low', 'medium', 'high', 'critical']);
const ACTION_CONFIRMATION_POLICIES = new Set(['none', 'required', 'conditional']);
const ACTION_SEMANTIC_ROLES = new Set([
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
const ACTION_SLOT_VALUE_TYPES = new Set(['entity_ref', 'number', 'money', 'enum', 'text', 'time', 'boolean']);
const ACTION_REQUIRED_STAGES = new Set(['recognition', 'preview', 'execution']);
const ACTION_BINDING_MODES = new Set(['preview_only', 'preview_and_execute', 'execute_only']);
const ACTION_LEXICAL_DISCRIMINATOR_DIMENSIONS = new Set([
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
const ACTION_REQUIRED_EVIDENCE_KINDS = [
  'action_catalog_declaration',
  'product_management_entry',
  'backend_api_contract',
  'backend_permission_contract',
  'business_data_model',
  'capability_binding_contract',
  'capability_permission_contract',
  'gateway_execution_contract',
  'gateway_permission_contract',
  'action_predicate_evaluator_contract',
  'action_effect_observer_contract',
  'action_situation_context_profile_contract',
  'action_situation_context_execution_gate',
  'action_invariant_catalog_contract',
  'action_participant_profile_contract',
  'action_relation_profile_contract',
  'action_relation_catalog_contract',
] as const;

const ACTION_PARTICIPANT_ROLES = new Set([
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
const ACTION_PARTICIPANT_SOURCES = new Set([
  'authenticated_user',
  'confirmation_actor',
  'gateway_executor',
  'action_slot',
  'workflow_assignment',
]);
const ACTION_PARTICIPANT_QUALIFICATION_POLICIES = new Set([
  'same_authenticated_user',
  'revalidate_current_role_and_permission',
  'released_gateway_binding',
  'resolved_same_store_business_subject',
  'explicit_workflow_assignment',
]);
const ACTION_PARTICIPANT_RUNTIME_VISIBILITIES = new Set(['model_visible', 'validator_only', 'execution_only']);

function validParticipantBindingSource(role: string, source: string) {
  const fixedSources: Record<string, string> = {
    requester: 'authenticated_user',
    authorizer: 'confirmation_actor',
    performer: 'gateway_executor',
    accountable_party: 'confirmation_actor',
  };
  return fixedSources[role]
    ? fixedSources[role] === source
    : source === 'action_slot' || source === 'workflow_assignment';
}

function verifyCanonicalIdentity(
  candidate: BusinessDefinitionCandidateDraft,
  identity: CanonicalOntologyCandidateIdentity,
  blockedReasons: string[],
) {
  if (candidate.definitionKey !== identity.definitionKey) {
    blockedReasons.push(`identity_definition_key_mismatch:${identity.definitionKey}`);
  }
  if (candidate.domain !== identity.domain) blockedReasons.push(`identity_domain_mismatch:${identity.domain}`);
  if (candidate.name !== identity.name) blockedReasons.push(`identity_name_mismatch:${identity.name}`);
  if (candidate.ownerType !== identity.ownerType) {
    blockedReasons.push(`identity_owner_type_mismatch:${identity.ownerType}`);
  }
  if (candidate.ownerId !== identity.ownerId) {
    blockedReasons.push(`identity_owner_id_mismatch:${identity.ownerId}`);
  }
  if (candidate.schemaVersion !== identity.schemaVersion) {
    blockedReasons.push(`identity_schema_version_mismatch:${identity.schemaVersion}`);
  }
  if (candidate.canonicalQueryRef !== undefined) blockedReasons.push('canonical_query_ref_not_allowed');
  if (candidate.fixtureSetKey !== undefined) blockedReasons.push('fixture_set_key_not_allowed');
}

function verifyStructuralEvidence(
  evidence: BusinessDefinitionCandidateEvidence[],
  expectedSymbol: string,
  sourcePath: string | undefined,
  blockedReasons: string[],
) {
  const structural = evidence.filter(isStructuralEvidence);
  if (!structural.length) return;
  const expectedPath = sourcePath ?? PRISMA_SCHEMA_PATH;
  if (structural.some((item) => item.sourceSymbol !== expectedSymbol)) {
    blockedReasons.push(`structural_evidence_symbol_mismatch:${expectedSymbol}`);
  }
  if (structural.some((item) => item.sourcePath !== expectedPath)) {
    blockedReasons.push(`structural_evidence_path_mismatch:${expectedPath}`);
  }
}

function verifyFieldContract(
  candidate: BusinessDefinitionCandidateDraft,
  modelName: string,
  field: PrismaFieldAst,
  enums: Map<string, string[]>,
  blockedReasons: string[],
) {
  const symbol = `${modelName}.${field.name}`;
  if (candidate.payload.scalarType !== field.type)
    blockedReasons.push(`field_scalar_type_mismatch:${symbol}:${field.type}`);
  if (candidate.payload.required !== Boolean(field.isRequired)) {
    blockedReasons.push(`field_required_mismatch:${symbol}:${Boolean(field.isRequired)}`);
  }
  if (candidate.payload.list !== Boolean(field.isList)) {
    blockedReasons.push(`field_list_mismatch:${symbol}:${Boolean(field.isList)}`);
  }
  if (candidate.payload.id !== Boolean(field.isId)) {
    blockedReasons.push(`field_id_mismatch:${symbol}:${Boolean(field.isId)}`);
  }
  if (candidate.payload.unique !== Boolean(field.isUnique)) {
    blockedReasons.push(`field_unique_mismatch:${symbol}:${Boolean(field.isUnique)}`);
  }
  const expectedEnum = field.kind === 'enum' ? field.type : null;
  if ((candidate.payload.enumName ?? null) !== expectedEnum) {
    blockedReasons.push(`field_enum_mismatch:${symbol}:${expectedEnum ?? 'null'}`);
  }
  if (expectedEnum && !enums.has(expectedEnum)) blockedReasons.push(`enum_not_found:${expectedEnum}`);
}

function verifyRelationContract(
  candidate: BusinessDefinitionCandidateDraft,
  fromModelName: string,
  field: PrismaFieldAst,
  models: Map<string, PrismaModelAst>,
  blockedReasons: string[],
) {
  const symbol = `${fromModelName}.${field.name}`;
  if (!models.has(field.type)) blockedReasons.push(`model_not_found:${field.type}`);
  if (candidate.payload.toModel !== field.type) blockedReasons.push(`relation_target_mismatch:${symbol}:${field.type}`);
  if ((candidate.payload.relationName ?? null) !== (field.relationName ?? null)) {
    blockedReasons.push(`relation_name_mismatch:${symbol}:${field.relationName ?? 'null'}`);
  }
  if (!sameValues(stringArray(candidate.payload.relationFromFields), field.relationFromFields ?? [])) {
    blockedReasons.push(`relation_from_fields_mismatch:${symbol}:${(field.relationFromFields ?? []).join(',')}`);
  }
  if (!sameValues(stringArray(candidate.payload.relationToFields), field.relationToFields ?? [])) {
    blockedReasons.push(`relation_to_fields_mismatch:${symbol}:${(field.relationToFields ?? []).join(',')}`);
  }
  const cardinality = relationCardinality(field);
  if (candidate.payload.cardinality !== cardinality) {
    blockedReasons.push(`relation_cardinality_mismatch:${symbol}:${cardinality}`);
  }
  if (!isExecutableOwnerRelation(field) || candidate.payload.executableJoin !== true) {
    blockedReasons.push(`relation_join_not_executable:${symbol}`);
  }
}

function verifyStoreScope(
  candidate: BusinessDefinitionCandidateDraft,
  modelName: string,
  resolveStoreScope: (modelName: string) => boolean,
  blockedReasons: string[],
) {
  const expected = resolveStoreScope(modelName) ? 'current_store' : 'global';
  if (candidate.storeScope?.mode !== expected) blockedReasons.push(`store_scope_mismatch:${modelName}:${expected}`);
  return { mode: expected };
}

function rebuildDraftInput(
  candidate: BusinessDefinitionCandidateDraft,
  identity: CanonicalOntologyCandidateIdentity | undefined,
  payload: Record<string, unknown>,
  storeScope: Record<string, unknown>,
  evidenceOverride?: readonly BusinessDefinitionCandidateEvidence[],
): VerifiedBusinessDefinitionCandidate['draftInput'] {
  const evidence = (evidenceOverride ?? candidate.evidence).map(sanitizeEvidence);
  const canonical = identity ?? {
    definitionKey: candidate.definitionKey,
    domain: candidate.domain,
    name: candidate.name,
    ownerType: 'ami_core_semantic_scanner' as const,
    ownerId: '',
    schemaVersion: '1.0' as const,
  };
  return {
    definitionKey: canonical.definitionKey,
    kind: candidate.kind,
    domain: canonical.domain,
    name: canonical.name,
    ownerType: canonical.ownerType,
    ...(canonical.ownerId ? { ownerId: canonical.ownerId } : {}),
    lifecycleStatus: 'draft',
    schemaVersion: canonical.schemaVersion,
    payload,
    ...(candidate.timezone ? { timezone: candidate.timezone } : {}),
    storeScope,
    evidence,
  };
}

function entityPayload(model: PrismaModelAst, aliases: string[]) {
  return {
    model: model.name,
    storeScopeField: model.fields.some((field) => field.kind !== 'object' && field.name === 'storeId')
      ? 'storeId'
      : null,
    fields: model.fields.filter((field) => field.kind !== 'object').map((field) => field.name),
    relationFields: model.fields.filter((field) => field.kind === 'object').map((field) => field.name),
    aliases,
  };
}

function fieldPayload(modelName: string, field: PrismaFieldAst, aliases: string[]) {
  return {
    model: modelName,
    field: field.name,
    scalarType: field.type,
    enumName: field.kind === 'enum' ? field.type : null,
    required: Boolean(field.isRequired),
    list: Boolean(field.isList),
    id: Boolean(field.isId),
    unique: Boolean(field.isUnique),
    aliases,
  };
}

function relationPayload(modelName: string, field: PrismaFieldAst, aliases: string[]) {
  return {
    fromModel: modelName,
    relationField: field.name,
    toModel: field.type,
    relationName: field.relationName ?? null,
    relationFromFields: [...(field.relationFromFields ?? [])],
    relationToFields: [...(field.relationToFields ?? [])],
    cardinality: relationCardinality(field),
    executableJoin: isExecutableOwnerRelation(field),
    aliases,
  };
}

function sanitizeEvidence(evidence: BusinessDefinitionCandidateEvidence) {
  return {
    sourceType: evidence.sourceType,
    sourcePath: evidence.sourcePath,
    ...(evidence.sourceSymbol ? { sourceSymbol: evidence.sourceSymbol } : {}),
    ...(evidence.lineStart ? { lineStart: evidence.lineStart } : {}),
    ...(evidence.lineEnd ? { lineEnd: evidence.lineEnd } : {}),
    evidenceKind: evidence.evidenceKind,
    confidence: evidence.confidence,
    ...(evidence.conflictGroup ? { conflictGroup: evidence.conflictGroup } : {}),
  };
}

function verifiedAliases(evidence: BusinessDefinitionCandidateEvidence[], aliasConflicts: Set<string>) {
  return [
    ...new Set(
      evidence
        .filter(
          (item) =>
            item.evidenceKind === 'alias_observation' &&
            !item.conflictGroup &&
            item.confidence >= 0.8 &&
            Boolean(item.observedLabel?.trim()) &&
            !aliasConflicts.has(normalizeSemanticAlias(item.observedLabel ?? '')),
        )
        .map((item) => item.observedLabel!.trim()),
    ),
  ].sort();
}

function collectAliasConflicts(
  candidateEvidence: BusinessDefinitionCandidateEvidence[],
  semanticEvidence: SemanticLabelEvidence[],
) {
  const conflicts = findSemanticAliasConflicts(semanticEvidence);
  for (const item of candidateEvidence) {
    if (item.conflictGroup && item.observedLabel) conflicts.add(normalizeSemanticAlias(item.observedLabel));
  }
  return conflicts;
}

function verifyCandidateAliasConflicts(
  candidate: BusinessDefinitionCandidateDraft,
  aliasConflicts: Set<string>,
  blockedReasons: string[],
) {
  for (const alias of stringArray(candidate.payload.aliases)) {
    const normalized = normalizeSemanticAlias(alias);
    if (aliasConflicts.has(normalized)) blockedReasons.push(`alias_conflict:${normalized}`);
  }
}

function assertModel(
  modelName: string,
  models: Map<string, PrismaModelAst>,
  blockedReasons: string[],
): PrismaModelAst | undefined {
  const model = models.get(modelName);
  if (!model) blockedReasons.push(`model_not_found:${modelName}`);
  return model;
}

function isStructuralEvidence(evidence: BusinessDefinitionCandidateEvidence) {
  return (
    (evidence.sourceType === 'prisma_dmmf' || evidence.sourceType === 'prisma_schema_ast') &&
    evidence.evidenceKind !== 'alias_observation'
  );
}

function relationCardinality(field: PrismaFieldAst) {
  return field.isList ? 'many' : field.isRequired === false ? 'zero_or_one' : 'one';
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function sameCanonicalValue(left: unknown, right: unknown) {
  return canonicalizeBusinessDefinition(left) === canonicalizeBusinessDefinition(right);
}

function sameValues(left: string[], right: string[]) {
  return [...left].sort().join('\u0000') === [...right].sort().join('\u0000');
}
