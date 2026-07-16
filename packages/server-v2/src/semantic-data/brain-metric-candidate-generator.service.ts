import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { canonicalizeBusinessDefinition } from './business-definition-projection-compiler.service.js';
import {
  getBusinessMetricResolverContract,
  validateBusinessMetricResolverStoreScope,
} from './business-metric-resolver-contract.js';
import { isExecutableOwnerRelation, type PrismaDatamodelAst } from './brain-semantic-candidate.types.js';
import type {
  BrainMetricCandidateGenerationResult,
  BrainMetricCandidateResult,
  BrainMetricPayloadFragment,
  BrainMetricResolverExpression,
  BrainMetricSourceObservation,
  CanonicalMetricPayload,
} from './brain-metric-candidate.types.js';

const METRIC_VALUE_TYPES = new Set(['money', 'count', 'percent', 'duration', 'score']);
const METRIC_AGGREGATIONS = new Set(['sum', 'count', 'count_distinct', 'avg', 'ratio', 'score']);
const NUMERIC_PRISMA_TYPES = new Set(['Int', 'BigInt', 'Float', 'Decimal']);
const METRIC_TIMEZONES = new Set(['Asia/Shanghai', 'UTC']);

interface GenerateMetricCandidatesInput {
  observations: BrainMetricSourceObservation[];
  datamodel: PrismaDatamodelAst;
  registeredPermissions: ReadonlySet<string>;
}

@Injectable()
export class BrainMetricCandidateGeneratorService {
  generate(input: GenerateMetricCandidatesInput): BrainMetricCandidateGenerationResult {
    const aliasConflicts = findAliasConflicts(input.observations);
    const byMetric = groupByMetric(input.observations);
    const candidates = [...byMetric.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([metricKey, observations]) =>
        this.generateCandidate(metricKey, observations, aliasConflicts, input.datamodel, input.registeredPermissions),
      );
    return {
      candidates,
      summary: {
        total: candidates.length,
        draft: candidates.filter((candidate) => candidate.status === 'draft').length,
        blocked: candidates.filter((candidate) => candidate.status === 'blocked').length,
      },
    };
  }

  private generateCandidate(
    metricKey: string,
    observations: BrainMetricSourceObservation[],
    aliasConflicts: Map<string, Set<string>>,
    datamodel: PrismaDatamodelAst,
    registeredPermissions: ReadonlySet<string>,
  ): BrainMetricCandidateResult {
    const reasons = new Set(observations.flatMap((observation) => observation.blockedReasons ?? []));
    const aliases = unique(
      observations
        .filter(isTrustedAliasObservation)
        .flatMap((observation) => observation.aliases ?? []),
    );
    for (const alias of aliases) {
      if ((aliasConflicts.get(normalizeAlias(alias))?.size ?? 0) > 1) reasons.add(`metric_alias_collision:${alias}`);
    }

    const canonical = selectCanonicalPayload(observations, reasons);
    if (canonical) {
      reasons.delete('missing_executable_formula');
      reasons.delete('opaque_sql_formula');
    }
    const hasTemplate = observations.some((observation) => observation.sourceKind === 'template_declaration');
    const hasVerified = observations.some((observation) => observation.sourceKind === 'verified_executable_binding');
    if (!hasVerified) {
      reasons.add('missing_verified_executable_binding');
    }
    if (!hasTemplate) reasons.add('missing_template_declaration');

    if (!canonical) {
      reasons.add('incomplete_verified_formula');
      if (!hasPermissionEvidence(observations)) reasons.add('missing_permission_binding');
      reasons.add('missing:timePolicy');
      reasons.add('missing:exceptionPolicy.fallback');
      return blockedCandidate(metricKey, aliases, observations, reasons);
    }

    if (canonical.metricKey !== metricKey) reasons.add(`metric_identity_mismatch:${canonical.metricKey}`);

    validateSupportingDeclarations(canonical, observations, reasons);
    validateVerifiedBindings(metricKey, canonical, observations, reasons);
    validateCanonicalPayload(canonical, datamodel, registeredPermissions, reasons);
    if (reasons.size > 0) {
      return blockedCandidate(
        metricKey,
        aliases,
        observations,
        reasons,
        metricDraftInput(metricKey, aliases, observations, canonical, 'candidate'),
      );
    }

    return {
      metricKey,
      status: 'draft',
      blockedReasons: [],
      aliases,
      observations,
      draftInput: metricDraftInput(metricKey, aliases, observations, canonical, 'draft'),
    };
  }
}

function validateSupportingDeclarations(
  canonical: CanonicalMetricPayload,
  observations: BrainMetricSourceObservation[],
  reasons: Set<string>,
) {
  const templateDeclarations = observations.filter(
    (observation) => observation.sourceKind === 'template_declaration' && observation.payload,
  );
  if (
    templateDeclarations.length > 0 &&
    !templateDeclarations.some((observation) => templateDeclarationMatches(canonical, observation.payload!))
  ) {
    reasons.add('conflict:no_compatible_template_declaration');
  }
  for (const observation of observations) {
    if (!observation.payload) continue;
    if (observation.sourceKind === 'verified_executable_binding') {
      for (const conflict of findFragmentConflicts(observation.payload, canonical)) reasons.add(`conflict:${conflict}`);
      continue;
    }
    if (observation.sourceKind === 'published_definition') continue;
    if (observation.sourceKind === 'template_declaration') continue;
    if (observation.sourceKind === 'metric_declaration') {
      validateMetricDeclaration(canonical, observation.payload, reasons);
    }
  }
}

function templateDeclarationMatches(
  canonical: CanonicalMetricPayload,
  declaration: BrainMetricPayloadFragment,
): boolean {
  return (
    isSubset(canonical.sourceModels, declaration.sourceModels) &&
    isSubset(canonical.dimensions, declaration.dimensions) &&
    isSubset(canonical.bindings.template, declaration.bindings?.template) &&
    isSubset(canonical.bindings.capability, declaration.bindings?.capability)
  );
}

function validateMetricDeclaration(
  canonical: CanonicalMetricPayload,
  declaration: BrainMetricPayloadFragment,
  reasons: Set<string>,
) {
  for (const key of ['valueType', 'sensitive'] as const) {
    if (declaration[key] !== undefined && declaration[key] !== canonical[key]) reasons.add(`conflict:${key}`);
  }
  if (
    declaration.measure?.aggregation !== undefined &&
    declaration.measure.aggregation !== canonical.measure.aggregation
  ) {
    reasons.add('conflict:measure.aggregation');
  }
  requireSubset(canonical.allowedTaskTypes ?? [], declaration.allowedTaskTypes, 'allowedTaskTypes', reasons, true);
}

function requireSubset(
  required: readonly string[],
  declared: readonly unknown[] | undefined,
  label: string,
  reasons: Set<string>,
  skipWhenMissing = false,
) {
  if (skipWhenMissing && declared === undefined) return;
  const values = new Set((declared ?? []).filter((item): item is string => typeof item === 'string'));
  for (const value of required) {
    if (!values.has(value)) reasons.add(`conflict:${label}:${value}`);
  }
}

function isSubset(required: readonly string[], declared: readonly unknown[] | undefined): boolean {
  const values = new Set(
    (declared ?? [])
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeSemanticBinding),
  );
  return required.map(normalizeSemanticBinding).every((value) => values.has(value));
}

function normalizeSemanticBinding(value: string): string {
  return value.startsWith('capability:') ? value.slice('capability:'.length) : value;
}

function groupByMetric(observations: BrainMetricSourceObservation[]) {
  const grouped = new Map<string, BrainMetricSourceObservation[]>();
  for (const observation of observations) {
    const values = grouped.get(observation.metricKey) ?? [];
    values.push(observation);
    grouped.set(observation.metricKey, values);
  }
  return grouped;
}

function findAliasConflicts(observations: BrainMetricSourceObservation[]) {
  const aliases = new Map<string, Set<string>>();
  for (const observation of observations) {
    if (!isTrustedAliasObservation(observation)) continue;
    for (const alias of observation.aliases ?? []) {
      const key = normalizeAlias(alias);
      const metrics = aliases.get(key) ?? new Set<string>();
      metrics.add(observation.metricKey);
      aliases.set(key, metrics);
    }
  }
  return aliases;
}

function isTrustedAliasObservation(observation: BrainMetricSourceObservation) {
  return (
    observation.sourceKind === 'published_definition' ||
    observation.sourceKind === 'verified_executable_binding' ||
    observation.sourceKind === 'language_evidence'
  );
}

function selectCanonicalPayload(
  observations: BrainMetricSourceObservation[],
  reasons: Set<string>,
): CanonicalMetricPayload | undefined {
  const sources = observations.filter(
    (observation) =>
      (observation.sourceKind === 'published_definition' || observation.sourceKind === 'verified_executable_binding') &&
      isCanonicalMetricPayload(observation.payload),
  );
  if (!sources.length) return undefined;
  const highest = sources.some((source) => source.sourceKind === 'verified_executable_binding')
    ? sources.filter((source) => source.sourceKind === 'verified_executable_binding')
    : sources;
  const fingerprints = new Set(highest.map((source) => canonicalMetricValue(source.payload)));
  if (fingerprints.size > 1) reasons.add('conflict:canonical_payload');
  return normalizeCanonicalPayload(highest[0].payload as CanonicalMetricPayload);
}

function isCanonicalMetricPayload(value: unknown): value is CanonicalMetricPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.metricKey === 'string' &&
    typeof value.description === 'string' &&
    typeof value.valueType === 'string' &&
    isRecord(value.measure) &&
    typeof value.measure.aggregation === 'string' &&
    (typeof value.measure.model === 'string' || isRecord(value.measure.resolver)) &&
    Array.isArray(value.sourceModels) &&
    Array.isArray(value.joinPath) &&
    Array.isArray(value.filters) &&
    Array.isArray(value.dimensions) &&
    isRecord(value.timePolicy) &&
    typeof value.timePolicy.mode === 'string' &&
    typeof value.timePolicy.boundary === 'string' &&
    typeof value.timePolicy.timezone === 'string' &&
    isRecord(value.storeScope) &&
    value.storeScope.mode === 'current_store' &&
    Array.isArray(value.storeScope.joinPath) &&
    Array.isArray(value.permissionPolicies) &&
    isRecord(value.exceptionPolicy) &&
    typeof value.exceptionPolicy.fallback === 'string' &&
    isRecord(value.bindings) &&
    Array.isArray(value.bindings.template) &&
    Array.isArray(value.bindings.capability) &&
    Array.isArray(value.bindings.executor) &&
    Array.isArray(value.bindings.outputField)
  );
}

function findFragmentConflicts(fragment: BrainMetricPayloadFragment, canonical: CanonicalMetricPayload): string[] {
  const conflicts: string[] = [];
  compareFragment(fragment, canonical, '', conflicts);
  return conflicts;
}

function compareFragment(fragment: unknown, canonical: unknown, path: string, conflicts: string[]) {
  if (fragment === undefined) return;
  if (canonical === undefined) {
    conflicts.push(path);
    return;
  }
  if (Array.isArray(fragment)) {
    if (canonicalMetricValue(fragment, path) !== canonicalMetricValue(canonical, path)) conflicts.push(path);
    return;
  }
  if (isRecord(fragment)) {
    if (!isRecord(canonical)) {
      conflicts.push(path);
      return;
    }
    for (const [key, value] of Object.entries(fragment)) {
      compareFragment(value, canonical[key], path ? `${path}.${key}` : key, conflicts);
    }
    return;
  }
  if (canonicalMetricValue(fragment, path) !== canonicalMetricValue(canonical, path)) conflicts.push(path);
}

function validateCanonicalPayload(
  payload: CanonicalMetricPayload,
  datamodel: PrismaDatamodelAst,
  registeredPermissions: ReadonlySet<string>,
  reasons: Set<string>,
) {
  const models = new Map(datamodel.models.map((model) => [model.name, model]));
  if (!payload.description.trim()) reasons.add('missing_metric_description');
  if (!METRIC_VALUE_TYPES.has(payload.valueType)) reasons.add(`invalid_value_type:${payload.valueType}`);
  const allowedTaskTypes = new Set(['query', 'ranking', 'recommendation', 'diagnosis', 'forecast', 'draft', 'workflow', 'clarify']);
  if (!payload.allowedTaskTypes?.length) reasons.add('missing_allowed_task_types');
  for (const taskType of payload.allowedTaskTypes ?? []) {
    if (!allowedTaskTypes.has(taskType)) reasons.add(`invalid_allowed_task_type:${taskType}`);
  }
  if (typeof payload.sensitive !== 'boolean') reasons.add('missing_sensitive_flag');
  if (!METRIC_AGGREGATIONS.has(payload.measure.aggregation)) {
    reasons.add(`invalid_aggregation:${payload.measure.aggregation}`);
  }
  if (!payload.sourceModels.length) reasons.add('missing_source_models');
  for (const sourceModel of payload.sourceModels) {
    if (!models.has(sourceModel)) reasons.add(`unknown_source_model:${sourceModel}`);
  }
  const resolver = payload.measure.resolver;
  if (resolver) {
    if (!['score', 'ratio'].includes(payload.measure.aggregation)) reasons.add('invalid_resolver_aggregation');
    if (payload.measure.model || payload.measure.field || payload.measure.distinctField) {
      reasons.add('resolver_measure_must_not_duplicate_prisma_measure');
    }
    validateMetricResolver(resolver, reasons);
  } else {
    const measureModelName = payload.measure.model ?? '';
    const measureModel = models.get(measureModelName);
    if (!measureModelName) reasons.add('missing_measure_model');
    if (!payload.sourceModels.includes(measureModelName)) reasons.add('measure_model_not_in_source_models');
    if (!measureModel) reasons.add(`unknown_measure_model:${measureModelName}`);
    else if (payload.measure.field) {
      const measureField = measureModel.fields.find((field) => field.name === payload.measure.field);
      if (!measureField) reasons.add(`unknown_measure_field:${measureModelName}.${payload.measure.field}`);
      else if (measureField.kind === 'object') {
        reasons.add(`invalid_measure_field_kind:${measureModelName}.${payload.measure.field}`);
      } else if (
        ['sum', 'avg', 'ratio', 'score'].includes(payload.measure.aggregation) &&
        !NUMERIC_PRISMA_TYPES.has(measureField.type)
      ) {
        reasons.add(`invalid_numeric_measure_field:${measureModelName}.${payload.measure.field}`);
      }
    }
    if (payload.measure.aggregation === 'count_distinct') {
      if (!payload.measure.distinctField) reasons.add('missing_distinct_field');
      else {
        const distinctField = measureModel?.fields.find((field) => field.name === payload.measure.distinctField);
        if (!distinctField || distinctField.kind === 'object') {
          reasons.add(`invalid_distinct_field:${measureModelName}.${payload.measure.distinctField}`);
        }
      }
    } else if (payload.measure.distinctField) {
      reasons.add('unexpected_distinct_field');
    }
  }
  for (const step of payload.joinPath) validateJoinStep(step, models, reasons);
  for (const filter of payload.filters) {
    if (!models.get(filter.model)?.fields.some((field) => field.name === filter.field)) {
      reasons.add(`unknown_filter_field:${filter.model}.${filter.field}`);
    }
  }
  if (!['event_time', 'as_of_snapshot'].includes(payload.timePolicy.mode)) {
    reasons.add(`invalid_time_mode:${payload.timePolicy.mode}`);
  }
  if (!['[start,end)', 'as_of'].includes(payload.timePolicy.boundary)) {
    reasons.add(`invalid_time_boundary:${payload.timePolicy.boundary}`);
  }
  if (!METRIC_TIMEZONES.has(payload.timePolicy.timezone)) {
    reasons.add(`invalid_timezone:${payload.timePolicy.timezone}`);
  }
  if (payload.timePolicy.mode === 'event_time') {
    if (!payload.timePolicy.field) reasons.add('missing_event_time_field');
    if (payload.timePolicy.boundary !== '[start,end)') reasons.add('invalid_event_time_boundary');
  }
  if (payload.timePolicy.mode === 'as_of_snapshot' && payload.timePolicy.boundary !== 'as_of') {
    reasons.add('invalid_snapshot_time_boundary');
  }
  validatePathField(payload.timePolicy.field, models, 'DateTime', 'invalid_time_field', reasons);
  validateStoreScope(payload, models, reasons);
  validateBindings(payload, reasons);
  if (!payload.permissionPolicies.length) {
    reasons.add('missing_permission_policy');
    reasons.add('missing_permission_binding');
  }
  const capabilityBindings = new Set(payload.bindings.capability);
  for (const policy of payload.permissionPolicies) {
    if (!policy.bindingRef.trim() || !policy.allOf.length) {
      reasons.add('missing_permission_binding');
      reasons.add(`missing_permission_binding:${policy.bindingRef || 'unknown'}`);
    }
    if (!capabilityBindings.has(policy.bindingRef)) {
      reasons.add(`permission_binding_capability_mismatch:${policy.bindingRef}`);
    }
    for (const permission of policy.allOf) {
      if (!registeredPermissions.has(permission)) reasons.add(`unregistered_permission:${permission}`);
    }
  }
  for (const [key, value] of Object.entries(payload.exceptionPolicy)) {
    if (!value.trim()) reasons.add(`missing_exception_policy:${key}`);
  }
}

function validateVerifiedBindings(
  metricKey: string,
  canonical: CanonicalMetricPayload,
  observations: BrainMetricSourceObservation[],
  reasons: Set<string>,
) {
  const canonicalPermissions = new Set(canonical.permissionPolicies.flatMap((policy) => policy.allOf));
  const verifiedObservations = observations.filter(
    (observation) => observation.sourceKind === 'verified_executable_binding',
  );
  const verifiedQueryKeys = new Set(
    verifiedObservations.flatMap((observation) => (observation.binding.queryKey ? [observation.binding.queryKey] : [])),
  );
  for (const observation of verifiedObservations) {
    const binding = observation.binding;
    if (binding.queryKey !== metricKey) {
      reasons.add(`verified_binding_query_mismatch:${binding.queryKey ?? 'missing'}`);
    }
    if (!binding.executorRef || !canonical.bindings.executor.includes(binding.executorRef)) {
      reasons.add(`verified_binding_executor_mismatch:${binding.executorRef ?? 'missing'}`);
    }
  }

  const legacyBindings = observations.filter((observation) => observation.sourceKind === 'legacy_metric_binding');
  for (const observation of legacyBindings) {
    const queryKey = observation.binding?.queryKey;
    if (!queryKey || queryKey !== metricKey || !verifiedQueryKeys.has(queryKey)) {
      reasons.add(`legacy_binding_query_mismatch:${queryKey ?? 'missing'}`);
    }
  }
  const completeLegacyBindings = legacyBindings.filter(
    (observation) =>
      observation.binding?.queryKey === metricKey &&
      verifiedQueryKeys.has(metricKey) &&
      Boolean(observation.binding.outputField) &&
      Boolean(observation.binding.permissionAllOf?.length),
  );
  if (legacyBindings.length > 0 && completeLegacyBindings.length === 0) {
    reasons.add('legacy_metric_binding_incomplete');
  }
  const completeVerifiedBindings = verifiedObservations.filter(
    (observation) => Boolean(observation.binding.outputField) && Boolean(observation.binding.permissionAllOf?.length),
  );
  const completeBindingEvidence = [...completeLegacyBindings, ...completeVerifiedBindings];
  if (!completeBindingEvidence.length) {
    reasons.add('verified_binding_output_mismatch:missing');
    reasons.add('verified_binding_permission_mismatch');
    return;
  }

  for (const observation of completeBindingEvidence) {
    const outputField = observation.binding?.outputField;
    if (!outputField || !canonical.bindings.outputField.includes(outputField)) {
      reasons.add(`verified_binding_output_mismatch:${outputField ?? 'missing'}`);
    }
    const observedPermissions = new Set(observation.binding?.permissionAllOf ?? []);
    if (
      observedPermissions.size !== canonicalPermissions.size ||
      [...canonicalPermissions].some((permission) => !observedPermissions.has(permission))
    ) {
      reasons.add('verified_binding_permission_mismatch');
    }
  }
  const observedOutputFields = new Set(
    completeBindingEvidence.flatMap((observation) =>
      observation.binding?.outputField ? [observation.binding.outputField] : [],
    ),
  );
  if (canonical.bindings.outputField.some((outputField) => !observedOutputFields.has(outputField))) {
    reasons.add('verified_binding_output_mismatch:missing');
  }
}

function validateJoinStep(
  step: CanonicalMetricPayload['joinPath'][number],
  models: Map<string, PrismaDatamodelAst['models'][number]>,
  reasons: Set<string>,
) {
  const relation = models.get(step.fromModel)?.fields.find((field) => field.name === step.relationField);
  if (!relation || relation.type !== step.toModel || !isExecutableOwnerRelation(relation)) {
    reasons.add(`non_executable_join:${step.fromModel}.${step.relationField}`);
    return false;
  }
  return true;
}

function validateStoreScope(
  payload: CanonicalMetricPayload,
  models: Map<string, PrismaDatamodelAst['models'][number]>,
  reasons: Set<string>,
) {
  if (payload.measure.resolver) {
    const terminalModel = payload.storeScope.joinPath.at(-1)?.toModel ?? payload.storeScope.model;
    const issue = validateBusinessMetricResolverStoreScope({
      resolverKey: payload.measure.resolver.key,
      sourceModels: payload.sourceModels,
      anchorModel: payload.storeScope.model,
      terminalModel,
      field: payload.storeScope.field,
      joinPathLength: payload.storeScope.joinPath.length,
    });
    if (issue) reasons.add(`invalid_metric_resolver_store_scope:${issue}`);
    const resolverStoreField = models
      .get(payload.storeScope.model)
      ?.fields.find((field) => field.name === payload.storeScope.field);
    if (!resolverStoreField || resolverStoreField.kind === 'object') {
      reasons.add(`invalid_store_scope:${payload.storeScope.model}.${payload.storeScope.field}`);
    }
    return;
  }
  const measureModel = payload.measure.model ?? '';
  if (payload.storeScope.model !== measureModel) reasons.add('invalid_store_scope_anchor');
  if (!isPathPrefix(payload.storeScope.joinPath, payload.joinPath)) reasons.add('invalid_store_scope_join_path');
  let currentModel = payload.storeScope.model;
  for (const step of payload.storeScope.joinPath) {
    if (step.fromModel !== currentModel || !validateJoinStep(step, models, reasons)) {
      reasons.add(`invalid_store_scope:${step.fromModel}.${step.relationField}.${payload.storeScope.field}`);
      return;
    }
    currentModel = step.toModel;
  }
  const expectedField = currentModel === 'Store' ? 'id' : 'storeId';
  if (payload.storeScope.field !== expectedField) {
    reasons.add(`invalid_store_scope_field:${payload.storeScope.field}`);
  }
  const terminalField = models.get(currentModel)?.fields.find((field) => field.name === payload.storeScope.field);
  if (!terminalField || terminalField.kind === 'object') {
    const path = payload.storeScope.joinPath.at(-1);
    reasons.add(
      `invalid_store_scope:${path ? `${path.fromModel}.${path.relationField}` : currentModel}.${payload.storeScope.field}`,
    );
  }
}

function validateMetricResolver(
  resolver: NonNullable<CanonicalMetricPayload['measure']['resolver']>,
  reasons: Set<string>,
) {
  if (resolver.kind !== 'domain_service') reasons.add('invalid_metric_resolver_kind');
  const contract = getBusinessMetricResolverContract(resolver.key);
  if (!contract) {
    reasons.add(`invalid_metric_resolver_key:${resolver.key}`);
  }
  const dimensionEntries = Object.entries(resolver.dimensionFields ?? {});
  if (
    !dimensionEntries.length ||
    dimensionEntries.some(
      ([dimension, field]) => !dimension.trim() || typeof field !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field),
    )
  ) {
    reasons.add('invalid_metric_resolver_dimension_fields');
  }
  if (contract) {
    for (const [, field] of dimensionEntries) {
      if (!contract.dimensionFields.includes(field)) reasons.add(`invalid_metric_resolver_dimension_field:${field}`);
    }
  }
  if (!['sum', 'avg', 'min', 'max'].includes(resolver.overallAggregation)) {
    reasons.add('invalid_metric_resolver_overall_aggregation');
  }
  validateMetricResolverExpression(resolver.expression, reasons, 0, contract?.numericExpressionFields);
}

function validateMetricResolverExpression(
  expression: BrainMetricResolverExpression,
  reasons: Set<string>,
  depth: number,
  allowedNumericFields?: readonly string[],
) {
  if (depth > 12) {
    reasons.add('metric_resolver_expression_too_deep');
    return;
  }
  if (!expression || typeof expression !== 'object') {
    reasons.add('invalid_metric_resolver_expression');
    return;
  }
  if (expression.op === 'field') {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(expression.field)) reasons.add('invalid_metric_expression_field');
    if (allowedNumericFields && !allowedNumericFields.includes(expression.field)) {
      reasons.add(`invalid_metric_resolver_numeric_field:${expression.field}`);
    }
    return;
  }
  if (expression.op === 'constant') {
    if (!Number.isFinite(expression.value)) reasons.add('invalid_metric_expression_constant');
    return;
  }
  if (expression.op === 'add') {
    if (!expression.operands.length || expression.operands.length > 16) reasons.add('invalid_metric_expression_add');
    for (const operand of expression.operands) {
      validateMetricResolverExpression(operand, reasons, depth + 1, allowedNumericFields);
    }
    return;
  }
  if (expression.op === 'subtract' || expression.op === 'multiply') {
    validateMetricResolverExpression(expression.left, reasons, depth + 1, allowedNumericFields);
    validateMetricResolverExpression(expression.right, reasons, depth + 1, allowedNumericFields);
    return;
  }
  if (expression.op === 'divide') {
    if (expression.zero !== 'error' && expression.zero !== 'zero') reasons.add('invalid_metric_expression_zero_policy');
    validateMetricResolverExpression(expression.numerator, reasons, depth + 1, allowedNumericFields);
    validateMetricResolverExpression(expression.denominator, reasons, depth + 1, allowedNumericFields);
    return;
  }
  if (expression.op === 'clamp') {
    if (!Number.isFinite(expression.min) || !Number.isFinite(expression.max) || expression.min > expression.max) {
      reasons.add('invalid_metric_expression_clamp');
    }
    validateMetricResolverExpression(expression.value, reasons, depth + 1, allowedNumericFields);
    return;
  }
  reasons.add('invalid_metric_expression_operator');
}

function validatePathField(
  path: string | undefined,
  models: Map<string, PrismaDatamodelAst['models'][number]>,
  expectedType: string,
  reason: string,
  reasons: Set<string>,
) {
  if (!path) return;
  const separator = path.indexOf('.');
  if (separator < 1) {
    reasons.add(`${reason}:${path}`);
    return;
  }
  const model = path.slice(0, separator);
  const field = path.slice(separator + 1);
  const definition = models.get(model)?.fields.find((candidate) => candidate.name === field);
  if (!definition || definition.kind === 'object' || definition.type !== expectedType) reasons.add(`${reason}:${path}`);
}

function validateBindings(payload: CanonicalMetricPayload, reasons: Set<string>) {
  const bindings = payload.bindings;
  for (const key of ['template', 'capability', 'executor', 'outputField'] as const) {
    if (!bindings[key].length || bindings[key].some((value) => typeof value !== 'string' || !value.trim())) {
      reasons.add(`missing_binding:${key}`);
    }
  }
  const sort = bindings.sort;
  if (sort) {
    if (!bindings.outputField.includes(sort.outputField)) reasons.add('sort_output_not_bound');
    if (sort.direction !== 'asc' && sort.direction !== 'desc') reasons.add('invalid_sort_direction');
    if (sort.missing !== 'error') reasons.add('invalid_sort_missing_policy');
  }
}

function isPathPrefix(scopePath: CanonicalMetricPayload['joinPath'], metricPath: CanonicalMetricPayload['joinPath']) {
  if (scopePath.length > metricPath.length) return false;
  return scopePath.every((step, index) => canonicalMetricValue(step) === canonicalMetricValue(metricPath[index]));
}

function hasPermissionEvidence(observations: BrainMetricSourceObservation[]) {
  return observations.some(
    (observation) =>
      Boolean(observation.binding?.permissionAllOf?.length) ||
      Boolean(observation.payload?.permissionPolicies?.some((policy) => policy.allOf?.length)),
  );
}

function blockedCandidate(
  metricKey: string,
  aliases: string[],
  observations: BrainMetricSourceObservation[],
  reasons: Set<string>,
  draftInput?: BrainMetricCandidateResult['draftInput'],
): BrainMetricCandidateResult {
  return {
    metricKey,
    status: 'blocked',
    blockedReasons: [...reasons].filter(Boolean).sort(),
    aliases,
    observations,
    ...(draftInput ? { draftInput } : {}),
  };
}

function metricDraftInput(
  metricKey: string,
  aliases: string[],
  observations: BrainMetricSourceObservation[],
  canonical: CanonicalMetricPayload,
  lifecycleStatus: 'candidate' | 'draft',
): NonNullable<BrainMetricCandidateResult['draftInput']> {
  const templateBinding = canonical.bindings.template[0];
  const published = observations.find((observation) => observation.sourceKind === 'published_definition');
  const publishedFixtureSetKey =
    published && typeof published.evidence.fixtureSetKey === 'string' ? published.evidence.fixtureSetKey : undefined;
  const fixtureSetKey =
    published && publishedFixtureSetKey && canonicalMetricValue(published.payload) === canonicalMetricValue(canonical)
      ? publishedFixtureSetKey
      : published
        ? `semantic.${metricKey}.${createHash('sha256').update(canonicalMetricValue(canonical)).digest('hex').slice(0, 12)}`
        : `semantic.${metricKey}.v1`;
  return {
    definitionKey: `metric.${metricKey}`,
    kind: 'metric',
    domain: deriveDomain(canonical.measure.model ?? canonical.sourceModels[0] ?? canonical.metricKey),
    name: aliases[0] ?? metricKey,
    ownerType: 'ami_core_metric_candidate_generator',
    ownerId: metricKey,
    lifecycleStatus,
    schemaVersion: '1.0',
    payload: { ...clone(canonical), aliases: [...aliases] },
    ...(templateBinding
      ? {
          canonicalQueryRef: `semantic_query.${metricKey}`,
          fixtureSetKey,
        }
      : {}),
    timezone: canonical.timePolicy.timezone,
    storeScope: clone(canonical.storeScope),
    evidence: observations.map((observation) => ({
      sourceType: observation.sourceKind,
      sourcePath: observation.sourcePath,
      sourceSymbol: observation.sourceSymbol,
      evidenceKind: observation.authority,
      confidence: authorityConfidence(observation),
    })),
  };
}

function canonicalMetricValue(value: unknown, parentPath = ''): string {
  return canonicalizeBusinessDefinition(normalizeMetricValue(value, parentPath));
}

function normalizeCanonicalPayload(payload: CanonicalMetricPayload): CanonicalMetricPayload {
  return normalizeMetricValue(clone(payload), '') as CanonicalMetricPayload;
}

function normalizeMetricValue(value: unknown, parentPath: string): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeMetricValue(item, parentPath));
    if (!isMetricSetPath(parentPath)) return normalized;
    const unique = new Map(normalized.map((item) => [canonicalizeBusinessDefinition(item), item]));
    return [...unique.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, item]) => item);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        normalizeMetricValue(nested, parentPath ? `${parentPath}.${key}` : key),
      ]),
    );
  }
  return value;
}

function isMetricSetPath(path: string) {
  return [
    'sourceModels',
    'allowedTaskTypes',
    'dimensions',
    'filters',
    'permissionPolicies',
    'allOf',
    'template',
    'capability',
    'executor',
    'outputField',
  ].some((candidate) => path === candidate || path.endsWith(`.${candidate}`));
}

function normalizeAlias(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function deriveDomain(model: string) {
  return model
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/_(item|record|snapshot)$/i, '')
    .toLowerCase();
}

function authorityConfidence(observation: BrainMetricSourceObservation) {
  if (observation.sourceKind === 'published_definition') return 1;
  if (observation.sourceKind === 'verified_executable_binding') return 0.95;
  if (observation.sourceKind === 'language_evidence') return 0.6;
  return 0.8;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}
