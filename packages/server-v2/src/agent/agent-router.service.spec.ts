import { AgentRouterService } from './agent-router.service.js';
import type { PersonaSummary } from './agent-persona.service.js';

describe('AgentRouterService', () => {
  const personas: PersonaSummary[] = [
    {
      code: 'manager',
      name: '店长经营 Agent',
      description: '经营风险、员工表现、预约排班和门店总览',
      targetRoles: ['manager'],
      toolGroups: ['manager.daily.briefing', 'revenue.diagnose'],
      suggestedQuestions: ['今天我应该重点关注什么？'],
    },
    {
      code: 'marketing',
      name: '营销增长 Agent',
      description: '客户召回、营销活动、复购承接',
      targetRoles: ['manager', 'reception'],
      toolGroups: ['marketing.customer.segment.discover'],
      suggestedQuestions: ['哪些客户适合召回？'],
    },
    {
      code: 'reception',
      name: '前台接待 Agent',
      description: '预约、客户查询、卡项权益',
      targetRoles: ['manager', 'reception'],
      toolGroups: ['reception.reservation.today', 'reception.card.benefit.summary'],
      suggestedQuestions: ['今天有哪些预约？', '这个客户还有什么卡和权益？'],
    },
    {
      code: 'beautician',
      name: '美容师服务 Agent',
      description: '美容师服务、护理建议和本人客户',
      targetRoles: ['beautician', 'manager'],
      toolGroups: ['beautician.today.service.list'],
      suggestedQuestions: ['我今天有哪些客户？'],
    },
    {
      code: 'inventory',
      name: '库存采购 Agent',
      description: '库存风险、临期库存和补货采购',
      targetRoles: ['manager'],
      toolGroups: ['inventory.risk.rank'],
      suggestedQuestions: ['近期有哪些临期库存产品？'],
    },
    {
      code: 'finance',
      name: '财务风控 Agent',
      description: '财务、利润、毛利、退款和对账',
      targetRoles: ['manager'],
      toolGroups: ['finance.profit.diagnose'],
      suggestedQuestions: ['本月利润率为什么变化？'],
    },
  ];

  function createService() {
    return new AgentRouterService(
      { listAll: jest.fn().mockResolvedValue(personas) } as any,
      {
        list: jest.fn().mockReturnValue([
          { name: 'inventory.risk.rank', description: '查询库存不足、临期和补货优先级排行' },
          { name: 'finance.profit.diagnose', description: '诊断利润、毛利、成本和退款折扣变化' },
          { name: 'reception.reservation.today', description: '查询今日预约和到店提醒' },
          { name: 'marketing.customer.segment.discover', description: '发现适合召回和复购的客户' },
        ]),
      } as any,
    );
  }

  const managerActor = { storeId: 1, userId: 7, role: 'manager' as const, entrypoint: 'test' };

  it.each([
    ['哪些库存临期', 'inventory'],
    ['本月利润为什么下降', 'finance'],
    ['今天有哪些预约', 'reception'],
    ['哪些客户适合召回', 'marketing'],
  ])('routes %s to %s', async (message, personaCode) => {
    const decision = await createService().route({ message, actor: managerActor });

    expect(decision.personaCode).toBe(personaCode);
    expect(decision.mode).toBe('auto');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.58);
  });

  it('routes beautician self-service questions to beautician persona', async () => {
    const decision = await createService().route({
      message: '我今天有哪些客户',
      actor: { storeId: 1, userId: 9, role: 'beautician', entrypoint: 'test' },
    });

    expect(decision.personaCode).toBe('beautician');
  });

  it('does not route reception finance questions to finance', async () => {
    const decision = await createService().route({
      message: '本月利润为什么下降',
      actor: { storeId: 1, userId: 8, role: 'reception', entrypoint: 'test' },
    });

    expect(decision.personaCode).not.toBe('finance');
    expect(['reception', 'marketing']).toContain(decision.personaCode);
  });

  it('inherits previous persona for continuation questions', async () => {
    const decision = await createService().route({
      message: '那怎么处理',
      actor: managerActor,
      previousPersonaCode: 'inventory',
    });

    expect(decision.personaCode).toBe('inventory');
    expect(decision.mode).toBe('context_inherit');
  });

  it('switches route when a follow-up clearly changes domain', async () => {
    const decision = await createService().route({
      message: '本月利润为什么下降',
      actor: managerActor,
      previousPersonaCode: 'inventory',
    });

    expect(decision.personaCode).toBe('finance');
    expect(decision.routeChanged).toBe(true);
  });
});
