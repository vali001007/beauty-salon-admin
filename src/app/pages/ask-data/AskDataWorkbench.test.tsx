import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoreStore } from '@/stores/storeStore';
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
    useStoreStore.setState({ currentStoreId: 6, stores: [] });
    apiMocks.queryAskData.mockReset();
    apiMocks.getAskDataCatalog.mockReset();
    apiMocks.getAskDataCatalog.mockResolvedValue({
      tables: [{ model: 'ProductOrder', label: '订单' }],
      examples: ['上个月收入按项目看'],
    });
  });

  it('waits for the store context before loading the catalog and reloads after store selection', async () => {
    useStoreStore.setState({ currentStoreId: null, stores: [] });

    render(<AskDataWorkbench />);
    expect(apiMocks.getAskDataCatalog).not.toHaveBeenCalled();

    act(() => useStoreStore.setState({ currentStoreId: 6 }));

    await waitFor(() => expect(apiMocks.getAskDataCatalog).toHaveBeenCalledTimes(1));
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

  it('renders free SQL findings, query scope and limitations', async () => {
    apiMocks.getAskDataCatalog.mockResolvedValueOnce({
      enabled: true,
      executeReady: true,
      mode: 'execute',
      tables: [
        {
          viewName: 'agent_v3_project_service_sales_view',
          label: '项目服务销售',
          domain: 'project',
          description: '项目收入',
        },
      ],
      examples: ['本月哪个项目收入最高？'],
    });
    apiMocks.queryAskData.mockResolvedValueOnce({
      status: 'success',
      summary: '补水护理净销售额为 1280。',
      keyFindings: ['补水护理排名第一。'],
      columns: [
        { key: 'project_name', label: '项目' },
        { key: 'revenue', label: '收入' },
      ],
      rows: [{ project_name: '补水护理', revenue: 1280 }],
      sources: [
        {
          model: 'agent_v3_project_service_sales_view',
          fields: ['project_name', 'net_amount'],
          filters: ['门店权限'],
          reason: '项目服务销售',
        },
      ],
      limitations: ['仅查询已登记视图。'],
      queryMeta: {
        viewNames: ['agent_v3_project_service_sales_view'],
        timeRange: '2026-07-01 至 2026-08-01',
        storeScope: '门店 6',
        truncated: false,
        executionMs: 12,
        generatedSql: 'SELECT project_name, SUM(net_amount) FROM agent_v3_project_service_sales_view',
      },
      queryPlan: {
        planner: 'llm',
        explanation: '按项目汇总',
        semanticIntent: {
          intent: 'ranking',
          answerShape: 'ranking',
          metricKeys: ['project_sales'],
          dimensionKeys: ['project'],
          confidence: 0.94,
          routeMode: 'deterministic',
          assumptions: [],
        },
      },
    });

    render(<AskDataWorkbench />);
    fireEvent.change(screen.getByPlaceholderText('例如：上个月收入按项目看'), {
      target: { value: '本月哪个项目收入最高？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('补水护理净销售额为 1280。')).toBeInTheDocument();
    expect(screen.getByText('补水护理排名第一。')).toBeInTheDocument();
    expect(screen.getByText('自由查询已就绪')).toBeInTheDocument();
    expect(screen.getByText('方式：自由 SQL')).toBeInTheDocument();
    expect(screen.getByText('范围：2026-07-01 至 2026-08-01')).toBeInTheDocument();
    expect(screen.getByText('耗时：12ms')).toBeInTheDocument();
    expect(screen.getByText('仅查询已登记视图。')).toBeInTheDocument();
    expect(screen.getByText('管理员调试 SQL')).toBeInTheDocument();
    expect(screen.getByText('管理员语义路由')).toBeInTheDocument();
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

  it('labels the development admin database mode as a smoke test', async () => {
    apiMocks.getAskDataCatalog.mockResolvedValueOnce({
      enabled: true,
      executeReady: true,
      mode: 'execute',
      connectionMode: 'development_admin',
      tables: [],
      examples: [],
    });

    render(<AskDataWorkbench />);

    expect(await screen.findByText('开发冒烟：管理员库只读事务')).toBeInTheDocument();
  });

  it('shows the complete permission-filtered catalog in compact domain groups', async () => {
    apiMocks.getAskDataCatalog.mockResolvedValueOnce({
      enabled: true,
      executeReady: true,
      mode: 'execute',
      totalCount: 34,
      groups: [
        { domain: 'finance', label: '财务利润', count: 2 },
        { domain: 'marketing', label: '营销效果', count: 1 },
      ],
      tables: [
        {
          viewName: 'ask_data_confirmed_profit_view',
          label: '已确认实际利润',
          domain: 'finance',
          description: '已确认利润',
          dataPolicy: '仅使用 confirmed 快照',
        },
        {
          viewName: 'ask_data_reconciliation_issue_view',
          label: '财务对账异常',
          domain: 'finance',
          description: '对账异常',
        },
        {
          viewName: 'ask_data_marketing_roi_view',
          label: '营销 ROI',
          domain: 'marketing',
          description: '营销投产',
          dataPolicy: 'estimated 成本不代表实际渠道账单',
        },
      ],
      examples: [],
    });

    render(<AskDataWorkbench />);

    expect(await screen.findByText('覆盖目录 · 34 项')).toBeInTheDocument();
    expect(screen.getByText('财务利润（2）')).toBeInTheDocument();
    expect(screen.getByText('营销效果（1）')).toBeInTheDocument();
    expect(screen.getByText('已确认实际利润')).toHaveAttribute('title', '仅使用 confirmed 快照');
    expect(screen.getByText('营销 ROI')).toHaveAttribute('title', 'estimated 成本不代表实际渠道账单');
  });

  it('renders source data policy and data freshness', async () => {
    apiMocks.queryAskData.mockResolvedValueOnce({
      status: 'success',
      summary: '营销 ROI 为 2.5。',
      keyFindings: [],
      columns: [{ key: 'roi', label: '投入产出比', type: 'number' }],
      rows: [{ roi: 2.5 }],
      sources: [
        {
          model: 'ask_data_marketing_roi_view',
          fields: ['roi', 'cost_source'],
          filters: ['门店权限'],
          reason: '营销投产',
          dataPolicy: 'estimated 成本不代表实际渠道账单',
          dataAsOf: '2026-08-01T08:00:00.000Z',
        },
      ],
      limitations: ['营销成本可能来自估算触达成本，不代表实际渠道账单。'],
      queryMeta: {
        viewNames: ['ask_data_marketing_roi_view'],
        timeRange: '2026-07-01 至 2026-08-01',
        storeScope: '门店 6',
        truncated: false,
        dataAsOf: '2026-08-01T08:00:00.000Z',
      },
      queryPlan: { planner: 'llm' },
    });

    render(<AskDataWorkbench />);
    fireEvent.change(screen.getByPlaceholderText('例如：上个月收入按项目看'), {
      target: { value: '最近30天营销 ROI' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('营销 ROI 为 2.5。')).toBeInTheDocument();
    expect(screen.getByText('口径：estimated 成本不代表实际渠道账单')).toBeInTheDocument();
    expect(screen.getAllByText(/数据截至：/)).toHaveLength(2);
  });

  it('renders inventory turnover status and policy codes as product language', async () => {
    apiMocks.queryAskData.mockResolvedValueOnce({
      status: 'success',
      summary: '查询到库存周转事实。',
      columns: [
        { key: 'slow_moving_status', label: '慢动销状态' },
        { key: 'replenishment_fact_status', label: '采购覆盖状态' },
        { key: 'turnover_policy', label: '运营周转口径标识' },
        { key: 'cost_policy', label: '成本估算口径标识' },
      ],
      rows: [
        {
          slow_moving_status: 'no_outbound_90d',
          replenishment_fact_status: 'below_safety_no_open_procurement',
          turnover_policy: 'operational_event_weighted_not_financial_turnover',
          cost_policy: 'catalog_cost_estimated_not_batch_actual',
        },
      ],
      sources: [],
      queryPlan: { planner: 'llm' },
    });

    render(<AskDataWorkbench />);
    fireEvent.change(screen.getByPlaceholderText('例如：上个月收入按项目看'), {
      target: { value: '哪些商品长期没有动销' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('90 天无出库')).toBeInTheDocument();
    expect(screen.getByText('低于安全库存且无在途采购')).toBeInTheDocument();
    expect(screen.getByText('库存事件加权运营口径（非财务会计周转率）')).toBeInTheDocument();
    expect(screen.getByText('商品档案成本估算（非批次实际成本）')).toBeInTheDocument();
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
