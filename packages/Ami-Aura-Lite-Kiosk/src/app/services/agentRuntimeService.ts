import {
  appendAgentMessage,
  createAgentRun,
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

export interface TerminalAgentContextInput {
  role: Role;
  command: string;
  personaCode?: string | null;
  sourceAction?: string | null;
  source?: string | null;
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
} {
  const contextTerminal = (input.context?.terminal ?? {}) as Record<string, unknown>;
  const contextPersonaCode =
    typeof contextTerminal.personaCode === 'string' ? contextTerminal.personaCode : undefined;
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
    ...(personaCode ? { personaCode } : {}),
  };

  return {
    personaCode,
    context: {
      ...(input.context ?? {}),
      terminal: {
        ...(((input.context ?? {}).terminal as Record<string, unknown> | undefined) ?? {}),
        ...terminalContext,
      },
    },
  };
}

export async function createTerminalAgentRun(input: TerminalAgentContextInput): Promise<AgentRunResultV2> {
  const operatorId = getActiveTerminalOperatorParams()?.operatorId ?? null;
  const { context, personaCode } = buildTerminalAgentContext(input);
  const payload: AgentCreateRunRequest = {
    message: input.command,
    role: toTerminalAgentRole(input.role),
    entrypoint: TERMINAL_AGENT_ENTRYPOINT,
    ...(personaCode ? { personaCode } : {}),
    operatorId,
    context,
  };

  return runWithAuraAuthRepair(() => createAgentRun(payload));
}

export async function appendTerminalAgentMessage(input: TerminalAgentRunInput): Promise<AgentRunResultV2> {
  if (!input.activeRunId) return createTerminalAgentRun(input);

  const runId = input.activeRunId;
  const operatorId = getActiveTerminalOperatorParams()?.operatorId ?? null;
  const { context, personaCode } = buildTerminalAgentContext(input);
  const payload: AgentAppendMessageRequest = {
    message: input.command,
    role: toTerminalAgentRole(input.role),
    entrypoint: TERMINAL_AGENT_ENTRYPOINT,
    ...(personaCode ? { personaCode } : {}),
    operatorId,
    context,
  };

  return runWithAuraAuthRepair(() => appendAgentMessage(runId, payload));
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
