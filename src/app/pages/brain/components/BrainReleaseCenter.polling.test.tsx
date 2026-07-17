import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainReleaseCenter } from './BrainReleaseCenter';

const api = vi.hoisted(() => ({
  listBrainResourceVersions: vi.fn(),
  listBrainReleases: vi.fn(),
  listBrainCapabilityRegenerationJobs: vi.fn(),
}));

vi.mock('@/api/brain', () => ({
  ...api,
  activateBrainRelease: vi.fn(),
  createBrainRolloutSequence: vi.fn(),
  rejectBrainRelease: vi.fn(),
  retryBrainCapabilityRegenerationJob: vi.fn(),
  rollbackBrainReleaseToRules: vi.fn(),
  submitBrainReleaseModification: vi.fn(),
}));

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
});
