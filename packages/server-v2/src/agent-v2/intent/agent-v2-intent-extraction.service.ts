import { Injectable, Optional } from '@nestjs/common';
import { AiService } from '../../ai/ai.service.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import { KnowledgeGraphIntentContextService } from './knowledge-graph-intent-context.service.js';
import type {
  AgentV2IntentAction,
  AgentV2TimeIntent,
  IntentExtractionInput,
  KnowledgeGraphIntentContext,
  StructuredIntent,
} from './agent-v2-intent.types.js';

type CacheEntry = {
  expiresAt: number;
  value: StructuredIntent;
};

type IntentProducer = (context: KnowledgeGraphIntentContext) => StructuredIntent;
type AsyncIntentProducer = (context: KnowledgeGraphIntentContext) => Promise<StructuredIntent>;
type LlmPromptBundle = {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  trace: NonNullable<StructuredIntent['trace']['llmPrompt']>;
};
type LlmAttempt = {
  intent: StructuredIntent | null;
  trace?: Pick<StructuredIntent['trace'], 'llmPrompt' | 'llmResponse'>;
};

export type AgentV2IntentCacheStats = {
  size: number;
  limit: number;
  ttlMs: number;
  lookups: number;
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  hitRate: number;
};

const CACHE_LIMIT = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AgentV2IntentExtractionService {
  private readonly cache = new Map<string, CacheEntry>();
  private lookups = 0;
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private evictions = 0;

  constructor(
    private readonly contextService: KnowledgeGraphIntentContextService,
    @Optional() private readonly aiService?: AiService,
  ) {}

  extract(input: IntentExtractionInput): StructuredIntent {
    return this.extractCached(
      { ...input, engine: 'kg_fallback' },
      (context) => this.extractWithKnowledgeGraph(context),
    );
  }

  async extractAsync(input: IntentExtractionInput): Promise<StructuredIntent> {
    return this.extractCachedAsync({ ...input, engine: 'llm' }, async (context) => {
      if (!this.aiService) {
        return this.withLlmFallbackTrace(this.extractWithKnowledgeGraph(context), 'ai_service_not_registered');
      }

      const attempt = await this.extractWithLlm(context, input);
      if (attempt.intent) return attempt.intent;
      return this.withLlmFallbackTrace(this.extractWithKnowledgeGraph(context), 'llm_unavailable_or_invalid_json', attempt.trace);
    });
  }

  getCacheStats(): AgentV2IntentCacheStats {
    return {
      size: this.cache.size,
      limit: CACHE_LIMIT,
      ttlMs: CACHE_TTL_MS,
      lookups: this.lookups,
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      evictions: this.evictions,
      hitRate: ratio(this.hits, this.lookups),
    };
  }

  private extractCached(input: IntentExtractionInput, producer: IntentProducer): StructuredIntent {
    this.lookups += 1;
    const key = this.cacheKey(input);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.hits += 1;
      return {
        ...cached.value,
        trace: {
          ...cached.value.trace,
          source: 'cache',
          cacheHit: true,
        },
      };
    }
    if (cached) this.cache.delete(key);
    this.misses += 1;

    const context = this.contextService.buildContext(input.question);
    const intent = producer(context);
    this.writeCache(key, intent);
    return intent;
  }

  private async extractCachedAsync(input: IntentExtractionInput, producer: AsyncIntentProducer): Promise<StructuredIntent> {
    this.lookups += 1;
    const key = this.cacheKey(input);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.hits += 1;
      return {
        ...cached.value,
        trace: {
          ...cached.value.trace,
          source: 'cache',
          cacheHit: true,
        },
      };
    }
    if (cached) this.cache.delete(key);
    this.misses += 1;

    const context = this.contextService.buildContext(input.question);
    const intent = await producer(context);
    this.writeCache(key, intent);
    return intent;
  }

  private async extractWithLlm(
    context: KnowledgeGraphIntentContext,
    input: IntentExtractionInput,
  ): Promise<LlmAttempt> {
    const prompt = this.buildLlmPrompt(context, input);
    try {
      const response = await this.aiService?.chat(prompt.messages, input.userId, input.storeId);
      const rawText = String((response as { text?: unknown } | undefined)?.text ?? '');
      const raw = parseJsonObject(rawText);
      const responseTrace = this.llmResponseTrace(rawText, raw);
      if (!raw) return { intent: null, trace: { llmPrompt: prompt.trace, llmResponse: responseTrace } };
      return {
        intent: this.normalizeLlmIntent(raw, context, rawText, {
          llmPrompt: prompt.trace,
          llmResponse: responseTrace,
        }),
      };
    } catch {
      return {
        intent: null,
        trace: {
          llmPrompt: prompt.trace,
          llmResponse: {
            rawTextPreview: '',
            parsed: false,
          },
        },
      };
    }
  }

  private normalizeLlmIntent(
    raw: Record<string, unknown>,
    context: KnowledgeGraphIntentContext,
    rawText: string,
    llmTrace: Pick<StructuredIntent['trace'], 'llmPrompt' | 'llmResponse'>,
  ): StructuredIntent {
    const graphCandidates = context.capabilityHints
      .filter((hint) => !context.exclusions.some((exclusion) => exclusion.toCapabilityId === hint.capabilityId))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((hint) => hint.capabilityId);
    const candidateCapabilities = arrayOfStrings(raw.candidateCapabilities);
    const objects = arrayOfStrings(raw.objects);
    const keywords = arrayOfStrings(raw.keywords);

    return {
      objects: objects.length ? objects : context.objectHints.map((hint) => hint.objectType),
      domain: typeof raw.domain === 'string' && raw.domain.trim()
        ? raw.domain.trim()
        : context.domainHints[0]?.domain ?? context.capabilityHints[0]?.domain ?? 'unknown',
      action: normalizeAction(raw.action),
      timeIntent: normalizeTimeIntent(raw.timeIntent),
      keywords: keywords.length ? keywords.slice(0, 16) : this.keywords(context),
      candidateCapabilities: (candidateCapabilities.length ? candidateCapabilities : graphCandidates).slice(0, 3),
      confidence: clamp(Number(raw.confidence), 0, 0.99, context.capabilityHints[0]?.score ?? 0.5),
      needsClarification: raw.needsClarification === true,
      unsupportedReason: typeof raw.unsupportedReason === 'string' && raw.unsupportedReason.trim()
        ? raw.unsupportedReason.trim()
        : null,
      trace: {
        source: 'llm',
        cacheHit: false,
        llmRawTextPreview: rawText.slice(0, 500),
        ...llmTrace,
        normalizedQuestion: context.normalizedQuestion,
        objectHints: context.objectHints,
        domainHints: context.domainHints,
        capabilityHints: context.capabilityHints,
        exclusions: context.exclusions,
      },
    };
  }

  private withLlmFallbackTrace(
    intent: StructuredIntent,
    reason: string,
    llmTrace?: Pick<StructuredIntent['trace'], 'llmPrompt' | 'llmResponse'>,
  ): StructuredIntent {
    return {
      ...intent,
      trace: {
        ...intent.trace,
        llmFallbackReason: reason,
        ...llmTrace,
      },
    };
  }

  private buildLlmPrompt(context: KnowledgeGraphIntentContext, input: IntentExtractionInput): LlmPromptBundle {
    const system = [
      '你是美容门店经营系统的 Agent V2 意图抽取器。',
      '只输出一个严格 JSON 对象，不要输出 Markdown、解释或代码块。',
      '只能基于用户问题、知识图谱候选和已启用 Manifest 选择能力；不要编造权限、接口、数据或执行结果。',
      '如果无法判断，设置 needsClarification=true，并给出 unsupportedReason。',
    ].join('\n');
    const activeManifests = this.promptManifestSummary();
    const outputSchema = {
      objects: ['Customer'],
      domain: 'customer|inventory|finance|order|marketing|terminal|unknown',
      action: 'lookup|list|summary|diagnose|analyze|compare|draft|get_link|print|unknown',
      timeIntent: 'occurred|risk|trend|current|historical_pattern|unknown',
      keywords: ['关键词'],
      candidateCapabilities: ['manifest capabilityId'],
      confidence: 0.0,
      needsClarification: false,
      unsupportedReason: null,
    };
    const payload = {
      question: input.question,
      role: input.role,
      storeScope: input.storeId ? 'store_required' : 'unknown',
      graphContext: this.promptGraphContext(context),
      activeManifests,
      outputSchema,
    };
    return {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      trace: {
        system,
        userPayloadPreview: JSON.stringify(payload).slice(0, 4000),
        graphContextCounts: {
          objectHints: context.objectHints.length,
          domainHints: context.domainHints.length,
          capabilityHints: context.capabilityHints.length,
          exclusions: context.exclusions.length,
          fieldHints: context.fieldHints.length,
        },
        activeManifestCount: activeManifests.length,
        outputSchemaKeys: Object.keys(outputSchema),
      },
    };
  }

  private llmResponseTrace(rawText: string, raw: Record<string, unknown> | null): NonNullable<StructuredIntent['trace']['llmResponse']> {
    return {
      rawTextPreview: rawText.slice(0, 1000),
      parsed: Boolean(raw),
      parsedKeys: raw ? Object.keys(raw) : undefined,
    };
  }

  private promptGraphContext(context: KnowledgeGraphIntentContext) {
    return {
      normalizedQuestion: context.normalizedQuestion,
      objectHints: context.objectHints.slice(0, 8).map((hint) => ({
        objectType: hint.objectType,
        displayName: hint.displayName,
        matchedTerms: hint.matchedTerms,
        score: hint.score,
      })),
      domainHints: context.domainHints.slice(0, 5),
      capabilityHints: context.capabilityHints.slice(0, 8).map((hint) => ({
        capabilityId: hint.capabilityId,
        displayName: hint.displayName,
        domain: hint.domain,
        outputKinds: hint.outputKinds,
        triggerTerms: hint.triggerTerms,
        score: hint.score,
      })),
      exclusions: context.exclusions.slice(0, 8),
      fieldHints: context.fieldHints.slice(0, 8),
    };
  }

  private promptManifestSummary() {
    return listAgentV2CapabilityManifests().map((item) => ({
      capabilityId: item.capabilityId,
      displayName: item.displayName,
      description: item.description,
      domain: item.domain,
      businessObject: item.businessObject,
      actions: item.actions,
      outputKinds: item.outputKinds,
      executorTool: item.executor.tool,
      examples: item.examples.slice(0, 3),
      negativeExamples: item.negativeExamples.slice(0, 3),
      triggerKeywords: item.triggerKeywords.slice(0, 8),
    }));
  }

  private extractWithKnowledgeGraph(context: KnowledgeGraphIntentContext): StructuredIntent {
    const action = detectAction(context.normalizedQuestion);
    const timeIntent = detectTimeIntent(context.normalizedQuestion);
    const candidates = context.capabilityHints
      .filter((hint) => !context.exclusions.some((exclusion) => exclusion.toCapabilityId === hint.capabilityId))
      .sort((a, b) => b.score - a.score);
    const topCandidate = candidates[0];
    const topDomain = context.domainHints[0]?.domain ?? topCandidate?.domain ?? 'unknown';
    const confidence = Number(
      Math.min(0.95, Math.max(topCandidate?.score ?? 0, context.objectHints[0]?.score ?? 0, context.domainHints[0]?.score ?? 0)).toFixed(2),
    );

    return {
      objects: context.objectHints.map((hint) => hint.objectType),
      domain: topDomain,
      action,
      timeIntent,
      keywords: this.keywords(context),
      candidateCapabilities: candidates.slice(0, 3).map((hint) => hint.capabilityId),
      confidence,
      needsClarification: candidates.length === 0 && context.objectHints.length === 0,
      unsupportedReason: candidates.length ? null : '知识图谱未找到足够明确的能力候选。',
      trace: {
        source: 'kg_fallback',
        cacheHit: false,
        normalizedQuestion: context.normalizedQuestion,
        objectHints: context.objectHints,
        domainHints: context.domainHints,
        capabilityHints: context.capabilityHints,
        exclusions: context.exclusions,
      },
    };
  }

  private keywords(context: KnowledgeGraphIntentContext) {
    const terms = [
      ...context.synonymExpansion.map((item) => item.term),
      ...context.objectHints.flatMap((hint) => hint.matchedTerms),
      ...context.capabilityHints.flatMap((hint) => hint.triggerTerms),
    ];
    return [...new Set(terms.filter(Boolean))].slice(0, 16);
  }

  private cacheKey(input: IntentExtractionInput) {
    return [
      input.engine ?? 'kg_fallback',
      normalize(input.question),
      input.role ?? 'unknown_role',
      input.storeId ?? 'unknown_store',
      input.manifestVersion ?? 'builtin',
    ].join('|');
  }

  private writeCache(key: string, value: StructuredIntent) {
    this.writes += 1;
    this.cache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });
    if (this.cache.size <= CACHE_LIMIT) return;
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
      this.evictions += 1;
    }
  }
}

function detectAction(question: string): AgentV2IntentAction {
  if (/打开|进入|跳转|链接|二维码|小程序路径/.test(question)) return 'get_link';
  if (/打印|小票|票据/.test(question)) return 'print';
  if (/帮我|生成|创建|新增|登记|记录一下|草稿|下发|发券|删除|退款|核销/.test(question) && !isReadOnlyQuestion(question)) {
    return 'draft';
  }
  if (/为什么|原因|诊断|风险|异常|漏洞|是否|有没有|是不是|不符|压力/.test(question)) return 'diagnose';
  if (/怎么处理|怎么办|合规|高不高|低不低|合理|应该|流程/.test(question)) return 'diagnose';
  if (/趋势|走势|变化|同比|环比/.test(question)) return 'analyze';
  if (/对比|相比|差异/.test(question)) return 'compare';
  if (/哪些|哪个|列表|清单|明细|记录|流水|名单|排行/.test(question)) return 'list';
  if (/汇总|统计|多少|总额|收入|营收|实收|毛利|提成|净收|人效|效率|完成率/.test(question)) return 'summary';
  if (/查|看|查询|查看|详情|状态|情况|怎么样|如何/.test(question)) return 'lookup';
  return 'unknown';
}

function detectTimeIntent(question: string): AgentV2TimeIntent {
  if (/风险|临期|即将|快|预警|可能|预计/.test(question)) return 'risk';
  if (/趋势|走势|变化|同比|环比|最近\d*天|近\d*天/.test(question)) return 'trend';
  if (/已|已经|记录|流水|历史|昨天|本周|本月|这个月|上月/.test(question)) return 'occurred';
  if (/今天|今日|当前|现在|状态|还有|剩余/.test(question)) return 'current';
  if (/最近|长期|一直|很久/.test(question)) return 'historical_pattern';
  return 'unknown';
}

function isReadOnlyQuestion(question: string) {
  return /哪些|哪个|列表|查询|查看|看一下|多少|统计|记录|明细|是否|有没有|为什么|情况|报告|简报|周期|平均|原因|流程|合规|退款率|主要|应该|还是|怎么处理|怎么办|高不高|低不低|制定|方案|计算|合理|提醒|规则/.test(question);
}

function normalize(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1] ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function clamp(value: number, min: number, max: number, fallback: number) {
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Number(Math.min(max, Math.max(min, safeValue)).toFixed(2));
}

function normalizeAction(value: unknown): AgentV2IntentAction {
  const normalized = String(value || '').trim() as AgentV2IntentAction;
  if (
    normalized === 'lookup' ||
    normalized === 'list' ||
    normalized === 'summary' ||
    normalized === 'diagnose' ||
    normalized === 'analyze' ||
    normalized === 'compare' ||
    normalized === 'draft' ||
    normalized === 'get_link' ||
    normalized === 'print' ||
    normalized === 'unknown'
  ) {
    return normalized;
  }
  return 'unknown';
}

function normalizeTimeIntent(value: unknown): AgentV2TimeIntent {
  const normalized = String(value || '').trim() as AgentV2TimeIntent;
  if (
    normalized === 'occurred' ||
    normalized === 'risk' ||
    normalized === 'trend' ||
    normalized === 'current' ||
    normalized === 'historical_pattern' ||
    normalized === 'unknown'
  ) {
    return normalized;
  }
  return 'unknown';
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}
