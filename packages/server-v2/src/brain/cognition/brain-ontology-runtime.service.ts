import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import {
  BUSINESS_DEFINITION_SNAPSHOT_PROVIDER,
  type BusinessDefinitionKind,
  type BusinessActionDefinitionSnapshot,
  type BusinessDefinitionRef,
  type BusinessDefinitionSnapshotInput,
  type BusinessDefinitionSnapshotProvider,
  type BusinessEntityDefinitionSnapshot,
  type BusinessMetricDefinitionSnapshot,
  type BusinessRelationDefinitionSnapshot,
  type EntityAliasResolution,
  type GovernedJoinPath,
  type GovernedJoinStep,
  type PrismaRuntimeDataModel,
  type ProductionReadyBusinessDefinitionSnapshot,
} from './business-definition-snapshot.types.js';
import { evaluateBusinessMetricResolver } from '../../semantic-data/business-metric-resolver-contract.js';
import { validateBusinessActionSemanticPredicates } from './business-action-lexical-semantics.js';
import { resolveCuratedActionInvariantContract } from '../../semantic-data/brain-action-invariant-catalog.js';
import { resolveCuratedActionRelationDefinition } from '../../semantic-data/brain-action-relation-catalog.js';
import {
  createBusinessActionInstitutionalEffectProfile,
  INSTITUTIONAL_EFFECT_ACTION_KEYS,
} from './business-action-institutional-effect.js';

type UnknownRecord = Record<string, unknown>;

interface EntityAliasCandidate {
  readonly entity: BusinessEntityDefinitionSnapshot;
  readonly aliases: readonly string[];
}

interface EntityAliasIndex {
  readonly exact: ReadonlyMap<string, readonly BusinessEntityDefinitionSnapshot[]>;
  readonly candidates: readonly EntityAliasCandidate[];
}

const METRIC_FORMULA_KEYS = new Set(['type', 'model', 'field']);
const METRIC_FORMULA_TYPES = new Set(['sum', 'count', 'count_distinct', 'avg', 'min', 'max']);
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
const ACTION_MODALITY_POLICY_KEYS = new Set([
  'schemaVersion',
  'policyKey',
  'supportedModalities',
  'unsupportedModalityPolicy',
  'confirmationReferencePolicy',
  'schedulePolicy',
  'cancellationReferencePolicy',
  'fingerprint',
]);
const ACTION_INFORMATION_ARTIFACT_KEYS = new Set([
  'schemaVersion',
  'profileKey',
  'referencePolicy',
  'artifactTypePolicy',
  'sourcePolicy',
  'versionPolicy',
  'contentIntegrityPolicy',
  'supersessionPolicy',
  'fingerprint',
]);
const ACTION_SIDE_EFFECT_INVARIANT_KEYS = new Set([
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
]);
const ACTION_PARTICIPANT_PROFILE_KEYS = new Set([
  'schemaVersion',
  'profileKey',
  'actorAliasPolicy',
  'unboundRolePolicy',
  'roleBindings',
  'fingerprint',
]);
const ACTION_PARTICIPANT_BINDING_KEYS = new Set([
  'role',
  'source',
  'slotKey',
  'requiredAt',
  'qualificationPolicy',
  'runtimeVisibility',
]);
const ACTION_RELATION_PROFILE_KEYS = new Set([
  'schemaVersion',
  'profileKey',
  'unknownRelationPolicy',
  'inferencePolicy',
  'relationRefs',
  'fingerprint',
]);
const ACTION_RELATION_REF_KEYS = new Set([
  'relationDefinitionRef',
  'fromRef',
  'toRef',
  'qualificationKeys',
  'slotKey',
  'participantRole',
  'truthStatusPolicy',
]);
const ACTION_INSTITUTIONAL_EFFECT_KEYS = new Set([
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
]);
const PHYSICAL_SOURCE_KEYS = new Set(['model', 'field']);

@Injectable()
export class BrainOntologyRuntimeService implements OnModuleInit {
  private snapshot: ProductionReadyBusinessDefinitionSnapshot | null = null;
  private aliasIndex: EntityAliasIndex | null = null;
  private readonly evaluationSnapshotCache = new Map<string, Promise<ProductionReadyBusinessDefinitionSnapshot>>();

  constructor(
    @Inject(BUSINESS_DEFINITION_SNAPSHOT_PROVIDER)
    private readonly provider: BusinessDefinitionSnapshotProvider,
    private readonly config: BrainRuntimeConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.runtime.cognitionMode === 'rules') {
      return;
    }
    await this.loadProductionReadySnapshot();
  }

  getSnapshot(): ProductionReadyBusinessDefinitionSnapshot | null {
    return this.snapshot;
  }

  async loadProductionReadySnapshot(): Promise<ProductionReadyBusinessDefinitionSnapshot> {
    const input = await this.provider.loadActiveDefinitions();
    const snapshot = buildProductionReadyBusinessDefinitionSnapshot(input, this.provider.getRuntimeDataModel());
    this.snapshot = snapshot;
    this.aliasIndex = buildEntityAliasIndex(snapshot.entities);
    return snapshot;
  }

  async loadEvaluationSnapshot(
    definitionVersionIds: readonly number[],
  ): Promise<ProductionReadyBusinessDefinitionSnapshot> {
    if (!this.provider.loadEvaluationDefinitions) {
      throw new Error('business_definition_evaluation_snapshot_unavailable');
    }
    const normalizedVersionIds = [
      ...new Set(definitionVersionIds.filter((value) => Number.isInteger(value) && value > 0)),
    ].sort((left, right) => left - right);
    const cacheKey = normalizedVersionIds.join(',');
    const cached = this.evaluationSnapshotCache.get(cacheKey);
    if (cached) return cached;

    const loading = this.provider
      .loadEvaluationDefinitions(normalizedVersionIds)
      .then((input) => buildProductionReadyBusinessDefinitionSnapshot(input, this.provider.getRuntimeDataModel()));
    this.evaluationSnapshotCache.set(cacheKey, loading);
    try {
      return await loading;
    } catch (error) {
      this.evaluationSnapshotCache.delete(cacheKey);
      throw error;
    }
  }

  resolveEntityAlias(
    query: string,
    snapshotOverride?: ProductionReadyBusinessDefinitionSnapshot,
  ): EntityAliasResolution {
    const aliasIndex = snapshotOverride ? buildEntityAliasIndex(snapshotOverride.entities) : this.requireAliasIndex();
    const normalizedQuery = normalizeAlias(query);
    if (!normalizedQuery) {
      return { status: 'not_found', refs: [] };
    }

    const exact = uniqueEntities([...(aliasIndex.exact.get(normalizedQuery) ?? [])]);
    if (exact.length > 0) {
      return aliasResult('exact', exact);
    }

    const prefix = uniqueEntities(
      aliasIndex.candidates
        .filter((candidate) => candidate.aliases.some((alias) => alias.startsWith(normalizedQuery)))
        .map((candidate) => candidate.entity),
    );
    if (prefix.length > 0) {
      return aliasResult('prefix', prefix);
    }

    if (Array.from(normalizedQuery).length < 2) {
      return { status: 'not_found', refs: [] };
    }
    const scored = aliasIndex.candidates
      .map((candidate) => {
        const acceptedDistances = candidate.aliases
          .map((alias) => {
            const distance = levenshtein(normalizedQuery, alias);
            const maxLength = Math.max(Array.from(normalizedQuery).length, Array.from(alias).length);
            const threshold = maxLength <= 4 ? 1 : Math.min(2, Math.floor(maxLength * 0.25));
            return { distance, threshold };
          })
          .filter(({ distance, threshold }) => distance <= threshold)
          .map(({ distance }) => distance);
        return acceptedDistances.length > 0
          ? { entity: candidate.entity, distance: Math.min(...acceptedDistances) }
          : null;
      })
      .filter(
        (candidate): candidate is { entity: BusinessEntityDefinitionSnapshot; distance: number } => candidate !== null,
      );
    if (scored.length === 0) {
      return { status: 'not_found', refs: [] };
    }
    const bestDistance = Math.min(...scored.map((candidate) => candidate.distance));
    return aliasResult(
      'fuzzy',
      uniqueEntities(
        scored.filter((candidate) => candidate.distance === bestDistance).map((candidate) => candidate.entity),
      ),
    );
  }

  findJoinPath(fromEntityKey: string, toEntityKey: string): GovernedJoinPath | null {
    const snapshot = this.requireSnapshot();
    const entityKeys = new Set(snapshot.entities.map((entity) => entity.entityKey));
    if (!entityKeys.has(fromEntityKey) || !entityKeys.has(toEntityKey)) {
      return null;
    }
    if (fromEntityKey === toEntityKey) {
      return {
        fromEntityKey,
        toEntityKey,
        hopCount: 0,
        steps: [],
        refs: [],
      };
    }

    const adjacency = new Map<string, GovernedJoinStep[]>();
    for (const relation of snapshot.relations) {
      addJoinStep(adjacency, relation.fromEntityKey, {
        fromEntityKey: relation.fromEntityKey,
        toEntityKey: relation.toEntityKey,
        direction: 'forward',
        relation,
        joinPath: relation.joinPath,
        ref: definitionRef('relation', relation.relationKey, relation),
      });
    }
    for (const steps of adjacency.values()) {
      steps.sort((left, right) => left.relation.definitionKey.localeCompare(right.relation.definitionKey));
    }

    const queue: Array<{ entityKey: string; steps: GovernedJoinStep[] }> = [{ entityKey: fromEntityKey, steps: [] }];
    const visited = new Set([fromEntityKey]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.steps.length >= 4) {
        continue;
      }
      for (const step of adjacency.get(current.entityKey) ?? []) {
        if (visited.has(step.toEntityKey)) {
          continue;
        }
        const steps = [...current.steps, step];
        if (step.toEntityKey === toEntityKey) {
          return deepFreeze({
            fromEntityKey,
            toEntityKey,
            hopCount: steps.length,
            steps,
            refs: steps.map((item) => item.ref),
          });
        }
        visited.add(step.toEntityKey);
        queue.push({ entityKey: step.toEntityKey, steps });
      }
    }
    return null;
  }

  private requireSnapshot(): ProductionReadyBusinessDefinitionSnapshot {
    if (!this.snapshot) {
      throw new Error('Brain ontology production-ready snapshot is not loaded');
    }
    return this.snapshot;
  }

  private requireAliasIndex(): EntityAliasIndex {
    this.requireSnapshot();
    if (!this.aliasIndex) {
      throw new Error('Brain ontology alias index is not loaded');
    }
    return this.aliasIndex;
  }
}

export function buildProductionReadyBusinessDefinitionSnapshot(
  input: BusinessDefinitionSnapshotInput,
  dataModel: PrismaRuntimeDataModel,
): ProductionReadyBusinessDefinitionSnapshot {
  const normalized = normalizeSnapshot(input);
  validateDefinitions(normalized, dataModel);
  const fingerprint = createHash('sha256').update(stableStringify(normalized)).digest('hex');
  return deepFreeze({ ...normalized, productionReady: true as const, fingerprint });
}

function normalizeSnapshot(
  input: BusinessDefinitionSnapshotInput,
): BusinessDefinitionSnapshotInput & { actions: BusinessActionDefinitionSnapshot[] } {
  return {
    entities: input.entities
      .map((entity) => ({
        ...sortObjectKeys(entity),
        aliases: Array.from(new Set(entity.aliases.map((alias) => alias.trim()).filter(Boolean))).sort(),
      }))
      .sort(compareDefinition),
    relations: input.relations.map(sortObjectKeys).sort(compareDefinition),
    metrics: input.metrics
      .map((metric) => ({
        ...sortObjectKeys(metric),
        source: canonicalStableArray(metric.source),
        permissions: canonicalStringArray(metric.permissions, true),
      }))
      .sort(compareDefinition),
    dimensions: input.dimensions
      .map((dimension) => ({
        ...sortObjectKeys(dimension),
        permissions: canonicalStringArray(dimension.permissions, true),
      }))
      .sort(compareDefinition),
    actions: (input.actions ?? [])
      .map((action) => ({
        ...sortObjectKeys(action),
        aliases: uniqueSortedStrings(action.aliases),
        targetEntityRefs: uniqueSortedStrings(action.targetEntityRefs),
        preconditions: uniqueSortedStrings(action.preconditions),
        preconditionPredicateRefs: [...action.preconditionPredicateRefs]
          .map(sortObjectKeys)
          .sort((left, right) => left.key.localeCompare(right.key)),
        effects: uniqueSortedStrings(action.effects),
        effectAssertionRefs: [...action.effectAssertionRefs]
          .map(sortObjectKeys)
          .sort((left, right) => left.key.localeCompare(right.key)),
        lexicalFrame: normalizeActionLexicalFrame(action.lexicalFrame),
        situationContext: normalizeActionSituationContext(action.actionKey, action.situationContext),
        modalityPolicy: normalizeActionModalityPolicy(action.actionKey, action.modalityPolicy),
        informationArtifact: normalizeActionInformationArtifact(action.actionKey, action.informationArtifact),
        sideEffectInvariant: normalizeActionSideEffectInvariant(action.actionKey, action.sideEffectInvariant),
        participantProfile: normalizeActionParticipantProfile(action.actionKey, action.participantProfile),
        relationProfile: normalizeActionRelationProfile(action.actionKey, action.relationProfile),
        ...(action.institutionalEffect
          ? { institutionalEffect: normalizeActionInstitutionalEffect(action.actionKey, action.institutionalEffect) }
          : {}),
        triggeredByEventRefs: uniqueSortedStrings(action.triggeredByEventRefs),
        emitsEventRefs: uniqueSortedStrings(action.emitsEventRefs),
        inputSlots: [...action.inputSlots]
          .map((slot) => ({ ...sortObjectKeys(slot), requiredAt: uniqueSortedStrings(slot.requiredAt) }))
          .sort((left, right) => left.slotKey.localeCompare(right.slotKey)),
        capabilityBindings: [...action.capabilityBindings]
          .map(sortObjectKeys)
          .sort(
            (left, right) => left.priority - right.priority || left.capabilityKey.localeCompare(right.capabilityKey),
          ),
      }))
      .sort(compareDefinition),
  } as BusinessDefinitionSnapshotInput & { actions: BusinessActionDefinitionSnapshot[] };
}

function uniqueSortedStrings(value: readonly string[]): string[] {
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].sort();
}

function canonicalStringArray(value: unknown, deduplicate: boolean): unknown {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return sortObjectKeys(value);
  }
  const strings = value.map((item) => item.trim()).filter(Boolean);
  return (deduplicate ? Array.from(new Set(strings)) : strings).sort();
}

function canonicalStableArray(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return sortObjectKeys(value);
  }
  return value.map(sortObjectKeys).sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function validateDefinitions(snapshot: BusinessDefinitionSnapshotInput, dataModel: PrismaRuntimeDataModel): void {
  rejectDuplicateKeys(snapshot.entities, 'entity', (item) => item.entityKey);
  rejectDuplicateKeys(snapshot.relations, 'relation', (item) => item.relationKey);
  rejectDuplicateKeys(snapshot.metrics, 'metric', (item) => item.metricKey);
  rejectDuplicateKeys(snapshot.dimensions, 'dimension', (item) => item.dimensionKey);
  rejectDuplicateKeys(snapshot.actions ?? [], 'action', (item) => item.actionKey);

  const entities = new Map(snapshot.entities.map((entity) => [entity.entityKey, entity]));
  for (const entity of snapshot.entities) {
    validateEntityMapping(entity, dataModel);
  }
  for (const relation of snapshot.relations) {
    const from = entities.get(relation.fromEntityKey);
    const to = entities.get(relation.toEntityKey);
    if (!from) {
      throw new Error(`relation ${relation.relationKey} endpoint ${relation.fromEntityKey} is missing`);
    }
    if (!to) {
      throw new Error(`relation ${relation.relationKey} endpoint ${relation.toEntityKey} is missing`);
    }
    validateRelationMapping(relation, from, to, dataModel);
  }
  for (const metric of snapshot.metrics) {
    if (!hasDefinitionValue(metric.source)) {
      throw new Error(`metric ${metric.metricKey} source is required`);
    }
    if (!hasDefinitionValue(metric.formula)) {
      throw new Error(`metric ${metric.metricKey} formula is required`);
    }
    if (metric.runtimeQuery?.resolver) {
      validateResolverMetric(metric, dataModel);
    } else {
      const sourceRefs = validateMetricSource(metric.metricKey, metric.source, dataModel);
      validateMetricFormula(metric.metricKey, metric.formula, sourceRefs, dataModel);
    }
  }
  for (const dimension of snapshot.dimensions) {
    validateDimensionSource(dimension.dimensionKey, dimension.source, dataModel);
  }
  for (const action of snapshot.actions ?? []) {
    validateActionDefinition(action, snapshot.entities);
  }
}

function validateActionDefinition(
  action: BusinessActionDefinitionSnapshot,
  entities: readonly BusinessEntityDefinitionSnapshot[],
): void {
  if (action.actionKey !== action.definitionKey || !action.actionKey.startsWith('action.')) {
    throw new Error(`action ${action.definitionKey} key is invalid`);
  }
  const entityDefinitionKeys = new Set(entities.map((entity) => entity.definitionKey));
  for (const targetRef of action.targetEntityRefs) {
    if (!entityDefinitionKeys.has(targetRef)) {
      throw new Error(`action ${action.actionKey} target ${targetRef} is missing`);
    }
  }
  rejectDuplicateKeys(action.inputSlots, `action ${action.actionKey} slot`, (slot) => slot.slotKey);
  for (const slot of action.inputSlots) {
    if (!/^[a-z][a-zA-Z0-9_]{0,63}$/.test(slot.slotKey)) {
      throw new Error(`action ${action.actionKey} slot ${slot.slotKey} is invalid`);
    }
    if (slot.valueType === 'entity_ref') {
      if (!slot.entityTypeRef || !entityDefinitionKeys.has(slot.entityTypeRef)) {
        throw new Error(`action ${action.actionKey} slot ${slot.slotKey} entity reference is missing`);
      }
    } else if (slot.entityTypeRef) {
      throw new Error(`action ${action.actionKey} slot ${slot.slotKey} cannot declare entityTypeRef`);
    }
  }
  validateActionSemanticContractKeys(
    action.actionKey,
    'predicate',
    action.preconditions,
    action.preconditionPredicateRefs,
  );
  validateActionSemanticContractKeys(action.actionKey, 'effect', action.effects, action.effectAssertionRefs);
  validateActionLexicalFrame(action);
  validateActionSituationContext(action);
  validateActionModalityPolicy(action);
  validateActionInformationArtifact(action);
  validateActionSideEffectInvariant(action);
  validateActionParticipantProfile(action);
  validateActionRelationProfile(action);
  validateActionInstitutionalEffect(action);
  rejectDuplicateKeys(
    action.capabilityBindings,
    `action ${action.actionKey} binding`,
    (binding) => binding.capabilityKey,
  );
  if (!action.capabilityBindings.some((binding) => binding.enabled)) {
    throw new Error(`action ${action.actionKey} has no enabled capability binding`);
  }
  const expectedBindingFingerprint = createHash('sha256')
    .update(stableStringify({ actionKey: action.actionKey, capabilityBindings: action.capabilityBindings }))
    .digest('hex');
  if (action.bindingFingerprint !== expectedBindingFingerprint) {
    throw new Error(`action ${action.actionKey} binding fingerprint is invalid`);
  }
  if (action.confirmationPolicy === 'none') {
    throw new Error(`action ${action.actionKey} confirmation policy must be controlled`);
  }
  if (action.idempotencyPolicy !== 'required') {
    throw new Error(`action ${action.actionKey} idempotency policy must be required`);
  }
}

function normalizeActionParticipantProfile(
  actionKey: string,
  profile: BusinessActionDefinitionSnapshot['participantProfile'] | undefined,
) {
  if (!profile) throw new Error(`action ${actionKey} participant profile is missing`);
  return {
    ...sortObjectKeys(profile),
    roleBindings: [...profile.roleBindings]
      .map((binding) => ({
        ...sortObjectKeys(binding),
        requiredAt: uniqueSortedStrings(binding.requiredAt),
      }))
      .sort(
        (left, right) => left.role.localeCompare(right.role) || (left.slotKey ?? '').localeCompare(right.slotKey ?? ''),
      ),
  };
}

function validateActionParticipantProfile(action: BusinessActionDefinitionSnapshot): void {
  const profile = action.participantProfile;
  if (!profile) throw new Error(`action ${action.actionKey} participant profile is missing`);
  rejectUnsupportedKeys(
    asRecord(profile),
    ACTION_PARTICIPANT_PROFILE_KEYS,
    `action ${action.actionKey} participant profile`,
  );
  if (
    profile.schemaVersion !== '1.0' ||
    profile.profileKey !== `${action.actionKey}.participant` ||
    profile.actorAliasPolicy !== 'legacy_requester_only' ||
    profile.unboundRolePolicy !== 'fail_closed'
  ) {
    throw new Error(`action ${action.actionKey} participant profile is invalid`);
  }
  const slots = new Map(action.inputSlots.map((slot) => [slot.slotKey, slot]));
  const seen = new Set<string>();
  for (const binding of profile.roleBindings) {
    rejectUnsupportedKeys(
      asRecord(binding),
      ACTION_PARTICIPANT_BINDING_KEYS,
      `action ${action.actionKey} participant binding`,
    );
    const key = `${binding.role}:${binding.slotKey ?? binding.source}`;
    if (seen.has(key)) throw new Error(`action ${action.actionKey} participant binding ${key} is duplicated`);
    seen.add(key);
    if (!validParticipantBindingSource(binding.role, binding.source)) {
      throw new Error(`action ${action.actionKey} participant ${binding.role} source is invalid`);
    }
    if (binding.source === 'action_slot') {
      const slot = binding.slotKey ? slots.get(binding.slotKey) : undefined;
      if (!slot || slot.semanticRole !== binding.role) {
        throw new Error(`action ${action.actionKey} participant slot ${binding.slotKey ?? 'missing'} is invalid`);
      }
    } else if (binding.slotKey) {
      throw new Error(`action ${action.actionKey} participant ${binding.role} cannot bind a slot`);
    }
  }
  for (const role of ['requester', 'authorizer', 'performer', 'accountable_party'] as const) {
    if (!profile.roleBindings.some((binding) => binding.role === role)) {
      throw new Error(`action ${action.actionKey} participant role ${role} is missing`);
    }
  }
  const { fingerprint, ...fingerprintInput } = profile;
  const expectedFingerprint = createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex');
  if (fingerprint !== expectedFingerprint) {
    throw new Error(`action ${action.actionKey} participant profile fingerprint is invalid`);
  }
}

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

function normalizeActionRelationProfile(
  actionKey: string,
  profile: BusinessActionDefinitionSnapshot['relationProfile'] | undefined,
) {
  if (!profile) throw new Error(`action ${actionKey} relation profile is missing`);
  return {
    ...sortObjectKeys(profile),
    relationRefs: [...profile.relationRefs]
      .map((relation) => ({
        ...sortObjectKeys(relation),
        relationDefinitionRef: sortObjectKeys(relation.relationDefinitionRef),
        qualificationKeys: uniqueSortedStrings(relation.qualificationKeys),
      }))
      .sort(
        (left, right) =>
          left.relationDefinitionRef.key.localeCompare(right.relationDefinitionRef.key) ||
          left.fromRef.localeCompare(right.fromRef) ||
          left.toRef.localeCompare(right.toRef),
      ),
  };
}

function validateActionRelationProfile(action: BusinessActionDefinitionSnapshot): void {
  const profile = action.relationProfile;
  if (!profile) throw new Error(`action ${action.actionKey} relation profile is missing`);
  if (!action.participantProfile) throw new Error(`action ${action.actionKey} participant profile is missing`);
  rejectUnsupportedKeys(asRecord(profile), ACTION_RELATION_PROFILE_KEYS, `action ${action.actionKey} relation profile`);
  if (
    profile.schemaVersion !== '1.0' ||
    profile.profileKey !== `${action.actionKey}.relations` ||
    profile.unknownRelationPolicy !== 'fail_closed' ||
    profile.inferencePolicy !== 'explicit_only'
  ) {
    throw new Error(`action ${action.actionKey} relation profile is invalid`);
  }
  const participantRoles = new Set(action.participantProfile.roleBindings.map((binding) => binding.role));
  const relationKeys = new Set<string>();
  for (const relation of profile.relationRefs) {
    rejectUnsupportedKeys(asRecord(relation), ACTION_RELATION_REF_KEYS, `action ${action.actionKey} relation ref`);
    const definition = resolveCuratedActionRelationDefinition(relation.relationDefinitionRef);
    if (!definition) throw new Error(`action ${action.actionKey} relation definition is unresolved`);
    const key = `${definition.relationKey}:${relation.fromRef}:${relation.toRef}:${relation.slotKey ?? ''}`;
    if (relationKeys.has(key)) throw new Error(`action ${action.actionKey} relation ${key} is duplicated`);
    relationKeys.add(key);
    if (
      JSON.stringify([...relation.qualificationKeys].sort()) !==
      JSON.stringify([...definition.qualificationPolicy.requiredKeys].sort())
    ) {
      throw new Error(`action ${action.actionKey} relation ${definition.relationKey} qualification is invalid`);
    }
    const expectedTruthPolicy = definition.truthMode === 'declared' ? 'declared_only' : 'runtime_evaluator_required';
    if (relation.truthStatusPolicy !== expectedTruthPolicy) {
      throw new Error(`action ${action.actionKey} relation ${definition.relationKey} truth policy is invalid`);
    }
    if (relation.participantRole && !participantRoles.has(relation.participantRole)) {
      throw new Error(`action ${action.actionKey} relation participant ${relation.participantRole} is invalid`);
    }
    if (relation.slotKey) {
      const binding = action.participantProfile.roleBindings.find(
        (item) => item.role === relation.participantRole && item.slotKey === relation.slotKey,
      );
      if (!binding) throw new Error(`action ${action.actionKey} relation slot ${relation.slotKey} is invalid`);
    }
  }
  if (
    !profile.relationRefs.some(
      (relation) =>
        relation.relationDefinitionRef.key === 'action_relation.occurrence_of' &&
        relation.fromRef === '$action_execution' &&
        relation.toRef === action.actionKey,
    )
  ) {
    throw new Error(`action ${action.actionKey} occurrence relation is missing`);
  }
  for (const targetRef of action.targetEntityRefs) {
    if (
      !profile.relationRefs.some(
        (relation) =>
          relation.relationDefinitionRef.key === 'action_relation.acts_on' &&
          relation.fromRef === action.actionKey &&
          relation.toRef === targetRef,
      )
    ) {
      throw new Error(`action ${action.actionKey} target relation ${targetRef} is missing`);
    }
  }
  const institutionalEffectRelations = profile.relationRefs.filter(
    (relation) => relation.relationDefinitionRef.key === 'action_relation.institutional_effect',
  );
  const requiresInstitutionalEffect = INSTITUTIONAL_EFFECT_ACTION_KEYS.includes(action.actionKey);
  if (
    (requiresInstitutionalEffect &&
      (institutionalEffectRelations.length !== 1 ||
        institutionalEffectRelations[0].fromRef !== '$action_execution' ||
        institutionalEffectRelations[0].toRef !== `${action.actionKey}.institutional_effect`)) ||
    (!requiresInstitutionalEffect && institutionalEffectRelations.length)
  ) {
    throw new Error(`action ${action.actionKey} institutional effect relation is invalid`);
  }
  const { fingerprint, ...fingerprintInput } = profile;
  const expectedFingerprint = createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex');
  if (fingerprint !== expectedFingerprint) {
    throw new Error(`action ${action.actionKey} relation profile fingerprint is invalid`);
  }
}

function normalizeActionInstitutionalEffect(
  actionKey: string,
  profile: BusinessActionDefinitionSnapshot['institutionalEffect'],
) {
  if (!profile) throw new Error(`action ${actionKey} institutional effect profile is missing`);
  return {
    ...sortObjectKeys(profile),
    constitutionPolicy: {
      ...sortObjectKeys(profile.constitutionPolicy),
      requiredPreconditionKeys: uniqueSortedStrings(profile.constitutionPolicy.requiredPreconditionKeys),
      requiredChangedFields: uniqueSortedStrings(profile.constitutionPolicy.requiredChangedFields),
      requiredParticipantRoles: [...profile.constitutionPolicy.requiredParticipantRoles],
    },
    formalStateTransition: sortObjectKeys(profile.formalStateTransition),
  };
}

function validateActionInstitutionalEffect(action: BusinessActionDefinitionSnapshot): void {
  const expected = createBusinessActionInstitutionalEffectProfile({
    actionKey: action.actionKey,
    preconditions: action.preconditions,
  });
  const profile = action.institutionalEffect;
  if (!expected) {
    if (profile) throw new Error(`action ${action.actionKey} institutional effect profile is unexpected`);
    return;
  }
  if (!profile) throw new Error(`action ${action.actionKey} institutional effect profile is missing`);
  rejectUnsupportedKeys(
    asRecord(profile),
    ACTION_INSTITUTIONAL_EFFECT_KEYS,
    `action ${action.actionKey} institutional effect profile`,
  );
  if (stableStringify(profile) !== stableStringify(expected)) {
    throw new Error(`action ${action.actionKey} institutional effect profile is invalid`);
  }
}

function normalizeActionModalityPolicy(
  actionKey: string,
  policy: BusinessActionDefinitionSnapshot['modalityPolicy'] | undefined,
) {
  if (!policy) throw new Error(`action ${actionKey} modality policy is missing`);
  return {
    ...sortObjectKeys(policy),
    supportedModalities: uniqueSortedStrings(policy.supportedModalities),
  };
}

function validateActionModalityPolicy(action: BusinessActionDefinitionSnapshot): void {
  const policy = action.modalityPolicy;
  rejectUnsupportedKeys(asRecord(policy), ACTION_MODALITY_POLICY_KEYS, `action ${action.actionKey} modality policy`);
  if (
    policy.schemaVersion !== '1.0' ||
    policy.policyKey !== `${action.actionKey}.speech_act_modality` ||
    policy.supportedModalities.length !== 1 ||
    policy.supportedModalities[0] !== 'request' ||
    policy.unsupportedModalityPolicy !== 'fail_closed' ||
    policy.confirmationReferencePolicy !== 'existing_confirmation_required' ||
    policy.schedulePolicy !== 'action_plan_required' ||
    policy.cancellationReferencePolicy !== 'existing_preview_or_plan_required'
  ) {
    throw new Error(`action ${action.actionKey} modality policy is invalid`);
  }
  const { fingerprint, ...fingerprintInput } = policy;
  const expectedFingerprint = createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex');
  if (fingerprint !== expectedFingerprint) {
    throw new Error(`action ${action.actionKey} modality policy fingerprint is invalid`);
  }
}

function normalizeActionInformationArtifact(
  actionKey: string,
  profile: BusinessActionDefinitionSnapshot['informationArtifact'] | undefined,
) {
  if (!profile) throw new Error(`action ${actionKey} information artifact profile is missing`);
  return sortObjectKeys(profile);
}

function validateActionInformationArtifact(action: BusinessActionDefinitionSnapshot): void {
  const profile = action.informationArtifact;
  rejectUnsupportedKeys(
    asRecord(profile),
    ACTION_INFORMATION_ARTIFACT_KEYS,
    `action ${action.actionKey} information artifact profile`,
  );
  if (
    profile.schemaVersion !== '1.0' ||
    profile.profileKey !== `${action.actionKey}.information_artifact` ||
    profile.referencePolicy !== 'bind_if_present' ||
    profile.artifactTypePolicy !== 'governed_result_reference' ||
    profile.sourcePolicy !== 'completed_brain_run_same_conversation_store_user' ||
    profile.versionPolicy !== 'source_run_and_capability_version' ||
    profile.contentIntegrityPolicy !== 'canonical_content_fingerprint' ||
    profile.supersessionPolicy !== 'explicit_new_reference_only'
  ) {
    throw new Error(`action ${action.actionKey} information artifact profile is invalid`);
  }
  const { fingerprint, ...fingerprintInput } = profile;
  const expectedFingerprint = createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex');
  if (fingerprint !== expectedFingerprint) {
    throw new Error(`action ${action.actionKey} information artifact fingerprint is invalid`);
  }
}

function normalizeActionSideEffectInvariant(
  actionKey: string,
  profile: BusinessActionDefinitionSnapshot['sideEffectInvariant'] | undefined,
) {
  if (!profile) throw new Error(`action ${actionKey} side effect invariant profile is missing`);
  return sortObjectKeys(profile);
}

function validateActionSideEffectInvariant(action: BusinessActionDefinitionSnapshot): void {
  const profile = action.sideEffectInvariant;
  rejectUnsupportedKeys(
    asRecord(profile),
    ACTION_SIDE_EFFECT_INVARIANT_KEYS,
    `action ${action.actionKey} side effect invariant profile`,
  );
  const expectedGuardContractFingerprint = createHash('sha256')
    .update(
      stableStringify({
        actionKey: action.actionKey,
        preconditions: action.preconditions,
        predicateRefs: action.preconditionPredicateRefs,
      }),
    )
    .digest('hex');
  const expectedEffectContractFingerprint = createHash('sha256')
    .update(
      stableStringify({
        actionKey: action.actionKey,
        effects: action.effects,
        effectRefs: action.effectAssertionRefs,
      }),
    )
    .digest('hex');
  if (
    profile.schemaVersion !== '1.2' ||
    profile.profileKey !== `${action.actionKey}.side_effect_invariant` ||
    profile.guardContractFingerprint !== expectedGuardContractFingerprint ||
    profile.effectContractFingerprint !== expectedEffectContractFingerprint ||
    !resolveCuratedActionInvariantContract(profile.invariantContractRef) ||
    resolveCuratedActionInvariantContract(profile.invariantContractRef)?.actionKey !== action.actionKey ||
    profile.undeclaredSideEffectPolicy !== 'forbid' ||
    profile.gatewayEffectPolicy !== 'exact_declared_effect_match' ||
    profile.mutationFootprintEvidencePolicy !== 'exact_database_trigger_observed_write_set' ||
    profile.successEvidencePolicy !== 'all_declared_effects_observed' ||
    profile.partialSuccessPolicy !== 'explicit_partially_succeeded' ||
    profile.recoveryPolicy !== 'gateway_declared_strategy_only' ||
    profile.compensationPolicy !== 'explicit_compensation_action_required' ||
    profile.outcomeObservationPolicy !== 'required_for_async_effects'
  ) {
    throw new Error(`action ${action.actionKey} side effect invariant profile is invalid`);
  }
  const { fingerprint, ...fingerprintInput } = profile;
  const expectedFingerprint = createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex');
  if (fingerprint !== expectedFingerprint) {
    throw new Error(`action ${action.actionKey} side effect invariant fingerprint is invalid`);
  }
}

function normalizeActionSituationContext(
  actionKey: string,
  profile: BusinessActionDefinitionSnapshot['situationContext'] | undefined,
) {
  if (!profile?.businessTimePolicy || !profile.actorPolicy) {
    throw new Error(`action ${actionKey} situation context is missing`);
  }
  return {
    ...sortObjectKeys(profile),
    businessTimePolicy: sortObjectKeys(profile.businessTimePolicy),
    actorPolicy: sortObjectKeys(profile.actorPolicy),
  };
}

function validateActionSituationContext(action: BusinessActionDefinitionSnapshot): void {
  const profile = action.situationContext;
  if (
    profile.schemaVersion !== '1.0' ||
    profile.profileKey !== `${action.actionKey}.situation_context` ||
    profile.tenantBoundary !== 'current_store' ||
    profile.requestChannelPolicy !== 'bind_if_present' ||
    profile.devicePolicy !== 'bind_if_present' ||
    profile.conversationPolicy !== 'same_conversation' ||
    profile.businessTimePolicy.timezone !== 'Asia/Shanghai' ||
    profile.businessTimePolicy.businessDatePolicy !== 'same_business_date' ||
    profile.businessTimePolicy.clockSource !== 'server' ||
    profile.actorPolicy.subjectPolicy !== 'same_authenticated_user' ||
    profile.actorPolicy.qualificationPolicy !== 'revalidate_current_role_and_permission'
  ) {
    throw new Error(`action ${action.actionKey} situation context is invalid`);
  }
  const { fingerprint, ...fingerprintInput } = profile;
  const expectedFingerprint = createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex');
  if (fingerprint !== expectedFingerprint) {
    throw new Error(`action ${action.actionKey} situation context fingerprint is invalid`);
  }
}

function normalizeActionLexicalFrame(frame: BusinessActionDefinitionSnapshot['lexicalFrame']) {
  return {
    ...sortObjectKeys(frame),
    lexicalUnits: uniqueSortedStrings(frame.lexicalUnits),
    thematicRoles: [...frame.thematicRoles]
      .map((role) => ({ ...sortObjectKeys(role), slotKeys: uniqueSortedStrings(role.slotKeys) }))
      .sort((left, right) => left.semanticRole.localeCompare(right.semanticRole)),
    semanticPredicates: uniqueSortedStrings(frame.semanticPredicates),
    contrasts: [...frame.contrasts]
      .map((contrast) => ({
        ...sortObjectKeys(contrast),
        discriminators: [...contrast.discriminators]
          .map(sortObjectKeys)
          .sort(
            (left, right) =>
              left.dimension.localeCompare(right.dimension) ||
              left.currentActionValue.localeCompare(right.currentActionValue) ||
              left.contrastActionValue.localeCompare(right.contrastActionValue),
          ),
      }))
      .sort((left, right) => left.conceptKey.localeCompare(right.conceptKey)),
  };
}

function validateActionLexicalFrame(action: BusinessActionDefinitionSnapshot): void {
  const frame = action.lexicalFrame;
  if (frame.schemaVersion !== '1.0' || frame.frameKey !== `${action.actionKey}.lexical_frame`) {
    throw new Error(`action ${action.actionKey} lexical frame identity is invalid`);
  }
  if (!frame.lexicalUnits.length || !frame.lexicalUnits.includes(action.name)) {
    throw new Error(`action ${action.actionKey} lexical units are incomplete`);
  }
  for (const alias of action.aliases) {
    if (!frame.lexicalUnits.includes(alias))
      throw new Error(`action ${action.actionKey} lexical alias ${alias} is missing`);
  }
  const slotsByKey = new Map(action.inputSlots.map((slot) => [slot.slotKey, slot]));
  const coveredSlots = new Set<string>();
  for (const role of frame.thematicRoles) {
    if (!role.slotKeys.length) throw new Error(`action ${action.actionKey} lexical role ${role.semanticRole} is empty`);
    for (const slotKey of role.slotKeys) {
      const slot = slotsByKey.get(slotKey);
      if (!slot || slot.semanticRole !== role.semanticRole || coveredSlots.has(slotKey)) {
        throw new Error(`action ${action.actionKey} lexical role slot ${slotKey} is invalid`);
      }
      coveredSlots.add(slotKey);
    }
  }
  if (coveredSlots.size !== action.inputSlots.length || !frame.semanticPredicates.length || !frame.contrasts.length) {
    throw new Error(`action ${action.actionKey} lexical frame is incomplete`);
  }
  const semanticErrors = validateBusinessActionSemanticPredicates(frame.semanticPredicates, {
    actionKey: action.actionKey,
    actionClass: action.actionClass,
    targetEntityRefs: action.targetEntityRefs,
    preconditions: action.preconditions,
    effects: action.effects,
  });
  if (semanticErrors.length) {
    throw new Error(`action ${action.actionKey} lexical semantics are invalid: ${semanticErrors.join(',')}`);
  }
  const contrastKeys = new Set<string>();
  for (const contrast of frame.contrasts) {
    if (
      !/^(?:action|speech)\.[a-z][a-z0-9_]*$/u.test(contrast.conceptKey) ||
      contrast.conceptKey === action.actionKey ||
      contrastKeys.has(contrast.conceptKey) ||
      !contrast.name.trim() ||
      !contrast.discriminators.length
    ) {
      throw new Error(`action ${action.actionKey} lexical contrast ${contrast.conceptKey} is invalid`);
    }
    contrastKeys.add(contrast.conceptKey);
    for (const discriminator of contrast.discriminators) {
      if (
        !ACTION_LEXICAL_DISCRIMINATOR_DIMENSIONS.has(discriminator.dimension) ||
        !discriminator.currentActionValue.trim() ||
        !discriminator.contrastActionValue.trim()
      ) {
        throw new Error(`action ${action.actionKey} lexical discriminator is invalid`);
      }
    }
  }
  const { fingerprint, ...fingerprintInput } = frame;
  const expectedFingerprint = createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex');
  if (fingerprint !== expectedFingerprint) {
    throw new Error(`action ${action.actionKey} lexical frame fingerprint is invalid`);
  }
}

function validateActionSemanticContractKeys(
  actionKey: string,
  kind: 'predicate' | 'effect',
  keys: readonly string[],
  refs: readonly { key: string }[],
): void {
  rejectDuplicateKeys(refs, `action ${actionKey} ${kind} contract`, (ref) => ref.key);
  const refKeys = refs.map((ref) => ref.key).sort();
  if (JSON.stringify([...keys].sort()) !== JSON.stringify(refKeys)) {
    throw new Error(`action ${actionKey} ${kind} contract keys do not match`);
  }
}

function validateResolverMetric(metric: BusinessMetricDefinitionSnapshot, dataModel: PrismaRuntimeDataModel): void {
  const runtimeQuery = metric.runtimeQuery;
  const resolver = runtimeQuery?.resolver;
  if (!runtimeQuery || !resolver) throw new Error(`metric ${metric.metricKey} resolver runtime is required`);
  const formula = asRecord(metric.formula);
  const formulaType = nonEmptyString(formula.type)?.toLocaleLowerCase('en-US');
  if (formulaType !== runtimeQuery.aggregation) {
    throw new Error(`metric ${metric.metricKey} resolver formula type must match runtime aggregation`);
  }
  rejectUnsupportedKeys(formula, new Set(['type', 'resolver']), `metric ${metric.metricKey} formula`);
  if (JSON.stringify(formula.resolver) !== JSON.stringify(resolver)) {
    throw new Error(`metric ${metric.metricKey} resolver formula must match runtime resolver`);
  }
  const references = Array.isArray(metric.source) ? metric.source : [metric.source];
  const sourceModels: string[] = [];
  for (const reference of references) {
    if (!isRecord(reference)) throw new Error(`metric ${metric.metricKey} source must declare a Prisma model`);
    rejectUnsupportedKeys(reference, PHYSICAL_SOURCE_KEYS, `metric ${metric.metricKey} source`);
    const modelName = nonEmptyString(reference.model);
    if (!modelName) throw new Error(`metric ${metric.metricKey} source must declare a Prisma model`);
    const model = dataModel.models[modelName];
    if (!model) throw new Error(`Prisma model ${modelName} does not exist`);
    const fieldName = nonEmptyString(reference.field);
    if (fieldName && !model.fields.some((field) => field.name === fieldName)) {
      throw new Error(`Prisma field ${modelName}.${fieldName} does not exist`);
    }
    sourceModels.push(modelName);
  }
  const scopeModel = dataModel.models[runtimeQuery.storeScope.model];
  if (!scopeModel?.fields.some((field) => field.name === runtimeQuery.storeScope.field)) {
    throw new Error(`Prisma field ${runtimeQuery.storeScope.model}.${runtimeQuery.storeScope.field} does not exist`);
  }
  evaluateBusinessMetricResolver({
    metricKey: metric.metricKey,
    resolver,
    dimensions: runtimeQuery.dimensions,
    outputField: runtimeQuery.outputFields[0],
    sourceModels,
    storeScope: runtimeQuery.storeScope,
    rows: [],
  });
}

function validateEntityMapping(entity: BusinessEntityDefinitionSnapshot, dataModel: PrismaRuntimeDataModel): void {
  const tableMap = asRecord(entity.tableMap);
  if (tableMap.strategy === 'semantic_layer_mapping_required') {
    throw new Error(`entity ${entity.entityKey} uses placeholder strategy semantic_layer_mapping_required`);
  }
  const modelName = nonEmptyString(tableMap.model);
  if (!modelName) {
    throw new Error(`entity ${entity.entityKey} tableMap.model is required`);
  }
  const model = dataModel.models[modelName];
  if (!model) {
    throw new Error(`Prisma model ${modelName} does not exist`);
  }
  const fields = asRecord(tableMap.fields);
  for (const fieldName of Object.values(fields)) {
    if (typeof fieldName !== 'string') {
      throw new Error(`entity ${entity.entityKey} tableMap fields must be strings`);
    }
    if (!model.fields.some((field) => field.name === fieldName)) {
      throw new Error(`Prisma field ${modelName}.${fieldName} does not exist`);
    }
  }
}

function validateRelationMapping(
  relation: BusinessRelationDefinitionSnapshot,
  from: BusinessEntityDefinitionSnapshot,
  to: BusinessEntityDefinitionSnapshot,
  dataModel: PrismaRuntimeDataModel,
): void {
  const joinPath = asRecord(relation.joinPath);
  if (joinPath.strategy === 'knowledge_graph_path') {
    throw new Error(`relation ${relation.relationKey} uses placeholder strategy knowledge_graph_path`);
  }
  if (!Array.isArray(joinPath.path) || joinPath.path.length === 0) {
    throw new Error(`relation ${relation.relationKey} joinPath.path is required`);
  }
  let currentModelName = nonEmptyString(asRecord(from.tableMap).model)!;
  for (const segment of joinPath.path) {
    if (typeof segment !== 'string' || !segment) {
      throw new Error(`relation ${relation.relationKey} joinPath.path must contain field names`);
    }
    const field = dataModel.models[currentModelName]?.fields.find(
      (candidate) => candidate.name === segment && candidate.kind === 'object',
    );
    if (!field) {
      throw new Error(`Prisma relation field ${currentModelName}.${segment} does not exist`);
    }
    currentModelName = field.type;
  }
  const expectedModelName = nonEmptyString(asRecord(to.tableMap).model)!;
  if (currentModelName !== expectedModelName) {
    throw new Error(
      `relation ${relation.relationKey} join path ends at ${currentModelName}, expected ${expectedModelName}`,
    );
  }
}

function validateMetricSource(metricKey: string, source: unknown, dataModel: PrismaRuntimeDataModel): Set<string> {
  const references = Array.isArray(source) ? source : [source];
  const sourceRefs = new Set<string>();
  for (const reference of references) {
    if (!isRecord(reference)) {
      throw new Error(`metric ${metricKey} source must declare a Prisma model`);
    }
    const modelName = nonEmptyString(reference.model);
    const fieldName = nonEmptyString(reference.field);
    if (!modelName) {
      throw new Error(`metric ${metricKey} source must declare a Prisma model`);
    }
    if (!fieldName) {
      throw new Error(`metric ${metricKey} source must declare a Prisma model and field`);
    }
    rejectUnsupportedKeys(reference, PHYSICAL_SOURCE_KEYS, `metric ${metricKey} source`);
    const model = dataModel.models[modelName];
    if (!model) {
      throw new Error(`Prisma model ${modelName} does not exist`);
    }
    if (!model.fields.some((field) => field.name === fieldName)) {
      throw new Error(`Prisma field ${modelName}.${fieldName} does not exist`);
    }
    sourceRefs.add(physicalFieldRef(modelName, fieldName));
  }
  return sourceRefs;
}

function validateMetricFormula(
  metricKey: string,
  formula: unknown,
  sourceRefs: ReadonlySet<string>,
  dataModel: PrismaRuntimeDataModel,
): void {
  if (!isRecord(formula)) {
    throw new Error(`metric ${metricKey} formula must be a controlled object`);
  }
  const formulaKeys = new Set(Object.keys(formula).map((key) => key.toLocaleLowerCase('en-US')));
  const formulaType = nonEmptyString(formula.type)?.toLocaleLowerCase('en-US');
  if (formulaKeys.has('sql') || formulaKeys.has('query') || formulaType === 'sql' || formulaType === 'query') {
    throw new Error(`metric ${metricKey} formula cannot contain sql or query`);
  }
  rejectUnsupportedKeys(formula, METRIC_FORMULA_KEYS, `metric ${metricKey} formula`);
  if (!formulaType) {
    throw new Error(`metric ${metricKey} formula.type is required`);
  }
  if (!METRIC_FORMULA_TYPES.has(formulaType)) {
    throw new Error(`metric ${metricKey} formula.type must be one of ${Array.from(METRIC_FORMULA_TYPES).join(', ')}`);
  }
  const fieldName = nonEmptyString(formula.field);
  if (!fieldName) {
    throw new Error(`metric ${metricKey} formula.field is required`);
  }
  const modelName = nonEmptyString(formula.model);
  if (!modelName) {
    throw new Error(`metric ${metricKey} formula.model is required`);
  }
  const model = dataModel.models[modelName];
  if (!model) {
    throw new Error(`Prisma model ${modelName} does not exist`);
  }
  if (!model.fields.some((field) => field.name === fieldName)) {
    throw new Error(`Prisma field ${modelName}.${fieldName} does not exist`);
  }
  if (!sourceRefs.has(physicalFieldRef(modelName, fieldName))) {
    throw new Error(`metric ${metricKey} formula reference ${modelName}.${fieldName} is not declared in source`);
  }
}

function physicalFieldRef(modelName: string, fieldName: string): string {
  return `${modelName}\u0000${fieldName}`;
}

function validateDimensionSource(dimensionKey: string, source: unknown, dataModel: PrismaRuntimeDataModel): void {
  if (!isRecord(source)) {
    throw new Error(`dimension ${dimensionKey} source must declare a Prisma model and field`);
  }
  const modelName = nonEmptyString(source.model);
  const fieldName = nonEmptyString(source.field);
  if (!modelName || !fieldName) {
    throw new Error(`dimension ${dimensionKey} source must declare a Prisma model and field`);
  }
  rejectUnsupportedKeys(source, PHYSICAL_SOURCE_KEYS, `dimension ${dimensionKey} source`);
  const model = dataModel.models[modelName];
  if (!model) {
    throw new Error(`Prisma model ${modelName} does not exist`);
  }
  if (!model.fields.some((field) => field.name === fieldName)) {
    throw new Error(`Prisma field ${modelName}.${fieldName} does not exist`);
  }
}

function rejectDuplicateKeys<T>(definitions: readonly T[], kind: string, getKey: (definition: T) => string): void {
  const seen = new Set<string>();
  for (const definition of definitions) {
    const key = getKey(definition);
    if (seen.has(key)) {
      throw new Error(`duplicate active ${kind} key: ${key}`);
    }
    seen.add(key);
  }
}

function aliasResult(
  matchType: 'exact' | 'prefix' | 'fuzzy',
  entities: BusinessEntityDefinitionSnapshot[],
): EntityAliasResolution {
  const refs = entities
    .map((entity) => definitionRef('entity', entity.entityKey, entity))
    .sort((left, right) => left.definitionKey.localeCompare(right.definitionKey));
  if (entities.length === 1) {
    return { status: 'resolved', matchType, entity: entities[0], refs };
  }
  return { status: 'ambiguity', matchType, refs };
}

function definitionRef(
  definitionType: BusinessDefinitionKind,
  _key: string,
  definition: {
    definitionKey: string;
    version: number;
    definitionFingerprint: string;
    sourceFingerprint: string;
  },
): BusinessDefinitionRef {
  return {
    definitionType,
    definitionKey: definition.definitionKey,
    definitionVersion: definition.version,
    definitionFingerprint: definition.definitionFingerprint,
    sourceFingerprint: definition.sourceFingerprint,
  };
}

function entityAliases(entity: BusinessEntityDefinitionSnapshot): string[] {
  return Array.from(new Set([entity.entityKey, entity.name, ...entity.aliases].map(normalizeAlias).filter(Boolean)));
}

function buildEntityAliasIndex(entities: readonly BusinessEntityDefinitionSnapshot[]): EntityAliasIndex {
  const exact = new Map<string, BusinessEntityDefinitionSnapshot[]>();
  const candidates = entities.map((entity) => {
    const aliases = entityAliases(entity);
    for (const alias of aliases) {
      const matches = exact.get(alias) ?? [];
      matches.push(entity);
      exact.set(alias, matches);
    }
    return { entity, aliases };
  });
  return { exact, candidates };
}

function normalizeAlias(value: string): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, '') : '';
}

function uniqueEntities(entities: BusinessEntityDefinitionSnapshot[]): BusinessEntityDefinitionSnapshot[] {
  return Array.from(new Map(entities.map((entity) => [entity.entityKey, entity])).values()).sort((left, right) =>
    left.definitionKey.localeCompare(right.definitionKey),
  );
}

function levenshtein(left: string, right: string): number {
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  const previous = Array.from({ length: rightChars.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= leftChars.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= rightChars.length; rightIndex += 1) {
      const cost = leftChars[leftIndex - 1] === rightChars[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[rightChars.length];
}

function addJoinStep(adjacency: Map<string, GovernedJoinStep[]>, entityKey: string, step: GovernedJoinStep): void {
  const steps = adjacency.get(entityKey) ?? [];
  steps.push(step);
  adjacency.set(entityKey, steps);
}

function compareDefinition(
  left: { definitionKey: string; version: number },
  right: { definitionKey: string; version: number },
): number {
  return left.definitionKey.localeCompare(right.definitionKey) || left.version - right.version;
}

function hasDefinitionValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys) as T;
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys(value[key])]),
  ) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value as UnknownRecord)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rejectUnsupportedKeys(value: UnknownRecord, allowedKeys: ReadonlySet<string>, subject: string): void {
  const unsupportedKeys = Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .sort();
  if (unsupportedKeys.length > 0) {
    throw new Error(`${subject} contains unsupported keys: ${unsupportedKeys.join(', ')}`);
  }
}
