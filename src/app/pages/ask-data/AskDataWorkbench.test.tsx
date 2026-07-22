import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AskDataWorkbench } from './AskDataWorkbench';

const apiMocks = vi.hoisted(() => ({
  queryAskData: vi.fn(),
  getAskDataCatalog: vi.fn(),
}));

vi.mock('@/api/askData', () => ({
  queryAskData: apiMocks.queryAskData,
  getAskDataCatalog: apiMocks.getAskDataCatalog,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('AskDataWorkbench', () => {
  beforeEach(() => {
    apiMocks.queryAskData.mockReset();
    apiMocks.getAskDataCatalog.mockReset();
    apiMocks.getAskDataCatalog.mockResolvedValue({
      tables: [{ model: 'ProductOrder', label: '订单' }],
      examples: ['上个月收入按项目看'],
    });
  });

  it('shows summary, result table and sources for a successful query', async () => {
    apiMocks.queryAskData.mockResolvedValueOnce({
      status: 'success',
      summary: '上个月项目收入 580 元。',
      columns: [
        { key: 'projectName', label: '项目' },
        { key: 'revenue', label: '收入' },
      ],
      rows: [{ projectName: '肩颈舒压', revenue: 580 }],
      sources: [
        { model: 'ProductOrder', fields: ['storeId', 'createdAt'], filters: ['门店=6'], reason: '订单收入主表' },
        { model: 'OrderItem', fields: ['itemType', 'netAmount'], filters: ['itemType=project'], reason: '项目明细' },
      ],
      queryPlan: { templateId: 'project_revenue_by_period', intent: 'query' },
    });

    render(<AskDataWorkbench />);
    fireEvent.change(screen.getByPlaceholderText('例如：上个月收入按项目看'), {
      target: { value: '上个月收入按项目看' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('上个月项目收入 580 元。')).toBeInTheDocument();
    expect(screen.getByText('肩颈舒压')).toBeInTheDocument();
    expect(screen.getByText('580')).toBeInTheDocument();
    expect(screen.getByText('ProductOrder')).toBeInTheDocument();
    expect(screen.getByText('OrderItem')).toBeInTheDocument();
  });

  it('shows clarification question and candidates when the backend needs follow-up', async () => {
    apiMocks.queryAskData.mockResolvedValueOnce({
      status: 'clarification',
      summary: '找到多个客户，请补充要查询哪一位。',
      clarificationQuestion: '找到多个客户，请选择客户。',
      columns: [
        { key: 'customerId', label: '客户ID' },
        { key: 'customerName', label: '客户' },
      ],
      rows: [
        { customerId: 7, customerName: '张三' },
        { customerId: 8, customerName: '张三丰' },
      ],
      sources: [{ model: 'Customer', fields: ['name', 'phone'], filters: ['name 包含 张三'], reason: '客户实体匹配' }],
      queryPlan: { templateId: 'customer_recent_consumption', intent: 'clarification' },
    });

    render(<AskDataWorkbench />);
    fireEvent.change(screen.getByPlaceholderText('例如：上个月收入按项目看'), {
      target: { value: '张三最近消费了什么' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('找到多个客户，请选择客户。')).toBeInTheDocument();
    expect(screen.getByText('张三丰')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('keeps previous result visible when the next request fails', async () => {
    apiMocks.queryAskData
      .mockResolvedValueOnce({
        status: 'success',
        summary: '库存预警 1 个商品。',
        columns: [{ key: 'productName', label: '商品' }],
        rows: [{ productName: '补水面膜' }],
        sources: [{ model: 'Product', fields: ['currentStock'], filters: ['低于安全库存'], reason: '库存主表' }],
        queryPlan: { templateId: 'low_stock_products', intent: 'query' },
      })
      .mockRejectedValueOnce(new Error('服务暂时不可用'));

    render(<AskDataWorkbench />);
    fireEvent.change(screen.getByPlaceholderText('例如：上个月收入按项目看'), {
      target: { value: '库存低于安全库存的商品有哪些' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    expect(await screen.findByText('库存预警 1 个商品。')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('例如：上个月收入按项目看'), {
      target: { value: '本月预约取消率是多少' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => expect(apiMocks.queryAskData).toHaveBeenCalledTimes(2));
    expect(screen.getByText('库存预警 1 个商品。')).toBeInTheDocument();
    expect(screen.getByText('补水面膜')).toBeInTheDocument();
  });
});
