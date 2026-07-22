import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import {
  BUSINESS_DEFINITION_SNAPSHOT_PROVIDER,
  type BusinessDefinitionKind,
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
const PHYSICAL_SOURCE_KEYS = new Set(['model', 'field']);

@Injectable()
export class BrainOntologyRuntimeService implements OnModuleInit {
  private snapshot: ProductionReadyBusinessDefinitionSnapshot | null = null;
  private aliasIndex: EntityAliasIndex | null = null;
  private readonly evaluationSnapshotCache = new Map<
    string,
    Promise<ProductionReadyBusinessDefinitionSnapshot>
  >();

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
    const aliasIndex = snapshotOverride
      ? buildEntityAliasIndex(snapshotOverride.entities)
      : this.requireAliasIndex();
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

function normalizeSnapshot(input: BusinessDefinitionSnapshotInput): BusinessDefinitionSnapshotInput {
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
  } as BusinessDefinitionSnapshotInput;
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
    throw new Error(
      `Prisma field ${runtimeQuery.storeScope.model}.${runtimeQuery.storeScope.field} does not exist`,
    );
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

function rejectDuplicateKeys<T>(
  definitions: T[],
  kind: BusinessDefinitionKind,
  getKey: (definition: T) => string,
): void {
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
