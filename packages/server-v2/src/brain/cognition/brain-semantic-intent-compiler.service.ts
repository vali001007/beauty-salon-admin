import { Injectable } from '@nestjs/common';
import {
  AiService,
  AiStructuredOutputError,
  type AiStructuredOutputErrorCode,
  type AiUsage,
} from '../../ai/ai.service.js';
import type { BrainDomainRole } from '../domain/brain-domain-adapter.types.js';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import { buildBrainSemanticIntentMessages } from './brain-semantic-intent-compiler.prompt.js';
import {
  BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA,
  BRAIN_SEMANTIC_INTENT_PROMPT_SCHEMA,
} from './brain-semantic-intent.schema.js';
import {
  BRAIN_SEMANTIC_ANSWER_SHAPES,
  BRAIN_SEMANTIC_INTENTS,
  type BrainSemanticAnswerShape,
  type BrainSemanticIntentKind,
  type BrainDefinitionRef,
  type BrainSemanticIntent,
  type BrainSemanticTimeRange,
  type BrainSupportedTimezone,
} from './brain-semantic-intent.types.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from './business-definition-snapshot.types.js';
import type { BrainRoleRuntimeContext } from '../role/brain-role-context-builder.service.js';
import { BrainTimeRangeParserService, type BrainDateRange } from './brain-time-range-parser.service.js';

export interface BrainSemanticOntologyCandidate {
  definitionRef: BrainDefinitionRef<'entity' | 'relation'>;
  name: string;
  domain?: string;
  aliases?: string[];
  entityKey?: string;
  fromEntityKey?: string;
  toEntityKey?: string;
}

export interface BrainSemanticCapabilitySummary {
  key: string;
  name: string;
  description: string;
  domains: string[];
  intents: string[];
  examples?: string[];
  readOnly: boolean;
  definitionRefs?: Array<BrainDefinitionRef<'entity' | 'relation' | 'metric' | 'dimension'>>;
}

export interface BrainSemanticIntentCompilerInput {
  question: string;
  deadlineAt?: number;
  audit: { userId: number; storeId: number };
  timezone: BrainSupportedTimezone;
  role: BrainDomainRole;
  roleContext?: BrainRoleRuntimeContext;
  conversationSlots: Record<string, unknown>;
  ontologySnapshot?: ProductionReadyBusinessDefinitionSnapshot | null;
  ontologyCandidates: BrainSemanticOntologyCandidate[];
  metricRefs: Array<BrainDefinitionRef<'metric'>>;
  dimensionRefs: Array<BrainDefinitionRef<'dimension'>>;
  capabilitySummaries: BrainSemanticCapabilitySummary[];
  repairFeedback?: {
    previousIntent: BrainSemanticIntent;
    issues: Array<{ code: string; slot?: string; message: string }>;
  };
}

export type BrainSemanticIntentCompilerErrorCode =
  | AiStructuredOutputErrorCode
  | 'MODEL_UNAVAILABLE'
  | 'INVALID_AUDIT_CONTEXT'
  | 'CONTEXT_LIMIT_EXCEEDED';

export type BrainSemanticIntentCompilerResult =
  | {
      status: 'completed';
      intent: BrainSemanticIntent;
      provider: string;
      model: string;
      usage: AiUsage;
    }
  | {
      status: 'unavailable';
      errorCode: BrainSemanticIntentCompilerErrorCode;
      reason: string;
    };

@Injectable()
export class BrainSemanticIntentCompilerService {
  constructor(
    private readonly aiService: AiService,
    private readonly config: BrainRuntimeConfigService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
  ) {}

  async compile(input: BrainSemanticIntentCompilerInput): Promise<BrainSemanticIntentCompilerResult> {
    try {
      const deadlineAt = input.deadlineAt;
      const modelContext = this.buildModelContext(input);
      const governedFastPath = this.buildExactCapabilityFallback(input, 'contract_fast_path');
      if (governedFastPath) {
        return {
          status: 'completed',
          intent: governedFastPath,
          provider: 'governed_contract',
          model: 'exact_example_fast_path',
          usage: {
            provider: 'governed_contract',
            model: 'exact_example_fast_path',
            inputTokens: 0,
            outputTokens: 0,
          },
        };
      }
      const messages = buildBrainSemanticIntentMessages(modelContext);
      const request = {
        scenario: 'brain.semantic_intent.v1',
        allowFallback: true,
        messages,
        fallbackMessages: messages,
        repairMessages: buildBrainSemanticIntentMessages(maskRepairContext(modelContext)),
        schema: BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA,
        promptSchema: BRAIN_SEMANTIC_INTENT_PROMPT_SCHEMA,
        temperature: 0,
        userId: input.audit.userId,
        storeId: input.audit.storeId,
      } as const;
      let result;
      let attempt = 0;
      while (!result) {
        try {
          const remainingMs = deadlineAt === undefined
            ? this.config.runtime.modelTimeoutMs
            : Math.floor(deadlineAt - Date.now());
          if (remainingMs <= 0) {
            throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'Brain semantic intent deadline is exhausted.');
          }
          result = await this.aiService.generateStructured<BrainSemanticIntent>({
            ...request,
            scenario: attempt === 0 ? request.scenario : `brain.semantic_intent.retry${attempt}.v1`,
            timeoutMs: Math.min(this.config.runtime.modelTimeoutMs, remainingMs),
          });
        } catch (error) {
          attempt += 1;
          if (
            !(error instanceof AiStructuredOutputError) ||
            !RETRYABLE_INTENT_ERRORS.has(error.code) ||
            attempt >= MAX_INTENT_ATTEMPTS
          ) {
            throw error;
          }
        }
      }

      return {
        status: 'completed',
        intent: this.normalizeModelIntent(result.data, input),
        provider: result.provider,
        model: result.model,
        usage: result.usage,
      };
    } catch (error) {
      if (error instanceof BrainSemanticAuditContextError) {
        return {
          status: 'unavailable',
          errorCode: 'INVALID_AUDIT_CONTEXT',
          reason: error.message,
        };
      }
      if (error instanceof BrainSemanticContextError) {
        return {
          status: 'unavailable',
          errorCode: 'CONTEXT_LIMIT_EXCEEDED',
          reason: error.message,
        };
      }
      if (error instanceof AiStructuredOutputError) {
        if (
          error.code === 'BUDGET_EXCEEDED' ||
          error.code === 'PROVIDER_UNAVAILABLE' ||
          error.code === 'PROVIDER_AUTH_FAILED'
        ) {
          const governedFallback = this.buildExactCapabilityFallback(input, 'model_unavailable');
          if (governedFallback) {
            return {
              status: 'completed',
              intent: governedFallback,
              provider: 'governed_contract',
              model: 'exact_example_fallback',
              usage: {
                provider: 'governed_contract',
                model: 'exact_example_fallback',
                inputTokens: 0,
                outputTokens: 0,
              },
            };
          }
        }
        return {
          status: 'unavailable',
          errorCode: error.code,
          reason: error.message,
        };
      }

      return {
        status: 'unavailable',
        errorCode: 'MODEL_UNAVAILABLE',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildExactCapabilityFallback(
    input: BrainSemanticIntentCompilerInput,
    mode: 'contract_fast_path' | 'model_unavailable',
  ): BrainSemanticIntent | undefined {
    const capability = input.capabilitySummaries.find(
      (candidate) =>
        candidate.readOnly &&
        (mode !== 'contract_fast_path' || Boolean(candidate.definitionRefs?.length)) &&
        !candidate.intents.some((intent) => ['action', 'workflow'].includes(intent)) &&
        (candidate.examples ?? []).some(
          (example) => normalizeSemanticText(example) === normalizeSemanticText(input.question),
        ),
    );
    if (!capability) return undefined;
    const parsedTime = this.timeRangeParser.parse(input.question);
    const intent = exactCapabilityIntent(input.question, capability.intents, Boolean(parsedTime.comparison));
    if (!intent) return undefined;
    const timeRange = this.resolveQuestionTimeRange(input.question, input.timezone);
    const comparisonTarget = intent === 'comparison'
      ? this.resolveQuestionComparisonTarget(input.question, input.timezone)
      : undefined;
    const exactDefinitions = this.resolveExactDefinitions(capability, input, intent);
    return {
      schemaVersion: '1.0',
      objective: input.question.trim(),
      domains: [...capability.domains],
      intent,
      entities: exactDefinitions.entities,
      metrics: exactDefinitions.metrics,
      dimensions: exactDefinitions.dimensions,
      filters: [],
      ...(timeRange ? { timeRange } : {}),
      ...(comparisonTarget ? { comparisonTarget } : {}),
      orderBy: exactDefinitions.orderBy,
      answerShape:
        intent === 'query' &&
        exactDefinitions.metrics.length > 0 &&
        exactDefinitions.dimensions.length === 0 &&
        !isExplicitListQuestion(input.question)
          ? 'scalar'
          : exactCapabilityAnswerShape(intent),
      successCriteria: [`执行已发布能力 ${capability.key} 并返回可追溯结果`],
      ambiguities: [],
      missingSlots: [],
      assumptions: [
        mode === 'contract_fast_path'
          ? `问题完全匹配已发布能力 ${capability.key} 的正例合同`
          : `模型不可用或预算耗尽，按已发布能力 ${capability.key} 的完全匹配示例继续执行`,
      ],
      confidence: 1,
      decisionSummary: `问题与已发布能力 ${capability.key} 的示例完全匹配。`,
    };
  }

  private resolveExactDefinitions(
    capability: BrainSemanticCapabilitySummary,
    input: BrainSemanticIntentCompilerInput,
    intent: BrainSemanticIntent['intent'],
  ): Pick<BrainSemanticIntent, 'entities' | 'metrics' | 'dimensions' | 'orderBy'> {
    const refs = capability.definitionRefs ?? [];
    const availableMetrics = refs.flatMap((ref) =>
      ref.definitionType === 'metric'
        ? [copyDefinitionRef(ref as BrainDefinitionRef<'metric'>)]
        : [],
    );
    const matchedMetrics = availableMetrics.filter((ref) => {
      const definition = input.ontologySnapshot?.metrics.find((item) => item.definitionKey === ref.definitionKey);
      return definition
        ? definitionMatchesQuestion(input.question, definition.name, definition.aliases) ||
            governedMetricKeyMatchesQuestion(input.question, ref.definitionKey)
        : governedMetricKeyMatchesQuestion(input.question, ref.definitionKey);
    });
    const metrics = matchedMetrics.length > 0
      ? matchedMetrics
      : availableMetrics.length === 1 || intent === 'ranking'
        ? availableMetrics
        : [];
    const entityDefinitions = refs.flatMap((ref) => {
      if (ref.definitionType !== 'entity') return [];
      const definition = input.ontologySnapshot?.entities.find((item) => item.definitionKey === ref.definitionKey);
      if (!definition) return [];
      return intent === 'ranking' || definitionMatchesQuestion(input.question, definition.name, definition.aliases)
        ? [definition]
        : [];
    });
    const directDimensions = refs.flatMap((ref) =>
      ref.definitionType === 'dimension'
        ? (() => {
            const definitions = input.ontologySnapshot?.dimensions
              .filter((item) => item.definitionKey === ref.definitionKey) ?? [];
            if (definitions.length > 0) {
              return definitions
                .filter(
                  (item) =>
                    intent === 'ranking' ||
                    definitionMatchesQuestion(input.question, item.name, item.aliases) ||
                    governedDimensionKeyMatchesQuestion(input.question, ref.definitionKey),
                )
                .map((item) => definitionRef('dimension', item));
            }
            return governedDimensionKeyMatchesQuestion(input.question, ref.definitionKey)
              ? [copyDefinitionRef(ref as BrainDefinitionRef<'dimension'>)]
              : [];
          })()
        : [],
    );
    const runtimeDimensionKeys = metrics.flatMap((metricRef) =>
      input.ontologySnapshot?.metrics
        .find((metric) => metric.definitionKey === metricRef.definitionKey)
        ?.runtimeQuery?.dimensions ?? [],
    );
    const inferredDimensions = input.ontologySnapshot?.dimensions
      .filter((dimension) =>
        runtimeDimensionKeys.includes(dimension.dimensionKey) ||
        (runtimeDimensionKeys.length === 0 && entityDefinitions.some((entity) => entity.domain === dimension.domain)),
      )
      .map((dimension) => definitionRef('dimension', dimension)) ?? [];
    const dimensions = uniqueDefinitionRefs([...directDimensions, ...inferredDimensions]);
    const entities = entityDefinitions.map((entity) => ({
      entityType: entity.entityKey,
      mention: entity.name,
      source: 'system' as const,
      definitionRef: definitionRef('entity', entity),
      confidence: 1,
    }));
    return {
      entities,
      metrics,
      dimensions,
      orderBy: intent === 'ranking' && metrics[0]
        ? [{ definitionRef: { ...metrics[0] }, direction: 'desc' }]
        : [],
    };
  }

  private normalizeModelIntent(
    intent: BrainSemanticIntent,
    input: BrainSemanticIntentCompilerInput,
  ): BrainSemanticIntent {
    const canonicalIntent = hydrateModelIntentDefinitionRefs(intent, input);
    const intentKind = normalizeIntentKind(canonicalIntent);
    const exactCapability = input.capabilitySummaries.find(
      (capability) =>
        capability.intents.includes(intentKind) &&
        (capability.examples ?? []).some((example) => normalizeSemanticText(example) === normalizeSemanticText(input.question)),
    );
    const timeRange = this.resolveQuestionTimeRange(input.question, input.timezone);
    const comparisonTarget = intentKind === 'comparison'
      ? this.resolveQuestionComparisonTarget(input.question, input.timezone) ?? canonicalIntent.comparisonTarget
      : canonicalIntent.comparisonTarget;
    const entities = canonicalIntent.entities.map((entity) => {
      const definitionRef = entity.definitionRef ?? resolveOntologyEntityRef(entity.entityType, input);
      const normalized = definitionRef ? { ...entity, definitionRef } : entity;
      if (!normalized.entityKey || !normalized.definitionRef) return normalized;
      return isOntologyTypeKey(normalized.entityKey, normalized.definitionRef.definitionKey, input) ||
        isGenericOntologyMention(normalized.mention, normalized.definitionRef.definitionKey, input)
        ? { ...normalized, entityKey: undefined }
        : normalized;
    });
    const exactCustomerFactQuery =
      intent.intent === 'query' &&
      entities.length === 1 &&
      entities[0]?.definitionRef?.definitionKey === 'entity.customer' &&
      !isGenericOntologyMention(entities[0].mention, 'entity.customer', input);
    // Field definitions are not part of the published business-definition snapshot yet.
    // Keep model-invented field refs out of executable plans; domain capabilities resolve
    // only their explicitly supported constraints from objective, entities and time range.
    const filters: BrainSemanticIntent['filters'] = [];
    const missingSlots = canonicalIntent.missingSlots.filter(
      (slot) =>
        (!timeRange || !isTimeRangeSlot(slot)) &&
        (!comparisonTarget || !isComparisonTargetSlot(slot)) &&
        (!exactCustomerFactQuery || !isCustomerFactSlot(slot)),
    );
    const inferredOrderBy =
      intentKind === 'ranking' && canonicalIntent.orderBy.length === 0 && canonicalIntent.metrics.length === 1
        ? [{ definitionRef: { ...canonicalIntent.metrics[0] }, direction: 'desc' as const }]
        : canonicalIntent.orderBy;
    const domains = uniqueSemanticDomains([
      ...canonicalIntent.domains,
      ...resolveReferencedDefinitionDomains(canonicalIntent, input),
    ]);
    const resolvedAmbiguities = canonicalIntent.ambiguities.filter(
      (ambiguity) =>
        !(ambiguity.slot === 'timeRange' && timeRange) &&
        !(ambiguity.slot === 'comparisonTarget' && comparisonTarget),
    );
    const governedAmbiguities = exactCapability
      ? resolvedAmbiguities.filter((ambiguity) => canonicalIntent.missingSlots.includes(ambiguity.slot))
      : resolvedAmbiguities;
    const ambiguities = exactCustomerFactQuery
      ? governedAmbiguities.filter((ambiguity) => !isCustomerFactSlot(ambiguity.slot))
      : governedAmbiguities;
    return {
      ...canonicalIntent,
      intent: intentKind,
      domains,
      entities,
      filters,
      orderBy: inferredOrderBy,
      ...(timeRange ? { timeRange } : {}),
      ...(comparisonTarget ? { comparisonTarget } : {}),
      ambiguities,
      missingSlots: inferredOrderBy.length > 0
        ? missingSlots.filter((slot) => slot !== 'orderBy')
        : missingSlots,
    };
  }

  private resolveQuestionTimeRange(
    question: string,
    timezone: BrainSupportedTimezone,
  ): BrainSemanticTimeRange | undefined {
    const parsed = this.timeRangeParser.parse(question);
    const range = parsed.comparison?.current ?? parsed.range;
    if (!range || parsed.unsupportedExpressions.length > 0) return undefined;
    return this.toSemanticTimeRange(range, timezone);
  }

  private resolveQuestionComparisonTarget(
    question: string,
    timezone: BrainSupportedTimezone,
  ): BrainSemanticIntent['comparisonTarget'] | undefined {
    const parsed = this.timeRangeParser.parse(question);
    if (!parsed.comparison || parsed.unsupportedExpressions.length > 0) return undefined;
    return {
      type: 'time',
      timeRange: this.toSemanticTimeRange(parsed.comparison.previous, timezone),
    };
  }

  private toSemanticTimeRange(range: BrainDateRange, timezone: BrainSupportedTimezone): BrainSemanticTimeRange {
    const preset = TIME_RANGE_PRESETS[range.label];
    if (preset) return { preset, label: range.label, timezone };
    if (range.granularity === 'hour') return { label: range.label, timezone };
    return {
      label: range.label,
      timezone,
      startDate: localIsoDate(range.startDate),
      endDate: localIsoDate(range.endDate),
    };
  }

  private buildModelContext(input: BrainSemanticIntentCompilerInput): Record<string, unknown> {
    assertPositiveInteger('audit.userId', input.audit.userId);
    assertPositiveInteger('audit.storeId', input.audit.storeId);
    const question = input.question.trim();
    if (!question || question.length > MAX_QUESTION_LENGTH) {
      throw new BrainSemanticContextError(`question must contain 1-${MAX_QUESTION_LENGTH} characters`);
    }
    assertCollectionLimit('ontologyCandidates', input.ontologyCandidates, MAX_ONTOLOGY_CANDIDATES);
    assertCollectionLimit('metricRefs', input.metricRefs, MAX_DEFINITION_REFS);
    assertCollectionLimit('dimensionRefs', input.dimensionRefs, MAX_DEFINITION_REFS);
    assertCollectionLimit('capabilitySummaries', input.capabilitySummaries, MAX_CAPABILITY_SUMMARIES);
    if (input.ontologySnapshot) {
      assertCollectionLimit('ontology.entities', input.ontologySnapshot.entities, MAX_ONTOLOGY_DEFINITIONS);
      assertCollectionLimit('ontology.relations', input.ontologySnapshot.relations, MAX_ONTOLOGY_RELATIONS);
      assertCollectionLimit('ontology.metrics', input.ontologySnapshot.metrics, MAX_ONTOLOGY_DEFINITIONS);
      assertCollectionLimit('ontology.dimensions', input.ontologySnapshot.dimensions, MAX_ONTOLOGY_DEFINITIONS);
    }
    const conversationSlots = sanitizeConversationSlots(input.conversationSlots);
    const context = {
      question,
      timezone: input.timezone,
      role: input.role,
      ...(input.roleContext
        ? {
            roleContext: {
              role: input.roleContext.role,
              expressionRole: input.roleContext.expressionRole,
              profileName: input.roleContext.profileName,
              profileVersion: input.roleContext.profileVersion,
              systemPrompt: input.roleContext.systemPrompt,
              allowedSkills: [...input.roleContext.allowedSkills],
              dataScopeRules: { ...input.roleContext.dataScopeRules },
              knowledgePack: { ...input.roleContext.knowledgePack },
            },
          }
        : {}),
      conversationSlots,
      ontology: input.ontologySnapshot
        ? compressOntologySnapshot(input.ontologySnapshot)
        : {
            source: 'candidates',
            candidates: input.ontologyCandidates.map(compressOntologyCandidate),
          },
      ...(!input.ontologySnapshot
        ? {
            metricRefs: input.metricRefs.map(copyDefinitionRef),
            dimensionRefs: input.dimensionRefs.map(copyDefinitionRef),
          }
        : {}),
      capabilitySummaries: input.capabilitySummaries.map((capability) => ({
        key: capability.key,
        name: capability.name,
        description: capability.description,
        domains: [...capability.domains],
        intents: [...capability.intents],
        examples: selectCapabilityExamples(question, capability.examples ?? []),
        readOnly: capability.readOnly,
      })),
      ...(input.repairFeedback
        ? {
            repairFeedback: {
              previousIntent: input.repairFeedback.previousIntent,
              issues: input.repairFeedback.issues.map((issue) => ({ ...issue })),
            },
          }
        : {}),
    };
    if (Buffer.byteLength(JSON.stringify(context), 'utf8') > MAX_MODEL_CONTEXT_BYTES) {
      throw new BrainSemanticContextError('semantic model context exceeds the governed byte budget');
    }
    return context;
  }
}

function isTimeRangeSlot(slot: string) {
  return slot === 'timeRange' || /(?:时间|日期|周期|时段|time\s*range|date\s*range|period)/i.test(slot);
}

function isComparisonTargetSlot(slot: string) {
  return slot === 'comparisonTarget' || /(?:对比|比较|环比|同比|comparison)/i.test(slot);
}

function compressOntologySnapshot(snapshot: ProductionReadyBusinessDefinitionSnapshot) {
  return {
    source: 'runtime_snapshot',
    productionReady: snapshot.productionReady,
    snapshotFingerprint: snapshot.fingerprint,
    entities: snapshot.entities.map((entity) => ({
      definitionRef: modelDefinitionRef('entity', entity.definitionKey),
      entityKey: entity.entityKey,
      name: entity.name,
      aliases: [...entity.aliases],
      domain: entity.domain,
      fields: extractEntityFieldNames(entity.attributes),
    })),
    relations: snapshot.relations.map((relation) => ({
      definitionRef: modelDefinitionRef('relation', relation.definitionKey),
      relationKey: relation.relationKey,
      name: relation.name,
      fromEntityKey: relation.fromEntityKey,
      toEntityKey: relation.toEntityKey,
    })),
    metrics: snapshot.metrics.map((metric) => ({
      definitionRef: modelDefinitionRef('metric', metric.definitionKey),
      metricKey: metric.metricKey,
      name: metric.name,
      domain: metric.domain,
      description: metric.description,
    })),
    dimensions: snapshot.dimensions.map((dimension) => ({
      definitionRef: modelDefinitionRef('dimension', dimension.definitionKey),
      dimensionKey: dimension.dimensionKey,
      name: dimension.name,
      domain: dimension.domain,
    })),
  };
}

function compressOntologyCandidate(candidate: BrainSemanticOntologyCandidate) {
  return {
    definitionRef: modelDefinitionRef(candidate.definitionRef.definitionType, candidate.definitionRef.definitionKey),
    name: candidate.name,
    ...(candidate.domain ? { domain: candidate.domain } : {}),
    ...(candidate.aliases ? { aliases: [...candidate.aliases] } : {}),
    ...(candidate.entityKey ? { entityKey: candidate.entityKey } : {}),
    ...(candidate.fromEntityKey ? { fromEntityKey: candidate.fromEntityKey } : {}),
    ...(candidate.toEntityKey ? { toEntityKey: candidate.toEntityKey } : {}),
  };
}

function definitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension'>(
  definitionType: T,
  definition: {
    definitionKey: string;
    version: number;
    definitionFingerprint: string;
    sourceFingerprint: string;
  },
): BrainDefinitionRef<T> {
  return {
    definitionType,
    definitionKey: definition.definitionKey,
    definitionVersion: definition.version,
    definitionFingerprint: definition.definitionFingerprint,
    sourceFingerprint: definition.sourceFingerprint,
  };
}

function modelDefinitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension'>(
  definitionType: T,
  definitionKey: string,
) {
  return { definitionType, definitionKey };
}

function copyDefinitionRef<T extends 'metric' | 'dimension' | 'entity' | 'relation'>(
  ref: BrainDefinitionRef<T>,
): BrainDefinitionRef<T> {
  return {
    definitionType: ref.definitionType,
    definitionKey: ref.definitionKey,
    definitionVersion: ref.definitionVersion,
    definitionFingerprint: ref.definitionFingerprint,
    sourceFingerprint: ref.sourceFingerprint,
  };
}

function uniqueDefinitionRefs<T extends 'metric' | 'dimension' | 'entity' | 'relation'>(
  refs: Array<BrainDefinitionRef<T>>,
) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.definitionType}:${ref.definitionKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hydrateModelIntentDefinitionRefs(
  intent: BrainSemanticIntent,
  input: BrainSemanticIntentCompilerInput,
): BrainSemanticIntent {
  const metrics = intent.metrics.flatMap((ref) => {
    const resolved = resolveCanonicalDefinitionRef('metric', ref?.definitionKey, input);
    return resolved ? [resolved] : [];
  });
  const dimensions = intent.dimensions.flatMap((ref) => {
    const resolved = resolveCanonicalDefinitionRef('dimension', ref?.definitionKey, input);
    return resolved ? [resolved] : [];
  });
  const entities = intent.entities.map((entity) => {
    const resolved = entity.definitionRef?.definitionKey
      ? resolveCanonicalDefinitionRef('entity', entity.definitionRef.definitionKey, input)
      : resolveOntologyEntityRef(entity.entityType, input);
    const source = (entity as { source: string }).source === 'question' ? 'user' : entity.source;
    return resolved
      ? { ...entity, source, definitionRef: resolved }
      : { ...entity, source, definitionRef: undefined };
  });
  const orderBy = intent.orderBy.flatMap((item) => {
    const type = item.definitionRef?.definitionType;
    if (type !== 'metric' && type !== 'dimension') return [];
    const resolved = resolveCanonicalDefinitionRef(type, item.definitionRef.definitionKey, input);
    return resolved ? [{ ...item, definitionRef: resolved }] : [];
  });
  return {
    ...intent,
    intent: normalizeModelIntentValue(intent.intent),
    answerShape: normalizeModelAnswerShapeValue(intent.answerShape, intent.intent),
    entities,
    metrics,
    dimensions,
    filters: [],
    orderBy,
  };
}

function normalizeModelIntentValue(value: BrainSemanticIntent['intent']): BrainSemanticIntentKind {
  if (typeof value === 'string' && BRAIN_SEMANTIC_INTENTS.includes(value)) return value;
  if (Array.isArray(value)) {
    const candidate = value.find((item): item is BrainSemanticIntentKind =>
      typeof item === 'string' && BRAIN_SEMANTIC_INTENTS.includes(item as BrainSemanticIntentKind),
    );
    if (candidate) return candidate;
  }
  return 'clarify';
}

function normalizeModelAnswerShapeValue(
  value: BrainSemanticIntent['answerShape'],
  rawIntent: BrainSemanticIntent['intent'],
): BrainSemanticAnswerShape {
  if (typeof value === 'string' && BRAIN_SEMANTIC_ANSWER_SHAPES.includes(value)) return value;
  const candidates = Array.isArray(value)
    ? value.filter((item): item is BrainSemanticAnswerShape =>
        typeof item === 'string' && BRAIN_SEMANTIC_ANSWER_SHAPES.includes(item as BrainSemanticAnswerShape),
      )
    : [];
  const intent = normalizeModelIntentValue(rawIntent);
  const preferred: Partial<Record<BrainSemanticIntentKind, BrainSemanticAnswerShape[]>> = {
    query: ['list', 'scalar'],
    ranking: ['ranking'],
    comparison: ['comparison'],
    trend: ['trend'],
    diagnosis: ['diagnosis'],
    recommendation: ['list', 'diagnosis', 'ranking'],
    draft: ['draft'],
    action: ['action_preview'],
    workflow: ['diagnosis', 'action_preview'],
    clarify: ['diagnosis'],
  };
  return preferred[intent]?.find((item) => candidates.includes(item)) ?? candidates[0] ?? 'diagnosis';
}

function resolveCanonicalDefinitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension'>(
  definitionType: T,
  definitionKey: string | undefined,
  input: BrainSemanticIntentCompilerInput,
): BrainDefinitionRef<T> | undefined {
  if (!definitionKey) return undefined;
  if (definitionType === 'metric') {
    return input.metricRefs.find((ref) => ref.definitionKey === definitionKey) as BrainDefinitionRef<T> | undefined;
  }
  if (definitionType === 'dimension') {
    return input.dimensionRefs.find((ref) => ref.definitionKey === definitionKey) as BrainDefinitionRef<T> | undefined;
  }
  const snapshotDefinitions = definitionType === 'entity'
    ? input.ontologySnapshot?.entities
    : input.ontologySnapshot?.relations;
  const snapshotDefinition = snapshotDefinitions?.find((definition) => definition.definitionKey === definitionKey);
  if (snapshotDefinition) {
    return definitionRef(definitionType, snapshotDefinition) as BrainDefinitionRef<T>;
  }
  const candidate = input.ontologyCandidates.find(
    (item) => item.definitionRef.definitionType === definitionType && item.definitionRef.definitionKey === definitionKey,
  );
  return candidate ? copyDefinitionRef(candidate.definitionRef) as BrainDefinitionRef<T> : undefined;
}

const MAX_QUESTION_LENGTH = 4_000;
const MAX_SLOT_DEPTH = 8;
const MAX_SLOT_NODES = 256;
const MAX_SLOT_ARRAY_ITEMS = 64;
const MAX_SLOT_OBJECT_KEYS = 64;
const MAX_SLOT_STRING_LENGTH = 1_000;
const MAX_SLOT_BYTES = 32_000;
const MAX_MODEL_CONTEXT_BYTES = 256_000;
const MAX_CAPABILITY_SUMMARIES = 100;
const MAX_ONTOLOGY_CANDIDATES = 500;
const MAX_DEFINITION_REFS = 500;
const MAX_ONTOLOGY_DEFINITIONS = 500;
const MAX_ONTOLOGY_RELATIONS = 1_000;

const FORBIDDEN_SCOPE_KEYS = new Set([
  'userid',
  'storeid',
  'storeids',
  'permission',
  'permissions',
  'requiredpermissions',
  'datascope',
  'tenantid',
  'tenant',
  'storescope',
  'visiblestoreids',
  'deniedpermissions',
  'permissioncodes',
  'user',
  'store',
  'role',
  'rolehint',
]);

class BrainSemanticContextError extends Error {}
class BrainSemanticAuditContextError extends Error {}

function sanitizeConversationSlots(value: unknown): unknown {
  const state = { seen: new WeakSet<object>(), nodes: 0 };
  const sanitized = sanitizeSlotValue(value, state, 0);
  if (Buffer.byteLength(JSON.stringify(sanitized), 'utf8') > MAX_SLOT_BYTES) {
    throw new BrainSemanticContextError('conversation slots exceed the governed byte budget');
  }
  return sanitized;
}

function sanitizeSlotValue(value: unknown, state: { seen: WeakSet<object>; nodes: number }, depth: number): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_SLOT_NODES || depth > MAX_SLOT_DEPTH) {
    throw new BrainSemanticContextError('conversation slots exceed the governed structure budget');
  }
  if (typeof value === 'string') {
    if (value.length > MAX_SLOT_STRING_LENGTH) {
      throw new BrainSemanticContextError('conversation slot string exceeds the governed length budget');
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_SLOT_ARRAY_ITEMS) {
      throw new BrainSemanticContextError('conversation slot array exceeds the governed item budget');
    }
    if (state.seen.has(value)) throw new BrainSemanticContextError('conversation slots contain a cycle');
    state.seen.add(value);
    return value.map((item) => sanitizeSlotValue(item, state, depth + 1));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (state.seen.has(value)) throw new BrainSemanticContextError('conversation slots contain a cycle');
  state.seen.add(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_SLOT_OBJECT_KEYS) {
    throw new BrainSemanticContextError('conversation slot object exceeds the governed key budget');
  }
  return Object.fromEntries(
    entries
      .filter(([key]) => !FORBIDDEN_SCOPE_KEYS.has(normalizeSecurityKey(key)))
      .map(([key, nested]) => [key, sanitizeSlotValue(nested, state, depth + 1)]),
  );
}

function normalizeSecurityKey(value: string): string {
  return value.toLowerCase().replace(/[_-]/g, '');
}

function assertCollectionLimit(name: string, items: unknown[], maximum: number): void {
  if (items.length > maximum) {
    throw new BrainSemanticContextError(`${name} exceeds the governed item budget of ${maximum}`);
  }
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BrainSemanticAuditContextError(`${name} must be a positive integer`);
  }
}

function maskRepairContext(value: unknown): Record<string, unknown> {
  return maskRepairValue(value) as Record<string, unknown>;
}

function maskRepairValue(value: unknown): unknown {
  if (typeof value === 'string') return maskSensitiveText(value);
  if (Array.isArray(value)) return value.map(maskRepairValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, maskRepairValue(nested)]),
  );
}

function maskSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '***')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '***')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '***')
    .replace(/(?<!\d)\d{16,19}(?!\d)/g, '***');
}

const TIME_RANGE_PRESETS: Record<string, string> = {
  今天: 'today',
  明天: 'tomorrow',
  昨天: 'yesterday',
  本周: 'this_week',
  上周: 'last_week',
  本月: 'this_month',
  上月: 'last_month',
  本季度: 'this_quarter',
  上季度: 'last_quarter',
  今年: 'this_year',
  去年: 'last_year',
};

const RETRYABLE_INTENT_ERRORS = new Set(['SCHEMA_INVALID', 'JSON_INVALID', 'PROVIDER_UNAVAILABLE']);
const MAX_INTENT_ATTEMPTS = 3;

function exactCapabilityIntent(
  question: string,
  intents: readonly string[],
  hasTimeComparison = false,
): BrainSemanticIntent['intent'] | undefined {
  const allowed = new Set(intents);
  const candidates: BrainSemanticIntent['intent'][] = [
    ...(/排行|排名|(?:谁|哪个).*(?:最高|最多|最好)|(?:最高|最多|最好)(?:的)?(?:前\s*\d+)?|前\s*\d+/.test(question)
      ? ['ranking' as const]
      : []),
    ...(hasTimeComparison || /对比|相比|跟.*比|和.*比|差多少/.test(question) ? ['comparison' as const] : []),
    ...(/趋势|走势|每天|近三天|最近三天/.test(question) ? ['trend' as const] : []),
    ...(/怎么样|情况|风险|分析|概览|总结|异常|原因|为什么|下降|变差|不赚钱|根因/.test(question) ? ['diagnosis' as const] : []),
    ...(/建议|推荐|适合/.test(question) ? ['recommendation' as const] : []),
    'query',
  ];
  return candidates.find((intent) => allowed.has(intent));
}

function exactCapabilityAnswerShape(intent: BrainSemanticIntent['intent']): BrainSemanticIntent['answerShape'] {
  if (intent === 'ranking') return 'ranking';
  if (intent === 'comparison') return 'comparison';
  if (intent === 'trend') return 'trend';
  if (intent === 'diagnosis' || intent === 'recommendation') return 'diagnosis';
  return 'list';
}

function isExplicitListQuestion(question: string) {
  return /(哪些|哪几|名单|列表|列出|找出|分别是谁|都有谁)/.test(question);
}

function localIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isGenericOntologyMention(
  mention: string,
  definitionKey: string,
  input: BrainSemanticIntentCompilerInput,
): boolean {
  const normalizedMention = normalizeSemanticText(mention);
  const snapshotEntity = input.ontologySnapshot?.entities.find((entity) => entity.definitionKey === definitionKey);
  const candidate = input.ontologyCandidates.find((item) => item.definitionRef.definitionKey === definitionKey);
  const names = snapshotEntity
    ? [snapshotEntity.name, ...snapshotEntity.aliases]
    : candidate
      ? [candidate.name, ...(candidate.aliases ?? [])]
      : [];
  return names.some((name) => normalizeSemanticText(name) === normalizedMention);
}

function isOntologyTypeKey(
  entityKey: string,
  definitionKey: string,
  input: BrainSemanticIntentCompilerInput,
): boolean {
  const snapshotEntity = input.ontologySnapshot?.entities.find((entity) => entity.definitionKey === definitionKey);
  const candidate = input.ontologyCandidates.find((item) => item.definitionRef.definitionKey === definitionKey);
  const typeKey = snapshotEntity?.entityKey ?? candidate?.entityKey;
  return Boolean(typeKey) && normalizeSemanticText(entityKey) === normalizeSemanticText(typeKey!);
}

function resolveOntologyEntityRef(
  entityType: string,
  input: BrainSemanticIntentCompilerInput,
): BrainDefinitionRef<'entity'> | undefined {
  const normalizedType = normalizeSemanticText(entityType);
  const snapshotMatches = input.ontologySnapshot?.entities.filter((entity) =>
    [entity.entityKey, entity.name, ...entity.aliases].some((value) => normalizeSemanticText(value) === normalizedType),
  ) ?? [];
  if (snapshotMatches.length === 1) return definitionRef('entity', snapshotMatches[0]);
  const candidateMatches = input.ontologyCandidates.filter((candidate) =>
    candidate.definitionRef.definitionType === 'entity' &&
    [candidate.entityKey, candidate.name, ...(candidate.aliases ?? [])]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalizeSemanticText(value) === normalizedType),
  );
  return candidateMatches.length === 1
    ? copyDefinitionRef(candidateMatches[0].definitionRef as BrainDefinitionRef<'entity'>)
    : undefined;
}

function normalizeSemanticText(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, '');
}

function definitionMatchesQuestion(question: string, name: string, aliases: readonly string[] = []): boolean {
  const normalizedQuestion = normalizeSemanticText(question);
  return [name, ...aliases]
    .map(normalizeSemanticText)
    .filter((value) => value.length >= 2)
    .some((value) => normalizedQuestion.includes(value));
}

function governedMetricKeyMatchesQuestion(question: string, definitionKey: string): boolean {
  const normalizedQuestion = normalizeSemanticText(question);
  const metricKey = definitionKey.replace(/^metric\./, '');
  switch (metricKey) {
    case 'product_sales_amount':
      return /(商品|产品)/.test(normalizedQuestion) && /(销售额|销售金额)/.test(normalizedQuestion);
    case 'product_sales_quantity':
      return /(商品|产品)/.test(normalizedQuestion) && /(销量|销售数量|卖出多少|卖了多少)/.test(normalizedQuestion);
    case 'inventory_consumption_quantity':
      return /(耗材|物料|产品|商品)/.test(normalizedQuestion) && /(消耗|用量|出库)/.test(normalizedQuestion);
    case 'product_gross_margin_rate':
      return /(产品|商品|货品)/.test(normalizedQuestion) && /(毛利率|利润率)/.test(normalizedQuestion);
    case 'product_below_cost_sale_count':
      return /(产品|商品|货品)/.test(normalizedQuestion) && /(低于成本|亏本)/.test(normalizedQuestion);
    case 'refund_amount':
      return /退款/.test(normalizedQuestion) && /(金额|多少)/.test(normalizedQuestion);
    case 'refund_count':
      return /退款/.test(normalizedQuestion) && /(几笔|笔数|次数)/.test(normalizedQuestion);
    case 'discount_amount':
      return /(折扣|优惠|让利)/.test(normalizedQuestion);
    case 'staff_customer_repurchase_rate':
      return /复购率/.test(normalizedQuestion);
    case 'staff_commission_amount':
      return /提成/.test(normalizedQuestion);
    case 'staff_unique_customer_count':
      return /(接的客人|接客|服务客户)/.test(normalizedQuestion);
    case 'staff_service_count':
      return /(服务次数|服务量)/.test(normalizedQuestion);
    case 'staff_performance_score':
      return /(业绩|表现)/.test(normalizedQuestion);
    case 'new_customer_count':
      return /新客/.test(normalizedQuestion) && /(多少|几个|人数|来了)/.test(normalizedQuestion);
    case 'new_customer_conversion_count':
      return /新客/.test(normalizedQuestion) && /(转化|成交|首单)/.test(normalizedQuestion);
    case 'new_customer_conversion_rate':
      return /新客/.test(normalizedQuestion) && /(转化率|成交率|首单率|转化)/.test(normalizedQuestion);
    case 'customer_complaint_count':
      return /(投诉|客诉|差评|不满|负面反馈)/.test(normalizedQuestion) &&
        !/(?:美容师|员工|谁|哪个|哪位).*(?:投诉|客诉|差评).*(?:最多|排行|排名)/.test(normalizedQuestion);
    case 'customer_unresolved_complaint_count':
      return /(投诉|客诉|不满)/.test(normalizedQuestion) && /(未解决|没解决|待处理|处理中|还有多少)/.test(normalizedQuestion);
    case 'customer_average_satisfaction_rating':
      return /(满意度|满意评价|服务评分|星级|评分)/.test(normalizedQuestion);
    case 'customer_feedback_collection_coverage_rate':
      return /(反馈|评价|满意度)/.test(normalizedQuestion) && /(覆盖率|采集率|整体情况|总体情况)/.test(normalizedQuestion);
    case 'staff_customer_complaint_count':
      return /(美容师|员工|谁|哪个|哪位)/.test(normalizedQuestion) && /(投诉|客诉|差评)/.test(normalizedQuestion);
    case 'customer_long_wait_departure_count':
      return /(等待|排队).*(过久|太久|时间长).*(离开|离店|走了)|等太久.*(?:离开|离店|走了)/.test(normalizedQuestion);
    case 'customer_waiting_collection_coverage_rate':
      return /(等待|排队).*(覆盖率|采集率|记录情况)/.test(normalizedQuestion);
    case 'dormant_reactivation_customer_count':
      return /沉睡客户/.test(normalizedQuestion) && /(?:唤醒|回流).*(?:迹象|信号)|(?:迹象|信号).*(?:唤醒|回流)/.test(normalizedQuestion);
    default:
      return false;
  }
}

function governedDimensionKeyMatchesQuestion(question: string, definitionKey: string): boolean {
  const normalizedQuestion = normalizeSemanticText(question);
  const dimensionKey = definitionKey.replace(/^dimension\./, '');
  if (dimensionKey === 'customerAgeGroup') {
    return /(年龄|年龄段|年龄画像)/.test(normalizedQuestion);
  }
  return false;
}

function selectCapabilityExamples(question: string, examples: readonly string[], limit = 3): string[] {
  if (examples.length <= limit) return [...examples];
  const normalizedQuestion = normalizeSemanticText(question);
  const questionChars = new Set(normalizedQuestion);
  return examples
    .map((example, index) => {
      const normalizedExample = normalizeSemanticText(example);
      const overlap = [...new Set(normalizedExample)].filter((char) => questionChars.has(char)).length;
      const similarity = questionChars.size > 0 ? overlap / questionChars.size : 0;
      const score = normalizedExample === normalizedQuestion
        ? 3
        : normalizedExample.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedExample)
          ? 2
          : similarity;
      return { example, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.example);
}

function extractEntityFieldNames(attributes: unknown): string[] {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return [];
  const record = attributes as Record<string, unknown>;
  const fields = Array.isArray(record.fields)
    ? record.fields.filter((item): item is string => typeof item === 'string')
    : Object.keys(record);
  return [...new Set(fields.filter((field) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field)))].sort();
}

function isCustomerFactSlot(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('customer') || normalized.startsWith('entity.customer');
}

function normalizeIntentKind(intent: BrainSemanticIntent): BrainSemanticIntent['intent'] {
  if (
    intent.intent === 'ranking' &&
    intent.metrics.length === 0 &&
    intent.orderBy.length === 0 &&
    ['list', 'ranking'].includes(intent.answerShape)
  ) {
    return 'query';
  }
  if (intent.intent !== 'query') return intent.intent;
  if (intent.answerShape === 'diagnosis') return 'diagnosis';
  if (intent.answerShape === 'comparison') return 'comparison';
  if (intent.answerShape === 'ranking') return 'ranking';
  if (intent.answerShape === 'trend') return 'trend';
  return intent.intent;
}

function resolveReferencedDefinitionDomains(
  intent: BrainSemanticIntent,
  input: BrainSemanticIntentCompilerInput,
): string[] {
  const definitionKeys = new Set([
    ...intent.metrics.map((ref) => ref.definitionKey),
    ...intent.dimensions.map((ref) => ref.definitionKey),
    ...intent.entities.flatMap((entity) => entity.definitionRef ? [entity.definitionRef.definitionKey] : []),
  ]);
  if (!definitionKeys.size) return [];
  if (input.ontologySnapshot) {
    return [
      ...input.ontologySnapshot.metrics,
      ...input.ontologySnapshot.dimensions,
      ...input.ontologySnapshot.entities,
    ].filter((definition) => definitionKeys.has(definition.definitionKey)).map((definition) => definition.domain);
  }
  return input.ontologyCandidates
    .filter((candidate) => definitionKeys.has(candidate.definitionRef.definitionKey))
    .flatMap((candidate) => candidate.domain ? [candidate.domain] : []);
}

function uniqueSemanticDomains(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
