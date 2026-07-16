import { Injectable } from '@nestjs/common';
import {
  AiService,
  AiStructuredOutputError,
  type AiStructuredOutputErrorCode,
  type AiUsage,
} from '../../ai/ai.service.js';
import type { BrainCapabilityRankedCandidate } from '../capability/brain-capability-retriever.service.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import { capabilityIdentity } from '../execution/brain-execution-budget.service.js';
import {
  BRAIN_EXECUTION_MAX_BUDGET_MS,
  BRAIN_EXECUTION_PLAN_JSON_SCHEMA,
  type BrainExecutionPlan,
} from './brain-execution-plan.schema.js';
import { buildBrainSupervisorPlannerMessages } from './brain-supervisor-planner.prompt.js';
import type { BrainRoleRuntimeContext } from '../role/brain-role-context-builder.service.js';

export type BrainSupervisorPlannerErrorCode = AiStructuredOutputErrorCode | 'MODEL_UNAVAILABLE' | 'PLAN_POLICY_INVALID';

export type BrainSupervisorPlannerAudit =
  | { userId: number; storeId: number; systemActor?: never }
  | { storeId: number; systemActor: 'brain_inspection'; userId?: never };

export type BrainSupervisorPlanningResult =
  | { status: 'planned'; plan: BrainExecutionPlan; provider: string; model: string; usage: AiUsage }
  | { status: 'unavailable'; errorCode: BrainSupervisorPlannerErrorCode; reason: string };

const EXECUTION_SCHEDULING_BUFFER_MS = 1_000;

@Injectable()
export class BrainSupervisorPlannerService {
  constructor(
    private readonly aiService: AiService,
    private readonly config: BrainRuntimeConfigService,
  ) {}

  async plan(input: {
    question: string;
    intent: BrainSemanticIntent;
    topK: readonly BrainCapabilityRankedCandidate[];
    audit: BrainSupervisorPlannerAudit;
    previousPlan?: BrainExecutionPlan;
    observations?: unknown[];
    roleContext?: BrainRoleRuntimeContext;
    deadlineAt?: number;
  }): Promise<BrainSupervisorPlanningResult> {
    try {
      this.assertInput(input);
      const remainingMs = input.deadlineAt === undefined
        ? this.config.runtime.modelTimeoutMs
        : Math.floor(input.deadlineAt - Date.now());
      if (remainingMs <= 0) {
        throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'Brain Supervisor deadline is exhausted.');
      }
      const candidates = input.topK.map((item) => item.card);
      const result = await this.aiService.generateStructured<BrainExecutionPlan>({
        scenario: input.previousPlan ? 'brain.supervisor_replan.v1' : 'brain.supervisor_plan.v1',
        messages: buildBrainSupervisorPlannerMessages({
          question: input.question,
          intent: input.intent,
          candidates,
          previousPlan: input.previousPlan,
          observations: input.observations,
          roleContext: input.roleContext,
        }),
        schema: BRAIN_EXECUTION_PLAN_JSON_SCHEMA,
        timeoutMs: Math.min(this.config.runtime.modelTimeoutMs, remainingMs),
        temperature: 0,
        userId: input.audit.userId,
        storeId: input.audit.storeId,
      });
      const plan = this.normalizeBudget(this.normalizeStructuredArgs(result.data, candidates, input.intent), candidates);
      this.assertPlanPolicy(plan, candidates, input.intent, input.previousPlan);
      return { status: 'planned', plan, provider: result.provider, model: result.model, usage: result.usage };
    } catch (error) {
      if (error instanceof AiStructuredOutputError) {
        return { status: 'unavailable', errorCode: error.code, reason: error.message };
      }
      if (error instanceof BrainSupervisorPlanPolicyError) {
        return { status: 'unavailable', errorCode: 'PLAN_POLICY_INVALID', reason: error.message };
      }
      return {
        status: 'unavailable',
        errorCode: 'MODEL_UNAVAILABLE',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private assertInput(input: { question: string; topK: readonly BrainCapabilityRankedCandidate[]; audit: BrainSupervisorPlannerAudit }) {
    if (!input.question.trim() || input.question.length > 4000) throw new BrainSupervisorPlanPolicyError('supervisor_question_invalid');
    const userAudit = typeof input.audit.userId === 'number' && Number.isInteger(input.audit.userId) && input.audit.userId > 0;
    const systemAudit = input.audit.systemActor === 'brain_inspection';
    if (!userAudit && !systemAudit) throw new BrainSupervisorPlanPolicyError('supervisor_actor_invalid');
    if (!Number.isInteger(input.audit.storeId) || input.audit.storeId < 1) throw new BrainSupervisorPlanPolicyError('supervisor_store_invalid');
    if (!input.topK.length || input.topK.length > this.config.runtime.capabilityTopK) {
      throw new BrainSupervisorPlanPolicyError('supervisor_topk_invalid');
    }
  }

  private assertPlanPolicy(
    plan: BrainExecutionPlan,
    candidates: readonly BrainCapabilityCard[],
    intent: BrainSemanticIntent,
    previousPlan?: BrainExecutionPlan,
  ) {
    const allowed = new Map(candidates.map((card) => [capabilityIdentity(card.key, card.version), card]));
    if (previousPlan && plan.replanCount !== previousPlan.replanCount + 1) {
      throw new BrainSupervisorPlanPolicyError('supervisor_replan_count_invalid');
    }
    if (!previousPlan && plan.replanCount !== 0) throw new BrainSupervisorPlanPolicyError('supervisor_initial_replan_count_invalid');
    for (const node of plan.nodes) {
      const card = allowed.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion));
      if (!card) throw new BrainSupervisorPlanPolicyError(`supervisor_capability_not_in_topk:${node.capabilityKey}`);
      if (card.sideEffect && !node.previewOnly) {
        throw new BrainSupervisorPlanPolicyError(`supervisor_side_effect_preview_required:${node.id}`);
      }
      for (const mapping of node.inputMappings ?? []) {
        if (!mapping.sourcePath.startsWith('$.data.')) {
          throw new BrainSupervisorPlanPolicyError(`supervisor_mapping_source_invalid:${node.id}`);
        }
        if (!node.dependsOn.includes(mapping.fromNodeId)) {
          throw new BrainSupervisorPlanPolicyError(`supervisor_mapping_dependency_missing:${node.id}:${mapping.fromNodeId}`);
        }
      }
    }
    this.assertDomainCoverage(plan, candidates, intent);
    this.assertKnownWorkflowOrdering(plan);
  }

  private normalizeBudget(plan: BrainExecutionPlan, candidates: readonly BrainCapabilityCard[]): BrainExecutionPlan {
    const cards = new Map(candidates.map((card) => [capabilityIdentity(card.key, card.version), card]));
    const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
    const durationByNode = new Map<string, number>();
    const visit = (nodeId: string, stack: Set<string>): number => {
      const cached = durationByNode.get(nodeId);
      if (cached !== undefined) return cached;
      if (stack.has(nodeId)) throw new BrainSupervisorPlanPolicyError('supervisor_plan_cycle');
      const node = nodes.get(nodeId);
      if (!node) throw new BrainSupervisorPlanPolicyError(`supervisor_dependency_missing:${nodeId}`);
      const card = cards.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion));
      if (!card) throw new BrainSupervisorPlanPolicyError(`supervisor_capability_not_in_topk:${node.capabilityKey}`);
      const dependencyDuration = node.dependsOn.reduce(
        (maximum, dependencyId) => Math.max(maximum, visit(dependencyId, new Set(stack).add(nodeId))),
        0,
      );
      const duration = dependencyDuration + card.timeoutMs;
      durationByNode.set(nodeId, duration);
      return duration;
    };
    const criticalPathMs = plan.nodes.reduce((maximum, node) => Math.max(maximum, visit(node.id, new Set())), 0);
    if (criticalPathMs > BRAIN_EXECUTION_MAX_BUDGET_MS) {
      throw new BrainSupervisorPlanPolicyError(`supervisor_critical_path_exceeded:${criticalPathMs}`);
    }
    return {
      ...plan,
      budgetMs: Math.min(
        BRAIN_EXECUTION_MAX_BUDGET_MS,
        Math.max(plan.budgetMs, criticalPathMs + EXECUTION_SCHEDULING_BUFFER_MS),
      ),
    };
  }

  private normalizeStructuredArgs(
    plan: BrainExecutionPlan,
    candidates: readonly BrainCapabilityCard[],
    intent: BrainSemanticIntent,
  ): BrainExecutionPlan {
    const cards = new Map(candidates.map((card) => [capabilityIdentity(card.key, card.version), card]));
    return {
      ...plan,
      nodes: plan.nodes.map((node) => {
        const card = cards.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion));
        if (!card) return node;
        const properties = isRecord(card.inputSchema.properties) ? card.inputSchema.properties : {};
        const args = { ...node.args };
        if ('objective' in properties) args.objective = intent.objective;
        if ('time' in properties) {
          if (intent.timeRange) args.time = intent.timeRange;
          else delete args.time;
        }
        if ('comparisonTarget' in properties) {
          if (intent.comparisonTarget) args.comparisonTarget = intent.comparisonTarget;
          else delete args.comparisonTarget;
        }
        if ('entities' in properties) args.entities = intent.entities;
        if ('metrics' in properties) args.metrics = intent.metrics;
        if ('dimensions' in properties) args.dimensions = intent.dimensions;
        if ('filters' in properties) args.filters = intent.filters;
        if ('orderBy' in properties) args.orderBy = intent.orderBy;
        if ('limit' in properties) {
          if (intent.limit !== undefined) args.limit = intent.limit;
          else delete args.limit;
        }
        return { ...node, args };
      }),
    };
  }

  private assertDomainCoverage(plan: BrainExecutionPlan, candidates: readonly BrainCapabilityCard[], intent: BrainSemanticIntent) {
    const byIdentity = new Map(candidates.map((card) => [capabilityIdentity(card.key, card.version), card]));
    const plannedDomains = new Set(
      plan.nodes.flatMap((node) => byIdentity.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion))?.domains ?? []),
    );
    for (const domain of intent.domains) {
      if (!plannedDomains.has(domain) && candidates.some((card) => card.domains.includes(domain))) {
        throw new BrainSupervisorPlanPolicyError(`supervisor_domain_not_covered:${domain}`);
      }
    }
  }

  private assertKnownWorkflowOrdering(plan: BrainExecutionPlan) {
    const schedules = plan.nodes.filter((node) => node.capabilityKey === 'reservation_list');
    const candidatesNodes = plan.nodes.filter((node) => ['customer_facts', 'marketing_customer_segment'].includes(node.capabilityKey));
    const reminderDrafts = plan.nodes.filter((node) => node.capabilityKey === 'customer_follow_up_draft');
    const touches = plan.nodes.filter((node) => node.capabilityKey === 'marketing_touch_draft');
    if (schedules.length && candidatesNodes.length && reminderDrafts.length) {
      requireDependency(reminderDrafts, [...schedules, ...candidatesNodes], 'schedule_candidates_to_reminder');
    }
    if (reminderDrafts.length && touches.length) requireDependency(touches, reminderDrafts, 'reminder_to_touch');
  }
}

function requireDependency(
  targets: BrainExecutionPlan['nodes'],
  sources: BrainExecutionPlan['nodes'],
  code: string,
) {
  const sourceIds = new Set(sources.map((node) => node.id));
  if (targets.some((target) => ![...sourceIds].every((sourceId) => target.dependsOn.includes(sourceId)))) {
    throw new BrainSupervisorPlanPolicyError(`supervisor_workflow_dependency_invalid:${code}`);
  }
}

class BrainSupervisorPlanPolicyError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
