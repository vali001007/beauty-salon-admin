import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import { AskDataClarificationPolicy } from './ask-data-clarification-policy.js';
import type { AskDataFreeSqlContext, AskDataSemanticIntent, AskDataSemanticRouteMode } from './ask-data-free-sql.types.js';
import { AskDataIntentParser } from './ask-data-intent-parser.js';
import { ASK_DATA_SEMANTIC_CONTRACTS } from './ask-data-semantic-contracts.js';
import { hasExplicitMetricCombination, rankAskDataSemanticIndex } from './ask-data-semantic-index.js';

export type AskDataSemanticRouterConfig = {
  enabled: boolean;
  shadow: boolean;
  modelFallback: boolean;
  minConfidence: number;
};

export type AskDataSemanticRouteResult = {
  semanticIntent: AskDataSemanticIntent;
  candidateViews: ReadOnlySqlView[];
  deterministicCandidateViews: ReadOnlySqlView[];
  routeMode: AskDataSemanticRouteMode;
  permissionDenied: boolean;
  clarificationQuestion?: string;
  clarificationReason?: string;
  fallbackReason?: string;
  deterministicLatencyMs: number;
  modelFallbackLatencyMs?: number;
};

type ModelRouteDecision = {
  intent: AskDataSemanticIntent['intent'];
  answerShape: AskDataSemanticIntent['answerShape'];
  metricKeys: string[];
  viewNames: string[];
  confidence: number;
  ambiguitySlot: string;
  clarificationQuestion: string;
};

@Injectable()
export class AskDataSemanticRouter {
  constructor(
    private readonly aiService: AiService,
    private readonly parser: AskDataIntentParser,
    private readonly clarificationPolicy: AskDataClarificationPolicy,
  ) {}

  async route(input: {
    question: string;
    context: Pick<AskDataFreeSqlContext, 'permissions' | 'deniedPermissions' | 'userId' | 'storeId'>;
    authorizedViews: ReadOnlySqlView[];
    config?: AskDataSemanticRouterConfig;
  }): Promise<AskDataSemanticRouteResult> {
    const startedAt = Date.now();
    const config = input.config ?? askDataSemanticRouterConfig();
    const parsed = this.parser.parse(input.question);
    const authorizedByName = new Map(input.authorizedViews.map((view) => [view.viewName, view]));
    const rankedIndex = rankAskDataSemanticIndex({
      question: input.question,
      parsed,
      authorizedViews: input.authorizedViews,
      maxCandidates: 8,
    });
    const matchedViewNames = parsed.matchedContracts.flatMap((item) => [
      item.contract.preferredView,
      ...(item.contract.fallbackViews ?? []),
      ...(item.contract.supportingViews ?? []),
    ]);
    const explicitCombination = hasExplicitMetricCombination(input.question, parsed.semanticIntent.answerShape);
    const indexConfidence = semanticIndexConfidence(rankedIndex);
    const strongIndexMatches = rankedIndex.filter((item) =>
      item.positiveSignals.some((signal) => signal === 'intent_parser' || signal === 'governed_override'),
    );
    const rawGovernedMetricMatches = strongIndexMatches.length ? strongIndexMatches : rankedIndex.slice(0, 1);
    const balanceCardCombination = /(?:现金|赠送|储值)?余额.*(?:且|并且|同时|还).*(?:未用|没用).*次卡/.test(input.question);
    const customerRiskProfileSummary = /没到店.*高价值.*高流失风险/.test(input.question);
    const promotionOfferSubmetrics = /(?:优惠|优惠券|促销|折扣).*?(?:发放|使用|核销)/.test(input.question)
      && rawGovernedMetricMatches.some((item) => item.contract.metricKey === 'promotion_offer');
    const governedMetricMatches = balanceCardCombination
      ? rawGovernedMetricMatches.filter((item) => ['customer_balance', 'card_assets'].includes(item.contract.metricKey))
      : customerRiskProfileSummary
        ? rawGovernedMetricMatches.filter((item) => item.contract.metricKey === 'customer_profile')
      : promotionOfferSubmetrics
        ? rawGovernedMetricMatches.filter((item) => item.contract.metricKey === 'promotion_offer')
      : /预约密度.*(?:空位|空档)/.test(input.question)
      ? rawGovernedMetricMatches.filter((item) => item.contract.metricKey === 'appointment_gap')
      : /排班.*预约.*空闲分钟|每位员工.*(?:排班|空闲分钟)/.test(input.question)
      && rawGovernedMetricMatches.some((item) => item.contract.metricKey === 'staff_capacity')
        ? rawGovernedMetricMatches.filter((item) => item.contract.metricKey !== 'reservation_metrics')
      : /(?:员工|美容师).*服务次数|服务次数.*(?:员工|美容师)/.test(input.question)
      && rawGovernedMetricMatches.some((item) => item.contract.metricKey === 'staff_performance')
      ? rawGovernedMetricMatches.filter((item) => item.contract.metricKey !== 'project_sales')
      : rawGovernedMetricMatches;
    const semanticIntent: AskDataSemanticIntent = {
      ...parsed.semanticIntent,
      metricKeys: governedMetricMatches.length
        ? governedMetricMatches.slice(0, explicitCombination ? 4 : 1).map((item) => item.contract.metricKey)
        : parsed.semanticIntent.metricKeys,
      assumptions: [
        ...parsed.semanticIntent.assumptions,
        ...governedMetricMatches.slice(0, explicitCombination ? 4 : 1).flatMap((item) => item.contract.defaultAssumptions),
      ].filter((value, index, values) => values.indexOf(value) === index),
      confidence: Math.max(parsed.semanticIntent.confidence, indexConfidence),
    };
    const effectiveCombination = explicitCombination && !customerRiskProfileSummary;
    const deterministicIndexMatches = effectiveCombination ? governedMetricMatches.slice(0, 4) : governedMetricMatches.slice(0, 1);
    const deterministicCandidates = deterministicIndexMatches
      .flatMap((item) => [
        item.view,
        ...(item.contract.supportingViews ?? [])
          .map((viewName) => authorizedByName.get(viewName))
          .filter((view): view is ReadOnlySqlView => Boolean(view)),
      ])
      .filter((view, index, values) => values.findIndex((item) => item.viewName === view.viewName) === index)
      .slice(0, effectiveCombination ? 4 : 2);
    const selectedRequiredViewNames = deterministicIndexMatches.flatMap((item) => [
      item.contract.preferredView,
      ...(item.contract.supportingViews ?? []),
    ]);
    const permissionDenied =
      (matchedViewNames.length > 0 && deterministicCandidates.length === 0)
      || selectedRequiredViewNames.some((viewName) => !authorizedByName.has(viewName));
    const clarification = this.clarificationPolicy.inspect(semanticIntent);
    const deterministicLatencyMs = Date.now() - startedAt;
    if (permissionDenied || clarification.required) {
      return {
        semanticIntent,
        candidateViews: permissionDenied ? [] : deterministicCandidates,
        deterministicCandidateViews: deterministicCandidates,
        routeMode: 'deterministic',
        permissionDenied,
        ...(clarification.question ? { clarificationQuestion: clarification.question } : {}),
        ...(clarification.reason ? { clarificationReason: clarification.reason } : {}),
        deterministicLatencyMs,
      };
    }

    const conflictingMetrics = hasMetricConflict(rankedIndex) && !explicitCombination;
    const fallbackReason = !rankedIndex.length
      ? 'metric_not_deterministically_matched'
      : conflictingMetrics
        ? 'metric_conflict'
        : semanticIntent.confidence < config.minConfidence && !(explicitCombination && deterministicCandidates.length >= 2)
          ? 'low_confidence'
          : undefined;
    if (!fallbackReason || !config.modelFallback) {
      return {
        semanticIntent,
        candidateViews: deterministicCandidates,
        deterministicCandidateViews: deterministicCandidates,
        routeMode: 'deterministic',
        permissionDenied: false,
        ...(fallbackReason ? { fallbackReason } : {}),
        deterministicLatencyMs,
      };
    }

    const fallbackPool = rankedIndex.length
      ? rankedIndex.map((item) => item.view)
      : this.defaultFallbackPool(input.authorizedViews);
    if (!fallbackPool.length) {
      return {
        semanticIntent,
        candidateViews: [],
        deterministicCandidateViews: deterministicCandidates,
        routeMode: 'deterministic',
        permissionDenied: false,
        clarificationQuestion: '请补充要查询的经营指标，例如营业额、项目销量、库存或客户情况。',
        clarificationReason: fallbackReason,
        fallbackReason,
        deterministicLatencyMs,
      };
    }

    const modelStartedAt = Date.now();
    try {
      const messages = buildSemanticRouteMessages({
        question: input.question,
        intent: semanticIntent,
        candidateViews: fallbackPool,
        metricKeys: metricKeysForViews(fallbackPool),
      });
      const decision = await this.aiService.generateStructured<ModelRouteDecision>({
        scenario: 'ask_data_semantic_route',
        messages,
        allowFallback: true,
        fallbackMessages: messages,
        schema: semanticRouteSchema(
          metricKeysForViews(fallbackPool),
          fallbackPool.map((view) => view.viewName),
          [],
        ),
        timeoutMs: 5000,
        temperature: 0,
        userId: input.context.userId,
        storeId: input.context.storeId,
      });
      const normalized = normalizeModelDecision(decision.data, fallbackPool, metricKeysForViews(fallbackPool), []);
      const chosen = [
        ...normalized.viewNames,
        ...normalized.metricKeys.flatMap((metricKey) =>
          ASK_DATA_SEMANTIC_CONTRACTS.find((contract) => contract.metricKey === metricKey)?.supportingViews ?? [],
        ),
      ]
        .map((viewName) => authorizedByName.get(viewName))
        .filter((view): view is ReadOnlySqlView => Boolean(view))
        .filter((view, index, values) => values.findIndex((item) => item.viewName === view.viewName) === index)
        .slice(0, 4);
      if (!chosen.length) {
        return {
          semanticIntent,
          candidateViews: deterministicCandidates,
          deterministicCandidateViews: deterministicCandidates,
          routeMode: 'deterministic',
          permissionDenied: false,
          ...(deterministicCandidates.length
            ? {}
            : {
                clarificationQuestion: '请明确要查询的经营领域或指标。',
                clarificationReason: 'model_returned_no_allowed_view',
              }),
          fallbackReason: `${fallbackReason}:model_returned_no_allowed_view`,
          deterministicLatencyMs,
          modelFallbackLatencyMs: Date.now() - modelStartedAt,
        };
      }
      const modelSemanticIntent: AskDataSemanticIntent = {
        ...semanticIntent,
        intent: normalized.intent,
        answerShape: normalized.answerShape,
        metricKeys: normalized.metricKeys,
        confidence: normalized.confidence,
        ...(normalized.ambiguitySlot
          ? {
              ambiguities: [
                ...parsed.semanticIntent.ambiguities,
                { slot: normalized.ambiguitySlot, reason: '语义模型识别到关键口径歧义。', candidates: [] },
              ],
            }
          : {}),
      };
      return {
        semanticIntent: modelSemanticIntent,
        candidateViews: chosen,
        deterministicCandidateViews: deterministicCandidates,
        routeMode: 'model_fallback',
        permissionDenied: false,
        fallbackReason,
        ...(normalized.clarificationQuestion ? { clarificationQuestion: normalized.clarificationQuestion } : {}),
        ...(normalized.ambiguitySlot ? { clarificationReason: `model_ambiguity:${normalized.ambiguitySlot}` } : {}),
        deterministicLatencyMs,
        modelFallbackLatencyMs: Date.now() - modelStartedAt,
      };
    } catch {
      if (deterministicCandidates.length) {
        return {
          semanticIntent: { ...semanticIntent, confidence: Math.min(semanticIntent.confidence, 0.6) },
          candidateViews: deterministicCandidates,
          deterministicCandidateViews: deterministicCandidates,
          routeMode: 'deterministic',
          permissionDenied: false,
          fallbackReason: `${fallbackReason}:model_failed`,
          deterministicLatencyMs,
          modelFallbackLatencyMs: Date.now() - modelStartedAt,
        };
      }
      return {
        semanticIntent,
        candidateViews: [],
        deterministicCandidateViews: [],
        routeMode: 'deterministic',
        permissionDenied: false,
        clarificationQuestion: '我还不能确定要查询的数据口径，请明确是订单、支付、项目、库存、客户、员工还是营销数据。',
        clarificationReason: 'model_fallback_failed_without_deterministic_candidate',
        fallbackReason: `${fallbackReason}:model_failed`,
        deterministicLatencyMs,
        modelFallbackLatencyMs: Date.now() - modelStartedAt,
      };
    }
  }

  private defaultFallbackPool(authorizedViews: ReadOnlySqlView[]) {
    const priority = [
      'agent_v3_order_summary_view',
      'agent_v3_daily_settlement_view',
      'ask_data_confirmed_profit_view',
      'agent_v3_reservation_view',
      'agent_v3_product_inventory_view',
      'ask_data_staff_performance_view',
      'ask_data_marketing_roi_view',
      'ask_data_customer_lifecycle_view',
    ];
    const byName = new Map(authorizedViews.map((view) => [view.viewName, view]));
    return priority.map((viewName) => byName.get(viewName)).filter((view): view is ReadOnlySqlView => Boolean(view));
  }
}

export function askDataSemanticRouterConfig(env: NodeJS.ProcessEnv = process.env): AskDataSemanticRouterConfig {
  const parsedConfidence = Number(env.ASK_DATA_SEMANTIC_ROUTER_MIN_CONFIDENCE);
  return {
    enabled: env.ASK_DATA_SEMANTIC_ROUTER_ENABLED === 'true',
    shadow: env.ASK_DATA_SEMANTIC_ROUTER_SHADOW === 'true',
    modelFallback: env.ASK_DATA_SEMANTIC_ROUTER_MODEL_FALLBACK !== 'false',
    minConfidence:
      Number.isFinite(parsedConfidence) && parsedConfidence >= 0 && parsedConfidence <= 1 ? parsedConfidence : 0.75,
  };
}

function semanticRouteSchema(metricKeys: string[], viewNames: string[], ambiguitySlots: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'intent',
      'answerShape',
      'metricKeys',
      'viewNames',
      'confidence',
      'ambiguitySlot',
      'clarificationQuestion',
    ],
    properties: {
      intent: { type: 'string', enum: ['query', 'list', 'ranking', 'comparison', 'trend', 'diagnosis'] },
      answerShape: { type: 'string', enum: ['scalar', 'list', 'ranking', 'comparison', 'trend'] },
      metricKeys: { type: 'array', items: { type: 'string', enum: metricKeys }, maxItems: 4 },
      viewNames: { type: 'array', items: { type: 'string', enum: viewNames }, minItems: 1, maxItems: 4 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      ambiguitySlot: { type: 'string', enum: ['', ...ambiguitySlots] },
      clarificationQuestion: { type: 'string' },
    },
  } as const;
}

function buildSemanticRouteMessages(input: {
  question: string;
  intent: AskDataSemanticIntent;
  candidateViews: ReadOnlySqlView[];
  metricKeys: string[];
}) {
  return [
    {
      role: 'system',
      content: [
        '你是 Ami Ask 独立语义路由器，只做结构化意图判断，不生成 SQL。',
        '只能从输入给出的 metricKeys 和 candidateViews 中选择，不得创造新指标、视图、权限或门店范围。',
        '问题可直接回答时 clarificationQuestion 和 ambiguitySlot 必须为空。只有缺失年份、金额阈值、唯一对象或关键比较关系时才澄清。',
        '优先选择最具体的数据口径：产品订单使用商品销售，最受欢迎项目使用项目服务销售，实收流水使用支付退款，各供应商采购金额使用供应商表现。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        question: input.question,
        deterministicIntent: input.intent,
        allowedMetricKeys: input.metricKeys,
        candidateViews: input.candidateViews.map((view) => ({
          viewName: view.viewName,
          label: view.label,
          description: view.description,
          keywords: view.keywords,
        })),
      }),
    },
  ];
}

function normalizeModelDecision(
  value: ModelRouteDecision,
  candidateViews: ReadOnlySqlView[],
  metricKeys: string[],
  ambiguitySlots: string[],
): ModelRouteDecision {
  const allowedViews = new Set(candidateViews.map((view) => view.viewName));
  const allowedMetrics = new Set(metricKeys);
  const allowedAmbiguitySlots = new Set(ambiguitySlots);
  return {
    intent: ['query', 'list', 'ranking', 'comparison', 'trend', 'diagnosis'].includes(value?.intent)
      ? value.intent
      : 'query',
    answerShape: ['scalar', 'list', 'ranking', 'comparison', 'trend'].includes(value?.answerShape)
      ? value.answerShape
      : 'scalar',
    metricKeys: Array.isArray(value?.metricKeys)
      ? value.metricKeys.map(String).filter((item) => allowedMetrics.has(item)).slice(0, 4)
      : [],
    viewNames: Array.isArray(value?.viewNames)
      ? value.viewNames.map(String).filter((item) => allowedViews.has(item)).slice(0, 4)
      : [],
    confidence: Number.isFinite(Number(value?.confidence))
      ? Math.max(0, Math.min(1, Number(value.confidence)))
      : 0.5,
    ambiguitySlot: allowedAmbiguitySlots.has(String(value?.ambiguitySlot ?? '').trim())
      ? String(value.ambiguitySlot).trim()
      : '',
    clarificationQuestion: allowedAmbiguitySlots.has(String(value?.ambiguitySlot ?? '').trim())
      ? String(value?.clarificationQuestion ?? '').trim()
      : '',
  };
}

function metricKeysForViews(views: ReadOnlySqlView[]) {
  const viewNames = new Set(views.map((view) => view.viewName));
  return ASK_DATA_SEMANTIC_CONTRACTS
    .filter((contract) => viewNames.has(contract.preferredView))
    .map((contract) => contract.metricKey);
}

function semanticIndexConfidence(matches: ReturnType<typeof rankAskDataSemanticIndex>) {
  const top = matches[0];
  if (!top) return 0.35;
  const margin = top.score - (matches[1]?.score ?? 0);
  if (top.score >= 150 && margin >= 40) return 0.95;
  if (top.score >= 100 && margin >= 25) return 0.9;
  if (top.score >= 60 && margin >= 15) return 0.82;
  if (margin < 8) return 0.62;
  return 0.72;
}

function hasMetricConflict(matches: ReturnType<typeof rankAskDataSemanticIndex>) {
  const [first, second] = matches;
  if (!first || !second || first.score - second.score > 20) return false;
  return first.contract.conflictsWith.includes(second.contract.metricKey) ||
    second.contract.conflictsWith.includes(first.contract.metricKey);
}
