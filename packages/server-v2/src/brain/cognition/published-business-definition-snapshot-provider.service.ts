import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  createBusinessDefinitionProjectionFingerprint,
  isBusinessDefinitionProjectionV2Payload,
} from '../../semantic-data/business-definition-projection-compiler.service.js';
import type {
  BusinessDefinitionKind,
  BusinessDefinitionSnapshotInput,
  BusinessDefinitionSnapshotProvider,
  BusinessMetricDefinitionSnapshot,
  BusinessMetricRuntimeExpression,
  BusinessMetricRuntimeResolver,
  BusinessMetricRuntimeQuery,
  BusinessMetricRuntimeAggregation,
  PrismaRuntimeDataModel,
} from './business-definition-snapshot.types.js';
import { buildPrismaRuntimeDataModelFromClient } from './prisma-business-definition-data-model.js';
import {
  getBusinessMetricResolverContract,
  validateBusinessMetricResolverStoreScope,
} from '../../semantic-data/business-metric-resolver-contract.js';

type UnknownRecord = Record<string, unknown>;

interface PublishedProjectionRow {
  definitionVersionId: number;
  targetType: string;
  targetKey: string;
  definitionKey: string;
  definitionVersion: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
  payload: unknown;
  projectionFingerprint: string;
  readOnly: boolean;
}

interface PublishedDefinitionRecord {
  definitionKey: string;
  kind: string;
  domain: string;
  name: string;
  status: string;
  currentPublishedVersionId: number | null;
  currentPublishedVersion: {
    id: number;
    version: number;
    lifecycleStatus: string;
    fingerprint: string;
    sourceFingerprint: string;
  } | null;
}

interface ParsedProjection {
  row: PublishedProjectionRow;
  kind: BusinessDefinitionKind;
  domain: string;
  name: string;
  definition: UnknownRecord;
}

type SnapshotReadClient = Pick<Prisma.TransactionClient, 'businessDefinition' | 'businessDefinitionProjection'>;

const RUNTIME_KINDS = new Set<BusinessDefinitionKind>(['entity', 'relation', 'metric', 'dimension']);
const RUNTIME_METRIC_AGGREGATIONS = new Set<BusinessMetricRuntimeAggregation>([
  'sum',
  'count',
  'count_distinct',
  'avg',
  'ratio',
  'score',
]);
const TRANSIENT_SNAPSHOT_RETRY_DELAY_MS = 50;
const TRANSIENT_SNAPSHOT_MAX_ATTEMPTS = 3;
const ACTIVE_DEFINITION_SNAPSHOT_TTL_MS = 30_000;
const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1008', 'P1017', 'P2024', 'P2034', 'P2037']);

@Injectable()
export class PublishedBusinessDefinitionSnapshotProviderService implements BusinessDefinitionSnapshotProvider {
  private runtimeDataModel?: PrismaRuntimeDataModel;
  private activeDefinitionSnapshot?: { value: BusinessDefinitionSnapshotInput; expiresAt: number };

  constructor(private readonly prisma: PrismaService) {}

  async loadActiveDefinitions(): Promise<BusinessDefinitionSnapshotInput> {
    const cached = this.activeDefinitionSnapshot;
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    try {
      const readSnapshot = async (client: SnapshotReadClient) => {
        const currentDefinitions = await client.businessDefinition.findMany({
          where: {
            status: 'active',
            currentPublishedVersionId: { not: null },
            kind: { in: ['entity', 'relation', 'metric', 'dimension'] },
          },
          include: {
            currentPublishedVersion: {
              select: {
                id: true,
                version: true,
                lifecycleStatus: true,
                fingerprint: true,
                sourceFingerprint: true,
              },
            },
          },
          orderBy: [{ domain: 'asc' }, { kind: 'asc' }, { definitionKey: 'asc' }],
        });
        const metricVersionIds = currentDefinitions
          .filter((definition) => definition.kind === 'metric')
          .map((definition) => definition.currentPublishedVersionId)
          .filter((id): id is number => id !== null);
        const semanticVersionIds = currentDefinitions
          .filter((definition) => definition.kind !== 'metric')
          .map((definition) => definition.currentPublishedVersionId)
          .filter((id): id is number => id !== null);
        const projectionWhere: Prisma.BusinessDefinitionProjectionWhereInput[] = [];
        if (metricVersionIds.length) {
          projectionWhere.push({
            definitionVersionId: { in: metricVersionIds },
            targetType: 'metric_query_view',
          });
        }
        if (semanticVersionIds.length) {
          projectionWhere.push({
            definitionVersionId: { in: semanticVersionIds },
            targetType: 'intent_semantic_index',
          });
        }
        const runtimeProjections = projectionWhere.length
          ? await client.businessDefinitionProjection.findMany({
              where: { OR: projectionWhere },
              orderBy: [{ definitionVersionId: 'asc' }, { targetType: 'asc' }],
            })
          : [];
        return { definitions: currentDefinitions, projections: runtimeProjections };
      };
      const directClient = this.directSnapshotReadClient();
      const { definitions, projections } = await this.executeTransientSnapshotRetry(() =>
        directClient
          ? readSnapshot(directClient)
          : this.prisma.$transaction(readSnapshot, {
              isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            }),
      );
      const value = mapPublishedDefinitions(definitions, projections);
      this.activeDefinitionSnapshot = { value, expiresAt: Date.now() + ACTIVE_DEFINITION_SNAPSHOT_TTL_MS };
      return value;
    } catch (error) {
      if (cached && this.isTransientSnapshotError(error)) return cached.value;
      throw error;
    }
  }

  async loadActiveMetricDefinitions(): Promise<BusinessMetricDefinitionSnapshot[]> {
    const readSnapshot = async (client: SnapshotReadClient) => {
      const currentDefinitions = await client.businessDefinition.findMany({
          where: {
            status: 'active',
            currentPublishedVersionId: { not: null },
            kind: 'metric',
          },
          include: {
            currentPublishedVersion: {
              select: {
                id: true,
                version: true,
                lifecycleStatus: true,
                fingerprint: true,
                sourceFingerprint: true,
              },
            },
          },
          orderBy: [{ domain: 'asc' }, { definitionKey: 'asc' }],
        });
        const versionIds = currentDefinitions
          .map((definition) => definition.currentPublishedVersionId)
          .filter((id): id is number => id !== null);
        const metricProjections = versionIds.length
          ? await client.businessDefinitionProjection.findMany({
              where: { definitionVersionId: { in: versionIds }, targetType: 'metric_query_view' },
              orderBy: [{ definitionVersionId: 'asc' }],
            })
          : [];
      return { definitions: currentDefinitions, projections: metricProjections };
    };
    const directClient = this.directSnapshotReadClient();
    const { definitions, projections } = await this.executeTransientSnapshotRetry(() =>
      directClient
        ? readSnapshot(directClient)
        : this.prisma.$transaction(readSnapshot, {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          }),
    );
    return mapPublishedDefinitions(definitions, projections).metrics;
  }

  private directSnapshotReadClient(): SnapshotReadClient | undefined {
    const candidate = this.prisma as unknown as Partial<SnapshotReadClient>;
    if (
      typeof candidate.businessDefinition?.findMany !== 'function' ||
      typeof candidate.businessDefinitionProjection?.findMany !== 'function'
    ) {
      return undefined;
    }
    return candidate as SnapshotReadClient;
  }

  private async executeTransientSnapshotRetry<T>(read: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= TRANSIENT_SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await read();
      } catch (error) {
        if (!this.isTransientSnapshotError(error) || attempt === TRANSIENT_SNAPSHOT_MAX_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, TRANSIENT_SNAPSHOT_RETRY_DELAY_MS * attempt));
      }
    }
    throw new Error('business_definition_snapshot_retry_exhausted');
  }

  private isTransientSnapshotError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as Record<string, unknown>;
    if (typeof record.code === 'string' && TRANSIENT_PRISMA_CODES.has(record.code)) return true;
    const message = error instanceof Error ? error.message : typeof record.message === 'string' ? record.message : '';
    return /transaction api error|connection (?:closed|terminated|timeout)|operation has timed out|too many database connections/i.test(
      message,
    );
  }

  getRuntimeDataModel(): PrismaRuntimeDataModel {
    if (!this.runtimeDataModel) {
      this.runtimeDataModel = buildPrismaRuntimeDataModelFromClient(Prisma.dmmf.datamodel.models, this.prisma);
    }
    return this.runtimeDataModel;
  }
}

function mapPublishedDefinitions(
  definitions: PublishedDefinitionRecord[],
  projections: PublishedProjectionRow[],
): BusinessDefinitionSnapshotInput {
  const snapshot: BusinessDefinitionSnapshotInput = { entities: [], relations: [], metrics: [], dimensions: [] };
  for (const definition of definitions) {
    const version = definition.currentPublishedVersion;
    const expectedTargetType = definition.kind === 'metric' ? 'metric_query_view' : 'intent_semantic_index';
    const matchingProjections = version
      ? projections.filter((item) => item.definitionVersionId === version.id && item.targetType === expectedTargetType)
      : [];
    if (
      definition.status !== 'active' ||
      !version ||
      definition.currentPublishedVersionId !== version.id ||
      version.lifecycleStatus !== 'published' ||
      matchingProjections.length !== 1
    ) {
      throw invalidProjection(definition.definitionKey);
    }
    try {
      const projection = parseProjection(matchingProjections[0], version, definition);
      if (projection.kind === 'entity') snapshot.entities.push(mapEntity(projection));
      if (projection.kind === 'relation') snapshot.relations.push(mapRelation(projection));
      if (projection.kind === 'metric') snapshot.metrics.push(mapMetric(projection));
      if (projection.kind === 'dimension') snapshot.dimensions.push(mapDimension(projection));
    } catch (error) {
      throw invalidProjection(definition.definitionKey, error);
    }
  }
  return snapshot;
}

function parseProjection(
  row: PublishedProjectionRow,
  version: NonNullable<PublishedDefinitionRecord['currentPublishedVersion']>,
  registryDefinition: PublishedDefinitionRecord,
): ParsedProjection {
  try {
    const payload = asRecord(row.payload);
    const definitionRef = asRecord(payload.definitionRef);
    const v2 = isBusinessDefinitionProjectionV2Payload(payload);
    const data = v2 ? asRecord(payload.data) : payload;
    const kind = requiredRuntimeKind(v2 ? data.definitionKind : payload.kind);
    const expectedTargetType = kind === 'metric' ? 'metric_query_view' : 'intent_semantic_index';

    requireEqual(row.readOnly, true);
    requireEqual(version.lifecycleStatus, 'published');
    requireEqual(registryDefinition.status, 'active');
    requireEqual(registryDefinition.currentPublishedVersionId, row.definitionVersionId);
    requireEqual(version.id, row.definitionVersionId);
    requireEqual(version.version, row.definitionVersion);
    requireEqual(version.fingerprint, row.definitionFingerprint);
    requireEqual(version.sourceFingerprint, row.sourceFingerprint);
    requireEqual(registryDefinition.definitionKey, row.definitionKey);
    requireEqual(registryDefinition.kind, kind);
    requireEqual(payload.preview, false);
    requireEqual(payload.projectionType, expectedTargetType);
    if (v2) requireEqual(payload.projectionSchemaVersion, '2.0');
    requireEqual(row.targetType, expectedTargetType);
    requireEqual(row.targetKey, `${row.definitionKey}@${row.definitionVersion}`);
    requireEqual(definitionRef.definitionKey, row.definitionKey);
    requireEqual(definitionRef.definitionVersion, row.definitionVersion);
    requireEqual(definitionRef.definitionFingerprint, row.definitionFingerprint);
    requireEqual(definitionRef.sourceFingerprint, row.sourceFingerprint);
    requireEqual(data.domain, registryDefinition.domain);
    requireEqual(data.name, registryDefinition.name);
    if (v2 && kind === 'metric') requireEqual(data.applicable, true);

    const expectedFingerprint = createBusinessDefinitionProjectionFingerprint({
      targetType: row.targetType,
      targetKey: row.targetKey,
      definitionVersionId: row.definitionVersionId,
      definitionRef,
      payload,
      readOnly: true,
    });
    requireEqual(row.projectionFingerprint, expectedFingerprint);

    return {
      row,
      kind,
      domain: requiredString(data.domain),
      name: requiredString(data.name),
      definition: asRecord(v2 ? data.runtimeDefinition : payload.definition),
    };
  } catch (error) {
    throw invalidProjection(row.definitionKey, error);
  }
}

function invalidProjection(definitionKey: string, cause?: unknown): Error {
  if (cause instanceof Error && cause.message.startsWith('published_business_definition_projection_invalid:')) {
    return cause;
  }
  const reason = cause instanceof Error && cause.message ? cause.message : 'projection_contract_invalid';
  return new Error(`published_business_definition_projection_invalid:${definitionKey}:${reason}`, {
    cause: cause instanceof Error ? cause : undefined,
  });
}

function mapEntity({ row, domain, name, definition }: ParsedProjection) {
  const model = requiredString(definition.model);
  const fields = stringArray(definition.fields);
  const relationFields = stringArray(definition.relationFields);
  return {
    definitionKey: row.definitionKey,
    domain,
    entityKey: stripDefinitionPrefix(row.definitionKey, 'entity'),
    name,
    aliases: definition.aliases === undefined ? [] : uniqueStrings(definition.aliases),
    attributes: {
      fields,
      relationFields,
      storeScopeField: optionalString(definition.storeScopeField),
    },
    tableMap: {
      model,
      fields: Object.fromEntries(fields.map((field) => [field, field])),
    },
    version: row.definitionVersion,
    definitionFingerprint: row.definitionFingerprint,
    sourceFingerprint: row.sourceFingerprint,
  };
}

function mapRelation({ row, name, definition }: ParsedProjection) {
  const relationField = requiredString(definition.relationField);
  return {
    definitionKey: row.definitionKey,
    relationKey: stripDefinitionPrefix(row.definitionKey, 'relation'),
    fromEntityKey: snakeCaseIdentifier(requiredString(definition.fromModel)),
    toEntityKey: snakeCaseIdentifier(requiredString(definition.toModel)),
    name,
    joinPath: {
      path: [relationField],
      relationFromFields: stringArray(definition.relationFromFields),
      relationToFields: stringArray(definition.relationToFields),
      executableJoin: definition.executableJoin === true,
    },
    version: row.definitionVersion,
    definitionFingerprint: row.definitionFingerprint,
    sourceFingerprint: row.sourceFingerprint,
  };
}

function mapMetric({ row, domain, name, definition }: ParsedProjection): BusinessMetricDefinitionSnapshot {
  const metricKey = requiredString(definition.metricKey);
  requireEqual(metricKey, stripDefinitionPrefix(row.definitionKey, 'metric'));
  const measure = asRecord(definition.measure);
  const aggregation = requiredString(measure.aggregation) as BusinessMetricRuntimeAggregation;
  if (!RUNTIME_METRIC_AGGREGATIONS.has(aggregation)) {
    throw new Error(`metric_aggregation_not_supported:${aggregation}`);
  }
  const resolver = metricResolver(measure.resolver, aggregation);
  const model = resolver ? undefined : requiredString(measure.model);
  const field = resolver
    ? undefined
    : requiredString(aggregation === 'count_distinct' ? measure.distinctField : measure.field);
  const filters = metricFilters(definition.filters);
  const bindings = metricBindings(definition.bindings);
  const sourceModels = uniqueStrings(definition.sourceModels);
  const storeScope = metricStoreScope(definition.storeScope);
  if (resolver) {
    const storeScopeIssue = validateBusinessMetricResolverStoreScope({
      resolverKey: resolver.key,
      sourceModels,
      anchorModel: storeScope.anchorModel ?? storeScope.model,
      terminalModel: storeScope.model,
      field: storeScope.field,
      joinPathLength: storeScope.joinPath.length,
    });
    if (storeScopeIssue) throw new Error(`metric_resolver_store_scope_invalid:${storeScopeIssue}`);
  }
  return {
    definitionKey: row.definitionKey,
    metricKey,
    name,
    aliases: definition.aliases === undefined ? [] : uniqueStrings(definition.aliases),
    domain,
    formula: resolver ? { type: aggregation, resolver } : { type: aggregation, model, field },
    source: resolver ? sourceModels.map((sourceModel) => ({ model: sourceModel })) : [{ model, field }],
    defaultFilters: filters,
    permissions: permissionCodes(definition.permissionPolicies),
    description: optionalString(definition.description) ?? name,
    valueType: metricValueType(definition.valueType),
    allowedTaskTypes: metricAllowedTaskTypes(definition.allowedTaskTypes),
    sensitive: optionalBoolean(definition.sensitive),
    runtimeQuery: {
      aggregation,
      joinPath: metricJoinPath(definition.joinPath),
      dimensions: uniqueStrings(definition.dimensions),
      filters,
      capabilityKeys: bindings.capabilityKeys,
      executorKeys: bindings.executorKeys,
      outputFields: bindings.outputFields,
      sort: bindings.sort,
      resolver,
      timePolicy: metricTimePolicy(definition.timePolicy),
      storeScope,
    },
    version: row.definitionVersion,
    definitionFingerprint: row.definitionFingerprint,
    sourceFingerprint: row.sourceFingerprint,
  };
}

function metricValueType(
  value: unknown,
): BusinessMetricDefinitionSnapshot['valueType'] {
  if (value === undefined) return undefined;
  const normalized = requiredString(value);
  if (!['money', 'count', 'percent', 'score', 'duration'].includes(normalized)) {
    throw new Error(`metric_value_type_invalid:${normalized}`);
  }
  return normalized as BusinessMetricDefinitionSnapshot['valueType'];
}

function metricAllowedTaskTypes(
  value: unknown,
): BusinessMetricDefinitionSnapshot['allowedTaskTypes'] {
  if (value === undefined) return undefined;
  const allowed = new Set(['query', 'ranking', 'recommendation', 'diagnosis', 'forecast', 'draft', 'workflow', 'clarify']);
  const taskTypes = nonEmptyStringArray(value, 'metric_allowed_task_types_must_not_be_empty');
  for (const taskType of taskTypes) {
    if (!allowed.has(taskType)) throw new Error(`metric_allowed_task_type_invalid:${taskType}`);
  }
  return taskTypes as NonNullable<BusinessMetricDefinitionSnapshot['allowedTaskTypes']>;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error('metric_sensitive_flag_invalid');
  return value;
}

function metricResolver(
  value: unknown,
  aggregation: BusinessMetricRuntimeAggregation,
): BusinessMetricRuntimeResolver | undefined {
  if (value === undefined) return undefined;
  if (aggregation !== 'score' && aggregation !== 'ratio') {
    throw new Error('metric_resolver_aggregation_invalid');
  }
  const resolver = asRecord(value);
  requireOnlyKeys(
    resolver,
    ['kind', 'key', 'dimensionFields', 'expression', 'overallAggregation'],
    'metric_resolver_contains_unknown_field',
  );
  if (resolver.kind !== 'domain_service') throw new Error('metric_resolver_kind_invalid');
  const key = requiredString(resolver.key);
  const contract = getBusinessMetricResolverContract(key);
  if (!contract) throw new Error(`metric_resolver_key_invalid:${key}`);
  const dimensionFields = stringRecord(resolver.dimensionFields, 'metric_resolver_dimension_fields_invalid');
  const overallAggregation = requiredString(resolver.overallAggregation);
  if (!['sum', 'avg', 'min', 'max'].includes(overallAggregation)) {
    throw new Error('metric_resolver_overall_aggregation_invalid');
  }
  for (const field of Object.values(dimensionFields)) {
    if (!contract.dimensionFields.includes(field)) throw new Error('metric_resolver_dimension_field_invalid');
  }
  const expression = metricExpression(resolver.expression, 0);
  for (const field of metricExpressionFields(expression)) {
    if (!contract.numericExpressionFields.includes(field)) throw new Error('metric_resolver_numeric_field_invalid');
  }
  return {
    kind: 'domain_service',
    key: contract.key,
    dimensionFields,
    expression,
    overallAggregation: overallAggregation as BusinessMetricRuntimeResolver['overallAggregation'],
  };
}

function metricExpressionFields(expression: BusinessMetricRuntimeExpression): string[] {
  if (expression.op === 'field') return [expression.field];
  if (expression.op === 'constant') return [];
  if (expression.op === 'add') return expression.operands.flatMap(metricExpressionFields);
  if (expression.op === 'subtract' || expression.op === 'multiply') {
    return [...metricExpressionFields(expression.left), ...metricExpressionFields(expression.right)];
  }
  if (expression.op === 'divide') {
    return [...metricExpressionFields(expression.numerator), ...metricExpressionFields(expression.denominator)];
  }
  return metricExpressionFields(expression.value);
}

function metricExpression(value: unknown, depth: number): BusinessMetricRuntimeExpression {
  if (depth > 12) throw new Error('metric_resolver_expression_too_deep');
  const expression = asRecord(value);
  const op = requiredString(expression.op);
  if (op === 'field') {
    requireOnlyKeys(expression, ['op', 'field'], 'metric_expression_contains_unknown_field');
    const field = requiredString(expression.field);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw new Error('metric_expression_field_invalid');
    return { op, field };
  }
  if (op === 'constant') {
    requireOnlyKeys(expression, ['op', 'value'], 'metric_expression_contains_unknown_field');
    return { op, value: finiteNumber(expression.value, 'metric_expression_constant_invalid') };
  }
  if (op === 'add') {
    requireOnlyKeys(expression, ['op', 'operands'], 'metric_expression_contains_unknown_field');
    if (!Array.isArray(expression.operands) || !expression.operands.length || expression.operands.length > 16) {
      throw new Error('metric_expression_add_operands_invalid');
    }
    return { op, operands: expression.operands.map((operand) => metricExpression(operand, depth + 1)) };
  }
  if (op === 'subtract' || op === 'multiply') {
    requireOnlyKeys(expression, ['op', 'left', 'right'], 'metric_expression_contains_unknown_field');
    const left = metricExpression(expression.left, depth + 1);
    const right = metricExpression(expression.right, depth + 1);
    return op === 'subtract' ? { op, left, right } : { op, left, right };
  }
  if (op === 'divide') {
    requireOnlyKeys(expression, ['op', 'numerator', 'denominator', 'zero'], 'metric_expression_contains_unknown_field');
    if (expression.zero !== 'error' && expression.zero !== 'zero') {
      throw new Error('metric_expression_zero_policy_invalid');
    }
    return {
      op,
      numerator: metricExpression(expression.numerator, depth + 1),
      denominator: metricExpression(expression.denominator, depth + 1),
      zero: expression.zero,
    };
  }
  if (op === 'clamp') {
    requireOnlyKeys(expression, ['op', 'value', 'min', 'max'], 'metric_expression_contains_unknown_field');
    const min = finiteNumber(expression.min, 'metric_expression_clamp_invalid');
    const max = finiteNumber(expression.max, 'metric_expression_clamp_invalid');
    if (min > max) throw new Error('metric_expression_clamp_invalid');
    return { op, value: metricExpression(expression.value, depth + 1), min, max };
  }
  throw new Error(`metric_expression_operator_invalid:${op}`);
}

function stringRecord(value: unknown, errorMessage: string): Record<string, string> {
  const record = asRecord(value);
  const entries = Object.entries(record);
  if (!entries.every(([key, item]) => key.trim() && typeof item === 'string' && item.trim())) {
    throw new Error(errorMessage);
  }
  return Object.fromEntries(entries.map(([key, item]) => [key.trim(), (item as string).trim()]));
}

function finiteNumber(value: unknown, errorMessage: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(errorMessage);
  return value;
}

function requireOnlyKeys(record: UnknownRecord, keys: readonly string[], errorMessage: string) {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new Error(errorMessage);
}

function metricBindings(value: unknown): {
  capabilityKeys: string[];
  executorKeys: string[];
  outputFields: string[];
  sort?: NonNullable<BusinessMetricRuntimeQuery['sort']>;
} {
  const bindings = asRecord(value);
  return {
    capabilityKeys: nonEmptyStringArray(bindings.capability, 'metric_capability_bindings_must_not_be_empty'),
    executorKeys: nonEmptyStringArray(bindings.executor, 'metric_executor_bindings_must_not_be_empty'),
    outputFields: nonEmptyStringArray(bindings.outputField, 'metric_output_bindings_must_not_be_empty'),
    sort: metricSort(bindings.sort),
  };
}

function metricSort(value: unknown): NonNullable<BusinessMetricRuntimeQuery['sort']> | undefined {
  if (value === undefined) return undefined;
  const sort = asRecord(value);
  const outputField = requiredString(sort.outputField);
  const direction = requiredString(sort.direction);
  const missing = requiredString(sort.missing);
  if (direction !== 'asc' && direction !== 'desc') throw new Error('metric_sort_direction_invalid');
  if (missing !== 'error') throw new Error('metric_sort_missing_policy_invalid');
  return { outputField, direction, missing };
}

function metricTimePolicy(value: unknown): BusinessMetricRuntimeQuery['timePolicy'] {
  const policy = asRecord(value);
  const mode = requiredString(policy.mode);
  const boundary = requiredString(policy.boundary);
  const timezone = requiredString(policy.timezone);
  if (mode !== 'event_time' && mode !== 'as_of_snapshot') throw new Error('metric_time_mode_invalid');
  if (boundary !== '[start,end)' && boundary !== 'as_of') throw new Error('metric_time_boundary_invalid');
  if (timezone !== 'Asia/Shanghai' && timezone !== 'UTC') throw new Error('metric_timezone_invalid');
  const field = optionalString(policy.field);
  if (mode === 'event_time' && !field) throw new Error('metric_event_time_field_required');
  if (mode === 'event_time' && boundary !== '[start,end)') throw new Error('metric_event_time_boundary_invalid');
  if (mode === 'as_of_snapshot' && boundary !== 'as_of') throw new Error('metric_snapshot_boundary_invalid');
  return { mode, field, boundary, timezone };
}

function metricStoreScope(value: unknown): BusinessMetricRuntimeQuery['storeScope'] {
  const scope = asRecord(value);
  if (scope.mode !== 'current_store') throw new Error('metric_store_scope_must_be_current_store');
  if (!Array.isArray(scope.joinPath)) throw new Error('metric_store_scope_join_path_must_be_an_array');
  const baseModel = requiredString(scope.model);
  const joinPath = metricJoinPath(scope.joinPath);
  let currentModel = baseModel;
  for (const step of joinPath) {
    if (step.fromModel !== currentModel) throw new Error('metric_store_scope_join_path_disconnected');
    currentModel = step.toModel;
  }
  return {
    mode: 'current_store' as const,
    anchorModel: baseModel,
    model: currentModel,
    field: requiredString(scope.field),
    joinPath,
  };
}

function metricJoinPath(value: unknown): BusinessMetricRuntimeQuery['joinPath'] {
  if (!Array.isArray(value)) throw new Error('metric_join_path_must_be_an_array');
  return value.map((step) => {
    const record = asRecord(step);
    return {
      fromModel: requiredString(record.fromModel),
      relationField: requiredString(record.relationField),
      toModel: requiredString(record.toModel),
    };
  });
}

function mapDimension({ row, domain, name, definition }: ParsedProjection) {
  const dimensionKey = requiredString(definition.dimensionKey);
  requireEqual(dimensionKey, stripDefinitionPrefix(row.definitionKey, 'dimension'));
  return {
    definitionKey: row.definitionKey,
    dimensionKey,
    name,
    aliases: definition.aliases === undefined ? [] : uniqueStrings(definition.aliases),
    domain,
    source: asRecord(definition.source),
    permissions: permissionCodes(definition.permissionPolicies),
    version: row.definitionVersion,
    definitionFingerprint: row.definitionFingerprint,
    sourceFingerprint: row.sourceFingerprint,
  };
}

function permissionCodes(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('permission_policies_must_be_an_array');
  const permissions = uniqueStrings(
    value.flatMap((policy) => {
      const record = asRecord(policy);
      requiredString(record.bindingRef);
      const allOf = stringArray(record.allOf)
        .map((permission) => permission.trim())
        .filter(Boolean);
      if (!allOf.length) throw new Error('permission_policy_all_of_must_not_be_empty');
      return allOf;
    }),
  );
  if (!permissions.length) throw new Error('permission_policies_must_not_be_empty');
  return permissions;
}

function metricFilters(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) throw new Error('metric_filters_must_be_an_array');
  return value.map((filter) => {
    const record = asRecord(filter);
    requiredString(record.model);
    requiredString(record.field);
    requiredString(record.operator);
    return record;
  });
}

function requiredRuntimeKind(value: unknown): BusinessDefinitionKind {
  const kind = requiredString(value) as BusinessDefinitionKind;
  if (!RUNTIME_KINDS.has(kind)) throw new Error('unsupported runtime definition kind');
  return kind;
}

function stripDefinitionPrefix(definitionKey: string, prefix: BusinessDefinitionKind): string {
  const expected = `${prefix}.`;
  if (!definitionKey.startsWith(expected) || definitionKey.length === expected.length) {
    throw new Error('invalid definition key');
  }
  return definitionKey.slice(expected.length);
}

function uniqueStrings(value: unknown): string[] {
  return Array.from(
    new Set(
      stringArray(value)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('string array required');
  }
  return value;
}

function nonEmptyStringArray(value: unknown, errorMessage: string): string[] {
  const values = uniqueStrings(value);
  if (!values.length) throw new Error(errorMessage);
  return values;
}

function requiredString(value: unknown): string {
  const result = optionalString(value);
  if (!result) throw new Error('non-empty string required');
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('object required');
  return value as UnknownRecord;
}

function requireEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error('projection lineage mismatch');
}

function snakeCaseIdentifier(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const previous = value[index - 1];
    const upper = character >= 'A' && character <= 'Z';
    const previousIsLowerOrDigit =
      Boolean(previous) && ((previous >= 'a' && previous <= 'z') || (previous >= '0' && previous <= '9'));
    if (upper && previousIsLowerOrDigit) result += '_';
    result += character.toLowerCase();
  }
  return result;
}
