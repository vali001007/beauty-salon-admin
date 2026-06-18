import { Injectable } from '@nestjs/common';
import type { AgentRole } from '../agent.types.js';
import { CapabilityRegistryService } from '../capabilities/capability-registry.service.js';
import { SemanticMetricRegistryService } from '../../semantic-data/semantic-metric-registry.service.js';
import { SemanticSqlDecisionService } from '../../semantic-sql/semantic-sql-decision.service.js';
import { BusinessTaskPreParserService } from './business-task-preparser.service.js';
import type {
  BusinessCapabilityPlan,
  BusinessTask,
  BusinessTaskOutputMode,
  BusinessTaskPreparseResult,
  BusinessTaskType,
} from './business-task.types.js';
import { BusinessTaskLlmCompilerService, type BusinessTaskLlmDraftResult } from './business-task-llm-compiler.service.js';
import type { SemanticSqlCandidate } from '../../semantic-sql/semantic-sql.types.js';

export type BusinessTaskCompileInput = {
  message: string;
  role: AgentRole;
  context?: Record<string, unknown>;
};

export type BusinessTaskValidationResult = {
  valid: boolean;
  confidence: number;
  missingSlots: string[];
  warnings: string[];
  clarificationQuestion?: string | null;
};

export type BusinessTaskCompileResult = {
  task: BusinessTask;
  preParsed: BusinessTaskPreparseResult;
  llmDraft: BusinessTaskLlmDraftResult;
  validation: BusinessTaskValidationResult;
  capabilityMatches: Array<{
    capabilityId: string;
    reason: string;
    toolPlan: BusinessCapabilityPlan['toolPlan'];
  }>;
  metricMatches: ReturnType<SemanticMetricRegistryService['match']>;
  semanticSqlCandidate: SemanticSqlCandidate;
};

@Injectable()
export class BusinessTaskCompilerService {
  constructor(
    private readonly preParser: BusinessTaskPreParserService,
    private readonly capabilityRegistry: CapabilityRegistryService,
    private readonly metricRegistry: SemanticMetricRegistryService,
    private readonly semanticSqlDecision: SemanticSqlDecisionService,
    private readonly llmCompiler?: BusinessTaskLlmCompilerService,
  ) {}

  async compile(input: BusinessTaskCompileInput): Promise<BusinessTaskCompileResult> {
    const preParsed = this.preParser.parse({ message: input.message, role: input.role, context: input.context });
    const llmDraft = this.llmCompiler
      ? await this.llmCompiler.compileDraft({ message: input.message, role: input.role, context: input.context })
      : this.disabledLlmDraft();
    const merged = this.mergeLlmDraft(preParsed, llmDraft);
    const task = merged.task;
    const metricMatches = this.metricRegistry.match(task.metrics, task.taskType);
    const validation = this.validate(task, [...preParsed.warnings, ...llmDraft.warnings, ...merged.warnings]);
    const capability = validation.valid ? this.capabilityRegistry.match(task, input.role) : null;
    const semanticSqlCandidate = this.semanticSqlDecision.decide({ task, role: input.role });

    return {
      task,
      preParsed,
      llmDraft,
      validation,
      capabilityMatches: capability
        ? [
            {
              capabilityId: capability.capabilityId,
              reason: capability.reason,
              toolPlan: capability.toolPlan,
            },
          ]
        : [],
      metricMatches,
      semanticSqlCandidate,
    };
  }

  private disabledLlmDraft(): BusinessTaskLlmDraftResult {
    return {
      used: false,
      status: 'disabled',
      source: 'disabled',
      warnings: ['llm_task_compiler_not_registered'],
    };
  }

  private mergeLlmDraft(
    preParsed: BusinessTaskPreparseResult,
    llmDraft: BusinessTaskLlmDraftResult,
  ): { task: BusinessTask; warnings: string[] } {
    const base = preParsed.task;
    const draft = llmDraft.status === 'success' ? llmDraft.task : undefined;
    if (!draft) return { task: base, warnings: [] };

    const warnings: string[] = [];
    const task: BusinessTask = {
      ...base,
      entities: [...base.entities],
      metrics: [...base.metrics],
      filters: { ...base.filters },
      sort: base.sort ? [...base.sort] : undefined,
      missingSlots: [...base.missingSlots],
    };
    const domainConflict = Boolean(
      preParsed.deterministicSlots.domainMatched && draft.domain && draft.domain !== task.domain,
    );

    if (!preParsed.deterministicSlots.domainMatched && draft.domain) {
      task.domain = draft.domain;
    } else if (draft.domain && draft.domain !== task.domain) {
      warnings.push('llm_domain_ignored_by_deterministic_slot');
    }

    if (!preParsed.deterministicSlots.taskTypeMatched && draft.taskType) {
      task.taskType = draft.taskType;
    } else if (draft.taskType && draft.taskType !== task.taskType) {
      warnings.push('llm_taskType_ignored_by_deterministic_slot');
    }

    if (!preParsed.deterministicSlots.limitMatched && draft.limit) {
      task.limit = draft.limit;
    } else if (draft.limit && draft.limit !== task.limit) {
      warnings.push('llm_limit_ignored_by_deterministic_slot');
    }

    if (!preParsed.deterministicSlots.timeRangeMatched && draft.timeRange) {
      task.timeRange = draft.timeRange;
    } else if (draft.timeRange && draft.timeRange.preset !== task.timeRange?.preset) {
      warnings.push('llm_timeRange_ignored_by_deterministic_slot');
    }

    if (!domainConflict && draft.metrics?.length) {
      task.metrics = Array.from(new Set([...task.metrics, ...draft.metrics])).slice(0, 8);
    }

    if (!domainConflict && draft.entities?.length) {
      task.entities = this.mergeEntities(task.entities, draft.entities);
    }

    if (!domainConflict && draft.filters) {
      task.filters = { ...draft.filters, ...task.filters };
    }

    if (!domainConflict && !task.sort?.length && draft.sort?.length) task.sort = draft.sort;
    if (draft.outputMode && this.canAcceptOutputMode(task.taskType, draft.outputMode)) task.outputMode = draft.outputMode;
    else task.outputMode = this.deriveOutputMode(task.taskType, task.limit);

    const requiresApproval = task.taskType === 'draft' || task.taskType === 'workflow';
    task.requiresApproval = requiresApproval;
    task.riskLevel = requiresApproval ? draft.riskLevel ?? 'medium' : base.riskLevel;
    task.missingSlots = this.buildMissingSlots(task);
    task.confidence = domainConflict ? task.confidence : Math.max(task.confidence, Math.min(draft.confidence ?? 0.7, 0.9));

    return { task, warnings };
  }

  private mergeEntities(base: BusinessTask['entities'], draft: BusinessTask['entities']) {
    const byKey = new Map<string, BusinessTask['entities'][number]>();
    for (const entity of [...base, ...draft]) {
      const key = `${entity.type}:${entity.value}`;
      const existing = byKey.get(key);
      if (!existing || entity.confidence > existing.confidence) byKey.set(key, entity);
    }
    return Array.from(byKey.values()).slice(0, 12);
  }

  private canAcceptOutputMode(taskType: BusinessTaskType, outputMode: BusinessTaskOutputMode) {
    if (taskType === 'draft') return outputMode === 'draft';
    if (taskType === 'workflow') return outputMode === 'workflow';
    if (taskType === 'ranking' || taskType === 'recommendation') return outputMode === 'ranked_list' || outputMode === 'table';
    if (taskType === 'query') return outputMode === 'card' || outputMode === 'table' || outputMode === 'summary';
    return outputMode === 'summary' || outputMode === 'table' || outputMode === 'card';
  }

  private deriveOutputMode(taskType: BusinessTaskType, limit?: number): BusinessTaskOutputMode {
    if (taskType === 'workflow') return 'workflow';
    if (taskType === 'draft') return 'draft';
    if (taskType === 'ranking' || taskType === 'recommendation') return limit ? 'ranked_list' : 'summary';
    if (taskType === 'query') return 'card';
    return 'summary';
  }

  private buildMissingSlots(task: BusinessTask) {
    const missingSlots: string[] = [];
    if (task.domain === 'unknown') missingSlots.push('domain');
    if (task.taskType === 'clarify') missingSlots.push('taskType');
    if ((task.taskType === 'ranking' || task.taskType === 'recommendation') && !task.limit) missingSlots.push('limit');
    return missingSlots;
  }

  private validate(task: BusinessTask, warnings: string[]): BusinessTaskValidationResult {
    const missingSlots = [...task.missingSlots];
    const confidence = task.confidence;
    const valid = task.domain !== 'unknown' && task.taskType !== 'clarify' && confidence >= 0.6;
    const clarificationQuestion = valid
      ? null
      : '请说明要查询或处理的业务领域，例如商品、项目、客户、排班、订单、卡项、财务、库存、供应链、营销、自动化、小程序渠道、终端或售后退款。';

    return {
      valid,
      confidence,
      missingSlots,
      warnings,
      clarificationQuestion,
    };
  }
}
