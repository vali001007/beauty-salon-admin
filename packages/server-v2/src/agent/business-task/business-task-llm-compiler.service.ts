import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../ai/ai.service.js';
import type {
  BusinessEntityRef,
  BusinessSort,
  BusinessTask,
  BusinessTaskDomain,
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
const TIME_PRESETS: BusinessTimeRange['preset'][] = [
  'today',
  'yesterday',
  'this_week',
  'next_week',
  'this_month',
  'last_7_days',
  'last_30_days',
  'next_30_days',
  'custom',
];

export type BusinessTaskLlmDraftTask = Partial<
  Pick<
    BusinessTask,
    | 'taskType'
    | 'domain'
    | 'entities'
    | 'metrics'
    | 'filters'
    | 'timeRange'
    | 'sort'
    | 'limit'
    | 'outputMode'
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
      const result = await this.aiService.chat([
        { role: 'system', content: BUSINESS_TASK_COMPILER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            message: input.message,
            role: input.role,
            context: this.compactContext(input.context),
          }),
        },
      ]);
      return this.validateDraft(this.parseJsonObject(result.text), 'ai_gateway');
    } catch (error) {
      return {
        used: true,
        status: 'failed',
        source: 'ai_gateway',
        warnings: [`llm_task_compiler_failed:${error instanceof Error ? error.message : String(error)}`],
      };
    }
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

    const timeRange = this.sanitizeTimeRange(raw.timeRange, warnings);
    if (timeRange) task.timeRange = timeRange;

    const sort = this.sanitizeSort(raw.sort, warnings);
    if (sort.length) task.sort = sort;

    const limit = this.sanitizeLimit(raw.limit, warnings);
    if (limit) task.limit = limit;

    const outputMode = this.pickAllowed(raw.outputMode, OUTPUT_MODES, 'outputMode', warnings);
    if (outputMode) task.outputMode = outputMode;

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
