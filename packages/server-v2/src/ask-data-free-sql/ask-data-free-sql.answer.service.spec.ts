import { AskDataFreeSqlAnswerService } from './ask-data-free-sql.answer.service.js';

const input = {
  question: '本月哪个项目收入最高？',
  explanation: '按项目汇总净销售额',
  rows: [{ project_name: '补水护理', revenue: 1280 }],
  selectedViews: [{ label: '项目服务销售' }] as any,
  context: { userId: 9, storeId: 6 } as any,
  timeRange: '2026-07-01 至 2026-08-01',
  truncated: false,
  requiredAnswerFacts: ['metric_value', 'data_policy'],
};

describe('AskDataFreeSqlAnswerService', () => {
  it('accepts a grounded model answer', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: { summary: '补水护理收入为 1280。', keyFindings: [], caveats: [], displayMode: 'ranking', coveredFacts: ['metric_value', 'data_policy'] },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose(input);
    expect(answer.summary).toBe('补水护理收入为 1280。');
  });

  it('falls back when the model invents a number', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: { summary: '补水护理收入为 9999。', keyFindings: [], caveats: [], displayMode: 'ranking', coveredFacts: ['metric_value', 'data_policy'] },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose(input);
    expect(answer.summary).not.toContain('9999');
    expect(answer.caveats.join(' ')).toContain('回退');
  });

  it('does not treat a number from the user question as result evidence', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: { summary: '最近 30 天收入为 30。', keyFindings: [], caveats: [], displayMode: 'metric', coveredFacts: ['metric_value', 'data_policy'] },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({ ...input, question: '最近 30 天收入是多少？' });
    expect(answer.summary).not.toBe('最近 30 天收入为 30。');
    expect(answer.caveats.join(' ')).toContain('回退');
  });

  it('does not call the model for empty rows', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({ ...input, rows: [] });
    expect(answer.summary).toContain('没有匹配数据');
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('uses a deterministic answer for an evidence-complete scalar plan', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      rows: [{ paid_amount: '1280.000000' }],
      selectedViews: [{
        label: '支付与退款',
        fields: [{ name: 'paid_amount', description: '实收金额', type: 'number', policy: 'allow' }],
      }] as any,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'time_range'],
      controlledQueryPlan: {
        answerShape: 'scalar',
        metricKeys: ['payment_flow'],
        dimensions: [],
        requiredOutputFields: ['paid_amount'],
        resultMode: 'scalar',
      },
    });

    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(answer.compositionMode).toBe('deterministic');
    expect(answer.summary).toContain('实收金额=1280');
    expect(answer.coveredFacts).toEqual(expect.arrayContaining(['metric_value', 'data_policy', 'time_range']));
  });

  it('keeps all required metrics in a deterministic single-row summary', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '这个季度营销投入回报情况',
      rows: [{
        exposure_count: 3666,
        click_count: 0,
        conversion_count: 1,
        attributed_net_revenue: '8156.1',
        marketing_cost: '7330',
        roi: '1.1127',
      }],
      selectedViews: [{
        label: '营销 ROI',
        fields: [
          { name: 'exposure_count', description: '触达数', type: 'number', policy: 'allow' },
          { name: 'click_count', description: '点击数', type: 'number', policy: 'allow' },
          { name: 'conversion_count', description: '转化数', type: 'number', policy: 'allow' },
          { name: 'attributed_net_revenue', description: '归因净收入', type: 'number', policy: 'allow' },
          { name: 'marketing_cost', description: '营销成本', type: 'number', policy: 'allow' },
          { name: 'roi', description: 'ROI', type: 'number', policy: 'allow' },
        ],
      }] as any,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'time_range', 'all_requested_metrics'],
      controlledQueryPlan: {
        answerShape: 'scalar',
        metricKeys: ['marketing_roi'],
        dimensions: [],
        requiredOutputFields: [
          'exposure_count',
          'click_count',
          'conversion_count',
          'attributed_net_revenue',
          'marketing_cost',
          'roi',
        ],
        resultMode: 'scalar',
      },
    });

    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(answer.summary).toContain('ROI=1.11');
    expect(answer.coveredFacts).toContain('all_requested_metrics');
  });

  it('uses a deterministic answer for an evidence-complete detail list', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '有哪些客户余额较高',
      rows: [
        { customer_id: 101, customer_name_masked: '刘***', cash_balance: '500' },
        { customer_id: 102, customer_name_masked: '何***', cash_balance: '300' },
      ],
      selectedViews: [{
        label: '客户余额',
        fields: [
          { name: 'customer_id', description: '客户 ID', type: 'number', policy: 'allow' },
          { name: 'customer_name_masked', description: '脱敏客户姓名', type: 'string', policy: 'mask' },
          { name: 'cash_balance', description: '现金余额', type: 'number', policy: 'allow' },
        ],
      }] as any,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'time_range', 'list_items'],
      controlledQueryPlan: {
        answerShape: 'list',
        metricKeys: ['customer_balance'],
        dimensions: [],
        requiredOutputFields: ['customer_id', 'customer_name_masked', 'cash_balance'],
        resultMode: 'detail',
      },
    });

    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(answer.compositionMode).toBe('deterministic');
    expect(answer.summary).toContain('2 条结果');
    expect(answer.keyFindings[0]).toContain('客户 ID=101');
    expect(answer.keyFindings[0]).toContain('脱敏客户姓名=刘***');
  });

  it('keeps model composition for ranking and comparison plans', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          summary: '补水护理收入为 1280。',
          keyFindings: [],
          caveats: [],
          displayMode: 'ranking',
          coveredFacts: ['metric_value', 'data_policy', 'ranking_order', 'ranking_limit'],
        },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'ranking_order', 'ranking_limit'],
      controlledQueryPlan: {
        answerShape: 'ranking',
        metricKeys: ['project_sales'],
        dimensions: [],
        requiredOutputFields: ['project_name', 'revenue'],
        resultMode: 'grouped',
      },
    });

    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(answer.compositionMode).toBe('model');
  });

  it('falls back when the model omits a required comparison fact', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          summary: '本月收入为 1280。',
          keyFindings: [],
          caveats: [],
          displayMode: 'metric',
          coveredFacts: ['metric_value', 'data_policy'],
        },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      rows: [{ current_amount: 1280, previous_amount: 1000, difference: 280 }],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'comparison_current', 'comparison_previous', 'comparison_difference'],
      controlledQueryPlan: { answerShape: 'comparison', metricKeys: ['order_revenue'], dimensions: [], comparisonMode: 'previous_period' },
    });

    expect(answer.caveats.join(' ')).toContain('未覆盖');
  });

  it('does not mark a previous-period fact covered when the rows only contain current and difference', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          summary: '本月收入 1280，差额 280。',
          keyFindings: [],
          caveats: [],
          displayMode: 'metric',
          coveredFacts: ['metric_value', 'data_policy', 'comparison_current', 'comparison_previous', 'comparison_difference'],
        },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      rows: [{ current_period_net_revenue: 1280, revenue_difference: 280 }],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'comparison_current', 'comparison_previous', 'comparison_difference'],
      controlledQueryPlan: { answerShape: 'comparison', metricKeys: ['order_revenue'], dimensions: [], comparisonMode: 'previous_period' },
    });

    expect(answer.coveredFacts).not.toContain('comparison_previous');
    expect(answer.caveats.join(' ')).toContain('未覆盖');
  });

  it('falls back when the model falsely claims returned detail fields are unavailable', async () => {
    const previousDeterministicAnswer = process.env.ASK_DATA_FREE_SQL_DETERMINISTIC_ANSWER_ENABLED;
    process.env.ASK_DATA_FREE_SQL_DETERMINISTIC_ANSWER_ENABLED = 'false';
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          summary: '以下为符合条件的客户。',
          keyFindings: ['刘***（客户ID 4021）：累计实收6674。'],
          caveats: ['Schema未提供客户明细列表字段，无法完整展示。'],
          displayMode: 'table',
          coveredFacts: ['metric_value', 'data_policy', 'list_items'],
        },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    try {
      const answer = await service.compose({
        ...input,
        question: '哪些客户消费了钱但很少用次卡',
        rows: [{ customer_id: 4021, customer_name_masked: '刘***', total_paid_amount: '6674.000000' }],
        requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
        controlledQueryPlan: {
          answerShape: 'list',
          metricKeys: ['customer_profile'],
          dimensions: [],
          requiredOutputFields: ['customer_id', 'customer_name_masked', 'total_paid_amount'],
          resultMode: 'detail',
        },
      });

      expect(answer.caveats.join(' ')).toContain('错误声明无法完成查询');
      expect(answer.caveats.join(' ')).not.toContain('Schema未提供');
      expect(answer.summary).toContain('customer_id=4021');
      expect(answer.summary).toContain('total_paid_amount=6674');
    } finally {
      if (previousDeterministicAnswer === undefined) delete process.env.ASK_DATA_FREE_SQL_DETERMINISTIC_ANSWER_ENABLED;
      else process.env.ASK_DATA_FREE_SQL_DETERMINISTIC_ANSWER_ENABLED = previousDeterministicAnswer;
    }
  });

  it('formats rates as business-friendly percentages instead of exposing database precision', async () => {
    const ai = { generateStructured: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({ ...input, rows: [{ refund_rate: 0.123456789 }] });

    expect(answer.summary).toContain('退款率=12.35%');
    expect(answer.summary).not.toContain('0.123456789');
  });

  it('formats database dates as business dates instead of raw timestamps', async () => {
    const ai = { generateStructured: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      rows: [{ settlement_day: new Date('2026-07-02T00:00:00.000Z'), net_amount: '123.450000' }],
    });

    expect(answer.summary).toContain('结算日期=2026-07-02');
    expect(answer.summary).not.toContain('T00:00:00.000Z');
  });

  it('preserves the local calendar month for PostgreSQL date values', async () => {
    const ai = { generateStructured: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '最近三个月收入趋势',
      rows: [{ trend_month: new Date('2026-04-30T16:00:00.000Z'), revenue: 123 }],
      controlledQueryPlan: {
        answerShape: 'trend',
        metricKeys: ['order_revenue'],
        dimensions: [{ key: 'date', field: 'trend_month', viewName: 'agent_v3_order_summary_view' }],
        requiredOutputFields: ['trend_month', 'revenue'],
        resultMode: 'trend',
      },
    });

    expect(answer.summary).toContain('月份=2026-05-01');
    expect(answer.summary).not.toContain('2026-04-30');
  });

  it('formats refund timestamps in the store business timezone and prioritizes refund detail fields', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '帮我生成一份退款明细报告',
      rows: [{
        order_id: 901,
        payment_amount: 298,
        refund_amount: 298,
        flow_count: 1,
        paid_at: new Date('2026-07-12T22:20:00.000Z'),
        refunded_at: new Date('2026-07-12T23:10:00.000Z'),
        refund_status: 'completed',
        refund_reason_category: 'customer_request',
      }],
      selectedViews: [{
        label: '支付与退款',
        fields: [
          { name: 'order_id', description: '订单 ID', type: 'number', policy: 'allow' },
          { name: 'refunded_at', description: '退款时间', type: 'date', policy: 'allow' },
          { name: 'refund_amount', description: '退款金额', type: 'number', policy: 'allow' },
          { name: 'refund_status', description: '退款状态', type: 'string', policy: 'allow' },
          { name: 'refund_reason_category', description: '退款原因分类', type: 'string', policy: 'allow' },
        ],
      }] as any,
      requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'amount_unit', 'list_items'],
      controlledQueryPlan: {
        answerShape: 'list',
        metricKeys: ['payment_flow'],
        dimensions: [],
        requiredOutputFields: ['order_id', 'refunded_at', 'refund_amount', 'refund_status', 'refund_reason_category'],
        resultMode: 'detail',
      },
    });

    expect(answer.summary).toContain('订单 ID=901');
    expect(answer.summary).toContain('退款时间=2026-07-13 07:10');
    expect(answer.summary).toContain('退款冲减金额=298 元');
    expect(answer.summary).toContain('退款状态=completed');
    expect(answer.summary).toContain('退款原因分类=customer_request');
    expect(answer.summary).not.toContain('支付时间');
  });

  it('renders inventory turnover policies and statuses as product-facing Chinese labels', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '哪些产品低于安全库存且没有未完成采购',
      rows: [{
        product_id: 82,
        product_name: '玻尿酸保湿精华',
        slow_moving_status: 'low_turnover',
        replenishment_fact_status: 'below_safety_no_open_procurement',
        turnover_policy: 'operational_event_weighted_not_financial_turnover',
        cost_policy: 'catalog_cost_estimated_not_batch_actual',
      }],
      selectedViews: [{
        label: '库存周转与采购覆盖',
        fields: [
          { name: 'product_id', description: '商品 ID', type: 'number', policy: 'allow' },
          { name: 'product_name', description: '商品名称', type: 'text', policy: 'allow' },
          { name: 'slow_moving_status', description: '慢动销状态', type: 'text', policy: 'allow' },
          { name: 'replenishment_fact_status', description: '采购覆盖状态', type: 'text', policy: 'allow' },
          { name: 'turnover_policy', description: '运营周转口径', type: 'text', policy: 'allow' },
          { name: 'cost_policy', description: '成本估算口径', type: 'text', policy: 'allow' },
        ],
      }] as any,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
      controlledQueryPlan: {
        answerShape: 'list',
        metricKeys: ['inventory_procurement_coverage'],
        dimensions: [{ key: 'product', field: 'product_id', viewName: 'ask_data_inventory_turnover_view' }],
        requiredOutputFields: [
          'product_id',
          'product_name',
          'slow_moving_status',
          'replenishment_fact_status',
          'turnover_policy',
          'cost_policy',
        ],
        resultMode: 'detail',
      },
    });

    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(answer.summary).toContain('慢动销状态=低周转');
    expect(answer.summary).toContain('采购覆盖状态=达到安全库存预警且无未完成采购');
    expect(answer.summary).not.toContain('below_safety_no_open_procurement');
  });

  it('uses governed Chinese aliases and omits irrelevant null optional fields', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '最近14天入库了多少货',
      rows: [{ movement_quantity: 0, movement_count: 0, optional_note: null }],
      selectedViews: [{ label: '库存流水', fields: [] }] as any,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'time_range'],
      controlledQueryPlan: {
        answerShape: 'scalar',
        metricKeys: ['inventory_movement'],
        dimensions: [],
        requiredOutputFields: ['movement_quantity', 'movement_count', 'optional_note'],
        aggregations: [
          { field: 'quantity', alias: 'movement_quantity', fn: 'sum', zeroOnEmpty: true },
          { field: 'movement_id', alias: 'movement_count', fn: 'count' },
        ],
        resultMode: 'scalar',
      },
    });

    expect(answer.summary).toContain('库存变动数量=0');
    expect(answer.summary).toContain('库存流水笔数=0');
    expect(answer.summary).not.toContain('optional note');
    expect(answer.summary).not.toContain('=-');
  });

  it('prioritizes supplier commercial values over technical ids in deterministic answers', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '我们和各供应商的账期及结算方式是怎么约定的',
      rows: [{
        quote_id: 1,
        product_id: 82,
        product_name: '玻尿酸保湿精华',
        supplier_id: 3,
        supplier_name: '核心耗材供应商',
        payment_terms: '月结 30 天',
        settlement_mode: 'monthly',
      }],
      selectedViews: [{
        label: '供应商报价与商业条款',
        fields: [
          { name: 'supplier_name', description: '供应商名称', type: 'text', policy: 'allow' },
          { name: 'payment_terms', description: '账期条款；空值表示后台未维护', type: 'text', policy: 'allow' },
          { name: 'settlement_mode', description: '结算方式', type: 'text', policy: 'allow' },
        ],
      }] as any,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
      controlledQueryPlan: {
        answerShape: 'list',
        metricKeys: ['supplier_payment_terms'],
        dimensions: [{ key: 'supplier', field: 'supplier_name', viewName: 'ask_data_supplier_quote_terms_view' }],
        requiredOutputFields: ['quote_id', 'product_id', 'product_name', 'supplier_id', 'supplier_name', 'payment_terms', 'settlement_mode'],
        aggregations: [
          { field: 'payment_terms', alias: 'payment_terms', fn: 'none' },
          { field: 'settlement_mode', alias: 'settlement_mode', fn: 'none' },
        ],
        resultMode: 'detail',
      },
    });

    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(answer.summary).toContain('供应商名称=核心耗材供应商');
    expect(answer.summary).toContain('账期条款=月结 30 天');
    expect(answer.summary).toContain('结算方式=月结');
    expect(answer.summary).not.toContain('报价 ID');
  });

  it('shows MOQ and lead-day values in supplier deterministic list rows', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '各品类的最低采购量要求和报价交期是什么',
      rows: [{
        quote_id: 1,
        category_name: '面部耗材',
        product_name: '玻尿酸保湿精华',
        supplier_name: '核心耗材供应商',
        minimum_order_quantity: 10,
        lead_days: 4,
      }],
      selectedViews: [{
        label: '供应商报价与商业条款',
        fields: [
          { name: 'category_name', description: '商品分类', type: 'text', policy: 'allow' },
          { name: 'minimum_order_quantity', description: '最低采购量 MOQ', type: 'number', policy: 'allow' },
          { name: 'lead_days', description: '预计交付天数；空值表示后台未维护', type: 'number', policy: 'allow' },
        ],
      }] as any,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
      controlledQueryPlan: {
        answerShape: 'list',
        metricKeys: ['supplier_minimum_order_quantity', 'supplier_lead_time'],
        dimensions: [{ key: 'product_category', field: 'category_name', viewName: 'ask_data_supplier_quote_terms_view' }],
        requiredOutputFields: ['quote_id', 'category_name', 'product_name', 'supplier_name', 'minimum_order_quantity', 'lead_days'],
        aggregations: [
          { field: 'minimum_order_quantity', alias: 'minimum_order_quantity', fn: 'none' },
          { field: 'lead_days', alias: 'lead_days', fn: 'none' },
        ],
        resultMode: 'detail',
      },
    });

    expect(answer.summary).toContain('商品分类=面部耗材');
    expect(answer.summary).toContain('最低采购量 MOQ=10');
    expect(answer.summary).toContain('预计交付天数=4');
    expect(answer.summary).not.toContain('空值表示后台未维护');
  });

  it('renders supplier quote states as product-facing Chinese labels', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '列出各供应商当前报价的含税状态和库存状态',
      rows: [{
        supplier_name: '核心耗材供应商',
        tax_included: true,
        stock_status: 'available',
      }],
      selectedViews: [{
        label: '供应商报价与商业条款',
        fields: [
          { name: 'supplier_name', description: '供应商名称', type: 'text', policy: 'allow' },
          { name: 'tax_included', description: '报价是否含税', type: 'boolean', policy: 'allow' },
          { name: 'stock_status', description: '供应商库存状态', type: 'text', policy: 'allow' },
        ],
      }] as any,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
      controlledQueryPlan: {
        answerShape: 'list',
        metricKeys: ['supplier_quote_availability'],
        dimensions: [{ key: 'supplier', field: 'supplier_name', viewName: 'ask_data_supplier_quote_terms_view' }],
        requiredOutputFields: ['supplier_name', 'tax_included', 'stock_status'],
        aggregations: [
          { field: 'tax_included', alias: 'tax_included', fn: 'none' },
          { field: 'stock_status', alias: 'stock_status', fn: 'none' },
        ],
        resultMode: 'detail',
      },
    });

    expect(answer.summary).toContain('报价是否含税=含税');
    expect(answer.summary).toContain('供应商库存状态=可供货');
    expect(answer.summary).not.toContain('=true');
    expect(answer.summary).not.toContain('=available');
  });

  it('keeps the supplier quote difference visible within the five-field summary limit', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '当前首选供应商报价与同商品最低报价差多少',
      rows: [{
        quote_id: 2,
        product_id: 82,
        product_name: '玻尿酸保湿精华',
        product_sku: 'SKU-001',
        supplier_id: 2,
        supplier_name: '官方供应链',
        quote_price: 168,
        lowest_current_quote_price: 12,
        price_difference_from_lowest: 156,
      }],
      selectedViews: [{
        label: '供应商报价与商业条款',
        fields: [
          { name: 'product_name', description: '商品名称', type: 'text', policy: 'allow' },
          { name: 'supplier_name', description: '供应商名称', type: 'text', policy: 'allow' },
          { name: 'quote_price', description: '已审批报价', type: 'number', policy: 'allow' },
          { name: 'lowest_current_quote_price', description: '同商品当前最低已审批报价', type: 'number', policy: 'allow' },
          { name: 'price_difference_from_lowest', description: '当前报价与同商品最低报价的差额', type: 'number', policy: 'allow' },
        ],
      }] as any,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
      controlledQueryPlan: {
        answerShape: 'list',
        metricKeys: ['supplier_price_comparison'],
        dimensions: [],
        requiredOutputFields: [
          'quote_id', 'product_id', 'product_name', 'product_sku', 'supplier_id', 'supplier_name',
          'quote_price', 'lowest_current_quote_price', 'price_difference_from_lowest',
        ],
        aggregations: [
          { field: 'quote_price', alias: 'quote_price', fn: 'none' },
          { field: 'lowest_current_quote_price', alias: 'lowest_current_quote_price', fn: 'none' },
          { field: 'price_difference_from_lowest', alias: 'price_difference_from_lowest', fn: 'none' },
        ],
        resultMode: 'detail',
      },
    });

    expect(answer.summary).toContain('商品名称=玻尿酸保湿精华');
    expect(answer.summary).toContain('供应商名称=官方供应链');
    expect(answer.summary).toContain('已审批报价=168 元');
    expect(answer.summary).toContain('同商品当前最低已审批报价=12 元');
    expect(answer.summary).toContain('当前报价与同商品最低报价的差额=156 元');
    expect(answer.summary).not.toContain('SKU-001');
    expect(answer.caveats.join(' ')).toContain('不等于最终采购成交价');
    expect(answer.caveats.join(' ')).toContain('不构成更换供应商建议');
  });

  it.each([
    '这个季度和上个季度的成本结构有什么变化',
    '本季度较上季度成本怎么变了',
    '近两个季度经营费用走势',
    '季度成本结构变化趋势',
    '上季度到本季度成本变化',
  ])('discloses insufficient evidence when only one trend point exists: %s', async (question) => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          summary: '成本为 55000。',
          keyFindings: [],
          caveats: [],
          displayMode: 'trend',
          coveredFacts: ['metric_value', 'data_policy', 'time_range', 'trend_granularity', 'trend_points'],
        },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question,
      rows: [{ trend_month: new Date('2026-06-01T00:00:00.000Z'), operating_cost: '55000' }],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'time_range', 'trend_granularity', 'trend_points'],
      controlledQueryPlan: {
        answerShape: 'trend',
        metricKeys: ['operating_cost'],
        dimensions: [{ key: 'date', field: 'period_month', viewName: 'ask_data_operating_cost_view' }],
        requiredOutputFields: ['trend_month', 'operating_cost'],
        resultMode: 'trend',
        timeGrain: {
          sourceField: 'period_month',
          granularity: 'month',
          alias: 'trend_month',
          expression: "DATE_TRUNC('month', period_month)::date",
        },
      },
    });

    expect(answer.summary).toContain('数据不足以形成变化结论');
    expect(answer.caveats.join(' ')).toContain('不足');
    expect(answer.coveredFacts).toEqual(expect.arrayContaining(['trend_granularity', 'trend_points']));
  });

  it('keeps all requested payment methods in the deterministic fallback', async () => {
    const ai = { generateStructured: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '今天现金、微信、支付宝各收了多少',
      rows: [{ cash_payment_amount: '0', wechat_payment_amount: '120', alipay_payment_amount: '80' }],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'time_range', 'all_requested_dimensions'],
      controlledQueryPlan: {
        answerShape: 'comparison',
        metricKeys: ['payment_flow'],
        dimensions: [],
        comparisonMode: 'dimension',
        requiredOutputFields: ['cash_payment_amount', 'wechat_payment_amount', 'alipay_payment_amount'],
        resultMode: 'scalar',
      },
    });

    expect(answer.summary).toContain('现金收款=0 元');
    expect(answer.summary).toContain('微信收款=120 元');
    expect(answer.summary).toContain('支付宝收款=80 元');
    expect(answer.coveredFacts).toContain('all_requested_dimensions');
  });

  it('answers zero-refund income and cost explicitly instead of exposing a technical counter', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '本月商品退款冲减了多少收入和成本',
      rows: [{
        gross_revenue: 0,
        discount_amount: 0,
        refund_amount: 0,
        net_revenue: 0,
        attributed_cost: 0,
        contribution_margin: 0,
        contribution_margin_rate: null,
        estimated_cost_event_count: 0,
        cost_missing_event_count: 0,
      }],
      selectedViews: [{ label: '商品与项目贡献毛利', fields: [] }] as any,
      requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'amount_unit'],
      controlledQueryPlan: {
        answerShape: 'scalar',
        metricKeys: ['item_contribution_margin'],
        dimensions: [],
        requiredOutputFields: [
          'gross_revenue', 'discount_amount', 'refund_amount', 'net_revenue', 'attributed_cost',
          'contribution_margin', 'contribution_margin_rate', 'estimated_cost_event_count', 'cost_missing_event_count',
        ],
        aggregations: [
          { field: 'refund_amount', alias: 'refund_amount', fn: 'sum', zeroOnEmpty: true },
          { field: 'attributed_cost', alias: 'attributed_cost', fn: 'sum', zeroOnEmpty: true },
        ],
        resultMode: 'scalar',
      },
    });

    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(answer.summary).toContain('退款冲减金额=0 元');
    expect(answer.summary).toContain('可归属商品或耗材成本=0 元');
    expect(answer.summary).not.toContain('estimated cost event');
    expect(answer.caveats.join(' ')).toContain('不等同于已确认经营利润');
  });

  it('keeps item-type identity and gives a direct product-versus-project margin conclusion', async () => {
    const ai = { generateStructured: jest.fn().mockRejectedValue(new Error('provider timeout')) };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      question: '产品销售和服务项目毛利哪个高',
      rows: [
        { item_type: 'product', contribution_margin: 2028.35, contribution_margin_rate: 0.4737, estimated_cost_event_count: 2, cost_missing_event_count: 0 },
        { item_type: 'project', contribution_margin: 9884.69, contribution_margin_rate: 0.9248, estimated_cost_event_count: 8, cost_missing_event_count: 0 },
      ],
      selectedViews: [{ label: '商品与项目贡献毛利', fields: [] }] as any,
      requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'amount_unit', 'all_requested_dimensions'],
      controlledQueryPlan: {
        answerShape: 'comparison',
        comparisonMode: 'dimension',
        metricKeys: ['item_contribution_margin'],
        dimensions: [{ key: 'item_type', field: 'item_type', viewName: 'ask_data_item_margin_view' }],
        requiredOutputFields: ['item_type', 'contribution_margin', 'contribution_margin_rate', 'estimated_cost_event_count', 'cost_missing_event_count'],
        aggregations: [
          { field: 'net_revenue', alias: 'contribution_margin', fn: 'derived', sourceFields: ['net_revenue', 'attributed_cost'] },
        ],
        resultMode: 'grouped',
      },
    });

    expect(answer.summary).toContain('服务项目的贡献毛利为 9884.69 元');
    expect(answer.summary).toContain('高于商品的 2028.35 元');
    expect(answer.keyFindings.join(' ')).toContain('品项类型=商品');
    expect(answer.keyFindings.join(' ')).toContain('品项类型=服务项目');
    expect(answer.caveats.join(' ')).toContain('10 个经济事件使用商品档案成本或 BOM 标准成本估算');
  });

  it('sends at most 24 representative trend rows and exposes total versus sampled counts', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({ trend_day: `2026-06-${String(index + 1).padStart(2, '0')}`, revenue: index }));
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          summary: '趋势数据已返回。', keyFindings: [], caveats: [], displayMode: 'trend',
          coveredFacts: ['metric_value', 'data_policy', 'trend_granularity', 'trend_points'],
        },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    await service.compose({
      ...input,
      rows,
      requiredAnswerFacts: ['metric_value', 'data_policy', 'trend_granularity', 'trend_points'],
      controlledQueryPlan: { answerShape: 'trend', metricKeys: ['order_revenue'], dimensions: [] },
    });

    const call = ai.generateStructured.mock.calls[0][0];
    const payload = JSON.parse(call.messages[1].content);
    expect(payload.totalRowCount).toBe(60);
    expect(payload.rowsSampled).toBe(24);
    expect(payload.rows).toHaveLength(24);
    expect(payload.rows[0]).toEqual(rows[0]);
    expect(payload.rows[23]).toEqual(rows[59]);
    expect(call.timeoutMs).toBe(12000);
    expect(call.allowFallback).toBe(true);
    expect(call.fallbackMessages).toEqual(call.messages);
  });
});
