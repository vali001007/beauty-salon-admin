import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationProfitOverview } from './OperationProfitOverview';

const apiMocks = vi.hoisted(() => ({
  getOperationProfitOverview: vi.fn(),
}));

vi.mock('@/api/operationProfit', () => ({
  getOperationProfitOverview: apiMocks.getOperationProfitOverview,
}));

vi.mock('@/stores/storeStore', () => ({
  useStoreStore: (selector: (state: { currentStoreId: number }) => unknown) => selector({ currentStoreId: 6 }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('OperationProfitOverview', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    apiMocks.getOperationProfitOverview.mockReset();
    apiMocks.getOperationProfitOverview.mockResolvedValue({
      period: { from: '2026-06-01', to: '2026-06-30' },
      basis: 'operating',
      summary: {
        cashIncome: 100000,
        operatingIncome: 80000,
        grossProfit: 30000,
        operatingProfit: -5000,
        grossMargin: 0.375,
        netMargin: -0.0625,
        customerCount: 20,
        avgTicket: 4000,
        cardConsumptionRate: 0.45,
      },
      incomeBreakdown: [{ key: 'product', label: '商品销售', amount: 10000 }],
      costBreakdown: [{ key: 'rent', label: '房租物业', amount: 12000 }],
      trend: [
        {
          date: '2026-06-01',
          cashIncome: 1000,
          operatingIncome: 800,
          grossProfit: 300,
          operatingProfit: -100,
        },
      ],
      alerts: [
        {
          key: 'missing-cost',
          level: 'critical',
          title: '成本缺口',
          detail: '3 条商品缺成本，2 条服务缺提成',
          action: '补商品成本',
          path: '/operation-profit/product-margins',
        },
      ],
      dataQuality: {
        status: 'missing_cost',
        detail: '仍有商品成本和提成缺口',
        missingCostReasons: ['missing_cost', 'missing_commission'],
      },
    });
  });

  it('shows overview data quality gaps and alerts without hiding risk', async () => {
    render(<OperationProfitOverview />);

    expect(await screen.findByText('经营利润看板')).toBeInTheDocument();
    expect(screen.getByText('成本缺失')).toBeInTheDocument();
    expect(screen.getByText('仍有商品成本和提成缺口')).toBeInTheDocument();
    expect(screen.getByText('经营成本未录完整')).toBeInTheDocument();
    expect(screen.getByText('提成记录缺失')).toBeInTheDocument();
    expect(screen.getByText('成本缺口')).toBeInTheDocument();
    expect(screen.getByText('3 条商品缺成本，2 条服务缺提成')).toBeInTheDocument();
    expect(screen.getByText('¥-5,000.00')).toBeInTheDocument();
    expect(apiMocks.getOperationProfitOverview).toHaveBeenCalledWith(expect.objectContaining({ storeId: 6 }));
  });
});
