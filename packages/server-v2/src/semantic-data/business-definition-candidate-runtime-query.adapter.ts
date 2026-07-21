import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BUSINESS_DEFINITION_SNAPSHOT_PROVIDER,
  type BusinessDefinitionSnapshotProvider,
  type BusinessMetricRuntimeQuery,
} from '../brain/cognition/business-definition-snapshot.types.js';
import { BusinessDefinitionRuntimeQueryEngineService } from '../semantic-query/business-definition-runtime-query-engine.service.js';
import type {
  BusinessDefinitionCanonicalQueryAdapter,
  BusinessDefinitionFixtureCase,
} from './business-definition-canonical-verifier.service.js';
import type { BusinessDefinitionVersionRecord } from './business-definition-projection-compiler.service.js';
import { AMI_CORE_BUSINESS_DIMENSION_CONTRACTS, AMI_CORE_BUSINESS_METRIC_CONTRACTS } from './ami-core-business-semantic-contracts.js';
import {
  evaluateBusinessMetricResolver,
  type BusinessMetricResolverRowSource,
} from './business-metric-resolver-contract.js';

const DIRECT_METRIC_KEYS = new Set(
  AMI_CORE_BUSINESS_METRIC_CONTRACTS.filter((contract) => !contract.payload.measure.resolver).map(
    (contract) => contract.metricKey,
  ),
);
const RESOLVER_METRIC_KEYS = new Set(
  AMI_CORE_BUSINESS_METRIC_CONTRACTS.filter((contract) => contract.payload.measure.resolver).map(
    (contract) => contract.metricKey,
  ),
);

@Injectable()
export class BusinessDefinitionCandidateRuntimeQueryAdapter implements BusinessDefinitionCanonicalQueryAdapter {
  private readonly engine: BusinessDefinitionRuntimeQueryEngineService;
  private resolverRowSource?: BusinessMetricResolverRowSource;

  constructor(
    prisma: PrismaService,
    @Inject(BUSINESS_DEFINITION_SNAPSHOT_PROVIDER)
    definitionProvider: BusinessDefinitionSnapshotProvider,
  ) {
    this.engine = new BusinessDefinitionRuntimeQueryEngineService(prisma, definitionProvider);
  }

  useResolverRowSource(source: BusinessMetricResolverRowSource): this {
    this.resolverRowSource = source;
    return this;
  }

  supports(canonicalQueryRef: string): boolean {
    const metricKey = parseMetricKey(canonicalQueryRef);
    return Boolean(
      metricKey &&
        (DIRECT_METRIC_KEYS.has(metricKey) || (RESOLVER_METRIC_KEYS.has(metricKey) && this.resolverRowSource)),
    );
  }

  async execute(input: {
    canonicalQueryRef: string;
    version: BusinessDefinitionVersionRecord;
    fixtureCase: BusinessDefinitionFixtureCase;
    timezone: string;
    storeScope: unknown;
  }): Promise<unknown> {
    const metricKey = parseMetricKey(input.canonicalQueryRef);
    if (!metricKey || (!DIRECT_METRIC_KEYS.has(metricKey) && !RESOLVER_METRIC_KEYS.has(metricKey))) {
      throw new BadRequestException('business_definition_candidate_runtime_metric_unsupported');
    }
    const payload = record(input.version.payload, 'business_definition_payload_invalid');
    if (payload.metricKey !== metricKey) throw new BadRequestException('business_definition_metric_binding_mismatch');
    const measure = record(payload.measure, 'business_definition_measure_invalid');
    const fixtureInput = record(input.fixtureCase.input, 'business_definition_fixture_input_invalid');
    const storeId = positiveInteger(fixtureInput.storeId, 'business_definition_fixture_store_invalid');
    if (input.timezone !== 'Asia/Shanghai') {
      throw new BadRequestException('business_definition_query_timezone_unsupported');
    }
    assertCurrentStoreScope(input.storeScope);
    const timeRange = customTimeRange(fixtureInput.timeRange);
    const dimensions = stringArray(payload.dimensions, 'business_definition_dimensions_invalid').map((key) => {
      const contract = AMI_CORE_BUSINESS_DIMENSION_CONTRACTS.find((item) => item.dimensionKey === key);
      if (!contract) throw new BadRequestException(`business_definition_dimension_contract_missing:${key}`);
      return { key, name: contract.name, model: contract.source.model, field: contract.source.field };
    });
    const joinPath = joinSteps(payload.joinPath);
    const scope = record(payload.storeScope, 'business_definition_metric_store_scope_invalid');
    const scopePath = joinSteps(scope.joinPath);
    const terminalModel = scopePath.at(-1)?.toModel ?? requiredString(scope.model, 'metric_store_scope_model_invalid');
    const runtimeQuery: BusinessMetricRuntimeQuery = {
      aggregation: requiredString(measure.aggregation, 'metric_aggregation_invalid') as BusinessMetricRuntimeQuery['aggregation'],
      joinPath,
      dimensions: dimensions.map((dimension) => dimension.key),
      filters: recordArray(payload.filters, 'business_definition_filters_invalid'),
      capabilityKeys: stringArray(record(payload.bindings, 'business_definition_bindings_invalid').capability, 'metric_capability_bindings_invalid').map(stripBindingPrefix),
      executorKeys: stringArray(record(payload.bindings, 'business_definition_bindings_invalid').executor, 'metric_executor_bindings_invalid'),
      outputFields: stringArray(record(payload.bindings, 'business_definition_bindings_invalid').outputField, 'metric_output_bindings_invalid'),
      sort: optionalSort(record(payload.bindings, 'business_definition_bindings_invalid').sort),
      timePolicy: timePolicy(payload.timePolicy),
      storeScope: {
        mode: 'current_store',
        anchorModel: requiredString(scope.model, 'metric_store_scope_model_invalid'),
        model: terminalModel,
        field: requiredString(scope.field, 'metric_store_scope_field_invalid'),
        joinPath: scopePath,
      },
      ...(measure.resolver === undefined ? {} : { resolver: metricResolver(measure.resolver) }),
    };
    if (runtimeQuery.resolver) {
      if (!this.resolverRowSource) {
        throw new BadRequestException('business_definition_candidate_runtime_resolver_unavailable');
      }
      const sourceModels = stringArray(payload.sourceModels, 'business_definition_source_models_invalid');
      const rows = await this.resolverRowSource.loadRows({
        resolverKey: runtimeQuery.resolver.key,
        storeId,
        startDate: timeRange.startDate,
        endExclusive: timeRange.endExclusive,
      });
      const result = evaluateBusinessMetricResolver({
        metricKey,
        resolver: runtimeQuery.resolver,
        dimensions: runtimeQuery.dimensions,
        outputField: runtimeQuery.outputFields[0],
        sourceModels,
        storeScope: runtimeQuery.storeScope,
        rows,
      });
      return formatMetricResult(metricKey, result);
    }
    const result = await this.engine.executeMetric({
      metric: {
        metricKey,
        formula: {
          type: runtimeQuery.aggregation,
          model: requiredString(measure.model, 'metric_measure_model_invalid'),
          field: requiredString(measure.field, 'metric_measure_field_invalid'),
        },
        runtimeQuery,
      },
      dimensions,
      storeId,
      timeRange,
    });
    return formatMetricResult(metricKey, result, result.scannedRows);
  }
}

function metricResolver(value: unknown): NonNullable<BusinessMetricRuntimeQuery['resolver']> {
  const resolver = record(value, 'business_definition_resolver_invalid');
  const dimensionFields = record(resolver.dimensionFields, 'business_definition_resolver_dimension_fields_invalid');
  return {
    kind: requiredString(resolver.kind, 'business_definition_resolver_kind_invalid') as 'domain_service',
    key: requiredString(resolver.key, 'business_definition_resolver_key_invalid') as NonNullable<
      BusinessMetricRuntimeQuery['resolver']
    >['key'],
    dimensionFields: Object.fromEntries(
      Object.entries(dimensionFields).map(([key, field]) => [
        key,
        requiredString(field, `business_definition_resolver_dimension_field_invalid:${key}`),
      ]),
    ),
    expression: resolver.expression as NonNullable<BusinessMetricRuntimeQuery['resolver']>['expression'],
    overallAggregation: requiredString(
      resolver.overallAggregation,
      'business_definition_resolver_aggregation_invalid',
    ) as NonNullable<BusinessMetricRuntimeQuery['resolver']>['overallAggregation'],
  };
}

function formatMetricResult(
  metricKey: string,
  result: { outputField: string; groups: Array<{ dimensions: Record<string, unknown>; value: number }>; overallValue: number },
  scannedRows = result.groups.length,
) {
  const rows = result.groups.map((group) => ({
    ...group.dimensions,
    [result.outputField]: result.groups.length ? group.value : result.overallValue,
  }));
  return {
    status: scannedRows ? 'success' : 'no_data',
    rows,
    kpis: [{ label: metricKey, value: String(result.overallValue) }],
  };
}

function parseMetricKey(value: string): string | undefined {
  return /^semantic_query\.([a-z][a-z0-9_]*)$/.exec(value)?.[1];
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(message);
  return value as Record<string, unknown>;
}

function recordArray(value: unknown, message: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new BadRequestException(message);
  return value.map((item) => record(item, message));
}

function stringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new BadRequestException(message);
  }
  return value as string[];
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(message);
  return value.trim();
}

function positiveInteger(value: unknown, message: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new BadRequestException(message);
  return parsed;
}

function joinSteps(value: unknown): BusinessMetricRuntimeQuery['joinPath'] {
  return recordArray(value, 'business_definition_join_path_invalid').map((step) => ({
    fromModel: requiredString(step.fromModel, 'business_definition_join_from_invalid'),
    relationField: requiredString(step.relationField, 'business_definition_join_relation_invalid'),
    toModel: requiredString(step.toModel, 'business_definition_join_to_invalid'),
  }));
}

function timePolicy(value: unknown): BusinessMetricRuntimeQuery['timePolicy'] {
  const policy = record(value, 'business_definition_time_policy_invalid');
  return {
    mode: requiredString(policy.mode, 'business_definition_time_mode_invalid') as 'event_time' | 'as_of_snapshot',
    field: requiredString(policy.field, 'business_definition_time_field_invalid'),
    boundary: requiredString(policy.boundary, 'business_definition_time_boundary_invalid') as '[start,end)' | 'as_of',
    timezone: requiredString(policy.timezone, 'business_definition_time_timezone_invalid') as 'Asia/Shanghai' | 'UTC',
  };
}

function optionalSort(value: unknown): BusinessMetricRuntimeQuery['sort'] {
  if (value === undefined) return undefined;
  const sort = record(value, 'business_definition_sort_invalid');
  return {
    outputField: requiredString(sort.outputField, 'business_definition_sort_output_invalid'),
    direction: requiredString(sort.direction, 'business_definition_sort_direction_invalid') as 'asc' | 'desc',
    missing: requiredString(sort.missing, 'business_definition_sort_missing_invalid') as 'error',
  };
}

function stripBindingPrefix(value: string): string {
  return value.startsWith('capability:') ? value.slice('capability:'.length) : value;
}

function customTimeRange(value: unknown) {
  const range = record(value, 'business_definition_fixture_time_range_invalid');
  if (range.preset !== 'custom') throw new BadRequestException('business_definition_fixture_custom_range_required');
  const startDate = isoDate(range.startDate);
  const endExclusive = isoDate(range.endDate);
  if (startDate >= endExclusive) throw new BadRequestException('business_definition_fixture_time_range_order_invalid');
  return {
    startDate,
    endExclusive,
    rangeLabel: requiredString(range.label, 'business_definition_fixture_time_range_label_invalid'),
  };
}

function isoDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('business_definition_fixture_time_range_invalid');
  }
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(parsed.getTime())) throw new BadRequestException('business_definition_fixture_time_range_invalid');
  return parsed;
}

function assertCurrentStoreScope(value: unknown) {
  if (record(value, 'business_definition_store_scope_invalid').mode !== 'current_store') {
    throw new BadRequestException('business_definition_store_scope_invalid');
  }
}
