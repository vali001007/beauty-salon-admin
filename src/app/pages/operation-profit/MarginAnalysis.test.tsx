import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductMarginAnalysis } from './ProductMarginAnalysis';
import { ProjectMarginAnalysis } from './ProjectMarginAnalysis';

const apiMocks = vi.hoisted(() => ({
  getProductMargins: vi.fn(),
  getProjectMargins: vi.fn(),
}));

vi.mock('@/api/operationProfit', () => ({
  getProductMargins: apiMocks.getProductMargins,
  getProjectMargins: apiMocks.getProjectMargins,
}));

vi.mock('@/stores/storeStore', () => ({
  useStoreStore: (selector: (state: { currentStoreId: number }) => unknown) => selector({ currentStoreId: 6 }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('margin analysis pages', () => {
  beforeEach(() => {
    apiMocks.getProductMargins.mockReset();
    apiMocks.getProjectMargins.mockReset();
    apiMocks.getProductMargins.mockResolvedValue({
      items: [
        {
          productId: 101,
          productName: '修护精华',
          sku: 'SKU-101',
          categoryName: '院线产品',
          brand: 'Ami',
          quantitySold: 2,
          salesAmount: 160,
          refundAmount: 0,
          netSalesAmount: 160,
          unitCost: 90,
          costSource: 'missing',
          productCost: 180,
          commissionCost: 12,
          grossProfit: -32,
          marginRate: -0.2,
          avgDealPrice: 80,
          retailPrice: 120,
          orderCount: 1,
          sourceOrders: [
            {
              orderId: 10,
              orderNo: 'PO-001',
              orderItemId: 1,
              orderedAt: '2026-06-10',
              customerName: '李女士',
              quantity: 2,
              salesAmount: 160,
              refundAmount: 0,
              netSalesAmount: 160,
              commissionCost: 12,
            },
          ],
          status: 'loss',
          missingCostReasons: ['missing_cost', 'missing_commission'],
        },
      ],
      data: [],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    apiMocks.getProjectMargins.mockResolvedValue({
      items: [
        {
          projectId: 201,
          projectName: '水光护理',
          projectType: '护理',
          standardPrice: 500,
          avgDealPrice: 480,
          serviceCount: 1,
          serviceIncome: 480,
          orderServiceIncome: 300,
          cardUsageIncome: 180,
          standardMaterialCost: 70,
          actualMaterialCost: 0,
          commissionCost: 0,
          contributionProfit: 410,
          marginRate: 0.854,
          sourceOrders: [
            {
              orderId: 20,
              orderNo: 'POM-001',
              orderItemId: 2,
              orderedAt: '2026-06-11',
              customerName: '王女士',
              quantity: 1,
              amount: 300,
              materialCost: 40,
              commissionCost: 20,
              totalCost: 60,
              grossProfit: 240,
              marginRate: 0.8,
            },
          ],
          sourceCardUsages: [
            {
              id: 88,
              customerId: 6,
              customerName: '赵女士',
              cardName: '水光护理 10 次卡',
              times: 1,
              recognizedAmount: 180,
              materialCost: 30,
              commissionCost: 10,
              totalCost: 40,
              grossProfit: 140,
              marginRate: 0.7778,
              sourceOrderNo: 'CO-001',
              verifiedAt: '2026-06-12T10:00:00.000Z',
            },
          ],
          status: 'cost_missing',
          missingCostReasons: ['missing_project_master', 'missing_bom', 'missing_actual_consumption', 'missing_commission'],
        },
      ],
      data: [],
      total: 1,
      page: 1,
      pageSize: 100,
    });
  });

  it('shows product margin loss and data-gap labels without hiding the issue', async () => {
    render(<ProductMarginAnalysis />);

    expect(await screen.findByText('修护精华')).toBeInTheDocument();
    expect(screen.getAllByText('亏损').length).toBeGreaterThan(0);
    expect(screen.getByText('缺成本')).toBeInTheDocument();
    expect(screen.getByText('经营成本未录完整')).toBeInTheDocument();
    expect(screen.getByText('提成记录缺失')).toBeInTheDocument();
    expect(screen.getByText(/当前筛选范围有 1 个商品为亏损状态/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /订单明细/ }));
    expect(screen.getByText('订单明细 - 修护精华')).toBeInTheDocument();
    expect(screen.getByText('PO-001')).toBeInTheDocument();
    expect(screen.getByText('李女士')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('全部状态'), { target: { value: 'loss' } });

    await waitFor(() =>
      expect(apiMocks.getProductMargins).toHaveBeenLastCalledWith(
        expect.objectContaining({
          storeId: 6,
          status: 'loss',
          sortBy: 'grossProfit',
        }),
      ),
    );
  });

  it('loads the next product margin page with a stable page size', async () => {
    apiMocks.getProductMargins.mockResolvedValueOnce({
      items: [
        {
          productId: 101,
          productName: '修护精华',
          sku: 'SKU-101',
          categoryName: '院线产品',
          brand: 'Ami',
          quantitySold: 2,
          salesAmount: 160,
          refundAmount: 0,
          netSalesAmount: 160,
          unitCost: 90,
          costSource: 'missing',
          productCost: 180,
          commissionCost: 12,
          grossProfit: -32,
          marginRate: -0.2,
          avgDealPrice: 80,
          retailPrice: 120,
          status: 'loss',
          missingCostReasons: ['missing_cost', 'missing_commission'],
        },
      ],
      data: [],
      total: 150,
      page: 1,
      pageSize: 100,
    });

    render(<ProductMarginAnalysis />);

    expect(await screen.findByText('修护精华')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 2 页，共 150 个商品')).toBeInTheDocument();
    expect(apiMocks.getProductMargins).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 100, storeId: 6 }));

    fireEvent.click(screen.getByLabelText('下一页商品毛利'));

    await waitFor(() =>
      expect(apiMocks.getProductMargins).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 100,
          storeId: 6,
        }),
      ),
    );

    fireEvent.change(screen.getByDisplayValue('全部状态'), { target: { value: 'loss' } });

    await waitFor(() =>
      expect(apiMocks.getProductMargins).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 100,
          storeId: 6,
          status: 'loss',
        }),
      ),
    );
  });

  it('shows project margin BOM, actual consumption, and commission gaps', async () => {
    render(<ProjectMarginAnalysis />);

    expect(await screen.findByText('水光护理')).toBeInTheDocument();
    expect(screen.getAllByText('成本缺口').length).toBeGreaterThan(0);
    expect(screen.getByText('项目档案缺失')).toBeInTheDocument();
    expect(screen.getByText('项目 BOM 缺失')).toBeInTheDocument();
    expect(screen.getByText('实际耗材流水缺失')).toBeInTheDocument();
    expect(screen.getByText('提成记录缺失')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /查看订单/ }));
    expect(screen.getByText('订单明细 - 水光护理')).toBeInTheDocument();
    expect(screen.getByText('POM-001')).toBeInTheDocument();
    expect(screen.getByText('王女士')).toBeInTheDocument();
    expect(screen.getByText('水光护理 10 次卡')).toBeInTheDocument();
    expect(screen.getByText('CO-001')).toBeInTheDocument();
    expect(screen.getByText('¥60.00')).toBeInTheDocument();
    expect(screen.getByText('¥240.00')).toBeInTheDocument();
    expect(screen.getAllByText('¥40.00').length).toBeGreaterThan(0);
    expect(screen.getByText('¥140.00')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('全部状态'), { target: { value: 'cost_missing' } });

    await waitFor(() =>
      expect(apiMocks.getProjectMargins).toHaveBeenLastCalledWith(
        expect.objectContaining({
          storeId: 6,
          status: 'cost_missing',
        }),
      ),
    );
  });

  it('loads the next project margin page with a stable page size', async () => {
    apiMocks.getProjectMargins.mockResolvedValueOnce({
      items: [
        {
          projectId: 201,
          projectName: '水光护理',
          projectType: '护理',
          standardPrice: 500,
          avgDealPrice: 480,
          serviceCount: 1,
          serviceIncome: 480,
          standardMaterialCost: 70,
          actualMaterialCost: 0,
          commissionCost: 0,
          contributionProfit: 410,
          marginRate: 0.854,
          status: 'cost_missing',
          missingCostReasons: ['missing_project_master', 'missing_bom', 'missing_actual_consumption', 'missing_commission'],
        },
      ],
      data: [],
      total: 150,
      page: 1,
      pageSize: 100,
    });

    render(<ProjectMarginAnalysis />);

    expect(await screen.findByText('水光护理')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 2 页，共 150 个项目')).toBeInTheDocument();
    expect(apiMocks.getProjectMargins).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 100, storeId: 6 }));

    fireEvent.click(screen.getByLabelText('下一页项目毛利'));

    await waitFor(() =>
      expect(apiMocks.getProjectMargins).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 100,
          storeId: 6,
        }),
      ),
    );

    fireEvent.change(screen.getByDisplayValue('全部状态'), { target: { value: 'cost_missing' } });

    await waitFor(() =>
      expect(apiMocks.getProjectMargins).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 100,
          storeId: 6,
          status: 'cost_missing',
        }),
      ),
    );
  });

  it('shows actual and BOM material amounts while summing the material cost used by margin', async () => {
    apiMocks.getProjectMargins.mockResolvedValueOnce({
      items: [
        {
          projectId: 202,
          projectName: '嫩肤护理',
          projectType: '护理',
          standardPrice: 500,
          avgDealPrice: 500,
          serviceCount: 1,
          serviceIncome: 500,
          standardMaterialCost: 120,
          actualMaterialCost: 80,
          commissionCost: 50,
          contributionProfit: 370,
          marginRate: 0.74,
          status: 'high_profit',
          missingCostReasons: [],
        },
      ],
      data: [],
      total: 1,
      page: 1,
      pageSize: 100,
    });

    render(<ProjectMarginAnalysis />);

    expect(await screen.findByText('嫩肤护理')).toBeInTheDocument();
    expect(screen.getByText('实耗 ¥80.00 / BOM ¥120.00')).toBeInTheDocument();
    expect(screen.getByText('按实际耗材扣减')).toBeInTheDocument();
    expect(screen.getAllByText('¥80.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('¥370.00').length).toBeGreaterThan(0);
  });
});
