// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createBrainConversation: vi.fn(),
  sendBrainMessage: vi.fn(),
  getBrainRunContext: vi.fn(),
  createBrainFeedback: vi.fn(),
  confirmBrainAction: vi.fn(),
  rejectBrainAction: vi.fn(),
}));

vi.mock('@/api', () => api);
vi.mock('./auraCoreService', () => ({ runWithAuraAuthRepair: (callback: () => unknown) => callback() }));
vi.mock('./terminalOperatorContext', () => ({ getActiveTerminalOperatorParams: () => ({ operatorId: 9 }) }));

import {
  appendTerminalAgentMessage,
  createTerminalAgentRun,
  decideTerminalBrainAction,
  submitTerminalAgentFeedback,
} from './agentRuntimeService';

describe('terminal Ami Brain runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    api.createBrainConversation.mockResolvedValue({ id: 16 });
    api.getBrainRunContext.mockResolvedValue({ runId: 88, conversationId: 16, status: 'completed', storeId: 6 });
    api.sendBrainMessage.mockResolvedValue({
      conversationId: 16,
      runId: 88,
      status: 'completed',
      answer: '今日预约 3 单。',
      citations: [{ sourceType: 'metric', sourceId: 'appointment_count', label: '预约数' }],
      suggestedActions: [],
      blocks: [{ kind: 'kpi', items: [{ label: '今日预约', value: '3 单' }] }],
    });
    api.confirmBrainAction.mockResolvedValue({ runId: 88, status: 'succeeded', receipt: { message: '预约已创建' } });
  });

  it('creates a Brain conversation and maps the answer to the kiosk result contract', async () => {
    const result = await createTerminalAgentRun({ role: 'manager', command: '今天预约多少' });

    expect(api.createBrainConversation).toHaveBeenCalledWith('Ami Aura Lite');
    expect(api.sendBrainMessage).toHaveBeenCalledWith(16, expect.objectContaining({
      message: '今天预约多少',
      roleHint: 'store_manager',
    }));
    expect(result).toMatchObject({
      runId: 88,
      status: 'completed',
      answer: '今日预约 3 单。',
      responseMode: 'structured_blocks',
      brainBlocks: [{ kind: 'kpi', items: [{ label: '今日预约', value: '3 单' }] }],
    });
    expect(result.evidence?.source).toContain('appointment_count');
  });

  it('resolves the Brain conversation from the previous run for a follow-up', async () => {
    await appendTerminalAgentMessage({ activeRunId: 88, role: 'manager', command: '和昨天比呢' });

    expect(api.getBrainRunContext).toHaveBeenCalledWith(88);
    expect(api.sendBrainMessage).toHaveBeenCalledWith(16, expect.objectContaining({ message: '和昨天比呢' }));
  });

  it('submits kiosk feedback to the Brain feedback endpoint', async () => {
    await submitTerminalAgentFeedback({ runId: 88, adopted: false, comment: '时间范围不对' });

    expect(api.createBrainFeedback).toHaveBeenCalledWith({
      runId: 88,
      rating: 'bad',
      correction: expect.objectContaining({ comment: '时间范围不对', adopted: false }),
    });
  });

  it('executes a Brain confirmation action and returns a receipt result', async () => {
    const result = await decideTerminalBrainAction('brain:88:act_reservation_1');

    expect(api.confirmBrainAction).toHaveBeenCalledWith('act_reservation_1', 88);
    expect(result).toMatchObject({ runId: 88, status: 'completed', answer: '预约已创建' });
  });
});
