import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStockMovements } from '@/api/inventory';
import { SalesOutboundTab } from './SalesOutboundTab';

vi.mock('@/api/inventory', () => ({
  getStockMovements: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const mockedGetStockMovements = vi.mocked(getStockMovements);

const movement = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  storeId: 6,
  storeName: 'Ami 全量演示门店',
  productId: 101,
  productName: '修护精华',
  sku: 'SKU-101',
  batchId: null,
  movementNo: 'SO-1',
  movementType: 'sale_out',
  quantity: -2,
  beforeStock: 10,
  afterStock: 8,
  unit: '瓶',
  sourceType: 'product_order',
  sourceId: 501,
  sourceNo: 'PO501',
  remark: '商品销售自动出库',
  operatorName: '系统管理员',
  occurredAt: '2026-07-14T09:30:00.000Z',
  createdAt: '2026-07-14T09:30:00.000Z',
  ...overrides,
});

describe('SalesOutboundTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads sale_out once when first activated and renders outbound quantities as positive values', async () => {
    mockedGetStockMovements.mockResolvedValue({
      items: [
        movement(),
        movement({
          id: 2,
          productName: '缺字段商品',
          sku: undefined,
          quantity: -1,
          sourceNo: null,
          beforeStock: null,
          afterStock: null,
          operatorName: undefined,
        }),
      ],
      data: [
        movement(),
        movement({
          id: 2,
          productName: '缺字段商品',
          sku: undefined,
          quantity: -1,
          sourceNo: null,
          beforeStock: null,
          afterStock: null,
          operatorName: undefined,
        }),
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    });

    const { rerender } = render(
      <StrictMode>
        <SalesOutboundTab active={false} />
      </StrictMode>,
    );
    expect(mockedGetStockMovements).not.toHaveBeenCalled();

    rerender(
      <StrictMode>
        <SalesOutboundTab active />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(mockedGetStockMovements).toHaveBeenCalledWith({
        movementType: 'sale_out',
        page: 1,
        pageSize: 100,
      }),
    );

    expect(await screen.findByText('PO501')).toBeInTheDocument();
    expect(screen.getByText('共 2 条销售出库，出库数量 3')).toBeInTheDocument();
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(4);

    rerender(
      <StrictMode>
        <SalesOutboundTab active={false} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <SalesOutboundTab active />
      </StrictMode>,
    );
    expect(mockedGetStockMovements).toHaveBeenCalledTimes(1);
  });

  it('filters by date, product keyword and store options derived from real movements', async () => {
    mockedGetStockMovements.mockResolvedValue({
      items: [
        movement(),
        movement({
          id: 2,
          storeId: 7,
          storeName: '二号门店',
          productName: '洁面乳',
          sku: 'SKU-202',
          sourceNo: 'PO502',
          occurredAt: '2026-07-10T09:30:00.000Z',
        }),
      ],
      data: [
        movement(),
        movement({
          id: 2,
          storeId: 7,
          storeName: '二号门店',
          productName: '洁面乳',
          sku: 'SKU-202',
          sourceNo: 'PO502',
          occurredAt: '2026-07-10T09:30:00.000Z',
        }),
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    });
    render(<SalesOutboundTab active />);
    expect(await screen.findByText('PO501')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '二号门店' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('销售出库商品关键词'), { target: { value: '洁面' } });
    expect(screen.queryByText('PO501')).not.toBeInTheDocument();
    expect(screen.getByText('PO502')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('销售出库商品关键词'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('销售出库开始日期'), { target: { value: '2026-07-12' } });
    expect(screen.getByText('PO501')).toBeInTheDocument();
    expect(screen.queryByText('PO502')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('销售出库开始日期'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('销售出库门店'), { target: { value: '二号门店' } });
    expect(screen.queryByText('PO501')).not.toBeInTheDocument();
    expect(screen.getByText('PO502')).toBeInTheDocument();
  });

  it('shows an isolated error state when the outbound request fails', async () => {
    mockedGetStockMovements.mockRejectedValue(new Error('network error'));
    render(<SalesOutboundTab active />);
    expect(await screen.findByText('销售出库数据加载失败')).toBeInTheDocument();
  });
});
