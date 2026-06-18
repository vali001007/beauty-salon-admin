import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuraAction } from '../../../../../src/types/aura';
import type { Role, RoleDefinition } from '../types';
import type { AuraResolvedIntent } from '../intent/intentTypes';
import { resolveCommandIntent } from '../intent/intentRouter';
import { parseRuleIntent } from '../intent/ruleIntentParser';
import { clearTerminalQueryCache } from '../services/terminalQueryClient';
import { OFF_TOPIC_REPLY } from '../intent/relevanceGuard';
import { prefetchTerminalMicroApps, runMicroAppIntent } from './runMicroApp';

const state = vi.hoisted(() => {
  let activeLoaders = 0;
  const deferredTasks: Array<() => void> = [];

  const trackLoader = async <T>(value: T) => {
    activeLoaders += 1;
    state.maxActiveLoaders = Math.max(state.maxActiveLoaders, activeLoaders);
    await new Promise<void>((resolve) => deferredTasks.push(resolve));
    activeLoaders -= 1;
    return value;
  };

  return {
    currentStoreId: 1,
    maxActiveLoaders: 0,
    deferredTasks,
    managerDashboardLoader: vi.fn(() => trackLoader({ title: '经营', summary: '经营摘要' })),
    staffSchedulesLoader: vi.fn(() => trackLoader([{ title: '员工', summary: '员工摘要' }])),
    receptionDashboardLoader: vi.fn(() => trackLoader({ title: '预约', summary: '预约摘要', items: [] })),
    inventoryAlertsLoader: vi.fn(() =>
      trackLoader({ title: '库存', summary: '库存摘要', lowStock: [], expiring: [], replenishment: [] }),
    ),
    beauticianDashboardLoader: vi.fn(async () => ({ title: '美容师', summary: '美容师摘要' })),
    beauticianCustomerListLoader: vi.fn(async () => ({
      title: '我的客户',
      subtitle: 'Ami 全量演示门店',
      summary: '共 1 位当前美容师服务客户，已合并为单一列表并用标签标识客户状态。',
      total: 1,
      generatedAt: '2026-06-15T00:00:00.000Z',
      items: [],
      groups: [
        {
          key: 'recent30',
          title: '最近 30 天',
          description: '近期刚服务过',
          items: [],
        },
      ],
    })),
    followUpTasksLoader: vi.fn(async () => ({
      title: '客户跟进',
      subtitle: '前台 · Ami 全量演示门店',
      summary: '共 1 条管理端下发任务，待处理 1 条，跟进中 0 条，已逾期 0 条。',
      items: [
        {
          id: 12,
          customerId: 7,
          customerName: '马语嫣',
          customerPhone: '13873801982',
          status: 'pending',
          priority: 'recommended',
          title: '邀约复购护理',
          script: '提醒客户本周可预约复购护理。',
        },
      ],
      stats: { pending: 1, inProgress: 0, completed: 0, expired: 0, overdue: 0 },
      generatedAt: '2026-06-15T00:00:00.000Z',
    })),
    serviceRecordFlowLoader: vi.fn(async () => ({ title: '服务记录', tasks: [], beauticianName: '沈晴' })),
    cashierFlowLoader: vi.fn(async () => ({ title: '收银', customers: [], catalog: [] })),
    customerCardLoader: vi.fn(async () => ({
      customer: { id: 1, name: '张三', phone: '13800000000', memberLevel: '金卡', tags: [] },
      summary: '张三客户摘要',
      reasons: ['客户 #1'],
      recentVisits: [],
    })),
    getTerminalBusinessAnswer: vi.fn(async () => ({ title: 'Ami 智能问答', text: '业务回答', source: 'Ami AI' })),
    businessAgentLoader: vi.fn(async () => ({
      runId: 1001,
      runNo: 'AG202606160001',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '发现适合做营销活动的商品机会',
        toolPlan: [{ tool: 'marketing.opportunity.discover', args: { targetType: 'product' } }],
        confidence: 0.86,
        clarificationNeeded: false,
      },
      answer: '优先推荐补水精华做会员专属满赠，匹配分 86。',
      toolResults: [
        {
          status: 'success',
          title: '商品活动机会',
          summary: '优先推荐补水精华做会员专属满赠，匹配分 86。',
          data: { items: [{ productId: 301, productName: '补水精华', fitScore: 86 }] },
          evidence: {
            source: ['Product', 'OrderItem'],
            filters: ['storeId=当前门店'],
            metricDefinition: '商品活动机会规则评分',
          },
          actions: [{ label: '生成活动草稿', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' }],
        },
      ],
      actions: [{ label: '生成活动草稿', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' }],
      evidence: {
        source: ['Product', 'OrderItem'],
        filters: ['storeId=当前门店'],
        metricDefinition: '商品活动机会规则评分',
      },
    })),
  };
});

vi.mock('@/stores/storeStore', () => ({
  useStoreStore: {
    getState: () => ({ currentStoreId: state.currentStoreId }),
  },
}));

vi.mock('../services/auraCoreService', () => ({
  getBeauticianDashboard: state.beauticianDashboardLoader,
  getBeauticianCustomerList: state.beauticianCustomerListLoader,
  getCardOpeningFlow: vi.fn(),
  getCardVerificationFlow: vi.fn(async () => ({ title: '核销', customers: [] })),
  getCashierFlow: state.cashierFlowLoader,
  getCustomerCard: state.customerCardLoader,
  getCustomerGrowthCandidates: vi.fn(async () => []),
  getFollowUpTasksView: state.followUpTasksLoader,
  getInventoryAlerts: state.inventoryAlertsLoader,
  getManagerDashboard: state.managerDashboardLoader,
  getOperationResult: vi.fn(),
  prefetchAuraBootstrap: vi.fn(async () => undefined),
  getReceptionDashboard: state.receptionDashboardLoader,
  getRechargeFlow: vi.fn(),
  getRegistrationFlow: vi.fn(),
  getStaffSchedules: state.staffSchedulesLoader,
  getServiceRecordFlow: state.serviceRecordFlowLoader,
  getServiceRecordPreparation: vi.fn(async () => ({ title: '服务记录待填写', status: 'warning', nextSteps: [] })),
  getTerminalBusinessAnswer: state.getTerminalBusinessAnswer,
  runBusinessAgent: state.businessAgentLoader,
  updateAppointmentAction: vi.fn(),
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

describe('runMicroApp cache and prefetch behavior', () => {
  beforeEach(() => {
    state.currentStoreId = 1;
    state.maxActiveLoaders = 0;
    state.deferredTasks.splice(0);
    clearTerminalQueryCache();
    vi.clearAllMocks();
    state.getTerminalBusinessAnswer.mockResolvedValue({ title: 'Ami 智能问答', text: '业务回答', source: 'Ami AI' });
    state.businessAgentLoader.mockResolvedValue({
      runId: 1001,
      runNo: 'AG202606160001',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '发现适合做营销活动的商品机会',
        toolPlan: [{ tool: 'marketing.opportunity.discover', args: { targetType: 'product' } }],
        confidence: 0.86,
        clarificationNeeded: false,
      },
      answer: '优先推荐补水精华做会员专属满赠，匹配分 86。',
      toolResults: [
        {
          status: 'success',
          title: '商品活动机会',
          summary: '优先推荐补水精华做会员专属满赠，匹配分 86。',
          data: { items: [{ productId: 301, productName: '补水精华', fitScore: 86 }] },
          evidence: {
            source: ['Product', 'OrderItem'],
            filters: ['storeId=当前门店'],
            metricDefinition: '商品活动机会规则评分',
          },
          actions: [{ label: '生成活动草稿', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' }],
        },
      ],
      actions: [{ label: '生成活动草稿', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' }],
      evidence: {
        source: ['Product', 'OrderItem'],
        filters: ['storeId=当前门店'],
        metricDefinition: '商品活动机会规则评分',
      },
    });
    state.cashierFlowLoader.mockResolvedValue({ title: '收银', customers: [], catalog: [] });
    state.beauticianCustomerListLoader.mockResolvedValue({
      title: '我的客户',
      subtitle: 'Ami 全量演示门店',
      summary: '共 1 位当前美容师服务客户，已合并为单一列表并用标签标识客户状态。',
      total: 1,
      generatedAt: '2026-06-15T00:00:00.000Z',
      items: [],
      groups: [],
    });
    state.serviceRecordFlowLoader.mockResolvedValue({ title: '服务记录', tasks: [], beauticianName: '沈晴' });
    state.customerCardLoader.mockResolvedValue({
      customer: { id: 1, name: '张三', phone: '13800000000', memberLevel: '金卡', tags: [] },
      summary: '张三客户摘要',
      reasons: ['客户 #1'],
      recentVisits: [],
    });
  });

  it('routes typed customer lookup text into Agent instead of the customer micro-app', async () => {
    const intent = await resolveCommandIntent({
      command: '查客户张三',
      role: 'reception',
      definition: definition('reception'),
      source: 'text',
    });

    const result = await runMicroAppIntent(intent, '查客户张三');

    expect(intent.action).toBe('business.query');
    expect(state.customerCardLoader).not.toHaveBeenCalled();
    expect(state.businessAgentLoader).toHaveBeenCalledWith('查客户张三', 'reception', undefined);
    expect(state.getTerminalBusinessAnswer).not.toHaveBeenCalled();
    expect(result.messages[0]?.payload).toMatchObject({
      kind: 'agentRun',
    });
  });

  it('routes cashier questions from typed text into Agent instead of the cashier quick flow', async () => {
    const intent = await resolveCommandIntent({
      command: '今天收银多少',
      role: 'reception',
      definition: definition('reception'),
      source: 'text',
    });

    const result = await runMicroAppIntent(intent, '今天收银多少');

    expect(intent.action).toBe('business.query');
    expect(state.cashierFlowLoader).not.toHaveBeenCalled();
    expect(state.businessAgentLoader).toHaveBeenCalledWith('今天收银多少', 'reception', undefined);
    expect(state.getTerminalBusinessAnswer).not.toHaveBeenCalled();
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'agentRun' });
  });

  it('routes governed business data questions into Agent Gateway instead of customer growth card', async () => {
    const intent = parseRuleIntent('近期销量增长的商品', 'manager', definition('manager'), 'text');

    const result = await runMicroAppIntent(intent, '近期销量增长的商品');

    expect(intent.action).toBe('business.query');
    expect(state.businessAgentLoader).toHaveBeenCalledWith('近期销量增长的商品', 'manager', undefined);
    expect(result.messages[0]?.payload).toMatchObject({
      kind: 'agentRun',
      data: {
        plan: {
          toolPlan: [{ tool: 'marketing.opportunity.discover' }],
        },
      },
    });
  });

  it('passes previous context into governed follow-up Agent questions', async () => {
    const intent = parseRuleIntent('这些商品库存够吗', 'manager', definition('manager'), 'text');
    const context = {
      previousResponse: {
        domain: 'product',
        capability: 'product_sales_trend',
        card: {
          type: 'productSalesTrend',
          title: '近期销量增长的商品',
          items: [{ productId: 301, productName: '补水精华' }],
        },
      },
    };

    await runMicroAppIntent(intent, '这些商品库存够吗', { businessQueryContext: context });

    expect(state.businessAgentLoader).toHaveBeenCalledWith('这些商品库存够吗', 'manager', {
      previousBusinessQuery: context,
    });
  });

  it('returns cached high-frequency dashboard data without calling the loader again', async () => {
    const intent: AuraResolvedIntent = {
      name: 'manager.dashboard.view',
      role: 'manager',
      action: 'manager.dashboard',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'none',
      requiresConfirmation: false,
      showUserCommand: true,
      loadingLabel: '正在加载经营驾驶舱',
    };

    const firstPromise = runMicroAppIntent(intent, '今天店里怎么样');
    state.deferredTasks.shift()?.();
    const first = await firstPromise;
    const second = await runMicroAppIntent(intent, '今天店里怎么样');

    expect(first.messages[0]?.payload).toMatchObject({ kind: 'manager' });
    expect(second.messages[0]?.payload).toMatchObject({ kind: 'manager' });
    expect(state.managerDashboardLoader).toHaveBeenCalledTimes(1);
  });

  it('prefetches high-frequency entries with at most two concurrent business loaders', async () => {
    const task = prefetchTerminalMicroApps([
      'manager.dashboard',
      'manager.staff',
      'reception.appointments',
      'manager.inventory',
    ]);

    await vi.waitFor(() => expect(state.deferredTasks.length).toBe(2));
    expect(state.maxActiveLoaders).toBeLessThanOrEqual(2);
    state.deferredTasks.splice(0).forEach((resolve) => resolve());

    await vi.waitFor(() => expect(state.deferredTasks.length).toBe(2));
    expect(state.maxActiveLoaders).toBeLessThanOrEqual(2);
    state.deferredTasks.splice(0).forEach((resolve) => resolve());

    await task;
    expect(state.managerDashboardLoader).toHaveBeenCalledTimes(1);
    expect(state.staffSchedulesLoader).toHaveBeenCalledTimes(1);
    expect(state.receptionDashboardLoader).toHaveBeenCalledTimes(1);
    expect(state.inventoryAlertsLoader).toHaveBeenCalledTimes(1);
    expect(state.maxActiveLoaders).toBeLessThanOrEqual(2);
  });

  it('opens management-issued follow-up tasks from the shared quick action', async () => {
    const intent = parseRuleIntent('customer.followup', 'reception', definition('reception'), 'quick_action');

    const result = await runMicroAppIntent(intent, 'customer.followup');

    expect(result.messages[0]?.payload).toMatchObject({
      kind: 'followUpTasks',
      data: {
        title: '客户跟进',
        items: [expect.objectContaining({ customerName: '马语嫣', status: 'pending' })],
      },
    });
    expect(state.followUpTasksLoader).toHaveBeenCalledTimes(1);
    expect(state.businessAgentLoader).not.toHaveBeenCalled();
  });

  it('opens beautician commission dashboard with focused commission payload', async () => {
    const intent: AuraResolvedIntent = {
      name: 'beautician.commission.view',
      role: 'beautician',
      action: 'beautician.commission',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'none',
      requiresConfirmation: false,
      showUserCommand: true,
      loadingLabel: '正在查询我的提成',
    };

    const result = await runMicroAppIntent(intent, '我的提成');

    expect(result.messages[0]?.payload).toMatchObject({ kind: 'beautician', focus: 'commission' });
    expect(result.aiSummary).toContain('我的提成');
    expect(state.beauticianDashboardLoader).toHaveBeenCalledTimes(1);
  });

  it('opens beautician schedule dashboard with schedule-only payload', async () => {
    const intent: AuraResolvedIntent = {
      name: 'beautician.schedule.view',
      role: 'beautician',
      action: 'beautician.schedule',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'none',
      requiresConfirmation: false,
      showUserCommand: true,
      loadingLabel: '正在加载我的预约',
    };

    const result = await runMicroAppIntent(intent, '我的预约');

    expect(result.messages[0]?.payload).toMatchObject({ kind: 'beautician', focus: 'schedule' });
    expect(result.aiSummary).toContain('我的预约');
    expect(result.aiSummary).toContain('排班');
    expect(state.beauticianDashboardLoader).toHaveBeenCalledTimes(1);
  });

  it('opens beautician customer list from my customers quick action', async () => {
    const intent: AuraResolvedIntent = {
      name: 'beautician.customer.view',
      role: 'beautician',
      action: 'beautician.customer',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'none',
      requiresConfirmation: false,
      showUserCommand: true,
      loadingLabel: '正在查询我的客户',
    };

    const result = await runMicroAppIntent(intent, '我的客户');

    expect(result.messages[0]?.payload).toMatchObject({ kind: 'beauticianCustomers', data: { title: '我的客户' } });
    expect(result.aiSummary).toContain('当前美容师服务客户');
    expect(state.beauticianCustomerListLoader).toHaveBeenCalledTimes(1);
    expect(state.customerCardLoader).not.toHaveBeenCalled();
  });

  it('opens service record form instead of completing a service task', async () => {
    const intent: AuraResolvedIntent = {
      name: 'service_record.create',
      role: 'beautician',
      action: 'beautician.record',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'medium',
      requiresConfirmation: true,
      showUserCommand: true,
      loadingLabel: '正在准备服务记录',
    };

    const result = await runMicroAppIntent(intent, '服务记录');

    expect(result.messages[0]?.payload).toMatchObject({ kind: 'serviceRecord' });
    expect(state.serviceRecordFlowLoader).toHaveBeenCalledTimes(1);
  });

  it('routes legacy complete-service action to the service record form', async () => {
    const intent: AuraResolvedIntent = {
      name: 'service_task.complete',
      role: 'beautician',
      action: 'operation.service-complete',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'medium',
      requiresConfirmation: true,
      showUserCommand: true,
      loadingLabel: '正在准备服务记录',
    };

    const result = await runMicroAppIntent(intent, '完成服务');

    expect(result.messages[0]?.payload).toMatchObject({ kind: 'serviceRecord' });
    expect(state.serviceRecordFlowLoader).toHaveBeenCalledTimes(1);
  });

  it('blocks off-topic fallback questions without calling AI', async () => {
    const intent: AuraResolvedIntent = {
      name: 'unknown.clarify',
      role: 'reception',
      action: null,
      source: 'text',
      confidence: 0.35,
      slots: {},
      missingSlots: [],
      riskLevel: 'none',
      requiresConfirmation: false,
      showUserCommand: true,
      loadingLabel: '正在理解指令',
    };

    const result = await runMicroAppIntent(intent, '今天天气怎么样');

    expect(result.messages[0]?.payload).toMatchObject({
      kind: 'ai',
      data: {
        title: 'Ami 提示',
        text: OFF_TOPIC_REPLY,
        source: 'Ami AI',
      },
    });
    expect(state.getTerminalBusinessAnswer).not.toHaveBeenCalled();
  });

  it('returns streaming AI fallback only for business-relevant unresolved questions', async () => {
    const intent: AuraResolvedIntent = {
      name: 'unknown.clarify',
      role: 'beautician',
      action: null,
      source: 'text',
      confidence: 0.35,
      slots: {},
      missingSlots: [],
      riskLevel: 'none',
      requiresConfirmation: false,
      showUserCommand: true,
      loadingLabel: '正在理解指令',
    };

    const result = await runMicroAppIntent(intent, '张三的皮肤状况');

    expect(state.getTerminalBusinessAnswer).not.toHaveBeenCalled();
    expect(result.messages).toEqual([]);
    expect(result.aiStream).toEqual({ role: 'beautician', command: '张三的皮肤状况' });
  });
});
