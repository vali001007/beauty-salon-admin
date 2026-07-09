import { useCallback, useState } from 'react';
import type { AgentConversationMessage } from '../types/conversation';
import { getAgentResultDisplayModel } from '../logic/answerContract';
import type {
  AgentAppendMessageRequest,
  AgentCreateRunRequest,
  AgentFeedbackRequest,
  AgentRunResultV2,
} from '../types/result';
import type { AgentPersonaCode, AgentRole } from '../types/persona';

export interface AgentConversationApi {
  createRun(data: AgentCreateRunRequest): Promise<AgentRunResultV2>;
  appendMessage(runId: number, data: AgentAppendMessageRequest): Promise<AgentRunResultV2>;
  submitFeedback?(runId: number, data: AgentFeedbackRequest): Promise<void>;
}

export interface UseAgentConversationOptions<TMessage extends AgentConversationMessage = AgentConversationMessage> {
  api: AgentConversationApi;
  role?: AgentRole;
  entrypoint?: string;
  personaCode?: AgentPersonaCode | string;
  operatorId?: number | null;
  context?: Record<string, unknown>;
  createMessageId?: (prefix: 'u' | 'a') => string;
  formatError?: (error: unknown) => string;
  mapAgentResult?: (result: AgentRunResultV2) => Partial<TMessage>;
}

export interface SendAgentMessageOptions {
  role?: AgentRole;
  entrypoint?: string;
  personaCode?: AgentPersonaCode | string;
  operatorId?: number | null;
  context?: Record<string, unknown>;
}

function defaultCreateMessageId(prefix: 'u' | 'a'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultFormatError(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后重试';
}

export function useAgentConversation<TMessage extends AgentConversationMessage = AgentConversationMessage>(
  options: UseAgentConversationOptions<TMessage>,
) {
  const [messages, setMessages] = useState<TMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);

  const createMessageId = options.createMessageId ?? defaultCreateMessageId;
  const formatError = options.formatError ?? defaultFormatError;

  const reset = useCallback(() => {
    setMessages([]);
    setActiveRunId(null);
    setSending(false);
  }, []);

  const updateMessage = useCallback((messageId: string, patch: Partial<TMessage>) => {
    setMessages((prev) => prev.map((message) => (message.id === messageId ? { ...message, ...patch } : message)));
  }, []);

  const updateLastAgentMessage = useCallback((patch: Partial<TMessage>) => {
    setMessages((prev) => {
      let lastAgentIndex = -1;
      for (let index = prev.length - 1; index >= 0; index -= 1) {
        if (prev[index].role === 'agent') {
          lastAgentIndex = index;
          break;
        }
      }
      if (lastAgentIndex < 0) return prev;
      return prev.map((message, index) => (index === lastAgentIndex ? { ...message, ...patch } : message));
    });
  }, []);

  const sendMessage = useCallback(
    async (rawText: string, sendOptions: SendAgentMessageOptions = {}) => {
      const text = rawText.trim();
      if (!text || sending) return null;

      const userMessage = {
        id: createMessageId('u'),
        role: 'user',
        text,
      } as TMessage;
      const agentMessageId = createMessageId('a');
      const agentMessage = {
        id: agentMessageId,
        role: 'agent',
        loading: true,
      } as TMessage;

      setMessages((prev) => [...prev, userMessage, agentMessage]);
      setSending(true);

      try {
        const role = sendOptions.role ?? options.role;
        const personaCode = sendOptions.personaCode ?? options.personaCode;
        const operatorId = sendOptions.operatorId ?? options.operatorId;
        const context = sendOptions.context ?? options.context;
        const result = activeRunId
          ? await options.api.appendMessage(activeRunId, {
              message: text,
              role,
              entrypoint: sendOptions.entrypoint ?? options.entrypoint,
              personaCode,
              operatorId,
              context,
            })
          : await options.api.createRun({
              message: text,
              role,
              entrypoint: sendOptions.entrypoint ?? options.entrypoint,
              personaCode,
              operatorId,
              context,
            });

        setActiveRunId(result.runId);
        const displayModel = getAgentResultDisplayModel(result);
        const mappedPatch = options.mapAgentResult?.(result) ?? {};
        const mappedMetadata = (mappedPatch as { metadata?: Record<string, unknown> }).metadata;
        const agentMessagePatch = {
          loading: false,
          text: result.answer,
          blocks: displayModel.blocks,
          followUpSuggestions: displayModel.followUpSuggestions,
          evidence: displayModel.evidence,
          actions: displayModel.actions,
          limitations: displayModel.limitations,
          statusNotice: displayModel.statusNotice,
          ...mappedPatch,
          metadata: {
            ...(mappedMetadata ?? {}),
            feedbackScope: 'message',
            feedbackQuestion: text,
          },
          runId: result.runId,
          personaCode: result.personaCode,
          routeDecision: result.routeDecision,
        };
        updateMessage(agentMessageId, agentMessagePatch as unknown as Partial<TMessage>);
        return result;
      } catch (error) {
        updateMessage(agentMessageId, {
          loading: false,
          error: formatError(error),
        } as Partial<TMessage>);
        return null;
      } finally {
        setSending(false);
      }
    },
    [
      activeRunId,
      createMessageId,
      formatError,
      options,
      sending,
      updateMessage,
    ],
  );

  const submitFeedback = useCallback(
    async (runId: number, data: AgentFeedbackRequest) => {
      if (!options.api.submitFeedback) return;
      await options.api.submitFeedback(runId, data);
    },
    [options.api],
  );

  return {
    messages,
    setMessages,
    sending,
    activeRunId,
    setActiveRunId,
    sendMessage,
    submitFeedback,
    updateLastAgentMessage,
    reset,
  };
}
