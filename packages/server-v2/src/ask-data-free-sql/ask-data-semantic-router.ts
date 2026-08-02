import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import { AskDataClarificationPolicy } from './ask-data-clarification-policy.js';
import type { AskDataFreeSqlContext, AskDataSemanticIntent, AskDataSemanticRouteMode } from './ask-data-free-sql.types.js';
import { AskDataIntentParser } from './ask-data-intent-parser.js';
import { ASK_DATA_SEMANTIC_CONTRACTS } from './ask-data-semantic-contracts.js';
import { selectAskDataViews } from './ask-data-free-sql-view-selector.js';

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
    const matchedViewNames = parsed.matchedContracts.flatMap((item) => [
      item.contract.preferredView,
      ...(item.contract.fallbackViews ?? []),
    ]);
    const deterministicCandidates = [...new Set(matchedViewNames)]
      .map((viewName) => authorizedByName.get(viewName))
      .filter((view): view is ReadOnlySqlView => Boolean(view))
      .slice(0, parsed.matchedContracts.length > 1 ? 4 : 2);
    const permissionDenied = matchedViewNames.length > 0 && deterministicCandidates.length === 0;
    const clarification = this.clarificationPolicy.inspect(parsed.semanticIntent);
    const deterministicLatencyMs = Date.now() - startedAt;
    if (permissionDenied || clarification.required) {
      return {
        semanticIntent: parsed.semanticIntent,
        candidateViews: permissionDenied ? [] : deterministicCandidates,
        deterministicCandidateViews: deterministicCandidates,
        routeMode: 'deterministic',
        permissionDenied,
        ...(clarification.question ? { clarificationQuestion: clarification.question } : {}),
        ...(clarification.reason ? { clarificationReason: clarification.reason } : {}),
        deterministicLatencyMs,
      };
    }

    const conflictingMetrics = parsed.matchedContracts.length > 1 && !/对比|比较|相比|分别|以及|和|与|、/.test(input.question);
    const fallbackReason = !parsed.matchedContracts.length
      ? 'metric_not_deterministically_matched'
      : conflictingMetrics
        ? 'metric_conflict'
        : parsed.semanticIntent.confidence < config.minConfidence
          ? 'low_confidence'
          : undefined;
    if (!fallbackReason || !config.modelFallback) {
      const fallbackCandidates = deterministicCandidates.length
        ? deterministicCandidates
        : selectAskDataViews(input.question, input.context, 8, input.authorizedViews);
      return {
        semanticIntent: parsed.semanticIntent,
        candidateViews: fallbackCandidates,
        deterministicCandidateViews: deterministicCandidates,
        routeMode: 'deterministic',
        permissionDenied: false,
        ...(fallbackReason ? { fallbackReason } : {}),
        deterministicLatencyMs,
      };
    }

    const fallbackPool = this.fallbackPool(input, deterministicCandidates);
    if (!fallbackPool.length) {
      return {
        semanticIntent: parsed.semanticIntent,
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
      const decision = await this.aiService.generateStructured<ModelRouteDecision>({
        scenario: 'ask_data_semantic_route',
        messages: buildSemanticRouteMessages({
          question: input.question,
          intent: parsed.semanticIntent,
          candidateViews: fallbackPool,
          metricKeys: ASK_DATA_SEMANTIC_CONTRACTS.map((item) => item.metricKey),
        }),
        schema: semanticRouteSchema(
          ASK_DATA_SEMANTIC_CONTRACTS.map((item) => item.metricKey),
          fallbackPool.map((view) => view.viewName),
        ),
        timeoutMs: 5000,
        temperature: 0,
        userId: input.context.userId,
        storeId: input.context.storeId,
      });
      const normalized = normalizeModelDecision(decision.data, fallbackPool);
      const chosen = normalized.viewNames
        .map((viewName) => authorizedByName.get(viewName))
        .filter((view): view is ReadOnlySqlView => Boolean(view))
        .slice(0, 4);
      if (!chosen.length) {
        return {
          semanticIntent: parsed.semanticIntent,
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
      const semanticIntent: AskDataSemanticIntent = {
        ...parsed.semanticIntent,
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
      const modelClarificationQuestion = normalized.clarificationQuestion ||
        (normalized.ambiguitySlot ? `请补充会影响查询口径的${normalized.ambiguitySlot}。` : '');
      return {
        semanticIntent,
        candidateViews: chosen,
        deterministicCandidateViews: deterministicCandidates,
        routeMode: 'model_fallback',
        permissionDenied: false,
        fallbackReason,
        ...(modelClarificationQuestion ? { clarificationQuestion: modelClarificationQuestion } : {}),
        ...(normalized.ambiguitySlot ? { clarificationReason: `model_ambiguity:${normalized.ambiguitySlot}` } : {}),
        deterministicLatencyMs,
        modelFallbackLatencyMs: Date.now() - modelStartedAt,
      };
    } catch {
      if (deterministicCandidates.length) {
        return {
          semanticIntent: { ...parsed.semanticIntent, confidence: Math.min(parsed.semanticIntent.confidence, 0.6) },
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
        semanticIntent: parsed.semanticIntent,
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

  private fallbackPool(
    input: {
      question: string;
      context: Pick<AskDataFreeSqlContext, 'permissions' | 'deniedPermissions'>;
      authorizedViews: ReadOnlySqlView[];
    },
    deterministicCandidates: ReadOnlySqlView[],
  ) {
    const combined = [
      ...deterministicCandidates,
      ...selectAskDataViews(input.question, input.context, 8, input.authorizedViews),
    ];
    return [...new Map(combined.map((view) => [view.viewName, view])).values()].slice(0, 8);
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

function semanticRouteSchema(metricKeys: string[], viewNames: string[]) {
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
      ambiguitySlot: { type: 'string' },
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

function normalizeModelDecision(value: ModelRouteDecision, candidateViews: ReadOnlySqlView[]): ModelRouteDecision {
  const allowedViews = new Set(candidateViews.map((view) => view.viewName));
  const allowedMetrics = new Set(ASK_DATA_SEMANTIC_CONTRACTS.map((item) => item.metricKey));
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
    ambiguitySlot: String(value?.ambiguitySlot ?? '').trim(),
    clarificationQuestion: String(value?.clarificationQuestion ?? '').trim(),
  };
}
