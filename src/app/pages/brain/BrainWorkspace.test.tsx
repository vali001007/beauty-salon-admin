import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainWorkspace } from './BrainWorkspace';
import { useStoreStore } from '@/stores/storeStore';

const apiMocks = vi.hoisted(() => ({
  confirmBrainAction: vi.fn(),
  createBrainConversation: vi.fn(),
  createBrainFeedback: vi.fn(),
  getBrainRunEvents: vi.fn(),
  listBrainActionStatuses: vi.fn(),
  listBrainConversations: vi.fn(),
  listBrainFeedbackIssues: vi.fn(),
  listBrainRuntimeEvalQuestionCatalog: vi.fn(),
  listBrainMessages: vi.fn(),
  rejectBrainAction: vi.fn(),
  retryBrainAction: vi.fn(),
  streamBrainMessage: vi.fn(),
}));

vi.mock('@/api/brain', () => apiMocks);
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const conversation = {
  id: 42,
  storeId: 6,
  userId: 9,
  title: '本月经营情况',
  status: 'active',
  createdAt: '2026-07-11T01:00:00.000Z',
  updatedAt: '2026-07-11T01:00:00.000Z',
  deletedAt: null,
};

const evalQuestion = {
  questionId: 'qb-manager-staff-management-047',
  question: '今天谁请假了，有没有影响接待',
  questionType: '员工管理',
  intentType: 'diagnosis',
  persona: 'manager',
  passed: false,
  status: 'unsupported_intent',
  hitRate: 0.5,
  averageLatencyMs: 12000,
  runId: 35047,
  failureReason: 'intent:intent_mismatch',
  diagnosis: '员工请假与接待影响未形成有效回答。',
  improvementSuggestion: '补齐员工考勤与预约接待能力后重新回归。',
};

describe('BrainWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/brain');
    useStoreStore.setState({ currentStoreId: 6, stores: [] });
    apiMocks.listBrainConversations.mockResolvedValue({ items: [], total: 0, storeId: 6 });
    apiMocks.listBrainFeedbackIssues.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, storeId: 6 });
    apiMocks.listBrainRuntimeEvalQuestionCatalog.mockResolvedValue({
      metadata: { total: 650 },
      types: [],
      items: [evalQuestion],
      total: 650,
      page: 1,
      pageSize: 10,
    });
    apiMocks.listBrainMessages.mockResolvedValue({ conversationId: 42, items: [], total: 0, storeId: 6 });
    apiMocks.getBrainRunEvents.mockResolvedValue({ runId: 100, events: [], storeId: 6 });
    apiMocks.listBrainActionStatuses.mockResolvedValue({ runId: 100, items: [], storeId: 6 });
    apiMocks.createBrainFeedback.mockResolvedValue({ id: 31, runId: 100, storeId: 6, rating: 'needs_improvement', status: 'open' });
    apiMocks.createBrainConversation.mockResolvedValue(conversation);
    apiMocks.streamBrainMessage.mockImplementation(async (_conversationId, _payload, onEvent) => {
      onEvent({ type: 'run_started', data: { conversationId: 42 } });
      onEvent({
        type: 'progress',
        data: { conversationId: 42, phase: 'understanding', message: '正在理解问题并核对可用数据...' },
      });
      onEvent({ type: 'answer_delta', data: { runId: 100, delta: '本月实收流水为 19907.10 元。' } });
      return {
        conversationId: 42,
        runId: 100,
        status: 'completed',
        answer: '本月实收流水为 19907.10 元。',
        citations: [{ sourceType: 'metric', sourceId: 'paid_revenue', label: '实收流水' }],
        suggestedActions: [],
      };
    });
  });

  it('shows live progress before the persisted answer is ready', async () => {
    let resolveStream!: (value: {
      conversationId: number;
      runId: number;
      status: 'completed';
      answer: string;
      citations: never[];
      suggestedActions: never[];
    }) => void;
    apiMocks.streamBrainMessage.mockImplementation((_conversationId, _payload, onEvent) => {
      onEvent({
        type: 'progress',
        data: { conversationId: 42, phase: 'understanding', message: '正在理解问题并核对可用数据...' },
      });
      return new Promise((resolve) => {
        resolveStream = resolve;
      });
    });

    render(<BrainWorkspace />);
    await waitFor(() => expect(apiMocks.listBrainConversations).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByPlaceholderText('问经营数据、风险和下一步动作'), {
      target: { value: '本月流水多少' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('正在理解问题并核对可用数据...')).toBeInTheDocument();

    resolveStream({
      conversationId: 42,
      runId: 100,
      status: 'completed',
      answer: '本月实收流水为 19907.10 元。',
      citations: [],
      suggestedActions: [],
    });
  });

  it('renders the real conversation workspace shell', async () => {
    render(<BrainWorkspace />);

    expect(screen.getByText('Ami Brain')).toBeInTheDocument();
    expect(screen.getByText('门店经营智能体')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('问经营数据、风险和下一步动作')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '错题集' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '测评集' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: '历史记录' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('brain-chat-panel')).toHaveClass('h-full', 'overflow-hidden');
    expect(screen.getByTestId('brain-message-scroll')).toHaveClass('overflow-y-auto');
    expect(screen.getByTestId('brain-composer')).toHaveClass('shrink-0');
    await waitFor(() => expect(apiMocks.listBrainConversations).toHaveBeenCalledOnce());
    expect(apiMocks.listBrainConversations).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });

  it('loads the shared 650-question eval catalog and prefills the selected question for debugging', async () => {
    render(<BrainWorkspace />);

    fireEvent.click(screen.getByRole('tab', { name: '测评集' }));

    expect(await screen.findByText(evalQuestion.question)).toBeInTheDocument();
    expect(apiMocks.listBrainRuntimeEvalQuestionCatalog).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      search: undefined,
    });
    expect(screen.getByRole('tab', { name: /测评集\s*650/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('button', { name: new RegExp(evalQuestion.question) }));

    expect(screen.getByPlaceholderText('问经营数据、风险和下一步动作')).toHaveValue(evalQuestion.question);
    expect(window.location.search).toContain('debugEvalCase=qb-manager-staff-management-047');
    expect(apiMocks.streamBrainMessage).not.toHaveBeenCalled();
  });

  it('opens the eval-set tab and locates the case sent from the governance eval center', async () => {
    window.history.replaceState(
      null,
      '',
      `/brain?question=${encodeURIComponent(evalQuestion.question)}&debugEvalCase=${evalQuestion.questionId}`,
    );
    apiMocks.listBrainRuntimeEvalQuestionCatalog.mockResolvedValue({
      metadata: { total: 650 },
      types: [],
      items: [evalQuestion],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    render(<BrainWorkspace />);

    expect(screen.getByRole('tab', { name: '测评集' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText('问经营数据、风险和下一步动作')).toHaveValue(evalQuestion.question);
    expect(await screen.findByText(evalQuestion.question)).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.listBrainRuntimeEvalQuestionCatalog).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      search: evalQuestion.questionId,
    }));
  });

  it('paginates conversation history and opens the first conversation on the selected page', async () => {
    const secondPageConversation = { ...conversation, id: 21, title: '上周经营复盘' };
    apiMocks.listBrainConversations
      .mockResolvedValueOnce({ items: [conversation], total: 11, page: 1, pageSize: 10, storeId: 6 })
      .mockResolvedValueOnce({ items: [secondPageConversation], total: 11, page: 2, pageSize: 10, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({ conversationId: 21, items: [], total: 0, storeId: 6 });

    render(<BrainWorkspace />);

    fireEvent.click(screen.getByRole('tab', { name: '历史记录' }));
    expect(await screen.findByText('共 11 条 · 1/2 页')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页会话' }));

    await waitFor(() => expect(apiMocks.listBrainConversations).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 }));
    expect(await screen.findByText('上周经营复盘')).toBeInTheDocument();
    expect(screen.getByText('共 11 条 · 2/2 页')).toBeInTheDocument();
    expect(apiMocks.listBrainMessages).toHaveBeenLastCalledWith(21);
  });

  it('lists needs-improvement feedback first and opens the original answer and trace', async () => {
    apiMocks.listBrainConversations.mockResolvedValue({ items: [conversation], total: 1, page: 1, pageSize: 10, storeId: 6 });
    apiMocks.listBrainFeedbackIssues.mockResolvedValue({
      items: [
        {
          feedbackId: 31,
          runId: 100,
          conversationId: 42,
          question: '本周营业额',
          answer: '当前能力未返回营业额。',
          feedbackStatus: 'open',
          runStatus: 'completed',
          createdAt: '2026-07-22T01:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      storeId: 6,
    });
    apiMocks.listBrainMessages.mockResolvedValue({
      conversationId: 42,
      total: 2,
      storeId: 6,
      items: [
        {
          id: 1,
          conversationId: 42,
          role: 'user',
          content: '本周营业额',
          metadata: null,
          createdAt: '2026-07-22T00:59:00.000Z',
        },
        {
          id: 2,
          conversationId: 42,
          role: 'assistant',
          content: '当前能力未返回营业额。',
          metadata: { runId: 100, status: 'completed' },
          createdAt: '2026-07-22T01:00:00.000Z',
        },
      ],
    });

    render(<BrainWorkspace />);

    const issue = await screen.findByRole('button', { name: /本周营业额/ });
    fireEvent.click(issue);

    await waitFor(() => expect(apiMocks.listBrainMessages).toHaveBeenLastCalledWith(42));
    expect(apiMocks.getBrainRunEvents).toHaveBeenLastCalledWith(100);
    expect(await screen.findByText('当前能力未返回营业额。')).toBeInTheDocument();
    expect(document.querySelector('[data-run-id="100"]')).toBeInTheDocument();
  });

  it('adds a needs-improvement answer to the issue set immediately after feedback', async () => {
    const persistedMessages = {
      conversationId: 42,
      total: 2,
      storeId: 6,
      items: [
        {
          id: 1,
          conversationId: 42,
          role: 'user',
          content: '本周营业额',
          metadata: null,
          createdAt: '2026-07-22T00:59:00.000Z',
        },
        {
          id: 2,
          conversationId: 42,
          role: 'assistant',
          content: '当前能力未返回营业额。',
          metadata: { runId: 100, status: 'completed' },
          createdAt: '2026-07-22T01:00:00.000Z',
        },
      ],
    };
    apiMocks.listBrainConversations.mockResolvedValue({ items: [conversation], total: 1, page: 1, pageSize: 10, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue(persistedMessages);
    apiMocks.listBrainFeedbackIssues
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 10, storeId: 6 })
      .mockResolvedValueOnce({
        items: [
          {
            feedbackId: 31,
            runId: 100,
            conversationId: 42,
            question: '本周营业额',
            answer: '当前能力未返回营业额。',
            feedbackStatus: 'open',
            runStatus: 'completed',
            createdAt: '2026-07-22T01:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        storeId: 6,
      });

    render(<BrainWorkspace />);

    expect(await screen.findByText('当前能力未返回营业额。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '需改进' }));

    await waitFor(() => expect(apiMocks.createBrainFeedback).toHaveBeenCalledWith({ runId: 100, rating: 'needs_improvement' }));
    await waitFor(() => expect(apiMocks.listBrainFeedbackIssues).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: /本周营业额/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /错题集/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('prefills a governance skill-debug question without sending it automatically', async () => {
    window.history.replaceState(
      null,
      '',
      '/brain?question=%E8%AF%B7%E8%B0%83%E8%AF%95%E9%A2%84%E7%BA%A6%E7%A9%BA%E6%A1%A3%E6%8A%80%E8%83%BD&debugSkill=appointment_gap_list',
    );

    render(<BrainWorkspace />);

    expect(screen.getByPlaceholderText('问经营数据、风险和下一步动作')).toHaveValue('请调试预约空档技能');
    expect(apiMocks.streamBrainMessage).not.toHaveBeenCalled();
  });

  it('loads persisted messages for the latest conversation', async () => {
    apiMocks.listBrainConversations.mockResolvedValue({ items: [conversation], total: 1, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({
      conversationId: 42,
      total: 2,
      storeId: 6,
      items: [
        {
          id: 1,
          conversationId: 42,
          role: 'user',
          content: '本月流水多少',
          metadata: null,
          createdAt: '2026-07-11T01:00:00.000Z',
        },
        {
          id: 2,
          conversationId: 42,
          role: 'assistant',
          content: '本月实收流水为 19907.10 元。',
          metadata: {
            runId: 100,
            status: 'completed',
            citations: [{ sourceType: 'metric', sourceId: 'paid_revenue', label: '实收流水' }],
          },
          createdAt: '2026-07-11T01:00:01.000Z',
        },
      ],
    });

    render(<BrainWorkspace />);

    expect(await screen.findByText('本月实收流水为 19907.10 元。')).toBeInTheDocument();
    expect(apiMocks.listBrainMessages).toHaveBeenCalledWith(42);
    expect(apiMocks.getBrainRunEvents).toHaveBeenCalledWith(100);
    expect(await screen.findByText('实收流水')).toBeInTheDocument();
  });

  it('does not render clarification choices as confirmable actions', async () => {
    apiMocks.listBrainConversations.mockResolvedValue({ items: [conversation], total: 1, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({
      conversationId: 42,
      total: 1,
      storeId: 6,
      items: [
        {
          id: 3,
          conversationId: 42,
          role: 'assistant',
          content: '请选择要查看的业务主题。',
          metadata: {
            runId: 101,
            status: 'completed',
            blocks: [
              {
                kind: 'clarification',
                question: '请选择要查看的业务主题。',
                options: [{ id: 'finance', label: '财务异常风险', value: 'finance' }],
              },
            ],
            suggestedActions: [{ id: 'finance', label: '财务异常风险', value: 'finance' }],
          },
          createdAt: '2026-07-11T01:00:01.000Z',
        },
      ],
    });

    render(<BrainWorkspace />);

    expect(await screen.findByText('财务异常风险')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument();
    expect(screen.queryByText('动作预览')).not.toBeInTheDocument();
  });

  it('sends a follow-up question once with provenance and keeps message controls structurally separate', async () => {
    apiMocks.listBrainConversations.mockResolvedValue({ items: [conversation], total: 1, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({
      conversationId: 42,
      total: 1,
      storeId: 6,
      items: [
        {
          id: 4,
          conversationId: 42,
          role: 'assistant',
          content: '会员与卡项经营整体正常。',
          metadata: {
            runId: 102,
            status: 'completed',
            blocks: [
              {
                kind: 'follow_up_questions',
                questions: [
                  { id: 'liability', label: '会员卡负债', value: '会员卡负债是多少？' },
                  { id: 'flow', label: '储值流水', value: '储值余额和流水分别是多少？' },
                  { id: 'expiry', label: '到期风险', value: '哪些会员卡即将到期？' },
                ],
              },
            ],
          },
          createdAt: '2026-07-11T01:00:01.000Z',
        },
      ],
    });

    const { container } = render(<BrainWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: /会员卡负债/ }));

    await waitFor(() =>
      expect(apiMocks.streamBrainMessage).toHaveBeenCalledWith(
        42,
        {
          message: '会员卡负债是多少？',
          roleHint: undefined,
          timezone: 'Asia/Shanghai',
          guidanceSelection: { kind: 'follow_up', sourceRunId: 102, optionId: 'liability' },
        },
        expect.any(Function),
      ),
    );
    expect(apiMocks.streamBrainMessage).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button button')).toBeNull();
    expect(screen.getByRole('button', { name: '查看运行轨迹' })).toBeInTheDocument();
  });

  it('creates a persisted conversation before sending the first message', async () => {
    apiMocks.listBrainConversations
      .mockResolvedValueOnce({ items: [], total: 0, storeId: 6 })
      .mockResolvedValue({ items: [conversation], total: 1, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({
      conversationId: 42,
      total: 2,
      storeId: 6,
      items: [
        {
          id: 10,
          conversationId: 42,
          role: 'user',
          content: '本月流水多少',
          metadata: null,
          createdAt: '2026-07-11T01:00:00.000Z',
        },
        {
          id: 11,
          conversationId: 42,
          role: 'assistant',
          content: '本月实收流水为 19907.10 元。',
          metadata: { runId: 100, status: 'completed', citations: [] },
          createdAt: '2026-07-11T01:00:01.000Z',
        },
      ],
    });

    render(<BrainWorkspace />);
    await waitFor(() => expect(apiMocks.listBrainConversations).toHaveBeenCalledOnce());

    fireEvent.change(screen.getByPlaceholderText('问经营数据、风险和下一步动作'), {
      target: { value: '本月流水多少' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(apiMocks.createBrainConversation).toHaveBeenCalledWith('本月流水多少'));
    expect(apiMocks.streamBrainMessage).toHaveBeenCalledWith(
      42,
      {
        message: '本月流水多少',
        roleHint: undefined,
        timezone: 'Asia/Shanghai',
      },
      expect.any(Function),
    );
    expect(await screen.findByText('本月实收流水为 19907.10 元。')).toBeInTheDocument();
  });

  it('executes a confirmed action and renders its business receipt', async () => {
    apiMocks.listBrainConversations.mockResolvedValue({ items: [conversation], total: 1, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({
      conversationId: 42,
      total: 1,
      storeId: 6,
      items: [
        {
          id: 12,
          conversationId: 42,
          role: 'assistant',
          content: '已生成预约创建预览。',
          metadata: {
            runId: 101,
            status: 'needs_confirmation',
            suggestedActions: [
              {
                actionId: 'act_reservation_1',
                skillKey: 'create_reservation',
                riskLevel: 'high',
                summary: '为张女士创建明天 10:00 的护理预约',
                requiresConfirmation: true,
              },
            ],
          },
          createdAt: '2026-07-11T01:00:01.000Z',
        },
      ],
    });
    apiMocks.confirmBrainAction.mockResolvedValue({
      actionId: 'act_reservation_1',
      runId: 101,
      storeId: 6,
      executionId: 31,
      status: 'succeeded',
      receipt: {
        businessObjectType: 'reservation',
        businessObjectId: 88,
        message: '预约已创建',
      },
    });

    render(<BrainWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: '确认执行' }));

    await waitFor(() => expect(apiMocks.confirmBrainAction).toHaveBeenCalledWith('act_reservation_1', 101));
    expect(await screen.findByText('预约已创建')).toBeInTheDocument();
    expect(screen.getByText('业务单据：reservation #88')).toBeInTheDocument();
  });

  it('polls an executing marketing action until the delivery receipt is final', async () => {
    apiMocks.listBrainConversations.mockResolvedValue({ items: [conversation], total: 1, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({
      conversationId: 42,
      total: 1,
      storeId: 6,
      items: [
        {
          id: 15,
          conversationId: 42,
          role: 'assistant',
          content: '已生成自动触达执行预览。',
          metadata: {
            runId: 104,
            status: 'needs_confirmation',
            suggestedActions: [
              {
                actionId: 'act_marketing_1',
                skillKey: 'execute_marketing_strategy',
                riskLevel: 'high',
                summary: '执行沉睡客户唤醒策略',
                requiresConfirmation: true,
              },
            ],
          },
          createdAt: '2026-07-11T01:00:01.000Z',
        },
      ],
    });
    apiMocks.listBrainActionStatuses.mockResolvedValueOnce({ runId: 104, storeId: 6, items: [] }).mockResolvedValue({
      runId: 104,
      storeId: 6,
      items: [
        {
          actionId: 'act_marketing_1',
          runId: 104,
          storeId: 6,
          executionId: 34,
          status: 'succeeded',
          receipt: {
            businessObjectType: 'marketing_automation_execution',
            businessObjectId: 91,
            message: '自动触达执行完成：已触达 3 人，失败 0 人。',
            result: { status: 'success', queuedCount: 3, reachedCount: 3, failedCount: 0 },
          },
        },
      ],
    });
    apiMocks.confirmBrainAction.mockResolvedValue({
      actionId: 'act_marketing_1',
      runId: 104,
      storeId: 6,
      executionId: 34,
      status: 'executing',
      receipt: {
        businessObjectType: 'marketing_automation_execution',
        businessObjectId: 91,
        message: '自动触达执行已进入队列，待发送 3 人。',
        result: { status: 'pending', queuedCount: 3, reachedCount: 0, failedCount: 0 },
      },
    });

    render(<BrainWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: '确认执行' }));
    expect(await screen.findByText('正在执行')).toBeInTheDocument();
    expect(screen.getByText('业务进度：排队 3，已触达 0，失败 0')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.listBrainActionStatuses).toHaveBeenCalledTimes(2), { timeout: 3_000 });
    expect(await screen.findByText('自动触达执行完成：已触达 3 人，失败 0 人。')).toBeInTheDocument();
    expect(screen.getByText('业务进度：排队 3，已触达 3，失败 0')).toBeInTheDocument();
  });

  it('restores a persisted action receipt when reopening a conversation', async () => {
    apiMocks.listBrainConversations.mockResolvedValue({ items: [conversation], total: 1, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({
      conversationId: 42,
      total: 1,
      storeId: 6,
      items: [
        {
          id: 14,
          conversationId: 42,
          role: 'assistant',
          content: '已生成预约创建预览。',
          metadata: {
            runId: 103,
            status: 'needs_confirmation',
            suggestedActions: [
              {
                actionId: 'act_reservation_restored',
                skillKey: 'create_reservation',
                riskLevel: 'high',
                summary: '为张女士创建明天 10:00 的护理预约',
                requiresConfirmation: true,
              },
            ],
          },
          createdAt: '2026-07-11T01:00:01.000Z',
        },
      ],
    });
    apiMocks.listBrainActionStatuses.mockResolvedValue({
      runId: 103,
      storeId: 6,
      items: [
        {
          actionId: 'act_reservation_restored',
          runId: 103,
          storeId: 6,
          executionId: 33,
          status: 'succeeded',
          receipt: {
            businessObjectType: 'reservation',
            businessObjectId: 90,
            message: '预约已创建',
          },
        },
      ],
    });

    render(<BrainWorkspace />);

    expect(await screen.findByText('预约已创建')).toBeInTheDocument();
    expect(screen.getByText('业务单据：reservation #90')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument();
    expect(apiMocks.listBrainActionStatuses).toHaveBeenCalledWith(103);
  });

  it('retries a replay-safe failed action and replaces the failed result with its receipt', async () => {
    apiMocks.listBrainConversations.mockResolvedValue({ items: [conversation], total: 1, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({
      conversationId: 42,
      total: 1,
      storeId: 6,
      items: [
        {
          id: 13,
          conversationId: 42,
          role: 'assistant',
          content: '已生成预约改期预览。',
          metadata: {
            runId: 102,
            status: 'needs_confirmation',
            suggestedActions: [
              {
                actionId: 'act_reschedule_1',
                skillKey: 'reschedule_reservation',
                riskLevel: 'high',
                summary: '将张女士预约改到明天 15:00',
                requiresConfirmation: true,
              },
            ],
          },
          createdAt: '2026-07-11T01:00:01.000Z',
        },
      ],
    });
    apiMocks.confirmBrainAction.mockResolvedValue({
      actionId: 'act_reschedule_1',
      runId: 102,
      storeId: 6,
      executionId: 32,
      status: 'failed',
      retryable: true,
      recovery: 'safe_replay',
      error: { code: 'upstream_timeout', message: '改约回执超时' },
    });
    apiMocks.retryBrainAction.mockResolvedValue({
      actionId: 'act_reschedule_1',
      runId: 102,
      storeId: 6,
      executionId: 32,
      status: 'succeeded',
      retried: true,
      receipt: {
        businessObjectType: 'reservation',
        businessObjectId: 89,
        message: '预约已改期',
      },
    });

    render(<BrainWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: '确认执行' }));
    expect(await screen.findByText('改约回执超时')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试执行' }));

    await waitFor(() => expect(apiMocks.retryBrainAction).toHaveBeenCalledWith('act_reschedule_1', 102));
    expect(await screen.findByText('预约已改期')).toBeInTheDocument();
    expect(screen.getByText('业务单据：reservation #89')).toBeInTheDocument();
  });
});
