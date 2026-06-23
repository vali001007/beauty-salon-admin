import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BeauticianPerformance } from './BeauticianPerformance';
import { CardPackageLiabilityAnalysis, PrepaidLiabilityAnalysis } from './PrepaidLiabilityAnalysis';

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
          liabilityType: 'balance',
          customerId: 301,
          customerName: '李女士',
          customerCardId: 401,
          cardId: 501,
          cardName: '会员储值余额',
          totalTimes: 0,
          remainingTimes: 0,
          cashBalance: 2600,
          giftBalance: 600,
          estimatedRemainingValue: 3200,
          expiryDate: '',
          lastUsedAt: '2026-03-01',
          riskLevel: 'high',
          riskReasons: ['储值余额较高', '含赠送余额'],
        },
      ],
      data: [],
      total: 1,
      page: 1,
      pageSize: 100,
      summary: {
        totalLiability: 3200,
        cardLiability: 0,
        balanceLiability: 3200,
        cashBalance: 2600,
        giftBalance: 600,
        highRisk: 1,
        mediumRisk: 0,
      },
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

  it('shows stored-value liability page without mixing card liabilities', async () => {
    render(<PrepaidLiabilityAnalysis />);

    expect(await screen.findByText('李女士')).toBeInTheDocument();
    expect(screen.getByText('会员卡（储值）履约')).toBeInTheDocument();
    expect(screen.getByText('会员储值余额')).toBeInTheDocument();
    expect(screen.getAllByText('高风险').length).toBeGreaterThan(0);
    expect(screen.getByText('储值余额较高')).toBeInTheDocument();
    expect(screen.getByText('含赠送余额')).toBeInTheDocument();
    expect(screen.getAllByText('¥3,200.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('次卡权益')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(apiMocks.getPrepaidLiabilities).toHaveBeenLastCalledWith(
        expect.objectContaining({
          storeId: 6,
          riskOnly: true,
          type: 'balance',
        }),
      ),
    );

    fireEvent.click(screen.getByLabelText('只看有风险的储值权益'));

    await waitFor(() =>
      expect(apiMocks.getPrepaidLiabilities).toHaveBeenLastCalledWith(
        expect.objectContaining({
          storeId: 6,
          riskOnly: false,
          type: 'balance',
        }),
      ),
    );
  });

  it('shows times-card liability page with independent card-only query', async () => {
    apiMocks.getPrepaidLiabilities.mockResolvedValue({
      items: [
        {
          liabilityType: 'card',
          customerId: 302,
          customerName: '王女士',
          customerCardId: 402,
          cardId: 502,
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
      summary: {
        totalLiability: 3200,
        cardLiability: 3200,
        balanceLiability: 0,
        cashBalance: 0,
        giftBalance: 0,
        highRisk: 1,
        mediumRisk: 0,
      },
    });

    render(<CardPackageLiabilityAnalysis />);

    expect(await screen.findByText('王女士')).toBeInTheDocument();
    expect(screen.getByText('次卡履约')).toBeInTheDocument();
    expect(screen.getByText('水光护理卡')).toBeInTheDocument();
    expect(screen.getByText('临期未消耗')).toBeInTheDocument();
    expect(screen.getByText('高剩余权益')).toBeInTheDocument();
    expect(screen.getAllByText('剩余次数').length).toBeGreaterThan(0);
    expect(screen.queryByText('储值余额')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(apiMocks.getPrepaidLiabilities).toHaveBeenLastCalledWith(
        expect.objectContaining({
          storeId: 6,
          riskOnly: true,
          type: 'card',
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
