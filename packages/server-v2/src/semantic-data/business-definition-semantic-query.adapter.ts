import { BadRequestException, Injectable } from '@nestjs/common';
import type { AgentRole } from '../agent/agent.types.js';
import type {
  BusinessTask,
  BusinessTaskDomain,
  BusinessTimeRange,
} from '../agent/business-task/business-task.types.js';
import { QueryPlannerService } from '../semantic-query/query-planner.service.js';
import type { SemanticQueryResult } from '../semantic-query/query-plan.types.js';
import { SemanticQueryExecutorService } from '../semantic-query/semantic-query-executor.service.js';
import { QueryTemplateRegistryService } from '../semantic-query/query-template-registry.service.js';
import type {
  BusinessDefinitionCanonicalQueryAdapter,
  BusinessDefinitionFixtureCase,
} from './business-definition-canonical-verifier.service.js';
import type { BusinessDefinitionVersionRecord } from './business-definition-projection-compiler.service.js';

const AGENT_ROLES = new Set<AgentRole>(['manager', 'reception', 'beautician']);
const SUPPORTED_FIXED_TIME_RANGES = {
  today: '今天',
  yesterday: '昨天',
  this_month: '本月',
  last_7_days: '近7天',
} as const;

@Injectable()
export class BusinessDefinitionSemanticQueryAdapter implements BusinessDefinitionCanonicalQueryAdapter {
  constructor(
    private readonly planner: QueryPlannerService,
    private readonly executor: SemanticQueryExecutorService,
    private readonly templateRegistry: QueryTemplateRegistryService,
  ) {}

  supports(canonicalQueryRef: string): boolean {
    const metricKey = parseMetricKey(canonicalQueryRef);
    return Boolean(metricKey && this.templateRegistry.findByMetric(metricKey));
  }

  async execute(input: {
    canonicalQueryRef: string;
    version: BusinessDefinitionVersionRecord;
    fixtureCase: BusinessDefinitionFixtureCase;
    timezone: string;
    storeScope: unknown;
  }): Promise<unknown> {
    const metricKey = parseMetricKey(input.canonicalQueryRef);
    if (!metricKey) throw new BadRequestException('business_definition_canonical_query_ref_invalid');
    const template = this.templateRegistry.findByMetric(metricKey);
    if (!template) throw new BadRequestException('business_definition_canonical_query_template_missing');

    const payload = asRecord(input.version.payload, 'business_definition_payload_invalid');
    if (payload.metricKey !== metricKey) {
      throw new BadRequestException('business_definition_metric_binding_mismatch');
    }
    const fixtureInput = asRecord(input.fixtureCase.input, 'business_definition_fixture_input_invalid');
    const storeId = positiveInteger(fixtureInput.storeId, 'business_definition_fixture_store_invalid');
    if (input.timezone !== 'Asia/Shanghai') {
      throw new BadRequestException('business_definition_query_timezone_unsupported');
    }
    assertStoreScopeAllows(input.storeScope, storeId);
    const role = resolveRole(fixtureInput.role);
    const timeRange = resolveTimeRange(fixtureInput.timeRange);
    const task = buildTask(input.version, payload, fixtureInput, metricKey, timeRange, role);
    const capabilityId = optionalString(payload.capabilityId) ?? template.capabilityIds?.[0];
    const userId = optionalPositiveInteger(fixtureInput.operatorId);
    if (!userId) throw new BadRequestException('business_definition_fixture_operator_required');
    const planned = this.planner.plan({
      task,
      actor: {
        principalType: 'user',
        userId,
        storeId,
        role,
        permissions: [...new Set([...metricPermissions(payload), ...bootstrapCatalogPermissions(metricKey)])],
      },
      capabilityId,
    });
    if (!planned.plan) {
      throw new BadRequestException(`business_definition_query_plan_rejected:${planned.rejectedReason ?? 'unknown'}`);
    }
    if (planned.plan.templateId !== template.id || !planned.plan.metrics.some((metric) => metric.key === metricKey)) {
      throw new BadRequestException('business_definition_query_plan_binding_mismatch');
    }
    const result = await this.executor.execute(planned.plan);
    if (result.status !== 'success' && result.status !== 'no_data') {
      throw new BadRequestException(`business_definition_query_execution_${result.status}`);
    }
    return normalizeSemanticQueryResult(result);
  }
}

function bootstrapCatalogPermissions(metricKey: string): string[] {
  if (metricKey === 'paid_amount') return ['core:finance:view'];
  if (metricKey === 'staff_performance_score') return ['core:beautician-performance:view'];
  if (metricKey === 'stock_risk_score') return ['core:inventory:stock'];
  return ['core:business:view'];
}

function metricPermissions(payload: Record<string, unknown>): string[] {
  const policies = Array.isArray(payload.permissionPolicies) ? payload.permissionPolicies : [];
  const permissions = policies.flatMap((value) => {
    if (!isRecord(value) || !Array.isArray(value.allOf)) return [];
    return value.allOf.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  });
  if (!permissions.length) throw new BadRequestException('business_definition_metric_permissions_required');
  return [...new Set(permissions)];
}

function buildTask(
  version: BusinessDefinitionVersionRecord,
  payload: Record<string, unknown>,
  fixtureInput: Record<string, unknown>,
  metricKey: string,
  timeRange: BusinessTimeRange,
  role: AgentRole,
): BusinessTask {
  const taskType = payload.taskType === 'ranking' ? 'ranking' : 'query';
  const outputMode =
    payload.outputMode === 'ranked_list' ? 'ranked_list' : payload.outputMode === 'table' ? 'table' : 'summary';
  return {
    taskType,
    domain: version.definition.domain as BusinessTaskDomain,
    objective: `canonical fixture ${String(fixtureInput.caseKey ?? metricKey)}`,
    entities: [],
    metrics: [metricKey],
    filters: isRecord(fixtureInput.filters) ? fixtureInput.filters : {},
    timeRange,
    sort: Array.isArray(fixtureInput.sort) ? (fixtureInput.sort as BusinessTask['sort']) : undefined,
    limit: optionalPositiveInteger(fixtureInput.limit),
    outputMode,
    outputIntent: outputMode === 'table' || outputMode === 'ranked_list' ? 'show_table' : 'show_kpi',
    riskLevel: 'low',
    requiresApproval: false,
    missingSlots: [],
    confidence: 1,
    actorRole: role,
  };
}

function normalizeSemanticQueryResult(result: SemanticQueryResult) {
  return stripUndefined({
    status: result.status,
    rows: result.rows,
    kpis: result.kpis ?? [],
  });
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [key, stripUndefined(nested)]),
    );
  }
  return value;
}

function parseMetricKey(canonicalQueryRef: string): string | undefined {
  const match = /^semantic_query\.([a-z][a-z0-9_]*)$/.exec(canonicalQueryRef);
  return match?.[1];
}

function resolveRole(value: unknown): AgentRole {
  return typeof value === 'string' && AGENT_ROLES.has(value as AgentRole) ? (value as AgentRole) : 'manager';
}

function resolveTimeRange(value: unknown): BusinessTimeRange {
  const range = asRecord(value, 'business_definition_fixture_time_range_invalid');
  if (typeof range.preset !== 'string' || typeof range.label !== 'string' || !range.label.trim()) {
    throw new BadRequestException('business_definition_fixture_time_range_invalid');
  }
  if (range.preset === 'custom') {
    const startDate = strictIsoDate(range.startDate);
    const endDate = strictIsoDate(range.endDate);
    if (startDate.epoch >= endDate.epoch) {
      throw new BadRequestException('business_definition_fixture_time_range_order_invalid');
    }
    return {
      preset: 'custom',
      startDate: startDate.value,
      endDate: endDate.value,
      label: range.label.trim(),
    };
  }
  if (!Object.hasOwn(SUPPORTED_FIXED_TIME_RANGES, range.preset)) {
    throw new BadRequestException('business_definition_fixture_time_range_preset_unsupported');
  }
  const preset = range.preset as keyof typeof SUPPORTED_FIXED_TIME_RANGES;
  if (range.label !== SUPPORTED_FIXED_TIME_RANGES[preset]) {
    throw new BadRequestException('business_definition_fixture_time_range_label_mismatch');
  }
  if (range.startDate !== undefined || range.endDate !== undefined) {
    throw new BadRequestException('business_definition_fixture_time_range_invalid');
  }
  return { preset, label: SUPPORTED_FIXED_TIME_RANGES[preset] };
}

function strictIsoDate(value: unknown): { value: string; epoch: number } {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('business_definition_fixture_time_range_invalid');
  }
  const [year, month, day] = value.split('-').map(Number);
  const epoch = Date.UTC(year, month - 1, day);
  const parsed = new Date(epoch);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new BadRequestException('business_definition_fixture_time_range_invalid');
  }
  return { value, epoch };
}

function asRecord(value: unknown, errorCode: string): Record<string, unknown> {
  if (!isRecord(value)) throw new BadRequestException(errorCode);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function positiveInteger(value: unknown, errorCode: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new BadRequestException(errorCode);
  return parsed;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  return positiveInteger(value, 'business_definition_fixture_integer_invalid');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function assertStoreScopeAllows(value: unknown, storeId: number) {
  const scope = asRecord(value, 'business_definition_store_scope_invalid');
  if (scope.mode === 'current_store' || scope.mode === 'global') return;
  if (
    scope.mode === 'explicit_store_ids' &&
    Array.isArray(scope.storeIds) &&
    scope.storeIds.some((candidate) => Number(candidate) === storeId)
  ) {
    return;
  }
  throw new BadRequestException('business_definition_fixture_store_out_of_scope');
}
