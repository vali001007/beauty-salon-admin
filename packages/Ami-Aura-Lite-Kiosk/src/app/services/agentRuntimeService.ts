import {
  appendAgentMessage,
  appendAgentV2Message,
  createAgentRun,
  createAgentV2Run,
  submitAgentFeedback,
} from '@/api';
import type {
  AgentAppendMessageRequest,
  AgentCreateRunRequest,
  AgentFeedbackRequest,
  AgentRunResultV2,
} from '@/types/agent';
import type { Role } from '../types';
import { runWithAuraAuthRepair } from './auraCoreService';
import { getActiveTerminalOperatorParams } from './terminalOperatorContext';
import { resolveTerminalPersona, toTerminalAgentRole, type TerminalAgentPersonaCode } from './agentPersonaMapping';

export const TERMINAL_AGENT_ENTRYPOINT = 'terminal:kiosk';

export type TerminalAgentEngine = 'agent_v1' | 'agent_v2';
export type TerminalAgentV2GrayMode = 'legacy_regex' | 'shadow' | 'kg_llm_preferred' | 'kg_llm_only' | 'legacy_retired';

export interface TerminalAgentContextInput {
  role: Role;
  command: string;
  personaCode?: string | null;
  sourceAction?: string | null;
  source?: string | null;
  agentEngine?: TerminalAgentEngine | null;
  agentV2GrayMode?: TerminalAgentV2GrayMode | null;
  context?: Record<string, unknown>;
}

export interface TerminalAgentRunInput extends TerminalAgentContextInput {
  activeRunId?: number | null;
}

export interface TerminalAgentFeedbackInput {
  runId: number;
  adopted: boolean;
  comment?: string;
  businessActionJson?: unknown;
}

function buildTerminalAgentContext(input: TerminalAgentContextInput): {
  context: Record<string, unknown>;
  personaCode?: TerminalAgentPersonaCode;
  agentEngine: TerminalAgentEngine;
} {
  const contextTerminal = (input.context?.terminal ?? {}) as Record<string, unknown>;
  const contextPersonaCode =
    typeof contextTerminal.personaCode === 'string' ? contextTerminal.personaCode : undefined;
  const contextAgentEngine = input.context?.agentEngine === 'agent_v2' ? 'agent_v2' : 'agent_v1';
  const agentEngine = input.agentEngine ?? contextAgentEngine;
  const contextAgentV2GrayMode =
    typeof input.context?.agentV2GrayMode === 'string' ? input.context.agentV2GrayMode : undefined;
  const terminalAgentV2GrayMode =
    typeof contextTerminal.agentV2GrayMode === 'string' ? contextTerminal.agentV2GrayMode : undefined;
  const agentV2GrayMode = resolveAgentV2GrayMode(input.agentV2GrayMode ?? contextAgentV2GrayMode ?? terminalAgentV2GrayMode);
  const agentV2Meta = agentEngine === 'agent_v2'
    ? { agentV2GrayMode, architecture: 'kg_llm_agent' }
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

function resolveAgentV2GrayMode(value: unknown): TerminalAgentV2GrayMode {
  if (
    value === 'legacy_regex' ||
    value === 'shadow' ||
    value === 'kg_llm_preferred' ||
    value === 'kg_llm_only' ||
    value === 'legacy_retired'
  ) {
    return value;
  }
  return 'kg_llm_preferred';
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

  return runWithAuraAuthRepair(() => (agentEngine === 'agent_v2' ? createAgentV2Run(payload) : createAgentRun(payload)));
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
    agentEngine === 'agent_v2' ? appendAgentV2Message(runId, payload) : appendAgentMessage(runId, payload),
  );
}

export async function submitTerminalAgentFeedback(input: TerminalAgentFeedbackInput): Promise<void> {
  const payload: AgentFeedbackRequest = {
    adopted: input.adopted,
    rating: input.adopted ? 5 : 1,
    comment: input.comment,
    businessActionJson: input.businessActionJson,
  };
  return runWithAuraAuthRepair(() => submitAgentFeedback(input.runId, payload));
}
