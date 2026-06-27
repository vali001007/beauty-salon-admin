import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../ai/ai.service.js';
import type {
  BusinessEntityRef,
  BusinessSort,
  BusinessTask,
  BusinessTaskDomain,
  BusinessTaskEvent,
  BusinessTaskOutputIntent,
  BusinessTaskOutputMode,
  BusinessTaskType,
  BusinessTimeRange,
} from './business-task.types.js';
import { BUSINESS_TASK_COMPILER_SYSTEM_PROMPT } from './business-task-compiler.prompt.js';

const DOMAINS: BusinessTaskDomain[] = [
  'business',
  'customer',
  'product',
  'project',
  'reservation',
  'schedule',
  'order',
  'card',
  'memberCard',
  'inventory',
  'supplyChain',
  'finance',
  'marketing',
  'promotion',
  'automation',
  'staff',
  'serviceQuality',
  'customerApp',
  'channel',
  'terminal',
  'store',
  'afterSales',
  'unknown',
];
const TASK_TYPES: BusinessTaskType[] = [
  'query',
  'ranking',
  'recommendation',
  'diagnosis',
  'forecast',
  'draft',
  'workflow',
  'clarify',
];
const OUTPUT_MODES: BusinessTaskOutputMode[] = ['summary', 'ranked_list', 'table', 'card', 'draft', 'workflow'];
const EVENTS: BusinessTaskEvent[] = [
  'paid_order',
  'reservation_created',
  'service_completed',
  'inventory_low_stock',
  'card_expiring',
  'marketing_conversion',
  'refund_created',
  'unknown',
];
const OUTPUT_INTENTS: BusinessTaskOutputIntent[] = [
  'answer_text',
  'show_kpi',
  'show_table',
  'show_chart',
  'confirm_action',
  'ask_clarification',
  'draft_document',
];
const TIME_PRESETS: BusinessTimeRange['preset'][] = [
  'today',
  'yesterday',
  'last_week',
  'this_week',
  'next_week',
  'this_month',
  'last_7_days',
  'last_30_days',
  'next_30_days',
  'custom',
];
const DRAFT_FIELDS = [
  'domain',
  'taskType',
  'event',
  'metrics',
  'entities',
  'filters',
  'timeRange',
  'sort',
  'limit',
  'outputMode',
  'outputIntent',
  'requiredFields',
  'ambiguities',
  'riskLevel',
  'confidence',
  'reason',
] as const;
const BUSINESS_TASK_DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    domain: { enum: DOMAINS },
    taskType: { enum: TASK_TYPES },
    event: { enum: EVENTS },
    metrics: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    entities: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string' },
          value: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['type', 'value'],
      },
    },
    filters: { type: 'object' },
    timeRange: {
      type: 'object',
      additionalProperties: false,
      properties: {
        preset: { enum: TIME_PRESETS },
        startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        label: { type: 'string' },
      },
      required: ['preset'],
    },
    sort: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: { type: 'string' },
          direction: { enum: ['asc', 'desc'] },
        },
        required: ['field', 'direction'],
      },
    },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
    outputMode: { enum: OUTPUT_MODES },
    outputIntent: { enum: OUTPUT_INTENTS },
    requiredFields: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    ambiguities: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    riskLevel: { enum: ['low', 'medium', 'high'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' },
  },
};

export type BusinessTaskLlmDraftTask = Partial<
  Pick<
    BusinessTask,
    | 'taskType'
    | 'domain'
    | 'entities'
    | 'metrics'
    | 'filters'
    | 'event'
    | 'timeRange'
    | 'sort'
    | 'limit'
    | 'outputMode'
    | 'outputIntent'
    | 'requiredFields'
    | 'ambiguities'
    | 'riskLevel'
    | 'confidence'
  >
> & {
  reason?: string;
};

export type BusinessTaskLlmDraftResult = {
  used: boolean;
  status: 'disabled' | 'success' | 'invalid' | 'unavailable' | 'failed';
  source: 'disabled' | 'context' | 'ai_gateway';
  task?: BusinessTaskLlmDraftTask;
  raw?: unknown;
  warnings: string[];
};

@Injectable()
export class BusinessTaskLlmCompilerService {
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly aiService?: AiService,
  ) {}

  async compileDraft(input: {
    message: string;
    role?: string;
    context?: Record<string, unknown>;
  }): Promise<BusinessTaskLlmDraftResult> {
    const enabled = this.isEnabled(input.context);
    const contextDraft = this.getContextDraft(input.context);

    if (contextDraft) {
      if (!enabled) {
        return {
          used: false,
          status: 'disabled',
          source: 'disabled',
          raw: contextDraft,
          warnings: ['llm_context_draft_ignored_without_enable'],
        };
      }
      return this.validateDraft(contextDraft, 'context');
    }

    if (!enabled) {
      return {
        used: false,
        status: 'disabled',
        source: 'disabled',
        warnings: ['llm_task_compiler_disabled'],
      };
    }

    if (!this.aiService) {
      return {
        used: false,
        status: 'unavailable',
        source: 'ai_gateway',
        warnings: ['llm_task_compiler_ai_service_unavailable'],
      };
    }

    try {
      return await this.compileAiDraftWithRetry(input);
    } catch (error) {
      return {
        used: true,
        status: 'failed',
        source: 'ai_gateway',
        warnings: [`llm_task_compiler_failed:${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  private async compileAiDraftWithRetry(input: {
    message: string;
    role?: string;
    context?: Record<string, unknown>;
  }): Promise<BusinessTaskLlmDraftResult> {
    let lastInvalid: BusinessTaskLlmDraftResult | null = null;
    let repairHint: string | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.aiService!.chat(this.buildAiMessages(input, repairHint));
        const parsed = this.parseJsonObject(result.text);
        const validation = this.validateDraft(parsed, 'ai_gateway');
        if (validation.status === 'success') {
          return attempt > 0
            ? { ...validation, warnings: ['llm_task_compiler_retried_after_schema_error', ...validation.warnings] }
            : validation;
        }
        lastInvalid = validation;
        repairHint = this.repairHint(validation.warnings);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastInvalid = {
          used: true,
          status: 'invalid',
          source: 'ai_gateway',
          warnings: [`llm_schema_parse_failed:${message}`],
        };
        repairHint = this.repairHint(lastInvalid.warnings);
      }
    }

    return {
      ...(lastInvalid ?? {
        used: true,
        status: 'invalid' as const,
        source: 'ai_gateway' as const,
        warnings: ['llm_task_draft_empty_or_invalid'],
      }),
      warnings: ['llm_task_compiler_retry_exhausted', ...(lastInvalid?.warnings ?? [])],
    };
  }

  private buildAiMessages(
    input: { message: string; role?: string; context?: Record<string, unknown> },
    repairHint?: string,
  ) {
    return [
      { role: 'system', content: BUSINESS_TASK_COMPILER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          message: input.message,
          role: input.role,
          context: this.compactContext(input.context),
          jsonSchema: BUSINESS_TASK_DRAFT_JSON_SCHEMA,
          instructions: [
            '只输出一个 JSON 对象，不要 Markdown，不要解释文字。',
            '不要生成 SQL、数据库表名查询、工具名或业务事实结论。',
            '字段必须符合 jsonSchema，不能输出 additionalProperties。',
            repairHint,
          ].filter(Boolean),
        }),
      },
    ];
  }

  private repairHint(warnings: string[]) {
    return `上一次输出未通过 schema 校验：${warnings.slice(0, 6).join(', ')}。请只返回符合 schema 的 JSON 对象。`;
  }

  private isEnabled(context?: Record<string, unknown>) {
    return (
      context?.llmTaskCompilerEnabled === true ||
      context?.llmTaskCompilerPreview === true ||
      String(this.config.get('AGENT_LLM_TASK_COMPILER_ENABLED', 'false')).toLowerCase() === 'true'
    );
  }

  private getContextDraft(context?: Record<string, unknown>) {
    const draft = context?.llmBusinessTaskDraft ?? context?.businessTaskDraft;
    return this.asObject(draft);
  }

  private validateDraft(raw: Record<string, unknown>, source: BusinessTaskLlmDraftResult['source']): BusinessTaskLlmDraftResult {
    const warnings: string[] = [];
    const task: BusinessTaskLlmDraftTask = {};
    const schemaWarnings = this.validateDraftSchemaShape(raw);
    warnings.push(...schemaWarnings);

    const domain = this.pickAllowed(raw.domain, DOMAINS, 'domain', warnings);
    if (domain) task.domain = domain;

    const taskType = this.pickAllowed(raw.taskType, TASK_TYPES, 'taskType', warnings);
    if (taskType) task.taskType = taskType;

    const metrics = this.sanitizeStringList(raw.metrics, 'metrics', warnings);
    if (metrics.length) task.metrics = metrics;

    const entities = this.sanitizeEntities(raw.entities, warnings);
    if (entities.length) task.entities = entities;

    const filters = this.sanitizeFilters(raw.filters);
    if (Object.keys(filters).length) task.filters = filters;

    const event = this.pickAllowed(raw.event, EVENTS, 'event', warnings);
    if (event) task.event = event;

    const timeRange = this.sanitizeTimeRange(raw.timeRange, warnings);
    if (timeRange) task.timeRange = timeRange;

    const sort = this.sanitizeSort(raw.sort, warnings);
    if (sort.length) task.sort = sort;

    const limit = this.sanitizeLimit(raw.limit, warnings);
    if (limit) task.limit = limit;

    const outputMode = this.pickAllowed(raw.outputMode, OUTPUT_MODES, 'outputMode', warnings);
    if (outputMode) task.outputMode = outputMode;

    const outputIntent = this.pickAllowed(raw.outputIntent, OUTPUT_INTENTS, 'outputIntent', warnings);
    if (outputIntent) task.outputIntent = outputIntent;

    const requiredFields = this.sanitizeStringList(raw.requiredFields, 'requiredFields', warnings);
    if (requiredFields.length) task.requiredFields = requiredFields;

    const ambiguities = this.sanitizeStringList(raw.ambiguities, 'ambiguities', warnings);
    if (ambiguities.length) task.ambiguities = ambiguities;

    const riskLevel = this.pickAllowed(raw.riskLevel, ['low', 'medium', 'high'] as const, 'riskLevel', warnings);
    if (riskLevel) task.riskLevel = riskLevel;

    const confidence = this.sanitizeConfidence(raw.confidence, warnings);
    if (confidence !== undefined) task.confidence = confidence;

    const reason = typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 160) : '';
    if (reason) task.reason = reason;

    const hasAnySlot = Object.keys(task).some((key) => key !== 'reason');
    if (!hasAnySlot) {
      return {
        used: true,
        status: 'invalid',
        source,
        raw,
        warnings: [...warnings, 'llm_task_draft_empty_or_invalid'],
      };
    }

    return {
      used: true,
      status: warnings.length ? 'invalid' : 'success',
      source,
      task,
      raw,
      warnings,
    };
  }

  private validateDraftSchemaShape(raw: Record<string, unknown>) {
    const warnings: string[] = [];
    const allowedFields = new Set<string>(DRAFT_FIELDS);
    for (const key of Object.keys(raw)) {
      if (!allowedFields.has(key)) warnings.push(`llm_unknown_field:${key}`);
    }
    if (raw.timeRange !== undefined && !this.asObject(raw.timeRange)) warnings.push('llm_schema_timeRange_not_object');
    if (raw.entities !== undefined && !Array.isArray(raw.entities)) warnings.push('llm_schema_entities_not_array');
    if (raw.metrics !== undefined && !Array.isArray(raw.metrics)) warnings.push('llm_schema_metrics_not_array');
    if (raw.sort !== undefined && !Array.isArray(raw.sort)) warnings.push('llm_schema_sort_not_array');
    if (raw.requiredFields !== undefined && !Array.isArray(raw.requiredFields)) warnings.push('llm_schema_requiredFields_not_array');
    if (raw.ambiguities !== undefined && !Array.isArray(raw.ambiguities)) warnings.push('llm_schema_ambiguities_not_array');
    return warnings;
  }

  private pickAllowed<const T extends readonly string[]>(
    value: unknown,
    allowed: T,
    field: string,
    warnings: string[],
  ): T[number] | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = String(value).trim();
    if ((allowed as readonly string[]).includes(normalized)) return normalized as T[number];
    warnings.push(`llm_invalid_${field}`);
    return undefined;
  }

  private sanitizeStringList(value: unknown, field: string, warnings: string[]) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      warnings.push(`llm_invalid_${field}`);
      return [];
    }
    return Array.from(
      new Set(
        value
          .map((item) => String(item ?? '').trim())
          .filter((item) => /^[a-zA-Z0-9_.-]{2,60}$/.test(item)),
      ),
    ).slice(0, 8);
  }

  private sanitizeEntities(value: unknown, warnings: string[]): BusinessEntityRef[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      warnings.push('llm_invalid_entities');
      return [];
    }
    return value
      .map((item) => this.asObject(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => {
        const type = this.pickAllowed(item.type, [...DOMAINS, 'customer_segment', 'metric'] as const, 'entity_type', warnings);
        const text = typeof item.value === 'string' ? item.value.trim().slice(0, 80) : '';
        if (!type || !text) return null;
        return {
          type,
          value: text,
          confidence: this.sanitizeConfidence(item.confidence, warnings) ?? 0.7,
        };
      })
      .filter((item): item is BusinessEntityRef => Boolean(item))
      .slice(0, 10);
  }

  private sanitizeFilters(value: unknown) {
    const record = this.asObject(value);
    if (!record) return {};
    const filters: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record).slice(0, 12)) {
      if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(key)) continue;
      if (typeof item === 'string') filters[key] = item.slice(0, 80);
      else if (typeof item === 'number' && Number.isFinite(item)) filters[key] = item;
      else if (typeof item === 'boolean') filters[key] = item;
      else if (Array.isArray(item)) {
        const values = item
          .filter((entry) => ['string', 'number', 'boolean'].includes(typeof entry))
          .map((entry) => (typeof entry === 'string' ? entry.slice(0, 80) : entry))
          .slice(0, 20);
        if (values.length) filters[key] = values;
      }
    }
    return filters;
  }

  private sanitizeTimeRange(value: unknown, warnings: string[]): BusinessTimeRange | undefined {
    const record = this.asObject(value);
    if (!record) return undefined;
    const preset = this.pickAllowed(record.preset, TIME_PRESETS, 'timeRange_preset', warnings);
    if (!preset) return undefined;
    const startDate = this.sanitizeDate(record.startDate);
    const endDate = this.sanitizeDate(record.endDate);
    const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim().slice(0, 24) : preset;
    return {
      preset,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      label,
    };
  }

  private sanitizeSort(value: unknown, warnings: string[]): BusinessSort[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      warnings.push('llm_invalid_sort');
      return [];
    }
    return value
      .map((item) => this.asObject(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => {
        const field = typeof item.field === 'string' && /^[a-zA-Z0-9_.-]{2,60}$/.test(item.field) ? item.field : '';
        const direction = item.direction === 'asc' || item.direction === 'desc' ? item.direction : undefined;
        if (!field || !direction) return null;
        return { field, direction };
      })
      .filter((item): item is BusinessSort => Boolean(item))
      .slice(0, 3);
  }

  private sanitizeLimit(value: unknown, warnings: string[]) {
    if (value === undefined || value === null || value === '') return undefined;
    const limit = Number(value);
    if (!Number.isFinite(limit) || limit <= 0) {
      warnings.push('llm_invalid_limit');
      return undefined;
    }
    return Math.min(Math.max(Math.trunc(limit), 1), 50);
  }

  private sanitizeConfidence(value: unknown, warnings: string[]) {
    if (value === undefined || value === null || value === '') return undefined;
    const confidence = Number(value);
    if (!Number.isFinite(confidence)) {
      warnings.push('llm_invalid_confidence');
      return undefined;
    }
    return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
  }

  private sanitizeDate(value: unknown) {
    if (typeof value !== 'string') return undefined;
    const date = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  }

  private compactContext(context?: Record<string, unknown>) {
    if (!context) return undefined;
    const { llmBusinessTaskDraft: _draft, businessTaskDraft: _legacyDraft, ...rest } = context;
    try {
      const json = JSON.stringify(rest);
      if (!json) return undefined;
      return json.length > 2000 ? { summary: json.slice(0, 2000) } : JSON.parse(json);
    } catch {
      return undefined;
    }
  }

  private parseJsonObject(text: string) {
    const trimmed = String(text || '').trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    const candidate = fenced || trimmed;
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first < 0 || last < first) throw new Error('LLM output is not a JSON object');
    const parsed = JSON.parse(candidate.slice(first, last + 1));
    const record = this.asObject(parsed);
    if (!record) throw new Error('LLM output is not a JSON object');
    return record;
  }

  private asObject(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  }
}
