import { BusinessTaskPreParserService } from './business-task-preparser.service.js';

describe('BusinessTaskPreParserService', () => {
  const service = new BusinessTaskPreParserService();

  it('keeps the limit and semantic intent for customer priority follow-up', () => {
    const result = service.parse({ message: '今天最值得跟进的10个客户', role: 'manager' });

    expect(result.task).toMatchObject({
      domain: 'customer',
      taskType: 'recommendation',
      limit: 10,
      outputMode: 'ranked_list',
      metrics: ['follow_up_priority_score'],
      timeRange: { preset: 'today', label: '今天' },
      requiresApproval: false,
    });
    expect(result.deterministicSlots).toMatchObject({
      domainMatched: true,
      taskTypeMatched: true,
      limitMatched: true,
      timeRangeMatched: true,
      metricMatched: true,
    });
  });

  it('extracts Chinese numeral limits for customer callback recommendations', () => {
    const result = service.parse('今天优先回访五个老客');

    expect(result.task.domain).toBe('customer');
    expect(result.task.taskType).toBe('recommendation');
    expect(result.task.limit).toBe(5);
    expect(result.task.filters.customerSegment).toBe('existing');
  });

  it('recognizes urgent recall customer lists as customer priority rankings', () => {
    const result = service.parse({ message: '请列出10个需要紧急召回的客户', role: 'manager' });

    expect(result.task).toMatchObject({
      domain: 'customer',
      taskType: 'recommendation',
      limit: 10,
      outputMode: 'ranked_list',
      outputIntent: 'show_table',
      filters: { customerSegment: 'churn_risk' },
      requiredFields: ['customerName', 'priorityScore', 'reason', 'suggestedAction'],
    });
    expect(result.task.metrics).toEqual(expect.arrayContaining(['follow_up_priority_score', 'churn_risk_score']));
    expect(result.task.sort).toEqual([{ field: 'follow_up_priority_score', direction: 'desc' }]);
    expect(result.deterministicSlots).toMatchObject({
      domainMatched: true,
      taskTypeMatched: true,
      limitMatched: true,
      metricMatched: true,
    });
  });

  it('recognizes product sales growth ranking', () => {
    const result = service.parse('近30天销量增长最快的商品');

    expect(result.task.domain).toBe('product');
    expect(result.task.taskType).toBe('ranking');
    expect(result.task.timeRange?.preset).toBe('last_30_days');
    expect(result.task.metrics).toContain('product_sales_growth');
  });

  it('recognizes project service and margin questions', () => {
    const trend = service.parse('最近做得最多的项目');
    const margin = service.parse('项目耗材毛利怎么样');

    expect(trend.task.domain).toBe('project');
    expect(trend.task.metrics).toContain('project_service_growth');
    expect(margin.task.domain).toBe('project');
    expect(margin.task.metrics).toContain('gross_margin');
  });

  it('recognizes card and member balance questions before generic customer membership', () => {
    const cardRisk = service.parse('未来30天哪些次卡快到期');
    const memberBalance = service.parse('会员卡余额怎么样');
    const customerBenefits = service.parse({
      message: '这个客户还有什么卡和权益？',
      role: 'reception',
      context: {
        conversationFocus: {
          currentCustomer: {
            customerId: 501,
            customerName: '马美琳',
          },
        },
      },
    });

    expect(cardRisk.task.domain).toBe('card');
    expect(cardRisk.task.taskType).toBe('forecast');
    expect(cardRisk.task.metrics).toContain('card_expiry_risk');
    expect(memberBalance.task.domain).toBe('memberCard');
    expect(memberBalance.task.taskType).toBe('query');
    expect(memberBalance.task.metrics).toContain('member_balance');
    expect(customerBenefits.task.domain).toBe('card');
    expect(customerBenefits.task.filters).toMatchObject({ customerId: 501, customerName: '马美琳' });
  });

  it('recognizes finance margin questions as finance diagnosis', () => {
    const result = service.parse('近30天毛利怎么样');

    expect(result.task.domain).toBe('finance');
    expect(result.task.taskType).toBe('query');
    expect(result.task.timeRange?.preset).toBe('last_30_days');
    expect(result.task.metrics).toContain('gross_margin');
  });

  it('recognizes revenue diagnosis tasks', () => {
    const result = service.parse('为什么今天收入下降');

    expect(result.task.domain).toBe('business');
    expect(result.task.taskType).toBe('diagnosis');
    expect(result.task.timeRange?.preset).toBe('today');
    expect(result.task.metrics).toContain('revenue');
  });

  it('keeps paid amount and net revenue as separate business metrics', () => {
    const paid = service.parse({ message: '今天实收多少', role: 'manager' });
    const net = service.parse({ message: '今天净收入多少', role: 'manager' });

    expect(paid.task.metrics).toContain('paid_amount');
    expect(paid.task.metrics).not.toContain('net_revenue');
    expect(net.task.metrics).toContain('net_revenue');
  });

  it('recognizes time plus KPI shorthand phrases as queries', () => {
    const cases = [
      { message: '这个月营业额', preset: 'this_month', metrics: ['revenue'] },
      { message: '本月营收', preset: 'this_month', metrics: ['revenue'] },
      { message: '今日收入', preset: 'today', metrics: ['revenue'] },
      { message: '昨天流水', preset: 'yesterday', metrics: ['revenue'] },
      { message: '这个月客单价', preset: 'this_month', metrics: ['revenue', 'average_order_value'] },
      { message: '本月订单数', preset: 'this_month', metrics: ['revenue', 'order_count'] },
    ];

    for (const item of cases) {
      const result = service.parse(item.message);

      expect(result.task.taskType).toBe('query');
      expect(result.task.timeRange?.preset).toBe(item.preset);
      expect(result.task.outputIntent).toBe('show_kpi');
      expect(result.task.missingSlots).not.toContain('taskType');
      expect(result.deterministicSlots.taskTypeMatched).toBe(true);
      expect(result.task.metrics).toEqual(expect.arrayContaining(item.metrics));
    }
  });

  it('recognizes consumption customer list questions as order tasks before generic customer growth', () => {
    const result = service.parse('昨天有哪些消费的客户，列出清单');

    expect(result.task.domain).toBe('order');
    expect(result.task.taskType).toBe('query');
    expect(result.task.timeRange?.preset).toBe('yesterday');
    expect(result.task.metrics).toEqual(expect.arrayContaining(['paid_amount', 'order_count']));
    expect(result.task.outputMode).toBe('card');
    expect(result.task).toMatchObject({
      event: 'paid_order',
      outputIntent: 'show_table',
      requiredFields: expect.arrayContaining(['customerName', 'paidAmount', 'orderCount', 'lastOrderTime']),
    });
  });

  it('recognizes weekly流水客户名单 as an order customer consumption list query', () => {
    const result = service.parse('上周流水客户名单');

    expect(result.task.domain).toBe('order');
    expect(result.task.taskType).toBe('query');
    expect(result.task.timeRange?.preset).toBe('last_week');
    expect(result.task.metrics).toEqual(expect.arrayContaining(['paid_amount', 'order_count']));
    expect(result.task.outputMode).toBe('card');
    expect(result.task).toMatchObject({
      event: 'paid_order',
      outputIntent: 'show_table',
      requiredFields: expect.arrayContaining(['customerName', 'itemsSummary']),
    });
  });

  it('recognizes schedule availability questions as queries', () => {
    const result = service.parse('今天哪些美容师空闲');

    expect(result.task.domain).toBe('schedule');
    expect(result.task.taskType).toBe('query');
    expect(result.task.timeRange?.preset).toBe('today');
    expect(result.task.metrics).toContain('schedule_utilization_rate');
    expect(result.task.missingSlots).not.toContain('limit');
  });

  it('recognizes enhanced and new business domains without falling back to generic areas', () => {
    const staff = service.parse('近期表现较好的员工');
    const supplier = service.parse('哪个供应商供货慢');
    const app = service.parse('小程序最近带来多少客户');
    const automation = service.parse('自动化触达效果怎么样');
    const refund = service.parse('哪些退款异常');
    const terminal = service.parse('终端最近失败最多的问题');
    const serviceQuality = service.parse('服务质量怎么样');
    const selfStaff = service.parse({ message: '我的表现怎么样', role: 'beautician' });

    expect(staff.task).toMatchObject({ domain: 'staff', taskType: 'ranking' });
    expect(staff.task.metrics).toContain('staff_performance_score');
    expect(selfStaff.task).toMatchObject({ domain: 'staff', taskType: 'query' });
    expect(selfStaff.task.metrics).toContain('staff_performance_score');
    expect(supplier.task).toMatchObject({ domain: 'supplyChain', taskType: 'diagnosis' });
    expect(supplier.task.metrics).toContain('supplier_delivery_cycle');
    expect(app.task).toMatchObject({ domain: 'customerApp', taskType: 'query' });
    expect(app.task.metrics).toContain('channel_conversion_rate');
    expect(automation.task).toMatchObject({ domain: 'automation', taskType: 'query' });
    expect(automation.task.metrics).toContain('automation_touch_success_rate');
    expect(refund.task).toMatchObject({ domain: 'afterSales', taskType: 'diagnosis' });
    expect(refund.task.metrics).toEqual(expect.arrayContaining(['refund_amount', 'refund_rate']));
    expect(terminal.task).toMatchObject({ domain: 'terminal', taskType: 'ranking' });
    expect(terminal.task.metrics).toContain('terminal_failure_rate');
    expect(serviceQuality.task).toMatchObject({ domain: 'serviceQuality', taskType: 'query' });
    expect(serviceQuality.task.metrics).toContain('service_completion_rate');
  });

  it('applies conversation focus for customer pronoun follow-up questions', () => {
    const result = service.parse({
      message: '这个客户还有什么卡和权益？',
      role: 'manager',
      context: {
        conversationFocus: {
          sourceRunId: 112,
          timeRange: { preset: 'yesterday', label: '昨天' },
          currentCustomer: {
            customerId: 501,
            customerName: '马美琳',
            phoneMasked: '138****1234',
            paidAmountText: '¥1,500',
          },
        },
      },
    });

    expect(result.task.filters).toMatchObject({
      customerId: 501,
      customerName: '马美琳',
      phoneMasked: '138****1234',
    });
    expect(result.task.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'customer', value: '马美琳', confidence: 0.86 })]),
    );
    expect(result.task.timeRange).toMatchObject({ preset: 'yesterday', label: '昨天' });
    expect(result.warnings).toEqual(
      expect.arrayContaining(['已使用上一轮当前关注客户补齐查询条件', '已沿用上一轮时间范围']),
    );
  });

  it('recovers the previous focused customer from previousResult context', () => {
    const result = service.parse({
      message: '她的消费明细继续列一下',
      role: 'reception',
      context: {
        previousResult: {
          conversationFocus: {
            currentCustomer: {
              customerId: 502,
              customerName: '林晓雯',
            },
          },
        },
      },
    });

    expect(result.task.filters).toMatchObject({ customerId: 502, customerName: '林晓雯' });
    expect(result.task.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'customer', value: '林晓雯' })]),
    );
    expect(result.task.outputIntent).toBe('show_table');
  });

  it('limits priority follow-up questions to the previous consumption customer list', () => {
    const result = service.parse({
      message: '优先联系哪些客户？',
      role: 'manager',
      context: {
        conversationFocus: {
          sourceRunId: 156,
          timeRange: { preset: 'yesterday', label: '昨天' },
          currentItems: [
            {
              customerId: 501,
              customerName: '马美琳',
              paidAmount: 3600,
              paidAmountText: '¥3,600',
              memberLevel: '金卡',
              phoneMasked: '138****0001',
              itemsSummary: '水光护理',
              suggestion: '优先邀约复购水光护理。',
            },
            {
              customerId: 502,
              customerName: '林晓雯',
              paidAmount: 980,
              paidAmountText: '¥980',
              memberLevel: '银卡',
              phoneMasked: '139****0002',
              itemsSummary: '肩颈护理',
            },
          ],
        },
      },
    });

    expect(result.task).toMatchObject({
      domain: 'customer',
      taskType: 'recommendation',
      limit: 2,
      outputMode: 'ranked_list',
      outputIntent: 'show_table',
      timeRange: { preset: 'yesterday', label: '昨天' },
    });
    expect(result.task.metrics).toContain('follow_up_priority_score');
    expect(result.task.filters).toMatchObject({
      contextScope: 'previous_order_customer_consumption_list',
      customerIds: [501, 502],
      focusedCustomers: [
        expect.objectContaining({ customerId: 501, customerName: '马美琳', paidAmountText: '¥3,600' }),
        expect.objectContaining({ customerId: 502, customerName: '林晓雯', paidAmountText: '¥980' }),
      ],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining(['已将追问限定在上一轮消费客户清单范围内', '已沿用上一轮时间范围']),
    );
  });

  it('applies conversation focus for marketing activity follow-up questions', () => {
    const result = service.parse({
      message: '这个活动转化效果怎么样？',
      role: 'manager',
      context: {
        conversationFocus: {
          sourceRunId: 125,
          currentActivity: {
            activityId: 901,
            activityTitle: '编辑后的沉睡客户召回活动',
            status: 'draft',
          },
        },
      },
    });

    expect(result.task.domain).toBe('marketing');
    expect(result.task.filters).toMatchObject({
      activityId: 901,
      activityTitle: '编辑后的沉睡客户召回活动',
      activityStatus: 'draft',
    });
    expect(result.task.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'marketing', value: '编辑后的沉睡客户召回活动', confidence: 0.86 }),
      ]),
    );
    expect(result.warnings).toEqual(expect.arrayContaining(['已使用上一轮当前关注活动补齐查询条件']));
  });

  it('marks draft or workflow requests as requiring approval', () => {
    const draft = service.parse('帮我生成这些客户的跟进任务');
    const workflow = service.parse('下发这些客户的跟进任务');

    expect(draft.task.taskType).toBe('draft');
    expect(draft.task.requiresApproval).toBe(true);
    expect(draft.task.outputMode).toBe('draft');
    expect(workflow.task.taskType).toBe('workflow');
    expect(workflow.task.requiresApproval).toBe(true);
    expect(workflow.task.outputMode).toBe('workflow');
  });
});
