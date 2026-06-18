import { describe, expect, it } from 'vitest';
import type { AuraAction } from '../../../../../src/types/aura';
import type { Role, RoleDefinition } from '../types';
import { parseRuleIntent } from './ruleIntentParser';
import { OFF_TOPIC_REPLY, isBusinessRelevant } from './relevanceGuard';

const allActions: AuraAction[] = [
  'manager.dashboard',
  'manager.staff',
  'manager.customers',
  'manager.inventory',
  'reception.appointments',
  'operation.verify',
  'operation.register',
  'operation.cashier',
  'operation.card',
  'operation.recharge',
  'operation.print',
  'operation.service-complete',
  'beautician.schedule',
  'beautician.commission',
  'beautician.customer',
  'beautician.record',
  'beautician.advice',
];

function definition(role: Role): RoleDefinition {
  return {
    role,
    title: role,
    subtitle: role,
    availableActions: allActions,
    quickActions: [],
  };
}

describe('parseRuleIntent', () => {
  it('matches typical spoken commands without AI fallback', () => {
    const cases: Array<{ command: string; role: Role; action: AuraAction }> = [
      { command: '今天店里怎么样', role: 'manager', action: 'manager.dashboard' },
      { command: '帮我看看今天业绩', role: 'manager', action: 'manager.dashboard' },
      { command: '今天谁在上班', role: 'manager', action: 'manager.staff' },
      { command: '人员忙不忙', role: 'manager', action: 'manager.staff' },
      { command: '最近有没有很久没到店的客户', role: 'manager', action: 'manager.customers' },
      { command: '看一下沉睡老客', role: 'manager', action: 'manager.customers' },
      { command: '哪些产品快用完了', role: 'manager', action: 'manager.inventory' },
      { command: '有没有缺货和临期', role: 'manager', action: 'manager.inventory' },
      { command: '今天来几个预约', role: 'reception', action: 'reception.appointments' },
      { command: '排了什么项目', role: 'reception', action: 'reception.appointments' },
      { command: '新客户没有档案，先建档', role: 'reception', action: 'operation.register' },
      { command: '给 13638161666 录客户', role: 'reception', action: 'operation.register' },
      { command: '客户买单结算多少钱', role: 'reception', action: 'operation.cashier' },
      { command: '用会员卡余额支付', role: 'reception', action: 'operation.cashier' },
      { command: '核销小气泡 10 次卡', role: 'reception', action: 'operation.verify' },
      { command: '办张补水护理卡', role: 'reception', action: 'operation.card' },
      { command: '我今天做什么', role: 'beautician', action: 'beautician.schedule' },
      { command: '我的客户今天安排', role: 'beautician', action: 'beautician.schedule' },
      { command: '我的客户', role: 'beautician', action: 'beautician.customer' },
      { command: '我的提成是多少', role: 'beautician', action: 'beautician.commission' },
      { command: '看一下本月提成', role: 'beautician', action: 'beautician.commission' },
      { command: '这个客户做完了，帮我完成服务', role: 'beautician', action: 'beautician.record' },
      { command: '她皮肤怎么样，上次做了什么', role: 'beautician', action: 'beautician.customer' },
      { command: '推荐什么护理方案', role: 'beautician', action: 'beautician.advice' },
      { command: '查客户张三', role: 'reception', action: 'customer:张三' as AuraAction },
      { command: '查一下张三', role: 'reception', action: 'customer:张三' as AuraAction },
      { command: '帮我查一下张三', role: 'reception', action: 'customer:张三' as AuraAction },
      { command: '帮我收银', role: 'reception', action: 'operation.cashier' },
      { command: '帮我充值', role: 'reception', action: 'operation.recharge' },
    ];

    const results = cases.map((item) => parseRuleIntent(item.command, item.role, definition(item.role), 'voice'));

    results.forEach((result, index) => {
      expect(result.action, cases[index].command).toBe(cases[index].action);
      expect(result.name, cases[index].command).not.toBe('unknown.clarify');
      expect(result.confidence, cases[index].command).toBeGreaterThanOrEqual(
        String(cases[index].action).startsWith('customer:') ? 0.85 : 0.9,
      );
    });
  });

  it('extracts common business slots from spoken commands', () => {
    const phoneResult = parseRuleIntent('给 13638161666 录客户', 'reception', definition('reception'), 'voice');
    expect(phoneResult.slots.customerPhone).toBe('13638161666');

    const cardResult = parseRuleIntent('核销小气泡 10 次卡', 'reception', definition('reception'), 'voice');
    expect(cardResult.slots.cardName).toContain('小气泡');

    const projectResult = parseRuleIntent('预约深层补水护理', 'reception', definition('reception'), 'voice');
    expect(projectResult.slots.projectName).toContain('深层补水');

    const paymentResult = parseRuleIntent('用会员卡余额支付 380 元', 'reception', definition('reception'), 'voice');
    expect(paymentResult.slots.paymentMethod).toBe('member_balance');
    expect(paymentResult.slots.amount).toBe(380);

    const customerResult = parseRuleIntent('查一下张三', 'reception', definition('reception'), 'text');
    expect(customerResult.action).toBe('customer:张三');
    expect(customerResult.slots.customerName).toBe('张三');
  });

  it('blocks clearly off-topic Q&A before AI fallback while keeping beauty business questions', () => {
    expect(isBusinessRelevant('今天天气怎么样')).toBe(false);
    expect(isBusinessRelevant('帮我写首诗')).toBe(false);
    expect(isBusinessRelevant('宇宙的尽头是什么')).toBe(false);
    expect(OFF_TOPIC_REPLY).toBe('抱歉，该问题与本门店业务无关，暂时无法回复。');

    expect(isBusinessRelevant('张三的皮肤状况')).toBe(true);
    expect(isBusinessRelevant('库存还够吗')).toBe(true);
    expect(isBusinessRelevant('帮我收银')).toBe(true);
  });
});
