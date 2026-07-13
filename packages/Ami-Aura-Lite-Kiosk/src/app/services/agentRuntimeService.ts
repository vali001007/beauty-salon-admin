import {
  appendAgentMessage,
  appendAgentV2Message,
  appendAgentV3Message,
  appendAgentV4Message,
  appendAgentV5Message,
  confirmBrainAction,
  createBrainConversation,
  createBrainFeedback,
  createAgentRun,
  createAgentV2Run,
  createAgentV3Run,
  createAgentV4Run,
  createAgentV5Run,
  recordAmiAiAudit,
  getBrainRunContext,
  rejectBrainAction,
  sendBrainMessage,
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
import type { BrainChatResponse, BrainRoleKey, BrainRiskLevel } from '@/types/brain';
import type { Role } from '../types';
import { runWithAuraAuthRepair } from './auraCoreService';
import { getActiveTerminalOperatorParams } from './terminalOperatorContext';
import { resolveTerminalPersona, toTerminalAgentRole, type TerminalAgentPersonaCode } from './agentPersonaMapping';

export const TERMINAL_AGENT_ENTRYPOINT = 'terminal:kiosk';

export type TerminalAgentEngine = 'ami_brain' | 'agent_v1' | 'agent_v2' | 'agent_v3' | 'agent_v4' | 'agent_v5';

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

interface TerminalBrainActionCode {
  runId: number;
  actionId: string;
  decision: 'confirm' | 'reject';
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
  if (value === 'ami_brain') return 'ami_brain';
  if (value === 'agent_v5') return 'agent_v5';
  if (value === 'agent_v4') return 'agent_v4';
  if (value === 'agent_v3') return 'agent_v3';
  if (value === 'agent_v2') return 'agent_v2';
  return 'ami_brain';
}

function toBrainRole(role: Role): BrainRoleKey {
  if (role === 'beautician') return 'beautician';
  if (role === 'reception') return 'receptionist';
  return 'store_manager';
}

function toAgentRisk(risk: BrainRiskLevel): 'low' | 'medium' | 'high' {
  return risk === 'critical' ? 'high' : risk;
}

function runConversationKey(runId: number) {
  return `ami-brain:kiosk:run:${runId}`;
}

function rememberBrainRun(runId: number, conversationId: number) {
  window.localStorage.setItem(runConversationKey(runId), String(conversationId));
}

function readRememberedConversation(runId: number) {
  const value = Number(window.localStorage.getItem(runConversationKey(runId)));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function parseTerminalBrainAction(action: string): TerminalBrainActionCode | null {
  const match = action.match(/^brain:(\d+):([^:]+)(:cancel)?$/);
  if (!match) return null;
  return {
    runId: Number(match[1]),
    actionId: decodeURIComponent(match[2]),
    decision: match[3] ? 'reject' : 'confirm',
  };
}

function mapBrainResult(response: BrainChatResponse, role: Role): AgentRunResultV2 {
  const confirmationActions = response.suggestedActions.filter((action) => action.requiresConfirmation);
  const citations = response.citations;
  return {
    runId: response.runId,
    runNo: `BRAIN-${response.runId}`,
    status: response.status === 'failed'
      ? 'failed'
      : confirmationActions.length
        ? 'waiting_approval'
        : response.status === 'completed'
          ? 'completed'
          : 'composing',
    answer: response.answer,
    plan: {
      intentType: confirmationActions.length ? 'draft' : 'query',
      goal: response.answer.slice(0, 80) || 'Ami Brain 经营协助',
      toolPlan: citations.map((citation) => ({ tool: `brain.${citation.sourceType}`, args: { sourceId: citation.sourceId } })),
      confidence: 1,
      clarificationNeeded: Boolean(response.clarification),
      clarificationQuestion: response.clarification?.question ?? null,
      executionPath: 'deep',
      businessTask: { architecture: 'ami_brain', conversationId: response.conversationId },
    },
    toolResults: citations.length
      ? [{
          status: 'success',
          title: 'Ami Brain 数据依据',
          summary: citations.map((citation) => citation.label ?? citation.sourceId).join('、'),
          evidence: {
            source: citations.map((citation) => citation.sourceId),
            metricDefinition: citations.map((citation) => citation.definition).filter(Boolean).join('；') || 'Ami Brain 受治理口径',
            filters: [],
          },
        }]
      : [],
    actions: response.suggestedActions.map((action) => ({
      label: action.summary,
      action: `brain:${response.runId}:${encodeURIComponent(action.actionId)}`,
      riskLevel: toAgentRisk(action.riskLevel),
      payload: action,
    })),
    evidence: citations.length
      ? {
          source: citations.map((citation) => citation.sourceId),
          metricDefinition: citations.map((citation) => citation.definition).filter(Boolean).join('；') || 'Ami Brain 受治理口径',
          filters: [],
        }
      : undefined,
    renderedBlocks: confirmationActions.map((action) => ({
      kind: 'confirm_action' as const,
      title: action.actionType || action.skillKey || '待确认动作',
      preview: action.summary,
      actionId: `brain:${response.runId}:${encodeURIComponent(action.actionId)}`,
      riskLevel: toAgentRisk(action.riskLevel),
      impactSummary: action.impactItems?.map((item) => item.label).join('、'),
    })),
    followUpSuggestions: response.clarification?.options.map((option) => option.label) ?? [],
    responseMode: confirmationActions.length ? 'structured_blocks' : 'composed_answer',
    personaCode: toTerminalAgentRole(role),
  };
}

async function runBrainMessage(input: TerminalAgentContextInput, conversationId?: number) {
  const conversation = conversationId
    ? { id: conversationId }
    : await createBrainConversation('Ami Aura Lite');
  const response = await sendBrainMessage(conversation.id, {
    message: input.command,
    roleHint: toBrainRole(input.role),
    timezone: 'Asia/Shanghai',
  });
  rememberBrainRun(response.runId, response.conversationId);
  return mapBrainResult(response, input.role);
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
    if (agentEngine === 'ami_brain') return runBrainMessage(input);
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
  if (agentEngine === 'ami_brain') {
    return runWithAuraAuthRepair(async () => {
      const remembered = readRememberedConversation(runId);
      const conversationId = remembered ?? (await getBrainRunContext(runId)).conversationId;
      return runBrainMessage(input, conversationId);
    });
  }
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

export async function decideTerminalBrainAction(action: string): Promise<AgentRunResultV2> {
  const parsed = parseTerminalBrainAction(action);
  if (!parsed) throw new Error('无效的 Ami Brain 动作指令');
  const result = await runWithAuraAuthRepair(() => parsed.decision === 'confirm'
    ? confirmBrainAction(parsed.actionId, parsed.runId)
    : rejectBrainAction(parsed.actionId, parsed.runId));
  const succeeded = result.status === 'succeeded' || result.status === 'rejected';
  const receiptMessage = result.receipt?.message;
  return {
    runId: result.runId,
    runNo: `BRAIN-${result.runId}`,
    status: succeeded ? 'completed' : result.status === 'failed' ? 'failed' : 'composing',
    answer: receiptMessage
      ? String(receiptMessage)
      : result.status === 'rejected'
        ? '已取消该动作，未写入业务数据。'
        : result.status === 'succeeded'
          ? '动作已执行完成。'
          : result.error?.message || `动作状态：${result.status}`,
    toolResults: [],
    actions: [],
    responseMode: 'composed_answer',
    personaCode: 'manager',
  };
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
  return runWithAuraAuthRepair(async () => {
    let brainRun = Boolean(readRememberedConversation(input.runId));
    if (!brainRun) {
      brainRun = await getBrainRunContext(input.runId).then(() => true).catch(() => false);
    }
    if (brainRun) {
      await createBrainFeedback({
        runId: input.runId,
        rating: input.adopted ? 'good' : 'bad',
        correction: {
          adopted: input.adopted,
          comment: input.comment,
          feedbackContext,
          businessActionJson,
        },
      });
      return;
    }
    await submitAgentFeedback(input.runId, payload);
  });
}
