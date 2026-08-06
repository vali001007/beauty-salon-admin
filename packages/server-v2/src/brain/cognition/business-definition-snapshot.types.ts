export const BUSINESS_DEFINITION_SNAPSHOT_PROVIDER = Symbol('BUSINESS_DEFINITION_SNAPSHOT_PROVIDER');

export type BusinessDefinitionKind = 'entity' | 'relation' | 'metric' | 'dimension' | 'action';

export interface BusinessDefinitionBase {
  definitionKey: string;
  version: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
}

export interface BusinessEntityDefinitionSnapshot extends BusinessDefinitionBase {
  domain: string;
  entityKey: string;
  name: string;
  aliases: string[];
  attributes: unknown;
  tableMap: unknown;
}

export interface BusinessRelationDefinitionSnapshot extends BusinessDefinitionBase {
  relationKey: string;
  fromEntityKey: string;
  toEntityKey: string;
  name: string;
  joinPath: unknown;
}

export interface BusinessMetricDefinitionSnapshot extends BusinessDefinitionBase {
  metricKey: string;
  name: string;
  aliases?: string[];
  domain: string;
  formula: unknown;
  source: unknown;
  defaultFilters: unknown;
  permissions: unknown;
  description: string;
  valueType?: 'money' | 'count' | 'percent' | 'score' | 'duration';
  allowedTaskTypes?: readonly (
    | 'query'
    | 'ranking'
    | 'recommendation'
    | 'diagnosis'
    | 'forecast'
    | 'draft'
    | 'workflow'
    | 'clarify'
  )[];
  sensitive?: boolean;
  readonly runtimeQuery?: BusinessMetricRuntimeQuery;
}

export type BusinessMetricRuntimeAggregation = 'sum' | 'count' | 'count_distinct' | 'avg' | 'ratio' | 'score';

export type BusinessMetricRuntimeExpression =
  | Readonly<{ op: 'field'; field: string }>
  | Readonly<{ op: 'constant'; value: number }>
  | Readonly<{ op: 'add'; operands: readonly BusinessMetricRuntimeExpression[] }>
  | Readonly<{
      op: 'subtract';
      left: BusinessMetricRuntimeExpression;
      right: BusinessMetricRuntimeExpression;
    }>
  | Readonly<{
      op: 'multiply';
      left: BusinessMetricRuntimeExpression;
      right: BusinessMetricRuntimeExpression;
    }>
  | Readonly<{
      op: 'divide';
      numerator: BusinessMetricRuntimeExpression;
      denominator: BusinessMetricRuntimeExpression;
      zero: 'error' | 'zero';
    }>
  | Readonly<{
      op: 'clamp';
      value: BusinessMetricRuntimeExpression;
      min: number;
      max: number;
    }>;

export interface BusinessMetricRuntimeResolver {
  readonly kind: 'domain_service';
  readonly key:
    | 'manager_staff_analysis'
    | 'manager_operations_analysis'
    | 'finance_cost_analysis'
    | 'finance_settlement_cost_analysis'
    | 'finance_card_recognition_rows'
    | 'finance_order_profit_rows'
    | 'finance_product_order_profit_rows'
    | 'finance_prepaid_order_profit_rows'
    | 'finance_staff_commission_rows'
    | 'finance_stored_value_liability_summary'
    | 'finance_unfulfilled_card_liability_summary'
    | 'inventory_risk_summary'
    | 'inventory_consumption_rows'
    | 'inventory_turnover_summary'
    | 'product_margin_rows'
    | 'marketing_follow_up_opportunities'
    | 'customer_retention_summary'
    | 'customer_acquisition_conversion_summary'
    | 'customer_service_feedback_summary'
    | 'customer_service_feedback_by_staff'
    | 'customer_waiting_summary'
    | 'customer_dormant_reactivation_rows';
  readonly dimensionFields: Readonly<Record<string, string>>;
  readonly expression: BusinessMetricRuntimeExpression;
  readonly overallAggregation: 'sum' | 'avg' | 'min' | 'max';
}

export interface BusinessMetricRuntimeQuery {
  readonly aggregation: BusinessMetricRuntimeAggregation;
  readonly joinPath: readonly Readonly<{
    fromModel: string;
    relationField: string;
    toModel: string;
  }>[];
  readonly dimensions: readonly string[];
  readonly filters: readonly Readonly<Record<string, unknown>>[];
  readonly capabilityKeys: readonly string[];
  readonly executorKeys: readonly string[];
  readonly outputFields: readonly string[];
  readonly sort?: Readonly<{
    outputField: string;
    direction: 'asc' | 'desc';
    missing: 'error';
  }>;
  readonly resolver?: BusinessMetricRuntimeResolver;
  readonly timePolicy: Readonly<{
    mode: 'event_time' | 'as_of_snapshot';
    field?: string;
    boundary: '[start,end)' | 'as_of';
    timezone: 'Asia/Shanghai' | 'UTC';
  }>;
  readonly storeScope: Readonly<{
    mode: 'current_store';
    anchorModel?: string;
    model: string;
    field: string;
    joinPath: readonly Readonly<{
      fromModel: string;
      relationField: string;
      toModel: string;
    }>[];
  }>;
}

export interface BusinessDimensionDefinitionSnapshot extends BusinessDefinitionBase {
  dimensionKey: string;
  name: string;
  aliases?: string[];
  domain: string;
  source: unknown;
  permissions: unknown;
}

export type BusinessActionClass =
  | 'create'
  | 'update'
  | 'transition'
  | 'delete'
  | 'approve'
  | 'notify'
  | 'consume'
  | 'reserve'
  | 'execute';

export type BusinessActionSemanticRole =
  | 'actor'
  | 'requester'
  | 'authorizer'
  | 'approver'
  | 'performer'
  | 'assignee'
  | 'service_provider'
  | 'accountable_party'
  | 'beneficiary'
  | 'counterparty'
  | 'object'
  | 'target'
  | 'instrument'
  | 'origin'
  | 'destination'
  | 'quantity'
  | 'time'
  | 'condition';

export type BusinessActionSlotValueType = 'entity_ref' | 'number' | 'money' | 'enum' | 'text' | 'time' | 'boolean';

export type BusinessActionRequiredStage = 'recognition' | 'preview' | 'execution';

export type BusinessActionModality = 'request' | 'proposal' | 'confirm' | 'schedule' | 'cancel_request';

export interface BusinessActionInputSlotDefinition {
  readonly slotKey: string;
  readonly label: string;
  readonly semanticRole: BusinessActionSemanticRole;
  readonly valueType: BusinessActionSlotValueType;
  readonly entityTypeRef?: string;
  readonly unitPolicy?: string;
  readonly requiredAt: readonly BusinessActionRequiredStage[];
  readonly cardinality: 'one' | 'many';
  readonly sensitive: boolean;
  readonly resolutionPolicy?: string;
  readonly validationPolicy?: string;
  readonly defaultPolicy?: string;
  readonly confirmationDisplay: boolean;
}

export interface BusinessActionCapabilityBinding {
  readonly capabilityKey: string;
  readonly bindingMode: 'preview_only' | 'preview_and_execute' | 'execute_only';
  readonly gatewayActionKey?: string;
  readonly priority: number;
  readonly enabled: boolean;
}

export interface BusinessActionSemanticContractRef {
  readonly key: string;
  readonly version: number;
  readonly fingerprint: string;
}

export type BusinessActionLexicalDiscriminatorDimension =
  | 'modality'
  | 'action_class'
  | 'target_entity'
  | 'required_role'
  | 'required_slot'
  | 'precondition'
  | 'effect'
  | 'state_transition'
  | 'resource_flow'
  | 'spatial_direction'
  | 'responsibility'
  | 'commitment';

export interface BusinessActionLexicalThematicRole {
  readonly semanticRole: BusinessActionSemanticRole;
  readonly slotKeys: readonly string[];
}

export interface BusinessActionLexicalDiscriminator {
  readonly dimension: BusinessActionLexicalDiscriminatorDimension;
  readonly currentActionValue: string;
  readonly contrastActionValue: string;
}

export interface BusinessActionLexicalContrast {
  readonly conceptKey: string;
  readonly name: string;
  readonly discriminators: readonly BusinessActionLexicalDiscriminator[];
}

export interface BusinessActionLexicalFrame {
  readonly schemaVersion: '1.0';
  readonly frameKey: string;
  readonly lexicalUnits: readonly string[];
  readonly thematicRoles: readonly BusinessActionLexicalThematicRole[];
  readonly semanticPredicates: readonly string[];
  readonly contrasts: readonly BusinessActionLexicalContrast[];
  readonly fingerprint: string;
}

export interface BusinessActionSituationContextProfile {
  readonly schemaVersion: '1.0';
  readonly profileKey: string;
  readonly tenantBoundary: 'current_store';
  readonly requestChannelPolicy: 'bind_if_present';
  readonly devicePolicy: 'bind_if_present';
  readonly conversationPolicy: 'same_conversation';
  readonly businessTimePolicy: {
    readonly timezone: 'Asia/Shanghai';
    readonly businessDatePolicy: 'same_business_date';
    readonly clockSource: 'server';
  };
  readonly actorPolicy: {
    readonly subjectPolicy: 'same_authenticated_user';
    readonly qualificationPolicy: 'revalidate_current_role_and_permission';
  };
  readonly fingerprint: string;
}

export interface BusinessActionModalityPolicy {
  readonly schemaVersion: '1.0';
  readonly policyKey: string;
  readonly supportedModalities: readonly BusinessActionModality[];
  readonly unsupportedModalityPolicy: 'fail_closed';
  readonly confirmationReferencePolicy: 'existing_confirmation_required';
  readonly schedulePolicy: 'action_plan_required';
  readonly cancellationReferencePolicy: 'existing_preview_or_plan_required';
  readonly fingerprint: string;
}

export interface BusinessActionInformationArtifactProfile {
  readonly schemaVersion: '1.0';
  readonly profileKey: string;
  readonly referencePolicy: 'bind_if_present';
  readonly artifactTypePolicy: 'governed_result_reference';
  readonly sourcePolicy: 'completed_brain_run_same_conversation_store_user';
  readonly versionPolicy: 'source_run_and_capability_version';
  readonly contentIntegrityPolicy: 'canonical_content_fingerprint';
  readonly supersessionPolicy: 'explicit_new_reference_only';
  readonly fingerprint: string;
}

export interface BusinessActionSideEffectInvariantProfile {
  readonly schemaVersion: '1.2';
  readonly profileKey: string;
  readonly guardContractFingerprint: string;
  readonly effectContractFingerprint: string;
  readonly invariantContractRef: BusinessActionSemanticContractRef;
  readonly undeclaredSideEffectPolicy: 'forbid';
  readonly gatewayEffectPolicy: 'exact_declared_effect_match';
  readonly mutationFootprintEvidencePolicy: 'exact_database_trigger_observed_write_set';
  readonly successEvidencePolicy: 'all_declared_effects_observed';
  readonly partialSuccessPolicy: 'explicit_partially_succeeded';
  readonly recoveryPolicy: 'gateway_declared_strategy_only';
  readonly compensationPolicy: 'explicit_compensation_action_required';
  readonly outcomeObservationPolicy: 'required_for_async_effects';
  readonly fingerprint: string;
}

export type BusinessActionParticipantRole =
  | 'requester'
  | 'authorizer'
  | 'approver'
  | 'performer'
  | 'assignee'
  | 'service_provider'
  | 'beneficiary'
  | 'counterparty'
  | 'accountable_party';

export type BusinessActionParticipantSource =
  | 'authenticated_user'
  | 'confirmation_actor'
  | 'gateway_executor'
  | 'action_slot'
  | 'workflow_assignment';

export interface BusinessActionParticipantRoleBinding {
  readonly role: BusinessActionParticipantRole;
  readonly source: BusinessActionParticipantSource;
  readonly slotKey?: string;
  readonly requiredAt: readonly BusinessActionRequiredStage[];
  readonly qualificationPolicy:
    | 'same_authenticated_user'
    | 'revalidate_current_role_and_permission'
    | 'released_gateway_binding'
    | 'resolved_same_store_business_subject'
    | 'explicit_workflow_assignment';
  readonly runtimeVisibility: 'model_visible' | 'validator_only' | 'execution_only';
}

export interface BusinessActionParticipantProfile {
  readonly schemaVersion: '1.0';
  readonly profileKey: string;
  readonly actorAliasPolicy: 'legacy_requester_only';
  readonly unboundRolePolicy: 'fail_closed';
  readonly roleBindings: readonly BusinessActionParticipantRoleBinding[];
  readonly fingerprint: string;
}

export type BusinessActionRelationResourceKind =
  | 'action_definition'
  | 'action_execution'
  | 'entity'
  | 'event'
  | 'role_subject'
  | 'policy'
  | 'evidence'
  | 'information_artifact'
  | 'situation';

export type BusinessActionRelationLevel = 'definition' | 'occurrence' | 'situation' | 'evidence';
export type BusinessActionRelationTruthMode = 'declared' | 'computed' | 'observed' | 'asserted' | 'inferred';
export type BusinessActionRelationRuntimeVisibility =
  | 'model_visible'
  | 'validator_only'
  | 'execution_only'
  | 'governance_only';

export interface BusinessActionRelationDefinition {
  readonly relationKey: string;
  readonly version: number;
  readonly fingerprint: string;
  readonly domainKinds: readonly BusinessActionRelationResourceKind[];
  readonly rangeKinds: readonly BusinessActionRelationResourceKind[];
  readonly relationLevel: BusinessActionRelationLevel;
  readonly qualificationPolicy: {
    readonly requiredKeys: readonly (
      | 'role'
      | 'store'
      | 'business_time'
      | 'object_version'
      | 'quantity'
      | 'source_destination'
      | 'evidence'
      | 'confirmation'
    )[];
  };
  readonly characteristics: {
    readonly functional: boolean;
    readonly symmetric: boolean;
    readonly transitive: boolean;
    readonly irreflexive: boolean;
  };
  readonly cardinalityPolicy: 'one' | 'zero_or_one' | 'one_or_more' | 'many';
  readonly truthMode: BusinessActionRelationTruthMode;
  readonly truthUsePolicy: 'governance_only' | 'execution_gate' | 'success_evidence';
  readonly evaluatorRef: string;
  readonly evidencePolicy: string;
  readonly freshnessPolicy: string;
  readonly conflictPolicy: 'fail_closed' | 'reread_authoritative_source' | 'manual_review';
  readonly runtimeVisibility: BusinessActionRelationRuntimeVisibility;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly supersededBy?: BusinessActionSemanticContractRef;
}

export interface BusinessActionRelationRef {
  readonly relationDefinitionRef: BusinessActionSemanticContractRef;
  readonly fromRef: string;
  readonly toRef: string;
  readonly qualificationKeys: readonly BusinessActionRelationDefinition['qualificationPolicy']['requiredKeys'][number][];
  readonly slotKey?: string;
  readonly participantRole?: BusinessActionParticipantRole;
  readonly truthStatusPolicy: 'declared_only' | 'runtime_evaluator_required';
}

export interface BusinessActionRelationProfile {
  readonly schemaVersion: '1.0';
  readonly profileKey: string;
  readonly unknownRelationPolicy: 'fail_closed';
  readonly inferencePolicy: 'explicit_only';
  readonly relationRefs: readonly BusinessActionRelationRef[];
  readonly fingerprint: string;
}

export type BusinessActionInstitutionalEffectKind =
  | 'reservation_cancellation'
  | 'purchase_order_submission_for_approval';

export interface BusinessActionInstitutionalEffectProfile {
  readonly schemaVersion: '1.0';
  readonly profileKey: string;
  readonly effectKind: BusinessActionInstitutionalEffectKind;
  readonly requiredPermission: string;
  readonly empoweredRolePolicy: 'current_authenticated_role_with_permission';
  readonly authorizationBasis: 'explicit_confirmation_and_current_permission';
  readonly constitutionPolicy: {
    readonly requiredPreconditionKeys: readonly string[];
    readonly requiredEffectKey: string;
    readonly requiredMutationKind: 'state_transition';
    readonly requiredBusinessObjectType: 'reservation' | 'purchase_order';
    readonly requiredChangedFields: readonly ['status'];
    readonly requiredParticipantRoles: readonly ['requester', 'authorizer', 'performer', 'accountable_party'];
  };
  readonly formalStateTransition: {
    readonly fromStatePolicy: 'non_terminal_reservation_state' | 'purchase_order_draft';
    readonly toState: 'cancelled' | 'pending_approval';
  };
  readonly effectivenessPolicy: 'observed_state_transition_and_transactional_receipt';
  readonly effectiveAtPolicy: 'mutation_receipt_committed_at';
  readonly truthPolicy: 'observed_only';
  readonly invalidityPolicy: 'fail_closed_with_reason';
  readonly fingerprint: string;
}

export interface BusinessActionDefinitionSnapshot extends BusinessDefinitionBase {
  readonly domain: string;
  readonly actionKey: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly actionClass: BusinessActionClass;
  readonly targetEntityRefs: readonly string[];
  readonly inputSlots: readonly BusinessActionInputSlotDefinition[];
  readonly preconditions: readonly string[];
  readonly preconditionPredicateRefs: readonly BusinessActionSemanticContractRef[];
  readonly effects: readonly string[];
  readonly effectAssertionRefs: readonly BusinessActionSemanticContractRef[];
  readonly lexicalFrame: BusinessActionLexicalFrame;
  readonly situationContext: BusinessActionSituationContextProfile;
  readonly modalityPolicy: BusinessActionModalityPolicy;
  readonly informationArtifact: BusinessActionInformationArtifactProfile;
  readonly sideEffectInvariant: BusinessActionSideEffectInvariantProfile;
  readonly participantProfile?: BusinessActionParticipantProfile;
  readonly relationProfile?: BusinessActionRelationProfile;
  readonly institutionalEffect?: BusinessActionInstitutionalEffectProfile;
  readonly triggeredByEventRefs: readonly string[];
  readonly emitsEventRefs: readonly string[];
  readonly riskPolicy: 'low' | 'medium' | 'high' | 'critical';
  readonly confirmationPolicy: 'none' | 'required' | 'conditional';
  readonly idempotencyPolicy: 'not_applicable' | 'required';
  readonly capabilityBindings: readonly BusinessActionCapabilityBinding[];
  readonly bindingFingerprint: string;
}

export interface BusinessDefinitionSnapshotInput {
  entities: BusinessEntityDefinitionSnapshot[];
  relations: BusinessRelationDefinitionSnapshot[];
  metrics: BusinessMetricDefinitionSnapshot[];
  dimensions: BusinessDimensionDefinitionSnapshot[];
  actions?: BusinessActionDefinitionSnapshot[];
}

export interface PrismaRuntimeDataModelField {
  readonly name: string;
  readonly kind?: string;
  readonly type: string;
  readonly isList: boolean;
}

export interface PrismaRuntimeDataModel {
  readonly models: Readonly<
    Record<
      string,
      {
        readonly fields: readonly PrismaRuntimeDataModelField[];
      }
    >
  >;
}

export interface BusinessDefinitionSnapshotProvider {
  loadActiveDefinitions(): Promise<BusinessDefinitionSnapshotInput>;
  loadEvaluationDefinitions?(definitionVersionIds: readonly number[]): Promise<BusinessDefinitionSnapshotInput>;
  getEvaluationCacheIdentity?(definitionVersionIds: readonly number[]): Promise<string>;
  primeEvaluationCacheIdentity?(definitionVersionIds: readonly number[], identity: string): void;
  loadActiveMetricDefinitions?(): Promise<BusinessMetricDefinitionSnapshot[]>;
  getRuntimeDataModel(): PrismaRuntimeDataModel;
}

export type BusinessDefinitionRef = BrainDefinitionRef<BusinessDefinitionKind>;

export interface ProductionReadyBusinessDefinitionSnapshot extends BusinessDefinitionSnapshotInput {
  productionReady: true;
  fingerprint: string;
  actions: BusinessActionDefinitionSnapshot[];
}

export type EntityAliasResolution =
  | {
      status: 'resolved';
      matchType: 'exact' | 'prefix' | 'fuzzy';
      entity: BusinessEntityDefinitionSnapshot;
      refs: BusinessDefinitionRef[];
    }
  | {
      status: 'ambiguity';
      matchType: 'exact' | 'prefix' | 'fuzzy';
      refs: BusinessDefinitionRef[];
    }
  | {
      status: 'not_found';
      refs: [];
    };

export interface GovernedJoinStep {
  fromEntityKey: string;
  toEntityKey: string;
  direction: 'forward' | 'reverse';
  relation: BusinessRelationDefinitionSnapshot;
  joinPath: unknown;
  ref: BusinessDefinitionRef;
}

export interface GovernedJoinPath {
  fromEntityKey: string;
  toEntityKey: string;
  hopCount: number;
  steps: GovernedJoinStep[];
  refs: BusinessDefinitionRef[];
}
import type { BrainDefinitionRef } from './brain-semantic-intent.types.js';
