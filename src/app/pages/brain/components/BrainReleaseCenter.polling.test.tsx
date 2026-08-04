import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainReleaseCenter } from './BrainReleaseCenter';

const api = vi.hoisted(() => ({
  listBrainResourceVersions: vi.fn(),
  listBrainReleases: vi.fn(),
  listBrainCapabilityRegenerationJobs: vi.fn(),
}));
const permissionState = vi.hoisted(() => ({ denied: new Set<string>() }));

vi.mock('@/api/brain', () => ({
  ...api,
  activateBrainRelease: vi.fn(),
  createBrainRolloutSequence: vi.fn(),
  rejectBrainRelease: vi.fn(),
  retryBrainCapabilityRegenerationJob: vi.fn(),
  rollbackBrainReleaseToRules: vi.fn(),
  submitBrainReleaseModification: vi.fn(),
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: (permission: string) => !permissionState.denied.has(permission) }));
vi.mock('../brainGovernanceNavigation', () => ({ BRAIN_GOVERNANCE_UI_MODE: 'manage' }));

const queuedJob = {
  id: 501,
  releaseId: 61,
  status: 'queued' as const,
  progress: 0,
  affectedCapabilities: ['product_sales_ranking'],
  staticGatesPassed: 0,
  contractCompileSecurity: [],
  risk: {},
  blockingReasons: [],
  errorCode: null,
  errorMessage: null,
  retryable: true,
  nextAction: 'retry' as const,
  generatedResourceVersionIds: [],
  availableAt: null,
  leasedAt: null,
  completedAt: null,
  createdAt: null,
  updatedAt: null,
};

function renderReleaseCenter() {
  return render(<MemoryRouter><BrainReleaseCenter /></MemoryRouter>);
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('BrainReleaseCenter regeneration polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    permissionState.denied = new Set();
    api.listBrainResourceVersions.mockResolvedValue({ items: [] });
    api.listBrainReleases.mockResolvedValue({ items: [] });
    api.listBrainCapabilityRegenerationJobs.mockResolvedValue({ items: [queuedJob] });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('pauses while hidden and resumes polling when visible', async () => {
    renderReleaseCenter();
    await flush();
    const calls = api.listBrainCapabilityRegenerationJobs.mock.calls.length;

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(api.listBrainCapabilityRegenerationJobs).toHaveBeenCalledTimes(calls);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); });
    expect(api.listBrainCapabilityRegenerationJobs).toHaveBeenCalledTimes(calls + 1);
  });

  it('uses 3/6/12 second backoff and opens the circuit after three failures', async () => {
    api.listBrainCapabilityRegenerationJobs
      .mockResolvedValueOnce({ items: [queuedJob] })
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'));
    renderReleaseCenter();
    await flush();
    const initialCalls = api.listBrainCapabilityRegenerationJobs.mock.calls.length;

    await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(6_000); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(12_000); await Promise.resolve(); });

    expect(screen.getByText('自动刷新连续失败 3 次，已暂停，请人工刷新。')).toBeInTheDocument();
    expect(api.listBrainCapabilityRegenerationJobs).toHaveBeenCalledTimes(initialCalls + 3);
  });

  it('manual refresh clears the breaker and starts a new polling generation', async () => {
    api.listBrainCapabilityRegenerationJobs
      .mockResolvedValueOnce({ items: [queuedJob] })
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'));
    renderReleaseCenter();
    await flush();
    await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(6_000); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(12_000); await Promise.resolve(); });
    expect(screen.getByText('自动刷新连续失败 3 次，已暂停，请人工刷新。')).toBeInTheDocument();

    const callsBeforeRefresh = api.listBrainCapabilityRegenerationJobs.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '刷新发布数据' }));
      await Promise.resolve();
    });
    expect(screen.queryByText('自动刷新连续失败 3 次，已暂停，请人工刷新。')).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); });
    expect(api.listBrainCapabilityRegenerationJobs.mock.calls.length).toBeGreaterThan(callsBeforeRefresh + 1);
  });

  it('stops after ten minutes and requests manual refresh', async () => {
    renderReleaseCenter();
    await flush();
    vi.setSystemTime(new Date('2026-07-14T00:10:01.000Z'));
    await act(async () => { vi.advanceTimersByTime(3_000); });

    expect(screen.getByText('自动刷新已运行 10 分钟，请人工刷新查看最新状态。')).toBeInTheDocument();
  });

  it('hides runtime activation, rejection and rollback commands without release permission', async () => {
    permissionState.denied = new Set(['core:brain-governance:release']);
    api.listBrainCapabilityRegenerationJobs.mockResolvedValue({ items: [] });
    api.listBrainReleases.mockResolvedValue({
      items: [{
        id: 61,
        releaseKey: 'runtime-draft-v1',
        scope: 'percentage',
        rollout: { stage: 'shadow', mode: 'shadow', userPercentage: 100 },
        status: 'draft',
        previousReleaseId: 60,
        createdAt: '2026-08-01T00:00:00.000Z',
        items: [],
      }],
    });

    renderReleaseCenter();
    await flush();

    expect(screen.getByText('LEGACY-RT-61')).toBeInTheDocument();
    expect(screen.getByText(/内部 key：runtime-draft-v1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '批准运行阶段' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '拒绝' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改要求' })).toBeInTheDocument();
  });

  it('renders server-verified readiness instead of inferring tests from snapshots', async () => {
    api.listBrainCapabilityRegenerationJobs.mockResolvedValue({ items: [] });
    api.listBrainReleases.mockResolvedValue({
      items: [{
        id: 62,
        releaseKey: 'runtime-ready-v1',
        scope: 'percentage',
        rollout: { stage: 'shadow', mode: 'shadow', userPercentage: 100 },
        status: 'draft',
        previousReleaseId: 61,
        createdAt: '2026-08-01T00:00:00.000Z',
        items: [],
        releaseReadiness: {
          status: 'ready',
          canRelease: true,
          evaluationReleaseId: 60,
          evalRunId: 249,
          releaseFingerprint: 'a'.repeat(64),
          suiteChecksum: 'b'.repeat(64),
          questionCount: 100,
          provider: 'openai_responses',
          model: 'gpt-test',
          generatedAt: '2026-08-01T00:00:00.000Z',
          expiresAt: '2026-08-03T00:00:00.000Z',
          blockers: [],
        },
      }],
    });

    renderReleaseCenter();
    await flush();

    expect(screen.getByText('已通过（Eval Run #249）')).toBeInTheDocument();
    expect(screen.queryByText('等待评测门禁')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批准运行阶段' })).toBeEnabled();
  });

  it('blocks activation when the backend readiness contract reports missing evidence', async () => {
    api.listBrainCapabilityRegenerationJobs.mockResolvedValue({ items: [] });
    api.listBrainReleases.mockResolvedValue({
      items: [{
        id: 63,
        releaseKey: 'runtime-blocked-v1',
        scope: 'percentage',
        rollout: { stage: 'shadow', mode: 'shadow', userPercentage: 100 },
        status: 'draft',
        previousReleaseId: 61,
        createdAt: '2026-08-01T00:00:00.000Z',
        items: [],
        releaseReadiness: {
          status: 'blocked',
          canRelease: false,
          evaluationReleaseId: null,
          evalRunId: null,
          releaseFingerprint: 'a'.repeat(64),
          suiteChecksum: null,
          questionCount: null,
          provider: null,
          model: null,
          generatedAt: null,
          expiresAt: null,
          blockers: ['release_eval_gate_failed'],
        },
      }],
    });

    renderReleaseCenter();
    await flush();

    expect(screen.getByText('未就绪：release_eval_gate_failed')).toBeInTheDocument();
    expect(screen.getByText('当前运行阶段尚未满足激活条件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批准运行阶段' })).toBeDisabled();
  });
});
