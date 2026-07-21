import { Injectable } from '@nestjs/common';
import type { BrainCapabilityRetrievalResult } from '../capability/brain-capability-retriever.service.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import { BRAIN_EXECUTION_MAX_BUDGET_MS, type BrainExecutionPlan } from './brain-execution-plan.schema.js';

const EXECUTION_SCHEDULING_BUFFER_MS = 1_000;

export interface BrainSingleStepPlanArgs extends Record<string, unknown> {
  objective: BrainSemanticIntent['objective'];
  time?: BrainSemanticIntent['timeRange'];
  comparisonTarget?: BrainSemanticIntent['comparisonTarget'];
  entities: BrainSemanticIntent['entities'];
  metrics: BrainSemanticIntent['metrics'];
  dimensions: BrainSemanticIntent['dimensions'];
  filters: BrainSemanticIntent['filters'];
  orderBy: BrainSemanticIntent['orderBy'];
  limit?: BrainSemanticIntent['limit'];
}

export interface BrainSingleStepPlan extends BrainExecutionPlan {
  isSingleStep: true;
  nodes: [
    {
      id: 'capability_1';
      capabilityKey: string;
      capabilityVersion: number;
      dependsOn: [];
      previewOnly: boolean;
      args: BrainSingleStepPlanArgs;
    },
  ];
}

export type BrainSingleStepPlanningResult =
  | { status: 'planned'; plan: BrainSingleStepPlan }
  | { status: 'not_planned'; reason: string };

@Injectable()
export class BrainSingleStepPlannerService {
  plan(input: {
    intent: BrainSemanticIntent;
    retrieval: BrainCapabilityRetrievalResult;
  }): BrainSingleStepPlanningResult {
    if (input.retrieval.status !== 'selected') {
      return { status: 'not_planned', reason: input.retrieval.status };
    }
    const card = input.retrieval.selected;
    if (!card) return { status: 'not_planned', reason: 'selected_capability_missing' };

    const args: BrainSingleStepPlanArgs = {
      objective: input.intent.objective,
      ...(input.intent.timeRange ? { time: input.intent.timeRange } : {}),
      ...(input.intent.comparisonTarget ? { comparisonTarget: input.intent.comparisonTarget } : {}),
      entities: input.intent.entities,
      metrics: input.intent.metrics,
      dimensions: input.intent.dimensions,
      filters: input.intent.filters,
      orderBy: input.intent.orderBy,
      ...(input.intent.limit === undefined ? {} : { limit: input.intent.limit }),
    };
    return {
      status: 'planned',
      plan: {
        schemaVersion: '1.0',
        planId: `single:${card.key}:v${card.version}`,
        objective: input.intent.objective,
        isSingleStep: true,
        replanCount: 0,
        budgetMs: Math.min(card.timeoutMs + EXECUTION_SCHEDULING_BUFFER_MS, BRAIN_EXECUTION_MAX_BUDGET_MS),
        nodes: [
          {
            id: 'capability_1',
            capabilityKey: card.key,
            capabilityVersion: card.version,
            dependsOn: [],
            previewOnly: card.sideEffect,
            args,
          },
        ],
      },
    };
  }
}
