import { Injectable } from '@nestjs/common';
import type { AgentActor, AgentPlan, AgentToolResult, AuraResponseBlock } from '../agent/agent.types.js';
import { AgentV2CapabilityDecisionService } from './capability/agent-v2-capability-decision.service.js';
import type { AgentV2CapabilityDecision } from './capability/agent-v2-capability.types.js';
import {
  AgentV2AnswerContractValidatorService,
  type AgentV2AnswerContractValidation,
} from './contracts/agent-v2-answer-contract-validator.service.js';
import { AgentV2ToolRegistryService } from './agent-v2-tool-registry.service.js';

export type AgentV2RuntimePlan = {
  plan: AgentPlan;
  decision: AgentV2CapabilityDecision;
};

@Injectable()
export class AgentV2RuntimeService {
  constructor(
    private readonly decisionService: AgentV2CapabilityDecisionService,
    private readonly toolRegistry: AgentV2ToolRegistryService,
    private readonly answerContractValidator: AgentV2AnswerContractValidatorService,
  ) {}

  plan(input: { message: string; actor: AgentActor; context?: Record<string, unknown> }): AgentV2RuntimePlan | null {
    if (!this.isEnabled()) return null;

    const decision = this.decisionService.decide({
      message: input.message,
      role: input.actor.role,
      legacyCapabilityId: null,
      excludedCapabilityIds: this.excludedCapabilityIds(input.context),
    });
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
        architecture: 'agent_v2',
        question: input.message,
        domain: selected.domain,
        businessObject: selected.businessObject,
        eventTypes: selected.eventTypes ?? [],
        sourceModels: selected.sourceModels,
        releaseStrategy: selected.releaseStrategy,
        boundaryWarnings: decision.boundaryWarnings,
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

    return { plan, decision };
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

  private asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  }
}
