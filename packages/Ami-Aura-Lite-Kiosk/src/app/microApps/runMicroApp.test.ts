import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuraAction } from '../../../../../src/types/aura';
import type { Role, RoleDefinition } from '../types';
import type { AuraResolvedIntent } from '../intent/intentTypes';
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
    serviceRecordFlowLoader: vi.fn(async () => ({ title: '服务记录', tasks: [], beauticianName: '沈晴' })),
    cashierFlowLoader: vi.fn(async () => ({ title: '收银', customers: [], catalog: [] })),
    customerCardLoader: vi.fn(async () => ({
      customer: { id: 1, name: '张三', phone: '13800000000', memberLevel: '金卡', tags: [] },
      summary: '张三客户摘要',
      reasons: ['客户 #1'],
      recentVisits: [],
    })),
    getTerminalBusinessAnswer: vi.fn(async () => ({ title: 'Ami 智能问答', text: '业务回答', source: 'Ami AI' })),
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
  updateAppointmentAction: vi.fn(),
}));

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

describe('runMicroApp cache and prefetch behavior', () => {
  beforeEach(() => {
    state.currentStoreId = 1;
    state.maxActiveLoaders = 0;
    state.deferredTasks.splice(0);
    clearTerminalQueryCache();
    vi.clearAllMocks();
    state.getTerminalBusinessAnswer.mockResolvedValue({ title: 'Ami 智能问答', text: '业务回答', source: 'Ami AI' });
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

  it('routes customer lookup text into the customer micro-app instead of AI Q&A', async () => {
    const intent = parseRuleIntent('查客户张三', 'reception', definition('reception'), 'text');

    const result = await runMicroAppIntent(intent, '查客户张三');

    expect(intent.action).toBe('customer:张三');
    expect(state.customerCardLoader).toHaveBeenCalledWith('张三');
    expect(state.getTerminalBusinessAnswer).not.toHaveBeenCalled();
    expect(result.messages[0]?.payload).toMatchObject({
      kind: 'customer',
      data: { summary: '张三客户摘要' },
    });
  });

  it('routes cashier text into the cashier micro-app instead of AI Q&A', async () => {
    const intent = parseRuleIntent('帮我收银', 'reception', definition('reception'), 'text');

    const result = await runMicroAppIntent(intent, '帮我收银');

    expect(intent.action).toBe('operation.cashier');
    expect(state.cashierFlowLoader).toHaveBeenCalledTimes(1);
    expect(state.getTerminalBusinessAnswer).not.toHaveBeenCalled();
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'cashier' });
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
