import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useStoreStore } from '@/stores/storeStore';
import {
  confirmBrainAction,
  createBrainConversation,
  createBrainFeedback,
  getBrainRunEvents,
  listBrainConversations,
  listBrainMessages,
  rejectBrainAction,
  retryBrainAction,
  streamBrainMessage,
} from '@/api/brain';
import type {
  BrainActionDecisionResponse,
  BrainConversation,
  BrainMessage,
  BrainRoleKey,
  BrainResponseBlock,
  BrainRunEvent,
} from '@/types/brain';
import { BrainChatPanel } from './components/BrainChatPanel';
import { BrainConversationSidebar } from './components/BrainConversationSidebar';
import { BrainEvidencePanel } from './components/BrainEvidencePanel';

function conversationTitle(message: string) {
  const title = message.replace(/\s+/g, ' ').trim();
  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

export function BrainWorkspace() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const setCurrentStore = useStoreStore((state) => state.setCurrentStore);
  const userStoreIds = useAuthStore((state) => state.user?.storeIds);
  const [conversations, setConversations] = useState<BrainConversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<BrainMessage | null>(null);
  const [runEvents, setRunEvents] = useState<BrainRunEvent[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Record<string, BrainActionDecisionResponse>>({});
  const [feedbackByRun, setFeedbackByRun] = useState<Record<number, string>>({});
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const loadRunEvents = useCallback(async (message: BrainMessage | null) => {
    setSelectedAssistant(message);
    setRunEvents([]);
    const runId = message?.metadata?.runId;
    if (!runId) return;

    setLoadingEvents(true);
    try {
      const response = await getBrainRunEvents(runId);
      setRunEvents(response.events);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '运行轨迹加载失败');
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const loadMessages = useCallback(
    async (id: number) => {
      setLoadingMessages(true);
      setMessages([]);
      setSelectedAssistant(null);
      setRunEvents([]);
      try {
        const response = await listBrainMessages(id);
        setMessages(response.items);
        const latestAssistant = [...response.items].reverse().find((item) => item.role === 'assistant') ?? null;
        await loadRunEvents(latestAssistant);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '会话消息加载失败');
      } finally {
        setLoadingMessages(false);
      }
    },
    [loadRunEvents],
  );

  const loadConversations = useCallback(async (selectFirst: boolean) => {
    setLoadingConversations(true);
    try {
      const response = await listBrainConversations();
      setConversations(response.items);
      if (selectFirst && response.items.length) {
        const firstId = response.items[0].id;
        setConversationId(firstId);
        await loadMessages(firstId);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '会话列表加载失败');
    } finally {
      setLoadingConversations(false);
    }
  }, [loadMessages]);

  useEffect(() => {
    if (currentStoreId === null && userStoreIds?.length === 1) {
      setCurrentStore(userStoreIds[0]);
    }
  }, [currentStoreId, setCurrentStore, userStoreIds]);

  useEffect(() => {
    if (currentStoreId === null) {
      setLoadingConversations(false);
      return;
    }
    void loadConversations(true);
  }, [currentStoreId, loadConversations]);

  const createConversation = useCallback(async (title?: string) => {
    if (useStoreStore.getState().currentStoreId === null) {
      toast.error('请先在顶部选择具体门店');
      return null;
    }
    setCreatingConversation(true);
    try {
      const conversation = await createBrainConversation(title);
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      setConversationId(conversation.id);
      setMessages([]);
      setSelectedAssistant(null);
      setRunEvents([]);
      return conversation;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '新建会话失败');
      return null;
    } finally {
      setCreatingConversation(false);
    }
  }, []);

  async function handleSelectConversation(id: number) {
    if (id === conversationId) return;
    setConversationId(id);
    await loadMessages(id);
  }

  async function handleSend(text: string, roleHint?: BrainRoleKey) {
    if (sending) return;
    setSending(true);

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const created = await createConversation(conversationTitle(text));
      activeConversationId = created?.id ?? null;
    }

    if (!activeConversationId) {
      setSending(false);
      return;
    }

    const optimisticId = -Date.now();
    const streamingAssistantId = optimisticId - 1;
    const optimisticMessage: BrainMessage = {
      id: optimisticId,
      conversationId: activeConversationId,
      role: 'user',
      content: text,
      metadata: { roleHint, timezone: 'Asia/Shanghai' },
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);

    try {
      let streamedAnswer = '';
      const streamedBlocks: BrainResponseBlock[] = [];
      const response = await streamBrainMessage(
        activeConversationId,
        {
          message: text,
          roleHint,
          timezone: 'Asia/Shanghai',
        },
        (event) => {
          if (event.type === 'answer_delta') {
            streamedAnswer += String(event.data.delta ?? '');
          } else if (event.type === 'block_completed' && event.data.block && typeof event.data.block === 'object') {
            streamedBlocks[Number(event.data.index ?? streamedBlocks.length)] = event.data.block as BrainResponseBlock;
          } else {
            return;
          }
          setMessages((current) => {
            const existing = current.some((item) => item.id === streamingAssistantId);
            const streamingMessage: BrainMessage = {
              id: streamingAssistantId,
              conversationId: activeConversationId,
              role: 'assistant',
              content: streamedAnswer,
              metadata: { status: 'running', blocks: streamedBlocks.filter(Boolean) },
              createdAt: new Date().toISOString(),
            };
            return existing
              ? current.map((item) => (item.id === streamingAssistantId ? streamingMessage : item))
              : [...current, streamingMessage];
          });
        },
      );
      const persisted = await listBrainMessages(activeConversationId);
      setMessages(persisted.items);
      const assistant = [...persisted.items]
        .reverse()
        .find((item) => item.role === 'assistant' && item.metadata?.runId === response.runId);
      await loadRunEvents(assistant ?? null);
      await loadConversations(false);
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== optimisticId && item.id !== streamingAssistantId));
      toast.error(error instanceof Error ? error.message : 'Ami Brain 回答失败');
    } finally {
      setSending(false);
    }
  }

  async function handleAction(actionId: string, runId: number, decision: 'confirm' | 'reject' | 'retry') {
    setPendingActionId(actionId);
    try {
      const response = decision === 'confirm'
        ? await confirmBrainAction(actionId, runId)
        : decision === 'retry'
          ? await retryBrainAction(actionId, runId)
          : await rejectBrainAction(actionId, runId);
      setActionResults((current) => ({ ...current, [actionId]: response }));
      if (response.status === 'succeeded') toast.success(response.receipt?.message ?? '动作执行成功');
      else if (response.status === 'rejected') toast.success('已拒绝动作');
      else if (response.status === 'failed') toast.error(response.error?.message ?? '动作执行失败');
      else if (response.status === 'expired') toast.error('动作确认已过期，请重新生成预览');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '动作处理失败');
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleFeedback(runId: number, rating: string) {
    setFeedbackLoading(true);
    try {
      await createBrainFeedback({ runId, rating });
      setFeedbackByRun((current) => ({ ...current, [runId]: rating }));
      toast.success('反馈已记录');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '反馈提交失败');
    } finally {
      setFeedbackLoading(false);
    }
  }

  const selectedRunId = selectedAssistant?.metadata?.runId;

  return (
    <div className="flex h-full min-h-0 bg-background">
      <BrainConversationSidebar
        conversations={conversations}
        selectedId={conversationId}
        loading={loadingConversations}
        creating={creatingConversation}
        onCreate={() => void createConversation()}
        onRefresh={() => void loadConversations(false)}
        onSelect={(id) => void handleSelectConversation(id)}
      />
      <BrainChatPanel
        conversationId={conversationId}
        messages={messages}
        loadingMessages={loadingMessages}
        sending={sending}
        onCreateConversation={() => void createConversation()}
        onSend={handleSend}
        onSelectAssistant={(message) => void loadRunEvents(message)}
      />
      <BrainEvidencePanel
        message={selectedAssistant}
        events={runEvents}
        loadingEvents={loadingEvents}
        actionResults={actionResults}
        pendingActionId={pendingActionId}
        feedbackRating={selectedRunId ? feedbackByRun[selectedRunId] : undefined}
        feedbackLoading={feedbackLoading}
        onConfirmAction={(actionId, runId) => void handleAction(actionId, runId, 'confirm')}
        onRejectAction={(actionId, runId) => void handleAction(actionId, runId, 'reject')}
        onRetryAction={(actionId, runId) => void handleAction(actionId, runId, 'retry')}
        onFeedback={(runId, rating) => void handleFeedback(runId, rating)}
      />
    </div>
  );
}
