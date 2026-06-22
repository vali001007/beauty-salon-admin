import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BeauticianPerformance } from './BeauticianPerformance';
import { PrepaidLiabilityAnalysis } from './PrepaidLiabilityAnalysis';

const apiMocks = vi.hoisted(() => ({
  getBeauticianPerformance: vi.fn(),
  getPrepaidLiabilities: vi.fn(),
}));

vi.mock('@/api/operationProfit', () => ({
  getBeauticianPerformance: apiMocks.getBeauticianPerformance,
  getPrepaidLiabilities: apiMocks.getPrepaidLiabilities,
}));

vi.mock('@/stores/storeStore', () => ({
  useStoreStore: (selector: (state: { currentStoreId: number }) => unknown) => selector({ currentStoreId: 6 }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('operation profit risk pages', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    apiMocks.getPrepaidLiabilities.mockReset();
    apiMocks.getBeauticianPerformance.mockReset();
    apiMocks.getPrepaidLiabilities.mockResolvedValue({
      items: [
        {
          customerId: 301,
          customerName: '李女士',
          customerCardId: 401,
          cardId: 501,
          cardName: '水光护理卡',
          totalTimes: 10,
          remainingTimes: 8,
          estimatedRemainingValue: 3200,
          expiryDate: '2026-07-05',
          lastUsedAt: '2026-03-01',
          riskLevel: 'high',
          riskReasons: ['临期未消耗', '高剩余权益'],
        },
      ],
      data: [],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    apiMocks.getBeauticianPerformance.mockResolvedValue({
      items: [
        {
          beauticianId: 601,
          beauticianName: '王美容师',
          storeId: 6,
          storeName: 'Ami 门店',
          serviceIncome: 6000,
          serviceCount: 12,
          customerCount: 9,
          avgTicket: 500,
          cardSalesAmount: 2000,
          commissionCost: 450,
          contributionProfit: 4200,
          repurchaseRate: 0.35,
          missingCostReasons: ['missing_cost', 'missing_commission'],
        },
      ],
      data: [],
      total: 1,
      page: 1,
      pageSize: 100,
    });
  });

  it('shows prepaid liability high-risk reasons and keeps risk filter wired', async () => {
    render(<PrepaidLiabilityAnalysis />);

    expect(await screen.findByText('李女士')).toBeInTheDocument();
    expect(screen.getByText('水光护理卡')).toBeInTheDocument();
    expect(screen.getAllByText('高风险').length).toBeGreaterThan(0);
    expect(screen.getByText('临期未消耗')).toBeInTheDocument();
    expect(screen.getByText('高剩余权益')).toBeInTheDocument();
    expect(screen.getAllByText('¥3,200.00').length).toBeGreaterThan(0);

    await waitFor(() =>
      expect(apiMocks.getPrepaidLiabilities).toHaveBeenLastCalledWith(
        expect.objectContaining({
          storeId: 6,
          riskOnly: true,
        }),
      ),
    );

    fireEvent.click(screen.getByLabelText('只看有风险的会员卡'));

    await waitFor(() =>
      expect(apiMocks.getPrepaidLiabilities).toHaveBeenLastCalledWith(
        expect.objectContaining({
          storeId: 6,
          riskOnly: false,
        }),
      ),
    );
  });

  it('shows beautician performance contribution and data-gap labels', async () => {
    render(<BeauticianPerformance />);

    expect(await screen.findByText('王美容师')).toBeInTheDocument();
    expect(screen.getByText('Ami 门店')).toBeInTheDocument();
    expect(screen.getAllByText('¥6,000.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('¥4,200.00').length).toBeGreaterThan(0);
    expect(screen.getByText('经营成本未录完整')).toBeInTheDocument();
    expect(screen.getByText('提成记录缺失')).toBeInTheDocument();
    expect(apiMocks.getBeauticianPerformance).toHaveBeenCalledWith(expect.objectContaining({ storeId: 6 }));
  });
});
