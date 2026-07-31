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
      answer: '上周预约 3 单。',
      citations: [{ sourceType: 'metric', sourceId: 'appointment_count', label: '预约数' }],
      suggestedActions: [],
      blocks: [{ kind: 'kpi', items: [{ label: '上周预约', value: '3 单' }] }],
    });
    api.confirmBrainAction.mockResolvedValue({ runId: 88, status: 'succeeded', receipt: { message: '预约已创建' } });
  });

  it('creates a Brain conversation and maps the answer to the kiosk result contract', async () => {
    const result = await createTerminalAgentRun({ role: 'manager', command: '上周有多少个预约' }); // BQ0861.

    expect(api.createBrainConversation).toHaveBeenCalledWith('Ami Aura Lite');
    expect(api.sendBrainMessage).toHaveBeenCalledWith(16, expect.objectContaining({
      message: '上周有多少个预约', // BQ0861.
      roleHint: 'store_manager',
    }));
    expect(result).toMatchObject({
      runId: 88,
      status: 'completed',
      answer: '上周预约 3 单。',
      responseMode: 'structured_blocks',
      brainBlocks: [{ kind: 'kpi', items: [{ label: '上周预约', value: '3 单' }] }],
    });
    expect(result.evidence?.source).toContain('appointment_count');
  });

  it('keeps clarification options as conversational follow-ups instead of business action codes', async () => {
    api.sendBrainMessage.mockResolvedValueOnce({
      conversationId: 16,
      runId: 89,
      status: 'completed',
      answer: '请明确要查看的范围。',
      citations: [],
      suggestedActions: [],
      blocks: [{
        kind: 'clarification',
        question: '你想看哪个时间范围？',
        options: [{ id: 'month', label: '本月', value: '本月' }],
      }],
    });

    const result = await createTerminalAgentRun({ role: 'manager', command: '本月怎么样' }); // BQ1965.

    expect(result.brainBlocks).toEqual([expect.objectContaining({ kind: 'clarification' })]);
    expect(result.actions).toEqual([]);
  });

  it.each([
    ['failed', 'failed', '执行失败', 'capability_failed'],
    ['cancelled', 'cancelled', '已取消', 'request_cancelled'],
    ['running', 'composing', '正在处理', 'request_processing'],
  ] as const)('does not render %s as a completed business result', async (brainStatus, runStatus, answer, limitation) => {
    api.sendBrainMessage.mockResolvedValueOnce({
      conversationId: 16,
      runId: 90,
      status: brainStatus,
      answer: '上周预约 3 单。',
      citations: [{ sourceType: 'metric', sourceId: 'appointment_count', label: '预约数' }],
      suggestedActions: [{
        actionId: 'unsafe_action',
        riskLevel: 'high',
        summary: '不应展示的动作',
        requiresConfirmation: true,
      }],
      blocks: [{ kind: 'kpi', items: [{ label: '上周预约', value: '3 单' }] }],
    });

    const result = await createTerminalAgentRun({ role: 'manager', command: '上周有多少个预约' }); // BQ0861.

    expect(result.status).toBe(runStatus);
    expect(result.answer).toContain(answer);
    expect(result.actions).toEqual([]);
    expect(result.toolResults).toEqual([]);
    expect(result.brainBlocks).toContainEqual({ kind: 'limitations', items: [limitation] });
    expect(result.brainBlocks?.some((block) => block.kind === 'kpi')).toBe(false);
  });

  it('keeps a top-level confirmation state visible even when the preview list is temporarily empty', async () => {
    api.sendBrainMessage.mockResolvedValueOnce({
      conversationId: 16,
      runId: 91,
      status: 'needs_confirmation',
      answer: '请确认后继续。',
      citations: [],
      suggestedActions: [],
      blocks: [],
    });

    const result = await createTerminalAgentRun({ role: 'manager', command: '确认罗若兰的预约' }); // BQ1003.

    expect(result.status).toBe('waiting_approval');
    expect(result.answer).toBe('请确认后继续。');
  });

  it('resolves the Brain conversation from the previous run for a follow-up', async () => {
    // BQ1933 — 第1轮:先看上周流水 → 第2轮:跟昨天比呢.
    await appendTerminalAgentMessage({ activeRunId: 88, role: 'manager', command: '跟昨天比呢' });

    expect(api.getBrainRunContext).toHaveBeenCalledWith(88);
    expect(api.sendBrainMessage).toHaveBeenCalledWith(16, expect.objectContaining({ message: '跟昨天比呢' }));
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

  it.each([
    ['partially_succeeded', 'partially_completed', '部分执行成功'],
    ['expired', 'failed', '已过期'],
    ['failed', 'failed', '写入失败'],
    ['executing', 'composing', '动作状态：executing'],
  ] as const)('maps %s without presenting a false success', async (actionStatus, runStatus, answer) => {
    api.confirmBrainAction.mockResolvedValueOnce({
      runId: 88,
      status: actionStatus,
      ...(actionStatus === 'failed' ? { error: { message: '写入失败' } } : {}),
    });

    const result = await decideTerminalBrainAction('brain:88:act_reservation_1');

    expect(result.status).toBe(runStatus);
    expect(result.answer).toContain(answer);
  });
});
