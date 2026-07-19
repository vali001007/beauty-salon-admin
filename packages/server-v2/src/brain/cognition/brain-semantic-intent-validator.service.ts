import { Injectable } from '@nestjs/common';
import { BrainOntologyRuntimeService } from './brain-ontology-runtime.service.js';
import type { BrainDefinitionRef, BrainSemanticAmbiguity, BrainSemanticIntent } from './brain-semantic-intent.types.js';
import type {
  BusinessDefinitionBase,
  ProductionReadyBusinessDefinitionSnapshot,
} from './business-definition-snapshot.types.js';

export type BrainSemanticIntentValidationIssueCode =
  | 'SNAPSHOT_UNAVAILABLE'
  | 'UNTRUSTED_SECURITY_SCOPE'
  | 'UNKNOWN_DOMAIN'
  | 'UNKNOWN_ENTITY_REFERENCE'
  | 'UNKNOWN_METRIC_REFERENCE'
  | 'UNKNOWN_DIMENSION_REFERENCE'
  | 'UNKNOWN_ORDER_REFERENCE'
  | 'UNKNOWN_FIELD_REFERENCE'
  | 'INVALID_COMPARISON_TARGET'
  | 'MISSING_REQUIRED_SLOT'
  | 'SEMANTIC_AMBIGUITY'
  | 'ENTITY_CONFLICT';

export interface BrainSemanticIntentValidationIssue {
  code: BrainSemanticIntentValidationIssueCode;
  message: string;
  slot?: string;
  candidates?: string[];
}

export interface BrainSemanticIntentGovernedScope {
  domains: readonly string[];
  definitionRefs: readonly {
    definitionKey: string;
    version: number;
    definitionFingerprint: string;
    sourceFingerprint: string;
  }[];
  rankingContracts?: readonly { capabilityKey: string; domains: readonly string[] }[];
}

export type BrainSemanticIntentValidationResult =
  | {
      status: 'valid';
      intent: BrainSemanticIntent;
      snapshotFingerprint: string;
    }
  | {
      status: 'clarification_required';
      intent: BrainSemanticIntent;
      snapshotFingerprint: string;
      issues: BrainSemanticIntentValidationIssue[];
      clarification: {
        questions: [string];
        missingSlots: string[];
        ambiguities: BrainSemanticAmbiguity[];
      };
    }
  | {
      status: 'invalid';
      intent: BrainSemanticIntent;
      snapshotFingerprint?: string;
      issues: BrainSemanticIntentValidationIssue[];
    };

@Injectable()
export class BrainSemanticIntentValidatorService {
  constructor(private readonly ontologyRuntime: BrainOntologyRuntimeService) {}

  validate(
    intent: BrainSemanticIntent,
    governedScope?: BrainSemanticIntentGovernedScope,
  ): BrainSemanticIntentValidationResult {
    const snapshot = this.ontologyRuntime.getSnapshot();
    if (!snapshot) {
      return this.invalid(intent, [
        {
          code: 'SNAPSHOT_UNAVAILABLE',
          message: 'A production-ready business definition snapshot is not loaded.',
        },
      ]);
    }

    const hardIssues = dedupeIssues([
      ...this.validateSecurityBoundary(intent),
      ...this.validateComparisonTargetStructure(intent),
      ...this.validateDefinitions(intent, snapshot, governedScope),
    ]);
    if (hardIssues.length > 0) {
      return this.invalid(intent, hardIssues, snapshot.fingerprint);
    }

    const missingSlots = new Set(intent.missingSlots.map((slot) => slot.trim()).filter(Boolean));
    if (isGroupedDimensionComparison(intent)) {
      missingSlots.delete('comparisonTarget');
      missingSlots.delete('comparisonEntities');
    }
    const actionableAmbiguities = intent.ambiguities.filter(
      (ambiguity) =>
        missingSlots.has(ambiguity.slot) ||
        ambiguity.candidates.length === 0 ||
        ambiguity.candidates.some(isUserFacingCandidate),
    );
    const clarificationIssues: BrainSemanticIntentValidationIssue[] = actionableAmbiguities.map((ambiguity) => ({
      code: 'SEMANTIC_AMBIGUITY',
      slot: ambiguity.slot,
      message: ambiguity.reason,
      candidates: [...ambiguity.candidates],
    }));

    this.collectIntentShapeGaps(intent, missingSlots, hasGovernedImplicitRankingContract(intent, governedScope));
    clarificationIssues.push(...this.findEntityConflicts(intent));
    const stableClarificationIssues = dedupeIssues(clarificationIssues);
    const ambiguitySlots = new Set(actionableAmbiguities.map((ambiguity) => ambiguity.slot));
    const requiredMissingSlots = [...missingSlots].filter((slot) => !ambiguitySlots.has(slot)).sort();
    const canonicalMissingSlots = new Set(missingSlots);
    for (const ambiguity of actionableAmbiguities) canonicalMissingSlots.add(ambiguity.slot);
    const orderedMissingSlots = [...canonicalMissingSlots].sort();
    if (orderedMissingSlots.length > 0 || clarificationIssues.length > 0) {
      const clarifiedIntent: BrainSemanticIntent = {
        ...intent,
        missingSlots: orderedMissingSlots,
        ambiguities: actionableAmbiguities.map((ambiguity) => ({
          ...ambiguity,
          candidates: [...ambiguity.candidates],
        })),
      };
      return {
        status: 'clarification_required',
        intent: clarifiedIntent,
        snapshotFingerprint: snapshot.fingerprint,
        issues: [
          ...requiredMissingSlots.map((slot) => ({
            code: 'MISSING_REQUIRED_SLOT' as const,
            slot,
            message: `Required semantic slot ${slot} is missing.`,
          })),
          ...stableClarificationIssues,
        ],
        clarification: {
          questions: [
            buildMergedClarificationQuestion(orderedMissingSlots, actionableAmbiguities, stableClarificationIssues),
          ],
          missingSlots: orderedMissingSlots,
          ambiguities: actionableAmbiguities.map((ambiguity) => ({
            ...ambiguity,
            candidates: [...ambiguity.candidates],
          })),
        },
      };
    }

    return { status: 'valid', intent, snapshotFingerprint: snapshot.fingerprint };
  }

  private validateSecurityBoundary(intent: BrainSemanticIntent): BrainSemanticIntentValidationIssue[] {
    const forbidden = findForbiddenSecurityKeys(intent);
    if (forbidden.length === 0) return [];
    return [
      {
        code: 'UNTRUSTED_SECURITY_SCOPE',
        message: `Semantic intent must not contain security scope conclusions: ${forbidden.join(', ')}.`,
      },
    ];
  }

  private validateDefinitions(
    intent: BrainSemanticIntent,
    snapshot: ProductionReadyBusinessDefinitionSnapshot,
    governedScope?: BrainSemanticIntentGovernedScope,
  ): BrainSemanticIntentValidationIssue[] {
    const issues: BrainSemanticIntentValidationIssue[] = [];
    const domains = new Set([
      ...snapshot.entities.map((definition) => definition.domain),
      ...snapshot.metrics.map((definition) => definition.domain),
      ...snapshot.dimensions.map((definition) => definition.domain),
      ...(governedScope?.domains ?? []),
    ]);
    for (const domain of intent.domains) {
      if (!domains.has(domain)) {
        issues.push({ code: 'UNKNOWN_DOMAIN', slot: 'domain', message: `Domain ${domain} is not active.` });
      }
    }

    for (const entity of intent.entities) {
      if (!entity.definitionRef) continue;
      if (
        !hasCanonicalRef(snapshot.entities, entity.definitionRef, 'entity') &&
        !hasGovernedRef(governedScope, entity.definitionRef)
      ) {
        issues.push({
          code: 'UNKNOWN_ENTITY_REFERENCE',
          slot: 'entity',
          message: `Entity reference for ${entity.mention} is not active.`,
        });
      }
    }
    for (const metric of intent.metrics) {
      if (!hasCanonicalRef(snapshot.metrics, metric, 'metric') && !hasGovernedRef(governedScope, metric)) {
        issues.push({
          code: 'UNKNOWN_METRIC_REFERENCE',
          slot: 'metric',
          message: `Metric reference ${metric.definitionKey} is not active.`,
        });
      }
    }
    for (const dimension of intent.dimensions) {
      if (!hasCanonicalRef(snapshot.dimensions, dimension, 'dimension') && !hasGovernedRef(governedScope, dimension)) {
        issues.push({
          code: 'UNKNOWN_DIMENSION_REFERENCE',
          slot: 'dimension',
          message: `Dimension reference ${dimension.definitionKey} is not active.`,
        });
      }
    }
    for (const filter of intent.filters) {
      issues.push({
        code: 'UNKNOWN_FIELD_REFERENCE',
        slot: 'filter',
        message: `Field reference ${filter.fieldRef.definitionKey} cannot be verified by the active snapshot.`,
      });
    }
    for (const order of intent.orderBy) {
      if (order.definitionRef.definitionType === 'field') {
        issues.push({
          code: 'UNKNOWN_FIELD_REFERENCE',
          slot: 'orderBy',
          message: `Field reference ${order.definitionRef.definitionKey} cannot be verified by the active snapshot.`,
        });
        continue;
      }
      const definitions = order.definitionRef.definitionType === 'metric' ? snapshot.metrics : snapshot.dimensions;
      if (
        !hasCanonicalRef(definitions, order.definitionRef, order.definitionRef.definitionType) &&
        !hasGovernedRef(governedScope, order.definitionRef)
      ) {
        issues.push({
          code: 'UNKNOWN_ORDER_REFERENCE',
          slot: 'orderBy',
          message: `Order reference ${order.definitionRef.definitionKey} is not active.`,
        });
      }
    }
    return issues;
  }

  private validateComparisonTargetStructure(intent: BrainSemanticIntent): BrainSemanticIntentValidationIssue[] {
    if (intent.intent !== 'comparison' || !intent.comparisonTarget) return [];
    const target = intent.comparisonTarget as unknown as Record<string, unknown>;
    if (target.type === 'time') {
      const timeRange = target.timeRange;
      if (
        !isExecutableTimeRange(timeRange) ||
        (intent.timeRange !== undefined && !isExecutableTimeRange(intent.timeRange))
      ) {
        return [
          {
            code: 'INVALID_COMPARISON_TARGET',
            slot: 'comparisonTarget',
            message: 'Time comparison target must contain a governed timeRange.',
          },
        ];
      }
      return [];
    }
    if (target.type === 'entity') {
      const entityKeys = target.entityKeys;
      if (
        !Array.isArray(entityKeys) ||
        entityKeys.length < 2 ||
        entityKeys.some((key) => typeof key !== 'string' || !key.trim()) ||
        new Set(entityKeys).size !== entityKeys.length
      ) {
        return [
          {
            code: 'INVALID_COMPARISON_TARGET',
            slot: 'comparisonTarget',
            message: 'Entity comparison target must contain at least two unique resolved entity keys.',
          },
        ];
      }
      return [];
    }
    return [
      {
        code: 'INVALID_COMPARISON_TARGET',
        slot: 'comparisonTarget',
        message: 'Comparison target type is invalid.',
      },
    ];
  }

  private collectIntentShapeGaps(
    intent: BrainSemanticIntent,
    missingSlots: Set<string>,
    hasImplicitRankingContract = false,
  ): void {
    if (intent.entities.some((entity) => !entity.definitionRef)) missingSlots.add('entity');

    if (intent.intent === 'ranking' && !hasImplicitRankingContract) {
      if (intent.metrics.length === 0) missingSlots.add('metric');
      if (intent.dimensions.length === 0) missingSlots.add('dimension');
      if (intent.orderBy.length === 0) missingSlots.add('orderBy');
    }

    if (intent.intent === 'comparison') {
      if (!intent.comparisonTarget) {
        if (!isGroupedDimensionComparison(intent)) missingSlots.add('comparisonTarget');
      } else if (intent.comparisonTarget.type === 'time') {
        if (!intent.timeRange) missingSlots.add('timeRange');
      } else {
        const resolvedKeys = new Set(intent.entities.map((entity) => entity.entityKey).filter(Boolean));
        if (intent.comparisonTarget.entityKeys.some((key) => !resolvedKeys.has(key))) {
          missingSlots.add('comparisonEntities');
        }
      }
    }

    if (intent.intent === 'action') {
      if (!intent.entities.some(isSpecificActionTarget)) missingSlots.add('actionTarget');
      if (intent.successCriteria.length === 0) missingSlots.add('successCriteria');
    }
  }

  private findEntityConflicts(intent: BrainSemanticIntent): BrainSemanticIntentValidationIssue[] {
    const refsByMention = new Map<string, Set<string>>();
    for (const entity of intent.entities) {
      if (!entity.definitionRef) continue;
      const mention = normalizeMention(entity.mention);
      const refs = refsByMention.get(mention) ?? new Set<string>();
      refs.add(`${canonicalRefKey(entity.definitionRef)}:${entity.entityKey ?? '<unresolved>'}`);
      refsByMention.set(mention, refs);
    }
    return [...refsByMention.entries()]
      .filter(([, refs]) => refs.size > 1)
      .map(([mention]) => ({
        code: 'ENTITY_CONFLICT' as const,
        slot: 'entity',
        message: `“${mention}”匹配到多个业务对象，请补充更具体的信息。`,
      }));
  }

  private invalid(
    intent: BrainSemanticIntent,
    issues: BrainSemanticIntentValidationIssue[],
    snapshotFingerprint?: string,
  ): BrainSemanticIntentValidationResult {
    return { status: 'invalid', intent, ...(snapshotFingerprint ? { snapshotFingerprint } : {}), issues };
  }
}

function hasGovernedImplicitRankingContract(
  intent: BrainSemanticIntent,
  governedScope?: BrainSemanticIntentGovernedScope,
) {
  if (intent.intent !== 'ranking' || !governedScope?.rankingContracts?.length || !intent.domains.length) return false;
  return governedScope.rankingContracts.some((contract) =>
    intent.domains.every((domain) => contract.domains.includes(domain)),
  );
}

function isSpecificActionTarget(entity: BrainSemanticIntent['entities'][number]): boolean {
  if (!entity.definitionRef) return false;
  if (entity.entityKey && entity.entityKey !== entity.entityType) return true;
  const mention = normalizeMention(entity.mention);
  if (!mention) return false;
  return !GENERIC_ACTION_TARGET_MENTIONS.has(mention) && !/^(这个|该|那个)?(客户|顾客|会员|员工|美容师|商品|产品|项目|预约)$/.test(mention);
}

const GENERIC_ACTION_TARGET_MENTIONS = new Set(['她', '他', 'ta', '对方', '目标客户', '目标对象']);

function isGroupedDimensionComparison(intent: BrainSemanticIntent): boolean {
  return (
    intent.intent === 'comparison' &&
    !intent.comparisonTarget &&
    intent.metrics.length > 0 &&
    intent.dimensions.length > 0
  );
}

function hasCanonicalRef(
  definitions: BusinessDefinitionBase[],
  ref: BrainDefinitionRef,
  expectedType: BrainDefinitionRef['definitionType'],
): boolean {
  if (ref.definitionType !== expectedType) return false;
  return definitions.some(
    (definition) =>
      definition.definitionKey === ref.definitionKey &&
      definition.version === ref.definitionVersion &&
      definition.definitionFingerprint === ref.definitionFingerprint &&
      definition.sourceFingerprint === ref.sourceFingerprint,
  );
}

function hasGovernedRef(scope: BrainSemanticIntentGovernedScope | undefined, ref: BrainDefinitionRef): boolean {
  return scope?.definitionRefs.some(
    (candidate) =>
      candidate.definitionKey === ref.definitionKey &&
      candidate.version === ref.definitionVersion &&
      candidate.definitionFingerprint === ref.definitionFingerprint &&
      candidate.sourceFingerprint === ref.sourceFingerprint,
  ) ?? false;
}

const FORBIDDEN_SECURITY_KEYS = new Set([
  'userid',
  'user_id',
  'storeid',
  'store_id',
  'permission',
  'permissions',
  'permissioncodes',
  'requiredpermissions',
  'required_permissions',
  'datascope',
  'data_scope',
  'storeids',
  'visiblestoreids',
  'store_ids',
  'storescope',
  'store_scope',
  'tenantid',
  'tenant_id',
  'deniedpermissions',
  'role',
  'rolehint',
  'role_hint',
  'user',
  'store',
]);

function findForbiddenSecurityKeys(
  value: unknown,
  path = '',
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): string[] {
  if (depth > 12) return [path ? `${path}.__depth_limit__` : '__depth_limit__'];
  if (Array.isArray(value)) {
    if (seen.has(value)) return [path ? `${path}.__cycle__` : '__cycle__'];
    seen.add(value);
    try {
      return value.flatMap((item, index) => findForbiddenSecurityKeys(item, `${path}[${index}]`, seen, depth + 1));
    } finally {
      seen.delete(value);
    }
  }
  if (!value || typeof value !== 'object') return [];
  if (seen.has(value)) return [path ? `${path}.__cycle__` : '__cycle__'];
  seen.add(value);
  try {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      const currentPath = path ? `${path}.${key}` : key;
      return [
        ...(FORBIDDEN_SECURITY_KEYS.has(key.toLowerCase()) ? [currentPath] : []),
        ...findForbiddenSecurityKeys(nested, currentPath, seen, depth + 1),
      ];
    });
  } finally {
    seen.delete(value);
  }
}

function canonicalRefKey(ref: BrainDefinitionRef): string {
  return `${ref.definitionType}:${ref.definitionKey}@${ref.definitionVersion}#${ref.definitionFingerprint}:${ref.sourceFingerprint}`;
}

function normalizeMention(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, '');
}

const SLOT_LABELS: Record<string, string> = {
  actionTarget: '操作对象',
  comparisonEntities: '对比对象',
  comparisonTarget: '对比周期或对象',
  dimension: '分组维度',
  entity: '业务对象',
  metric: '指标口径',
  objective: '目标或要处理的问题',
  orderBy: '排序依据',
  successCriteria: '完成标准',
  timeRange: '时间范围',
};

function buildMergedClarificationQuestion(
  missingSlots: string[],
  ambiguities: BrainSemanticAmbiguity[],
  issues: BrainSemanticIntentValidationIssue[],
): string {
  const parts = missingSlots.map((slot) => `请补充${SLOT_LABELS[slot] ?? '必要信息'}`);
  for (const ambiguity of ambiguities) {
    const visibleCandidates = ambiguity.candidates.filter(isUserFacingCandidate);
    const candidates = visibleCandidates.length > 0 ? `（${visibleCandidates.join('、')}）` : '';
    parts.push(`${ambiguity.reason}${candidates}`);
  }
  for (const issue of issues) {
    if (issue.code !== 'ENTITY_CONFLICT') continue;
    parts.push(`${issue.message}${issue.candidates?.length ? `（${issue.candidates.join('、')}）` : ''}`);
  }
  const normalizedParts = parts.map((part) => part.trim().replace(/[，。；：！？,.!?:;]+$/u, ''));
  return `为了准确处理，请一次确认：${Array.from(new Set(normalizedParts)).join('；')}？`;
}

function isExecutableTimeRange(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const range = value as Record<string, unknown>;
  const label = typeof range.label === 'string' ? range.label.trim() : '';
  const timezone = typeof range.timezone === 'string' ? range.timezone : '';
  const preset = typeof range.preset === 'string' ? range.preset.trim() : '';
  const startDate = typeof range.startDate === 'string' ? range.startDate.trim() : '';
  const endDate = typeof range.endDate === 'string' ? range.endDate.trim() : '';
  if (!label || (timezone !== 'Asia/Shanghai' && timezone !== 'UTC')) return false;
  if (preset) return SUPPORTED_TIME_PRESETS.has(preset);
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) return false;
  return startDate <= endDate;
}

const SUPPORTED_TIME_PRESETS = new Set([
  'today',
  'tomorrow',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
]);

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isUserFacingCandidate(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || candidate.length > 80) return false;
  return !/^(entity|relation|metric|dimension|field|action)[.:]|(:|@|#|=|fingerprint|definition|source[_-]?key|\bsql\b|capability(?:summaries)?|checkedInAt|\bstatus\b|字段|非空)/i.test(
    candidate,
  );
}

function dedupeIssues(issues: BrainSemanticIntentValidationIssue[]): BrainSemanticIntentValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify([issue.code, issue.slot ?? '', issue.message, issue.candidates ?? []]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
