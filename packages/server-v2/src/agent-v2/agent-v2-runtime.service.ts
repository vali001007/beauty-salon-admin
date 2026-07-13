import { Injectable, Optional } from '@nestjs/common';
import type { AgentActor, AgentPlan, AgentToolResult, AuraResponseBlock } from '../agent/agent.types.js';
import { AgentV2CapabilityDecisionService } from './capability/agent-v2-capability-decision.service.js';
import { AgentV2CapabilityMappingService } from './capability/agent-v2-capability-mapping.service.js';
import type { AgentV2CapabilityDecision } from './capability/agent-v2-capability.types.js';
import {
  AgentV2AnswerContractValidatorService,
  type AgentV2AnswerContractValidation,
} from './contracts/agent-v2-answer-contract-validator.service.js';
import { AgentV2ToolRegistryService } from './agent-v2-tool-registry.service.js';
import {
  AgentV2GrayStrategyService,
  defaultAgentV2GrayMode,
  type AgentV2GrayMode,
  type AgentV2GrayStrategy,
  isGrayMode,
} from './agent-v2-gray-strategy.service.js';
import { AgentV2IntentExtractionService } from './intent/agent-v2-intent-extraction.service.js';

export type AgentV2RuntimePlan = {
  plan: AgentPlan;
  decision: AgentV2CapabilityDecision;
  strategy: AgentV2RuntimeStrategyTrace;
};

export type AgentV2RuntimeStrategyTrace = AgentV2GrayStrategy & {
  finalEngine: 'legacy_regex' | 'kg_llm';
  kgSelectedCapabilityId?: string | null;
  legacySelectedCapabilityId?: string | null;
  fallbackReason?: string;
};

type AgentV2RuntimePlanRequest = {
  message: string;
  actor: AgentActor;
  context?: Record<string, unknown>;
};

@Injectable()
export class AgentV2RuntimeService {
  constructor(
    private readonly decisionService: AgentV2CapabilityDecisionService,
    private readonly toolRegistry: AgentV2ToolRegistryService,
    private readonly answerContractValidator: AgentV2AnswerContractValidatorService,
    @Optional() private readonly grayStrategyService?: AgentV2GrayStrategyService,
    @Optional() private readonly intentExtractionService?: AgentV2IntentExtractionService,
    @Optional() private readonly capabilityMappingService?: AgentV2CapabilityMappingService,
  ) {}

  plan(input: AgentV2RuntimePlanRequest): AgentV2RuntimePlan | null {
    if (!this.isEnabled()) return null;

    const decisionInput = this.toDecisionInput(input);
    const decisionResult = this.decide(decisionInput, input.actor, input.context);
    return this.buildRuntimePlan(input, decisionResult);
  }

  async planAsync(input: AgentV2RuntimePlanRequest): Promise<AgentV2RuntimePlan | null> {
    if (!this.isEnabled()) return null;

    const decisionInput = this.toDecisionInput(input);
    const decisionResult = await this.decideAsync(decisionInput, input.actor, input.context);
    return this.buildRuntimePlan(input, decisionResult);
  }

  private buildRuntimePlan(
    input: AgentV2RuntimePlanRequest,
    decisionResult: { decision: AgentV2CapabilityDecision; strategy: AgentV2RuntimeStrategyTrace },
  ): AgentV2RuntimePlan | null {
    const decision = decisionResult.decision;
    const selected = decision.selected;
    if (!selected) return null;
    if (!decision.toolPlan.length) return null;
    if (!this.canExecuteInsideV2(selected.executor.tool)) return null;

    const plan: AgentPlan = {
      intentType: selected.actions.includes('draft') ? 'draft' : 'query',
      goal: selected.displayName,
      toolPlan: decision.toolPlan,
      confidence: decision.confidence,
      clarificationNeeded: false,
      executionPath: 'fast',
      businessTask: {
        architecture: this.planArchitecture(decisionResult.strategy),
        question: input.message,
        domain: selected.domain,
        businessObject: selected.businessObject,
        eventTypes: selected.eventTypes ?? [],
        sourceModels: selected.sourceModels,
        releaseStrategy: selected.releaseStrategy,
        boundaryWarnings: decision.boundaryWarnings,
        agentV2GrayStrategy: decisionResult.strategy,
        engineVersion: decisionResult.strategy.mode,
      },
      capabilityPlan: {
        capabilityId: selected.capabilityId,
        reason: decision.reason,
      },
      outputContract: {
        requiredKinds: selected.outputKinds,
        preferredKinds: selected.outputKinds,
        evidenceRequired: selected.outputKinds.includes('evidence_panel'),
        maxFollowUps: 2,
      },
    };

    return { plan, decision, strategy: decisionResult.strategy };
  }

  listTools() {
    return this.toolRegistry.list();
  }

  getTool(name: string) {
    return this.toolRegistry.get(name);
  }

  executeTool(name: string, args: Record<string, unknown>, context: Parameters<AgentV2ToolRegistryService['execute']>[2]) {
    return this.toolRegistry.execute(name, args, context);
  }

  validateAnswer(input: {
    question: string;
    plan: AgentPlan;
    answer: string;
    toolResults: AgentToolResult[];
    renderedBlocks: AuraResponseBlock[];
  }): AgentV2AnswerContractValidation {
    return this.answerContractValidator.validate(input);
  }

  private toDecisionInput(input: AgentV2RuntimePlanRequest): Parameters<AgentV2CapabilityDecisionService['decide']>[0] {
    return {
      message: input.message,
      role: input.actor.role,
      legacyCapabilityId: null,
      excludedCapabilityIds: this.excludedCapabilityIds(input.context),
    };
  }

  private canExecuteInsideV2(toolName: string) {
    return Boolean(this.toolRegistry.get(toolName));
  }

  private excludedCapabilityIds(context?: Record<string, unknown>) {
    const retry = this.asObject(context?.agentV2ContractRetry);
    const value = retry?.excludedCapabilityIds;
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  }

  private isEnabled() {
    return process.env.AGENT_CAPABILITY_DECISION_V2 !== 'false';
  }

  private decide(
    decisionInput: Parameters<AgentV2CapabilityDecisionService['decide']>[0],
    actor: AgentActor,
    context?: Record<string, unknown>,
  ): { decision: AgentV2CapabilityDecision; strategy: AgentV2RuntimeStrategyTrace } {
    let legacyDecisionResult: AgentV2CapabilityDecision | null = null;
    let kgDecisionResult: AgentV2CapabilityDecision | null = null;
    const legacyDecision = () => {
      legacyDecisionResult ??= this.decisionService.decide(decisionInput);
      return legacyDecisionResult;
    };
    const kgDecision = () => {
      kgDecisionResult ??= this.decideWithKgIntent(decisionInput, actor);
      return kgDecisionResult;
    };
    const strategy = this.resolveGrayStrategy({ actor, context, legacyDecision, kgDecision });

    if (strategy.mode === 'legacy_regex') {
      const decision = legacyDecision();
      return {
        decision,
        strategy: {
          ...strategy,
          finalEngine: 'legacy_regex',
          legacySelectedCapabilityId: decision.selected?.capabilityId ?? null,
        },
      };
    }

    if (strategy.mode === 'shadow') {
      const kg = kgDecision();
      const legacy = legacyDecision();
      return {
        decision: legacy,
        strategy: {
          ...strategy,
          finalEngine: 'legacy_regex',
          kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
          legacySelectedCapabilityId: legacy.selected?.capabilityId ?? null,
          fallbackReason: 'shadow_mode_returns_legacy_decision',
        },
      };
    }

    const kg = kgDecision();
    if (strategy.mode === 'kg_llm_preferred') {
      const legacy = legacyDecision();
      if (this.shouldFallbackToLegacyOnDisagreement(kg, legacy)) {
        return {
          decision: legacy,
          strategy: {
            ...strategy,
            finalEngine: 'legacy_regex',
            kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
            legacySelectedCapabilityId: legacy.selected?.capabilityId ?? null,
            fallbackReason: 'legacy_high_confidence_disagreement',
          },
        };
      }
      if (this.isExecutableDecision(kg)) {
        return {
          decision: kg,
          strategy: {
            ...strategy,
            finalEngine: 'kg_llm',
            kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
          },
        };
      }
      return {
        decision: legacy,
        strategy: {
          ...strategy,
          finalEngine: 'legacy_regex',
          kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
          legacySelectedCapabilityId: legacy.selected?.capabilityId ?? null,
          fallbackReason: this.kgFallbackReason(kg),
        },
      };
    }

    return {
      decision: kg,
      strategy: {
        ...strategy,
        finalEngine: 'kg_llm',
        kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
      },
    };
  }

  private async decideAsync(
    decisionInput: Parameters<AgentV2CapabilityDecisionService['decide']>[0],
    actor: AgentActor,
    context?: Record<string, unknown>,
  ): Promise<{ decision: AgentV2CapabilityDecision; strategy: AgentV2RuntimeStrategyTrace }> {
    let legacyDecisionResult: AgentV2CapabilityDecision | null = null;
    let kgDecisionResult: Promise<AgentV2CapabilityDecision> | null = null;
    const legacyDecision = () => {
      legacyDecisionResult ??= this.decisionService.decide(decisionInput);
      return legacyDecisionResult;
    };
    const kgDecision = () => {
      kgDecisionResult ??= this.decideWithKgIntentAsync(decisionInput, actor);
      return kgDecisionResult;
    };
    const strategy = await this.resolveGrayStrategyAsync({ actor, context, legacyDecision, kgDecision });

    if (strategy.mode === 'legacy_regex') {
      const decision = legacyDecision();
      return {
        decision,
        strategy: {
          ...strategy,
          finalEngine: 'legacy_regex',
          legacySelectedCapabilityId: decision.selected?.capabilityId ?? null,
        },
      };
    }

    if (strategy.mode === 'shadow') {
      const kg = await kgDecision();
      const legacy = legacyDecision();
      return {
        decision: legacy,
        strategy: {
          ...strategy,
          finalEngine: 'legacy_regex',
          kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
          legacySelectedCapabilityId: legacy.selected?.capabilityId ?? null,
          fallbackReason: 'shadow_mode_returns_legacy_decision',
        },
      };
    }

    const kg = await kgDecision();
    if (strategy.mode === 'kg_llm_preferred') {
      const legacy = legacyDecision();
      if (this.shouldFallbackToLegacyOnDisagreement(kg, legacy)) {
        return {
          decision: legacy,
          strategy: {
            ...strategy,
            finalEngine: 'legacy_regex',
            kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
            legacySelectedCapabilityId: legacy.selected?.capabilityId ?? null,
            fallbackReason: 'legacy_high_confidence_disagreement',
          },
        };
      }
      if (this.isExecutableDecision(kg)) {
        return {
          decision: kg,
          strategy: {
            ...strategy,
            finalEngine: 'kg_llm',
            kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
          },
        };
      }
      return {
        decision: legacy,
        strategy: {
          ...strategy,
          finalEngine: 'legacy_regex',
          kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
          legacySelectedCapabilityId: legacy.selected?.capabilityId ?? null,
          fallbackReason: this.kgFallbackReason(kg),
        },
      };
    }

    return {
      decision: kg,
      strategy: {
        ...strategy,
        finalEngine: 'kg_llm',
        kgSelectedCapabilityId: kg.selected?.capabilityId ?? null,
      },
    };
  }

  private resolveGrayStrategy(input: {
    actor: AgentActor;
    context?: Record<string, unknown>;
    legacyDecision: () => AgentV2CapabilityDecision;
    kgDecision: () => AgentV2CapabilityDecision;
  }) {
    const initial = this.grayStrategyService?.resolve({ actor: input.actor, context: input.context }) ?? this.fallbackStrategy(input.context);
    if (!this.grayStrategyService || initial.source === 'context' || !this.grayStrategyService.hasCapabilityScopedRules()) {
      return initial;
    }
    const capabilityIds = [
      input.legacyDecision().selected?.capabilityId,
      input.kgDecision().selected?.capabilityId,
    ];
    return this.resolveWithCapabilityRules(input.actor, input.context, capabilityIds, initial);
  }

  private async resolveGrayStrategyAsync(input: {
    actor: AgentActor;
    context?: Record<string, unknown>;
    legacyDecision: () => AgentV2CapabilityDecision;
    kgDecision: () => Promise<AgentV2CapabilityDecision>;
  }) {
    const initial = await (this.grayStrategyService?.resolveAsync({ actor: input.actor, context: input.context }) ?? Promise.resolve(this.fallbackStrategy(input.context)));
    if (!this.grayStrategyService || initial.source === 'context' || !await this.grayStrategyService.hasCapabilityScopedRulesAsync()) {
      return initial;
    }
    const kg = await input.kgDecision();
    const capabilityIds = [
      input.legacyDecision().selected?.capabilityId,
      kg.selected?.capabilityId,
    ];
    return this.resolveWithCapabilityRulesAsync(input.actor, input.context, capabilityIds, initial);
  }

  private resolveWithCapabilityRules(
    actor: AgentActor,
    context: Record<string, unknown> | undefined,
    capabilityIds: Array<string | null | undefined>,
    fallback: AgentV2GrayStrategy,
  ) {
    const normalizedCapabilityIds = capabilityIds.map((value) => String(value ?? '').trim()).filter(Boolean);
    if (!normalizedCapabilityIds.length || !this.grayStrategyService) return fallback;
    return this.grayStrategyService.resolve({
      actor,
      context,
      capabilityIds: normalizedCapabilityIds,
    });
  }

  private async resolveWithCapabilityRulesAsync(
    actor: AgentActor,
    context: Record<string, unknown> | undefined,
    capabilityIds: Array<string | null | undefined>,
    fallback: AgentV2GrayStrategy,
  ) {
    const normalizedCapabilityIds = capabilityIds.map((value) => String(value ?? '').trim()).filter(Boolean);
    if (!normalizedCapabilityIds.length || !this.grayStrategyService) return fallback;
    return this.grayStrategyService.resolveAsync({
      actor,
      context,
      capabilityIds: normalizedCapabilityIds,
    });
  }

  private decideWithKgIntent(
    decisionInput: Parameters<AgentV2CapabilityDecisionService['decide']>[0],
    actor: AgentActor,
  ): AgentV2CapabilityDecision {
    if (!this.intentExtractionService || !this.capabilityMappingService) {
      return {
        selected: null,
        confidence: 0,
        reason: 'KG intent engine dependencies are not registered.',
        candidates: [],
        excluded: [],
        outputIntent: 'answer_text',
        toolPlan: [],
        boundaryWarnings: ['kg_intent_dependencies_missing'],
      };
    }
    const intent = this.intentExtractionService.extract({
      question: decisionInput.message,
      role: actor.role,
      storeId: actor.storeId,
    });
    return this.capabilityMappingService.map({ intent, decisionInput });
  }

  private async decideWithKgIntentAsync(
    decisionInput: Parameters<AgentV2CapabilityDecisionService['decide']>[0],
    actor: AgentActor,
  ): Promise<AgentV2CapabilityDecision> {
    if (!this.intentExtractionService || !this.capabilityMappingService) {
      return {
        selected: null,
        confidence: 0,
        reason: 'KG intent engine dependencies are not registered.',
        candidates: [],
        excluded: [],
        outputIntent: 'answer_text',
        toolPlan: [],
        boundaryWarnings: ['kg_intent_dependencies_missing'],
      };
    }
    const intent = await this.intentExtractionService.extractAsync({
      question: decisionInput.message,
      role: actor.role,
      storeId: actor.storeId,
      userId: actor.userId,
    });
    return this.capabilityMappingService.map({ intent, decisionInput });
  }

  private isExecutableDecision(decision: AgentV2CapabilityDecision) {
    return Boolean(decision.selected && decision.toolPlan.length && this.canExecuteInsideV2(decision.selected.executor.tool));
  }

  private shouldFallbackToLegacyOnDisagreement(
    kg: AgentV2CapabilityDecision,
    legacy: AgentV2CapabilityDecision,
  ) {
    if (!this.isExecutableDecision(kg) || !this.isExecutableDecision(legacy)) return false;
    if (kg.selected?.capabilityId === legacy.selected?.capabilityId) return false;
    if (legacy.confidence >= 0.86) return true;
    if (kg.selected?.capabilityId === 'agent.multi-domain.summary' && legacy.confidence >= 0.62) return true;
    return false;
  }

  private kgFallbackReason(decision: AgentV2CapabilityDecision) {
    if (!decision.selected) return decision.reason || 'kg_llm_no_selected_capability';
    if (!decision.toolPlan.length) return 'kg_llm_selected_without_tool_plan';
    if (!this.canExecuteInsideV2(decision.selected.executor.tool)) return `kg_llm_tool_not_registered:${decision.selected.executor.tool}`;
    return 'kg_llm_not_executable';
  }

  private fallbackStrategy(context?: Record<string, unknown>): AgentV2GrayStrategy {
    const fallback = this.intentEngineFallback(context);
    const mode = fallback.mode;
    return {
      mode,
      engine: mode === 'legacy_regex' ? 'legacy_regex' : mode === 'shadow' ? 'shadow' : 'kg_llm',
      source: fallback.source,
      reason: fallback.reason,
      allowLegacyFallback: mode === 'kg_llm_preferred' || mode === 'shadow',
      recordShadow: mode === 'shadow',
      legacyRetired: mode === 'legacy_retired',
    };
  }

  private intentEngineFallback(context?: Record<string, unknown>): {
    mode: AgentV2GrayMode;
    source: AgentV2GrayStrategy['source'];
    reason: string;
  } {
    const contextMode = String(context?.agentV2GrayMode ?? context?.grayMode ?? '');
    if (isGrayMode(contextMode)) {
      return {
        mode: contextMode,
        source: 'context',
        reason: '调试上下文显式指定灰度模式。',
      };
    }
    const globalMode = process.env.AGENT_V2_GRAY_MODE;
    if (isGrayMode(globalMode)) {
      return {
        mode: globalMode,
        source: 'env_global',
        reason: '命中 AGENT_V2_GRAY_MODE 全局灰度模式。',
      };
    }
    const value = process.env.AGENT_INTENT_ENGINE;
    const shadowCompare = ['1', 'true', 'yes', 'on'].includes(String(process.env.AGENT_INTENT_SHADOW_COMPARE ?? '').trim().toLowerCase());
    if (value === 'shadow' || shadowCompare) {
      return {
        mode: 'shadow',
        source: 'env_legacy',
        reason: value === 'shadow' ? '兼容 AGENT_INTENT_ENGINE=shadow。' : '兼容 AGENT_INTENT_SHADOW_COMPARE=true，开启影子对比。',
      };
    }
    if (value === 'kg_llm') {
      return {
        mode: 'kg_llm_preferred',
        source: 'env_legacy',
        reason: '兼容 AGENT_INTENT_ENGINE=kg_llm，默认保留旧链路回退。',
      };
    }
    if (isGrayMode(value)) {
      return {
        mode: value,
        source: 'env_legacy',
        reason: `兼容 AGENT_INTENT_ENGINE=${value}。`,
      };
    }
    const defaultMode = defaultAgentV2GrayMode();
    return {
      mode: defaultMode.mode,
      source: 'default',
      reason: defaultMode.reason,
    };
  }

  private planArchitecture(strategy: AgentV2RuntimeStrategyTrace) {
    if (strategy.finalEngine === 'legacy_regex' && strategy.mode === 'kg_llm_preferred') return 'agent_v2_legacy_fallback';
    if (strategy.mode === 'shadow') return 'agent_v2_shadow';
    if (strategy.finalEngine === 'kg_llm') return strategy.mode === 'legacy_retired' ? 'agent_v2_kg_llm_retired' : 'agent_v2_kg_llm';
    return 'agent_v2';
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  }
}
