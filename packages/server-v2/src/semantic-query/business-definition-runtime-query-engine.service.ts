import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BUSINESS_DEFINITION_SNAPSHOT_PROVIDER,
  type BusinessDefinitionSnapshotProvider,
  type BusinessMetricRuntimeAggregation,
  type BusinessMetricRuntimeQuery,
  type PrismaRuntimeDataModel,
} from '../brain/cognition/business-definition-snapshot.types.js';

const MAX_READ_ROWS = 5000;
const TRANSIENT_READ_RETRY_DELAY_MS = 50;
const TRANSIENT_READ_MAX_ATTEMPTS = 3;
const NUMERIC_FIELD_TYPES = new Set(['Int', 'BigInt', 'Float', 'Decimal']);
const FILTER_OPERATORS = new Set(['eq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'not', 'contains']);
const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1008', 'P1017', 'P2024', 'P2034', 'P2037']);

type UnknownRecord = Record<string, unknown>;

export interface RuntimeMetricExecutionBinding {
  readonly metricKey: string;
  readonly formula: unknown;
  readonly runtimeQuery: BusinessMetricRuntimeQuery;
}

export interface RuntimeDimensionExecutionBinding {
  readonly key: string;
  readonly name: string;
  readonly model: string;
  readonly field: string;
}

export interface RuntimeMetricExecutionResult {
  outputField: string;
  groups: Array<{ dimensions: Record<string, unknown>; value: number }>;
  overallValue: number;
  scannedRows: number;
}

interface RuntimePathStep {
  fromModel: string;
  relationField: string;
  toModel: string;
  isList: boolean;
}

@Injectable()
export class BusinessDefinitionRuntimeQueryEngineService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BUSINESS_DEFINITION_SNAPSHOT_PROVIDER)
    private readonly definitionProvider: BusinessDefinitionSnapshotProvider,
  ) {}

  async executeMetric(input: {
    metric: RuntimeMetricExecutionBinding;
    dimensions: readonly RuntimeDimensionExecutionBinding[];
    selfScope?: Readonly<{ dimensionKey: string; value: number }>;
    storeId: number;
    timeRange: { startDate: Date; endExclusive: Date; rangeLabel: string };
  }): Promise<RuntimeMetricExecutionResult> {
    const { metric, dimensions, storeId, timeRange } = input;
    if (metric.runtimeQuery.resolver) {
      throw new Error(`semantic_runtime_query_resolver_not_supported:${metric.metricKey}`);
    }
    const dataModel = this.definitionProvider.getRuntimeDataModel();
    const formula = this.formula(metric);
    this.validateFormula(metric, formula, dataModel);
    this.validateJoinGraph(metric.runtimeQuery.joinPath, dataModel);
    const resolvedDimensions = this.resolveDimensions(
      dimensions,
      metric,
      formula.model,
      metric.runtimeQuery.joinPath,
      dataModel,
    );
    const select: UnknownRecord = {};
    this.addSelect(select, [], formula.field);
    for (const dimension of resolvedDimensions) this.addSelect(select, dimension.path, dimension.field);

    const conditions: UnknownRecord[] = [];
    for (const filter of metric.runtimeQuery.filters) {
      conditions.push(this.filterCondition(formula.model, metric.runtimeQuery.joinPath, filter, dataModel));
    }
    if (input.selfScope) {
      conditions.push(this.selfScopeCondition(metric, resolvedDimensions, input.selfScope));
    }
    conditions.push(this.storeCondition(formula.model, metric.runtimeQuery.storeScope, storeId, dataModel));
    conditions.push(this.timeCondition(formula.model, metric.runtimeQuery, metric.runtimeQuery.joinPath, timeRange, dataModel));

    const query = {
      where: { AND: conditions },
      select,
      take: MAX_READ_ROWS + 1,
    };
    const delegate = this.prismaDelegate(formula.model);
    const rows = await this.executeTransientReadRetry(() => delegate.findMany(query));
    if (!Array.isArray(rows)) throw new Error(`semantic_prisma_result_invalid:${formula.model}`);
    if (rows.length > MAX_READ_ROWS) throw new Error('semantic_query_row_limit_exceeded');
    const resultRows = rows as UnknownRecord[];
    const grouped = new Map<string, { dimensions: Record<string, unknown>; values: unknown[] }>();
    for (const row of resultRows) {
      const dimensionValues = Object.fromEntries(
        resolvedDimensions.map((dimension) => [dimension.key, this.readValue(row, dimension.path, dimension.field)]),
      );
      const key = JSON.stringify(dimensionValues);
      const target = grouped.get(key) ?? { dimensions: dimensionValues, values: [] };
      target.values.push(row[formula.field]);
      grouped.set(key, target);
    }
    if (!rows.length && !resolvedDimensions.length) grouped.set('{}', { dimensions: {}, values: [] });
    return {
      outputField: metric.runtimeQuery.outputFields[0],
      overallValue: this.aggregate(metric.runtimeQuery.aggregation, resultRows.map((row) => row[formula.field])),
      groups: [...grouped.values()].map((group) => ({
        dimensions: group.dimensions,
        value: this.aggregate(metric.runtimeQuery.aggregation, group.values),
      })),
      scannedRows: rows.length,
    };
  }

  private selfScopeCondition(
    metric: RuntimeMetricExecutionBinding,
    dimensions: Array<RuntimeDimensionExecutionBinding & { path: RuntimePathStep[] }>,
    selfScope: Readonly<{ dimensionKey: string; value: number }>,
  ): UnknownRecord {
    if (!Number.isInteger(selfScope.value) || selfScope.value <= 0) {
      throw new Error(`semantic_self_scope_value_invalid:${metric.metricKey}`);
    }
    if (!metric.runtimeQuery.dimensions.includes(selfScope.dimensionKey)) {
      throw new Error(`semantic_self_scope_unapplicable:${metric.metricKey}:${selfScope.dimensionKey}`);
    }
    const dimension = dimensions.find((item) => item.key === selfScope.dimensionKey);
    if (!dimension) throw new Error(`semantic_self_scope_unapplicable:${metric.metricKey}:${selfScope.dimensionKey}`);
    return this.nestedWhere(dimension.path, { [dimension.field]: selfScope.value });
  }

  private formula(metric: RuntimeMetricExecutionBinding) {
    const formula = this.asRecord(metric.formula, `semantic_formula_invalid:${metric.metricKey}`);
    const type = String(formula.type) as BusinessMetricRuntimeAggregation;
    const model = this.requiredString(formula.model, `semantic_formula_model_invalid:${metric.metricKey}`);
    const field = this.requiredString(formula.field, `semantic_formula_field_invalid:${metric.metricKey}`);
    if (type !== metric.runtimeQuery.aggregation) {
      throw new Error(`semantic_formula_aggregation_mismatch:${metric.metricKey}`);
    }
    return { type, model, field };
  }

  private validateFormula(
    metric: RuntimeMetricExecutionBinding,
    formula: { type: BusinessMetricRuntimeAggregation; model: string; field: string },
    dataModel: PrismaRuntimeDataModel,
  ) {
    if (formula.type === 'ratio' || formula.type === 'score') {
      throw new Error(`semantic_aggregation_expression_required:${metric.metricKey}:${formula.type}`);
    }
    const field = this.field(dataModel, formula.model, formula.field);
    if (field.kind === 'object') throw new Error(`semantic_measure_field_not_scalar:${formula.model}.${formula.field}`);
    if (['sum', 'avg'].includes(formula.type) && !NUMERIC_FIELD_TYPES.has(field.type)) {
      throw new Error(`semantic_measure_field_not_numeric:${metric.metricKey}:${formula.model}.${formula.field}`);
    }
  }

  private resolveDimensions(
    definitions: readonly RuntimeDimensionExecutionBinding[],
    metric: RuntimeMetricExecutionBinding,
    baseModel: string,
    joinGraph: BusinessMetricRuntimeQuery['joinPath'],
    dataModel: PrismaRuntimeDataModel,
  ) {
    return metric.runtimeQuery.dimensions.map((dimensionKey) => {
      const definition = definitions.find((item) => item.key === dimensionKey);
      if (!definition) throw new Error(`semantic_dimension_binding_missing:${dimensionKey}`);
      const modelField = this.field(dataModel, definition.model, definition.field);
      if (modelField.kind === 'object') throw new Error(`semantic_dimension_field_not_scalar:${dimensionKey}`);
      const path = this.pathToModel(baseModel, definition.model, joinGraph, dataModel);
      const listStep = path.find((step) => step.isList);
      if (listStep) {
        throw new Error(`semantic_list_relation_dimension_unsupported:${listStep.fromModel}.${listStep.relationField}`);
      }
      return { ...definition, path };
    });
  }

  private filterCondition(
    baseModel: string,
    joinGraph: BusinessMetricRuntimeQuery['joinPath'],
    filter: Readonly<Record<string, unknown>>,
    dataModel: PrismaRuntimeDataModel,
  ): UnknownRecord {
    const model = this.requiredString(filter.model, 'semantic_filter_model_invalid');
    const fieldName = this.requiredString(filter.field, 'semantic_filter_field_invalid');
    const operator = this.requiredString(filter.operator, 'semantic_filter_operator_invalid');
    if (!FILTER_OPERATORS.has(operator)) throw new Error(`semantic_filter_operator_unsupported:${operator}`);
    const field = this.field(dataModel, model, fieldName);
    if (field.kind === 'object') throw new Error(`semantic_filter_field_not_scalar:${model}.${fieldName}`);
    if ((operator === 'in' || operator === 'notIn') && !Array.isArray(filter.value)) {
      throw new Error(`semantic_filter_value_invalid:${operator}`);
    }
    if (operator === 'contains' && typeof filter.value !== 'string') {
      throw new Error('semantic_filter_value_invalid:contains');
    }
    const path = this.pathToModel(baseModel, model, joinGraph, dataModel);
    const condition = operator === 'eq' ? filter.value : { [operator]: filter.value };
    return this.nestedWhere(path, { [fieldName]: condition });
  }

  private storeCondition(
    baseModel: string,
    scope: BusinessMetricRuntimeQuery['storeScope'],
    storeId: number,
    dataModel: PrismaRuntimeDataModel,
  ): UnknownRecord {
    if (scope.mode !== 'current_store') throw new Error(`semantic_store_scope_invalid:${baseModel}`);
    const anchorModel = scope.anchorModel ?? scope.joinPath[0]?.fromModel ?? scope.model;
    if (anchorModel !== baseModel) throw new Error(`semantic_store_scope_anchor_mismatch:${anchorModel}:${baseModel}`);
    const expectedField = scope.model === 'Store' ? 'id' : 'storeId';
    if (scope.field !== expectedField) throw new Error(`semantic_store_scope_field_invalid:${scope.model}.${scope.field}`);
    const path = this.declaredPath(baseModel, scope.model, scope.joinPath, dataModel, 'semantic_store_scope_path');
    const field = this.field(dataModel, scope.model, scope.field);
    if (field.kind === 'object') throw new Error(`semantic_store_field_not_scalar:${scope.model}.${scope.field}`);
    return this.nestedWhere(path, { [scope.field]: storeId });
  }

  private timeCondition(
    baseModel: string,
    runtimeQuery: BusinessMetricRuntimeQuery,
    joinGraph: BusinessMetricRuntimeQuery['joinPath'],
    range: { startDate: Date; endExclusive: Date },
    dataModel: PrismaRuntimeDataModel,
  ): UnknownRecord {
    const fieldRef = this.requiredString(runtimeQuery.timePolicy.field, 'semantic_time_field_required');
    const separator = fieldRef.lastIndexOf('.');
    const model = separator >= 0 ? fieldRef.slice(0, separator) : baseModel;
    const fieldName = separator >= 0 ? fieldRef.slice(separator + 1) : fieldRef;
    const field = this.field(dataModel, model, fieldName);
    if (field.kind === 'object' || field.type !== 'DateTime') throw new Error(`semantic_time_field_invalid:${model}.${fieldName}`);
    const path = this.pathToModel(baseModel, model, joinGraph, dataModel);
    const value = runtimeQuery.timePolicy.mode === 'event_time'
      ? { gte: range.startDate, lt: range.endExclusive }
      : { lte: new Date(range.endExclusive.getTime() - 1) };
    return this.nestedWhere(path, { [fieldName]: value });
  }

  private validateJoinGraph(joinGraph: BusinessMetricRuntimeQuery['joinPath'], dataModel: PrismaRuntimeDataModel) {
    for (const step of joinGraph) {
      const relation = dataModel.models[step.fromModel]?.fields.find((item) => item.name === step.relationField);
      if (!relation || relation.kind !== 'object' || relation.type !== step.toModel) {
        throw new Error(`semantic_join_path_invalid:${step.fromModel}.${step.relationField}`);
      }
    }
  }

  private pathToModel(
    baseModel: string,
    targetModel: string,
    joinGraph: BusinessMetricRuntimeQuery['joinPath'],
    dataModel: PrismaRuntimeDataModel,
  ): RuntimePathStep[] {
    if (baseModel === targetModel) return [];
    const queue: Array<{ model: string; path: RuntimePathStep[] }> = [{ model: baseModel, path: [] }];
    const visited = new Set([baseModel]);
    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      for (const step of joinGraph.filter((candidate) => candidate.fromModel === current.model)) {
        const relation = this.field(dataModel, step.fromModel, step.relationField);
        const pathStep = {
          fromModel: step.fromModel,
          relationField: step.relationField,
          toModel: step.toModel,
          isList: relation.isList,
        };
        const path = [...current.path, pathStep];
        if (step.toModel === targetModel) return path;
        if (!visited.has(step.toModel)) {
          visited.add(step.toModel);
          queue.push({ model: step.toModel, path });
        }
      }
    }
    throw new Error(`semantic_join_path_missing:${baseModel}:${targetModel}`);
  }

  private declaredPath(
    baseModel: string,
    targetModel: string,
    declaredSteps: BusinessMetricRuntimeQuery['joinPath'],
    dataModel: PrismaRuntimeDataModel,
    errorPrefix: string,
  ): RuntimePathStep[] {
    if (baseModel === targetModel) {
      if (declaredSteps.length) throw new Error(`${errorPrefix}_unexpected:${baseModel}`);
      return [];
    }
    const path: RuntimePathStep[] = [];
    let currentModel = baseModel;
    for (const step of declaredSteps) {
      if (step.fromModel !== currentModel) throw new Error(`${errorPrefix}_disconnected:${currentModel}:${step.fromModel}`);
      const relation = this.field(dataModel, step.fromModel, step.relationField);
      if (relation.kind !== 'object' || relation.type !== step.toModel) {
        throw new Error(`${errorPrefix}_invalid:${step.fromModel}.${step.relationField}`);
      }
      path.push({ ...step, isList: relation.isList });
      currentModel = step.toModel;
    }
    if (currentModel !== targetModel) throw new Error(`${errorPrefix}_target_mismatch:${currentModel}:${targetModel}`);
    return path;
  }

  private field(dataModel: PrismaRuntimeDataModel, model: string, fieldName: string) {
    const definition = dataModel.models[model];
    if (!definition) throw new Error(`semantic_model_not_found:${model}`);
    const field = definition.fields.find((item) => item.name === fieldName);
    if (!field) throw new Error(`semantic_field_not_found:${model}.${fieldName}`);
    return field;
  }

  private prismaDelegate(model: string): { findMany(args: UnknownRecord): Promise<unknown[]> } {
    const delegateName = `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
    const delegate = (this.prisma as unknown as Record<string, unknown>)[delegateName] as
      | { findMany?: (args: UnknownRecord) => Promise<unknown[]> }
      | undefined;
    if (!delegate || typeof delegate.findMany !== 'function') throw new Error(`semantic_prisma_delegate_not_found:${model}`);
    return { findMany: delegate.findMany.bind(delegate) };
  }

  private async executeTransientReadRetry<T>(read: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= TRANSIENT_READ_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await read();
      } catch (error) {
        if (!this.isTransientReadError(error) || attempt === TRANSIENT_READ_MAX_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, TRANSIENT_READ_RETRY_DELAY_MS * attempt));
      }
    }
    throw new Error('semantic_read_retry_exhausted');
  }

  private isTransientReadError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as Record<string, unknown>;
    if (typeof record.code === 'string' && TRANSIENT_PRISMA_CODES.has(record.code)) return true;
    const message = error instanceof Error ? error.message : typeof record.message === 'string' ? record.message : '';
    return /transaction api error|connection (?:closed|terminated|timeout)|operation has timed out|too many database connections/i.test(
      message,
    );
  }

  private addSelect(select: UnknownRecord, path: RuntimePathStep[], field: string) {
    if (!path.length) {
      select[field] = true;
      return;
    }
    const [step, ...rest] = path;
    if (step.isList) throw new Error(`semantic_list_relation_select_unsupported:${step.fromModel}.${step.relationField}`);
    const current = (select[step.relationField] as { select?: UnknownRecord } | undefined) ?? {};
    const nested = current.select ?? {};
    current.select = nested;
    select[step.relationField] = current;
    this.addSelect(nested, rest, field);
  }

  private nestedWhere(path: RuntimePathStep[], leaf: UnknownRecord): UnknownRecord {
    return path.reduceRight<UnknownRecord>((value, step) => ({
      [step.relationField]: step.isList ? { some: value } : value,
    }), leaf);
  }

  private readValue(row: UnknownRecord, path: RuntimePathStep[], field: string): unknown {
    let current: unknown = row;
    for (const step of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        throw new Error(`semantic_dimension_value_invalid:${step.relationField}`);
      }
      current = (current as UnknownRecord)[step.relationField];
    }
    if (Array.isArray(current)) throw new Error(`semantic_dimension_value_not_scalar:${field}`);
    if (!current || typeof current !== 'object') return undefined;
    return (current as UnknownRecord)[field];
  }

  private aggregate(aggregation: BusinessMetricRuntimeAggregation, values: unknown[]): number {
    const present = values.filter((value) => value !== null && value !== undefined);
    if (aggregation === 'count') return present.length;
    if (aggregation === 'count_distinct') return new Set(present.map((value) => String(value))).size;
    const numbers = present.map((value) => this.toNumber(value));
    if (!numbers.length) return 0;
    if (aggregation === 'sum') return numbers.reduce((sum, value) => sum + value, 0);
    if (aggregation === 'avg') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    throw new Error(`semantic_aggregation_unsupported:${aggregation}`);
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
      return value.toNumber();
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error('semantic_numeric_value_invalid');
    return numeric;
  }

  private asRecord(value: unknown, errorMessage: string): UnknownRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(errorMessage);
    return value as UnknownRecord;
  }

  private requiredString(value: unknown, errorMessage: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(errorMessage);
    return value.trim();
  }
}
