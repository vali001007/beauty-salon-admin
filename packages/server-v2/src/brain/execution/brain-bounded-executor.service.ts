import { BadRequestException, ForbiddenException, Injectable, Optional, RequestTimeoutException } from '@nestjs/common';
import type { BrainCapabilityRankedCandidate } from '../capability/brain-capability-retriever.service.js';
import { BrainCapabilityExecutorRegistryService } from '../capability/brain-capability-executor.registry.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import { BrainExecutionPlanValidatorService } from '../planning/brain-execution-plan-validator.service.js';
import type { BrainExecutionPlan, BrainExecutionPlanNode } from '../planning/brain-execution-plan.schema.js';
import { BrainReplannerService } from '../planning/brain-replanner.service.js';
import { BrainCompletionVerifierService, type BrainCompletionResult } from './brain-completion-verifier.service.js';
import { BrainExecutionBudgetService, capabilityIdentity, type BrainExecutionBudgetState } from './brain-execution-budget.service.js';
import { BrainObservationService, type BrainObservation } from './brain-observation.service.js';

export interface BrainBoundedExecutionResult {
  status: 'completed' | 'partial' | 'rejected';
  plan: BrainExecutionPlan;
  observations: BrainObservation[];
  completion: BrainCompletionResult;
  replanCount: number;
}

@Injectable()
export class BrainBoundedExecutorService {
  constructor(
    private readonly registry: BrainCapabilityExecutorRegistryService,
    private readonly planValidator: BrainExecutionPlanValidatorService,
    private readonly budget: BrainExecutionBudgetService,
    private readonly observationService: BrainObservationService,
    private readonly completionVerifier: BrainCompletionVerifierService,
    @Optional() private readonly replanner?: BrainReplannerService,
  ) {}

  async execute(input: {
    plan: BrainExecutionPlan;
    topK: readonly BrainCapabilityRankedCandidate[];
    context: BrainRequestContext;
    runId: number;
    question: string;
    intent: BrainSemanticIntent;
  }): Promise<BrainBoundedExecutionResult> {
    const cards = input.topK.map((item) => item.card);
    let plan = this.planValidator.validate({ plan: input.plan, cards, context: input.context });
    let budgetState = this.budget.start(plan);
    const history: BrainObservation[] = [];

    while (true) {
      const observations = await this.executePlan({ ...input, plan, cards, budgetState, history });
      history.push(...observations.filter((item) => !history.some((previous) => sameObservation(previous, item))));
      const completion = await this.completionVerifier.verify({
        plan,
        observations,
        cards,
        intent: input.intent.intent,
        successCriteria: input.intent.successCriteria,
        audit: { userId: input.context.userId, storeId: input.context.storeId },
      });
      if (completion.status === 'complete') {
        return { status: 'completed', plan, observations, completion, replanCount: plan.replanCount };
      }
      if (completion.status === 'rejected') {
        return { status: 'rejected', plan, observations, completion, replanCount: plan.replanCount };
      }
      if (!completion.recoverable || !this.replanner || plan.replanCount >= 2) {
        return { status: 'partial', plan, observations, completion, replanCount: plan.replanCount };
      }
      if (this.budget.remainingMs(budgetState) <= 0) {
        return { status: 'partial', plan, observations, completion, replanCount: plan.replanCount };
      }
      const replanning = await this.replanner.replan({
        question: input.question,
        intent: input.intent,
        topK: input.topK,
        audit: { userId: input.context.userId, storeId: input.context.storeId },
        previousPlan: plan,
        observations,
        reasons: completion.missingCriteria,
        deadlineAt: budgetState.deadlineMs,
      });
      if (replanning.status !== 'planned') {
        return { status: 'partial', plan, observations, completion, replanCount: plan.replanCount };
      }
      if (this.budget.remainingMs(budgetState) <= 0) {
        return { status: 'partial', plan, observations, completion, replanCount: plan.replanCount };
      }
      budgetState = this.budget.consumeReplan(budgetState);
      plan = this.planValidator.validate({ plan: replanning.plan, cards, context: input.context });
    }
  }

  private async executePlan(input: {
    plan: BrainExecutionPlan;
    cards: BrainCapabilityCard[];
    context: BrainRequestContext;
    runId: number;
    question: string;
    intent: BrainSemanticIntent;
    budgetState: BrainExecutionBudgetState;
    history: BrainObservation[];
  }) {
    const cards = new Map(input.cards.map((card) => [capabilityIdentity(card.key, card.version), card]));
    const observations = new Map<string, BrainObservation>();
    for (const node of input.plan.nodes) {
      const reusable = input.history.find(
        (item) =>
          item.nodeId === node.id &&
          item.capabilityKey === node.capabilityKey &&
          item.capabilityVersion === node.capabilityVersion &&
          item.status === 'completed',
      );
      if (reusable) observations.set(node.id, reusable);
    }

    while (observations.size < input.plan.nodes.length) {
      const pending = input.plan.nodes.filter((node) => !observations.has(node.id));
      const ready = pending.filter((node) => node.dependsOn.every((dependency) => observations.has(dependency)));
      if (!ready.length) throw new Error('brain_bounded_executor_no_ready_nodes');

      for (const node of ready) {
        const failedDependency = node.dependsOn
          .map((dependency) => observations.get(dependency)!)
          .find((item) => item.status === 'failed' || item.status === 'rejected');
        if (!failedDependency) continue;
        observations.set(
          node.id,
          this.observationService.fromError({
            nodeId: node.id,
            capabilityKey: node.capabilityKey,
            capabilityVersion: node.capabilityVersion,
            status: failedDependency.status === 'rejected' ? 'rejected' : 'failed',
            errorCode: `dependency_${failedDependency.status}:${failedDependency.nodeId}`,
            startedAt: new Date(),
          }),
        );
      }

      const executable = ready.filter((node) => !observations.has(node.id));
      const readOnly = executable.filter((node) => cards.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion))?.readOnly);
      if (readOnly.length) {
        const results = await Promise.all(
          readOnly.map((node) => this.executeNode(node, observations, cards, input)),
        );
        for (const result of results) observations.set(result.nodeId, result);
        continue;
      }
      const node = executable[0];
      if (!node) continue;
      const result = await this.executeNode(node, observations, cards, input);
      observations.set(result.nodeId, result);
    }
    return input.plan.nodes.map((node) => observations.get(node.id)!);
  }

  private async executeNode(
    node: BrainExecutionPlanNode,
    observations: ReadonlyMap<string, BrainObservation>,
    cards: ReadonlyMap<string, BrainCapabilityCard>,
    input: {
      context: BrainRequestContext;
      runId: number;
      question: string;
      plan: BrainExecutionPlan;
      intent: BrainSemanticIntent;
      budgetState: BrainExecutionBudgetState;
    },
  ) {
    const startedAt = new Date();
    const card = cards.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion));
    if (!card) throw new Error(`brain_execution_capability_missing:${node.capabilityKey}`);
    try {
      const executableNode = { ...node, args: this.applyMappings(node, observations) };
      this.planValidator.revalidateNodeExecution({ node: executableNode, card, context: input.context });
      this.budget.assertCanStartNode(input.budgetState, card);
      const remainingMs = Math.max(1, Math.min(card.timeoutMs, input.budgetState.deadlineMs - Date.now()));
      const answer = await withTimeout(
        this.registry.execute({
          card,
          context: input.context,
          runId: input.runId,
          planId: input.plan.planId,
          question: input.question,
          answerShape: input.intent.answerShape,
          args: executableNode.args,
        }),
        remainingMs,
      );
      return this.observationService.fromAnswer({
        nodeId: node.id,
        capabilityKey: card.key,
        capabilityVersion: card.version,
        answer,
        startedAt,
      });
    } catch (error) {
      const rejected = error instanceof ForbiddenException || error instanceof BadRequestException;
      return this.observationService.fromError({
        nodeId: node.id,
        capabilityKey: card.key,
        capabilityVersion: card.version,
        status: rejected ? 'rejected' : 'failed',
        errorCode: errorCode(error),
        startedAt,
      });
    }
  }

  private applyMappings(node: BrainExecutionPlanNode, observations: ReadonlyMap<string, BrainObservation>) {
    const args = structuredClone(node.args);
    for (const mapping of node.inputMappings ?? []) {
      if (!mapping.sourcePath.startsWith('$.data.')) throw new BrainObservationMappingError();
      const observation = observations.get(mapping.fromNodeId);
      if (!observation) throw new BrainObservationMappingError();
      const value = readPath(observation, mapping.sourcePath);
      if (value === undefined) throw new BrainObservationMappingError();
      writePath(args, mapping.targetPath, structuredClone(value));
    }
    return args;
  }
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.slice(2).split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function writePath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.slice(2).split('.');
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (existing !== undefined && (!existing || typeof existing !== 'object' || Array.isArray(existing))) {
      throw new BrainObservationMappingError();
    }
    current[segment] = existing ?? {};
    current = current[segment] as Record<string, unknown>;
  }
  current[segments.at(-1)!] = value;
}

class BrainObservationMappingError extends Error {
  constructor() {
    super('brain_planner_mapping_contract_unresolved');
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new RequestTimeoutException('brain_capability_execution_timeout')), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function errorCode(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  return 'brain_capability_execution_failed';
}

function sameObservation(left: BrainObservation, right: BrainObservation) {
  return left.nodeId === right.nodeId && left.capabilityKey === right.capabilityKey && left.capabilityVersion === right.capabilityVersion;
}
