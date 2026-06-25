import { describe, expect, it, vi } from 'vitest';
import type { AuraAction } from '../../../../../src/types/aura';
import type { Role, RoleDefinition } from '../types';
import { resolveCommandIntent, shouldDisplayUserCommand } from './intentRouter';
import { parseRuleIntent } from './ruleIntentParser';
import { OFF_TOPIC_REPLY, isBusinessRelevant } from './relevanceGuard';

// intentRouter 重写后 text/voice source 调用 resolveTerminalIntent（AI 意图解析）。
// 测试环境 mock，让其返回 business.query，保持原有路由期望。
vi.mock('@/api', () => ({
  resolveTerminalIntent: vi.fn(async () => ({
    action: 'business.query',
    confidence: 0.9,
    slots: {},
    missingSlots: [],
    reason: 'mocked for tests',
  })),
}));

const allActions: AuraAction[] = [
  'manager.dashboard',
  'manager.staff',
  'manager.customers',
  'manager.inventory',
  'customer.followup',
  'business.query',
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
  it('routes natural-language voice commands to Agent or clarification instead of fixed cards', () => {
    const agentCases: Array<{ command: string; role: Role }> = [
      { command: '今天店里怎么样', role: 'manager' },
      { command: '帮我看看今天业绩', role: 'manager' },
      { command: '今天谁在上班', role: 'manager' },
      { command: '人员忙不忙', role: 'manager' },
      { command: '最近有没有很久没到店的客户', role: 'manager' },
      { command: '看一下沉睡老客', role: 'manager' },
      { command: '哪些产品快用完了', role: 'manager' },
      { command: '有没有缺货和临期', role: 'manager' },
      { command: '今天来几个预约', role: 'reception' },
      { command: '看看今天预约', role: 'reception' },
      { command: '排了什么项目', role: 'reception' },
      { command: '客户买单结算多少钱', role: 'reception' },
      { command: '我的提成是多少', role: 'beautician' },
      { command: '看一下本月提成', role: 'beautician' },
      { command: '她皮肤怎么样，上次做了什么', role: 'beautician' },
      { command: '推荐什么护理方案', role: 'beautician' },
    ];
    const fixedFlowCommands: Array<{ command: string; role: Role }> = [
      { command: '新客户没有档案，先建档', role: 'reception' },
      { command: '给 13638161666 录客户', role: 'reception' },
      { command: '用会员卡余额支付', role: 'reception' },
      { command: '核销小气泡 10 次卡', role: 'reception' },
      { command: '办张补水护理卡', role: 'reception' },
      { command: '帮我收银', role: 'reception' },
      { command: '帮我充值', role: 'reception' },
      { command: '我今天做什么', role: 'beautician' },
      { command: '我的客户今天安排', role: 'beautician' },
      { command: '我的客户', role: 'beautician' },
      { command: '这个客户做完了，帮我完成服务', role: 'beautician' },
    ];

    agentCases.forEach((item) => {
      const result = parseRuleIntent(item.command, item.role, definition(item.role), 'voice');
      expect(result.action, item.command).toBe('business.query');
      expect(result.name, item.command).toBe('business_query.ask');
      expect(shouldDisplayUserCommand(result), item.command).toBe(true);
    });

    fixedFlowCommands.forEach((item) => {
      const result = parseRuleIntent(item.command, item.role, definition(item.role), 'voice');
      expect(result.action, item.command).toBeNull();
      expect(shouldDisplayUserCommand(result), item.command).toBe(true);
    });

    const customerResult = parseRuleIntent('查一下张三', 'reception', definition('reception'), 'voice');
    expect(customerResult.action).toBe('customer:张三');
    expect(customerResult.slots.customerName).toBe('张三');
  });

  it('routes natural-language data questions into governed business query', () => {
    const productResult = parseRuleIntent('近期销量增长的商品', 'manager', definition('manager'), 'text');
    expect(productResult.action).toBe('business.query');
    expect(productResult.name).toBe('business_query.ask');
    expect(productResult.loadingLabel).toBe('正在查询 Ami_Core 运营数据');

    const customerResult = parseRuleIntent('最近增长客户', 'manager', definition('manager'), 'text');
    expect(customerResult.action).toBe('business.query');

    const revenueResult = parseRuleIntent('今天收入怎么样', 'manager', definition('manager'), 'text');
    expect(revenueResult.action).toBe('business.query');

    const replenishmentResult = parseRuleIntent('有哪些商品需要补货建议', 'manager', definition('manager'), 'text');
    expect(replenishmentResult.action).toBe('business.query');

    const automationResult = parseRuleIntent('自动化执行复盘', 'manager', definition('manager'), 'text');
    expect(automationResult.action).toBe('business.query');

    const marginResult = parseRuleIntent('项目耗材毛利', 'manager', definition('manager'), 'text');
    expect(marginResult.action).toBe('business.query');

    const supplyChainResult = parseRuleIntent('供应链采购建议', 'manager', definition('manager'), 'text');
    expect(supplyChainResult.action).toBe('business.query');

    const anomalyResult = parseRuleIntent('经营异常提醒', 'manager', definition('manager'), 'text');
    expect(anomalyResult.action).toBe('business.query');

    const multiStoreResult = parseRuleIntent('多店收入对比', 'manager', definition('manager'), 'text');
    expect(multiStoreResult.action).toBe('business.query');

    const priorityCustomersResult = parseRuleIntent('今天最值得跟进的10个客户', 'manager', definition('manager'), 'text');
    expect(priorityCustomersResult.action).toBe('business.query');
    expect(priorityCustomersResult.name).toBe('business_query.ask');

    const callbackResult = parseRuleIntent('今天优先回访5个老客', 'manager', definition('manager'), 'text');
    expect(callbackResult.action).toBe('business.query');

    const churnListResult = parseRuleIntent('列出8个流失风险客户并给原因', 'manager', definition('manager'), 'text');
    expect(churnListResult.action).toBe('business.query');

    const projectInviteResult = parseRuleIntent('哪些会员最适合邀约做补水护理', 'manager', definition('manager'), 'text');
    expect(projectInviteResult.action).toBe('business.query');

    const staffPerformanceResult = parseRuleIntent('近期表现较好的员工', 'manager', definition('manager'), 'text');
    expect(staffPerformanceResult.action).toBe('business.query');
    expect(staffPerformanceResult.name).toBe('business_query.ask');
    expect(shouldDisplayUserCommand(staffPerformanceResult)).toBe(true);

    const beauticianPerformanceResult = parseRuleIntent('最近服务质量较好的美容师', 'manager', definition('manager'), 'text');
    expect(beauticianPerformanceResult.action).toBe('business.query');

    const beauticianSelfPerformanceResult = parseRuleIntent('我的表现怎么样', 'beautician', definition('beautician'), 'text');
    expect(beauticianSelfPerformanceResult.action).toBe('business.query');
    expect(beauticianSelfPerformanceResult.name).toBe('business_query.ask');
    expect(shouldDisplayUserCommand(beauticianSelfPerformanceResult)).toBe(true);

    const terminalFailureResult = parseRuleIntent('终端最近失败最多的问题', 'manager', definition('manager'), 'text');
    expect(terminalFailureResult.action).toBe('business.query');
    expect(terminalFailureResult.name).toBe('business_query.ask');

    const customerAppResult = parseRuleIntent('小程序最近带来多少客户和成交', 'manager', definition('manager'), 'text');
    expect(customerAppResult.action).toBe('business.query');
  });

  it('does not render quick actions as user input bubbles', () => {
    const quickIntent = parseRuleIntent('今天订单收入怎么样', 'manager', definition('manager'), 'quick_action');
    const textIntent = parseRuleIntent('今天订单收入怎么样', 'manager', definition('manager'), 'text');

    expect(quickIntent.action).toBe('business.query');
    expect(quickIntent.showUserCommand).toBe(true);
    expect(shouldDisplayUserCommand(quickIntent)).toBe(false);
    expect(shouldDisplayUserCommand(textIntent)).toBe(true);
  });

  it('keeps typed text out of fixed quick-action business flows', () => {
    const cases = [
      '帮我收银',
      '核销小气泡 10 次卡',
      '办张补水护理卡',
      '帮我充值',
      '打印小票',
    ] as const;

    cases.forEach((command) => {
      const intent = parseRuleIntent(command, 'reception', definition('reception'), 'text');
      expect(intent.action, command).toBeNull();
      expect(shouldDisplayUserCommand(intent), command).toBe(true);
    });

    const cashierQuestion = parseRuleIntent('今天收银多少', 'reception', definition('reception'), 'text');
    expect(cashierQuestion.action).toBe('business.query');
    expect(cashierQuestion.name).toBe('business_query.ask');
    expect(shouldDisplayUserCommand(cashierQuestion)).toBe(true);

    const appointmentQuestion = parseRuleIntent('今天预约多少', 'reception', definition('reception'), 'text');
    expect(appointmentQuestion.action).toBe('business.query');

    const commissionQuestion = parseRuleIntent('我的提成是多少', 'beautician', definition('beautician'), 'text');
    expect(commissionQuestion.action).toBe('business.query');
  });

  it('keeps quick action buttons out of natural-language AI recognition', async () => {
    const directIntent = await resolveCommandIntent({
      command: 'manager.staff',
      role: 'manager',
      definition: definition('manager'),
      source: 'quick_action',
    });

    expect(directIntent.action).toBe('manager.staff');
    expect(directIntent.name).toBe('manager.staff.view');
    expect(directIntent.showUserCommand).toBe(false);
    expect(shouldDisplayUserCommand(directIntent)).toBe(false);

    const naturalQuickIntent = await resolveCommandIntent({
      command: '近期表现较好的员工',
      role: 'manager',
      definition: definition('manager'),
      source: 'quick_action',
    });

    expect(naturalQuickIntent.action).toBeNull();
    expect(naturalQuickIntent.name).toBe('unknown.clarify');
    expect(shouldDisplayUserCommand(naturalQuickIntent)).toBe(false);

    const systemIntent = await resolveCommandIntent({
      command: '今天订单收入怎么样',
      role: 'manager',
      definition: definition('manager'),
      source: 'system',
    });

    expect(systemIntent.action).toBe('business.query');
    expect(shouldDisplayUserCommand(systemIntent)).toBe(false);
  });

  it('keeps business-looking quick action labels out of Agent recognition', async () => {
    const quickDefinition: RoleDefinition = {
      ...definition('manager'),
      quickActions: [
        { label: '员工', action: 'manager.staff', icon: 'users' },
        { label: '客户增长', action: 'manager.customers', icon: 'sparkles' },
      ],
    };

    const staffIntent = await resolveCommandIntent({
      command: '员工',
      role: 'manager',
      definition: quickDefinition,
      source: 'quick_action',
    });
    const customerGrowthIntent = await resolveCommandIntent({
      command: '客户增长',
      role: 'manager',
      definition: quickDefinition,
      source: 'quick_action',
    });

    expect(staffIntent.action).toBe('manager.staff');
    expect(staffIntent.name).not.toBe('business_query.ask');
    expect(shouldDisplayUserCommand(staffIntent)).toBe(false);
    expect(customerGrowthIntent.action).toBe('manager.customers');
    expect(customerGrowthIntent.name).not.toBe('business_query.ask');
    expect(shouldDisplayUserCommand(customerGrowthIntent)).toBe(false);
  });

  it('keeps text input independent from quick action cards even when text matches a shortcut', async () => {
    const quickDefinition: RoleDefinition = {
      ...definition('reception'),
      quickActions: [
        { label: '预约', action: 'reception.appointments', icon: 'CalendarCheck' },
        { label: '收银', action: 'operation.cashier', icon: 'CreditCard' },
      ],
    };

    const typedLabelIntent = await resolveCommandIntent({
      command: '收银',
      role: 'reception',
      definition: quickDefinition,
      source: 'text',
    });
    const typedActionCodeIntent = await resolveCommandIntent({
      command: 'operation.cashier',
      role: 'reception',
      definition: quickDefinition,
      source: 'text',
    });
    const clickedShortcutIntent = await resolveCommandIntent({
      command: '收银',
      role: 'reception',
      definition: quickDefinition,
      source: 'quick_action',
    });

    expect(typedLabelIntent.action).toBe('business.query');
    expect(typedLabelIntent.name).toBe('business_query.ask');
    expect(typedLabelIntent.source).toBe('text');
    expect(shouldDisplayUserCommand(typedLabelIntent)).toBe(true);
    expect(typedActionCodeIntent.action).toBe('business.query');
    expect(typedActionCodeIntent.name).toBe('business_query.ask');
    expect(typedActionCodeIntent.source).toBe('text');
    expect(shouldDisplayUserCommand(typedActionCodeIntent)).toBe(true);
    expect(clickedShortcutIntent.action).toBe('operation.cashier');
    expect(clickedShortcutIntent.source).toBe('quick_action');
    expect(shouldDisplayUserCommand(clickedShortcutIntent)).toBe(false);
  });

  it('routes every typed business question to Agent instead of fixed function cards', async () => {
    const cases: Array<{ command: string; role: Role }> = [
      { command: '今天收银多少', role: 'reception' },
      { command: '最近七天收银趋势', role: 'manager' },
      { command: '核销小气泡 10 次卡', role: 'reception' },
      { command: '查客户张三', role: 'reception' },
      { command: '今天预约多少', role: 'reception' },
      { command: '我的提成是多少', role: 'beautician' },
      { command: '帮我生成流失客户跟进任务', role: 'manager' },
    ];

    for (const item of cases) {
      const intent = await resolveCommandIntent({
        command: item.command,
        role: item.role,
        definition: definition(item.role),
        source: 'text',
      });

      expect(intent.action, item.command).toBe('business.query');
      expect(intent.name, item.command).toBe('business_query.ask');
      expect(intent.source, item.command).toBe('text');
      expect(shouldDisplayUserCommand(intent), item.command).toBe(true);
    }
  });

  it('routes voice input through Agent instead of fixed function cards', async () => {
    const intent = await resolveCommandIntent({
      command: '帮我收银',
      role: 'reception',
      definition: definition('reception'),
      source: 'voice',
    });

    expect(intent.action).toBe('business.query');
    expect(intent.name).toBe('business_query.ask');
    expect(intent.source).toBe('voice');
    expect(shouldDisplayUserCommand(intent)).toBe(true);
  });

  it('does not bypass role permissions when a natural-language business query is not allowed', () => {
    const limitedDefinition: RoleDefinition = {
      role: 'beautician',
      title: '美容师',
      subtitle: '只看本人工作',
      availableActions: ['beautician.schedule'],
      quickActions: [],
    };

    const result = parseRuleIntent('最近销量好的商品有哪些', 'beautician', limitedDefinition, 'text');

    expect(result.action).toBeNull();
    expect(result.name).toBe('unknown.clarify');
    expect(result.deniedReason).toContain('无权');
    expect(shouldDisplayUserCommand(result)).toBe(true);
  });

  it('keeps frontdesk and beautician natural-language role boundaries explicit', () => {
    const frontdeskMarketing = parseRuleIntent('有哪些商品适合做活动', 'reception', definition('reception'), 'text');
    const beauticianStaff = parseRuleIntent('近期表现较好的员工', 'beautician', definition('beautician'), 'text');

    expect(frontdeskMarketing.action).toBe('business.query');
    expect(frontdeskMarketing.name).toBe('business_query.ask');
    expect(shouldDisplayUserCommand(frontdeskMarketing)).toBe(true);
    expect(beauticianStaff.action).toBe('business.query');
    expect(beauticianStaff.name).toBe('business_query.ask');
    expect(shouldDisplayUserCommand(beauticianStaff)).toBe(true);
  });

  it('routes governed draft commands into Agent Gateway instead of legacy cards', () => {
    const followUpResult = parseRuleIntent('帮我生成流失客户跟进任务', 'manager', definition('manager'), 'text');
    expect(followUpResult.action).toBe('business.query');
    expect(followUpResult.name).toBe('business_query.ask');

    const receptionFollowUpResult = parseRuleIntent('生成客户邀约任务', 'reception', definition('reception'), 'text');
    expect(receptionFollowUpResult.action).toBe('business.query');

    const replenishmentResult = parseRuleIntent('根据低库存生成补货采购草稿', 'manager', definition('manager'), 'text');
    expect(replenishmentResult.action).toBe('business.query');

    const serviceRecordResult = parseRuleIntent('帮我生成服务记录草稿', 'beautician', definition('beautician'), 'text');
    expect(serviceRecordResult.action).toBe('business.query');

    const schedulingResult = parseRuleIntent('优化下周排班', 'manager', definition('manager'), 'text');
    expect(schedulingResult.action).toBe('business.query');
  });

  it('extracts common business slots from spoken commands', () => {
    const phoneResult = parseRuleIntent('给 13638161666 录客户', 'reception', definition('reception'), 'voice');
    expect(phoneResult.slots.customerPhone).toBe('13638161666');
    expect(phoneResult.action).toBeNull();

    const cardResult = parseRuleIntent('核销小气泡 10 次卡', 'reception', definition('reception'), 'voice');
    expect(cardResult.slots.cardName).toContain('小气泡');
    expect(cardResult.action).toBeNull();

    const projectResult = parseRuleIntent('预约深层补水护理', 'reception', definition('reception'), 'voice');
    expect(projectResult.slots.projectName).toContain('深层补水');
    expect(projectResult.action).toBeNull();

    const paymentResult = parseRuleIntent('用会员卡余额支付 380 元', 'reception', definition('reception'), 'voice');
    expect(paymentResult.slots.paymentMethod).toBe('member_balance');
    expect(paymentResult.slots.amount).toBe(380);
    expect(paymentResult.action).toBeNull();

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
    expect(isBusinessRelevant('终端最近失败最多的问题')).toBe(true);
  });
});
