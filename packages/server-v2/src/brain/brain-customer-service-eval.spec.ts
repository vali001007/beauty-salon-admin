import { BrainCustomerServiceDomainAdapter } from './domain/adapters/brain-customer-service-domain.adapter.js';
import { BrainRoleIntentRouterService } from './domain/brain-role-intent-router.service.js';

describe('Brain customer service 100-case evaluation gate', () => {
  const templates = [
    '写一条生日关怀话术',
    '生成服务后回访消息',
    '客户投诉了，写一条安抚话术',
    '疗程快结束，准备周期提醒',
    '给这些客户创建跟进任务',
  ];
  const samples = Array.from({ length: 100 }, (_, index) => `${templates[index % templates.length]} ${index + 1}`);
  const router = new BrainRoleIntentRouterService();
  const customerFacts = {
    answerCustomerFactQuestion: jest.fn().mockResolvedValue('客户名单：\n1. 李女士'),
  };
  const actionConfirmation = {
    createPreview: jest.fn().mockResolvedValue({ actionId: 'preview_action' }),
  };
  const actionTargets = {
    resolveCustomer: jest.fn().mockResolvedValue({ ok: true, value: { id: 7, name: '李女士' } }),
  };
  const adapter = new BrainCustomerServiceDomainAdapter(customerFacts as never, actionConfirmation as never, actionTargets as never);
  const context = {
    userId: 9,
    storeId: 2,
    visibleStoreIds: [2],
    permissions: ['*'],
    deniedPermissions: [],
    requestId: 'req',
    timezone: 'Asia/Shanghai',
  };

  it.each(samples)('routes and answers customer service case: %#', async (message) => {
    const action = /(创建|群发|发券)/.test(message);
    const runtimeIntent = action
      ? { intent: 'action' as const, expectedShape: 'non_metric' as const, allowsScalarMetric: false, reason: 'action' }
      : { intent: 'draft' as const, expectedShape: 'non_metric' as const, allowsScalarMetric: false, reason: 'draft' };
    const plan = router.route({ message, roleHint: 'customer_service', runtimeIntent });
    const answer = await adapter.execute({
      context,
      dto: { message, roleHint: 'customer_service', timezone: 'Asia/Shanghai' },
      runId: 1,
      cognition: {
        normalizedText: message,
        terms: [],
        metrics: [],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'general_assistant', confidence: 0.8, reason: 'customer_service_eval' },
        needsClarification: false,
      },
      runtimeIntent,
      plan,
    });

    expect(plan).toMatchObject({ role: 'customer_service', adapterKey: 'customer_service' });
    expect(answer?.status).toBe('completed');
    expect(answer?.answer.trim().length).toBeGreaterThan(10);
    expect(answer?.citations.length).toBeGreaterThan(0);
    if (action) expect(answer?.grounding).toBe('preview_action');
  });
});
