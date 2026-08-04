import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainQualityLatencyPanel, formatDuration } from './BrainQualityLatencyPanel';

const api = vi.hoisted(() => ({ getBrainGovernanceQualityLatency: vi.fn() }));
vi.mock('@/api/brain', () => api);

describe('BrainQualityLatencyPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getBrainGovernanceQualityLatency.mockResolvedValue({
      range: { from: '2026-07-26T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z', cappedSampleSize: 5000 },
      sampleSize: 12,
      metrics: {
        endToEnd: { p50Ms: 22_000, p95Ms: 82_000, averageMs: 30_000, sampleSize: 12, unavailableReason: null },
        firstVisibleAnswer: { p50Ms: 21_000, p95Ms: 80_000, averageMs: 29_000, sampleSize: 12, unavailableReason: null },
        model: { p50Ms: 11_000, p95Ms: 40_000, averageMs: 18_000, sampleSize: 10, unavailableReason: null },
        toolData: { p50Ms: 5_000, p95Ms: 15_000, averageMs: 8_000, sampleSize: 9, unavailableReason: null },
      },
      filters: { providers: ['openai'], models: ['gpt-test'], capabilityKeys: ['daily_revenue'] },
      appliedFilters: { candidateKey: null, capabilityKey: null, provider: null, model: null, storeId: null },
      selectedPercentile: { percentile: 50, endToEndMs: 22_000, firstVisibleAnswerMs: 21_000, modelMs: 11_000, toolDataMs: 5_000 },
      daily: [{ date: '2026-08-02', sampleSize: 12, endToEndP50Ms: 22_000, firstVisibleP50Ms: 21_000, modelP50Ms: 11_000, toolDataP50Ms: 5_000 }],
      dataCompleteness: {
        endToEnd: { available: 12, total: 12, rate: 1, unavailableReason: null },
        firstVisibleAnswer: { available: 12, total: 12, rate: 1, unavailableReason: null },
        model: { available: 10, total: 12, rate: 10 / 12, unavailableReason: null },
        toolData: { available: 9, total: 12, rate: 0.75, unavailableReason: null },
        firstVisibleAnswerMode: 'buffered_answer_ready',
        note: '来自服务端时间戳',
      },
    });
  });

  it('shows explicit seconds and minute-second units instead of clock-like text', async () => {
    render(<BrainQualityLatencyPanel storeId={null} />);

    expect(await screen.findAllByText('P50 22 秒')).not.toHaveLength(0);
    expect(screen.getByText('P95 1 分 22 秒')).toBeInTheDocument();
    expect(screen.queryByText('22:00')).not.toBeInTheDocument();
    expect(screen.getByText(/全部门店聚合/)).toBeInTheDocument();
  });

  it('passes selected store scope to the backend aggregation API', async () => {
    render(<BrainQualityLatencyPanel storeId={6} />);
    await waitFor(() => expect(api.getBrainGovernanceQualityLatency).toHaveBeenCalledWith(expect.objectContaining({ days: 7, storeId: 6, percentile: 50 })));
  });

  it('passes candidate identity and requested percentile instead of inferring candidate by capability', async () => {
    const user = userEvent.setup();
    render(<BrainQualityLatencyPanel storeId={null} />);
    await user.type(screen.getByLabelText('Candidate'), 'candidate-21');
    await user.selectOptions(screen.getByLabelText('关注百分位'), '95');

    await waitFor(() => expect(api.getBrainGovernanceQualityLatency).toHaveBeenLastCalledWith(expect.objectContaining({
      candidateKey: 'candidate-21',
      percentile: 95,
    })));
  });

  it('formats unavailable and long durations without using zero as fallback', () => {
    expect(formatDuration(null)).toBe('暂无数据');
    expect(formatDuration(8)).toBe('<1 秒');
    expect(formatDuration(0)).toBe('0 秒');
    expect(formatDuration(22_000)).toBe('22 秒');
    expect(formatDuration(82_000)).toBe('1 分 22 秒');
  });
});
