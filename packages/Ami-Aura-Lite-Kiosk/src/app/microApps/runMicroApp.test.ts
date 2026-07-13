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
    cardVerificationFlowLoader: vi.fn(async () => ({ title: '核销', customers: [] })),
    printDocumentsLoader: vi.fn(async () => ({
      title: '今日可打印单据',
      subtitle: 'Ami 全量演示门店',
      summary: '今日共 3 张可打印单据：收银 1 单，核销 1 单，办卡 1 单。',
      date: '2026-06-29',
      generatedAt: '2026-06-29T10:00:00.000Z',
      total: 3,
      counts: { cashier: 1, cardUsage: 1, cardOrder: 1 },
      items: [],
    })),
    rechargeFlowLoader: vi.fn(async () => ({
      title: '会员充值',
      subtitle: 'Ami 全量演示门店',
      source: 'Ami_Core 客户选择、充值订单、项目数据',
      customers: [{ id: 7, name: '马语嫣', phone: '13873801982', memberLevel: '钻石会员', tags: [] }],
      giftProjects: [],
      generatedAt: '2026-06-20 03:45',
    })),
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
    appendBusinessAgentLoader: vi.fn(async () => ({
      runId: 1001,
      runNo: 'AG202606160001',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '继续分析上一轮 AgentRun',
        toolPlan: [{ tool: 'business.query.ask', args: { question: '继续分析' } }],
        confidence: 0.82,
        clarificationNeeded: false,
      },
      answer: '已基于上一轮结果继续分析。',
      toolResults: [],
      actions: [],
    })),
  };
});

vi.mock('@/stores/storeStore', () => ({
  useStoreStore: {
    getState: () => ({ currentStoreId: state.currentStoreId }),
  },
}));

// intentRouter 重写后 text/voice source 会调用 resolveTerminalIntent，
// 测试环境需要 mock，否则发起真实 API 请求导致超时。
// 返回 business.query，与这批测试的原始期望保持一致。
vi.mock('@/api', () => ({
  resolveTerminalIntent: vi.fn(async () => ({
    action: 'business.query',
    confidence: 0.9,
    slots: {},
    missingSlots: [],
    reason: 'mocked for tests',
  })),
}));

vi.mock('../services/agentRuntimeService', () => ({
  appendTerminalAgentMessage: state.appendBusinessAgentLoader,
  createTerminalAgentRun: state.businessAgentLoader,
  submitTerminalAgentFeedback: vi.fn(),
}));

vi.mock('../services/auraCoreService', () => ({
  appendBusinessAgentMessage: state.appendBusinessAgentLoader,
  getBeauticianDashboard: state.beauticianDashboardLoader,
  getBeauticianCustomerList: state.beauticianCustomerListLoader,
  getCardOpeningFlow: vi.fn(),
  getCardVerificationFlow: state.cardVerificationFlowLoader,
  getCashierFlow: state.cashierFlowLoader,
  getCustomerCard: state.customerCardLoader,
  getCustomerGrowthCandidates: vi.fn(async () => []),
  getFollowUpTasksView: state.followUpTasksLoader,
  getInventoryAlerts: state.inventoryAlertsLoader,
  getManagerDashboard: state.managerDashboardLoader,
  getOperationResult: vi.fn(),
  getTodayPrintDocuments: state.printDocumentsLoader,
  prefetchAuraBootstrap: vi.fn(async () => undefined),
  getReceptionDashboard: state.receptionDashboardLoader,
  getRechargeFlow: state.rechargeFlowLoader,
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

function expectTerminalAgentCreateCall(command: string, role: Role, context: Record<string, unknown>) {
  expect(state.businessAgentLoader).toHaveBeenCalledWith(
    expect.objectContaining({
      command,
      role,
      context: expect.objectContaining(context),
    }),
  );
}

function expectTerminalAgentAppendCall(activeRunId: number, command: string, role: Role, context: Record<string, unknown>) {
  expect(state.appendBusinessAgentLoader).toHaveBeenCalledWith(
    expect.objectContaining({
      activeRunId,
      command,
      role,
      context: expect.objectContaining(context),
    }),
  );
}

describe('runMicroApp cache and prefetch behavior', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
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
    state.appendBusinessAgentLoader.mockResolvedValue({
      runId: 1001,
      runNo: 'AG202606160001',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '继续分析上一轮 AgentRun',
        toolPlan: [{ tool: 'business.query.ask', args: { question: '继续分析' } }],
        confidence: 0.82,
        clarificationNeeded: false,
      },
      answer: '已基于上一轮结果继续分析。',
      toolResults: [],
      actions: [],
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
    state.rechargeFlowLoader.mockResolvedValue({
      title: '会员充值',
      subtitle: 'Ami 全量演示门店',
      source: 'Ami_Core 客户选择、充值订单、项目数据',
      customers: [{ id: 7, name: '马语嫣', phone: '13873801982', memberLevel: '钻石会员', tags: [] }],
      giftProjects: [],
      generatedAt: '2026-06-20 03:45',
    });
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
    expectTerminalAgentCreateCall('查客户张三', 'reception', {
      intent: expect.objectContaining({ action: 'business.query', source: 'text' }),
    });
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
    expectTerminalAgentCreateCall('今天收银多少', 'reception', {
      intent: expect.objectContaining({ action: 'business.query', source: 'text' }),
    });
    expect(state.getTerminalBusinessAnswer).not.toHaveBeenCalled();
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'agentRun' });
  });

  it('routes governed business data questions into Agent Gateway instead of customer growth card', async () => {
    const intent = parseRuleIntent('近期销量增长的商品', 'manager', definition('manager'), 'text');

    const result = await runMicroAppIntent(intent, '近期销量增长的商品');

    expect(intent.action).toBe('business.query');
    expectTerminalAgentCreateCall('近期销量增长的商品', 'manager', {
      intent: expect.objectContaining({ action: 'business.query', source: 'text' }),
    });
    expect(result.messages[0]?.payload).toMatchObject({
      kind: 'agentRun',
      data: {
        plan: {
          toolPlan: [{ tool: 'marketing.opportunity.discover' }],
        },
      },
    });
  });

  it('passes Agent V2 architecture meta into terminal Agent Runtime', async () => {
    const intent = parseRuleIntent('今天经营有什么风险', 'manager', definition('manager'), 'text');

    await runMicroAppIntent(intent, '今天经营有什么风险', {
      agentEngine: 'agent_v2',
      agentContext: { terminal: { personaCode: 'manager' } },
    });

    expect(state.businessAgentLoader).toHaveBeenCalledWith(
      expect.objectContaining({
        command: '今天经营有什么风险',
        role: 'manager',
        agentEngine: 'agent_v2',
        context: expect.objectContaining({
          agentEngine: 'agent_v2',
          architecture: 'kg_llm_agent',
          terminal: expect.objectContaining({
            agentEngine: 'agent_v2',
            architecture: 'kg_llm_agent',
            personaCode: 'manager',
          }),
          intent: expect.objectContaining({ action: 'business.query', source: 'text' }),
        }),
      }),
    );
  });

  it('routes yesterday consumption customer list questions into Agent Runtime', async () => {
    const intent = parseRuleIntent('昨天有哪些消费的客户，列出清单', 'manager', definition('manager'), 'text');

    const result = await runMicroAppIntent(intent, '昨天有哪些消费的客户，列出清单', {
      agentContext: { terminal: { personaCode: 'manager' } },
    });

    expect(intent.action).toBe('business.query');
    expectTerminalAgentCreateCall('昨天有哪些消费的客户，列出清单', 'manager', {
      terminal: expect.objectContaining({ personaCode: 'manager' }),
      intent: expect.objectContaining({ action: 'business.query', source: 'text' }),
    });
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'agentRun' });
  });

  it('falls back to the legacy business answer path when terminal Agent Runtime is disabled by env', async () => {
    vi.stubEnv('VITE_KIOSK_AGENT_RUNTIME_ENABLED', 'false');
    const intent = parseRuleIntent('昨天有哪些消费的客户，列出清单', 'manager', definition('manager'), 'text');

    const result = await runMicroAppIntent(intent, '昨天有哪些消费的客户，列出清单');

    expect(intent.action).toBe('business.query');
    expect(state.businessAgentLoader).not.toHaveBeenCalled();
    expect(result.messages).toEqual([]);
    expect(result.aiStream).toMatchObject({
      role: 'manager',
      command: '昨天有哪些消费的客户，列出清单',
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

    expectTerminalAgentCreateCall('这些商品库存够吗', 'manager', {
      previousBusinessQuery: context,
      intent: expect.objectContaining({ action: 'business.query', source: 'text' }),
    });
  });

  it('appends governed follow-up questions to the previous AgentRun when run context exists', async () => {
    const intent = parseRuleIntent('继续看这些商品的库存风险', 'manager', definition('manager'), 'text');
    const agentContext = {
      previousRun: {
        runId: 1001,
        runNo: 'AG202606160001',
        status: 'completed',
      },
    };

    const result = await runMicroAppIntent(intent, '继续看这些商品的库存风险', { agentContext });

    expect(state.businessAgentLoader).not.toHaveBeenCalled();
    expectTerminalAgentAppendCall(1001, '继续看这些商品的库存风险', 'manager', {
      previousRun: expect.objectContaining({ runId: 1001 }),
      intent: expect.objectContaining({ source: 'text' }),
    });
    expect(result.messages[0]?.payload).toMatchObject({
      kind: 'agentRun',
      data: { runId: 1001, answer: '已基于上一轮结果继续分析。' },
    });
  });

  it('falls back to streaming AI when Agent Runtime is unavailable', async () => {
    state.businessAgentLoader.mockRejectedValueOnce(new Error('agent gateway timeout'));
    const intent = parseRuleIntent('今天经营有什么风险', 'manager', definition('manager'), 'text');

    const result = await runMicroAppIntent(intent, '今天经营有什么风险');

    expect(state.businessAgentLoader).toHaveBeenCalled();
    expect(result.messages[0]).toMatchObject({
      type: 'error',
      payload: {
        source: 'agent-runtime',
      },
    });
    expect(result.aiStream).toMatchObject({
      role: 'manager',
      command: '今天经营有什么风险',
      businessContext: expect.stringContaining('agent gateway timeout'),
    });
  });

  it('routes typed inventory questions into Agent Runtime instead of the inventory card', async () => {
    const intent: AuraResolvedIntent = {
      name: 'manager.inventory.view',
      role: 'manager',
      action: 'manager.inventory',
      source: 'text',
      confidence: 0.88,
      slots: {},
      missingSlots: [],
      riskLevel: 'none',
      requiresConfirmation: false,
      showUserCommand: true,
      loadingLabel: '正在查询库存预警',
    };

    const result = await runMicroAppIntent(intent, '近期有哪些临期库存产品');

    expect(intent.action).toBe('manager.inventory');
    expect(state.inventoryAlertsLoader).not.toHaveBeenCalled();
    expectTerminalAgentCreateCall('近期有哪些临期库存产品', 'manager', {
      intent: expect.objectContaining({ action: 'manager.inventory', source: 'text' }),
    });
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'agentRun' });
  });

  it.each([
    '昨天有哪些消费的客户，列出清单',
    '近期有哪些临期库存产品',
    '临期库存怎么处理，生成草稿建议',
    '今天经营有什么风险',
    '哪些客户最值得优先回访',
    '哪些商品需要补货',
    '本月员工业绩排行',
  ])('routes T6.5 terminal acceptance question into Agent Runtime: %s', async (question) => {
    const intent = parseRuleIntent(question, 'manager', definition('manager'), 'text');

    const result = await runMicroAppIntent(intent, question, {
      agentContext: {
        terminalFacts: {
          inventory: { source: 'test', items: [{ productName: '临期精华', expiryDate: '2026-07-10' }] },
        },
      },
    });

    expect(state.businessAgentLoader).toHaveBeenCalledTimes(1);
    expectTerminalAgentCreateCall(question, 'manager', {
      terminalFacts: expect.objectContaining({
        inventory: expect.objectContaining({ source: 'test' }),
      }),
      intent: expect.objectContaining({ source: 'text' }),
    });
    expect(state.getTerminalBusinessAnswer).not.toHaveBeenCalled();
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'agentRun' });
  });

  it.each([
    '老朋友回店护理礼活动链接发我',
    '推荐近期营销活动',
    '请列出10个需要紧急召回的客户',
    '这个月营业额',
    '近期有哪些临期库存产品',
    '今天有哪些预约',
  ])('routes semantic planner consistency question into Agent Runtime: %s', async (question) => {
    const intent = await resolveCommandIntent({
      command: question,
      role: 'manager',
      definition: definition('manager'),
      source: 'text',
    });

    const result = await runMicroAppIntent(intent, question);

    expect(intent.action).toBe('business.query');
    expect(state.businessAgentLoader).toHaveBeenCalledTimes(1);
    expect(state.getTerminalBusinessAnswer).not.toHaveBeenCalled();
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'agentRun' });
  });

  it('keeps inventory quick actions on the card flow', async () => {
    const intent = parseRuleIntent('manager.inventory', 'manager', definition('manager'), 'quick_action');
    const promise = runMicroAppIntent(intent, 'manager.inventory');

    state.deferredTasks.shift()?.();
    const result = await promise;

    expect(intent.action).toBe('manager.inventory');
    expect(state.inventoryAlertsLoader).toHaveBeenCalledTimes(1);
    expect(state.businessAgentLoader).not.toHaveBeenCalled();
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'inventory' });
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

  it('opens recharge flow from the recharge quick action', async () => {
    const intent: AuraResolvedIntent = {
      name: 'recharge.create',
      role: 'reception',
      action: 'operation.recharge',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'medium',
      requiresConfirmation: true,
      showUserCommand: true,
      loadingLabel: '正在准备会员充值',
    };

    const result = await runMicroAppIntent(intent, 'operation.recharge');

    expect(result.messages[0]?.type).toBe('recharge');
    expect(result.messages[0]?.payload).toMatchObject({
      kind: 'recharge',
      data: { title: '会员充值', customers: [expect.objectContaining({ name: '马语嫣' })] },
    });
    expect(state.rechargeFlowLoader).toHaveBeenCalledTimes(1);
    expect(state.businessAgentLoader).not.toHaveBeenCalled();
  });

  it('keeps verify quick actions on the FlowCard path instead of Agent Runtime', async () => {
    const intent: AuraResolvedIntent = {
      name: 'card.consume',
      role: 'reception',
      action: 'operation.verify',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'medium',
      requiresConfirmation: true,
      showUserCommand: true,
      loadingLabel: '正在准备核销',
    };

    const result = await runMicroAppIntent(intent, '核销');

    expect(result.messages[0]?.type).toBe('cardVerification');
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'cardVerification' });
    expect(state.cardVerificationFlowLoader).toHaveBeenCalledTimes(1);
    expect(state.businessAgentLoader).not.toHaveBeenCalled();
  });

  it('keeps cashier quick actions on the FlowCard path instead of Agent Runtime', async () => {
    const intent: AuraResolvedIntent = {
      name: 'cashier.checkout',
      role: 'reception',
      action: 'operation.cashier',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'medium',
      requiresConfirmation: true,
      showUserCommand: true,
      loadingLabel: '正在准备收银',
    };

    const result = await runMicroAppIntent(intent, '收银');

    expect(result.messages[0]?.type).toBe('cashier');
    expect(result.messages[0]?.payload).toMatchObject({ kind: 'cashier' });
    expect(state.cashierFlowLoader).toHaveBeenCalledTimes(1);
    expect(state.businessAgentLoader).not.toHaveBeenCalled();
  });

  it('opens today printable documents from the print quick action', async () => {
    const intent: AuraResolvedIntent = {
      name: 'print.receipt',
      role: 'reception',
      action: 'operation.print',
      source: 'quick_action',
      confidence: 1,
      slots: {},
      missingSlots: [],
      riskLevel: 'low',
      requiresConfirmation: false,
      showUserCommand: true,
      loadingLabel: '正在加载今日可打印单据',
    };

    const result = await runMicroAppIntent(intent, '打印');

    expect(result.messages[0]?.type).toBe('dashboard');
    expect(result.messages[0]?.payload).toMatchObject({
      kind: 'printDocuments',
      data: { title: '今日可打印单据', counts: { cashier: 1, cardUsage: 1, cardOrder: 1 } },
    });
    expect(state.printDocumentsLoader).toHaveBeenCalledTimes(1);
    expect(state.businessAgentLoader).not.toHaveBeenCalled();
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
