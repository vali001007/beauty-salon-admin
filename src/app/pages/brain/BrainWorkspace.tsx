import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useStoreStore } from '@/stores/storeStore';
import {
  confirmBrainAction,
  createBrainConversation,
  createBrainFeedback,
  getBrainRunEvents,
  getBrainInspectionRepairPreview,
  listBrainActionStatuses,
  listBrainConversations,
  listBrainFeedbackIssues,
  listBrainInspectionInbox,
  listBrainRuntimeEvalQuestionCatalog,
  listBrainMessages,
  decideBrainInspectionRepair,
  rejectBrainAction,
  retryBrainAction,
  streamBrainMessage,
} from '@/api/brain';
import type {
  BrainActionDecisionResponse,
  BrainConversation,
  BrainEvalCatalogItem,
  BrainFeedbackIssue,
  BrainGuidanceSelection,
  BrainInspectionInboxResponse,
  BrainInspectionRepairDecision,
  BrainInspectionRepairPreview,
  BrainMessage,
  BrainRoleKey,
  BrainResponseBlock,
  BrainRunEvent,
} from '@/types/brain';
import { BrainChatPanel } from './components/BrainChatPanel';
import { BrainConversationSidebar, type BrainSidebarTab } from './components/BrainConversationSidebar';
import { BrainEvidencePanel } from './components/BrainEvidencePanel';
import { BrainInspectionInbox } from './components/BrainInspectionInbox';
import { BrainInspectionRepairDialog } from './components/BrainInspectionRepairDialog';

const CONVERSATION_PAGE_SIZE = 10;
const FEEDBACK_ISSUE_PAGE_SIZE = 10;
const EVAL_QUESTION_PAGE_SIZE = 10;

function conversationTitle(message: string) {
  const title = message.replace(/\s+/g, ' ').trim();
  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

export function BrainWorkspace() {
  const initialDebug = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      question: params.get('question')?.trim() || undefined,
      evalCase: params.get('debugEvalCase')?.trim() || undefined,
    };
  }, []);
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const setCurrentStore = useStoreStore((state) => state.setCurrentStore);
  const userStoreIds = useAuthStore((state) => state.user?.storeIds);
  const [conversations, setConversations] = useState<BrainConversation[]>([]);
  const [feedbackIssues, setFeedbackIssues] = useState<BrainFeedbackIssue[]>([]);
  const [evalQuestions, setEvalQuestions] = useState<BrainEvalCatalogItem[]>([]);
  const [sidebarTab, setSidebarTab] = useState<BrainSidebarTab>(initialDebug.evalCase ? 'eval' : 'issues');
  const [conversationPage, setConversationPage] = useState(1);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [feedbackIssuePage, setFeedbackIssuePage] = useState(1);
  const [feedbackIssueTotal, setFeedbackIssueTotal] = useState(0);
  const [evalPage, setEvalPage] = useState(1);
  const [evalTotal, setEvalTotal] = useState(0);
  const [evalCatalogTotal, setEvalCatalogTotal] = useState(0);
  const [evalSearch, setEvalSearch] = useState(initialDebug.evalCase ?? '');
  const deferredEvalSearch = useDeferredValue(evalSearch);
  const [selectedEvalQuestionId, setSelectedEvalQuestionId] = useState<string | undefined>(initialDebug.evalCase);
  const [composerPrefill, setComposerPrefill] = useState<{ key: string; message: string } | undefined>(
    initialDebug.question
      ? { key: `initial:${initialDebug.evalCase ?? initialDebug.question}`, message: initialDebug.question }
      : undefined,
  );
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<BrainMessage | null>(null);
  const [runEvents, setRunEvents] = useState<BrainRunEvent[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingFeedbackIssues, setLoadingFeedbackIssues] = useState(true);
  const [loadingEvalQuestions, setLoadingEvalQuestions] = useState(Boolean(initialDebug.evalCase));
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Record<string, BrainActionDecisionResponse>>({});
  const [feedbackByRun, setFeedbackByRun] = useState<Record<number, string>>({});
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [inspectionInbox, setInspectionInbox] = useState<BrainInspectionInboxResponse | null>(null);
  const [loadingInspectionInbox, setLoadingInspectionInbox] = useState(false);
  const [inspectionPreview, setInspectionPreview] = useState<BrainInspectionRepairPreview | null>(null);
  const [reviewingFindingId, setReviewingFindingId] = useState<number | null>(null);
  const [savingInspectionDecision, setSavingInspectionDecision] = useState(false);
  const selectedRunId = selectedAssistant?.metadata?.runId;
  const hasExecutingAction = useMemo(
    () => Object.values(actionResults).some((result) => result.status === 'queued' || result.status === 'executing'),
    [actionResults],
  );

  useEffect(() => {
    if (!selectedRunId || !hasExecutingAction) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(() => void poll(), 2_000);
        return;
      }
      try {
        const response = await listBrainActionStatuses(selectedRunId);
        if (cancelled) return;
        setActionResults((current) => ({
          ...current,
          ...Object.fromEntries(response.items.map((item) => [item.actionId, item])),
        }));
        if (response.items.some((item) => item.status === 'queued' || item.status === 'executing')) {
          timer = window.setTimeout(() => void poll(), 2_000);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 4_000);
      }
    };
    timer = window.setTimeout(() => void poll(), 1_500);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [hasExecutingAction, selectedRunId]);

  const loadRunEvents = useCallback(async (message: BrainMessage | null) => {
    setSelectedAssistant(message);
    setRunEvents([]);
    const runId = message?.metadata?.runId;
    if (!runId) return;

    setLoadingEvents(true);
    const [eventsResult, actionsResult] = await Promise.allSettled([
      getBrainRunEvents(runId),
      listBrainActionStatuses(runId),
    ]);
    if (eventsResult.status === 'fulfilled') {
      setRunEvents(eventsResult.value.events);
    } else {
      toast.error(eventsResult.reason instanceof Error ? eventsResult.reason.message : '运行轨迹加载失败');
    }
    if (actionsResult.status === 'fulfilled') {
      setActionResults((current) => ({
        ...current,
        ...Object.fromEntries(actionsResult.value.items.map((item) => [item.actionId, item])),
      }));
    } else {
      toast.error(actionsResult.reason instanceof Error ? actionsResult.reason.message : '动作状态加载失败');
    }
    setLoadingEvents(false);
  }, []);

  const loadMessages = useCallback(
    async (id: number, targetRunId?: number) => {
      setLoadingMessages(true);
      setMessages([]);
      setSelectedAssistant(null);
      setRunEvents([]);
      setActionResults({});
      try {
        const response = await listBrainMessages(id);
        setMessages(response.items);
        const targetAssistant = targetRunId
          ? response.items.find((item) => item.role === 'assistant' && item.metadata?.runId === targetRunId)
          : [...response.items].reverse().find((item) => item.role === 'assistant');
        await loadRunEvents(targetAssistant ?? null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '会话消息加载失败');
      } finally {
        setLoadingMessages(false);
      }
    },
    [loadRunEvents],
  );

  const loadFeedbackIssues = useCallback(async (page: number) => {
    setLoadingFeedbackIssues(true);
    try {
      const response = await listBrainFeedbackIssues({ page, pageSize: FEEDBACK_ISSUE_PAGE_SIZE });
      setFeedbackIssues(response.items);
      setFeedbackIssuePage(Math.max(1, Number(response.page) || page));
      setFeedbackIssueTotal(response.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '错题集加载失败');
    } finally {
      setLoadingFeedbackIssues(false);
    }
  }, []);

  const loadEvalQuestions = useCallback(async (page: number, search: string) => {
    setLoadingEvalQuestions(true);
    try {
      const response = await listBrainRuntimeEvalQuestionCatalog({
        page,
        pageSize: EVAL_QUESTION_PAGE_SIZE,
        search: search.trim() || undefined,
      });
      setEvalQuestions(response.items);
      setEvalPage(Math.max(1, Number(response.page) || page));
      setEvalTotal(response.total);
      setEvalCatalogTotal(response.metadata?.total ?? response.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '测评集加载失败');
    } finally {
      setLoadingEvalQuestions(false);
    }
  }, []);

  const loadConversations = useCallback(
    async (selectFirst: boolean, page: number) => {
      setLoadingConversations(true);
      try {
        const response = await listBrainConversations({ page, pageSize: CONVERSATION_PAGE_SIZE });
        setConversations(response.items);
        setConversationPage(Math.max(1, Number(response.page) || page));
        setConversationTotal(response.total);
        if (selectFirst && response.items.length) {
          const firstId = response.items[0].id;
          setConversationId(firstId);
          await loadMessages(firstId);
        } else if (selectFirst) {
          setConversationId(null);
          setMessages([]);
          setSelectedAssistant(null);
          setRunEvents([]);
          setActionResults({});
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '会话列表加载失败');
      } finally {
        setLoadingConversations(false);
      }
    },
    [loadMessages],
  );

  const loadInspectionInbox = useCallback(async (showError = true) => {
    setLoadingInspectionInbox(true);
    try {
      setInspectionInbox(await listBrainInspectionInbox(10));
    } catch (error) {
      if (showError) toast.error(error instanceof Error ? error.message : '主动风险加载失败');
    } finally {
      setLoadingInspectionInbox(false);
    }
  }, []);

  useEffect(() => {
    if (currentStoreId === null && userStoreIds?.length === 1) {
      setCurrentStore(userStoreIds[0]);
    }
  }, [currentStoreId, setCurrentStore, userStoreIds]);

  useEffect(() => {
    if (currentStoreId === null) {
      setLoadingConversations(false);
      setLoadingFeedbackIssues(false);
      setLoadingEvalQuestions(false);
      setInspectionInbox(null);
      return;
    }
    setConversationPage(1);
    setConversationTotal(0);
    setFeedbackIssuePage(1);
    setFeedbackIssueTotal(0);
    setEvalPage(1);
    setEvalTotal(0);
    void loadConversations(true, 1);
    void loadFeedbackIssues(1);
    void loadInspectionInbox();
  }, [currentStoreId, loadConversations, loadFeedbackIssues, loadInspectionInbox]);

  useEffect(() => {
    if (currentStoreId === null) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadInspectionInbox(false);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [currentStoreId, loadInspectionInbox]);

  useEffect(() => {
    if (currentStoreId === null || sidebarTab !== 'eval') return;
    void loadEvalQuestions(evalPage, deferredEvalSearch);
  }, [currentStoreId, deferredEvalSearch, evalPage, loadEvalQuestions, sidebarTab]);

  const createConversation = useCallback(
    async (title?: string) => {
      if (useStoreStore.getState().currentStoreId === null) {
        toast.error('请先在顶部选择具体门店');
        return null;
      }
      setCreatingConversation(true);
      try {
        const conversation = await createBrainConversation(title);
        setSidebarTab('history');
        setConversationId(conversation.id);
        setMessages([]);
        setSelectedAssistant(null);
        setRunEvents([]);
        setActionResults({});
        await loadConversations(false, 1);
        return conversation;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '新建会话失败');
        return null;
      } finally {
        setCreatingConversation(false);
      }
    },
    [loadConversations],
  );

  async function handleSelectConversation(id: number) {
    if (id === conversationId) return;
    setConversationId(id);
    await loadMessages(id);
  }

  async function handleSelectFeedbackIssue(issue: BrainFeedbackIssue) {
    if (issue.conversationId == null) {
      toast.error('这条错题的原会话不可用');
      return;
    }
    setConversationId(issue.conversationId);
    await loadMessages(issue.conversationId, issue.runId);
  }

  function handleSelectEvalQuestion(item: BrainEvalCatalogItem) {
    setSelectedEvalQuestionId(item.questionId);
    setComposerPrefill({ key: `eval:${item.questionId}:${Date.now()}`, message: item.question });
    const params = new URLSearchParams();
    params.set('question', item.question);
    params.set('debugEvalCase', item.questionId);
    window.history.replaceState(null, '', `/brain?${params.toString()}`);
  }

  async function handleSend(text: string, roleHint?: BrainRoleKey, guidanceSelection?: BrainGuidanceSelection) {
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
      metadata: { roleHint, timezone: 'Asia/Shanghai', ...(guidanceSelection ? { guidanceSelection } : {}) },
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);

    try {
      let streamedAnswer = '';
      let streamedStatus = '';
      const streamedBlocks: BrainResponseBlock[] = [];
      const response = await streamBrainMessage(
        activeConversationId,
        {
          message: text,
          roleHint,
          timezone: 'Asia/Shanghai',
          ...(guidanceSelection ? { guidanceSelection } : {}),
        },
        (event) => {
          if (event.type === 'progress') {
            streamedStatus = String(event.data.message ?? '正在处理...');
          } else if (event.type === 'answer_delta') {
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
              content: streamedAnswer || streamedStatus,
              metadata: {
                status: 'running',
                streamPhase: event.type === 'progress' ? String(event.data.phase ?? 'understanding') : 'answering',
                blocks: streamedBlocks.filter(Boolean),
              },
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
      await loadConversations(false, 1);
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
      const response =
        decision === 'confirm'
          ? await confirmBrainAction(actionId, runId)
          : decision === 'retry'
            ? await retryBrainAction(actionId, runId)
            : await rejectBrainAction(actionId, runId);
      setActionResults((current) => ({ ...current, [actionId]: response }));
      if (response.status === 'succeeded') toast.success(response.receipt?.message ?? '动作执行成功');
      else if (response.status === 'queued' || response.status === 'executing')
        toast.success(response.receipt?.message ?? '动作已进入执行队列');
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
      if (rating === 'needs_improvement') {
        setSidebarTab('issues');
        await loadFeedbackIssues(1);
      }
      toast.success('反馈已记录');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '反馈提交失败');
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function openInspectionReview(findingId: number) {
    setReviewingFindingId(findingId);
    try {
      setInspectionPreview(await getBrainInspectionRepairPreview(findingId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '巡检审查加载失败');
    } finally {
      setReviewingFindingId(null);
    }
  }

  async function decideInspection(
    decision: BrainInspectionRepairDecision,
    modifications: Record<string, unknown>,
    note: string,
  ) {
    if (!inspectionPreview) return;
    setSavingInspectionDecision(true);
    try {
      await decideBrainInspectionRepair(inspectionPreview.findingId, { decision, modifications, note });
      toast.success(decision === 'reject' ? '已拒绝该风险处理建议' : '审批已记录，业务数据尚未修改');
      setInspectionPreview(null);
      await loadInspectionInbox(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '巡检审批失败');
    } finally {
      setSavingInspectionDecision(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <BrainConversationSidebar
        activeTab={sidebarTab}
        conversations={conversations}
        issues={feedbackIssues}
        evalQuestions={evalQuestions}
        selectedId={conversationId}
        selectedRunId={selectedRunId}
        selectedEvalQuestionId={selectedEvalQuestionId}
        loading={sidebarTab === 'issues' ? loadingFeedbackIssues : sidebarTab === 'eval' ? loadingEvalQuestions : loadingConversations}
        creating={creatingConversation}
        page={conversationPage}
        pageSize={CONVERSATION_PAGE_SIZE}
        total={conversationTotal}
        issuePage={feedbackIssuePage}
        issuePageSize={FEEDBACK_ISSUE_PAGE_SIZE}
        issueTotal={feedbackIssueTotal}
        evalPage={evalPage}
        evalPageSize={EVAL_QUESTION_PAGE_SIZE}
        evalTotal={evalTotal}
        evalCatalogTotal={evalCatalogTotal}
        evalSearch={evalSearch}
        onTabChange={(tab) => {
          setSidebarTab(tab);
          if (tab === 'eval') setEvalPage(1);
        }}
        onCreate={() => void createConversation()}
        onRefresh={() =>
          void (sidebarTab === 'issues'
            ? loadFeedbackIssues(feedbackIssuePage)
            : sidebarTab === 'eval'
              ? loadEvalQuestions(evalPage, deferredEvalSearch)
              : loadConversations(false, conversationPage))
        }
        onPageChange={(page) => void loadConversations(true, page)}
        onIssuePageChange={(page) => void loadFeedbackIssues(page)}
        onEvalPageChange={setEvalPage}
        onEvalSearchChange={(value) => {
          setEvalSearch(value);
          setEvalPage(1);
        }}
        onSelect={(id) => void handleSelectConversation(id)}
        onSelectIssue={(issue) => void handleSelectFeedbackIssue(issue)}
        onSelectEvalQuestion={handleSelectEvalQuestion}
      />
      <BrainChatPanel
        conversationId={conversationId}
        messages={messages}
        selectedRunId={selectedRunId}
        loadingMessages={loadingMessages}
        sending={sending}
        prefillRequest={composerPrefill}
        onCreateConversation={() => void createConversation()}
        onSend={handleSend}
        onSelectAssistant={(message) => void loadRunEvents(message)}
        inspectionInbox={(
          <BrainInspectionInbox
            inbox={inspectionInbox}
            loading={loadingInspectionInbox}
            reviewingId={reviewingFindingId}
            onRefresh={() => void loadInspectionInbox()}
            onReview={(findingId) => void openInspectionReview(findingId)}
          />
        )}
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
      <BrainInspectionRepairDialog
        preview={inspectionPreview}
        saving={savingInspectionDecision}
        onClose={() => setInspectionPreview(null)}
        onDecision={(decision, modifications, note) => void decideInspection(decision, modifications, note)}
      />
    </div>
  );
}
