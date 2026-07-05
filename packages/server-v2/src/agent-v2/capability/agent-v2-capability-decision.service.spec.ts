import { AgentV2CapabilityDecisionService } from './agent-v2-capability-decision.service.js';

describe('AgentV2CapabilityDecisionService', () => {
  const service = new AgentV2CapabilityDecisionService();

  it('routes occurred scrap questions to scrap records instead of inventory risk', () => {
    const decision = service.decide({ message: '本周有哪些报废产品', role: 'manager' });

    expect(decision.selected?.capabilityId).toBe('inventory.scrap.records.list');
    expect(decision.toolPlan[0]).toMatchObject({
      tool: 'business.record.query',
      args: expect.objectContaining({ capabilityId: 'inventory.scrap.records.list' }),
    });
    expect(decision.excluded.map((item) => item.capabilityId)).toContain('inventory.expiring-risk.list');
  });

  it('routes future scrap risk questions to expiring risk', () => {
    const decision = service.decide({ message: '哪些产品快报废了', role: 'manager' });

    expect(decision.selected?.capabilityId).toBe('inventory.expiring-risk.list');
    expect(decision.toolPlan[0]).toMatchObject({
      tool: 'inventory.risk.rank',
      args: expect.objectContaining({ capabilityId: 'inventory.expiring-risk.list' }),
    });
  });

  it('can exclude a contract-failed capability and reselect the next catalog candidate', () => {
    const decision = service.decide({
      message: '本周有哪些报废产品',
      role: 'manager',
      excludedCapabilityIds: ['inventory.scrap.records.list'],
    });

    expect(decision.selected?.capabilityId).not.toBe('inventory.scrap.records.list');
    expect(decision.excluded[0]).toMatchObject({
      capabilityId: 'inventory.scrap.records.list',
      reason: expect.stringContaining('contract_retry_excluded'),
    });
  });

  it('routes write-like scrap requests to draft operations', () => {
    const decision = service.decide({ message: '帮我报废这批过期面膜', role: 'manager' });

    expect(decision.selected?.capabilityId).toBe('inventory.stock.operation.draft');
    expect(decision.toolPlan[0]).toMatchObject({
      tool: 'business.action.draft',
      args: expect.objectContaining({ capabilityId: 'inventory.stock.operation.draft' }),
    });
  });

  it.each([
    ['今天有哪些商品订单', 'order.product.records.list', 'business.record.query'],
    ['项目订单 PO1781893252477 为什么没有同步到客户消费记录', 'order.project.records.list', 'business.record.query'],
    ['今天会员卡充值记录', 'order.member-card.records.list', 'business.record.query'],
    ['次卡开卡管理有哪些订单', 'order.card-package.records.list', 'business.record.query'],
    ['今天次卡核销记录', 'card.usage.records.list', 'business.record.query'],
    ['看一下订单 POMQPDGTF8', 'order.detail.lookup', 'business.detail.query'],
    ['订单 POMQPDGTF8 有没有进入财务日结', 'finance.daily-settlement.metric', 'business.metric.query'],
    ['最近三天营业额趋势怎么样', 'finance.revenue.trend', 'business.trend.query'],
    ['今天现金、微信、支付宝各收了多少', 'finance.payment-method-breakdown.metric', 'business.metric.query'],
    ['今天退款有几笔，金额多少', 'finance.refund.metric', 'business.metric.query'],
    ['这个月提成最高的是谁，大概多少', 'finance.staff-commission.metric', 'business.metric.query'],
    ['哪些产品毛利率最高', 'finance.product-gross-profit.metric', 'business.metric.query'],
    ['帮我看一下各项目的毛利情况', 'finance.project-gross-profit.metric', 'business.metric.query'],
    ['这个月的毛利率是多少', 'finance.overall-gross-margin.metric', 'business.metric.query'],
    ['这个月次卡销售了多少金额', 'finance.card-package-sales.metric', 'business.metric.query'],
    ['帮我看一下今天不同支付渠道的手续费', 'finance.payment-channel-fee.metric', 'business.metric.query'],
    ['今天收银流水', 'cashier.payment.records.list', 'business.record.query'],
    ['今天员工提成流水', 'finance.staff-commission.records.list', 'business.record.query'],
    ['客户陈天佑的消费记录', 'customer.consumption.records.list', 'business.record.query'],
    ['我们的优惠券平均核销周期是多久', 'marketing.coupon-redemption.metric', 'business.metric.query'],
    ['这位客人有没有未核销的优惠券', 'customer.coupon.status.lookup', 'business.record.query'],
    ['帮我打开收银界面，客人要结账了', 'navigation.cashier.open', 'navigation.open'],
    ['客人说她的次卡还有余量，帮我确认一下', 'card.package.status.lookup', 'business.record.query'],
    ['帮我打开核销界面，客人要用次卡', 'navigation.card-usage.open', 'navigation.open'],
    ['这个客人的次卡有效期还有多久', 'card.package.status.lookup', 'business.record.query'],
    ['有没有员工超权限给了额外折扣', 'finance.discount-permission-risk.metric', 'business.metric.query'],
    ['这个月优惠券核销了多少', 'marketing.coupon-redemption.metric', 'business.metric.query'],
    ['我想提升员工积极性，同时控制提成成本，有什么建议', 'finance.commission-cost-optimization.advice', 'business.metric.query'],
    ['哪些客户买了次卡但最近一直不来用', 'card.package.inactive-customers.list', 'business.record.query'],
    ['免费次卡换来的客户和付费客户的消费行为有什么差异', 'card.package.free-vs-paid.behavior.metric', 'business.metric.query'],
    ['有没有哪里有财务漏洞需要注意', 'finance.risk-diagnostics.metric', 'business.metric.query'],
    ['帮我检查一下这个月的财务数据有没有异常', 'finance.risk-diagnostics.metric', 'business.metric.query'],
    ['员工报销和财务记录有没有不符的地方', 'finance.risk-diagnostics.metric', 'business.metric.query'],
    ['帮我生成一份月度财务简报', 'finance.risk-diagnostics.metric', 'business.metric.query'],
    ['帮我同时做六件事：查今日营收、看预约、检查库存、分析员工、找沉睡客户、生成月报', 'agent.multi-domain.summary', 'business.metric.query'],
    ['帮我看一下所有待审批的退款申请', 'finance.refund.metric', 'business.metric.query'],
    ['退款申请的平均处理时间是多久', 'finance.refund.metric', 'business.metric.query'],
  ])('routes %s to %s', (message, capabilityId, tool) => {
    const decision = service.decide({ message, role: 'manager' });

    expect(decision.selected?.capabilityId).toBe(capabilityId);
    expect(decision.toolPlan[0]).toMatchObject({
      tool,
      args: expect.objectContaining({ capabilityId }),
    });
  });
});
