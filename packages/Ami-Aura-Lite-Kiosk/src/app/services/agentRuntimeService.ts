import {
  confirmBrainAction,
  createBrainConversation,
  createBrainFeedback,
  getBrainRunContext,
  rejectBrainAction,
  sendBrainMessage,
} from '@/api';
import type {
  AgentFeedbackContext,
  AgentRunResultV2,
} from '@/types/agent';
import type { BrainChatResponse, BrainRoleKey, BrainRiskLevel } from '@/types/brain';
import type { Role } from '../types';
import { runWithAuraAuthRepair } from './auraCoreService';
import { toTerminalAgentRole } from './agentPersonaMapping';

export interface TerminalAgentContextInput {
  role: Role;
  command: string;
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

interface TerminalBrainActionCode {
  runId: number;
  actionId: string;
  decision: 'confirm' | 'reject';
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
  return runWithAuraAuthRepair(() => runBrainMessage(input));
}

export async function appendTerminalAgentMessage(input: TerminalAgentRunInput): Promise<AgentRunResultV2> {
  if (!input.activeRunId) return createTerminalAgentRun(input);

  const runId = input.activeRunId;
  return runWithAuraAuthRepair(async () => {
    const remembered = readRememberedConversation(runId);
    const conversationId = remembered ?? (await getBrainRunContext(runId)).conversationId;
    return runBrainMessage(input, conversationId);
  });
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

export async function submitTerminalAgentFeedback(input: TerminalAgentFeedbackInput): Promise<void> {
  const feedbackContext = input.feedbackContext;
  const businessActionJson = feedbackContext
    ? {
        ...(input.businessActionJson && typeof input.businessActionJson === 'object' ? input.businessActionJson : {}),
        feedbackContext,
      }
    : input.businessActionJson;
  return runWithAuraAuthRepair(async () => {
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
  });
}
