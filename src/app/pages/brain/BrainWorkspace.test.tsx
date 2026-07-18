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

describe('BrainWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStoreStore.setState({ currentStoreId: 6, stores: [] });
    apiMocks.listBrainConversations.mockResolvedValue({ items: [], total: 0, storeId: 6 });
    apiMocks.listBrainMessages.mockResolvedValue({ conversationId: 42, items: [], total: 0, storeId: 6 });
    apiMocks.getBrainRunEvents.mockResolvedValue({ runId: 100, events: [], storeId: 6 });
    apiMocks.listBrainActionStatuses.mockResolvedValue({ runId: 100, items: [], storeId: 6 });
    apiMocks.createBrainConversation.mockResolvedValue(conversation);
    apiMocks.streamBrainMessage.mockImplementation(async (_conversationId, _payload, onEvent) => {
      onEvent({ type: 'run_started', data: { conversationId: 42 } });
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

  it('renders the real conversation workspace shell', async () => {
    render(<BrainWorkspace />);

    expect(screen.getByText('Ami Brain')).toBeInTheDocument();
    expect(screen.getByText('门店经营智能体')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('问经营数据、风险和下一步动作')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.listBrainConversations).toHaveBeenCalledOnce());
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
