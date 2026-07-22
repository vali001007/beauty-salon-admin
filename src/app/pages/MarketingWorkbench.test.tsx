import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingWorkbench } from './MarketingWorkbench';

const recommendationApi = vi.hoisted(() => ({
  getRecommendationInstances: vi.fn(),
  getRecommendationInstanceAudience: vi.fn(),
  adoptRecommendationInstance: vi.fn(),
}));

const marketingApi = vi.hoisted(() => ({
  getMarketingActivities: vi.fn(),
  getAutomationStrategiesPaginated: vi.fn(),
  getUnifiedMarketingEffects: vi.fn(),
}));

vi.mock('@/api/recommendation', () => recommendationApi);
vi.mock('@/api/marketing', () => marketingApi);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('MarketingWorkbench recommendation instance boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recommendationApi.getRecommendationInstances.mockResolvedValue({
      items: [{
        recommendationInstanceId: 'instance-1',
        recommendationKey: 'lifecycle:coupon_claimed_unused',
        sourceType: 'lifecycle',
        sourceVersion: 'lifecycle-v1',
        predictionRunId: 55,
        businessDate: '2026-07-14',
        status: 'active',
        title: '1 位客户命中领券未核销',
        description: '提醒使用已领取权益',
        priority: 'P0',
        urgency: 'urgent',
        preferredMode: 'terminal_follow_up',
        executionModes: ['terminal_follow_up'],
        evidence: { recommendationType: 'coupon_claimed_unused' },
        strategy: { triggerRule: { type: 'coupon_claimed_unused' } },
        targetCount: 1,
        generatedAt: '2026-07-14T02:00:00.000Z',
        expiresAt: '2026-07-15T02:00:00.000Z',
        audience: { snapshotId: 'audience-1', customerCount: 1, rule: {}, generatedAt: '2026-07-14T02:00:00.000Z' },
        offer: null,
        executionState: { adopted: false, latestAdoptionId: null, activity: null, automation: null, terminalFollowUp: null },
      }],
      total: 1,
      page: 1,
      pageSize: 5,
      coverage: {
        totalCustomers: 1252,
        predictedCustomers: 1244,
        coverageRate: 99.36,
        predictionRunId: 55,
        generatedAt: '2026-07-14T02:00:00.000Z',
        freshness: 'fresh',
      },
    });
    recommendationApi.getRecommendationInstanceAudience.mockResolvedValue({
      recommendationInstanceId: 'instance-1',
      snapshotId: 'audience-1',
      customerCount: 1,
      generatedAt: '2026-07-14T02:00:00.000Z',
      total: 1,
      page: 1,
      pageSize: 50,
      items: [{
        id: 1,
        customerId: 101,
        rank: 1,
        score: 92,
        reason: { reason: '领券未核销' },
        predictionData: { churnScore: 70 },
        customer: {
          id: 101,
          name: '客户A',
          phone: '13800000000',
          memberLevel: '金卡',
          visitCount: 3,
          totalSpent: 1200,
          store: { name: 'Ami 全量演示门店' },
        },
      }],
    });
    recommendationApi.adoptRecommendationInstance.mockResolvedValue({
      adoptionId: 70,
      recommendationInstanceId: 'instance-1',
      mode: 'terminal_follow_up',
      status: 'dispatched',
      followUpTaskIds: [120],
      duplicatedCustomerIds: [],
      failedCustomers: [],
    });
    marketingApi.getMarketingActivities.mockResolvedValue([]);
    marketingApi.getAutomationStrategiesPaginated.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    marketingApi.getUnifiedMarketingEffects.mockResolvedValue({
      summary: { exposureCount: 0, revenue: 0, totalObjects: 0 },
      dimensions: {},
    });
  });

  it('loads persisted instances and uses unified adoption for terminal follow-up', async () => {
    render(<MemoryRouter><MarketingWorkbench /></MemoryRouter>);

    expect(await screen.findByText('1 位客户命中领券未核销')).toBeInTheDocument();
    expect(recommendationApi.getRecommendationInstances).toHaveBeenCalledWith({ status: 'active', page: 1, pageSize: 5 });

    fireEvent.click(screen.getByRole('button', { name: '查看客户' }));
    expect(await screen.findByText('客户A')).toBeInTheDocument();
    expect(recommendationApi.getRecommendationInstanceAudience).toHaveBeenCalledWith(
      'instance-1',
      { page: 1, pageSize: 50 },
    );

    fireEvent.click(screen.getByRole('button', { name: '下发前 1 位' }));
    await waitFor(() => expect(recommendationApi.adoptRecommendationInstance).toHaveBeenCalledWith(
      'instance-1',
      {
        mode: 'terminal_follow_up',
        clientRequestId: 'marketing-workbench-terminal-instance-1-101',
        customerIds: [101],
      },
    ));
  });
});
