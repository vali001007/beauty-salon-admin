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
  BusinessActionCapabilityBinding,
  BusinessActionDefinitionSnapshot,
  BusinessActionInputSlotDefinition,
  BusinessActionLexicalFrame,
  BusinessActionParticipantProfile,
  BusinessActionRelationProfile,
  BusinessActionSituationContextProfile,
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
import { validateBusinessActionSemanticPredicates } from './business-action-lexical-semantics.js';
import { resolveCuratedActionInvariantContract } from '../../semantic-data/brain-action-invariant-catalog.js';
import { resolveCuratedActionRelationDefinition } from '../../semantic-data/brain-action-relation-catalog.js';
import {
  createBusinessActionInstitutionalEffectProfile,
  INSTITUTIONAL_EFFECT_ACTION_KEYS,
} from './business-action-institutional-effect.js';

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

const RUNTIME_KINDS = new Set<BusinessDefinitionKind>(['entity', 'relation', 'metric', 'dimension', 'action']);
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
            kind: { in: ['entity', 'relation', 'metric', 'dimension', 'action'] },
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

  async loadEvaluationDefinitions(definitionVersionIds: readonly number[]): Promise<BusinessDefinitionSnapshotInput> {
    const ids = [...new Set(definitionVersionIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (!ids.length) return this.loadActiveDefinitions();
    const versions = await (this.prisma as any).businessDefinitionVersion.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        version: true,
        lifecycleStatus: true,
        validationStatus: true,
        fingerprint: true,
        sourceFingerprint: true,
        definition: {
          select: {
            definitionKey: true,
            kind: true,
            domain: true,
            name: true,
          },
        },
        projections: {
          where: { targetType: { in: ['intent_semantic_index', 'metric_query_view'] } },
          orderBy: [{ id: 'asc' }],
        },
      },
      orderBy: [{ definition: { definitionKey: 'asc' } }, { version: 'asc' }],
    });
    if (versions.length !== ids.length) {
      const found = new Set(versions.map((version: any) => version.id));
      throw new Error(`business_definition_evaluation_runtime_missing:${ids.filter((id) => !found.has(id)).join(',')}`);
    }
    const active = await this.loadActiveDefinitions();
    return mergeEvaluationDefinitions(active, versions.flatMap(mapEvaluationDefinitionVersion));
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
  const snapshot: BusinessDefinitionSnapshotInput = {
    entities: [],
    relations: [],
    metrics: [],
    dimensions: [],
    actions: [],
  };
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
      if (projection.kind === 'action') snapshot.actions!.push(mapAction(projection));
    } catch (error) {
      throw invalidProjection(definition.definitionKey, error);
    }
  }
  return snapshot;
}

function mapEvaluationDefinitionVersion(version: any): Array<{ kind: BusinessDefinitionKind; value: any }> {
  const lifecycleStatus = String(version.lifecycleStatus);
  if (!['published', 'candidate', 'validated'].includes(lifecycleStatus) || version.validationStatus !== 'passed') {
    throw new Error(`business_definition_evaluation_runtime_not_validated:${version.id}`);
  }
  const definition = version.definition;
  const kind = requiredRuntimeKind(definition?.kind);
  const expectedTargetType = kind === 'metric' ? 'metric_query_view' : 'intent_semantic_index';
  const matches = Array.isArray(version.projections)
    ? version.projections.filter((projection: any) => projection.targetType === expectedTargetType)
    : [];
  if (matches.length !== 1) throw invalidProjection(definition?.definitionKey ?? String(version.id));
  const parsed = parseEvaluationProjection(matches[0], version, definition);
  if (kind === 'entity') return [{ kind, value: mapEntity(parsed) }];
  if (kind === 'relation') return [{ kind, value: mapRelation(parsed) }];
  if (kind === 'metric') return [{ kind, value: mapMetric(parsed) }];
  if (kind === 'dimension') return [{ kind, value: mapDimension(parsed) }];
  return [{ kind, value: mapAction(parsed) }];
}

function parseEvaluationProjection(
  row: PublishedProjectionRow,
  version: any,
  registryDefinition: any,
): ParsedProjection {
  try {
    const payload = asRecord(row.payload);
    const definitionRef = asRecord(payload.definitionRef);
    const v2 = isBusinessDefinitionProjectionV2Payload(payload);
    const data = v2 ? asRecord(payload.data) : payload;
    const kind = requiredRuntimeKind(v2 ? data.definitionKind : payload.kind);
    const expectedTargetType = kind === 'metric' ? 'metric_query_view' : 'intent_semantic_index';

    requireEqual(row.readOnly, true);
    requireEqual(version.id, row.definitionVersionId);
    requireEqual(version.version, row.definitionVersion);
    requireEqual(version.fingerprint, row.definitionFingerprint);
    requireEqual(version.sourceFingerprint, row.sourceFingerprint);
    requireEqual(registryDefinition.definitionKey, row.definitionKey);
    requireEqual(registryDefinition.kind, kind);
    if (typeof payload.preview !== 'boolean') throw new Error('projection preview flag missing');
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
    throw invalidProjection(registryDefinition?.definitionKey ?? String(version.id), error);
  }
}

function mergeEvaluationDefinitions(
  active: BusinessDefinitionSnapshotInput,
  replacements: Array<{ kind: BusinessDefinitionKind; value: any }>,
): BusinessDefinitionSnapshotInput {
  const keys = new Set(replacements.map((item) => item.value.definitionKey));
  const sort = <T extends { definitionKey: string }>(items: T[]) =>
    items.sort((left, right) => left.definitionKey.localeCompare(right.definitionKey));
  return {
    entities: sort([
      ...active.entities.filter((item) => !keys.has(item.definitionKey)),
      ...replacements.filter((item) => item.kind === 'entity').map((item) => item.value),
    ]),
    relations: sort([
      ...active.relations.filter((item) => !keys.has(item.definitionKey)),
      ...replacements.filter((item) => item.kind === 'relation').map((item) => item.value),
    ]),
    metrics: sort([
      ...active.metrics.filter((item) => !keys.has(item.definitionKey)),
      ...replacements.filter((item) => item.kind === 'metric').map((item) => item.value),
    ]),
    dimensions: sort([
      ...active.dimensions.filter((item) => !keys.has(item.definitionKey)),
      ...replacements.filter((item) => item.kind === 'dimension').map((item) => item.value),
    ]),
    actions: sort([
      ...(active.actions ?? []).filter((item) => !keys.has(item.definitionKey)),
      ...replacements.filter((item) => item.kind === 'action').map((item) => item.value),
    ]),
  };
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

function metricValueType(value: unknown): BusinessMetricDefinitionSnapshot['valueType'] {
  if (value === undefined) return undefined;
  const normalized = requiredString(value);
  if (!['money', 'count', 'percent', 'score', 'duration'].includes(normalized)) {
    throw new Error(`metric_value_type_invalid:${normalized}`);
  }
  return normalized as BusinessMetricDefinitionSnapshot['valueType'];
}

function metricAllowedTaskTypes(value: unknown): BusinessMetricDefinitionSnapshot['allowedTaskTypes'] {
  if (value === undefined) return undefined;
  const allowed = new Set([
    'query',
    'ranking',
    'recommendation',
    'diagnosis',
    'forecast',
    'draft',
    'workflow',
    'clarify',
  ]);
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

function mapAction({ row, domain, name, definition }: ParsedProjection): BusinessActionDefinitionSnapshot {
  const actionKey = requiredString(definition.actionKey);
  requireEqual(actionKey, row.definitionKey);
  const actionClass = requiredString(definition.actionClass);
  if (
    !['create', 'update', 'transition', 'delete', 'approve', 'notify', 'consume', 'reserve', 'execute'].includes(
      actionClass,
    )
  ) {
    throw new Error(`action_class_invalid:${actionClass}`);
  }
  const riskPolicy = requiredString(definition.riskPolicy);
  if (!['low', 'medium', 'high', 'critical'].includes(riskPolicy)) {
    throw new Error(`action_risk_policy_invalid:${riskPolicy}`);
  }
  const confirmationPolicy = requiredString(definition.confirmationPolicy);
  if (!['none', 'required', 'conditional'].includes(confirmationPolicy)) {
    throw new Error(`action_confirmation_policy_invalid:${confirmationPolicy}`);
  }
  const idempotencyPolicy = requiredString(definition.idempotencyPolicy);
  if (!['not_applicable', 'required'].includes(idempotencyPolicy)) {
    throw new Error(`action_idempotency_policy_invalid:${idempotencyPolicy}`);
  }
  const capabilityBindings = actionCapabilityBindings(definition.capabilityBindings);
  const aliases = definition.aliases === undefined ? [] : uniqueStrings(definition.aliases);
  const inputSlots = actionInputSlots(definition.inputSlots);
  const targetEntityRefs = nonEmptyStringArray(
    definition.targetEntityRefs,
    'action_target_entity_refs_must_not_be_empty',
  );
  const preconditions = definition.preconditions === undefined ? [] : uniqueStrings(definition.preconditions);
  const effects = definition.effects === undefined ? [] : uniqueStrings(definition.effects);
  const preconditionPredicateRefs = actionSemanticContractRefs(
    definition.preconditionPredicateRefs,
    'action_precondition_predicate_refs_must_be_an_array',
  );
  const effectAssertionRefs = actionSemanticContractRefs(
    definition.effectAssertionRefs,
    'action_effect_assertion_refs_must_be_an_array',
  );
  const participantProfile = actionParticipantProfile(definition.participantProfile, actionKey, inputSlots);
  const relationProfile = actionRelationProfile(
    definition.relationProfile,
    actionKey,
    actionClass as BusinessActionDefinitionSnapshot['actionClass'],
    targetEntityRefs,
    participantProfile,
  );
  const institutionalEffect = actionInstitutionalEffect(definition.institutionalEffect, actionKey, preconditions);
  return {
    definitionKey: row.definitionKey,
    domain,
    actionKey,
    name,
    aliases,
    description: optionalString(definition.description) ?? name,
    actionClass: actionClass as BusinessActionDefinitionSnapshot['actionClass'],
    targetEntityRefs,
    inputSlots,
    preconditions,
    preconditionPredicateRefs,
    effects,
    effectAssertionRefs,
    lexicalFrame: actionLexicalFrame(
      definition.lexicalFrame,
      actionKey,
      actionClass as BusinessActionDefinitionSnapshot['actionClass'],
      name,
      aliases,
      targetEntityRefs,
      inputSlots,
      preconditions,
      effects,
    ),
    situationContext: actionSituationContext(definition.situationContext, actionKey),
    modalityPolicy: actionModalityPolicy(definition.modalityPolicy, actionKey),
    informationArtifact: actionInformationArtifact(definition.informationArtifact, actionKey),
    sideEffectInvariant: actionSideEffectInvariant(definition.sideEffectInvariant, {
      actionKey,
      preconditions,
      preconditionPredicateRefs,
      effects,
      effectAssertionRefs,
    }),
    participantProfile,
    relationProfile,
    ...(institutionalEffect ? { institutionalEffect } : {}),
    triggeredByEventRefs:
      definition.triggeredByEventRefs === undefined ? [] : uniqueStrings(definition.triggeredByEventRefs),
    emitsEventRefs: definition.emitsEventRefs === undefined ? [] : uniqueStrings(definition.emitsEventRefs),
    riskPolicy: riskPolicy as BusinessActionDefinitionSnapshot['riskPolicy'],
    confirmationPolicy: confirmationPolicy as BusinessActionDefinitionSnapshot['confirmationPolicy'],
    idempotencyPolicy: idempotencyPolicy as BusinessActionDefinitionSnapshot['idempotencyPolicy'],
    capabilityBindings,
    bindingFingerprint: createBusinessDefinitionProjectionFingerprint({ actionKey, capabilityBindings }),
    version: row.definitionVersion,
    definitionFingerprint: row.definitionFingerprint,
    sourceFingerprint: row.sourceFingerprint,
  };
}

function actionParticipantProfile(
  value: unknown,
  actionKey: string,
  inputSlots: readonly BusinessActionInputSlotDefinition[],
): BusinessActionParticipantProfile {
  const profile = asRecord(value);
  requireOnlyKeys(
    profile,
    ['schemaVersion', 'profileKey', 'actorAliasPolicy', 'unboundRolePolicy', 'roleBindings', 'fingerprint'],
    'action_participant_profile_contains_unknown_field',
  );
  requireEqual(profile.schemaVersion, '1.0');
  requireEqual(profile.profileKey, `${actionKey}.participant`);
  requireEqual(profile.actorAliasPolicy, 'legacy_requester_only');
  requireEqual(profile.unboundRolePolicy, 'fail_closed');
  if (!Array.isArray(profile.roleBindings)) throw new Error('action_participant_role_bindings_must_be_an_array');
  const slots = new Map(inputSlots.map((slot) => [slot.slotKey, slot]));
  const roleBindings = profile.roleBindings.map((value) => {
    const binding = asRecord(value);
    requireOnlyKeys(
      binding,
      ['role', 'source', 'slotKey', 'requiredAt', 'qualificationPolicy', 'runtimeVisibility'],
      'action_participant_role_binding_contains_unknown_field',
    );
    const role = requiredString(binding.role);
    if (!ACTION_PARTICIPANT_ROLES.has(role)) throw new Error(`action_participant_role_invalid:${role}`);
    const source = requiredString(binding.source);
    if (!ACTION_PARTICIPANT_SOURCES.has(source)) throw new Error(`action_participant_source_invalid:${source}`);
    if (!validParticipantBindingSource(role, source)) {
      throw new Error(`action_participant_role_source_invalid:${role}:${source}`);
    }
    const slotKey = optionalString(binding.slotKey);
    if (source === 'action_slot') {
      const slot = slotKey ? slots.get(slotKey) : undefined;
      if (!slot || slot.semanticRole !== role) throw new Error(`action_participant_slot_invalid:${role}`);
    } else if (slotKey) {
      throw new Error(`action_participant_slot_not_allowed:${role}`);
    }
    const requiredAt = uniqueStrings(binding.requiredAt);
    if (requiredAt.some((stage) => !['recognition', 'preview', 'execution'].includes(stage))) {
      throw new Error(`action_participant_required_stage_invalid:${role}`);
    }
    const qualificationPolicy = requiredString(binding.qualificationPolicy);
    if (!ACTION_PARTICIPANT_QUALIFICATION_POLICIES.has(qualificationPolicy)) {
      throw new Error(`action_participant_qualification_invalid:${role}`);
    }
    const runtimeVisibility = requiredString(binding.runtimeVisibility);
    if (!ACTION_PARTICIPANT_RUNTIME_VISIBILITIES.has(runtimeVisibility)) {
      throw new Error(`action_participant_runtime_visibility_invalid:${role}`);
    }
    return {
      role: role as BusinessActionParticipantProfile['roleBindings'][number]['role'],
      source: source as BusinessActionParticipantProfile['roleBindings'][number]['source'],
      ...(slotKey ? { slotKey } : {}),
      requiredAt: requiredAt as BusinessActionParticipantProfile['roleBindings'][number]['requiredAt'],
      qualificationPolicy:
        qualificationPolicy as BusinessActionParticipantProfile['roleBindings'][number]['qualificationPolicy'],
      runtimeVisibility:
        runtimeVisibility as BusinessActionParticipantProfile['roleBindings'][number]['runtimeVisibility'],
    };
  });
  for (const requiredRole of ['requester', 'authorizer', 'performer', 'accountable_party']) {
    if (!roleBindings.some((binding) => binding.role === requiredRole)) {
      throw new Error(`action_participant_required_role_missing:${requiredRole}`);
    }
  }
  const seen = new Set<string>();
  for (const binding of roleBindings) {
    const key = `${binding.role}:${binding.slotKey ?? binding.source}`;
    if (seen.has(key)) throw new Error(`action_participant_role_binding_duplicate:${key}`);
    seen.add(key);
  }
  roleBindings.sort(
    (left, right) => left.role.localeCompare(right.role) || (left.slotKey ?? '').localeCompare(right.slotKey ?? ''),
  );
  const fingerprintInput = {
    schemaVersion: '1.0' as const,
    profileKey: `${actionKey}.participant`,
    actorAliasPolicy: 'legacy_requester_only' as const,
    unboundRolePolicy: 'fail_closed' as const,
    roleBindings,
  };
  const fingerprint = requiredString(profile.fingerprint);
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new Error('action_participant_profile_fingerprint_invalid');
  requireEqual(fingerprint, createBusinessDefinitionProjectionFingerprint(fingerprintInput));
  return { ...fingerprintInput, fingerprint };
}

function actionRelationProfile(
  value: unknown,
  actionKey: string,
  actionClass: BusinessActionDefinitionSnapshot['actionClass'],
  targetEntityRefs: readonly string[],
  participantProfile: BusinessActionParticipantProfile,
): BusinessActionRelationProfile {
  const profile = asRecord(value);
  requireOnlyKeys(
    profile,
    ['schemaVersion', 'profileKey', 'unknownRelationPolicy', 'inferencePolicy', 'relationRefs', 'fingerprint'],
    'action_relation_profile_contains_unknown_field',
  );
  requireEqual(profile.schemaVersion, '1.0');
  requireEqual(profile.profileKey, `${actionKey}.relations`);
  requireEqual(profile.unknownRelationPolicy, 'fail_closed');
  requireEqual(profile.inferencePolicy, 'explicit_only');
  if (!Array.isArray(profile.relationRefs)) throw new Error('action_relation_refs_must_be_an_array');
  const participantRoles = new Set(participantProfile.roleBindings.map((binding) => binding.role));
  const relationRefs = profile.relationRefs.map((value) => {
    const relation = asRecord(value);
    requireOnlyKeys(
      relation,
      [
        'relationDefinitionRef',
        'fromRef',
        'toRef',
        'qualificationKeys',
        'slotKey',
        'participantRole',
        'truthStatusPolicy',
      ],
      'action_relation_ref_contains_unknown_field',
    );
    const [relationDefinitionRef] = actionSemanticContractRefs(
      [relation.relationDefinitionRef],
      'action_relation_definition_ref_missing',
    );
    const definition = relationDefinitionRef
      ? resolveCuratedActionRelationDefinition(relationDefinitionRef)
      : undefined;
    if (!definition) throw new Error('action_relation_definition_unresolved');
    const fromRef = requiredString(relation.fromRef);
    const toRef = requiredString(relation.toRef);
    const qualificationKeys = uniqueStrings(relation.qualificationKeys);
    if (JSON.stringify(qualificationKeys) !== JSON.stringify([...definition.qualificationPolicy.requiredKeys].sort())) {
      throw new Error(`action_relation_qualification_mismatch:${definition.relationKey}`);
    }
    const truthStatusPolicy = requiredString(relation.truthStatusPolicy);
    const expectedTruthStatusPolicy =
      definition.truthMode === 'declared' ? 'declared_only' : 'runtime_evaluator_required';
    requireEqual(truthStatusPolicy, expectedTruthStatusPolicy);
    const participantRole = optionalString(relation.participantRole);
    const slotKey = optionalString(relation.slotKey);
    if (participantRole) {
      if (!ACTION_PARTICIPANT_ROLES.has(participantRole) || !participantRoles.has(participantRole as never)) {
        throw new Error(`action_relation_participant_role_invalid:${participantRole}`);
      }
      const binding = participantProfile.roleBindings.find(
        (item) => item.role === participantRole && (slotKey ? item.slotKey === slotKey : true),
      );
      if (!binding) throw new Error(`action_relation_participant_binding_missing:${participantRole}`);
    }
    if (
      definition.relationKey === 'action_relation.occurrence_of' &&
      (fromRef !== '$action_execution' || toRef !== actionKey)
    ) {
      throw new Error('action_relation_occurrence_identity_invalid');
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
      throw new Error(`action_relation_target_invalid:${definition.relationKey}`);
    }
    return {
      relationDefinitionRef: relationDefinitionRef!,
      fromRef,
      toRef,
      qualificationKeys:
        qualificationKeys as BusinessActionRelationProfile['relationRefs'][number]['qualificationKeys'],
      ...(slotKey ? { slotKey } : {}),
      ...(participantRole
        ? {
            participantRole:
              participantRole as BusinessActionRelationProfile['relationRefs'][number]['participantRole'],
          }
        : {}),
      truthStatusPolicy:
        truthStatusPolicy as BusinessActionRelationProfile['relationRefs'][number]['truthStatusPolicy'],
    };
  });
  if (!relationRefs.some((ref) => ref.relationDefinitionRef.key === 'action_relation.occurrence_of')) {
    throw new Error('action_relation_occurrence_ref_missing');
  }
  for (const targetEntityRef of targetEntityRefs) {
    if (
      !relationRefs.some(
        (ref) => ref.relationDefinitionRef.key === 'action_relation.acts_on' && ref.toRef === targetEntityRef,
      )
    ) {
      throw new Error(`action_relation_target_ref_missing:${targetEntityRef}`);
    }
  }
  if (
    (actionClass === 'create' || actionClass === 'reserve') &&
    !relationRefs.some((ref) => ref.relationDefinitionRef.key === 'action_relation.creates')
  ) {
    throw new Error('action_relation_create_ref_missing');
  }
  if (
    (actionClass === 'transition' || actionClass === 'update') &&
    !relationRefs.some((ref) => ref.relationDefinitionRef.key === 'action_relation.state_transition')
  ) {
    throw new Error('action_relation_state_transition_ref_missing');
  }
  const institutionalEffectRefs = relationRefs.filter(
    (ref) => ref.relationDefinitionRef.key === 'action_relation.institutional_effect',
  );
  const requiresInstitutionalEffect = INSTITUTIONAL_EFFECT_ACTION_KEYS.includes(actionKey);
  if (
    (requiresInstitutionalEffect &&
      (institutionalEffectRefs.length !== 1 ||
        institutionalEffectRefs[0].fromRef !== '$action_execution' ||
        institutionalEffectRefs[0].toRef !== `${actionKey}.institutional_effect`)) ||
    (!requiresInstitutionalEffect && institutionalEffectRefs.length)
  ) {
    throw new Error('action_relation_institutional_effect_ref_invalid');
  }
  relationRefs.sort(
    (left, right) =>
      left.relationDefinitionRef.key.localeCompare(right.relationDefinitionRef.key) ||
      left.fromRef.localeCompare(right.fromRef) ||
      left.toRef.localeCompare(right.toRef),
  );
  const fingerprintInput = {
    schemaVersion: '1.0' as const,
    profileKey: `${actionKey}.relations`,
    unknownRelationPolicy: 'fail_closed' as const,
    inferencePolicy: 'explicit_only' as const,
    relationRefs,
  };
  const fingerprint = requiredString(profile.fingerprint);
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new Error('action_relation_profile_fingerprint_invalid');
  requireEqual(fingerprint, createBusinessDefinitionProjectionFingerprint(fingerprintInput));
  return { ...fingerprintInput, fingerprint };
}

function actionInstitutionalEffect(
  value: unknown,
  actionKey: string,
  preconditions: readonly string[],
): BusinessActionDefinitionSnapshot['institutionalEffect'] | undefined {
  const expected = createBusinessActionInstitutionalEffectProfile({ actionKey, preconditions });
  if (!expected) {
    if (value !== undefined && value !== null) throw new Error('action_institutional_effect_profile_unexpected');
    return undefined;
  }
  const profile = asRecord(value);
  requireOnlyKeys(
    profile,
    [
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
    ],
    'action_institutional_effect_contains_unknown_field',
  );
  requireEqual(
    createBusinessDefinitionProjectionFingerprint(profile),
    createBusinessDefinitionProjectionFingerprint(expected),
  );
  return expected;
}

function actionModalityPolicy(value: unknown, actionKey: string): BusinessActionDefinitionSnapshot['modalityPolicy'] {
  const policy = asRecord(value);
  requireOnlyKeys(
    policy,
    [
      'schemaVersion',
      'policyKey',
      'supportedModalities',
      'unsupportedModalityPolicy',
      'confirmationReferencePolicy',
      'schedulePolicy',
      'cancellationReferencePolicy',
      'fingerprint',
    ],
    'action_modality_policy_contains_unknown_field',
  );
  requireEqual(policy.schemaVersion, '1.0');
  requireEqual(policy.policyKey, `${actionKey}.speech_act_modality`);
  const supportedModalities = nonEmptyStringArray(
    policy.supportedModalities,
    'action_supported_modalities_must_not_be_empty',
  );
  if (supportedModalities.some((item) => item !== 'request')) {
    throw new Error('action_supported_modality_not_implemented');
  }
  requireEqual(policy.unsupportedModalityPolicy, 'fail_closed');
  requireEqual(policy.confirmationReferencePolicy, 'existing_confirmation_required');
  requireEqual(policy.schedulePolicy, 'action_plan_required');
  requireEqual(policy.cancellationReferencePolicy, 'existing_preview_or_plan_required');
  const fingerprintInput = {
    schemaVersion: '1.0' as const,
    policyKey: `${actionKey}.speech_act_modality`,
    supportedModalities: supportedModalities as ['request'],
    unsupportedModalityPolicy: 'fail_closed' as const,
    confirmationReferencePolicy: 'existing_confirmation_required' as const,
    schedulePolicy: 'action_plan_required' as const,
    cancellationReferencePolicy: 'existing_preview_or_plan_required' as const,
  };
  const fingerprint = requiredString(policy.fingerprint);
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new Error('action_modality_policy_fingerprint_invalid');
  requireEqual(fingerprint, createBusinessDefinitionProjectionFingerprint(fingerprintInput));
  return { ...fingerprintInput, fingerprint };
}

function actionInformationArtifact(
  value: unknown,
  actionKey: string,
): BusinessActionDefinitionSnapshot['informationArtifact'] {
  const profile = asRecord(value);
  requireOnlyKeys(
    profile,
    [
      'schemaVersion',
      'profileKey',
      'referencePolicy',
      'artifactTypePolicy',
      'sourcePolicy',
      'versionPolicy',
      'contentIntegrityPolicy',
      'supersessionPolicy',
      'fingerprint',
    ],
    'action_information_artifact_contains_unknown_field',
  );
  const fingerprintInput = {
    schemaVersion: '1.0' as const,
    profileKey: `${actionKey}.information_artifact`,
    referencePolicy: 'bind_if_present' as const,
    artifactTypePolicy: 'governed_result_reference' as const,
    sourcePolicy: 'completed_brain_run_same_conversation_store_user' as const,
    versionPolicy: 'source_run_and_capability_version' as const,
    contentIntegrityPolicy: 'canonical_content_fingerprint' as const,
    supersessionPolicy: 'explicit_new_reference_only' as const,
  };
  for (const [key, expected] of Object.entries(fingerprintInput)) requireEqual(profile[key], expected);
  const fingerprint = requiredString(profile.fingerprint);
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new Error('action_information_artifact_fingerprint_invalid');
  requireEqual(fingerprint, createBusinessDefinitionProjectionFingerprint(fingerprintInput));
  return { ...fingerprintInput, fingerprint };
}

function actionSideEffectInvariant(
  value: unknown,
  input: Pick<
    BusinessActionDefinitionSnapshot,
    'actionKey' | 'preconditions' | 'preconditionPredicateRefs' | 'effects' | 'effectAssertionRefs'
  >,
): BusinessActionDefinitionSnapshot['sideEffectInvariant'] {
  const profile = asRecord(value);
  requireOnlyKeys(
    profile,
    [
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
    ],
    'action_side_effect_invariant_contains_unknown_field',
  );
  const [invariantContractRef] = actionSemanticContractRefs(
    [profile.invariantContractRef],
    'action_invariant_contract_ref_missing',
  );
  const invariantContract = invariantContractRef
    ? resolveCuratedActionInvariantContract(invariantContractRef)
    : undefined;
  if (!invariantContract || invariantContract.actionKey !== input.actionKey) {
    throw new Error(`action_invariant_contract_drift:${input.actionKey}`);
  }
  const fingerprintInput = {
    schemaVersion: '1.2' as const,
    profileKey: `${input.actionKey}.side_effect_invariant`,
    guardContractFingerprint: createBusinessDefinitionProjectionFingerprint({
      actionKey: input.actionKey,
      preconditions: [...input.preconditions].sort(),
      predicateRefs: [...input.preconditionPredicateRefs]
        .map((ref) => ({ ...ref }))
        .sort((left, right) => left.key.localeCompare(right.key)),
    }),
    effectContractFingerprint: createBusinessDefinitionProjectionFingerprint({
      actionKey: input.actionKey,
      effects: [...input.effects].sort(),
      effectRefs: [...input.effectAssertionRefs]
        .map((ref) => ({ ...ref }))
        .sort((left, right) => left.key.localeCompare(right.key)),
    }),
    invariantContractRef,
    undeclaredSideEffectPolicy: 'forbid' as const,
    gatewayEffectPolicy: 'exact_declared_effect_match' as const,
    mutationFootprintEvidencePolicy: 'exact_database_trigger_observed_write_set' as const,
    successEvidencePolicy: 'all_declared_effects_observed' as const,
    partialSuccessPolicy: 'explicit_partially_succeeded' as const,
    recoveryPolicy: 'gateway_declared_strategy_only' as const,
    compensationPolicy: 'explicit_compensation_action_required' as const,
    outcomeObservationPolicy: 'required_for_async_effects' as const,
  };
  for (const [key, expected] of Object.entries(fingerprintInput)) {
    if (key === 'invariantContractRef') {
      requireEqual(
        createBusinessDefinitionProjectionFingerprint(profile[key]),
        createBusinessDefinitionProjectionFingerprint(expected),
      );
    } else {
      requireEqual(profile[key], expected);
    }
  }
  const fingerprint = requiredString(profile.fingerprint);
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new Error('action_side_effect_invariant_fingerprint_invalid');
  requireEqual(fingerprint, createBusinessDefinitionProjectionFingerprint(fingerprintInput));
  return { ...fingerprintInput, fingerprint };
}

function actionSituationContext(value: unknown, actionKey: string): BusinessActionSituationContextProfile {
  const profile = asRecord(value);
  requireOnlyKeys(
    profile,
    [
      'schemaVersion',
      'profileKey',
      'tenantBoundary',
      'requestChannelPolicy',
      'devicePolicy',
      'conversationPolicy',
      'businessTimePolicy',
      'actorPolicy',
      'fingerprint',
    ],
    'action_situation_context_contains_unknown_field',
  );
  requireEqual(profile.schemaVersion, '1.0');
  requireEqual(profile.profileKey, `${actionKey}.situation_context`);
  requireEqual(profile.tenantBoundary, 'current_store');
  requireEqual(profile.requestChannelPolicy, 'bind_if_present');
  requireEqual(profile.devicePolicy, 'bind_if_present');
  requireEqual(profile.conversationPolicy, 'same_conversation');

  const businessTimePolicy = asRecord(profile.businessTimePolicy);
  requireOnlyKeys(
    businessTimePolicy,
    ['timezone', 'businessDatePolicy', 'clockSource'],
    'action_situation_business_time_policy_contains_unknown_field',
  );
  requireEqual(businessTimePolicy.timezone, 'Asia/Shanghai');
  requireEqual(businessTimePolicy.businessDatePolicy, 'same_business_date');
  requireEqual(businessTimePolicy.clockSource, 'server');

  const actorPolicy = asRecord(profile.actorPolicy);
  requireOnlyKeys(
    actorPolicy,
    ['subjectPolicy', 'qualificationPolicy'],
    'action_situation_actor_policy_contains_unknown_field',
  );
  requireEqual(actorPolicy.subjectPolicy, 'same_authenticated_user');
  requireEqual(actorPolicy.qualificationPolicy, 'revalidate_current_role_and_permission');

  const fingerprintInput = {
    schemaVersion: '1.0' as const,
    profileKey: `${actionKey}.situation_context`,
    tenantBoundary: 'current_store' as const,
    requestChannelPolicy: 'bind_if_present' as const,
    devicePolicy: 'bind_if_present' as const,
    conversationPolicy: 'same_conversation' as const,
    businessTimePolicy: {
      timezone: 'Asia/Shanghai' as const,
      businessDatePolicy: 'same_business_date' as const,
      clockSource: 'server' as const,
    },
    actorPolicy: {
      subjectPolicy: 'same_authenticated_user' as const,
      qualificationPolicy: 'revalidate_current_role_and_permission' as const,
    },
  };
  const fingerprint = requiredString(profile.fingerprint);
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new Error('action_situation_context_fingerprint_invalid');
  requireEqual(fingerprint, createBusinessDefinitionProjectionFingerprint(fingerprintInput));
  return { ...fingerprintInput, fingerprint };
}

function actionLexicalFrame(
  value: unknown,
  actionKey: string,
  actionClass: BusinessActionDefinitionSnapshot['actionClass'],
  actionName: string,
  aliases: readonly string[],
  targetEntityRefs: readonly string[],
  inputSlots: readonly BusinessActionInputSlotDefinition[],
  preconditions: readonly string[],
  effects: readonly string[],
): BusinessActionLexicalFrame {
  const frame = asRecord(value);
  requireOnlyKeys(
    frame,
    ['schemaVersion', 'frameKey', 'lexicalUnits', 'thematicRoles', 'semanticPredicates', 'contrasts', 'fingerprint'],
    'action_lexical_frame_contains_unknown_field',
  );
  requireEqual(frame.schemaVersion, '1.0');
  requireEqual(frame.frameKey, `${actionKey}.lexical_frame`);
  const lexicalUnits = nonEmptyStringArray(frame.lexicalUnits, 'action_lexical_units_must_not_be_empty');
  for (const expected of [actionName, ...aliases]) {
    if (!lexicalUnits.includes(expected)) throw new Error(`action_lexical_unit_missing:${expected}`);
  }

  if (!Array.isArray(frame.thematicRoles)) throw new Error('action_lexical_thematic_roles_must_be_an_array');
  const slotsByKey = new Map(inputSlots.map((slot) => [slot.slotKey, slot]));
  const coveredSlots = new Set<string>();
  const thematicRoles = frame.thematicRoles.map((item) => {
    const role = asRecord(item);
    requireOnlyKeys(role, ['semanticRole', 'slotKeys'], 'action_lexical_thematic_role_contains_unknown_field');
    const semanticRole = requiredString(role.semanticRole);
    if (!ACTION_SEMANTIC_ROLES.has(semanticRole)) {
      throw new Error(`action_lexical_thematic_role_invalid:${semanticRole}`);
    }
    const slotKeys = nonEmptyStringArray(role.slotKeys, 'action_lexical_thematic_role_slot_keys_empty');
    for (const slotKey of slotKeys) {
      const slot = slotsByKey.get(slotKey);
      if (!slot) throw new Error(`action_lexical_thematic_role_slot_missing:${slotKey}`);
      if (slot.semanticRole !== semanticRole) {
        throw new Error(`action_lexical_thematic_role_slot_mismatch:${slotKey}:${semanticRole}`);
      }
      if (coveredSlots.has(slotKey)) throw new Error(`action_lexical_thematic_role_slot_duplicate:${slotKey}`);
      coveredSlots.add(slotKey);
    }
    return {
      semanticRole: semanticRole as BusinessActionLexicalFrame['thematicRoles'][number]['semanticRole'],
      slotKeys,
    };
  });
  if (coveredSlots.size !== inputSlots.length) throw new Error('action_lexical_thematic_roles_incomplete');

  const semanticPredicates = nonEmptyStringArray(
    frame.semanticPredicates,
    'action_lexical_semantic_predicates_must_not_be_empty',
  );
  const semanticErrors = validateBusinessActionSemanticPredicates(semanticPredicates, {
    actionKey,
    actionClass,
    targetEntityRefs,
    preconditions,
    effects,
  });
  if (semanticErrors.length) throw new Error(semanticErrors.join(','));
  if (!Array.isArray(frame.contrasts) || !frame.contrasts.length) {
    throw new Error('action_lexical_contrasts_must_not_be_empty');
  }
  const contrastKeys = new Set<string>();
  const contrasts = frame.contrasts.map((item) => {
    const contrast = asRecord(item);
    requireOnlyKeys(
      contrast,
      ['conceptKey', 'name', 'discriminators'],
      'action_lexical_contrast_contains_unknown_field',
    );
    const conceptKey = requiredString(contrast.conceptKey);
    if (!/^(?:action|speech)\.[a-z][a-z0-9_]*$/u.test(conceptKey) || conceptKey === actionKey) {
      throw new Error(`action_lexical_contrast_key_invalid:${conceptKey}`);
    }
    if (contrastKeys.has(conceptKey)) throw new Error(`action_lexical_contrast_duplicate:${conceptKey}`);
    contrastKeys.add(conceptKey);
    if (!Array.isArray(contrast.discriminators) || !contrast.discriminators.length) {
      throw new Error(`action_lexical_contrast_discriminators_empty:${conceptKey}`);
    }
    const discriminators = contrast.discriminators.map((entry) => {
      const discriminator = asRecord(entry);
      requireOnlyKeys(
        discriminator,
        ['dimension', 'currentActionValue', 'contrastActionValue'],
        'action_lexical_discriminator_contains_unknown_field',
      );
      const dimension = requiredString(discriminator.dimension);
      if (!ACTION_LEXICAL_DISCRIMINATOR_DIMENSIONS.has(dimension)) {
        throw new Error(`action_lexical_discriminator_dimension_invalid:${conceptKey}:${dimension}`);
      }
      return {
        dimension: dimension as BusinessActionLexicalFrame['contrasts'][number]['discriminators'][number]['dimension'],
        currentActionValue: requiredString(discriminator.currentActionValue),
        contrastActionValue: requiredString(discriminator.contrastActionValue),
      };
    });
    return { conceptKey, name: requiredString(contrast.name), discriminators };
  });
  const fingerprint = requiredString(frame.fingerprint);
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) throw new Error('action_lexical_frame_fingerprint_invalid');
  const fingerprintInput = {
    schemaVersion: '1.0' as const,
    frameKey: `${actionKey}.lexical_frame`,
    lexicalUnits,
    thematicRoles,
    semanticPredicates,
    contrasts,
  };
  requireEqual(fingerprint, createBusinessDefinitionProjectionFingerprint(fingerprintInput));
  return { ...fingerprintInput, fingerprint };
}

function actionSemanticContractRefs(value: unknown, missingCode: string) {
  if (!Array.isArray(value)) throw new Error(missingCode);
  const seen = new Set<string>();
  return value.map((item) => {
    const reference = asRecord(item);
    requireOnlyKeys(
      reference,
      ['key', 'version', 'fingerprint'],
      'action_semantic_contract_ref_contains_unknown_field',
    );
    const key = requiredString(reference.key);
    if (seen.has(key)) throw new Error(`action_semantic_contract_ref_duplicate:${key}`);
    seen.add(key);
    const version = Number(reference.version);
    if (!Number.isInteger(version) || version <= 0)
      throw new Error(`action_semantic_contract_ref_version_invalid:${key}`);
    const fingerprint = requiredString(reference.fingerprint);
    if (!/^[0-9a-f]{64}$/u.test(fingerprint)) {
      throw new Error(`action_semantic_contract_ref_fingerprint_invalid:${key}`);
    }
    return { key, version, fingerprint };
  });
}

function actionInputSlots(value: unknown): BusinessActionInputSlotDefinition[] {
  if (!Array.isArray(value)) throw new Error('action_input_slots_must_be_an_array');
  return value.map((item) => {
    const slot = asRecord(item);
    requireOnlyKeys(
      slot,
      [
        'slotKey',
        'label',
        'semanticRole',
        'valueType',
        'entityTypeRef',
        'unitPolicy',
        'requiredAt',
        'cardinality',
        'sensitive',
        'resolutionPolicy',
        'validationPolicy',
        'defaultPolicy',
        'confirmationDisplay',
      ],
      'action_input_slot_contains_unknown_field',
    );
    const semanticRole = requiredString(slot.semanticRole);
    if (
      ![
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
      ].includes(semanticRole)
    ) {
      throw new Error(`action_slot_semantic_role_invalid:${semanticRole}`);
    }
    const valueType = requiredString(slot.valueType);
    if (!['entity_ref', 'number', 'money', 'enum', 'text', 'time', 'boolean'].includes(valueType)) {
      throw new Error(`action_slot_value_type_invalid:${valueType}`);
    }
    const requiredAt = uniqueStrings(slot.requiredAt);
    if (requiredAt.some((stage) => !['recognition', 'preview', 'execution'].includes(stage))) {
      throw new Error('action_slot_required_stage_invalid');
    }
    const cardinality = slot.cardinality === undefined ? 'one' : requiredString(slot.cardinality);
    if (cardinality !== 'one' && cardinality !== 'many') throw new Error('action_slot_cardinality_invalid');
    if (slot.sensitive !== undefined && typeof slot.sensitive !== 'boolean') {
      throw new Error('action_slot_sensitive_invalid');
    }
    if (slot.confirmationDisplay !== undefined && typeof slot.confirmationDisplay !== 'boolean') {
      throw new Error('action_slot_confirmation_display_invalid');
    }
    const entityTypeRef = optionalString(slot.entityTypeRef);
    const unitPolicy = optionalString(slot.unitPolicy);
    const resolutionPolicy = optionalString(slot.resolutionPolicy);
    const validationPolicy = optionalString(slot.validationPolicy);
    const defaultPolicy = optionalString(slot.defaultPolicy);
    return {
      slotKey: requiredString(slot.slotKey),
      label: requiredString(slot.label),
      semanticRole: semanticRole as BusinessActionInputSlotDefinition['semanticRole'],
      valueType: valueType as BusinessActionInputSlotDefinition['valueType'],
      ...(entityTypeRef ? { entityTypeRef } : {}),
      ...(unitPolicy ? { unitPolicy } : {}),
      requiredAt: requiredAt as BusinessActionInputSlotDefinition['requiredAt'],
      cardinality,
      sensitive: slot.sensitive === true,
      ...(resolutionPolicy ? { resolutionPolicy } : {}),
      ...(validationPolicy ? { validationPolicy } : {}),
      ...(defaultPolicy ? { defaultPolicy } : {}),
      confirmationDisplay: slot.confirmationDisplay !== false,
    };
  });
}

function actionCapabilityBindings(value: unknown): BusinessActionCapabilityBinding[] {
  if (!Array.isArray(value)) throw new Error('action_capability_bindings_must_be_an_array');
  const bindings = value.map((item) => {
    const binding = asRecord(item);
    requireOnlyKeys(
      binding,
      ['capabilityKey', 'bindingMode', 'gatewayActionKey', 'priority', 'enabled'],
      'action_capability_binding_contains_unknown_field',
    );
    const bindingMode = requiredString(binding.bindingMode);
    if (!['preview_only', 'preview_and_execute', 'execute_only'].includes(bindingMode)) {
      throw new Error(`action_capability_binding_mode_invalid:${bindingMode}`);
    }
    const priority =
      binding.priority === undefined ? 0 : finiteNumber(binding.priority, 'action_binding_priority_invalid');
    if (!Number.isInteger(priority) || priority < 0) throw new Error('action_binding_priority_invalid');
    if (binding.enabled !== undefined && typeof binding.enabled !== 'boolean') {
      throw new Error('action_binding_enabled_invalid');
    }
    const gatewayActionKey = optionalString(binding.gatewayActionKey);
    return {
      capabilityKey: requiredString(binding.capabilityKey),
      bindingMode: bindingMode as BusinessActionCapabilityBinding['bindingMode'],
      ...(gatewayActionKey ? { gatewayActionKey } : {}),
      priority,
      enabled: binding.enabled !== false,
    };
  });
  if (!bindings.some((binding) => binding.enabled)) {
    throw new Error('action_capability_bindings_must_contain_enabled_binding');
  }
  return bindings.sort(
    (left, right) => left.priority - right.priority || left.capabilityKey.localeCompare(right.capabilityKey),
  );
}

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
  const fixedSources = {
    requester: 'authenticated_user',
    authorizer: 'confirmation_actor',
    performer: 'gateway_executor',
    accountable_party: 'confirmation_actor',
  };
  if (fixedSources[role as keyof typeof fixedSources])
    return fixedSources[role as keyof typeof fixedSources] === source;
  return source === 'action_slot' || source === 'workflow_assignment';
}

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
