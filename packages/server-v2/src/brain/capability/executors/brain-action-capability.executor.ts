import { Injectable } from '@nestjs/common';
import type { BrainCognitionResult } from '../../cognition/brain-cognition.service.js';
import type { BrainQuestionIntentResult } from '../../cognition/brain-question-intent.service.js';
import { BrainDomainAdapterRegistryService } from '../../domain/brain-domain-adapter-registry.service.js';
import type {
  BrainDomainAdapterKey,
  BrainDomainAnswer,
  BrainDomainRole,
  BrainRoleIntentPlan,
} from '../../domain/brain-domain-adapter.types.js';
import type {
  BrainCapabilityExecutionInput,
  BrainCapabilityExecutor,
  BrainCapabilityToolArgs,
} from '../brain-capability-executor.registry.js';
import { structuredEntityMentions } from '../brain-capability-structured-args.js';

interface ActionCapabilityDefinition {
  adapterKey: BrainDomainAdapterKey;
  role: BrainDomainRole;
  domain: BrainRoleIntentPlan['domain'];
}

const CAPABILITIES: Record<string, ActionCapabilityDefinition> = {
  reservation_action_preview: { adapterKey: 'front_desk', role: 'receptionist', domain: 'front_desk' },
  customer_follow_up_draft: { adapterKey: 'customer_service', role: 'customer_service', domain: 'customer_service' },
  purchase_order_draft: { adapterKey: 'inventory_procurement', role: 'inventory', domain: 'inventory_procurement' },
  marketing_touch_draft: { adapterKey: 'marketing_growth', role: 'marketing', domain: 'marketing_growth' },
};

@Injectable()
export class BrainActionCapabilityExecutor implements BrainCapabilityExecutor {
  readonly kind = 'action' as const;
  readonly capabilityKeys = Object.freeze(Object.keys(CAPABILITIES));

  constructor(private readonly adapterRegistry: BrainDomainAdapterRegistryService) {}

  async execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    const definition = CAPABILITIES[input.card.key];
    if (!definition) throw new Error(`unsupported_action_capability:${input.card.key}`);

    const plan: BrainRoleIntentPlan = {
      role: definition.role,
      domain: definition.domain,
      intent: 'action',
      answerShape: 'non_metric',
      adapterKey: definition.adapterKey,
      capabilityKey: input.card.key,
      capabilityVersion: input.card.version,
      executionPlanId: input.planId,
      requiredPermissions: [...input.card.requiredPermissions],
      confidence: 1,
      grounding: 'preview_action',
      reason: `capability_executor:${input.card.key}`,
    };
    const adapter = this.adapterRegistry.resolve(plan);
    if (!adapter) return this.clarification(definition.adapterKey, 'capability_not_open');

    const answer = await adapter.execute({
      context: input.context,
      dto: { message: input.question, timezone: input.context.timezone },
      runId: input.runId,
      cognition: this.actionCognition(input.question, input.args as BrainCapabilityToolArgs),
      runtimeIntent: this.actionRuntimeIntent(),
      plan,
    });
    if (!answer) return this.clarification(definition.adapterKey, 'capability_not_open');
    this.assertPreviewOnly(answer);
    return answer;
  }

  private assertPreviewOnly(answer: BrainDomainAnswer) {
    if (answer.grounding === 'none') {
      const reason = String(answer.metadata?.unsupportedReason ?? '');
      if (!/(target|capability|not_open|requires|missing|high_risk)/i.test(reason)) {
        throw new Error('action_executor_invalid_clarification');
      }
      return;
    }
    if (answer.grounding !== 'preview_action') {
      throw new Error(`action_executor_non_preview_result:${answer.grounding}`);
    }

    const actions = Array.isArray(answer.suggestedActions) ? answer.suggestedActions : [];
    if (!actions.length) throw new Error('action_preview_missing_suggested_action');
    for (const action of actions) {
      if (!action || typeof action !== 'object') throw new Error('action_preview_invalid_suggested_action');
      const value = action as Record<string, unknown>;
      if (value.requiresConfirmation !== true || typeof value.actionId !== 'string' || !value.actionId.trim()) {
        throw new Error('action_preview_invalid_suggested_action');
      }
    }

    const serialized = JSON.stringify(answer);
    if (/\breceipt\b|already executed|successfully executed|\u5df2\u6267\u884c|\u6267\u884c\u6210\u529f/i.test(serialized)) {
      throw new Error('action_preview_contains_execution_receipt');
    }
  }

  private clarification(adapterKey: BrainDomainAdapterKey, unsupportedReason: string): BrainDomainAnswer {
    return {
      status: 'completed',
      answer: '当前动作目标或能力尚未就绪，请补充缺失目标后再生成操作预览。',
      citations: [],
      suggestedActions: [],
      grounding: 'none',
      metadata: { adapterKey, unsupportedReason },
    };
  }

  private actionCognition(question: string, args: BrainCapabilityToolArgs): BrainCognitionResult {
    return {
      normalizedText: question.trim(),
      terms: [],
      metrics: Array.isArray(args.metrics)
        ? args.metrics.flatMap((value) => this.definitionKey(value, 'metric.'))
        : [],
      dimensions: Array.isArray(args.dimensions)
        ? args.dimensions.flatMap((value) => this.definitionKey(value, 'dimension.'))
        : [],
      entities: structuredEntityMentions(args).map((entity) => ({
        slot: entity.entityType,
        entityKey: entity.entityKey ?? entity.mention,
        label: entity.mention,
      })),
      unsupportedTerms: [],
      intent: { key: 'general_assistant', confidence: 1, reason: 'capability_action_execution' },
      needsClarification: false,
    };
  }

  private definitionKey(value: unknown, prefix: string): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const key = (value as Record<string, unknown>).definitionKey;
    return typeof key === 'string' && key.startsWith(prefix) ? [key.slice(prefix.length)] : [];
  }

  private actionRuntimeIntent(): BrainQuestionIntentResult {
    return {
      intent: 'action',
      expectedShape: 'non_metric',
      allowsScalarMetric: false,
      reason: 'capability_action_execution',
    };
  }
}
