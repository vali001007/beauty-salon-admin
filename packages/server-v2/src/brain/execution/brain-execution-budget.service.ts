import { BadRequestException, Injectable, RequestTimeoutException } from '@nestjs/common';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import {
  BRAIN_EXECUTION_MAX_BUDGET_MS,
  BRAIN_EXECUTION_MAX_REPLANS,
  type BrainExecutionPlan,
} from '../planning/brain-execution-plan.schema.js';

export interface BrainExecutionBudgetState {
  readonly startedAtMs: number;
  readonly deadlineMs: number;
  readonly budgetMs: number;
  readonly replanCount: number;
}

@Injectable()
export class BrainExecutionBudgetService {
  assertPlanFits(plan: BrainExecutionPlan, cardsByKey: ReadonlyMap<string, BrainCapabilityCard>): void {
    if (plan.budgetMs < 1 || plan.budgetMs > BRAIN_EXECUTION_MAX_BUDGET_MS) {
      throw new BadRequestException('brain_execution_budget_invalid');
    }
    if (plan.replanCount < 0 || plan.replanCount > BRAIN_EXECUTION_MAX_REPLANS) {
      throw new BadRequestException('brain_execution_replan_limit_exceeded');
    }
    const durationByNode = new Map<string, number>();
    const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
    const visit = (nodeId: string, stack: Set<string>): number => {
      const cached = durationByNode.get(nodeId);
      if (cached !== undefined) return cached;
      if (stack.has(nodeId)) throw new BadRequestException('brain_execution_plan_cycle');
      const node = nodes.get(nodeId);
      if (!node) throw new BadRequestException(`brain_execution_dependency_missing:${nodeId}`);
      const card = cardsByKey.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion));
      if (!card) throw new BadRequestException(`brain_execution_capability_missing:${node.capabilityKey}`);
      const nextStack = new Set(stack).add(nodeId);
      const dependencyDuration = node.dependsOn.reduce(
        (maximum, dependencyId) => Math.max(maximum, visit(dependencyId, nextStack)),
        0,
      );
      const duration = dependencyDuration + card.timeoutMs;
      durationByNode.set(nodeId, duration);
      return duration;
    };
    const criticalPathMs = plan.nodes.reduce((maximum, node) => Math.max(maximum, visit(node.id, new Set())), 0);
    if (criticalPathMs > plan.budgetMs) {
      throw new BadRequestException(`brain_execution_budget_exceeded:${criticalPathMs}:${plan.budgetMs}`);
    }
  }

  start(plan: BrainExecutionPlan, nowMs = Date.now()): BrainExecutionBudgetState {
    return Object.freeze({
      startedAtMs: nowMs,
      deadlineMs: nowMs + plan.budgetMs,
      budgetMs: plan.budgetMs,
      replanCount: plan.replanCount,
    });
  }

  assertCanStartNode(state: BrainExecutionBudgetState, card: BrainCapabilityCard, nowMs = Date.now()): void {
    const remainingMs = this.remainingMs(state, nowMs);
    if (remainingMs <= 0) {
      throw new RequestTimeoutException(`brain_execution_budget_exhausted:${remainingMs}`);
    }
  }

  remainingMs(state: BrainExecutionBudgetState, nowMs = Date.now()): number {
    return Math.max(0, state.deadlineMs - nowMs);
  }

  consumeReplan(state: BrainExecutionBudgetState): BrainExecutionBudgetState {
    if (state.replanCount >= BRAIN_EXECUTION_MAX_REPLANS) {
      throw new BadRequestException('brain_execution_replan_limit_exceeded');
    }
    return Object.freeze({ ...state, replanCount: state.replanCount + 1 });
  }
}

export function capabilityIdentity(key: string, version: number): string {
  return `${key}@${version}`;
}
