import { describe, expect, it, vi, afterEach } from 'vitest';
import { createPaginatedResponse } from '@/types/pagination';

afterEach(() => {
  vi.doUnmock('@/api/real/customer');
  vi.doUnmock('@/api/real/inventory');
  vi.doUnmock('@/api/real/marketing');
  vi.doUnmock('@/api/real/terminal');
  vi.doUnmock('@/api/real/ai');
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('API contract helpers', () => {
  it('returns paginated responses with items and legacy data aliases', () => {
    const response = createPaginatedResponse([{ id: 1 }], 1, 1, 10);

    expect(response.items).toEqual([{ id: 1 }]);
    expect(response.data).toBe(response.items);
    expect(response.total).toBe(1);
    expect(response.page).toBe(1);
    expect(response.pageSize).toBe(10);
  });

  it('keeps the runtime API mode on real even when mock is requested', async () => {
    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.resetModules();

    const mode = await import('@/api/mode');

    expect(mode.apiMode).toBe('real');
    expect(mode.isRealApi).toBe(true);
    expect(mode.isMockApi).toBe(false);
  });
});

describe('API facades', () => {
  it('routes customer insight calls to the real implementation', async () => {
    const realGetCustomerConsumptionRecords = vi.fn(async () => [{ id: 1, customerId: 1001 }]);
    const realGetCustomerConsumptionRecordsPaginated = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realGetCustomerHealthProfiles = vi.fn(async () => [{ id: 2, customerId: 1001, skinType: 'dry' }]);
    const realGetCustomerMiniappBehaviorAnalysis = vi.fn(async () => ({ events: [], summary: {} }));
    const realGetCustomerSegmentCount = vi.fn(async () => ({ total: 0, segments: [] }));
    const realGetCustomerProfile = vi.fn(async () => ({ customerId: 1001, prediction: null }));
    const realGetCustomerProfileAnalytics = vi.fn(async () => ({ totalCustomers: 0, segmentStats: [] }));
    const realGetCustomerProfileAnalyticsOverview = vi.fn(async () => ({ totalCustomers: 0 }));
    const realGetCustomerProfileSegmentAnalytics = vi.fn(async () => ({ segments: [] }));
    const realGetCustomerProfileSkinAnalytics = vi.fn(async () => ({ skinTypes: [] }));
    const realGetCustomerProfileBehaviorAnalytics = vi.fn(async () => ({ items: [] }));
    const realGetCustomerProfilePredictionAnalytics = vi.fn(async () => ({ items: [] }));

    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.doMock('@/api/real/customer', () => ({
      realGetCustomers: vi.fn(),
      realGetCustomerById: vi.fn(),
      realGetCustomerProfile,
      realCreateCustomer: vi.fn(),
      realUpdateCustomer: vi.fn(),
      realGetCustomersPaginated: vi.fn(),
      realImportCustomers: vi.fn(),
      realDeleteCustomers: vi.fn(),
      realUpdateCustomerHealthProfile: vi.fn(),
      realGetCustomerConsumptionRecords,
      realGetCustomerConsumptionRecordsPaginated,
      realGetCustomerHealthProfiles,
      realGetCustomerMiniappBehaviorAnalysis,
      realGetCustomerProfileAnalytics,
      realGetCustomerProfileAnalyticsOverview,
      realGetCustomerProfileSegmentAnalytics,
      realGetCustomerProfileSkinAnalytics,
      realGetCustomerProfileBehaviorAnalytics,
      realGetCustomerProfilePredictionAnalytics,
      realGetCustomerSegmentCount,
    }));
    vi.resetModules();

    const api = await import('@/api/customer');

    await expect(api.getCustomerConsumptionRecords()).resolves.toEqual([{ id: 1, customerId: 1001 }]);
    await expect(api.getCustomerHealthProfiles()).resolves.toEqual([{ id: 2, customerId: 1001, skinType: 'dry' }]);
    await expect(api.getCustomerProfileAnalytics()).resolves.toEqual({ totalCustomers: 0, segmentStats: [] });
    expect(realGetCustomerConsumptionRecords).toHaveBeenCalledTimes(1);
    expect(realGetCustomerHealthProfiles).toHaveBeenCalledTimes(1);
    expect(realGetCustomerProfileAnalytics).toHaveBeenCalledTimes(1);
  });

  it('routes inventory transfer pagination to the real implementation', async () => {
    const realGetTransferOrdersPaginated = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));

    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.doMock('@/api/real/inventory', () => ({
      realGetStockItems: vi.fn(),
      realGetBatches: vi.fn(),
      realGetStockMovements: vi.fn(),
      realGetExpiringProducts: vi.fn(),
      realGetReplenishmentSuggestions: vi.fn(),
      realGetPurchaseOrders: vi.fn(),
      realCreateInbound: vi.fn(),
      realCreatePurchaseOrder: vi.fn(),
      realCreateTransfer: vi.fn(),
      realCancelPurchaseOrder: vi.fn(),
      realCancelTransfer: vi.fn(),
      realGetStockItemsPaginated: vi.fn(),
      realGetPurchaseOrdersPaginated: vi.fn(),
      realGetExpiringProductsPaginated: vi.fn(),
      realGetTransferOrdersPaginated,
    }));
    vi.resetModules();

    const api = await import('@/api/inventory');

    await api.getTransferOrdersPaginated({ page: 1, pageSize: 10 });
    expect(realGetTransferOrdersPaginated).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });

  it('routes marketing automation calls to the real implementation', async () => {
    const realGetAutomationTriggerOptions = vi.fn(async () => []);
    const realPreviewAutomationAudience = vi.fn(async () => ({ total: 0, samples: [], ruleRelation: 'AND' }));
    const realUpdateAutomationStrategy = vi.fn(async (_id, data) => ({ id: 1, ...data }));
    const realDeleteAutomationStrategy = vi.fn(async () => undefined);
    const realRecordCustomerBehaviorEvent = vi.fn(async (data) => ({ id: 1, ...data }));
    const realGetMarketingActivityById = vi.fn(async (id) => ({ id, title: '活动详情' }));
    const realGetInvitationCandidates = vi.fn(async () => ({ items: [], generatedAt: '2026-06-15T00:00:00.000Z', source: 'prediction' }));
    const realGetMarketingRuleTemplatesPaginated = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realCloneMarketingRuleTemplate = vi.fn(async (id) => ({ id, source: 'store' }));
    const realEnableMarketingRuleTemplate = vi.fn(async (id) => ({ strategy: { id: 10 }, preview: { total: 0, samples: [], ruleRelation: 'AND' }, template: { id } }));
    const realGetUnifiedMarketingEffects = vi.fn(async () => ({
      summary: { totalObjects: 0, exposureCount: 0, clickCount: 0, conversionCount: 0, revenue: 0, cost: 0, roi: '0' },
      items: [],
      emptyReasons: {},
    }));

    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.doMock('@/api/real/marketing', () => ({
      realGetMarketingActivities: vi.fn(),
      realGetMarketingActivityById,
      realCreateMarketingActivity: vi.fn(),
      realUpdateMarketingActivity: vi.fn(),
      realCreateStrategy: vi.fn(),
      realSaveStrategyDraft: vi.fn(),
      realGetStrategyEffects: vi.fn(),
      realGetAutomationStrategiesPaginated: vi.fn(),
      realCreateAutomationStrategy: vi.fn(),
      realSaveAutomationStrategyDraft: vi.fn(),
      realEnableAutomationStrategy: vi.fn(),
      realPauseAutomationStrategy: vi.fn(),
      realExecuteAutomationStrategy: vi.fn(),
      realGetAutomationExecutionsPaginated: vi.fn(),
      realGetAutomationExecutionById: vi.fn(),
      realGetAutomationEffects: vi.fn(),
      realGetUnifiedMarketingEffects,
      realRunPredictions: vi.fn(),
      realGetLatestPredictionSummary: vi.fn(),
      realGetPredictionCustomers: vi.fn(),
      realGetCustomerPrediction: vi.fn(),
      realGetInvitationCandidates,
      realRecordCustomerBehaviorEvent,
      realGetMarketingRuleTemplatesPaginated,
      realGetMarketingRuleTemplateById: vi.fn(),
      realCloneMarketingRuleTemplate,
      realCreateMarketingRuleTemplate: vi.fn(),
      realUpdateMarketingRuleTemplate: vi.fn(),
      realPreviewMarketingRuleTemplateAudience: vi.fn(),
      realEnableMarketingRuleTemplate,
      realDisableMarketingRuleTemplate: vi.fn(),
      realGetMarketingRuleTemplateEffects: vi.fn(),
      realBatchCreateMarketingFollowUpTasks: vi.fn(),
      realGetMarketingFollowUpTasks: vi.fn(),
      realGetMarketingFollowUpTaskSummary: vi.fn(),
      realAssignMarketingFollowUpTask: vi.fn(),
      realCancelMarketingFollowUpTask: vi.fn(),
      realGetAutomationTriggerOptions,
      realPreviewAutomationAudience,
      realUpdateAutomationStrategy,
      realDeleteAutomationStrategy,
    }));
    vi.resetModules();

    const api = await import('@/api/marketing');
    const payload = {
      name: '策略',
      description: '',
      executionType: 'auto' as const,
      schedule: { type: 'daily' as const, time: '09:00' },
      triggerRules: [],
      ruleRelation: 'AND' as const,
      actions: [],
    };

    await api.getAutomationTriggerOptions();
    await api.previewAutomationAudience('draft', { triggerRules: [], ruleRelation: 'AND' });
    await api.updateAutomationStrategy(1, payload);
    await api.deleteAutomationStrategy(1);
    await api.getMarketingActivityById(3);
    await api.recordCustomerBehaviorEvent({ storeId: 1, customerId: 2, eventType: 'miniapp_project_viewed' });
    await api.getInvitationCandidates({ limit: 10 });
    await api.getMarketingRuleTemplatesPaginated({ page: 1, pageSize: 10 });
    await api.cloneMarketingRuleTemplate(1);
    await api.enableMarketingRuleTemplate(1);

    expect(realGetAutomationTriggerOptions).toHaveBeenCalledTimes(1);
    expect(realPreviewAutomationAudience).toHaveBeenCalledWith('draft', { triggerRules: [], ruleRelation: 'AND' });
    expect(realUpdateAutomationStrategy).toHaveBeenCalledWith(1, payload);
    expect(realDeleteAutomationStrategy).toHaveBeenCalledWith(1);
    expect(realGetMarketingActivityById).toHaveBeenCalledWith(3);
    expect(realRecordCustomerBehaviorEvent).toHaveBeenCalledWith({ storeId: 1, customerId: 2, eventType: 'miniapp_project_viewed' });
    expect(realGetInvitationCandidates).toHaveBeenCalledWith({ limit: 10 });
    expect(realGetMarketingRuleTemplatesPaginated).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(realCloneMarketingRuleTemplate).toHaveBeenCalledWith(1);
    expect(realEnableMarketingRuleTemplate).toHaveBeenCalledWith(1);
  });

  it('routes terminal device calls to the real implementation', async () => {
    const realGetTerminalBootstrap = vi.fn(async () => ({ store: { id: 1 } }));
    const realGetTerminalManagerDashboard = vi.fn(async () => ({ title: 'manager' }));
    const realGetTerminalStaffSchedulesDashboard = vi.fn(async () => []);
    const realGetTerminalTodayReservationsDashboard = vi.fn(async () => ({ title: 'today' }));
    const realGetTerminalCustomerGrowthDashboard = vi.fn(async () => ({ items: [] }));
    const realGetTerminalCustomerGrowthCandidates = vi.fn(async () => []);
    const realGetTerminalInventoryAlertsDashboard = vi.fn(async () => ({ lowStock: [] }));
    const realGetTerminalCashierContext = vi.fn(async () => ({ customers: [], projects: [], products: [] }));
    const realGetTerminalCardVerificationContext = vi.fn(async () => ({ customers: [] }));
    const realGetTerminalBeauticianCommission = vi.fn(async () => ({ todayAmount: 0, monthAmount: 0, recentRecords: [] }));
    const realGetCurrentTerminalBeautician = vi.fn(async () => ({ id: 9, name: '美容师A' }));
    const realGetCurrentTerminalBeauticianDashboard = vi.fn(async () => ({ todayTasks: [] }));
    const realGetCurrentTerminalBeauticianTasks = vi.fn(async () => ({ items: [], total: 0 }));
    const realGetCurrentTerminalBeauticianCommission = vi.fn(async () => ({ todayAmount: 0, monthAmount: 0, recentRecords: [] }));
    const realGetCurrentTerminalBeauticianCustomers = vi.fn(async () => ({ items: [], total: 0 }));
    const realGetTerminalCurrentCashierShift = vi.fn(async () => null);
    const realOpenTerminalCashierShift = vi.fn(async (openingCash) => ({ id: 1, status: 'open', openingCash }));
    const realCloseTerminalCashierShift = vi.fn(async (shiftId, closingCash) => ({ id: shiftId ?? 1, status: 'closed', closingCash }));
    const realLoginTerminalDevice = vi.fn(async (req) => ({ token: 'real-token', ...req }));
    const realProvisionTerminalDevice = vi.fn(async (data) => ({ id: 1, activationCode: 'ACT-1001', ...data }));
    const realUpdateTerminalDevice = vi.fn(async (id, data) => ({ id, ...data }));
    const realDeleteTerminalDevice = vi.fn(async (id) => ({ success: true, id }));
    const realSaveTerminalConversation = vi.fn(async (data) => ({ id: 1, deviceId: 'AURA-1001', storeId: 1, ...data }));
    const realGetTerminalConversationHistory = vi.fn(async () => ({ items: [], data: [], total: 0, page: 1, pageSize: 30 }));
    const realGetTerminalConversationDetail = vi.fn(async (id) => ({ id, deviceId: 'AURA-1001', storeId: 1, messages: [] }));
    const realDeleteTerminalConversation = vi.fn(async (id) => ({ success: true, id }));

    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.doMock('@/api/real/terminal', () => ({
      realApproveTerminalDeviceUnbind: vi.fn(),
      realAdjustTerminalBalance: vi.fn(),
      realBindTerminalSkinTestCustomer: vi.fn(),
      realCancelTerminalServiceTask: vi.fn(),
      realCancelTerminalReservation: vi.fn(),
      realCompleteTerminalServiceTask: vi.fn(),
      realCompleteTerminalFollowUpTask: vi.fn(),
      realBatchCreateRecommendationFollowUpTasks: vi.fn(),
      realConsumeTerminalBalance: vi.fn(),
      realCreateTerminalConsumptionRecord: vi.fn(),
      realCreateTerminalCashierOrder: vi.fn(),
      realCreateTerminalCardOrder: vi.fn(),
      realCreateTerminalFollowUpTask: vi.fn(),
      realCreateTerminalPrintJob: vi.fn(),
      realCreateTerminalRechargeOrder: vi.fn(),
      realCreateTerminalReservation: vi.fn(),
      realCreateTerminalServiceRecord: vi.fn(),
      realCreateTerminalSkinTest: vi.fn(),
      realCreateTerminalTaskFromReservation: vi.fn(),
      realCheckInTerminalReservation: vi.fn(),
      realConfirmTerminalReservation: vi.fn(),
      realCompleteTerminalPayment: vi.fn(),
      realGetTerminalReservations: vi.fn(),
      realDisableTerminalDevice: vi.fn(),
      realGetTerminalBehaviorProfile: vi.fn(),
      realGetTerminalBom: vi.fn(),
      realGetTerminalCardUsageRecordsPaginated: vi.fn(),
      realGetTerminalCatalogSync: vi.fn(),
      realGetTerminalConfig: vi.fn(),
      realGetTerminalCustomerCards: vi.fn(),
      realGetTerminalCustomerBalance: vi.fn(),
      realGetTerminalCustomerSummary: vi.fn(),
      realGetTerminalCustomerConsumptionRecordsPaginated: vi.fn(),
      realGetTerminalCustomerHealthProfile: vi.fn(),
      realGetTerminalCustomerRecommendations: vi.fn(),
      realGetTerminalCustomerNextBestActions: vi.fn(),
      realGetTerminalCustomerGrowthCandidates,
      realGetTerminalFollowUpTasks: vi.fn(),
      realGetTerminalDeviceMe: vi.fn(),
      realGetTerminalDeviceStatus: vi.fn(),
      realGetTerminalDevicesPaginated: vi.fn(),
      realGetTerminalInventoryStock: vi.fn(),
      realGetTerminalInventoryAlerts: vi.fn(),
      realGetTerminalInventoryAlertsDashboard,
      realGetTerminalPromotions: vi.fn(),
      realGetTerminalPrintJobs: vi.fn(),
      realGetTerminalPrintJobStatus: vi.fn(),
      realGetTerminalReservationAvailability: vi.fn(),
      realGetTerminalRoleDashboard: vi.fn(),
      realGetTerminalManagerDashboard,
      realGetTerminalStaffSchedulesDashboard,
      realGetTerminalTodayReservationsDashboard,
      realGetTerminalCustomerGrowthDashboard,
      realGetTerminalCashierContext,
      realGetTerminalCardVerificationContext,
      realGetTerminalBeauticianCommission,
      realGetCurrentTerminalBeautician,
      realGetCurrentTerminalBeauticianDashboard,
      realGetCurrentTerminalBeauticianTasks,
      realGetCurrentTerminalBeauticianCommission,
      realGetCurrentTerminalBeauticianCustomers,
      realGetTerminalCurrentCashierShift,
      realOpenTerminalCashierShift,
      realCloseTerminalCashierShift,
      realGetTerminalAutomations: vi.fn(),
      realGetTerminalAutomationTemplates: vi.fn(),
      realCreateTerminalAutomationStrategy: vi.fn(),
      realPreviewTerminalAutomationStrategy: vi.fn(),
      realEnableTerminalAutomationStrategy: vi.fn(),
      realPauseTerminalAutomationStrategy: vi.fn(),
      realRunTerminalAutomationOnce: vi.fn(),
      realRunDueTerminalAutomations: vi.fn(),
      realGetTerminalAutomationTodaySummary: vi.fn(),
      realGetTerminalAutomationExecutionDetail: vi.fn(),
      realSaveTerminalConversation,
      realGetTerminalConversationHistory,
      realGetTerminalConversationDetail,
      realDeleteTerminalConversation,
      realMarkTerminalAutomationTouchFollowedUp: vi.fn(),
      realGetTerminalServiceRecord: vi.fn(),
      realGetTerminalServiceTaskById: vi.fn(),
      realGetTerminalServiceTasks: vi.fn(),
      realGetTerminalSkinTestById: vi.fn(),
      realGetTerminalSkinTestRecommendations: vi.fn(),
      realGetTerminalSkinTests: vi.fn(),
      realMarkTerminalReservationNoShow: vi.fn(),
      realPreviewTerminalCardUsage: vi.fn(),
      realQuickCreateTerminalCustomer: vi.fn(),
      realRecordTerminalRecommendationEvent: vi.fn(),
      realRequestTerminalDeviceUnbind: vi.fn(),
      realRefundTerminalBalance: vi.fn(),
      realRescheduleTerminalReservation: vi.fn(),
      realRetryTerminalPrintJob: vi.fn(),
      realReturnTerminalFollowUpTask: vi.fn(),
      realSearchTerminalCustomers: vi.fn(),
      realStartTerminalFollowUpTask: vi.fn(),
      realStartTerminalServiceTask: vi.fn(),
      realTransferTerminalTaskToCashier: vi.fn(),
      realUpdateTerminalCustomerHealthProfile: vi.fn(),
      realUpdateTerminalPrintJobStatus: vi.fn(),
      realUpdateTerminalReservation: vi.fn(),
      realUpdateTerminalServiceRecord: vi.fn(),
      realVerifyTerminalCardUsage: vi.fn(),
      realHeartbeatTerminalDevice: vi.fn(),
      realGetTerminalBootstrap,
      realLoginTerminalDevice,
      realProvisionTerminalDevice,
      realUpdateTerminalDevice,
      realDeleteTerminalDevice,
    }));
    vi.resetModules();

    const api = await import('@/api/terminal');

    await api.getTerminalBootstrap();
    await api.getTerminalManagerDashboard();
    await api.getTerminalStaffSchedulesDashboard();
    await api.getTerminalTodayReservationsDashboard();
    await api.getTerminalCustomerGrowthDashboard();
    await api.getTerminalInventoryAlertsDashboard();
    await api.getTerminalCashierContext();
    await api.getTerminalCardVerificationContext({ keyword: '王' });
    await api.getTerminalBeauticianCommission(9);
    await api.getCurrentTerminalBeautician({ operatorId: 9 });
    await api.getCurrentTerminalBeauticianDashboard({ operatorId: 9 });
    await api.getCurrentTerminalBeauticianTasks({ operatorId: 9, status: 'pending' });
    await api.getCurrentTerminalBeauticianCommission({ operatorId: 9 });
    await api.getCurrentTerminalBeauticianCustomers({ operatorId: 9, keyword: '王' });
    await api.getTerminalCurrentCashierShift();
    await api.openTerminalCashierShift(100);
    await api.closeTerminalCashierShift(1, 300);
    await api.loginTerminalDevice({ deviceCode: 'AURA-1001', activationCode: 'ACT-1001' });
    await api.provisionTerminalDevice({ storeId: 1, name: 'Ami Aura Lite' });
    await api.deleteTerminalDevice(1);
    await api.updateTerminalDevice(1, { name: '新设备名' });
    await api.saveTerminalConversation({
      role: 'reception',
      date: '2026-06-08',
      messages: [{ role: 'user', content: '查客户张三', timestamp: 1 }],
    });
    await api.getTerminalConversationHistory({ days: 30 });
    await api.getTerminalConversationDetail(1);
    await api.deleteTerminalConversation(1);

    expect(realGetTerminalBootstrap).toHaveBeenCalledTimes(1);
    expect(realGetTerminalManagerDashboard).toHaveBeenCalledTimes(1);
    expect(realGetTerminalStaffSchedulesDashboard).toHaveBeenCalledTimes(1);
    expect(realGetTerminalTodayReservationsDashboard).toHaveBeenCalledTimes(1);
    expect(realGetTerminalCustomerGrowthDashboard).toHaveBeenCalledTimes(1);
    expect(realGetTerminalInventoryAlertsDashboard).toHaveBeenCalledTimes(1);
    expect(realGetTerminalCashierContext).toHaveBeenCalledTimes(1);
    expect(realGetTerminalCardVerificationContext).toHaveBeenCalledWith({ keyword: '王' });
    expect(realGetTerminalBeauticianCommission).toHaveBeenCalledWith(9);
    expect(realGetCurrentTerminalBeautician).toHaveBeenCalledWith({ operatorId: 9 });
    expect(realGetCurrentTerminalBeauticianDashboard).toHaveBeenCalledWith({ operatorId: 9 });
    expect(realGetCurrentTerminalBeauticianTasks).toHaveBeenCalledWith({ operatorId: 9, status: 'pending' });
    expect(realGetCurrentTerminalBeauticianCommission).toHaveBeenCalledWith({ operatorId: 9 });
    expect(realGetCurrentTerminalBeauticianCustomers).toHaveBeenCalledWith({ operatorId: 9, keyword: '王' });
    expect(realGetTerminalCurrentCashierShift).toHaveBeenCalledTimes(1);
    expect(realOpenTerminalCashierShift).toHaveBeenCalledWith(100);
    expect(realCloseTerminalCashierShift).toHaveBeenCalledWith(1, 300);
    expect(realLoginTerminalDevice).toHaveBeenCalledWith({ deviceCode: 'AURA-1001', activationCode: 'ACT-1001' });
    expect(realProvisionTerminalDevice).toHaveBeenCalledWith({ storeId: 1, name: 'Ami Aura Lite' });
    expect(realDeleteTerminalDevice).toHaveBeenCalledWith(1);
    expect(realUpdateTerminalDevice).toHaveBeenCalledWith(1, { name: '新设备名' });
    expect(realSaveTerminalConversation).toHaveBeenCalledWith({
      role: 'reception',
      date: '2026-06-08',
      messages: [{ role: 'user', content: '查客户张三', timestamp: 1 }],
    });
    expect(realGetTerminalConversationHistory).toHaveBeenCalledWith({ days: 30 });
    expect(realGetTerminalConversationDetail).toHaveBeenCalledWith(1);
    expect(realDeleteTerminalConversation).toHaveBeenCalledWith(1);
  });

  it('routes AI generation calls to the real implementation', async () => {
    const realSendAiChatMessage = vi.fn(async () => ({ id: 'real-chat', text: 'ok' }));
    const realStreamAiChatMessage = vi.fn(async function* () {
      yield 'ok';
    });
    const realGenerateMarketingCopy = vi.fn(async () => ({ id: 'real-copy', text: 'ok' }));
    const realRecommendNextBestAction = vi.fn(async () => ({ id: 'real-action', text: 'ok' }));

    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.doMock('@/api/real/ai', () => ({
      realGenerateCampaignVariants: vi.fn(),
      realGenerateCustomerInvitationScript: vi.fn(),
      realGenerateCustomerSummary: vi.fn(),
      realGenerateActivityPage: vi.fn(),
      realGenerateServiceNoteSummary: vi.fn(),
      realAnalyzeSkinPhoto: vi.fn(),
      realGenerateSkinTestExplanation: vi.fn(),
      realGenerateTerminalServiceAdvice: vi.fn(),
      realResolveTerminalIntent: vi.fn(),
      realGetAiAuditLogsPaginated: vi.fn(),
      realGetAiAuditSummary: vi.fn(),
      realSendAiChatMessage,
      realStreamAiChatMessage,
      realGenerateMarketingCopy,
      realRecommendNextBestAction,
    }));
    vi.resetModules();

    const api = await import('@/api/ai');

    await api.sendAiChatMessage({ messages: [{ role: 'user', content: 'hello' }] });
    const streamChunks: string[] = [];
    for await (const chunk of api.streamAiChatMessage({ messages: [{ role: 'user', content: 'stream' }] })) {
      streamChunks.push(chunk);
    }
    await api.generateMarketingCopy({ channel: 'wechat', campaignName: '活动' });
    await api.recommendNextBestAction({ customerId: 1 });

    expect(realSendAiChatMessage).toHaveBeenCalledWith({ messages: [{ role: 'user', content: 'hello' }] });
    expect(realStreamAiChatMessage).toHaveBeenCalledWith({ messages: [{ role: 'user', content: 'stream' }] });
    expect(streamChunks).toEqual(['ok']);
    expect(realGenerateMarketingCopy).toHaveBeenCalledWith({ channel: 'wechat', campaignName: '活动' });
    expect(realRecommendNextBestAction).toHaveBeenCalledWith({ customerId: 1 });
  });
});
