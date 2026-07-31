import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrainActionPreview } from './BrainActionPreview';
import type { BrainActionDecisionResponse, BrainActionPreview as BrainActionPreviewType } from '@/types/brain';

describe('BrainActionPreview product states', () => {
  const actionJourney = { id: 'BQ0211', question: '帮王静怡新建客户档案，电话138xxxx807' };
  const action = {
    actionId: 'act_customer_create',
    actionType: 'create_customer',
    riskLevel: 'high',
    summary: actionJourney.question,
    requiresConfirmation: true,
  } satisfies BrainActionPreviewType;

  it.each([
    ['queued', '动作已排队'],
    ['executing', '正在执行'],
    ['succeeded', '执行成功'],
    ['partially_succeeded', '部分执行成功'],
    ['failed', '执行失败'],
    ['expired', '确认已过期'],
    ['rejected', '已拒绝该动作'],
  ] as const)('renders the %s state honestly', (status, label) => {
    const result = { actionId: action.actionId, runId: 88, storeId: 6, status } satisfies BrainActionDecisionResponse;
    render(<BrainActionPreview action={action} result={result} onConfirm={vi.fn()} onReject={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument();
  });

  it('keeps confirm and reject explicit while the action is pending', () => {
    const onConfirm = vi.fn();
    const onReject = vi.fn();
    render(<BrainActionPreview action={action} onConfirm={onConfirm} onReject={onReject} onRetry={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('shows safe retry and manual reconciliation as different recovery paths', () => {
    const { rerender } = render(
      <BrainActionPreview
        action={action}
        result={{ actionId: action.actionId, runId: 88, storeId: 6, status: 'failed', retryable: true, recovery: 'safe_replay' }}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '重试执行' })).toBeInTheDocument();

    rerender(
      <BrainActionPreview
        action={action}
        result={{ actionId: action.actionId, runId: 88, storeId: 6, status: 'failed', retryable: false, recovery: 'manual_reconcile' }}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/请先核对后台业务单据/)).toBeInTheDocument();
  });
});
