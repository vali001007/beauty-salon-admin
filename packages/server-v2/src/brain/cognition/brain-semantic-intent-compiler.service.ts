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
  sideEffect?: boolean;
  requiresConfirmation?: boolean;
  riskLevel?: string;
  idempotency?: string;
  grounding?: string;
  definitionRefs?: Array<BrainDefinitionRef<'entity' | 'relation' | 'metric' | 'dimension' | 'action'>>;
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
  preferredCapabilityKey?: string;
  rankedCapabilityKeys?: string[];
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
      selectedCapabilityKey?: string;
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
      const conversationContinuation = this.buildConversationContinuationFastPath(
        input,
        modelContext.conversationSlots,
      );
      if (conversationContinuation) {
        return {
          status: 'completed',
          intent: conversationContinuation,
          provider: 'governed_contract',
          model: 'conversation_continuation_fast_path',
          usage: {
            provider: 'governed_contract',
            model: 'conversation_continuation_fast_path',
            inputTokens: 0,
            outputTokens: 0,
          },
        };
      }
      const financeScalarFastPath = this.buildFinanceScalarCapabilityFastPath(input);
      if (financeScalarFastPath) {
        return {
          status: 'completed',
          intent: financeScalarFastPath,
          selectedCapabilityKey: 'finance_risk_overview',
          provider: 'governed_contract',
          model: 'finance_scalar_fast_path',
          usage: {
            provider: 'governed_contract',
            model: 'finance_scalar_fast_path',
            inputTokens: 0,
            outputTokens: 0,
          },
        };
      }
      const financeOrderProfitFastPath = this.buildFinanceOrderProfitCapabilityFastPath(input);
      if (financeOrderProfitFastPath) {
        return {
          status: 'completed',
          intent: financeOrderProfitFastPath,
          selectedCapabilityKey: 'finance_risk_overview',
          provider: 'governed_contract',
          model: 'finance_order_profit_fast_path',
          usage: {
            provider: 'governed_contract',
            model: 'finance_order_profit_fast_path',
            inputTokens: 0,
            outputTokens: 0,
          },
        };
      }
      const financeStaffCommissionCompositionFastPath =
        this.buildFinanceStaffCommissionCompositionCapabilityFastPath(input);
      if (financeStaffCommissionCompositionFastPath) {
        return {
          status: 'completed',
          intent: financeStaffCommissionCompositionFastPath,
          selectedCapabilityKey: 'finance_risk_overview',
          provider: 'governed_contract',
          model: 'finance_staff_commission_composition_fast_path',
          usage: {
            provider: 'governed_contract',
            model: 'finance_staff_commission_composition_fast_path',
            inputTokens: 0,
            outputTokens: 0,
          },
        };
      }
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
      const customerFactsFastPath = this.buildCustomerFactsCapabilityFastPath(input);
      if (customerFactsFastPath) {
        return {
          status: 'completed',
          intent: customerFactsFastPath,
          selectedCapabilityKey: 'customer_facts',
          provider: 'governed_contract',
          model: 'customer_facts_fast_path',
          usage: {
            provider: 'governed_contract',
            model: 'customer_facts_fast_path',
            inputTokens: 0,
            outputTokens: 0,
          },
        };
      }
      const projectCatalogFastPath = this.buildProjectCatalogCapabilityFastPath(input);
      if (projectCatalogFastPath) {
        return {
          status: 'completed',
          intent: projectCatalogFastPath.intent,
          selectedCapabilityKey: projectCatalogFastPath.selectedCapabilityKey,
          provider: 'governed_contract',
          model: 'project_catalog_fast_path',
          usage: {
            provider: 'governed_contract',
            model: 'project_catalog_fast_path',
            inputTokens: 0,
            outputTokens: 0,
          },
        };
      }
      const metricPhraseFastPath = this.buildMetricPhraseFastPath(input);
      if (metricPhraseFastPath) {
        return {
          status: 'completed',
          intent: metricPhraseFastPath,
          provider: 'governed_contract',
          model: 'metric_phrase_fast_path',
          usage: {
            provider: 'governed_contract',
            model: 'metric_phrase_fast_path',
            inputTokens: 0,
            outputTokens: 0,
          },
        };
      }
      const metricDimensionFastPath = this.buildMetricDimensionFastPath(input);
      if (metricDimensionFastPath) {
        return {
          status: 'completed',
          intent: metricDimensionFastPath,
          provider: 'governed_contract',
          model: 'metric_dimension_fast_path',
          usage: {
            provider: 'governed_contract',
            model: 'metric_dimension_fast_path',
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
          const remainingMs =
            deadlineAt === undefined ? this.config.runtime.modelTimeoutMs : Math.floor(deadlineAt - Date.now());
          if (remainingMs <= 0) {
            throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'Brain semantic intent deadline is exhausted.');
          }
          result = await this.aiService.generateStructured<BrainSemanticIntentModelOutput>({
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

      const normalizedIntent = this.normalizeModelIntent(stripModelCapabilitySelection(result.data), input);
      const selectedCapabilityKey = this.resolveModelSelectedCapabilityKey(
        result.data.selectedCapabilityKey,
        normalizedIntent,
        input,
      );
      return {
        status: 'completed',
        intent: normalizedIntent,
        ...(selectedCapabilityKey ? { selectedCapabilityKey } : {}),
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
          const catalogFallback = this.buildPreferredCapabilityFallback(input);
          if (catalogFallback) {
            return {
              status: 'completed',
              intent: catalogFallback,
              provider: 'governed_contract',
              model: 'capability_catalog_fallback',
              usage: {
                provider: 'governed_contract',
                model: 'capability_catalog_fallback',
                inputTokens: 0,
                outputTokens: 0,
              },
            };
          }
          const definitionFallback = this.buildGovernedDefinitionFallback(input);
          if (definitionFallback) {
            return {
              status: 'completed',
              intent: definitionFallback,
              provider: 'governed_contract',
              model: 'definition_match_fallback',
              usage: {
                provider: 'governed_contract',
                model: 'definition_match_fallback',
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
    const capability = this.orderedCapabilitySummaries(input).find(
      (candidate) =>
        candidate.readOnly &&
        (mode !== 'contract_fast_path' || Boolean(candidate.definitionRefs?.length)) &&
        (candidate.examples ?? []).some(
          (example) => normalizeSemanticText(example) === normalizeSemanticText(input.question),
        ),
    );
    if (!capability) return undefined;
    return this.buildGovernedCapabilityIntent(capability, input, mode);
  }

  private buildConversationContinuationFastPath(
    input: BrainSemanticIntentCompilerInput,
    sanitizedConversationSlots: unknown,
  ): BrainSemanticIntent | undefined {
    const slots = semanticRecord(sanitizedConversationSlots);
    const directives = semanticRecord(slots.turnDirectives);
    const modelContext = semanticRecord(slots.modelContext);
    if (!['continue', 'resolve_pending_or_new'].includes(String(directives.mode))) return undefined;

    const inherit = Array.isArray(directives.inherit)
      ? directives.inherit.filter((slot): slot is string => typeof slot === 'string')
      : [];
    const doNotInherit = Array.isArray(directives.doNotInherit)
      ? directives.doNotInherit.filter((slot): slot is string => typeof slot === 'string')
      : [];
    if (
      !inherit.includes('objective') ||
      !inherit.includes('capability') ||
      doNotInherit.includes('objective') ||
      doNotInherit.includes('capability')
    ) {
      return undefined;
    }

    const capabilityContext = semanticRecord(modelContext.capability);
    const capabilityKey = typeof capabilityContext.key === 'string' ? capabilityContext.key : undefined;
    const capability = capabilityKey
      ? input.capabilitySummaries.find((candidate) => candidate.key === capabilityKey && candidate.readOnly)
      : undefined;
    const objective = typeof modelContext.objective === 'string' ? modelContext.objective.trim() : '';
    if (!capability || !objective) return undefined;

    const replace = semanticRecord(directives.replace);
    const resolve = semanticRecord(directives.resolve);
    const replacementTimeRange = semanticTimeRange(replace.timeRange, input.timezone);
    const comparisonTimeRange = semanticTimeRange(resolve.comparisonTarget, input.timezone);
    const inheritedTimeRange = semanticTimeRange(modelContext.timeRange, input.timezone);
    const namedPeriodComparison =
      /(?:跟|和|与|相比|对比|比较).*(?:双十一|双十二|618|六一八|国庆|春节|五一|劳动节|元旦|中秋|端午|七夕)(?:期间|假期|前后)?/.test(
        input.question,
      );
    const comparisonFollowUp = Boolean(comparisonTimeRange || namedPeriodComparison);
    if (!replacementTimeRange && !comparisonFollowUp) return undefined;
    if (comparisonFollowUp && !inheritedTimeRange) return undefined;

    const metrics = semanticDefinitionRefs(modelContext.metrics, 'metric', input);
    const dimensions = semanticDefinitionRefs(modelContext.dimensions, 'dimension', input);
    const entities = semanticEntities(modelContext.entities, input);
    if (!metrics.length && !dimensions.length && !entities.length) return undefined;

    const missingComparisonTarget = comparisonFollowUp && !comparisonTimeRange;
    const previousIntent = BRAIN_SEMANTIC_INTENTS.includes(modelContext.intent as BrainSemanticIntentKind)
      ? (modelContext.intent as BrainSemanticIntentKind)
      : 'query';
    const previousAnswerShape = BRAIN_SEMANTIC_ANSWER_SHAPES.includes(
      modelContext.answerShape as BrainSemanticAnswerShape,
    )
      ? (modelContext.answerShape as BrainSemanticAnswerShape)
      : 'list';
    return {
      schemaVersion: '1.0',
      objective,
      domains: [...capability.domains],
      intent: comparisonFollowUp ? 'comparison' : previousIntent,
      entities,
      metrics,
      dimensions,
      filters: [],
      ...(comparisonFollowUp
        ? { timeRange: inheritedTimeRange }
        : replacementTimeRange
          ? { timeRange: replacementTimeRange }
          : inheritedTimeRange
            ? { timeRange: inheritedTimeRange }
            : {}),
      ...(comparisonTimeRange ? { comparisonTarget: { type: 'time' as const, timeRange: comparisonTimeRange } } : {}),
      orderBy: [],
      answerShape: comparisonFollowUp ? 'comparison' : previousAnswerShape,
      successCriteria: [
        `沿用上一轮已发布能力 ${capability.key} 的业务对象和指标口径`,
        comparisonFollowUp ? '只调整对比周期，不改写上一轮指标' : '只调整时间范围，不改写上一轮业务目标',
      ],
      ambiguities: missingComparisonTarget
        ? [
            {
              slot: 'comparisonTarget',
              reason: '对比周期只有活动或节假日名称，后台没有可直接采用的正式年份和日期范围',
              candidates: ['指定年份和日期范围', '从已配置活动中选择周期'],
            },
          ]
        : [],
      missingSlots: missingComparisonTarget ? ['comparisonTarget'] : [],
      assumptions: ['本轮沿用上一轮已确认的业务对象、指标和已发布只读能力。'],
      confidence: missingComparisonTarget ? 0.9 : 1,
      decisionSummary: missingComparisonTarget
        ? '已继承上一轮业务目标，但命名活动周期缺少正式日期证据，需要先澄清。'
        : '当前问题只修改上一轮时间范围，使用受控会话合同直接编译。',
    };
  }

  private buildPreferredCapabilityFallback(input: BrainSemanticIntentCompilerInput): BrainSemanticIntent | undefined {
    if (!input.preferredCapabilityKey) return undefined;
    const capability = input.capabilitySummaries.find((candidate) => candidate.key === input.preferredCapabilityKey);
    if (!capability?.readOnly) return undefined;
    return this.buildGovernedCapabilityIntent(capability, input, 'catalog_match');
  }

  private buildCustomerFactsCapabilityFastPath(input: BrainSemanticIntentCompilerInput): BrainSemanticIntent | undefined {
    const capability = input.capabilitySummaries.find(
      (candidate) => candidate.key === 'customer_facts' && candidate.readOnly && candidate.intents.includes('query'),
    );
    if (!capability) return undefined;
    const normalized = input.question.replace(/\s+/gu, '');
    const isMemberLevelCount =
      /(?:有多少|多少(?:个|位|人)?|几(?:个|位|人)?|一共|共有|总数|统计|查询|查一下).*(?:钻石会员|金卡会员|银卡会员|普通会员|会员等级)/u.test(
        normalized,
      ) ||
      /(?:钻石会员|金卡会员|银卡会员|普通会员).*(?:有多少|多少(?:个|位|人)?|几(?:个|位|人)?|一共|共有|总数)/u.test(
        normalized,
      );
    const isVisitedCustomerCount =
      /(?:到店|来店).*(?:客户|客人|会员).*(?:有多少|多少(?:个|位|人)?|几(?:个|位|人)?|一共|共有|总数)/u.test(
        normalized,
      ) ||
      /(?:有多少|多少(?:个|位|人)?|几(?:个|位|人)?|一共|共有|总数).*(?:到店|来店).*(?:客户|客人|会员)/u.test(
        normalized,
      ) ||
      /(?:到店|来店)的(?:客户|客人|会员)有多少/u.test(normalized);
    const isVisitedMemberTierList =
      /(?:到店|来店).*(?:金卡以上|金卡及以上|金卡及其以上|钻石会员|金卡会员)/u.test(normalized) ||
      /(?:金卡以上|金卡及以上|金卡及其以上|钻石会员|金卡会员).*(?:到店|来店)/u.test(normalized);
    const isCardExpiryWithoutReservation =
      /(?:次卡|卡项).*(?:快到期|快过期|即将过期|临期).*(?:还没预约|没有预约|未预约|没预约)/u.test(normalized) ||
      /(?:还没预约|没有预约|未预约|没预约).*(?:次卡|卡项).*(?:快到期|快过期|即将过期|临期)/u.test(
        normalized,
      );
    const isCardHoldersWithoutVisit =
      /(?:办了|持有|开了|有).*(?:次卡|卡项|综合养护20次卡).*(?:没来|没有来|未到店|没到店)/u.test(
        normalized,
      ) || /(?:次卡|卡项|综合养护20次卡).*(?:没来|没有来|未到店|没到店)/u.test(normalized);
    const supported =
      isMemberLevelCount ||
      isVisitedCustomerCount ||
      isVisitedMemberTierList ||
      isCardExpiryWithoutReservation ||
      isCardHoldersWithoutVisit;
    if (!supported) return undefined;
    const timeRange = this.resolveQuestionTimeRange(input.question, input.timezone);
    const customerEntityRef =
      resolveCanonicalDefinitionRef('entity', 'entity.customer', input) ??
      findCapabilityDefinitionRef(capability, 'entity', 'entity.customer');
    const customerLevelDimensionRef =
      resolveCanonicalDefinitionRef('dimension', 'dimension.customerLevel', input) ??
      findCapabilityDefinitionRef(capability, 'dimension', 'dimension.customerLevel');
    const isExplicitList =
      isVisitedMemberTierList ||
      isCardExpiryWithoutReservation ||
      isCardHoldersWithoutVisit ||
      isExplicitListQuestion(input.question);
    const baseIntent: BrainSemanticIntent = {
      schemaVersion: '1.0',
      objective: input.question.trim(),
      domains: ['customer'],
      intent: 'query',
      entities: customerEntityRef
        ? [
            {
              entityType: 'customer',
              mention: /会员/u.test(input.question) ? '会员' : '客户',
              source: 'user',
              definitionRef: customerEntityRef,
              confidence: 1,
            },
          ]
        : [],
      metrics: [],
      dimensions:
        customerLevelDimensionRef && (isMemberLevelCount || isVisitedMemberTierList)
          ? [customerLevelDimensionRef]
          : [],
      filters: [],
      ...(timeRange ? { timeRange } : {}),
      orderBy: [],
      answerShape: isExplicitList ? 'list' : 'scalar',
      successCriteria: ['执行已发布客户事实能力 customer_facts 并返回可追溯结果'],
      ambiguities: [],
      missingSlots: [],
      assumptions: [
        '问题命中客户事实查询的已发布只读交付合同；答案仍必须由客户事实 resolver 查询真实业务数据。',
      ],
      confidence: 1,
      decisionSummary: '客户、会员等级、到店或卡项持有/预约关系均由 customer_facts 能力承接。',
    };
    return {
      ...baseIntent,
      filters:
        isMemberLevelCount && customerLevelDimensionRef
          ? uniqueFilterClauses([...baseIntent.filters, ...inferCustomerLevelFilterClauses(input, baseIntent)])
          : baseIntent.filters,
    };
  }

  private buildProjectCatalogCapabilityFastPath(input: BrainSemanticIntentCompilerInput):
    | {
        selectedCapabilityKey: 'project_service_ranking' | 'project_material_consumption_analysis';
        intent: BrainSemanticIntent;
      }
    | undefined {
    const selectedCapabilityKey = isProjectSpecificBomQuestion(input.question)
      ? 'project_material_consumption_analysis'
      : isProjectServiceSalesQuestion(input.question)
        ? 'project_service_ranking'
        : undefined;
    if (!selectedCapabilityKey) return undefined;
    const capability = this.orderedCapabilitySummaries(input).find(
      (candidate) =>
        candidate.key === selectedCapabilityKey &&
        candidate.readOnly &&
        (candidate.intents.includes('query') ||
          (selectedCapabilityKey === 'project_service_ranking' &&
            candidate.intents.includes('ranking') &&
            isProjectServiceSalesQuestion(input.question))),
    );
    if (!capability) return undefined;
    const timeRange = this.resolveQuestionTimeRange(input.question, input.timezone);
    if (selectedCapabilityKey === 'project_service_ranking' && !timeRange) return undefined;
    const projectRef =
      resolveCanonicalDefinitionRef('entity', 'entity.project', input) ??
      findCapabilityDefinitionRef(capability, 'entity', 'entity.project');
    const productRef =
      selectedCapabilityKey === 'project_material_consumption_analysis'
        ? resolveCanonicalDefinitionRef('entity', 'entity.product', input) ??
          findCapabilityDefinitionRef(capability, 'entity', 'entity.product')
        : undefined;
    const metrics =
      selectedCapabilityKey === 'project_service_ranking'
        ? this.resolveGovernedMetricRefs(['metric.project_service_count'], input)
        : [];
    const normalized = input.question.replace(/\s+/gu, '');
    const asksBomCost =
      selectedCapabilityKey === 'project_material_consumption_analysis' &&
      /(?:BOM|bom|耗材|物料|材料).*(?:成本|多少钱|金额|是多少)/iu.test(normalized);
    return {
      selectedCapabilityKey,
      intent: {
        schemaVersion: '1.0',
        objective: input.question.trim(),
        domains:
          selectedCapabilityKey === 'project_service_ranking'
            ? ['project', 'order']
            : ['project', 'catalog', 'inventory'],
        intent: 'query',
        entities: [
          ...(projectRef
            ? [
                {
                  entityType: 'project',
                  mention: '项目',
                  source: 'user' as const,
                  definitionRef: projectRef,
                  confidence: 1,
                },
              ]
            : []),
          ...(productRef
            ? [
                {
                  entityType: 'product',
                  mention: '耗材',
                  source: 'user' as const,
                  definitionRef: productRef,
                  confidence: 1,
                },
              ]
            : []),
        ],
        metrics,
        dimensions: [],
        filters: [],
        ...(timeRange ? { timeRange } : {}),
        orderBy: [],
        answerShape:
          selectedCapabilityKey === 'project_service_ranking'
            ? 'scalar'
            : asksBomCost
              ? 'scalar'
              : 'list',
        successCriteria: [`执行已发布能力 ${selectedCapabilityKey} 并返回可追溯项目事实`],
        ambiguities: [],
        missingSlots: [],
        assumptions: [
          selectedCapabilityKey === 'project_service_ranking'
            ? `问题要求指定项目销售/服务次数，按能力 ${selectedCapabilityKey} 直接编译；具体项目名由执行器按当前门店 Project 表匹配。`
            : `问题要求指定项目 BOM 明细或 BOM 成本，按能力 ${selectedCapabilityKey} 直接编译；具体项目名由执行器按当前门店 Project 表匹配。`,
        ],
        confidence: 1,
        decisionSummary:
          selectedCapabilityKey === 'project_service_ranking'
            ? `问题中的项目销售/服务次数语义唯一匹配已发布能力 ${selectedCapabilityKey}。`
            : `问题中的项目 BOM/耗材明细语义唯一匹配已发布能力 ${selectedCapabilityKey}。`,
      },
    };
  }

  private orderedCapabilitySummaries(input: BrainSemanticIntentCompilerInput): BrainSemanticCapabilitySummary[] {
    if (!input.preferredCapabilityKey) return input.capabilitySummaries;
    return [...input.capabilitySummaries].sort(
      (left, right) =>
        Number(right.key === input.preferredCapabilityKey) - Number(left.key === input.preferredCapabilityKey),
    );
  }

  private buildFinanceScalarCapabilityFastPath(input: BrainSemanticIntentCompilerInput): BrainSemanticIntent | undefined {
    const cardRecognizedRevenueQuestion = isCardRecognizedRevenueQuestion(normalizeSemanticText(input.question));
    if (
      isExplicitListQuestion(input.question) ||
      (/排行|排名|对比|相比|趋势|走势|分析|诊断|原因|为什么|建议|推荐|写一|文案|提醒|发送|创建|修改|删除|确认/.test(
        input.question,
      ) &&
        !cardRecognizedRevenueQuestion)
    ) {
      return undefined;
    }
    const parsedTime = this.timeRangeParser.parse(input.question);
    if (!parsedTime.range || parsedTime.comparison || parsedTime.unsupportedExpressions.length > 0) return undefined;

    const mentionsDimension = input.dimensionRefs.some((ref) => {
      const definition = input.ontologySnapshot?.dimensions.find((item) => item.definitionKey === ref.definitionKey);
      return Boolean(definition) && definitionMatchesQuestion(input.question, definition!.name, definition!.aliases);
    });
    if (mentionsDimension) return undefined;

    const metricKeys = inferFinanceScalarMetricKeys(input.question);
    if (!metricKeys.length) return undefined;
    const capability = this.orderedCapabilitySummaries(input).find(
      (candidate) =>
        candidate.key === 'finance_risk_overview' &&
        candidate.readOnly &&
        candidate.intents.includes('query'),
    );
    if (!capability) return undefined;
    const timeRange = this.resolveQuestionTimeRange(input.question, input.timezone);
    if (!timeRange) return undefined;
    const metrics = this.resolveGovernedMetricRefs(metricKeys, input);
    if (!metrics.length) return undefined;
    return {
      schemaVersion: '1.0',
      objective: input.question.trim(),
      domains: [...capability.domains],
      intent: 'query',
      entities: [],
      metrics,
      dimensions: [],
      filters: [],
      timeRange,
      orderBy: [],
      answerShape: 'scalar',
      successCriteria: [`执行已发布能力 ${capability.key} 并返回可追溯结果`],
      ambiguities: [],
      missingSlots: [],
      assumptions: [`问题只包含已发布时间范围和财务标量指标，按能力 ${capability.key} 直接编译`],
      confidence: 1,
      decisionSummary: `问题中的财务标量指标唯一匹配已发布能力 ${capability.key}。`,
    };
  }

  private buildMetricPhraseFastPath(input: BrainSemanticIntentCompilerInput): BrainSemanticIntent | undefined {
    if (
      isExplicitScalarQuestion(input.question) ||
      isExplicitListQuestion(input.question) ||
      isExplicitDimensionBreakdownQuestion(input.question) ||
      /排行|排名|对比|相比|趋势|走势|分析|诊断|原因|为什么|建议|推荐|写一|文案|提醒|发送|创建|修改|删除|确认/.test(
        input.question,
      )
    ) {
      return undefined;
    }
    const parsedTime = this.timeRangeParser.parse(input.question);
    if (!parsedTime.range || parsedTime.comparison || parsedTime.unsupportedExpressions.length > 0) return undefined;

    const matchedMetricKeys = new Set(
      input.metricRefs.flatMap((ref) => {
        const definition = input.ontologySnapshot?.metrics.find((item) => item.definitionKey === ref.definitionKey);
        const matched = definition
          ? definitionMatchesQuestion(input.question, definition.name, definition.aliases) ||
            governedMetricKeyMatchesQuestion(input.question, ref.definitionKey)
          : governedMetricKeyMatchesQuestion(input.question, ref.definitionKey);
        return matched ? [ref.definitionKey] : [];
      }),
    );
    if (matchedMetricKeys.size !== 1) return undefined;
    const [metricKey] = [...matchedMetricKeys];

    const mentionsDimension = input.dimensionRefs.some((ref) => {
      const definition = input.ontologySnapshot?.dimensions.find((item) => item.definitionKey === ref.definitionKey);
      return Boolean(definition) && definitionMatchesQuestion(input.question, definition!.name, definition!.aliases);
    });
    if (mentionsDimension) return undefined;

    const capability = this.orderedCapabilitySummaries(input).find(
      (candidate) =>
        candidate.readOnly &&
        candidate.intents.includes('query') &&
        (candidate.definitionRefs ?? []).some(
          (ref) => ref.definitionType === 'metric' && ref.definitionKey === metricKey,
        ),
    );
    return capability ? this.buildGovernedCapabilityIntent(capability, input, 'metric_phrase') : undefined;
  }

  private buildMetricDimensionFastPath(input: BrainSemanticIntentCompilerInput): BrainSemanticIntent | undefined {
    if (
      !isExplicitDimensionBreakdownQuestion(input.question) ||
      /排行|排名|对比|相比|趋势|走势|分析|诊断|原因|为什么|建议|推荐|写一|文案|提醒|发送|创建|修改|删除|确认/.test(
        input.question,
      )
    ) {
      return undefined;
    }
    const parsedTime = this.timeRangeParser.parse(input.question);
    if (!parsedTime.range || parsedTime.comparison || parsedTime.unsupportedExpressions.length > 0) return undefined;

    const matchedDimensions = input.dimensionRefs.flatMap((ref) => {
      const definition = input.ontologySnapshot?.dimensions.find((item) => item.definitionKey === ref.definitionKey);
      const matched = definition
        ? definitionMatchesQuestion(input.question, definition.name, definition.aliases) ||
          governedDimensionKeyMatchesQuestion(input.question, ref.definitionKey)
        : governedDimensionKeyMatchesQuestion(input.question, ref.definitionKey);
      return matched && definition ? [{ ref, definition }] : [];
    });
    if (matchedDimensions.length !== 1) return undefined;
    const [{ ref: dimensionRef, definition: dimensionDefinition }] = matchedDimensions;

    const supportedMetrics = input.metricRefs.flatMap((ref) => {
      const definition = input.ontologySnapshot?.metrics.find((item) => item.definitionKey === ref.definitionKey);
      return definition?.runtimeQuery?.dimensions.includes(dimensionDefinition.dimensionKey)
        ? [{ ref, definition }]
        : [];
    });
    if (supportedMetrics.length !== 1) return undefined;
    const [{ ref: metricRef, definition: metricDefinition }] = supportedMetrics;

    const candidates = this.orderedCapabilitySummaries(input).filter(
      (candidate) =>
        candidate.readOnly &&
        candidate.intents.includes('query') &&
        metricDefinition.runtimeQuery?.capabilityKeys.includes(candidate.key) &&
        (candidate.definitionRefs ?? []).some(
          (ref) => ref.definitionType === 'metric' && ref.definitionKey === metricRef.definitionKey,
        ) &&
        (candidate.definitionRefs ?? []).some(
          (ref) => ref.definitionType === 'dimension' && ref.definitionKey === dimensionRef.definitionKey,
        ),
    );
    const preferred = input.preferredCapabilityKey
      ? candidates.find((candidate) => candidate.key === input.preferredCapabilityKey)
      : undefined;
    const ranked = input.rankedCapabilityKeys
      ?.map((key) => candidates.find((candidate) => candidate.key === key))
      .find((candidate): candidate is BrainSemanticCapabilitySummary => Boolean(candidate));
    const minimumDefinitionRefCount = candidates.length
      ? Math.min(
          ...candidates.map(
            (candidate) =>
              new Set((candidate.definitionRefs ?? []).map((ref) => `${ref.definitionType}:${ref.definitionKey}`)).size,
          ),
        )
      : Number.POSITIVE_INFINITY;
    const minimumSufficientCandidates = candidates.filter(
      (candidate) =>
        new Set((candidate.definitionRefs ?? []).map((ref) => `${ref.definitionType}:${ref.definitionKey}`)).size ===
        minimumDefinitionRefCount,
    );
    const capability =
      preferred ??
      (candidates.length === 1
        ? candidates[0]
        : minimumSufficientCandidates.length === 1
          ? minimumSufficientCandidates[0]
          : ranked);
    if (!capability) return undefined;
    const intent = this.buildGovernedCapabilityIntent(capability, input, 'metric_dimension');
    return intent
      ? {
          ...intent,
          metrics: [copyDefinitionRef(metricRef)],
          dimensions: [copyDefinitionRef(dimensionRef)],
          answerShape: 'list',
          assumptions: [
            `问题只包含已发布时间范围、唯一可执行指标 ${metricRef.definitionKey} 和唯一已发布维度 ${dimensionRef.definitionKey}，按能力 ${capability.key} 直接编译`,
          ],
          decisionSummary: `问题中的指标与维度唯一匹配已发布能力 ${capability.key}。`,
        }
      : undefined;
  }

  private buildFinanceOrderProfitCapabilityFastPath(input: BrainSemanticIntentCompilerInput): BrainSemanticIntent | undefined {
    if (
      !/(?:订单|开卡|卡销售|商品订单|产品订单|项目订单)/.test(input.question) ||
      !/(?:利润|毛利|成本)/.test(input.question)
    ) {
      return undefined;
    }
    if (
      /排行|排名|对比|相比|趋势|走势|原因|为什么|建议|推荐|写一|文案|提醒|发送|创建|修改|删除/.test(
        input.question,
      )
    ) {
      return undefined;
    }
    const parsedTime = this.timeRangeParser.parse(input.question);
    if (!parsedTime.range || parsedTime.comparison || parsedTime.unsupportedExpressions.length > 0) return undefined;

    const capability = this.orderedCapabilitySummaries(input).find(
      (candidate) =>
        candidate.key === 'finance_risk_overview' &&
        candidate.readOnly &&
        candidate.intents.includes('query'),
    );
    const capabilityDomains = capability?.domains ?? ['finance', 'order', 'product_order'];
    const timeRange = this.resolveQuestionTimeRange(input.question, input.timezone);
    if (!timeRange) return undefined;

    const projectOrderQuestion =
      /(?:订单).*(?:利润情况|利润分析)|(?:利润|毛利).*(?:订单)/.test(input.question) &&
      !/(?:每张|哪些|分别|负|开卡订单|商品订单|产品订单)/.test(input.question);
    if (projectOrderQuestion) {
      return {
        schemaVersion: '1.0',
        objective: input.question.trim(),
        domains: [...capabilityDomains],
        intent: 'query',
        entities: [],
        metrics: [],
        dimensions: [],
        filters: [],
        timeRange,
        orderBy: [],
        answerShape: 'scalar',
        successCriteria: ['执行已发布能力 finance_risk_overview 并返回可追溯结果'],
        ambiguities: [],
        missingSlots: [],
        assumptions: ['问题是项目/订单粒度利润查询，按能力 finance_risk_overview 直接编译'],
        confidence: 1,
        decisionSummary: '问题中的项目/订单利润查询唯一匹配已发布能力 finance_risk_overview。',
      };
    }

    const metricKeys = inferFinanceOrderProfitMetricKeys(input.question);
    if (!metricKeys.length) return undefined;
    const metrics = this.resolveGovernedMetricRefs(metricKeys, input);
    return {
      schemaVersion: '1.0',
      objective: input.question.trim(),
      domains: [...capabilityDomains],
      intent: 'query',
      entities: [],
      metrics,
      dimensions: [],
      filters: [],
      timeRange,
      orderBy: [],
      answerShape: /哪些|每张|分别|负/.test(input.question) ? 'list' : 'scalar',
      successCriteria: ['执行已发布能力 finance_risk_overview 并返回可追溯结果'],
      ambiguities: [],
      missingSlots: [],
      assumptions: ['问题只包含已发布时间范围和订单利润指标，按能力 finance_risk_overview 直接编译'],
      confidence: 1,
      decisionSummary: '问题中的订单利润指标唯一匹配已发布能力 finance_risk_overview。',
    };
  }

  private buildFinanceStaffCommissionCompositionCapabilityFastPath(
    input: BrainSemanticIntentCompilerInput,
  ): BrainSemanticIntent | undefined {
    const normalizedQuestion = normalizeSemanticText(input.question);
    if (!isStaffCommissionCompositionQuestion(normalizedQuestion)) return undefined;
    if (
      /排行|排名|对比|相比|趋势|走势|原因|为什么|建议|推荐|写一|文案|提醒|发送|创建|修改|删除/.test(
        input.question,
      )
    ) {
      return undefined;
    }
    const parsedTime = this.timeRangeParser.parse(input.question);
    if (!parsedTime.range || parsedTime.comparison || parsedTime.unsupportedExpressions.length > 0) return undefined;

    const capability = this.orderedCapabilitySummaries(input).find(
      (candidate) =>
        candidate.key === 'finance_risk_overview' &&
        candidate.readOnly &&
        candidate.intents.includes('query'),
    );
    const timeRange = this.resolveQuestionTimeRange(input.question, input.timezone);
    if (!timeRange) return undefined;

    const metrics = this.resolveGovernedMetricRefs(['metric.staff_commission_component_amount'], input);
    if (!metrics.length) return undefined;
    const dimensions = this.resolveGovernedDimensionRefs(['dimension.commissionType'], input);
    return {
      schemaVersion: '1.0',
      objective: input.question.trim(),
      domains: [...new Set([...(capability?.domains ?? ['finance']), 'staff', 'beautician'])],
      intent: 'query',
      entities: [],
      metrics,
      dimensions,
      filters: [],
      timeRange,
      orderBy: [],
      answerShape: 'list',
      successCriteria: ['执行已发布能力 finance_risk_overview 并返回可追溯结果'],
      ambiguities: [],
      missingSlots: [],
      assumptions: ['问题只包含已发布时间范围、指定员工和提成构成指标，按能力 finance_risk_overview 直接编译'],
      confidence: 1,
      decisionSummary: '问题中的员工提成构成唯一匹配已发布能力 finance_risk_overview。',
    };
  }

  private buildGovernedDefinitionFallback(input: BrainSemanticIntentCompilerInput): BrainSemanticIntent | undefined {
    if (isExplicitDimensionBreakdownQuestion(input.question)) {
      const dimensionCapabilities = input.capabilitySummaries.filter((candidate) => {
        if (!candidate.readOnly || !candidate.intents.includes('query')) return false;
        return (candidate.definitionRefs ?? []).some((ref) => {
          if (ref.definitionType !== 'dimension') return false;
          const definition = input.ontologySnapshot?.dimensions.find(
            (item) => item.definitionKey === ref.definitionKey,
          );
          return (
            Boolean(definition) && definitionMatchesQuestion(input.question, definition!.name, definition!.aliases)
          );
        });
      });
      const orderedBySpecificity = [...dimensionCapabilities].sort(
        (left, right) => (left.definitionRefs?.length ?? 0) - (right.definitionRefs?.length ?? 0),
      );
      const selected =
        orderedBySpecificity.length === 1 ||
        (orderedBySpecificity[0]?.definitionRefs?.length ?? 0) < (orderedBySpecificity[1]?.definitionRefs?.length ?? 0)
          ? orderedBySpecificity[0]
          : undefined;
      if (selected) {
        return this.buildGovernedCapabilityIntent(selected, input, 'definition_match');
      }
    }
    if (
      !isExplicitScalarQuestion(input.question) ||
      isExplicitListQuestion(input.question) ||
      /排行|排名|对比|相比|趋势|走势|写一|文案|提醒|发送|创建|修改|删除|确认|推荐|建议/.test(input.question)
    ) {
      return undefined;
    }
    const capabilities = input.capabilitySummaries.filter((candidate) => {
      if (!candidate.readOnly || !candidate.intents.includes('query')) return false;
      const metricRefs = (candidate.definitionRefs ?? []).filter(
        (ref): ref is BrainDefinitionRef<'metric'> => ref.definitionType === 'metric',
      );
      return metricRefs.some((ref) => {
        const definition = input.ontologySnapshot?.metrics.find((item) => item.definitionKey === ref.definitionKey);
        return definition
          ? definitionMatchesQuestion(input.question, definition.name, definition.aliases) ||
              governedMetricKeyMatchesQuestion(input.question, ref.definitionKey)
          : governedMetricKeyMatchesQuestion(input.question, ref.definitionKey);
      });
    });
    if (capabilities.length !== 1) return undefined;
    return this.buildGovernedCapabilityIntent(capabilities[0], input, 'definition_match');
  }

  private buildGovernedCapabilityIntent(
    capability: BrainSemanticCapabilitySummary,
    input: BrainSemanticIntentCompilerInput,
    mode:
      | 'contract_fast_path'
      | 'model_unavailable'
      | 'definition_match'
      | 'catalog_match'
      | 'metric_phrase'
      | 'metric_dimension',
  ): BrainSemanticIntent | undefined {
    const parsedTime = this.timeRangeParser.parse(input.question);
    const intent =
      exactCapabilityIntent(input.question, capability.intents, Boolean(parsedTime.comparison)) ??
      (mode === 'catalog_match' && capability.intents.length === 1
        ? supportedCapabilityIntent(capability.intents[0])
        : undefined);
    if (!intent) return undefined;
    const timeRange = this.resolveQuestionTimeRange(input.question, input.timezone);
    const comparisonTarget =
      intent === 'comparison' ? this.resolveQuestionComparisonTarget(input.question, input.timezone) : undefined;
    const exactDefinitions = this.resolveExactDefinitions(capability, input, intent);
    const governedIntent: BrainSemanticIntent = {
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
        exactDefinitions.dimensions.length === 0 &&
        (exactDefinitions.metrics.length > 0 || isExplicitScalarQuestion(input.question)) &&
        !isExplicitListQuestion(input.question)
          ? 'scalar'
          : exactCapabilityAnswerShape(intent),
      successCriteria: [`执行已发布能力 ${capability.key} 并返回可追溯结果`],
      ambiguities: [],
      missingSlots: [],
      assumptions: [
        ...(intent === 'action' ? ['该能力只生成待确认预览，用户明确确认前不得执行真实业务写入。'] : []),
        mode === 'contract_fast_path'
          ? `问题完全匹配已发布能力 ${capability.key} 的正例合同`
          : mode === 'model_unavailable'
            ? `模型不可用或预算耗尽，按已发布能力 ${capability.key} 的完全匹配示例继续执行`
            : mode === 'catalog_match'
              ? `模型不可用或预算耗尽，按能力目录高置信唯一候选 ${capability.key} 继续执行`
              : mode === 'metric_phrase'
                ? `问题只包含已发布时间范围和唯一业务指标，按能力目录候选 ${capability.key} 直接编译`
                : mode === 'metric_dimension'
                  ? `问题只包含已发布时间范围、唯一业务指标和唯一业务维度，按能力目录候选 ${capability.key} 直接编译`
                  : `模型不可用或预算耗尽，按唯一匹配的已发布业务定义和能力 ${capability.key} 继续执行`,
      ],
      confidence: 1,
      decisionSummary:
        mode === 'definition_match' ||
        mode === 'catalog_match' ||
        mode === 'metric_phrase' ||
        mode === 'metric_dimension'
          ? `问题中的指标只匹配已发布能力 ${capability.key}。`
          : `问题与已发布能力 ${capability.key} 的示例完全匹配。`,
    };
    return {
      ...governedIntent,
      filters: uniqueFilterClauses([
        ...governedIntent.filters,
        ...inferCustomerLevelFilterClauses(input, governedIntent),
      ]),
    };
  }

  private resolveExactDefinitions(
    capability: BrainSemanticCapabilitySummary,
    input: BrainSemanticIntentCompilerInput,
    intent: BrainSemanticIntent['intent'],
  ): Pick<BrainSemanticIntent, 'entities' | 'metrics' | 'dimensions' | 'orderBy'> {
    const refs = capability.definitionRefs ?? [];
    const availableMetrics = refs.flatMap((ref) =>
      ref.definitionType === 'metric' ? [copyDefinitionRef(ref as BrainDefinitionRef<'metric'>)] : [],
    );
    const matchedMetrics = availableMetrics.filter((ref) => {
      const definition = input.ontologySnapshot?.metrics.find((item) => item.definitionKey === ref.definitionKey);
      return definition
        ? definitionMatchesQuestion(input.question, definition.name, definition.aliases) ||
            governedMetricKeyMatchesQuestion(input.question, ref.definitionKey)
        : governedMetricKeyMatchesQuestion(input.question, ref.definitionKey);
    });
    let metrics =
      matchedMetrics.length > 0
        ? matchedMetrics
        : availableMetrics.length === 1 || intent === 'ranking'
          ? availableMetrics
          : [];
    if (matchedMetrics.some((metric) => !metric.definitionKey.includes('collection_coverage_rate'))) {
      metrics = uniqueDefinitionRefs([
        ...metrics,
        ...availableMetrics.filter((metric) => metric.definitionKey.includes('collection_coverage_rate')),
      ]);
    }
    if (intent === 'ranking' && capability.key === 'product_sales_ranking') {
      const preferredKey = /销量|数量|卖得最多/.test(input.question)
        ? 'metric.product_sales_quantity'
        : 'metric.product_sales_amount';
      const preferred = availableMetrics.find((metric) => metric.definitionKey === preferredKey);
      if (preferred) metrics = [preferred];
    }
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
            const definitions =
              input.ontologySnapshot?.dimensions.filter((item) => item.definitionKey === ref.definitionKey) ?? [];
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
    const runtimeDimensionKeys =
      intent === 'ranking' || isExplicitListQuestion(input.question)
        ? metrics.flatMap(
            (metricRef) =>
              input.ontologySnapshot?.metrics.find((metric) => metric.definitionKey === metricRef.definitionKey)
                ?.runtimeQuery?.dimensions ?? [],
          )
        : [];
    const inferredDimensions =
      input.ontologySnapshot?.dimensions
        .filter(
          (dimension) =>
            runtimeDimensionKeys.includes(dimension.dimensionKey) ||
            (runtimeDimensionKeys.length === 0 &&
              entityDefinitions.some((entity) => entity.domain === dimension.domain)),
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
      orderBy:
        (intent === 'ranking' ||
          (capability.key === 'inventory_risk_ranking' && /最紧急|优先级最高/.test(input.question))) &&
        metrics[0]
          ? [{ definitionRef: { ...metrics[0] }, direction: 'desc' }]
          : [],
    };
  }

  private normalizeModelIntent(
    intent: BrainSemanticIntent,
    input: BrainSemanticIntentCompilerInput,
  ): BrainSemanticIntent {
    const canonicalIntent = applyQuestionSpeechActContract(
      hydrateModelIntentDefinitionRefs(intent, input),
      input.question,
    );
    const intentKind = normalizeIntentKind(canonicalIntent);
    const exactCapability = input.capabilitySummaries.find(
      (capability) =>
        capability.intents.includes(intentKind) &&
        (capability.examples ?? []).some(
          (example) => normalizeSemanticText(example) === normalizeSemanticText(input.question),
        ),
    );
    const timeRange = this.resolveQuestionTimeRange(input.question, input.timezone);
    const comparisonTarget =
      intentKind === 'comparison'
        ? (this.resolveQuestionComparisonTarget(input.question, input.timezone) ?? canonicalIntent.comparisonTarget)
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
    // Keep model-invented field refs out of executable plans, but preserve published
    // dimension value filters after rehydrating them from the active snapshot identity.
    const filters: BrainSemanticIntent['filters'] = uniqueFilterClauses([
      ...canonicalIntent.filters.flatMap((filter) => {
        if (filter.fieldRef?.definitionType !== 'dimension') return [];
        const resolved = resolveCanonicalDefinitionRef('dimension', filter.fieldRef.definitionKey, input);
        return resolved ? [{ ...filter, fieldRef: resolved }] : [];
      }),
      ...inferCustomerLevelFilterClauses(input, canonicalIntent),
    ]);
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
        !(ambiguity.slot === 'timeRange' && timeRange) && !(ambiguity.slot === 'comparisonTarget' && comparisonTarget),
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
      missingSlots: inferredOrderBy.length > 0 ? missingSlots.filter((slot) => slot !== 'orderBy') : missingSlots,
    };
  }

  private resolveModelSelectedCapabilityKey(
    value: unknown,
    intent: BrainSemanticIntent,
    input: BrainSemanticIntentCompilerInput,
  ): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    if (intent.intent === 'action' || intent.intent === 'workflow') return undefined;
    const key = value.trim();
    if (!input.rankedCapabilityKeys?.includes(key)) return undefined;
    const capability = input.capabilitySummaries.find((candidate) => candidate.key === key);
    if (!capability?.readOnly || capability.sideEffect || !capability.intents.includes(intent.intent)) return undefined;
    const requestedRefs = [
      ...intent.metrics,
      ...intent.dimensions,
      ...intent.entities.flatMap((entity) => (entity.definitionRef ? [entity.definitionRef] : [])),
    ];
    const publishedRefs = capability.definitionRefs ?? [];
    const coversRequestedDefinitions = requestedRefs.every((requested) =>
      publishedRefs.some(
        (published) =>
          published.definitionType === requested.definitionType &&
          published.definitionKey === requested.definitionKey &&
          published.definitionVersion === requested.definitionVersion &&
          published.definitionFingerprint === requested.definitionFingerprint &&
          published.sourceFingerprint === requested.sourceFingerprint,
      ),
    );
    return coversRequestedDefinitions ? key : undefined;
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

  private resolveGovernedMetricRefs(
    metricKeys: readonly string[],
    input: BrainSemanticIntentCompilerInput,
  ): BrainDefinitionRef<'metric'>[] {
    return uniqueDefinitionRefs(
      metricKeys.flatMap((metricKey) => {
        const direct = input.metricRefs.find((ref) => ref.definitionKey === metricKey);
        if (direct) return [direct];
        const snapshotMetric = input.ontologySnapshot?.metrics.find((metric) => metric.definitionKey === metricKey);
        if (snapshotMetric) return [definitionRef('metric', snapshotMetric)];
        const capabilityMetric = input.capabilitySummaries
          .flatMap((capability) => capability.definitionRefs ?? [])
          .find((ref) => ref.definitionType === 'metric' && ref.definitionKey === metricKey);
        return capabilityMetric ? [copyDefinitionRef(capabilityMetric as BrainDefinitionRef<'metric'>)] : [];
      }),
    );
  }

  private resolveGovernedDimensionRefs(
    dimensionKeys: readonly string[],
    input: BrainSemanticIntentCompilerInput,
  ): BrainDefinitionRef<'dimension'>[] {
    return uniqueDefinitionRefs(
      dimensionKeys.flatMap((dimensionKey) => {
        const direct = input.dimensionRefs.find((ref) => ref.definitionKey === dimensionKey);
        if (direct) return [direct];
        const snapshotDimension = input.ontologySnapshot?.dimensions.find(
          (dimension) => dimension.definitionKey === dimensionKey,
        );
        if (snapshotDimension) return [definitionRef('dimension', snapshotDimension)];
        const capabilityDimension = input.capabilitySummaries
          .flatMap((capability) => capability.definitionRefs ?? [])
          .find((ref) => ref.definitionType === 'dimension' && ref.definitionKey === dimensionKey);
        return capabilityDimension
          ? [copyDefinitionRef(capabilityDimension as BrainDefinitionRef<'dimension'>)]
          : [];
      }),
    );
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
      assertCollectionLimit('ontology.actions', input.ontologySnapshot.actions, MAX_ONTOLOGY_DEFINITIONS);
    }
    const conversationSlots = sanitizeConversationSlots(input.conversationSlots);
    const modelOntologySnapshot = input.ontologySnapshot
      ? selectModelOntologySnapshot(input.ontologySnapshot, input.capabilitySummaries)
      : null;
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
      ontology: modelOntologySnapshot
        ? compressOntologySnapshot(modelOntologySnapshot)
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
        grounding: capability.grounding ?? null,
        definitionRefs: (capability.definitionRefs ?? []).map((ref) =>
          modelDefinitionRef(ref.definitionType, ref.definitionKey),
        ),
        examples: selectCapabilityExamples(question, capability.examples ?? []),
        readOnly: capability.readOnly,
      })),
      ...(input.rankedCapabilityKeys?.length
        ? {
            rankedCapabilityKeys: input.rankedCapabilityKeys.filter((key) =>
              input.capabilitySummaries.some((item) => item.key === key),
            ),
          }
        : {}),
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

type BrainSemanticIntentModelOutput = BrainSemanticIntent & {
  selectedCapabilityKey?: string | null;
};

function stripModelCapabilitySelection(output: BrainSemanticIntentModelOutput): BrainSemanticIntent {
  const intent = { ...output } as BrainSemanticIntentModelOutput;
  delete intent.selectedCapabilityKey;
  return intent as BrainSemanticIntent;
}

function semanticRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function semanticTimeRange(value: unknown, timezone: BrainSupportedTimezone): BrainSemanticTimeRange | undefined {
  const range = semanticRecord(value);
  if (typeof range.label !== 'string' || !range.label.trim()) return undefined;
  const preset = typeof range.preset === 'string' && range.preset.trim() ? range.preset : undefined;
  const startDate =
    typeof range.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(range.startDate) ? range.startDate : undefined;
  const endDate =
    typeof range.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(range.endDate) ? range.endDate : undefined;
  if ((startDate && !endDate) || (!startDate && endDate) || (startDate && endDate && startDate > endDate)) {
    return undefined;
  }
  return {
    label: range.label.trim(),
    timezone,
    ...(preset ? { preset } : {}),
    ...(startDate && endDate ? { startDate, endDate } : {}),
  };
}

function semanticDefinitionRefs<T extends 'metric' | 'dimension'>(
  value: unknown,
  definitionType: T,
  input: BrainSemanticIntentCompilerInput,
): Array<BrainDefinitionRef<T>> {
  if (!Array.isArray(value)) return [];
  return uniqueDefinitionRefs(
    value.flatMap((candidate) => {
      const ref = semanticRecord(candidate);
      if (ref.definitionType !== definitionType || typeof ref.definitionKey !== 'string') return [];
      const resolved = resolveCanonicalDefinitionRef(definitionType, ref.definitionKey, input);
      return resolved ? [resolved] : [];
    }),
  );
}

function semanticEntities(value: unknown, input: BrainSemanticIntentCompilerInput): BrainSemanticIntent['entities'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const entity = semanticRecord(candidate);
    const ref = semanticRecord(entity.definitionRef);
    if (
      typeof entity.entityType !== 'string' ||
      !entity.entityType.trim() ||
      typeof entity.mention !== 'string' ||
      !entity.mention.trim() ||
      ref.definitionType !== 'entity' ||
      typeof ref.definitionKey !== 'string'
    ) {
      return [];
    }
    const resolved = resolveCanonicalDefinitionRef('entity', ref.definitionKey, input);
    if (!resolved) return [];
    return [
      {
        entityType: entity.entityType.trim(),
        ...(typeof entity.entityKey === 'string' && entity.entityKey.trim()
          ? { entityKey: entity.entityKey.trim() }
          : {}),
        mention: entity.mention.trim(),
        source: 'conversation' as const,
        definitionRef: resolved,
        confidence:
          typeof entity.confidence === 'number' && Number.isFinite(entity.confidence)
            ? Math.max(0, Math.min(1, entity.confidence))
            : 1,
      },
    ];
  });
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
    actions: snapshot.actions.map((action) => ({
      definitionRef: modelDefinitionRef('action', action.definitionKey),
      actionKey: action.actionKey,
      name: action.name,
      aliases: [...action.aliases],
      domain: action.domain,
      description: action.description,
      actionClass: action.actionClass,
      targetEntityRefs: [...action.targetEntityRefs],
      inputSlots: action.inputSlots.map((slot) => ({
        slotKey: slot.slotKey,
        label: slot.label,
        semanticRole: slot.semanticRole,
        valueType: slot.valueType,
        ...(slot.entityTypeRef ? { entityTypeRef: slot.entityTypeRef } : {}),
        ...(slot.unitPolicy ? { unitPolicy: slot.unitPolicy } : {}),
        ...(slot.validationPolicy ? { validationPolicy: slot.validationPolicy } : {}),
        ...(slot.defaultPolicy ? { defaultPolicy: slot.defaultPolicy } : {}),
        requiredAt: [...slot.requiredAt],
        cardinality: slot.cardinality,
      })),
      preconditions: [...action.preconditions],
      effects: [...action.effects],
      lexicalFrame: {
        frameKey: action.lexicalFrame.frameKey,
        lexicalUnits: [...action.lexicalFrame.lexicalUnits],
        thematicRoles: action.lexicalFrame.thematicRoles.map((role) => ({
          semanticRole: role.semanticRole,
          slotKeys: [...role.slotKeys],
        })),
        semanticPredicates: [...action.lexicalFrame.semanticPredicates],
        contrasts: action.lexicalFrame.contrasts.map((contrast) => ({
          conceptKey: contrast.conceptKey,
          name: contrast.name,
          discriminators: contrast.discriminators.map((item) => ({ ...item })),
        })),
      },
      situationContext: {
        tenantBoundary: action.situationContext.tenantBoundary,
        requestChannelPolicy: action.situationContext.requestChannelPolicy,
        devicePolicy: action.situationContext.devicePolicy,
        conversationPolicy: action.situationContext.conversationPolicy,
        businessTimePolicy: { ...action.situationContext.businessTimePolicy },
        actorPolicy: { ...action.situationContext.actorPolicy },
      },
      modalityPolicy: {
        supportedModalities: [...action.modalityPolicy.supportedModalities],
        unsupportedModalityPolicy: action.modalityPolicy.unsupportedModalityPolicy,
        confirmationReferencePolicy: action.modalityPolicy.confirmationReferencePolicy,
        schedulePolicy: action.modalityPolicy.schedulePolicy,
        cancellationReferencePolicy: action.modalityPolicy.cancellationReferencePolicy,
      },
      informationArtifact: {
        referencePolicy: action.informationArtifact.referencePolicy,
        artifactTypePolicy: action.informationArtifact.artifactTypePolicy,
        sourcePolicy: action.informationArtifact.sourcePolicy,
        versionPolicy: action.informationArtifact.versionPolicy,
        contentIntegrityPolicy: action.informationArtifact.contentIntegrityPolicy,
        supersessionPolicy: action.informationArtifact.supersessionPolicy,
      },
      sideEffectInvariant: {
        undeclaredSideEffectPolicy: action.sideEffectInvariant.undeclaredSideEffectPolicy,
        gatewayEffectPolicy: action.sideEffectInvariant.gatewayEffectPolicy,
        successEvidencePolicy: action.sideEffectInvariant.successEvidencePolicy,
        partialSuccessPolicy: action.sideEffectInvariant.partialSuccessPolicy,
        recoveryPolicy: action.sideEffectInvariant.recoveryPolicy,
        compensationPolicy: action.sideEffectInvariant.compensationPolicy,
        outcomeObservationPolicy: action.sideEffectInvariant.outcomeObservationPolicy,
      },
      triggeredByEventRefs: [...action.triggeredByEventRefs],
      emitsEventRefs: [...action.emitsEventRefs],
    })),
  };
}

function selectModelOntologySnapshot(
  snapshot: ProductionReadyBusinessDefinitionSnapshot,
  capabilities: readonly BrainSemanticCapabilitySummary[],
): ProductionReadyBusinessDefinitionSnapshot {
  const referenced = new Set(
    capabilities.flatMap((capability) => (capability.definitionRefs ?? []).map((ref) => ref.definitionKey)),
  );
  if (referenced.size === 0) return snapshot;

  const entityDefinitionKeys = new Set<string>();
  const entityKeys = new Set<string>();
  const includeEntity = (value: string) => {
    const entity = snapshot.entities.find(
      (candidate) => candidate.definitionKey === value || candidate.entityKey === value,
    );
    if (!entity) return;
    entityDefinitionKeys.add(entity.definitionKey);
    entityKeys.add(entity.entityKey);
  };

  for (const definitionKey of referenced) {
    if (definitionKey.startsWith('entity.')) includeEntity(definitionKey);
  }
  const selectedActions = snapshot.actions.filter((action) => referenced.has(action.definitionKey));
  for (const action of selectedActions) {
    for (const targetEntityRef of action.targetEntityRefs) includeEntity(targetEntityRef);
  }
  const directlySelectedRelations = snapshot.relations.filter((relation) => referenced.has(relation.definitionKey));
  for (const relation of directlySelectedRelations) {
    includeEntity(relation.fromEntityKey);
    includeEntity(relation.toEntityKey);
  }

  const relations = snapshot.relations.filter(
    (relation) =>
      referenced.has(relation.definitionKey) ||
      (entityKeys.has(relation.fromEntityKey) && entityKeys.has(relation.toEntityKey)),
  );
  return {
    ...snapshot,
    entities: snapshot.entities.filter((entity) => entityDefinitionKeys.has(entity.definitionKey)),
    relations,
    metrics: snapshot.metrics.filter((metric) => referenced.has(metric.definitionKey)),
    dimensions: snapshot.dimensions.filter((dimension) => referenced.has(dimension.definitionKey)),
    actions: selectedActions,
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

function definitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension' | 'action'>(
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

function modelDefinitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension' | 'action'>(
  definitionType: T,
  definitionKey: string,
) {
  return { definitionType, definitionKey };
}

function copyDefinitionRef<T extends 'metric' | 'dimension' | 'entity' | 'relation' | 'action'>(
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

function uniqueDefinitionRefs<T extends 'metric' | 'dimension' | 'entity' | 'relation' | 'action'>(
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
  const normalizedIntent = normalizeModelIntentValue(intent.intent);
  const metrics = intent.metrics.flatMap((ref) => {
    const resolved = resolveCanonicalDefinitionRef('metric', ref?.definitionKey, input);
    return resolved ? [resolved] : [];
  });
  const dimensions = intent.dimensions.flatMap((ref) => {
    const resolved = resolveCanonicalDefinitionRef('dimension', ref?.definitionKey, input);
    return resolved ? [resolved] : [];
  });
  const filters = intent.filters.flatMap((filter) => {
    if (filter.fieldRef?.definitionType !== 'dimension') return [];
    const resolved = resolveCanonicalDefinitionRef('dimension', filter.fieldRef.definitionKey, input);
    return resolved ? [{ ...filter, fieldRef: resolved }] : [];
  });
  const entities = intent.entities.map((entity) => {
    const resolved = entity.definitionRef?.definitionKey
      ? resolveCanonicalDefinitionRef('entity', entity.definitionRef.definitionKey, input)
      : resolveOntologyEntityRef(entity.entityType, input);
    const source = (entity as { source: string }).source === 'question' ? 'user' : entity.source;
    return resolved ? { ...entity, source, definitionRef: resolved } : { ...entity, source, definitionRef: undefined };
  });
  const orderBy = intent.orderBy.flatMap((item) => {
    const type = item.definitionRef?.definitionType;
    if (type !== 'metric' && type !== 'dimension') return [];
    const resolved = resolveCanonicalDefinitionRef(type, item.definitionRef.definitionKey, input);
    return resolved ? [{ ...item, definitionRef: resolved }] : [];
  });
  const actionRef = intent.actionRef?.definitionKey
    ? resolveCanonicalDefinitionRef('action', intent.actionRef.definitionKey, input)
    : undefined;
  const negatedActionRefs = (intent.negatedActionRefs ?? []).map(
    (ref) =>
      resolveCanonicalDefinitionRef('action', ref.definitionKey, input) ??
      ({ ...ref, definitionType: 'action' } as BrainDefinitionRef<'action'>),
  );
  const actionDefinition = actionRef
    ? input.ontologySnapshot?.actions.find((action) => action.definitionKey === actionRef.definitionKey)
    : undefined;
  const actionSlotDefinitions = new Map(actionDefinition?.inputSlots.map((slot) => [slot.slotKey, slot]) ?? []);
  const actionSlots = actionDefinition
    ? (intent.actionSlots ?? []).flatMap((slot) => {
        const definition = actionSlotDefinitions.get(slot.slotKey);
        if (!definition) return [];
        const entityDefinitionRef = slot.entityDefinitionRef?.definitionKey
          ? resolveCanonicalDefinitionRef('entity', slot.entityDefinitionRef.definitionKey, input)
          : undefined;
        return [
          {
            ...slot,
            semanticRole: definition.semanticRole,
            source: (slot as { source: string }).source === 'question' ? ('user' as const) : slot.source,
            ...(entityDefinitionRef ? { entityDefinitionRef } : { entityDefinitionRef: undefined }),
          },
        ];
      })
    : [];
  const isActionSemanticIntent = normalizedIntent === 'action' || normalizedIntent === 'workflow';
  const missingSlots = new Set(intent.missingSlots);
  if (normalizedIntent === 'action' && !actionRef) missingSlots.add('actionDefinition');
  return {
    ...intent,
    schemaVersion: isActionSemanticIntent ? '1.1' : '1.0',
    intent: normalizedIntent,
    answerShape: normalizeModelAnswerShapeValue(intent.answerShape, intent.intent),
    entities,
    metrics,
    dimensions,
    filters,
    orderBy,
    ...(isActionSemanticIntent
      ? {
          ...(actionRef ? { actionRef } : { actionRef: undefined }),
          ...(intent.actionPolarity ? { actionPolarity: intent.actionPolarity } : { actionPolarity: undefined }),
          ...(negatedActionRefs.length > 0 ? { negatedActionRefs } : { negatedActionRefs: undefined }),
          ...(intent.actionModality ? { actionModality: intent.actionModality } : { actionModality: undefined }),
          actionSlots,
        }
      : {
          actionRef: undefined,
          actionPolarity: undefined,
          negatedActionRefs: undefined,
          actionModality: undefined,
          actionSlots: undefined,
        }),
    missingSlots: [...missingSlots],
  };
}

function normalizeModelIntentValue(value: BrainSemanticIntent['intent']): BrainSemanticIntentKind {
  if (typeof value === 'string' && BRAIN_SEMANTIC_INTENTS.includes(value)) return value;
  if (Array.isArray(value)) {
    const candidate = value.find(
      (item): item is BrainSemanticIntentKind =>
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
    ? value.filter(
        (item): item is BrainSemanticAnswerShape =>
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

function resolveCanonicalDefinitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension' | 'action'>(
  definitionType: T,
  definitionKey: string | undefined,
  input: BrainSemanticIntentCompilerInput,
): BrainDefinitionRef<T> | undefined {
  if (!definitionKey) return undefined;
  if (definitionType === 'metric') {
    return input.metricRefs.find((ref) => ref.definitionKey === definitionKey) as BrainDefinitionRef<T> | undefined;
  }
  if (definitionType === 'dimension') {
    const directRef = input.dimensionRefs.find((ref) => ref.definitionKey === definitionKey);
    if (directRef) return directRef as BrainDefinitionRef<T>;
    const capabilityRef = input.capabilitySummaries
      .flatMap((capability) => capability.definitionRefs ?? [])
      .find((ref) => ref.definitionType === 'dimension' && ref.definitionKey === definitionKey);
    return capabilityRef ? (copyDefinitionRef(capabilityRef as BrainDefinitionRef<'dimension'>) as BrainDefinitionRef<T>) : undefined;
  }
  const snapshotDefinitions =
    definitionType === 'entity'
      ? input.ontologySnapshot?.entities
      : definitionType === 'relation'
        ? input.ontologySnapshot?.relations
        : input.ontologySnapshot?.actions;
  const snapshotDefinition = snapshotDefinitions?.find((definition) => definition.definitionKey === definitionKey);
  if (snapshotDefinition) {
    return definitionRef(definitionType, snapshotDefinition) as BrainDefinitionRef<T>;
  }
  const candidate = input.ontologyCandidates.find(
    (item) =>
      item.definitionRef.definitionType === definitionType && item.definitionRef.definitionKey === definitionKey,
  );
  return candidate ? (copyDefinitionRef(candidate.definitionRef) as BrainDefinitionRef<T>) : undefined;
}

function findCapabilityDefinitionRef<T extends 'entity' | 'relation' | 'metric' | 'dimension' | 'action'>(
  capability: BrainSemanticCapabilitySummary,
  definitionType: T,
  definitionKey: string,
): BrainDefinitionRef<T> | undefined {
  const ref = (capability.definitionRefs ?? []).find(
    (item) => item.definitionType === definitionType && item.definitionKey === definitionKey,
  );
  return ref ? (copyDefinitionRef(ref as BrainDefinitionRef<T>) as BrainDefinitionRef<T>) : undefined;
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
    ...(/(?:创建|新建|新增|添加|修改|更新|取消|核销|扣次|退款|发送|群发|发放|发布|保存|记录|提交|下单|采购|调货|充值|确认)/.test(
      question,
    )
      ? ['action' as const]
      : []),
    ...(/排行|排名|(?:谁|哪个|哪种|哪类|何种).*(?:最高|最多|最好)|(?:最高|最多|最好)(?:的)?(?:前\s*\d+)?|前\s*\d+|(?:各|每个).*(?:项目|员工|美容师|产品|商品).*(?:毛利|利润|成本|业绩|销售|消耗)/.test(
      question,
    )
      ? ['ranking' as const]
      : []),
    ...(hasTimeComparison || /对比|相比|跟.*比|和.*比|差多少/.test(question) ? ['comparison' as const] : []),
    ...(/趋势|走势|每天|近三天|最近三天/.test(question) ? ['trend' as const] : []),
    ...(/怎么样|情况|风险|分析|概览|总结|异常|不正常|原因|为什么|下降|变差|不赚钱|根因|活动.*花了多少钱.*(?:收入|营收)/.test(
      question,
    )
      ? ['diagnosis' as const]
      : []),
    ...(/建议|推荐|适合/.test(question) ? ['recommendation' as const] : []),
    'query',
  ];
  return candidates.find((intent) => allowed.has(intent));
}

function supportedCapabilityIntent(value: string | undefined): BrainSemanticIntent['intent'] | undefined {
  return BRAIN_SEMANTIC_INTENTS.includes(value as BrainSemanticIntent['intent'])
    ? (value as BrainSemanticIntent['intent'])
    : undefined;
}

function exactCapabilityAnswerShape(intent: BrainSemanticIntent['intent']): BrainSemanticIntent['answerShape'] {
  if (intent === 'action') return 'action_preview';
  if (intent === 'ranking') return 'ranking';
  if (intent === 'comparison') return 'comparison';
  if (intent === 'trend') return 'trend';
  if (intent === 'diagnosis' || intent === 'recommendation') return 'diagnosis';
  return 'list';
}

function isExplicitListQuestion(question: string) {
  return /(哪些|哪几|名单|列表|列出|找出|分别是谁|都有谁|最紧急的是什么|缺货最紧急)/.test(question);
}

function applyQuestionSpeechActContract(intent: BrainSemanticIntent, question: string): BrainSemanticIntent {
  const text = question.normalize('NFKC').trim();
  const automationDiagnosis = /^(?:如何|怎么).*(?:系统)?自动.*(?:识别|判断|分析).*(?:提醒|通知|跟进)/.test(text);
  if (automationDiagnosis) {
    return { ...intent, intent: 'diagnosis', answerShape: 'diagnosis' };
  }
  const automationAction = /(?:我想|帮我|能不能|请).*(?:系统)?自动.*(?:发|发送|提醒|通知|推送|升级|触发)/.test(text);
  if (automationAction) {
    return { ...intent, intent: 'action', answerShape: 'action_preview' };
  }
  if (/(?:设置|创建|新建|做一个).*(?:自动|规则|流程)/.test(text)) {
    return { ...intent, intent: 'draft', answerShape: 'draft', metrics: [], dimensions: [], orderBy: [] };
  }
  const draftRequest =
    /(?:帮我|请|给).*(?:设计|策划|写|生成|拟).*(?:方案|活动|礼包|欢迎词|文案|话术|提醒|消息)/.test(text) ||
    /(?:如何|怎么).*(?:设计|策划).*(?:方案|活动)/.test(text) ||
    /(?:储值赠送方案).*(?:比例|定在)|(?:客户生命周期).*(?:运营方案)/.test(text);
  if (draftRequest) {
    return {
      ...intent,
      intent: 'draft',
      answerShape: 'draft',
      metrics: [],
      dimensions: [],
      orderBy: [],
    };
  }
  return intent;
}

function isExplicitScalarQuestion(question: string) {
  return /(?:多少|多少钱|几笔|几个|占比|比例|分别多少|到多少|是多少)/.test(question);
}

function isProjectServiceSalesQuestion(question: string) {
  const normalized = question.replace(/\s+/gu, '');
  const projectSignal = /(?:项目|护理|SPA|spa|管理|养护|修护|提拉|焕肤|清洁|舒缓|净透|淡斑)/u.test(normalized);
  const serviceSalesSignal =
    /(?:卖了多少|卖出多少|卖了几|卖出几|销量|销售数量|服务次数|做了多少次|做了几次)/u.test(normalized);
  const productSignal = /(?:商品|产品|货品)/u.test(normalized) && !/(?:项目|护理|SPA|spa)/u.test(normalized);
  const materialSignal = /(?:BOM|bom|耗材|物料|材料)/iu.test(normalized);
  const aggregateSignal = /(?:各项目|每个项目|所有项目|全店|哪个项目|哪些项目|排行|排名|最多|最少|最高|最低|前\d+|top\d+)/iu.test(
    normalized,
  );
  return projectSignal && serviceSalesSignal && !productSignal && !materialSignal && !aggregateSignal;
}

function isProjectSpecificBomQuestion(question: string) {
  const normalized = question.replace(/\s+/gu, '');
  const bomSignal =
    /(?:BOM|bom).*(?:成本|清单|明细|用到|包含|需要)|(?:用到|需要|包含|配置|配了|有哪些).*(?:耗材|物料|材料|产品|商品)|(?:耗材|物料|材料|产品|商品).*(?:清单|有哪些|用到|需要)/iu.test(
      normalized,
    );
  const projectSignal = /(?:项目|护理|SPA|spa|管理|养护|修护|提拉|焕肤|清洁|舒缓|净透|淡斑)/u.test(normalized);
  const aggregateQuestion =
    /(?:各项目|每个项目|所有项目|全店|哪个项目|哪些项目|排行|排名|最高|最多|最低|实际消耗|消耗最多|消耗排行)/u.test(
      normalized,
    );
  return projectSignal && bomSignal && !aggregateQuestion;
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

function isOntologyTypeKey(entityKey: string, definitionKey: string, input: BrainSemanticIntentCompilerInput): boolean {
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
  const snapshotMatches =
    input.ontologySnapshot?.entities.filter((entity) =>
      [entity.entityKey, entity.name, ...entity.aliases].some(
        (value) => normalizeSemanticText(value) === normalizedType,
      ),
    ) ?? [];
  if (snapshotMatches.length === 1) return definitionRef('entity', snapshotMatches[0]);
  const candidateMatches = input.ontologyCandidates.filter(
    (candidate) =>
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
  return value
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function inferCustomerLevelFilterClauses(
  input: BrainSemanticIntentCompilerInput,
  intent: BrainSemanticIntent,
): BrainSemanticIntent['filters'] {
  if (intent.filters.some((filter) => filter.fieldRef?.definitionKey === 'dimension.customerLevel')) return [];
  if (!input.question.includes('会员')) return [];
  const customerLevel = extractExplicitCustomerLevelValue(input.question);
  if (!customerLevel) return [];
  const customerFactsCapability = input.capabilitySummaries.find(
    (candidate) =>
      candidate.key === 'customer_facts' &&
      candidate.readOnly &&
      candidate.intents.includes('query') &&
      (candidate.definitionRefs ?? []).some(
        (ref) => ref.definitionType === 'dimension' && ref.definitionKey === 'dimension.customerLevel',
      ),
  );
  if (!customerFactsCapability) return [];
  const dimensionRef = resolveCanonicalDefinitionRef('dimension', 'dimension.customerLevel', input);
  if (!dimensionRef) return [];
  return [{ fieldRef: dimensionRef, operator: 'eq', value: customerLevel }];
}

function extractExplicitCustomerLevelValue(question: string): string | undefined {
  const normalized = question.replace(/\s+/gu, '');
  if (/钻石会员/u.test(normalized) && !/(?:钻石会员以上|钻石会员及以上|钻石会员及其以上)/u.test(normalized)) {
    return '钻石会员';
  }
  const patterns = [
    /(?:会员等级|等级)(?:为|是|=|：|:)?([\p{Script=Han}A-Za-z0-9]{1,12})/u,
    /(?:多少(?:个|位)?|几(?:个|位)?|统计|查询|查一下|列出|哪些|一共有(?:多少(?:个|位)?)?)([\p{Script=Han}A-Za-z0-9]{1,12})会员/u,
    /^([\p{Script=Han}A-Za-z0-9]{1,12})会员(?:有多少|多少|名单|客户|顾客|一共|总数)/u,
    /(?:高等级|VIP|会员等级)\s*([\p{Script=Han}A-Za-z0-9]{1,12})/u,
  ];
  const rawValue = patterns.map((pattern) => normalized.match(pattern)?.[1]).find((value) => Boolean(value));
  if (!rawValue) return undefined;
  const value = rawValue.replace(/(?:客户|顾客|会员)$/u, '');
  if (!value || /^(?:客户|顾客|会员|个|位|等级|会员等级|高等级|VIP|vip)$/u.test(value)) return undefined;
  return value;
}

function uniqueFilterClauses(filters: BrainSemanticIntent['filters']): BrainSemanticIntent['filters'] {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    const key = `${filter.fieldRef.definitionType}:${filter.fieldRef.definitionKey}:${filter.operator}:${JSON.stringify(filter.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferFinanceScalarMetricKeys(question: string): string[] {
  const normalized = question.replace(/\s+/gu, '');
  const inferred = new Set<string>();
  if (/收银(?:班次)?(?:对平|对账)|(?:对平|对账)了?吗/u.test(normalized)) {
    inferred.add('metric.cash_shift_reconciliation_rate');
  }
  if (
    /(?:储值|会员卡|会员余额|储值余额).*(?:负债|未履约|余额|总额|总计|合计)/u.test(normalized) &&
    !/(?:撑住|集中消费|都来消费|偿付压力)/u.test(normalized)
  ) {
    inferred.add('metric.stored_value_liability');
  }
  if (/(?:次卡|套餐卡|卡项).*(?:未履约|未核销|负债)/u.test(normalized)) {
    inferred.add('metric.unfulfilled_card_liability');
  }
  if (isCardRecognizedRevenueQuestion(normalized)) {
    inferred.add('metric.card_recognized_revenue_amount');
  }
  if (/经营利润|营业利润/u.test(normalized)) {
    inferred.add('metric.operating_profit_amount');
  }
  if (/成本(?:占|\/|比).*收入|收入.*成本(?:占|\/|比)|成本收入比/u.test(normalized)) {
    inferred.add('metric.cost_income_ratio');
  }
  if (/毛利(?!率)/u.test(normalized) && !/(?:订单|项目|产品|商品|货品|开卡|卡销售)/u.test(normalized)) {
    inferred.add('metric.gross_profit_amount');
  }
  if (/毛利率/u.test(normalized) && !/(?:订单|项目|产品|商品|货品)/u.test(normalized)) {
    inferred.add('metric.gross_margin_rate');
  }
  return [...inferred];
}

function inferFinanceOrderProfitMetricKeys(question: string): string[] {
  const normalized = question.replace(/\s+/gu, '');
  const inferred = new Set<string>();
  if (/哪些订单毛利为负|毛利为负|负毛利/u.test(normalized)) {
    inferred.add('metric.negative_margin_order_count');
  }
  if (/每张订单|分别多少/u.test(normalized) && /毛利/u.test(normalized)) {
    inferred.add('metric.order_gross_profit_amount');
  }
  if (/(?:订单).*(?:成本和毛利|毛利和成本)|(?:产品|商品)订单.*(?:成本和毛利|毛利和成本)/u.test(normalized)) {
    inferred.add('metric.product_order_total_cost_amount');
    inferred.add('metric.product_order_gross_profit_amount');
  }
  if (/开卡订单|次卡订单|套餐卡订单/u.test(normalized)) {
    inferred.add('metric.prepaid_order_gross_profit_amount');
  }
  return [...inferred];
}

function isCardRecognizedRevenueQuestion(normalizedQuestion: string): boolean {
  return (
    /(?:次卡|套餐卡|卡项).*(?:核销.*(?:确认.*收入|收入确认)|确认.*收入|收入确认|确认收入进度)/u.test(
      normalizedQuestion,
    ) ||
    /(?:核销.*(?:确认.*收入|收入确认)|确认.*收入|收入确认|确认收入进度).*(?:次卡|套餐卡|卡项)/u.test(
      normalizedQuestion,
    )
  );
}

function definitionMatchesQuestion(question: string, name: string, aliases: readonly string[] = []): boolean {
  const normalizedQuestion = normalizeSemanticText(question);
  return [name, ...aliases]
    .map(normalizeSemanticText)
    .filter((value) => value.length >= 2)
    .some((value) => normalizedQuestion.includes(value));
}

function isExplicitDimensionBreakdownQuestion(question: string): boolean {
  return /拆分|构成|分布|占比|各(?:有|是|多少)|分别.*(?:多少|金额|笔数|情况)|按.+(?:分|看)/.test(question);
}

function governedMetricKeyMatchesQuestion(question: string, definitionKey: string): boolean {
  const normalizedQuestion = normalizeSemanticText(question);
  const metricKey = definitionKey.replace(/^metric\./, '');
  switch (metricKey) {
    case 'gross_profit_amount':
      return (
        /毛利(?!率)/.test(normalizedQuestion) &&
        !/(?:订单|项目|产品|商品|货品|开卡|卡销售)/.test(normalizedQuestion)
      );
    case 'gross_margin_rate':
      return /毛利率/.test(normalizedQuestion) && !/(?:订单|项目|产品|商品|货品)/.test(normalizedQuestion);
    case 'operating_profit_amount':
      return /经营利润|营业利润/.test(normalizedQuestion);
    case 'cost_income_ratio':
      return /成本(?:占|\/|比).*收入|收入.*成本(?:占|\/|比)|成本收入比/.test(normalizedQuestion);
    case 'cash_shift_reconciliation_rate':
      return /收银(?:班次)?(?:对平|对账)|(?:对平|对账)了?吗/.test(normalizedQuestion);
    case 'stored_value_liability':
      return (
        /(?:储值|会员卡|会员余额|储值余额).*(?:负债|未履约|余额|总额|总计|合计)/.test(normalizedQuestion) &&
        !/(?:撑住|集中消费|都来消费|偿付压力)/.test(normalizedQuestion)
      );
    case 'unfulfilled_card_liability':
      return /(?:次卡|套餐卡|卡项).*(?:未履约|未核销|负债)/.test(normalizedQuestion);
    case 'card_recognized_revenue_amount':
      return isCardRecognizedRevenueQuestion(normalizedQuestion);
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
    case 'staff_commission_component_amount':
      return isStaffCommissionCompositionQuestion(normalizedQuestion);
    case 'staff_commission_amount':
      return /提成/.test(normalizedQuestion) && !isStaffCommissionCompositionQuestion(normalizedQuestion);
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
      return (
        /(投诉|客诉|差评|不满|负面反馈)/.test(normalizedQuestion) &&
        !/(?:美容师|员工|谁|哪个|哪位).*(?:投诉|客诉|差评).*(?:最多|排行|排名)/.test(normalizedQuestion)
      );
    case 'customer_unresolved_complaint_count':
      return (
        /(投诉|客诉|不满)/.test(normalizedQuestion) && /(未解决|没解决|待处理|处理中|还有多少)/.test(normalizedQuestion)
      );
    case 'customer_average_satisfaction_rating':
      return /(满意度|满意评价|服务评分|星级|评分)/.test(normalizedQuestion);
    case 'customer_feedback_collection_coverage_rate':
      return (
        /(反馈|评价|满意度)/.test(normalizedQuestion) && /(覆盖率|采集率|整体情况|总体情况)/.test(normalizedQuestion)
      );
    case 'staff_customer_complaint_count':
      return /(美容师|员工|谁|哪个|哪位)/.test(normalizedQuestion) && /(投诉|客诉|差评)/.test(normalizedQuestion);
    case 'customer_long_wait_departure_count':
      return /(等待|排队).*(过久|太久|时间长).*(离开|离店|走了)|等太久.*(?:离开|离店|走了)/.test(normalizedQuestion);
    case 'customer_waiting_collection_coverage_rate':
      return /(等待|排队).*(覆盖率|采集率|记录情况)/.test(normalizedQuestion);
    case 'dormant_reactivation_customer_count':
      return (
        /沉睡客户/.test(normalizedQuestion) &&
        /(?:唤醒|回流).*(?:迹象|信号)|(?:迹象|信号).*(?:唤醒|回流)/.test(normalizedQuestion)
      );
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
  if (dimensionKey === 'paymentMethod') {
    return /(支付方式|收款方式|付款方式|支付渠道|收款渠道)/.test(normalizedQuestion);
  }
  if (dimensionKey === 'commissionType') {
    return isStaffCommissionCompositionQuestion(normalizedQuestion);
  }
  return false;
}

function isStaffCommissionCompositionQuestion(normalizedQuestion: string): boolean {
  return (
    /提成/.test(normalizedQuestion) &&
    (/(?:构成|组成|拆分|分布|来源|结构|类型|分类)/.test(normalizedQuestion) ||
      /(?:项目|服务).*(?:产品|商品)|(?:产品|商品).*(?:项目|服务)/.test(normalizedQuestion))
  );
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
      const score =
        normalizedExample === normalizedQuestion
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
    ...intent.entities.flatMap((entity) => (entity.definitionRef ? [entity.definitionRef.definitionKey] : [])),
    ...(intent.actionRef ? [intent.actionRef.definitionKey] : []),
  ]);
  if (!definitionKeys.size) return [];
  if (input.ontologySnapshot) {
    return [
      ...input.ontologySnapshot.metrics,
      ...input.ontologySnapshot.dimensions,
      ...input.ontologySnapshot.entities,
      ...input.ontologySnapshot.actions,
    ]
      .filter((definition) => definitionKeys.has(definition.definitionKey))
      .map((definition) => definition.domain);
  }
  return input.ontologyCandidates
    .filter((candidate) => definitionKeys.has(candidate.definitionRef.definitionKey))
    .flatMap((candidate) => (candidate.domain ? [candidate.domain] : []));
}

function uniqueSemanticDomains(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
