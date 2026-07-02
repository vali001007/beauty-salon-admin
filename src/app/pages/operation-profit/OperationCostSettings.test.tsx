import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationCostSettings } from './OperationCostSettings';

const operationCosts = [
  {
    id: 1,
    storeId: 6,
    periodMonth: '2026-06',
    costDate: '2026-06-01',
    category: 'rent',
    amount: 12000,
    allocationType: 'store_month',
    remark: '门店租金',
    creatorName: '超级管理员',
  },
];

const apiMocks = vi.hoisted(() => ({
  getOperationCosts: vi.fn(),
  createOperationCost: vi.fn(),
  updateOperationCost: vi.fn(),
  deleteOperationCost: vi.fn(),
  copyOperationCostsFromPreviousMonth: vi.fn(),
}));

const permissionMocks = vi.hoisted(() => ({
  usePermission: vi.fn(),
}));

const storeMocks = vi.hoisted(() => ({
  currentStoreId: 6 as number | null,
}));

vi.mock('@/api/operationProfit', () => ({
  getOperationCosts: apiMocks.getOperationCosts,
  createOperationCost: apiMocks.createOperationCost,
  updateOperationCost: apiMocks.updateOperationCost,
  deleteOperationCost: apiMocks.deleteOperationCost,
  copyOperationCostsFromPreviousMonth: apiMocks.copyOperationCostsFromPreviousMonth,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: permissionMocks.usePermission,
}));

vi.mock('@/stores/storeStore', () => ({
  useStoreStore: (selector: (state: { currentStoreId: number | null }) => unknown) => selector({ currentStoreId: storeMocks.currentStoreId }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('OperationCostSettings', () => {
  beforeEach(() => {
    apiMocks.getOperationCosts.mockReset();
    apiMocks.createOperationCost.mockReset();
    apiMocks.updateOperationCost.mockReset();
    apiMocks.deleteOperationCost.mockReset();
    apiMocks.copyOperationCostsFromPreviousMonth.mockReset();
    apiMocks.getOperationCosts.mockResolvedValue({
      items: operationCosts,
      data: operationCosts,
      total: operationCosts.length,
      page: 1,
      pageSize: 200,
    });
    apiMocks.deleteOperationCost.mockResolvedValue({ success: true });
    apiMocks.createOperationCost.mockResolvedValue({ id: 2 });
    apiMocks.updateOperationCost.mockResolvedValue({ id: 1 });
    apiMocks.copyOperationCostsFromPreviousMonth.mockResolvedValue({
      items: [],
      data: [],
      total: 0,
      page: 1,
      pageSize: 200,
    });
    permissionMocks.usePermission.mockReturnValue(true);
    storeMocks.currentStoreId = 6;
    vi.spyOn(window, 'confirm').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires confirmation before deleting an operating cost', async () => {
    render(<OperationCostSettings />);

    const deleteButton = await screen.findByRole('button', { name: /删除/ });
    fireEvent.click(deleteButton);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('确认删除'));
    expect(apiMocks.deleteOperationCost).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(deleteButton);

    await waitFor(() => expect(apiMocks.deleteOperationCost).toHaveBeenCalledWith(1));
  });

  it('requires confirmation before copying previous month costs', async () => {
    render(<OperationCostSettings />);

    const copyButton = await screen.findByRole('button', { name: /复制上月/ });
    fireEvent.click(copyButton);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('确认将'));
    expect(apiMocks.copyOperationCostsFromPreviousMonth).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(apiMocks.copyOperationCostsFromPreviousMonth).toHaveBeenCalledWith({
        storeId: 6,
        fromPeriodMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
        toPeriodMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
      }),
    );
  });

  it('keeps cost write actions hidden for read-only users', async () => {
    permissionMocks.usePermission.mockReturnValue(false);

    render(<OperationCostSettings />);

    await screen.findByText('当前账号为只读权限。');
    expect(screen.queryByRole('button', { name: /新增成本/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /复制上月/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /编辑/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /刷新/ })).toBeInTheDocument();
  });

  it('blocks invalid cost forms before calling create API', async () => {
    render(<OperationCostSettings />);

    fireEvent.click(await screen.findByRole('button', { name: /新增成本/ }));
    fireEvent.change(screen.getByLabelText('金额'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: '新增成本' }));

    expect(apiMocks.createOperationCost).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('金额'), { target: { value: '1000' } });
    fireEvent.change(within(dialog).getByLabelText('月份'), { target: { value: '2026-07' } });
    fireEvent.change(within(dialog).getByLabelText('日期'), { target: { value: '2026-08-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '新增成本' }));

    expect(apiMocks.createOperationCost).not.toHaveBeenCalled();
  });

  it('submits new operating costs and refreshes the list', async () => {
    render(<OperationCostSettings />);

    fireEvent.click(await screen.findByRole('button', { name: /新增成本/ }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('金额'), { target: { value: '6800' } });
    fireEvent.change(within(dialog).getByLabelText('备注'), { target: { value: '6月营销活动投放' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '新增成本' }));

    await waitFor(() =>
      expect(apiMocks.createOperationCost).toHaveBeenCalledWith(
        expect.objectContaining({
          periodMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
          storeId: 6,
          costDate: expect.stringMatching(/^\d{4}-\d{2}-01$/),
          category: 'rent',
          amount: 6800,
          allocationType: 'store_month',
          remark: '6月营销活动投放',
        }),
      ),
    );
    await waitFor(() => expect(apiMocks.getOperationCosts).toHaveBeenCalledTimes(2));
  });

  it('prefills existing operating costs and submits updates', async () => {
    render(<OperationCostSettings />);

    fireEvent.click(await screen.findByRole('button', { name: /编辑/ }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByLabelText('金额')).toHaveValue(12000);
    fireEvent.change(within(dialog).getByLabelText('金额'), { target: { value: '12800' } });
    fireEvent.change(within(dialog).getByLabelText('备注'), { target: { value: '调整后门店租金' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

    await waitFor(() =>
      expect(apiMocks.updateOperationCost).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          periodMonth: '2026-06',
          storeId: 6,
          costDate: '2026-06-01',
          category: 'rent',
          amount: 12800,
          allocationType: 'store_month',
          remark: '调整后门店租金',
        }),
      ),
    );
    await waitFor(() => expect(apiMocks.getOperationCosts).toHaveBeenCalledTimes(2));
  });

  it('asks super admin to select a concrete store before loading writable costs', async () => {
    storeMocks.currentStoreId = null;

    render(<OperationCostSettings />);

    expect(await screen.findByText('请先选择具体门店后查看经营成本记录')).toBeInTheDocument();
    expect(screen.getByText('请先在顶部选择具体门店后维护经营成本。')).toBeInTheDocument();
    expect(apiMocks.getOperationCosts).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /新增成本/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /复制上月/ })).not.toBeInTheDocument();
  });
});
