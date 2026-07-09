import {
  appendAgentMessage,
  appendAgentV2Message,
  appendAgentV3Message,
  appendAgentV4Message,
  appendAgentV5Message,
  createAgentRun,
  createAgentV2Run,
  createAgentV3Run,
  createAgentV4Run,
  createAgentV5Run,
  recordAmiAiAudit,
  submitAgentFeedback,
} from '@/api';
import type {
  AgentAppendMessageRequest,
  AgentCreateRunRequest,
  AgentFeedbackContext,
  AgentFeedbackRequest,
  AgentRunResultV2,
  AmiAiAuditResult,
} from '@/types/agent';
import type { Role } from '../types';
import { runWithAuraAuthRepair } from './auraCoreService';
import { getActiveTerminalOperatorParams } from './terminalOperatorContext';
import { resolveTerminalPersona, toTerminalAgentRole, type TerminalAgentPersonaCode } from './agentPersonaMapping';

export const TERMINAL_AGENT_ENTRYPOINT = 'terminal:kiosk';

export type TerminalAgentEngine = 'agent_v1' | 'agent_v2' | 'agent_v3' | 'agent_v4' | 'agent_v5';

export interface TerminalAgentContextInput {
  role: Role;
  command: string;
  personaCode?: string | null;
  sourceAction?: string | null;
  source?: string | null;
  agentEngine?: TerminalAgentEngine | null;
  context?: Record<string, unknown>;
}

export interface TerminalAgentRunInput extends TerminalAgentContextInput {
  activeRunId?: number | null;
}

export interface TerminalAgentFeedbackInput {
  runId: number;
  adopted: boolean;
  comment?: string;
  feedbackContext?: AgentFeedbackContext;
  businessActionJson?: unknown;
}

export interface TerminalAmiAiAuditInput {
  role: Role;
  command: string;
  answer: string;
  businessContext?: string;
  fallbackReason?: string | null;
  latencyMs?: number | null;
}

function buildTerminalAgentContext(input: TerminalAgentContextInput): {
  context: Record<string, unknown>;
  personaCode?: TerminalAgentPersonaCode;
  agentEngine: TerminalAgentEngine;
} {
  const contextTerminal = (input.context?.terminal ?? {}) as Record<string, unknown>;
  const contextPersonaCode =
    typeof contextTerminal.personaCode === 'string' ? contextTerminal.personaCode : undefined;
  const contextAgentEngine = resolveTerminalAgentEngine(input.context?.agentEngine);
  const agentEngine = input.agentEngine ?? contextAgentEngine;
  const agentV2Meta = agentEngine === 'agent_v2'
    ? { architecture: 'kg_llm_agent' }
    : agentEngine === 'agent_v3'
      ? { architecture: 'agent_v3_text_to_sql', agentV3Mode: 'execute' }
      : agentEngine === 'agent_v5'
        ? { architecture: 'agent_v5_business_ontology_agent', agentV5Mode: 'execute', boundary: 'drafts_followups_and_approval_only' }
      : agentEngine === 'agent_v4'
        ? { architecture: 'agent_v4_lifecycle_business_agent', agentV4Mode: 'execute', boundary: 'drafts_and_approval_only' }
        : {};
  const personaCode = input.personaCode
    ? resolveTerminalPersona(input.role, input.personaCode)
    : contextPersonaCode
      ? resolveTerminalPersona(input.role, contextPersonaCode)
      : undefined;
  const terminalContext = {
    entrypoint: TERMINAL_AGENT_ENTRYPOINT,
    role: input.role,
    sourceAction: input.sourceAction ?? undefined,
    source: input.source ?? undefined,
    command: input.command,
    agentEngine,
    ...agentV2Meta,
    ...(personaCode ? { personaCode } : {}),
  };

  return {
    personaCode,
    agentEngine,
    context: {
      ...(input.context ?? {}),
      agentEngine,
      ...agentV2Meta,
      terminal: {
        ...(((input.context ?? {}).terminal as Record<string, unknown> | undefined) ?? {}),
        ...terminalContext,
      },
    },
  };
}

function resolveTerminalAgentEngine(value: unknown): TerminalAgentEngine {
  if (value === 'agent_v5') return 'agent_v5';
  if (value === 'agent_v4') return 'agent_v4';
  if (value === 'agent_v3') return 'agent_v3';
  if (value === 'agent_v2') return 'agent_v2';
  return 'agent_v1';
}

export async function createTerminalAgentRun(input: TerminalAgentContextInput): Promise<AgentRunResultV2> {
  const operatorId = getActiveTerminalOperatorParams()?.operatorId ?? null;
  const { context, personaCode, agentEngine } = buildTerminalAgentContext(input);
  const payload: AgentCreateRunRequest = {
    message: input.command,
    role: toTerminalAgentRole(input.role),
    entrypoint: TERMINAL_AGENT_ENTRYPOINT,
    ...(personaCode ? { personaCode } : {}),
    operatorId,
    context,
  };

  return runWithAuraAuthRepair(() => {
    if (agentEngine === 'agent_v5') return createAgentV5Run(payload);
    if (agentEngine === 'agent_v4') return createAgentV4Run(payload);
    if (agentEngine === 'agent_v3') return createAgentV3Run(payload);
    if (agentEngine === 'agent_v2') return createAgentV2Run(payload);
    return createAgentRun(payload);
  });
}

export async function appendTerminalAgentMessage(input: TerminalAgentRunInput): Promise<AgentRunResultV2> {
  if (!input.activeRunId) return createTerminalAgentRun(input);

  const runId = input.activeRunId;
  const operatorId = getActiveTerminalOperatorParams()?.operatorId ?? null;
  const { context, personaCode, agentEngine } = buildTerminalAgentContext(input);
  const payload: AgentAppendMessageRequest = {
    message: input.command,
    role: toTerminalAgentRole(input.role),
    entrypoint: TERMINAL_AGENT_ENTRYPOINT,
    ...(personaCode ? { personaCode } : {}),
    operatorId,
    context,
  };

  return runWithAuraAuthRepair(() =>
    agentEngine === 'agent_v5'
      ? appendAgentV5Message(runId, payload)
      : agentEngine === 'agent_v4'
      ? appendAgentV4Message(runId, payload)
      : agentEngine === 'agent_v3'
        ? appendAgentV3Message(runId, payload)
        : agentEngine === 'agent_v2'
          ? appendAgentV2Message(runId, payload)
          : appendAgentMessage(runId, payload),
  );
}

export async function recordTerminalAmiAiAudit(input: TerminalAmiAiAuditInput): Promise<AmiAiAuditResult> {
  const operatorId = getActiveTerminalOperatorParams()?.operatorId ?? null;
  return runWithAuraAuthRepair(() =>
    recordAmiAiAudit({
      message: input.command,
      answer: input.answer,
      role: toTerminalAgentRole(input.role),
      entrypoint: TERMINAL_AGENT_ENTRYPOINT,
      operatorId,
      fallbackReason: input.fallbackReason,
      businessContext: input.businessContext,
      latencyMs: input.latencyMs,
      source: 'terminal_ami_ai_fallback',
    }),
  );
}

export async function submitTerminalAgentFeedback(input: TerminalAgentFeedbackInput): Promise<void> {
  const feedbackContext = input.feedbackContext;
  const businessActionJson = feedbackContext
    ? {
        ...(input.businessActionJson && typeof input.businessActionJson === 'object' ? input.businessActionJson : {}),
        feedbackContext,
      }
    : input.businessActionJson;
  const payload: AgentFeedbackRequest = {
    adopted: input.adopted,
    rating: input.adopted ? 5 : 1,
    comment: input.comment,
    feedbackScope: feedbackContext?.feedbackScope,
    messageId: feedbackContext?.messageId,
    question: feedbackContext?.question,
    answer: feedbackContext?.answer,
    questionIndex: feedbackContext?.questionIndex,
    businessActionJson,
  };
  return runWithAuraAuthRepair(() => submitAgentFeedback(input.runId, payload));
}
