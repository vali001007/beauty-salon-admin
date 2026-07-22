import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { MarketingController } from './marketing.controller';

describe('MarketingController store scope', () => {
  const marketing = {
    getRecommendations: jest.fn(),
    getRecommendationCoverage: jest.fn(),
    getRecommendationAudience: jest.fn(),
    createRecommendation: jest.fn(),
    updateRecommendation: jest.fn(),
    deleteRecommendation: jest.fn(),
    findActivities: jest.fn(),
    createActivity: jest.fn(),
    findStrategies: jest.fn(),
    executeStrategy: jest.fn(),
    adoptRecommendation: jest.fn(),
    recordCustomerBehaviorEvent: jest.fn(),
    rebuildLifecycleOntology: jest.fn(),
    getInvitationCandidates: jest.fn(),
    getLatestPredictionSummary: jest.fn(),
    findPredictionCustomers: jest.fn(),
    getCustomerPrediction: jest.fn(),
    getStrategyEffects: jest.fn(),
    findRuleTemplates: jest.fn(),
    getRuleTemplateById: jest.fn(),
    cloneRuleTemplate: jest.fn(),
    createRuleTemplate: jest.fn(),
    updateRuleTemplate: jest.fn(),
    previewRuleTemplateAudience: jest.fn(),
    enableRuleTemplate: jest.fn(),
    disableRuleTemplate: jest.fn(),
    getRuleTemplateEffects: jest.fn(),
    getLifecycleServiceCycles: jest.fn(),
    getLifecycleOpportunities: jest.fn(),
    getLifecycleOpportunityFulfillment: jest.fn(),
    getLifecycleAttribution: jest.fn(),
    getLifecycleQuality: jest.fn(),
    getLifecycleRules: jest.fn(),
    createLifecycleRule: jest.fn(),
    publishLifecycleRule: jest.fn(),
    rollbackLifecycleRule: jest.fn(),
    createLifecycleBusinessPlan: jest.fn(),
    submitLifecycleBusinessPlanActions: jest.fn(),
    getCustomerLifecycleContext: jest.fn(),
  } as any;
  const terminal = {
    getFollowUpTasks: jest.fn(),
  } as any;
  const predictionRuns = { runForStore: jest.fn() } as any;
  const recommendationQueries = { findMany: jest.fn(), getById: jest.fn(), getAudience: jest.fn(), findLegacy: jest.fn() } as any;
  const recommendationOrchestrator = { refreshForStore: jest.fn() } as any;
  const recommendationAdoptions = { adopt: jest.fn(), resolveLegacyInstance: jest.fn() } as any;
  const featureFlags = {
    recommendationInstanceWrite: false,
    recommendationInstanceRead: false,
    recommendationAdoptionV2: false,
    isEnabledForStore: jest.fn(),
  } as any;
  const controller = new MarketingController(
    marketing,
    terminal,
    predictionRuns,
    recommendationQueries,
    recommendationOrchestrator,
    recommendationAdoptions,
    featureFlags,
  );
  const legacyWarning = jest.fn();
  (controller as any).logger = { warn: legacyWarning };

  beforeEach(() => {
    jest.clearAllMocks();
    featureFlags.recommendationInstanceWrite = false;
    featureFlags.recommendationInstanceRead = false;
    featureFlags.recommendationAdoptionV2 = false;
    featureFlags.isEnabledForStore.mockImplementation((flag: string) => Boolean(featureFlags[flag]));
  });

  it('uses the recommendation instance read path only for rollout stores', async () => {
    featureFlags.recommendationInstanceRead = true;
    featureFlags.recommendationAdoptionV2 = true;
    featureFlags.isEnabledForStore.mockImplementation(
      (flag: string, storeId: number) => ['recommendationInstanceRead', 'recommendationAdoptionV2'].includes(flag) && storeId === 6,
    );
    recommendationQueries.findLegacy.mockResolvedValue({ items: [] });
    marketing.getRecommendations.mockResolvedValue({ items: [] });

    await controller.getRecommendations('6');
    await controller.getRecommendations('7');

    expect(recommendationQueries.findLegacy).toHaveBeenCalledTimes(1);
    expect(recommendationQueries.findLegacy).toHaveBeenCalledWith(6, expect.any(Object));
    expect(marketing.getRecommendations).toHaveBeenCalledTimes(1);
    expect(marketing.getRecommendations).toHaveBeenCalledWith(7, expect.any(Object));
  });

  it('routes the legacy follow-up endpoint through adoption instead of creating orphan tasks', async () => {
    marketing.adoptRecommendation.mockResolvedValue({
      adoptionId: 52,
      recommendationId: 23,
      mode: 'terminal_follow_up',
      status: 'dispatched',
      followUpTaskIds: [91],
    });

    await controller.createRecommendationFollowUpTasks(23, {
      customerIds: [11, 12],
      assignments: [{ customerId: 11, assigneeUserId: 7 }],
    } as any, '6', 9);

    expect(marketing.adoptRecommendation).toHaveBeenCalledWith(23, 6, {
      mode: 'terminal_follow_up',
      customerIds: [11, 12],
      assignments: [{ customerId: 11, assigneeUserId: 7 }],
    });
  });

  it('passes X-Store-Id to activity queries', async () => {
    marketing.findActivities.mockResolvedValue({ items: [] });

    await controller.findActivities(1, 20, undefined, '6');

    expect(marketing.findActivities).toHaveBeenCalledWith({ page: 1, pageSize: 20, status: undefined, storeId: 6 });
  });

  it('rejects activity creation when X-Store-Id is missing', () => {
    expect(() => controller.createActivity({ title: '召回活动' }, undefined)).toThrow(BadRequestException);
  });

  it('executes a strategy inside the current store', async () => {
    marketing.executeStrategy.mockResolvedValue({ id: 1 });

    await controller.executeStrategy(7, '6');

    expect(marketing.executeStrategy).toHaveBeenCalledWith(7, 6);
  });

  it('adopts a recommendation inside the current store', async () => {
    marketing.adoptRecommendation.mockResolvedValue({ adoptionId: 1 });

    await controller.adoptRecommendationTransaction(22, { mode: 'activity', activity: { publishPage: true } }, '6');

    expect(marketing.adoptRecommendation).toHaveBeenCalledWith(22, 6, { mode: 'activity', activity: { publishPage: true } });
  });

  it('ignores a legacy adoption body store override', async () => {
    marketing.adoptRecommendation.mockResolvedValue({ success: true });

    await controller.adoptRecommendation(22, { storeId: 999, customerId: 8, targetType: 'activity' }, '6', 9);

    expect(marketing.adoptRecommendation).toHaveBeenCalledWith(22, 6, {
      customerId: 8,
      targetType: 'activity',
    });
  });

  it('runs the new prediction endpoint from X-Store-Id only', async () => {
    predictionRuns.runForStore.mockResolvedValue({ run: { id: 55 } });

    await controller.runPrediction('6');

    expect(predictionRuns.runForStore).toHaveBeenCalledWith(6);
  });

  it.each([
    ['recommendation audience', () => controller.getRecommendationAudience(1, undefined)],
    ['follow-up task list', () => controller.getFollowUpTasks({} as any, undefined)],
    ['follow-up task summary', () => controller.getFollowUpTaskSummary(undefined)],
    ['latest prediction summary', () => (controller as any).getLatestPredictionSummary(undefined, undefined)],
    ['prediction customer list', () => (controller as any).findPredictionCustomers(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined)],
    ['customer prediction detail', () => (controller as any).getCustomerPrediction(9, undefined)],
    ['invitation candidates', () => controller.getInvitationCandidates(undefined, 999, 10)],
    ['strategy effects', () => (controller as any).getStrategyEffects(undefined)],
  ])('rejects %s when X-Store-Id is missing', async (_label, invoke) => {
    await expect(Promise.resolve().then(() => invoke())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses X-Store-Id instead of query/body store overrides for recommendation inputs', async () => {
    marketing.getInvitationCandidates.mockResolvedValue({ items: [] });
    marketing.getLatestPredictionSummary.mockResolvedValue(null);
    marketing.findPredictionCustomers.mockResolvedValue({ items: [] });
    marketing.recordCustomerBehaviorEvent.mockResolvedValue({ id: 1 });
    marketing.rebuildLifecycleOntology.mockResolvedValue({ success: true });

    await controller.getInvitationCandidates('6', 999, 10);
    await (controller as any).getLatestPredictionSummary(999, '6');
    await (controller as any).findPredictionCustomers(1, 20, 999, undefined, undefined, undefined, undefined, '6');
    await (controller as any).recordCustomerBehaviorEvent({ storeId: 999, customerId: 8, eventType: 'view' }, '6');
    await controller.rebuildLifecycleOntology('6', { storeId: 999, predictionRunId: 55 });

    expect(marketing.getInvitationCandidates).toHaveBeenCalledWith({ storeId: 6, limit: 10 });
    expect(marketing.getLatestPredictionSummary).toHaveBeenCalledWith(6);
    expect(marketing.findPredictionCustomers).toHaveBeenCalledWith(expect.objectContaining({ storeId: 6, page: 1, pageSize: 20 }));
    expect(marketing.recordCustomerBehaviorEvent).toHaveBeenCalledWith(6, expect.objectContaining({ customerId: 8, eventType: 'view' }));
    expect(marketing.rebuildLifecycleOntology).toHaveBeenCalledWith(6, 55, expect.any(Object));
  });

  it('scopes legacy recommendation mutations to X-Store-Id', async () => {
    marketing.createRecommendation.mockResolvedValue({ id: 1 });
    marketing.updateRecommendation.mockResolvedValue({ id: 1 });
    marketing.deleteRecommendation.mockResolvedValue({ success: true });

    await (controller as any).createRecommendation({ title: '召回' }, '6');
    await (controller as any).updateRecommendation(1, { title: '召回更新' }, '6');
    await (controller as any).deleteRecommendation(1, '6');

    expect(marketing.createRecommendation).toHaveBeenCalledWith({ title: '召回' }, 6);
    expect(marketing.updateRecommendation).toHaveBeenCalledWith(1, { title: '召回更新' }, 6);
    expect(marketing.deleteRecommendation).toHaveBeenCalledWith(1, 6);
  });

  it.each([
    ['rule template list', () => (controller as any).findRuleTemplates(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined)],
    ['rule template detail', () => (controller as any).getRuleTemplateById(1, undefined)],
    ['rule template clone', () => (controller as any).cloneRuleTemplate(1, {}, undefined)],
    ['rule template create', () => (controller as any).createRuleTemplate({}, undefined)],
    ['rule template update', () => (controller as any).updateRuleTemplate(1, {}, undefined)],
    ['rule template audience preview', () => (controller as any).previewRuleTemplateAudience(1, undefined)],
    ['rule template enable', () => (controller as any).enableRuleTemplate(1, {}, undefined)],
    ['rule template disable', () => (controller as any).disableRuleTemplate(1, undefined)],
    ['rule template effects', () => (controller as any).getRuleTemplateEffects(1, undefined)],
  ])('rejects %s when X-Store-Id is missing', async (_label, invoke) => {
    await expect(Promise.resolve().then(() => invoke())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('passes only X-Store-Id to rule template mutations', async () => {
    marketing.cloneRuleTemplate.mockResolvedValue({ id: 2 });
    marketing.createRuleTemplate.mockResolvedValue({ id: 3 });
    marketing.enableRuleTemplate.mockResolvedValue({ strategy: { id: 4 } });

    await (controller as any).cloneRuleTemplate(1, { storeId: 999 }, '6');
    await (controller as any).createRuleTemplate({ storeId: 999, name: '门店规则' }, '6');
    await (controller as any).enableRuleTemplate(1, { storeId: 999 }, '6');

    expect(marketing.cloneRuleTemplate).toHaveBeenCalledWith(1, 6, { storeId: 999 });
    expect(marketing.createRuleTemplate).toHaveBeenCalledWith(6, { storeId: 999, name: '门店规则' });
    expect(marketing.enableRuleTemplate).toHaveBeenCalledWith(1, 6, { storeId: 999 });
  });

  it.each([
    ['lifecycle service cycles', () => (controller as any).getLifecycleServiceCycles({}, undefined)],
    ['lifecycle opportunities', () => (controller as any).getLifecycleOpportunities({}, undefined)],
    ['lifecycle fulfillment', () => (controller as any).getLifecycleOpportunityFulfillment(1, undefined)],
    ['lifecycle attribution', () => (controller as any).getLifecycleAttribution({}, undefined)],
    ['lifecycle quality', () => (controller as any).getLifecycleQuality(undefined)],
    ['lifecycle rules', () => (controller as any).getLifecycleRules({}, undefined)],
    ['lifecycle rule creation', () => (controller as any).createLifecycleRule({}, undefined)],
    ['lifecycle rule publication', () => (controller as any).publishLifecycleRule(1, {}, undefined)],
    ['lifecycle rule rollback', () => (controller as any).rollbackLifecycleRule(1, {}, undefined)],
    ['lifecycle business plan creation', () => (controller as any).createLifecycleBusinessPlan({}, undefined, {})],
    ['lifecycle business plan submission', () => (controller as any).submitLifecycleBusinessPlanActions(1, {}, {}, undefined)],
    ['customer lifecycle context', () => (controller as any).getCustomerLifecycleContext(1, undefined)],
  ])('rejects %s when X-Store-Id is missing', async (_label, invoke) => {
    await expect(Promise.resolve().then(() => invoke())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('passes X-Store-Id to lifecycle mutation services and ignores body storeId', async () => {
    marketing.createLifecycleRule.mockResolvedValue({ id: 1 });
    marketing.createLifecycleBusinessPlan.mockResolvedValue({ id: 2 });
    marketing.publishLifecycleRule.mockResolvedValue({ id: 3 });
    marketing.submitLifecycleBusinessPlanActions.mockResolvedValue({ submitted: true });

    await (controller as any).createLifecycleRule({ storeId: 999, ruleType: 'churn' }, '6');
    await (controller as any).createLifecycleBusinessPlan({ storeId: 999 }, '6', { id: 9 });
    await (controller as any).publishLifecycleRule(3, { id: 9 }, '6');
    await (controller as any).submitLifecycleBusinessPlanActions(2, { storeId: 999 }, { id: 9 }, '6');

    expect(marketing.createLifecycleRule).toHaveBeenCalledWith({ storeId: 999, ruleType: 'churn' }, 6);
    expect(marketing.createLifecycleBusinessPlan).toHaveBeenCalledWith({ storeId: 999 }, 6, 9);
    expect(marketing.publishLifecycleRule).toHaveBeenCalledWith(3, 6, 9);
    expect(marketing.submitLifecycleBusinessPlanActions).toHaveBeenCalledWith(2, 6, { storeId: 999 }, 9);
  });

  it('routes the legacy prediction endpoint through the current store header', async () => {
    predictionRuns.runForStore.mockResolvedValue({ run: { id: 55 } });

    await controller.runPredictions({ storeId: 999 }, '6');

    expect(predictionRuns.runForStore).toHaveBeenCalledWith(6);
  });

  it('lists recommendation instances inside the current store', async () => {
    featureFlags.recommendationInstanceRead = true;
    recommendationQueries.findMany.mockResolvedValue({ items: [] });

    await controller.findRecommendationInstances('6', 'prediction', 'P0', 'active', '1', '20');

    expect(recommendationQueries.findMany).toHaveBeenCalledWith(6, {
      sourceType: 'prediction', priority: 'P0', status: 'active', page: 1, pageSize: 20,
    });
  });

  it('reads a persisted recommendation audience inside the current store', async () => {
    featureFlags.recommendationInstanceRead = true;
    recommendationQueries.getAudience.mockResolvedValue({ items: [] });

    await controller.getRecommendationInstanceAudience('instance-1', '6', '2', '50');

    expect(recommendationQueries.getAudience).toHaveBeenCalledWith('instance-1', 6, { page: 2, pageSize: 50 });
  });

  it('refreshes recommendation instances through the orchestrator', async () => {
    featureFlags.recommendationInstanceWrite = true;
    recommendationOrchestrator.refreshForStore.mockResolvedValue({ createdInstanceIds: [] });

    await controller.refreshRecommendationInstances('6');

    expect(recommendationOrchestrator.refreshForStore).toHaveBeenCalledWith(6);
  });

  it('routes the legacy recommendation list to instances only when the read flag is enabled', async () => {
    featureFlags.recommendationInstanceRead = true;
    featureFlags.recommendationAdoptionV2 = true;
    recommendationQueries.findLegacy.mockResolvedValue([]);

    await controller.getRecommendations('6', 'customer', undefined, '20', 'false');

    expect(recommendationQueries.findLegacy).toHaveBeenCalledWith(6, {
      sourceType: undefined,
      page: 1,
      pageSize: 20,
    });
    expect(marketing.getRecommendations).not.toHaveBeenCalled();
  });

  it('logs legacy recommendation reads with the current store for the retirement observation window', async () => {
    marketing.getRecommendations.mockResolvedValue([]);

    await controller.getRecommendations('6', 'customer', undefined, '20', 'false');

    expect(legacyWarning).toHaveBeenCalledWith(expect.stringContaining('legacy_marketing_recommendation_api'));
    expect(legacyWarning).toHaveBeenCalledWith(expect.stringContaining('route=GET /marketing/recommendations'));
    expect(legacyWarning).toHaveBeenCalledWith(expect.stringContaining('storeId=6'));
    expect(legacyWarning).toHaveBeenCalledWith(expect.stringContaining('sunset=2026-09-30'));
  });

  it('logs legacy adoption even while the v2 forwarding flag is disabled', async () => {
    marketing.adoptRecommendation.mockResolvedValue({ adoptionId: 1 });

    await controller.adoptRecommendationTransaction(22, { mode: 'activity' }, '6', 9);

    expect(legacyWarning).toHaveBeenCalledWith(expect.stringContaining('route=POST /marketing/recommendations/:id/adoptions'));
    expect(legacyWarning).toHaveBeenCalledWith(expect.stringContaining('storeId=6'));
  });

  it.each([
    'getRecommendations',
    'getRecommendationAudience',
    'createRecommendation',
    'updateRecommendation',
    'deleteRecommendation',
    'adoptRecommendation',
    'adoptRecommendationTransaction',
    'createRecommendationActivityDraft',
    'createRecommendationAutomationDraft',
    'createRecommendationFollowUpTasks',
  ])('publishes deprecation headers for legacy handler %s', (handler) => {
    const headers = Reflect.getMetadata('__headers__', (MarketingController.prototype as any)[handler]) ?? [];

    expect(headers).toEqual(expect.arrayContaining([
      { name: 'Deprecation', value: 'true' },
      { name: 'Sunset', value: '2026-09-30' },
    ]));
    expect(headers.some((item: any) => item.name === 'Link' && String(item.value).includes('/marketing/recommendation-instances'))).toBe(true);
  });

  it('adopts a persisted recommendation instance with the current store and user', async () => {
    featureFlags.recommendationAdoptionV2 = true;
    recommendationAdoptions.adopt.mockResolvedValue({ adoptionId: 70 });

    await controller.adoptRecommendationInstance(
      'instance-1',
      { mode: 'activity', clientRequestId: 'request-1', activity: { publishPage: true } },
      '6',
      undefined,
      9,
    );

    expect(recommendationAdoptions.adopt).toHaveBeenCalledWith('instance-1', 6, {
      mode: 'activity', clientRequestId: 'request-1', activity: { publishPage: true },
    }, 9);
  });

  it('reports store-scoped recommendation rollout capabilities without touching v2 tables', () => {
    featureFlags.isEnabledForStore.mockImplementation(
      (flag: string, storeId: number) => storeId === 6 && ['recommendationInstanceRead', 'recommendationAdoptionV2'].includes(flag),
    );

    expect(controller.getRecommendationCapabilities('6')).toEqual(expect.objectContaining({
      recommendationInstanceRead: true,
      recommendationAdoptionV2: true,
      managementUiV2: true,
    }));
    expect(controller.getRecommendationCapabilities('7')).toEqual(expect.objectContaining({
      recommendationInstanceRead: false,
      recommendationAdoptionV2: false,
      managementUiV2: false,
    }));
    expect(recommendationQueries.findMany).not.toHaveBeenCalled();
  });

  it('returns one store-scoped workspace response for either legacy or v2 recommendations', async () => {
    recommendationQueries.findMany.mockResolvedValue({
      items: [{ recommendationInstanceId: 'instance-1' }],
      total: 1,
      page: 1,
      pageSize: 50,
      coverage: { totalCustomers: 1252, predictedCustomers: 1244 },
    });
    marketing.getRecommendations.mockResolvedValue([{ id: 1, title: '旧推荐', totalCustomers: 1252 }]);
    marketing.getRecommendationCoverage.mockResolvedValue({
      totalCustomers: 1252,
      predictedCustomers: 1244,
      coverageRate: 99.36,
      predictionRunId: 55,
      generatedAt: '2026-07-13T02:00:00.000Z',
      freshness: 'fresh',
    });
    featureFlags.isEnabledForStore.mockImplementation(
      (flag: string, storeId: number) => storeId === 6 && ['recommendationInstanceRead', 'recommendationAdoptionV2'].includes(flag),
    );

    await expect(controller.getRecommendationWorkspace('6', undefined, undefined, 'active', '1', '50', 'false'))
      .resolves.toEqual(expect.objectContaining({ mode: 'v2', total: 1 }));
    await expect(controller.getRecommendationWorkspace('7', undefined, undefined, 'active', '1', '50', 'false'))
      .resolves.toEqual(expect.objectContaining({
        mode: 'legacy',
        total: 1,
        coverage: expect.objectContaining({ totalCustomers: 1252, predictedCustomers: 1244 }),
      }));

    expect(recommendationQueries.findMany).toHaveBeenCalledTimes(1);
    expect(marketing.getRecommendations).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a store calls direct v2 routes outside its rollout scope', async () => {
    featureFlags.isEnabledForStore.mockReturnValue(false);

    await expect(Promise.resolve().then(() => controller.findRecommendationInstances('7')))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(Promise.resolve().then(() => controller.getRecommendationInstanceAudience('instance-1', '7')))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(Promise.resolve().then(() => controller.adoptRecommendationInstance(
      'instance-1',
      { mode: 'activity', clientRequestId: 'request-1', activity: { publishPage: true } },
      '7',
    ))).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(recommendationQueries.findMany).not.toHaveBeenCalled();
    expect(recommendationQueries.getAudience).not.toHaveBeenCalled();
    expect(recommendationAdoptions.adopt).not.toHaveBeenCalled();
  });

  it('forwards the legacy adoption endpoint only when the v2 flag is enabled', async () => {
    featureFlags.recommendationAdoptionV2 = true;
    recommendationAdoptions.resolveLegacyInstance.mockResolvedValue('instance-1');
    recommendationAdoptions.adopt.mockResolvedValue({ adoptionId: 70 });

    await controller.adoptRecommendationTransaction(1, {
      mode: 'automation', clientRequestId: 'legacy-request-1',
    }, '6', 9);

    expect(recommendationAdoptions.resolveLegacyInstance).toHaveBeenCalledWith(1, 6);
    expect(recommendationAdoptions.adopt).toHaveBeenCalledWith('instance-1', 6, {
      mode: 'automation', clientRequestId: 'legacy-request-1',
    }, 9);
  });

  it('forwards the legacy activity draft endpoint to an idempotent v2 adoption', async () => {
    featureFlags.recommendationAdoptionV2 = true;
    recommendationAdoptions.resolveLegacyInstance.mockResolvedValue('instance-1');
    recommendationAdoptions.adopt.mockResolvedValue({ adoptionId: 70 });

    await controller.createRecommendationActivityDraft(1, '6', 9);

    expect(recommendationAdoptions.adopt).toHaveBeenCalledWith('instance-1', 6, {
      mode: 'activity',
      clientRequestId: 'legacy-activity-draft-1',
      activity: { publishPage: false },
    }, 9);
  });
});
