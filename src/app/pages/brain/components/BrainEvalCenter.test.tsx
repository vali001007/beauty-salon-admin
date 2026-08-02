import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainEvalCenter } from './BrainEvalCenter';

const api = vi.hoisted(() => ({
  createBrainEvalRun: vi.fn(),
  getBrainEvalRun: vi.fn(),
  listBrainEvalRuns: vi.fn(),
}));
const permissionState = vi.hoisted(() => ({ canManage: true }));

vi.mock('@/api/brain', () => api);
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => permissionState.canManage }));
vi.mock('../brainGovernanceNavigation', () => ({ BRAIN_GOVERNANCE_UI_MODE: 'manage' }));

describe('BrainEvalCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionState.canManage = true;
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

  it('does not expose eval mutation actions to view-only users', async () => {
    permissionState.canManage = false;
    render(<BrainEvalCenter />);

    expect((await screen.findAllByText('#41')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '发起评测' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复测失败' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '逐题结果' })).toBeInTheDocument();
  });
});
