import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainRolloutSequencePage } from './BrainRolloutSequencePage';

const api = vi.hoisted(() => ({
  activateBrainGovernanceRolloutSequenceShadow: vi.fn(),
  createBrainGovernanceRolloutSequence: vi.fn(),
  isBrainGovernanceReadCancelled: vi.fn(() => false),
  listBrainGovernanceCandidates: vi.fn(),
  listBrainGovernanceRolloutSequences: vi.fn(),
  listBrainResourceVersions: vi.fn(),
  pauseBrainGovernanceRolloutSequence: vi.fn(),
  promoteBrainGovernanceRolloutSequence: vi.fn(),
  rollbackBrainGovernanceRolloutSequence: vi.fn(),
  resumeBrainGovernanceRolloutSequence: vi.fn(),
  validateBrainGovernanceRolloutSequence: vi.fn(),
}));

vi.mock('@/api/brain', () => api);
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));
vi.mock('../brainGovernanceNavigation', () => ({ BRAIN_GOVERNANCE_UI_MODE: 'manage' }));

describe('BrainRolloutSequencePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listBrainGovernanceCandidates.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    api.listBrainResourceVersions.mockResolvedValue({ items: [] });
    api.listBrainGovernanceRolloutSequences.mockResolvedValue({
      items: [{
        id: 51,
        sequenceKey: 'rollout:17:head',
        status: 'draft',
        currentStage: 'shadow',
        governanceMode: 'shadow',
        promotionPolicy: {},
        healthThresholds: {},
        candidateId: 17,
        candidate: { candidateKey: 'repo:head:merge' },
        policySnapshot: { releaseKey: 'governance-v2' },
        releases: [
          { id: 101, rolloutStage: 'shadow', status: 'draft', releaseReadiness: { canRelease: true } },
          { id: 102, rolloutStage: 'canary_5', status: 'draft' },
          { id: 103, rolloutStage: 'canary_20', status: 'draft' },
          { id: 104, rolloutStage: 'canary_50', status: 'draft' },
          { id: 105, rolloutStage: 'full', status: 'draft' },
        ],
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('shows one candidate sequence with five stages and keeps policy/runtime wording distinct', async () => {
    render(<MemoryRouter><BrainRolloutSequencePage /></MemoryRouter>);

    expect(await screen.findByText('LEGACY-RT-101')).toBeInTheDocument();
    expect(screen.getByText(/rollout:17:head/)).toBeInTheDocument();
    expect(screen.getByText(/治理策略（GP）已启用，不代表运行版本（RT）已生效/)).toBeInTheDocument();
    expect(screen.getAllByText('Shadow').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /校验并激活 Shadow/ })).toBeInTheDocument();
  });

  it('offers only ready candidates when creating a rollout sequence', async () => {
    api.listBrainGovernanceCandidates.mockResolvedValue({
      items: [
        { id: 17, candidateKey: 'repo:ready', branch: 'ready-branch', headCommit: 'a'.repeat(40), status: 'ready' },
        { id: 18, candidateKey: 'repo:governing', branch: 'governing-branch', headCommit: 'b'.repeat(40), status: 'governing' },
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    });

    render(<MemoryRouter><BrainRolloutSequencePage /></MemoryRouter>);

    expect(await screen.findByRole('option', { name: /ready-branch/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /governing-branch/ })).not.toBeInTheDocument();
  });

  it('uses server-observed health and does not expose manual health inputs', async () => {
    const user = userEvent.setup();
    api.listBrainGovernanceRolloutSequences.mockResolvedValue({
      items: [{
        id: 51,
        sequenceKey: 'rollout:17:head',
        status: 'active',
        currentStage: 'shadow',
        governanceMode: 'shadow',
        promotionPolicy: {},
        healthThresholds: {},
        candidateId: 17,
        candidate: { candidateKey: 'repo:head:merge' },
        policySnapshot: { releaseKey: 'governance-v2' },
        releases: [{ id: 101, rolloutStage: 'shadow', status: 'active' }],
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    api.validateBrainGovernanceRolloutSequence.mockResolvedValue({
      canPromote: false,
      observedHealth: {
        status: 'blocked',
        sampleSize: 6,
        minimumSampleSize: 20,
        elapsedMinutes: 15,
        observationMinutes: 30,
        metrics: { errorRate: 0.01, timeoutRate: 0, permissionViolationCount: 0, negativeFeedbackRate: 0 },
        blockers: ['rollout_observation_sample_insufficient'],
      },
    });

    render(<MemoryRouter><BrainRolloutSequencePage /></MemoryRouter>);
    expect(await screen.findByText(/页面不再允许手工填写健康数据/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/错误率/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /校验当前阶段/ }));
    expect(await screen.findByText(/服务端真实观察：暂不可晋级/)).toBeInTheDocument();
    expect(screen.getByText(/样本 6\/20/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /按真实观察晋级/ }));
    await waitFor(() => expect(api.promoteBrainGovernanceRolloutSequence).toHaveBeenCalledWith(51));
  });

  it('keeps completed and superseded sequences folded outside the current approval queue', async () => {
    api.listBrainGovernanceRolloutSequences.mockResolvedValue({
      items: [
        {
          id: 51,
          sequenceKey: 'rollout:current',
          status: 'active',
          currentStage: 'canary_5',
          governanceMode: 'shadow',
          promotionPolicy: {},
          healthThresholds: {},
          candidateId: 17,
          candidate: { candidateKey: 'repo:current', status: 'observing' },
          policySnapshot: { releaseKey: 'governance-v2' },
          releases: [{ id: 102, rolloutStage: 'canary_5', status: 'active' }],
        },
        {
          id: 50,
          sequenceKey: 'rollout:historical',
          status: 'completed',
          currentStage: 'full',
          governanceMode: 'shadow',
          promotionPolicy: {},
          healthThresholds: {},
          candidateId: 16,
          candidate: { candidateKey: 'repo:old', status: 'superseded' },
          policySnapshot: { releaseKey: 'governance-v1' },
          releases: [{ id: 101, rolloutStage: 'full', status: 'active' }],
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    render(<MemoryRouter><BrainRolloutSequencePage /></MemoryRouter>);

    expect(await screen.findByText('LEGACY-RT-102')).toBeInTheDocument();
    expect(screen.getByText('历史灰度序列（1）')).toBeInTheDocument();
    expect(screen.getByText('LEGACY-RT-101').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('历史序列仅供审计，不进入当前审批队列。')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /校验当前阶段/ })).toHaveLength(1);
  });

  it('sends a pause reason through the sequence API', async () => {
    const user = userEvent.setup();
    api.listBrainGovernanceRolloutSequences.mockResolvedValue({
      items: [{
        id: 51,
        sequenceKey: 'rollout:active',
        status: 'active',
        currentStage: 'canary_20',
        governanceMode: 'shadow',
        promotionPolicy: {},
        healthThresholds: {},
        candidateId: 17,
        candidate: { candidateKey: 'repo:head:merge', status: 'observing' },
        policySnapshot: { releaseKey: 'governance-v2' },
        previousRuntimeRelease: { id: 82, releaseKey: 'runtime-before-candidate', status: 'archived' },
        releases: [{ id: 103, rolloutStage: 'canary_20', status: 'active' }],
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    api.pauseBrainGovernanceRolloutSequence.mockResolvedValue({});
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('暂停观察异常');

    render(<MemoryRouter><BrainRolloutSequencePage /></MemoryRouter>);
    expect(await screen.findByText('LEGACY-RT-103')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '暂停' }));
    await waitFor(() => expect(api.pauseBrainGovernanceRolloutSequence).toHaveBeenCalledWith(51, '暂停观察异常'));
    prompt.mockRestore();
  });

  it('lets a paused active sequence resume or roll back to the pre-candidate runtime', async () => {
    const user = userEvent.setup();
    api.listBrainGovernanceRolloutSequences.mockResolvedValue({
      items: [{
        id: 51,
        sequenceKey: 'rollout:paused',
        status: 'paused',
        currentStage: 'canary_20',
        governanceMode: 'shadow',
        promotionPolicy: {},
        healthThresholds: {},
        candidateId: 17,
        candidate: { candidateKey: 'repo:head:merge', status: 'observing' },
        policySnapshot: { releaseKey: 'governance-v2' },
        previousRuntimeRelease: { id: 82, releaseKey: 'runtime-before-candidate', status: 'archived' },
        releases: [{ id: 103, rolloutStage: 'canary_20', status: 'active' }],
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    api.resumeBrainGovernanceRolloutSequence.mockResolvedValue({});
    api.rollbackBrainGovernanceRolloutSequence.mockResolvedValue({});
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('恢复候选前基线');

    render(<MemoryRouter><BrainRolloutSequencePage /></MemoryRouter>);
    expect(await screen.findByText('LEGACY-RT-103')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '恢复' }));
    await waitFor(() => expect(api.resumeBrainGovernanceRolloutSequence).toHaveBeenCalledWith(51));
    await user.click(screen.getByRole('button', { name: '回滚' }));
    await waitFor(() => expect(api.rollbackBrainGovernanceRolloutSequence).toHaveBeenCalledWith(51, '恢复候选前基线'));
    expect(prompt).toHaveBeenCalledWith('填写回滚原因；将恢复该 Candidate 开始前记录的运行版本');
    prompt.mockRestore();
  });
});
