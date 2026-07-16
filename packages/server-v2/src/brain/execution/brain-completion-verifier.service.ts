import { Injectable, Optional } from '@nestjs/common';
import { AiService } from '../../ai/ai.service.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import type { BrainSemanticIntentKind } from '../cognition/brain-semantic-intent.types.js';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import { capabilityIdentity } from './brain-execution-budget.service.js';
import type { BrainObservation } from './brain-observation.service.js';
import type { BrainExecutionPlan } from '../planning/brain-execution-plan.schema.js';

export interface BrainCompletionResult {
  status: 'complete' | 'incomplete' | 'rejected';
  missingCriteria: string[];
  recoverable: boolean;
}

const DIAGNOSIS_COMPLETION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['complete', 'missingCriteria'],
  properties: {
    complete: { type: 'boolean' },
    missingCriteria: { type: 'array', maxItems: 16, items: { type: 'string', minLength: 1, maxLength: 200 } },
  },
} as const;

@Injectable()
export class BrainCompletionVerifierService {
  constructor(
    @Optional() private readonly aiService?: AiService,
    @Optional() private readonly config?: BrainRuntimeConfigService,
  ) {}

  async verify(input: {
    plan: BrainExecutionPlan;
    observations: readonly BrainObservation[];
    cards: readonly BrainCapabilityCard[];
    intent?: BrainSemanticIntentKind;
    successCriteria?: readonly string[];
    audit?: { userId: number; storeId: number };
  }): Promise<BrainCompletionResult> {
    const deterministic = this.verifyDeterministic(input);
    if (deterministic.status !== 'complete' || input.intent !== 'diagnosis') return deterministic;
    if (this.usesOnlyGovernedDomainCapabilities(input.plan, input.cards)) return deterministic;
    if (!this.aiService || !this.config || !input.audit) {
      return { status: 'incomplete', missingCriteria: ['diagnostic_completion_verifier_unavailable'], recoverable: true };
    }
    try {
      const result = await this.aiService.generateStructured<{ complete: boolean; missingCriteria: string[] }>({
        scenario: 'brain.completion_verifier.v1',
        messages: [
          { role: 'system', content: '仅判断已验证 Observation 是否满足诊断成功标准。不得补充新事实。' },
          {
            role: 'user',
            content: JSON.stringify({
              objective: input.plan.objective,
              successCriteria: input.successCriteria ?? [],
              observations: input.observations.map((item) => ({
                nodeId: item.nodeId,
                status: item.status,
                data: item.data,
                citationCount: item.citations.length,
              })),
            }),
          },
        ],
        schema: DIAGNOSIS_COMPLETION_SCHEMA,
        timeoutMs: this.config.runtime.modelTimeoutMs,
        userId: input.audit.userId,
        storeId: input.audit.storeId,
      });
      return result.data.complete
        ? deterministic
        : { status: 'incomplete', missingCriteria: result.data.missingCriteria, recoverable: true };
    } catch {
      return { status: 'incomplete', missingCriteria: ['diagnostic_completion_verification_failed'], recoverable: true };
    }
  }

  private verifyDeterministic(input: {
    plan: BrainExecutionPlan;
    observations: readonly BrainObservation[];
    cards: readonly BrainCapabilityCard[];
    intent?: BrainSemanticIntentKind;
  }): BrainCompletionResult {
    const byNode = new Map(input.observations.map((item) => [item.nodeId, item]));
    const cards = new Map(input.cards.map((card) => [capabilityIdentity(card.key, card.version), card]));
    const missing: string[] = [];
    for (const node of input.plan.nodes) {
      const observation = byNode.get(node.id);
      if (!observation) {
        missing.push(`missing_node:${node.id}`);
        continue;
      }
      if (observation.status === 'rejected') {
        return { status: 'rejected', missingCriteria: [`rejected:${node.id}:${observation.errorCode ?? 'policy'}`], recoverable: false };
      }
      if (observation.status === 'failed') missing.push(`failed:${node.id}`);
      const groundedNoData =
        observation.status === 'no_data' &&
        observation.grounding !== 'none' &&
        observation.citations.length > 0;
      if (observation.status === 'no_data' && !groundedNoData) missing.push(`no_data:${node.id}`);
      if (observation.status !== 'completed' && !groundedNoData) continue;
      const card = cards.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion));
      if (!card) {
        missing.push(`missing_card:${node.id}`);
        continue;
      }
      if (['metric_query', 'db_skill'].includes(observation.grounding) && observation.citations.length === 0) {
        missing.push(`citation_required:${node.id}`);
      }
      if (input.intent === 'ranking' && !groundedNoData) {
        const ranking = Array.isArray(observation.data.blocks)
          ? observation.data.blocks.find((block: any) => block?.kind === 'ranking')
          : undefined;
        if (!ranking || !Array.isArray(ranking.rows) || ranking.rows.length < 2) {
          missing.push(`ranking_rows_insufficient:${node.id}`);
        }
      }
      if (card.sideEffect) {
        const actions = Array.isArray(observation.data.suggestedActions) ? observation.data.suggestedActions : [];
        if (observation.grounding !== 'preview_action' || actions.length === 0) {
          missing.push(`action_preview_required:${node.id}`);
        }
      }
      const dataQuality = observation.data.metadata && typeof observation.data.metadata === 'object'
        ? (observation.data.metadata as Record<string, unknown>).dataQuality
        : undefined;
      if (dataQuality && typeof dataQuality === 'object' && (dataQuality as Record<string, unknown>).status === 'degraded') {
        const ruleCounts = (dataQuality as Record<string, unknown>).ruleCounts;
        const ruleKeys = ruleCounts && typeof ruleCounts === 'object' ? Object.keys(ruleCounts as Record<string, unknown>) : [];
        missing.push(`data_quality:${node.id}:${ruleKeys.length ? ruleKeys.join(',') : 'degraded'}`);
      }
    }
    return missing.length
      ? { status: 'incomplete', missingCriteria: [...new Set(missing)], recoverable: true }
      : { status: 'complete', missingCriteria: [], recoverable: false };
  }

  private usesOnlyGovernedDomainCapabilities(
    plan: BrainExecutionPlan,
    cards: readonly BrainCapabilityCard[],
  ): boolean {
    const byIdentity = new Map(cards.map((card) => [capabilityIdentity(card.key, card.version), card]));
    return plan.nodes.length > 0 && plan.nodes.every((node) =>
      byIdentity.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion))?.grounding === 'domain_service',
    );
  }
}
