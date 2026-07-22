import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrainEvidencePanel } from './BrainEvidencePanel';
import type { BrainMessage, BrainRunEvent } from '@/types/brain';

const message = {
  id: 2,
  conversationId: 42,
  role: 'assistant',
  content: '本周营业额为 10,000 元。',
  metadata: { runId: 88, status: 'completed', citations: [], suggestedActions: [] },
  createdAt: '2026-07-22T00:00:01.000Z',
} satisfies BrainMessage;

const events: BrainRunEvent[] = [
  {
    id: 1,
    runId: 88,
    stepKey: 'cognition_rules',
    layer: 'cognition',
    input: { question: '本周营业额' },
    output: { intent: 'revenue' },
    status: 'completed',
    durationMs: 120,
    durationSource: 'timeline_estimate',
    createdAt: '2026-07-22T00:00:00.120Z',
  },
  {
    id: 2,
    runId: 88,
    stepKey: 'cognition_model',
    layer: 'cognition',
    input: { question: '本周营业额', role: 'store_manager' },
    output: {
      status: 'valid',
      usage: { provider: 'kimi', model: 'kimi-k2', inputTokens: 10, outputTokens: 8 },
    },
    status: 'completed',
    durationMs: 80,
    durationSource: 'recorded',
    createdAt: '2026-07-22T00:00:00.250Z',
  },
];

describe('BrainEvidencePanel', () => {
  it('shows input, output, token usage and duration for every trace step', () => {
    render(
      <BrainEvidencePanel
        message={message}
        events={events}
        loadingEvents={false}
        actionResults={{}}
        pendingActionId={null}
        feedbackLoading={false}
        onConfirmAction={vi.fn()}
        onRejectAction={vi.fn()}
        onRetryAction={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );

    expect(screen.getByText('规则认知')).toBeInTheDocument();
    expect(screen.getByText('Token 0（非模型）')).toBeInTheDocument();
    expect(screen.getByText('阶段间隔 120 ms')).toBeInTheDocument();
    expect(screen.getByText('模型认知')).toBeInTheDocument();
    expect(screen.getByText('Token 18')).toBeInTheDocument();
    expect(screen.getByText('耗时 80 ms')).toBeInTheDocument();

    fireEvent.click(screen.getByText('模型认知'));
    expect(screen.getByText(/Token：输入 10 · 输出 8 · 总计/)).toBeInTheDocument();
    expect(screen.getByText('模型：kimi / kimi-k2')).toBeInTheDocument();
    expect(screen.getAllByText('输入')).toHaveLength(2);
    expect(screen.getAllByText('输出')).toHaveLength(2);
    expect(screen.getByText(/"role": "store_manager"/)).toBeInTheDocument();
  });
});
