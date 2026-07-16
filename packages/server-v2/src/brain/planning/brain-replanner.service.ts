import { Injectable } from '@nestjs/common';
import type { BrainCapabilityRankedCandidate } from '../capability/brain-capability-retriever.service.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BrainObservation } from '../execution/brain-observation.service.js';
import type { BrainExecutionPlan } from './brain-execution-plan.schema.js';
import { BrainSupervisorPlannerService } from './brain-supervisor-planner.service.js';

@Injectable()
export class BrainReplannerService {
  constructor(private readonly supervisor: BrainSupervisorPlannerService) {}

  replan(input: {
    question: string;
    intent: BrainSemanticIntent;
    topK: readonly BrainCapabilityRankedCandidate[];
    audit: { userId: number; storeId: number };
    previousPlan: BrainExecutionPlan;
    observations: readonly BrainObservation[];
    reasons: readonly string[];
  }) {
    if (input.observations.some((item) => item.status === 'rejected')) {
      return Promise.resolve({ status: 'unavailable', errorCode: 'PLAN_POLICY_INVALID', reason: 'replan_rejected_observation_forbidden' } as const);
    }
    if (!input.reasons.length || input.reasons.some((reason) => !/^(no_data|failed|missing_|citation_|ranking_|action_)/.test(reason))) {
      return Promise.resolve({ status: 'unavailable', errorCode: 'PLAN_POLICY_INVALID', reason: 'replan_reason_not_recoverable' } as const);
    }
    return this.supervisor.plan({
      question: input.question,
      intent: input.intent,
      topK: input.topK,
      audit: input.audit,
      previousPlan: input.previousPlan,
      observations: input.observations.map((item) => ({
        nodeId: item.nodeId,
        capabilityKey: item.capabilityKey,
        capabilityVersion: item.capabilityVersion,
        status: item.status,
        data: item.data,
        citations: item.citations,
        errorCode: item.errorCode,
      })),
    });
  }
}
