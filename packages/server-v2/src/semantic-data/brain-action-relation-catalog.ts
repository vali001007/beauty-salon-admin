import { createBusinessDefinitionProjectionFingerprint } from './business-definition-projection-compiler.service.js';
import type {
  BusinessActionRelationDefinition,
  BusinessActionSemanticContractRef,
} from '../brain/cognition/business-definition-snapshot.types.js';

export const ACTION_RELATION_CATALOG_SOURCE =
  'packages/server-v2/src/semantic-data/brain-action-relation-catalog.ts';

type RelationInput = Omit<BusinessActionRelationDefinition, 'version' | 'fingerprint' | 'validFrom'>;

function relation(input: RelationInput): BusinessActionRelationDefinition {
  const definition = { ...input, version: 1, validFrom: '2026-07-30' };
  return { ...definition, fingerprint: createBusinessDefinitionProjectionFingerprint(definition) };
}

const occurrenceQualification = { requiredKeys: ['store', 'business_time', 'evidence'] as const };
const participantQualification = {
  requiredKeys: ['role', 'store', 'business_time', 'evidence'] as const,
};
const staticCharacteristics = {
  functional: false,
  symmetric: false,
  transitive: false,
  irreflexive: true,
};

export const CURATED_ACTION_RELATION_DEFINITIONS: readonly BusinessActionRelationDefinition[] = Object.freeze([
  relation({
    relationKey: 'action_relation.occurrence_of',
    domainKinds: ['action_execution'],
    rangeKinds: ['action_definition'],
    relationLevel: 'occurrence',
    qualificationPolicy: occurrenceQualification,
    characteristics: { ...staticCharacteristics, functional: true },
    cardinalityPolicy: 'one',
    truthMode: 'observed',
    truthUsePolicy: 'execution_gate',
    evaluatorRef: 'BrainActionExecutionIdentityService.assertCurrent',
    evidencePolicy: 'frozen_action_provenance',
    freshnessPolicy: 'same_release_or_current_production_snapshot',
    conflictPolicy: 'fail_closed',
    runtimeVisibility: 'execution_only',
  }),
  relation({
    relationKey: 'action_relation.acts_on',
    domainKinds: ['action_definition'],
    rangeKinds: ['entity'],
    relationLevel: 'definition',
    qualificationPolicy: { requiredKeys: [] },
    characteristics: staticCharacteristics,
    cardinalityPolicy: 'one_or_more',
    truthMode: 'declared',
    truthUsePolicy: 'governance_only',
    evaluatorRef: 'BrainOntologyRuntimeService.validateActionDefinition',
    evidencePolicy: 'published_action_target_entity_ref',
    freshnessPolicy: 'definition_version',
    conflictPolicy: 'fail_closed',
    runtimeVisibility: 'model_visible',
  }),
  relation({
    relationKey: 'action_relation.creates',
    domainKinds: ['action_definition'],
    rangeKinds: ['entity'],
    relationLevel: 'definition',
    qualificationPolicy: { requiredKeys: [] },
    characteristics: staticCharacteristics,
    cardinalityPolicy: 'one_or_more',
    truthMode: 'declared',
    truthUsePolicy: 'governance_only',
    evaluatorRef: 'validateBusinessActionSemanticPredicates',
    evidencePolicy: 'published_action_effect_contract',
    freshnessPolicy: 'definition_version',
    conflictPolicy: 'fail_closed',
    runtimeVisibility: 'model_visible',
  }),
  relation({
    relationKey: 'action_relation.state_transition',
    domainKinds: ['action_execution'],
    rangeKinds: ['entity'],
    relationLevel: 'occurrence',
    qualificationPolicy: { requiredKeys: ['object_version'] },
    characteristics: staticCharacteristics,
    cardinalityPolicy: 'one_or_more',
    truthMode: 'observed',
    truthUsePolicy: 'success_evidence',
    evaluatorRef: 'BrainActionPredicateEffectEvaluatorService',
    evidencePolicy: 'predicate_effect_and_mutation_receipt',
    freshnessPolicy: 'definition_version_and_execution_object_version',
    conflictPolicy: 'reread_authoritative_source',
    runtimeVisibility: 'validator_only',
  }),
  relation({
    relationKey: 'action_relation.institutional_effect',
    domainKinds: ['action_execution'],
    rangeKinds: ['policy', 'evidence'],
    relationLevel: 'evidence',
    qualificationPolicy: {
      requiredKeys: ['role', 'store', 'business_time', 'object_version', 'evidence', 'confirmation'],
    },
    characteristics: { ...staticCharacteristics, functional: true },
    cardinalityPolicy: 'zero_or_one',
    truthMode: 'observed',
    truthUsePolicy: 'success_evidence',
    evaluatorRef: 'evaluateBusinessActionInstitutionalEffect',
    evidencePolicy: 'confirmation_permission_effect_and_transactional_mutation_receipt',
    freshnessPolicy: 'execution_transaction_and_confirmation_identity',
    conflictPolicy: 'fail_closed',
    runtimeVisibility: 'execution_only',
  }),
  ...[
    ['requested_by', 'requester', 'BrainActionSituationContext.actorUserId', 'same_business_date'],
    ['authorized_by', 'authorizer', 'BrainActionConfirmationService.validateApprovedAction', 'confirmation_ttl'],
    ['approved_by', 'approver', 'BrainActionConfirmationService.validateInstitutionalEffect', 'decision_validity'],
    ['performed_by', 'performer', 'BrainCapabilityGatewayService.execute', 'execution_transaction'],
    ['accountable_party', 'accountable_party', 'BrainActionConfirmationService.validateApprovedAction', 'same_business_date'],
    ['assigned_to', 'assignee', 'BrainSemanticIntentValidatorService', 'execution_object_version'],
    ['assigned_service_provider', 'service_provider', 'BrainSemanticIntentValidatorService', 'execution_object_version'],
    ['benefits', 'beneficiary', 'BrainSemanticIntentValidatorService', 'execution_object_version'],
    ['counterparty', 'counterparty', 'BrainSemanticIntentValidatorService', 'execution_object_version'],
  ].map(([key, role, evaluatorRef, freshnessPolicy]) =>
    relation({
      relationKey: `action_relation.${key}`,
      domainKinds: ['action_execution'],
      rangeKinds: ['role_subject'],
      relationLevel: 'occurrence',
      qualificationPolicy: participantQualification,
      characteristics: { ...staticCharacteristics, functional: ['requester', 'authorizer', 'performer'].includes(role) },
      cardinalityPolicy: ['requester', 'authorizer', 'performer'].includes(role) ? 'one' : 'many',
      truthMode: 'observed',
      truthUsePolicy: ['requester', 'authorizer', 'performer'].includes(role) ? 'execution_gate' : 'governance_only',
      evaluatorRef,
      evidencePolicy: `participant_binding:${role}`,
      freshnessPolicy,
      conflictPolicy: 'fail_closed',
      runtimeVisibility: role === 'beneficiary' || role === 'counterparty' || role === 'service_provider'
        ? 'model_visible'
        : 'execution_only',
    }),
  ),
]);

export function curatedActionRelationRef(relationKey: string): BusinessActionSemanticContractRef {
  const definition = CURATED_ACTION_RELATION_DEFINITIONS.find((item) => item.relationKey === relationKey);
  if (!definition) throw new Error(`action_relation_definition_missing:${relationKey}`);
  return { key: definition.relationKey, version: definition.version, fingerprint: definition.fingerprint };
}

export function resolveCuratedActionRelationDefinition(ref: BusinessActionSemanticContractRef) {
  return CURATED_ACTION_RELATION_DEFINITIONS.find(
    (item) =>
      item.relationKey === ref.key && item.version === ref.version && item.fingerprint === ref.fingerprint,
  );
}
