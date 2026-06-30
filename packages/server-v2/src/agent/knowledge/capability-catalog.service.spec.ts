import { ActionOntologyService } from './action-ontology.service.js';
import { CapabilityCatalogService } from './capability-catalog.service.js';
import type { EntityResolutionCandidate } from './knowledge.types.js';

function entity(overrides: Partial<EntityResolutionCandidate>): EntityResolutionCandidate {
  return {
    objectType: 'Unknown',
    entityId: '1',
    displayName: '测试对象',
    matchedText: '测试对象',
    confidence: 0.95,
    matchStrategy: 'exact_name',
    sourceModel: 'Unknown',
    evidence: [],
    ...overrides,
  };
}

describe('CapabilityCatalogService', () => {
  let service: CapabilityCatalogService;

  beforeEach(() => {
    service = new CapabilityCatalogService(new ActionOntologyService());
  });

  it('routes marketing activity link lookup by entity plus get_link action', () => {
    const result = service.resolve({
      text: '老朋友回店护理礼活动链接发我',
      role: 'manager',
      entities: [entity({ objectType: 'MarketingActivity', displayName: '老朋友回店护理礼' })],
    });

    expect(result.action).toBe('get_link');
    expect(result.capability?.capabilityId).toBe('marketing.activity.link.lookup');
    expect(result.candidates[0]).toMatchObject({ capabilityId: 'marketing.activity.link.lookup' });
  });

  it('does not route project service trend for marketing activity link questions', () => {
    const result = service.resolve({
      text: '老朋友回店护理礼活动链接发我',
      role: 'manager',
      entities: [entity({ objectType: 'MarketingActivity', displayName: '老朋友回店护理礼' })],
    });

    expect(result.capability?.capabilityId).not.toBe('project.service.trend');
  });

  it('routes customer card benefit questions to reception card benefit capability', () => {
    const result = service.resolve({
      text: '张雯还有什么卡和权益',
      role: 'reception',
      entities: [entity({ objectType: 'Customer', displayName: '张雯' })],
    });

    expect(result.capability?.capabilityId).toBe('reception.customer.card_benefit.summary');
  });

  it('routes inventory product stock questions to inventory product lookup capability', () => {
    const result = service.resolve({
      text: '一次性丁腈手套库存还够吗',
      role: 'manager',
      entities: [entity({ objectType: 'InventoryProduct', displayName: '一次性丁腈手套' })],
    });

    expect(result.capability?.capabilityId).toBe('inventory.product.stock.lookup');
  });

  it('routes beautician performance questions to staff performance capability', () => {
    const result = service.resolve({
      text: '宋乔这个月业绩怎么样',
      role: 'manager',
      entities: [entity({ objectType: 'Beautician', displayName: '宋乔' })],
    });

    expect(result.capability?.capabilityId).toBe('manager.staff.performance.rank');
  });

  it('routes order lookup questions to finance order lookup capability', () => {
    const result = service.resolve({
      text: '查一下订单 PO202606300001',
      role: 'manager',
      entities: [entity({ objectType: 'Order', displayName: 'PO202606300001' })],
    });

    expect(result.capability?.capabilityId).toBe('finance.order.lookup');
  });

  it('routes member card status questions to member card lookup capability', () => {
    const result = service.resolve({
      text: '张雯的水光护理卡还剩几次',
      role: 'reception',
      entities: [entity({ objectType: 'MemberCard', displayName: '张雯 · 水光护理卡' })],
    });

    expect(result.capability?.capabilityId).toBe('reception.member_card.lookup');
  });

  it('keeps the first business capability catalog above the minimum coverage threshold', () => {
    expect(service.list().length).toBeGreaterThanOrEqual(20);
    for (const capability of service.list()) {
      expect(capability.examples.length).toBeGreaterThanOrEqual(3);
      expect(capability.negativeExamples.length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each([
    ['今天有哪些预约', 'reception', 'reception.reservation.today.list'],
    ['今天排班空闲情况', 'reception', 'reception.schedule.availability'],
    ['最近销量好的商品有哪些', 'manager', 'product.sales.trend'],
    ['这些商品有哪些客户买过', 'manager', 'product.customer.distribution'],
    ['哪些商品需要补货', 'manager', 'inventory.replenishment.recommend'],
    ['近期营销转化怎么样', 'manager', 'marketing.effect.diagnose'],
    ['哪些客户有流失风险', 'manager', 'marketing.customer.churn.risk'],
    ['项目耗材毛利', 'manager', 'project.material.margin'],
    ['会员卡余额沉淀资金', 'manager', 'member.balance.analysis'],
    ['自动化执行复盘', 'manager', 'automation.execution.summary'],
    ['经营异常提醒', 'manager', 'manager.business.anomaly.alert'],
    ['多店收入对比', 'manager', 'manager.multi_store.comparison'],
    ['昨天有哪些消费的客户，列出清单', 'manager', 'order.customer.consumption.list'],
    ['哪些卡快到期了', 'reception', 'card.expiry.risk'],
    ['本月卡项核销情况', 'manager', 'card.usage.analysis'],
    ['生成供应商采购建议', 'manager', 'supplier.purchase.advice'],
    ['终端运行是否正常', 'manager', 'terminal.health.diagnosis'],
  ] as const)('routes %s to %s', (text, role, capabilityId) => {
    const result = service.resolve({ text, role });

    expect(result.capability?.capabilityId).toBe(capabilityId);
  });

  it('treats execution review wording as analysis instead of confirm action', () => {
    const result = service.resolve({ text: '自动化执行复盘', role: 'manager' });

    expect(result.action).toBe('analyze');
    expect(result.capability?.capabilityId).toBe('automation.execution.summary');
  });
});
