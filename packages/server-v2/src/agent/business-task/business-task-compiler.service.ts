import { Injectable, Optional } from '@nestjs/common';
import type { AgentRole } from '../agent.types.js';
import { CapabilityRegistryService } from '../capabilities/capability-registry.service.js';
import { AgentSkillsRegistryService, type AmiBusinessSkillPlan } from '../skills/index.js';
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
  skillMatches: AmiBusinessSkillPlan[];
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
    @Optional()
    private readonly llmCompiler?: BusinessTaskLlmCompilerService,
    @Optional()
    private readonly skillRegistry?: AgentSkillsRegistryService,
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
    const skill = validation.valid ? this.skillRegistry?.match(task, input.role) ?? null : null;
    const capability = validation.valid ? this.capabilityFromSkillOrRegistry(skill, task, input.role) : null;
    const semanticSqlCandidate = this.semanticSqlDecision.decide({ task, role: input.role });

    return {
      task,
      preParsed,
      llmDraft,
      validation,
      skillMatches: skill ? [skill] : [],
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

  private capabilityFromSkillOrRegistry(skill: AmiBusinessSkillPlan | null, task: BusinessTask, role: AgentRole) {
    if (skill) {
      return {
        capabilityId: skill.capabilityId ?? skill.skillId,
        reason: skill.reason,
        toolPlan: skill.toolPlan,
      };
    }
    return this.capabilityRegistry.match(task, role);
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
    const domainConflict = Boolean(
      base.domain !== 'unknown' && draft.domain && draft.domain !== base.domain,
    );
    const taskTypeConflict = Boolean(
      base.taskType !== 'clarify' && draft.taskType && draft.taskType !== base.taskType,
    );
    const preParserHasHighRiskWorkflow = base.taskType === 'workflow';
    const task: BusinessTask = {
      ...base,
      entities: [...base.entities],
      metrics: [...base.metrics],
      filters: { ...base.filters },
      sort: base.sort ? [...base.sort] : undefined,
      requiredFields: base.requiredFields ? [...base.requiredFields] : undefined,
      ambiguities: base.ambiguities ? [...base.ambiguities] : undefined,
      missingSlots: [...base.missingSlots],
    };

    if (draft.domain) {
      task.domain = draft.domain;
      if (domainConflict) warnings.push('preparser_domain_used_as_slot_enhancer');
    }

    if (draft.taskType && !preParserHasHighRiskWorkflow) {
      task.taskType = draft.taskType;
      if (taskTypeConflict) warnings.push('preparser_taskType_used_as_slot_enhancer');
    } else if (draft.taskType && preParserHasHighRiskWorkflow && draft.taskType !== task.taskType) {
      warnings.push('llm_taskType_ignored_by_high_risk_workflow_slot');
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

    if ((!task.event || task.event === 'unknown') && draft.event) {
      task.event = draft.event;
    } else if (draft.event && task.event && task.event !== 'unknown' && draft.event !== task.event) {
      warnings.push('llm_event_ignored_by_deterministic_slot');
    }

    if (domainConflict) {
      task.metrics = draft.metrics?.length ? [...draft.metrics].slice(0, 8) : [];
    } else if (draft.metrics?.length) {
      task.metrics = Array.from(new Set([...task.metrics, ...draft.metrics])).slice(0, 8);
    }

    if (domainConflict) {
      task.entities = draft.entities?.length ? this.mergeEntities([], draft.entities) : [];
    } else if (draft.entities?.length) {
      task.entities = this.mergeEntities(task.entities, draft.entities);
    }

    if (!domainConflict && draft.filters) {
      task.filters = { ...draft.filters, ...task.filters };
    }

    if (!domainConflict && !task.sort?.length && draft.sort?.length) task.sort = draft.sort;
    if (draft.outputMode && this.canAcceptOutputMode(task.taskType, draft.outputMode)) task.outputMode = draft.outputMode;
    else task.outputMode = this.deriveOutputMode(task.taskType, task.limit);
    if (draft.outputIntent) task.outputIntent = task.outputIntent ?? draft.outputIntent;
    if (draft.requiredFields?.length) {
      task.requiredFields = Array.from(new Set([...(task.requiredFields ?? []), ...draft.requiredFields])).slice(0, 12);
    }
    if (draft.ambiguities?.length) {
      task.ambiguities = Array.from(new Set([...(task.ambiguities ?? []), ...draft.ambiguities])).slice(0, 8);
    }

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
    const clarificationQuestion = valid ? null : this.buildClarificationQuestion(task, missingSlots, confidence);

    return {
      valid,
      confidence,
      missingSlots,
      warnings,
      clarificationQuestion,
    };
  }

  private buildClarificationQuestion(task: BusinessTask, missingSlots: string[], confidence: number) {
    if (missingSlots.includes('domain')) {
      return '请先说明要处理哪个业务领域，例如客户、订单、预约、库存、财务、营销或员工绩效。';
    }
    if (missingSlots.includes('taskType')) {
      return '你想查询数据、分析原因，还是生成可执行草稿？';
    }
    if (confidence < 0.6) {
      return `我理解这是${this.labelDomain(task.domain)}相关问题，但意图还不够明确，请补充你要查询、分析或执行的具体目标。`;
    }
    return '请补充一个最关键条件，例如时间范围、客户范围或要看的指标。';
  }

  private labelDomain(domain: BusinessTask['domain']) {
    const labels: Partial<Record<BusinessTask['domain'], string>> = {
      business: '经营',
      customer: '客户',
      product: '商品',
      project: '项目',
      reservation: '预约',
      schedule: '排班',
      order: '订单',
      card: '卡项',
      memberCard: '会员卡',
      inventory: '库存',
      supplyChain: '供应链',
      finance: '财务',
      marketing: '营销',
      promotion: '权益活动',
      automation: '自动化触达',
      staff: '员工绩效',
      serviceQuality: '服务质量',
      customerApp: '客户小程序',
      channel: '渠道',
      terminal: '终端',
      store: '门店',
      afterSales: '售后退款',
      unknown: '业务',
    };
    return labels[domain] ?? '业务';
  }
}
