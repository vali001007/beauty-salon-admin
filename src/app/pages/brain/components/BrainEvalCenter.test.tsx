import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainEvalCenter } from './BrainEvalCenter';

const api = vi.hoisted(() => ({
  createBrainEvalRun: vi.fn(),
  getBrainEvalRun: vi.fn(),
  listBrainEvalRuns: vi.fn(),
}));

vi.mock('@/api/brain', () => api);

describe('BrainEvalCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listBrainEvalRuns.mockResolvedValue({
      items: [
        {
          id: 41,
          releaseId: 362,
          roleKey: null,
          status: 'completed',
          caseCount: 10,
          passedCount: 7,
          failedCount: 3,
          summary: { gateMode: 'release_gate' },
          createdAt: '2026-07-21T08:00:00.000Z',
        },
      ],
    });
    api.createBrainEvalRun.mockResolvedValue({ id: 42 });
    api.getBrainEvalRun.mockResolvedValue({
      id: 41,
      status: 'completed',
      caseCount: 10,
      passedCount: 7,
      failedCount: 3,
      createdAt: '2026-07-21T08:00:00.000Z',
      evalResults: [
        {
          id: 1,
          caseKey: 'case_failed',
          question: '本月商品销售排行',
          answer: '',
          deterministicPassed: false,
          failureCluster: 'metric_failed',
          latencyMs: 1200,
        },
      ],
    });
  });

  it('starts a new regression from only the selected run failures', async () => {
    render(<BrainEvalCenter />);
    fireEvent.click(await screen.findByRole('button', { name: '复测失败' }));
    await waitFor(() =>
      expect(api.createBrainEvalRun).toHaveBeenCalledWith({
        sourceEvalRunId: 41,
        modelVersion: 'ami-brain-governed',
      }),
    );
  });

  it('renders structured per-case failure details instead of raw JSON', async () => {
    render(<BrainEvalCenter />);
    fireEvent.click(await screen.findByRole('button', { name: '逐题结果' }));
    expect(await screen.findByText('本月商品销售排行')).toBeInTheDocument();
    expect(screen.getByText('metric_failed')).toBeInTheDocument();
    expect(screen.queryByText(/"evalResults"/)).not.toBeInTheDocument();
  });
});
