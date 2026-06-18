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

    expect(cardRisk.task.domain).toBe('card');
    expect(cardRisk.task.taskType).toBe('forecast');
    expect(cardRisk.task.metrics).toContain('card_expiry_risk');
    expect(memberBalance.task.domain).toBe('memberCard');
    expect(memberBalance.task.taskType).toBe('query');
    expect(memberBalance.task.metrics).toContain('member_balance');
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
