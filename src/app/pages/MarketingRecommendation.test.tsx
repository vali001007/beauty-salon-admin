import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingRecommendation } from './MarketingRecommendation';

const recommendationApi = vi.hoisted(() => ({
  getMarketingRecommendationWorkspace: vi.fn(),
  getMarketingRecommendations: vi.fn(),
  getMarketingRecommendationAudience: vi.fn(),
  getRecommendationInstances: vi.fn(),
  getRecommendationInstanceAudience: vi.fn(),
  refreshRecommendationInstances: vi.fn(),
  adoptRecommendationInstance: vi.fn(),
  adoptMarketingRecommendationTransaction: vi.fn(),
}));

const marketingApi = vi.hoisted(() => ({
  getMarketingFollowUpTaskSummary: vi.fn(),
  getCustomerLifecycleQuality: vi.fn(),
  getMarketingFollowUpTasks: vi.fn(),
  batchCreateMarketingFollowUpTasks: vi.fn(),
}));
const permissionApi = vi.hoisted(() => ({ allowed: new Set<string>() }));

vi.mock('@/api/recommendation', () => recommendationApi);
vi.mock('@/api/marketing', () => marketingApi);
vi.mock('@/api/ai', () => ({ generateActivityPage: vi.fn(), generateMarketingCopy: vi.fn() }));
vi.mock('@/api/promotion', () => ({ createPromotion: vi.fn() }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: (code: string) => permissionApi.allowed.has(code) }));
vi.mock('../components/CreateActivityDialog', () => ({ CreateActivityDialog: () => null }));
vi.mock('../components/ActivityMiniPage', () => ({
  ActivityMiniPage: ({ onPublish }: { onPublish?: () => void }) => (
    <button type="button" onClick={onPublish}>测试发布预览</button>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function legacyRecommendationFixture() {
  return {
    id: 1,
    title: '旧链路召回推荐',
    reason: '历史推荐仍可查看',
    targetCustomers: '8 位客户',
    targetCount: 8,
    targetCustomerIds: [101],
    expectedConversion: '预计转化率 10%',
    expectedRevenue: '预计营收 ¥1,000',
    strategy: '顾问跟进',
    discount: '回店礼',
    duration: '7天',
    matchScore: 80,
    image: '',
    tags: ['旧链路'],
    category: 'customer-wake',
    preferAutoRule: false,
    urgency: 'recommended' as const,
    urgencyLabel: '推荐',
    source: 'churn' as const,
    triggerType: 'dormant' as const,
    modeReason: '预测新鲜，可由自动策略承接',
    totalCustomers: 1252,
    predictionFreshness: {
      predictionRunId: 55,
      generatedAt: '2026-07-13T02:00:00.000Z',
      ageHours: 10,
      status: 'fresh' as const,
    },
    executionModes: ['activity', 'automation', 'terminal_follow_up'] as const,
    preferredMode: 'activity' as const,
  };
}

describe('MarketingRecommendation recommendation instances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionApi.allowed = new Set(['core:marketing:create', 'core:marketing:update', 'core:marketing:analytics']);
    recommendationApi.getMarketingRecommendations.mockResolvedValue([]);
    recommendationApi.getMarketingRecommendationAudience.mockResolvedValue([]);
    const instanceResponse = {
      items: [{
        recommendationInstanceId: 'instance-1',
        recommendationKey: 'lifecycle:coupon_claimed_unused',
        sourceType: 'lifecycle',
        sourceVersion: 'lifecycle-v1',
        predictionRunId: 55,
        businessDate: '2026-07-13',
        status: 'active',
        title: '1 位客户命中领券未核销',
        description: '提醒使用已领取权益',
        priority: 'P0',
        urgency: 'urgent',
        preferredMode: 'terminal_follow_up',
        executionModes: ['activity', 'terminal_follow_up'],
        evidence: { recommendationType: 'coupon_claimed_unused', dataEvidence: ['领券未核销 1 人'] },
        strategy: { triggerRule: { type: 'coupon_claimed_unused', params: {} }, recommendedActions: [] },
        targetCount: 1,
        generatedAt: '2026-07-13T02:00:00.000Z',
        expiresAt: '2026-07-14T02:00:00.000Z',
        audience: { snapshotId: 'audience-1', customerCount: 1, rule: {}, generatedAt: '2026-07-13T02:00:00.000Z' },
        offer: {
          snapshotId: 'offer-1',
          selectedPromotionId: 21,
          offer: { type: 'money_off', label: '满300减80', reason: '召回权益' },
          alternatives: [],
          fitBreakdown: { score: 88 },
          inventorySnapshot: null,
          capacitySnapshot: null,
          riskWarnings: [],
          generatedAt: '2026-07-13T02:00:00.000Z',
        },
        executionState: { adopted: false, latestAdoptionId: null, activity: null, automation: null, terminalFollowUp: null },
      }],
      total: 1,
      page: 1,
      pageSize: 50,
      coverage: {
        totalCustomers: 1252,
        predictedCustomers: 1244,
        coverageRate: 99.36,
        predictionRunId: 55,
        generatedAt: '2026-07-13T02:00:00.000Z',
        freshness: 'fresh',
      },
    };
    recommendationApi.getRecommendationInstances.mockResolvedValue(instanceResponse);
    recommendationApi.getMarketingRecommendationWorkspace.mockResolvedValue({ mode: 'v2', ...instanceResponse });
    marketingApi.getMarketingFollowUpTaskSummary.mockResolvedValue({
      pending: 0, in_progress: 0, completed: 0, expired: 0, overdue: 0, booked: 0, converted: 0,
    });
    marketingApi.getCustomerLifecycleQuality.mockResolvedValue({
      fieldCoverageRate: 1, ruleHitRate: 1, attributionCompletenessRate: 1, fulfillmentReadyRate: 1,
    });
    recommendationApi.getRecommendationInstanceAudience.mockResolvedValue({
      recommendationInstanceId: 'instance-1',
      snapshotId: 'audience-1',
      customerCount: 1,
      generatedAt: '2026-07-13T02:00:00.000Z',
      total: 1,
      page: 1,
      pageSize: 200,
      items: [{
        id: 1,
        customerId: 101,
        rank: 1,
        score: 92,
        reason: { reason: '领券未核销' },
        predictionData: null,
        customer: { id: 101, name: '客户A', phone: '13800000000', memberLevel: '金卡', tags: [], visitCount: 3, totalSpent: 1200 },
      }],
    });
    recommendationApi.adoptRecommendationInstance.mockResolvedValue({
      adoptionId: 70,
      recommendationInstanceId: 'instance-1',
      mode: 'terminal_follow_up',
      status: 'dispatched',
      followUpTaskIds: [120],
    });
    recommendationApi.adoptMarketingRecommendationTransaction.mockResolvedValue({
      adoptionId: 71,
      recommendationId: 1,
      mode: 'activity',
      status: 'published',
      activityId: 12,
      pageId: 13,
    });
    marketingApi.batchCreateMarketingFollowUpTasks.mockResolvedValue({ items: [], duplicatedCustomerIds: [] });
  });

  it('shows store prediction coverage separately from the recommendation target count', async () => {
    render(<MemoryRouter><MarketingRecommendation /></MemoryRouter>);

    expect(await screen.findByText('预测覆盖 1244 / 1252 位客户；推荐目标人数按每张卡独立统计')).toBeInTheDocument();
    expect(screen.getByText('1 位客户命中领券未核销')).toBeInTheDocument();
    expect(recommendationApi.getMarketingRecommendationWorkspace).toHaveBeenCalledTimes(1);
    expect(recommendationApi.getRecommendationInstances).not.toHaveBeenCalled();
    expect(marketingApi.getMarketingFollowUpTaskSummary).toHaveBeenCalledTimes(1);
    expect(marketingApi.getCustomerLifecycleQuality).toHaveBeenCalledTimes(1);
    expect(recommendationApi.getRecommendationInstanceAudience).not.toHaveBeenCalled();
    expect(recommendationApi.refreshRecommendationInstances).not.toHaveBeenCalled();
  });

  it('uses the unified adoption API for terminal follow-up', async () => {
    render(<MemoryRouter><MarketingRecommendation /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: '下发终端跟进' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认下发 1 位' }));

    await waitFor(() => expect(recommendationApi.adoptRecommendationInstance).toHaveBeenCalledWith(
      'instance-1',
      expect.objectContaining({ mode: 'terminal_follow_up', customerIds: [101] }),
    ));
  });

  it('loads only one 50-customer audience page at a time and preserves selections across pages', async () => {
    const audienceItem = (id: number) => ({
      id,
      customerId: id,
      rank: id,
      score: 92,
      reason: { reason: '领券未核销' },
      predictionData: null,
      customer: { id, name: `客户${id}`, phone: `13800000${id}`, memberLevel: '金卡', tags: [], visitCount: 3, totalSpent: 1200 },
    });
    recommendationApi.getRecommendationInstanceAudience
      .mockResolvedValueOnce({
        recommendationInstanceId: 'instance-1',
        snapshotId: 'audience-1',
        customerCount: 51,
        generatedAt: '2026-07-13T02:00:00.000Z',
        total: 51,
        page: 1,
        pageSize: 50,
        items: [audienceItem(101)],
      })
      .mockResolvedValueOnce({
        recommendationInstanceId: 'instance-1',
        snapshotId: 'audience-1',
        customerCount: 51,
        generatedAt: '2026-07-13T02:00:00.000Z',
        total: 51,
        page: 2,
        pageSize: 50,
        items: [audienceItem(102)],
      });

    render(<MemoryRouter><MarketingRecommendation /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: '下发终端跟进' }));
    expect(recommendationApi.getRecommendationInstanceAudience).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: '下一页' }));
    fireEvent.click(await screen.findByRole('button', { name: '全选本页' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认下发 2 位' }));

    expect(recommendationApi.getRecommendationInstanceAudience).toHaveBeenNthCalledWith(
      1,
      'instance-1',
      { page: 1, pageSize: 50 },
    );
    expect(recommendationApi.getRecommendationInstanceAudience).toHaveBeenNthCalledWith(
      2,
      'instance-1',
      { page: 2, pageSize: 50 },
    );
    await waitFor(() => expect(recommendationApi.adoptRecommendationInstance).toHaveBeenCalledWith(
      'instance-1',
      expect.objectContaining({ mode: 'terminal_follow_up', customerIds: [101, 102] }),
    ));
  });

  it('keeps legacy recommendations visible for stores outside the v2 rollout', async () => {
    const legacyItems = [legacyRecommendationFixture()];
    recommendationApi.getMarketingRecommendationWorkspace.mockResolvedValue({
      mode: 'legacy',
      items: legacyItems,
      total: 1,
      page: 1,
      pageSize: 50,
      coverage: {
        totalCustomers: 1252,
        predictedCustomers: 1252,
        coverageRate: 100,
        predictionRunId: 55,
        generatedAt: '2026-07-13T02:00:00.000Z',
        freshness: 'fresh',
      },
    });

    render(<MemoryRouter><MarketingRecommendation /></MemoryRouter>);

    expect(await screen.findByText('旧链路召回推荐')).toBeInTheDocument();
    expect(recommendationApi.getMarketingRecommendationWorkspace).toHaveBeenCalledWith({ page: 1, pageSize: 50, refresh: false });
    expect(recommendationApi.getMarketingRecommendations).not.toHaveBeenCalled();
    expect(recommendationApi.getRecommendationInstances).not.toHaveBeenCalled();
  });

  it('uses the legacy transactional adoption route for activity publication outside the v2 rollout', async () => {
    const legacyItems = [legacyRecommendationFixture()];
    recommendationApi.getMarketingRecommendationWorkspace.mockResolvedValue({
      mode: 'legacy', items: legacyItems, total: 1, page: 1, pageSize: 50,
      coverage: { totalCustomers: 1252, predictedCustomers: 1244, coverageRate: 99.36, predictionRunId: 55, generatedAt: '2026-07-13T02:00:00.000Z', freshness: 'fresh' },
    });

    render(<MemoryRouter><MarketingRecommendation /></MemoryRouter>);

    const card = (await screen.findByText('旧链路召回推荐')).closest('.rounded-lg.overflow-hidden');
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: '发布活动' }));
    fireEvent.click(await screen.findByRole('button', { name: '测试发布预览' }));

    await waitFor(() => expect(recommendationApi.adoptMarketingRecommendationTransaction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ mode: 'activity', activity: expect.objectContaining({ publishPage: true }) }),
    ));
    expect(recommendationApi.adoptRecommendationInstance).not.toHaveBeenCalled();
  });

  it('uses the legacy transactional adoption route for automation outside the v2 rollout', async () => {
    const legacyItems = [legacyRecommendationFixture()];
    recommendationApi.getMarketingRecommendationWorkspace.mockResolvedValue({
      mode: 'legacy', items: legacyItems, total: 1, page: 1, pageSize: 50,
      coverage: { totalCustomers: 1252, predictedCustomers: 1244, coverageRate: 99.36, predictionRunId: 55, generatedAt: '2026-07-13T02:00:00.000Z', freshness: 'fresh' },
    });

    render(<MemoryRouter><MarketingRecommendation /></MemoryRouter>);
    const card = (await screen.findByText('旧链路召回推荐')).closest('.rounded-lg.overflow-hidden');
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: '自动触达' }));

    await waitFor(() => expect(recommendationApi.adoptMarketingRecommendationTransaction).toHaveBeenCalledWith(
      1,
      { mode: 'automation' },
    ));
    expect(recommendationApi.adoptRecommendationInstance).not.toHaveBeenCalled();
  });

  it('uses the legacy terminal follow-up route outside the v2 rollout', async () => {
    const legacyItems = [legacyRecommendationFixture()];
    recommendationApi.getMarketingRecommendationWorkspace.mockResolvedValue({
      mode: 'legacy', items: legacyItems, total: 1, page: 1, pageSize: 50,
      coverage: { totalCustomers: 1252, predictedCustomers: 1244, coverageRate: 99.36, predictionRunId: 55, generatedAt: '2026-07-13T02:00:00.000Z', freshness: 'fresh' },
    });
    recommendationApi.getMarketingRecommendationAudience.mockResolvedValue([{
      customerId: 101,
      name: '客户A',
      segment: '高价值客户',
      skinType: '中性肌肤',
      visitFrequency: '3次到店',
      avgSpend: '¥400',
      preferredService: '补水护理',
      promotionSensitivity: '80%',
      repurchaseRate: '60%',
      loyalty: '高',
      seasonalTrend: '稳定',
    }]);
    marketingApi.batchCreateMarketingFollowUpTasks.mockResolvedValue({
      items: [{ id: 120, customerId: 101, status: 'pending' }],
      total: 1,
      createdCount: 1,
      duplicatedCount: 0,
      failedCount: 0,
      failures: [],
    });

    render(<MemoryRouter><MarketingRecommendation /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '下发终端跟进' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认下发 1 位' }));

    await waitFor(() => expect(marketingApi.batchCreateMarketingFollowUpTasks).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ customerId: 101, customerIds: [101], recommendationId: 1 }),
    ));
    expect(recommendationApi.adoptRecommendationInstance).not.toHaveBeenCalled();
  });

  it('does not render create, update or analytics actions without their permissions', async () => {
    permissionApi.allowed = new Set();
    render(<MemoryRouter><MarketingRecommendation /></MemoryRouter>);

    expect(await screen.findByText('1 位客户命中领券未核销')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '刷新推荐' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发布活动' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下发终端跟进' })).not.toBeInTheDocument();
  });
});
