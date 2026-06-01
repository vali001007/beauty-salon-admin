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
    const realGetCustomerHealthProfiles = vi.fn(async () => [{ id: 2, customerId: 1001, skinType: 'dry' }]);

    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.doMock('@/api/real/customer', () => ({
      realGetCustomers: vi.fn(),
      realGetCustomerById: vi.fn(),
      realCreateCustomer: vi.fn(),
      realUpdateCustomer: vi.fn(),
      realGetCustomersPaginated: vi.fn(),
      realImportCustomers: vi.fn(),
      realDeleteCustomers: vi.fn(),
      realUpdateCustomerHealthProfile: vi.fn(),
      realGetCustomerConsumptionRecords,
      realGetCustomerHealthProfiles,
    }));
    vi.resetModules();

    const api = await import('@/api/customer');

    await expect(api.getCustomerConsumptionRecords()).resolves.toEqual([{ id: 1, customerId: 1001 }]);
    await expect(api.getCustomerHealthProfiles()).resolves.toEqual([{ id: 2, customerId: 1001, skinType: 'dry' }]);
    expect(realGetCustomerConsumptionRecords).toHaveBeenCalledTimes(1);
    expect(realGetCustomerHealthProfiles).toHaveBeenCalledTimes(1);
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

    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.doMock('@/api/real/marketing', () => ({
      realGetMarketingActivities: vi.fn(),
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
      realRunPredictions: vi.fn(),
      realGetLatestPredictionSummary: vi.fn(),
      realGetPredictionCustomers: vi.fn(),
      realGetCustomerPrediction: vi.fn(),
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

    expect(realGetAutomationTriggerOptions).toHaveBeenCalledTimes(1);
    expect(realPreviewAutomationAudience).toHaveBeenCalledWith('draft', { triggerRules: [], ruleRelation: 'AND' });
    expect(realUpdateAutomationStrategy).toHaveBeenCalledWith(1, payload);
    expect(realDeleteAutomationStrategy).toHaveBeenCalledWith(1);
  });

  it('routes terminal device calls to the real implementation', async () => {
    const realGetTerminalBootstrap = vi.fn(async () => ({ store: { id: 1 } }));
    const realLoginTerminalDevice = vi.fn(async (req) => ({ token: 'real-token', ...req }));
    const realUpdateTerminalDevice = vi.fn(async (id, data) => ({ id, ...data }));

    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.doMock('@/api/real/terminal', () => ({
      realApproveTerminalDeviceUnbind: vi.fn(),
      realBindTerminalSkinTestCustomer: vi.fn(),
      realCancelTerminalServiceTask: vi.fn(),
      realCancelTerminalReservation: vi.fn(),
      realCompleteTerminalServiceTask: vi.fn(),
      realCreateTerminalConsumptionRecord: vi.fn(),
      realCreateTerminalCashierOrder: vi.fn(),
      realCreateTerminalCardOrder: vi.fn(),
      realCreateTerminalPrintJob: vi.fn(),
      realCreateTerminalRechargeOrder: vi.fn(),
      realCreateTerminalReservation: vi.fn(),
      realCreateTerminalSkinTest: vi.fn(),
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
      realGetTerminalCustomerSummary: vi.fn(),
      realGetTerminalCustomerConsumptionRecordsPaginated: vi.fn(),
      realGetTerminalCustomerHealthProfile: vi.fn(),
      realGetTerminalCustomerRecommendations: vi.fn(),
      realGetTerminalDeviceMe: vi.fn(),
      realGetTerminalDevicesPaginated: vi.fn(),
      realGetTerminalInventoryStock: vi.fn(),
      realGetTerminalInventoryAlerts: vi.fn(),
      realGetTerminalPromotions: vi.fn(),
      realGetTerminalPrintJobStatus: vi.fn(),
      realGetTerminalRoleDashboard: vi.fn(),
      realGetTerminalServiceTaskById: vi.fn(),
      realGetTerminalServiceTasks: vi.fn(),
      realGetTerminalSkinTestById: vi.fn(),
      realGetTerminalSkinTestRecommendations: vi.fn(),
      realGetTerminalSkinTests: vi.fn(),
      realPreviewTerminalCardUsage: vi.fn(),
      realQuickCreateTerminalCustomer: vi.fn(),
      realRecordTerminalRecommendationEvent: vi.fn(),
      realRequestTerminalDeviceUnbind: vi.fn(),
      realSearchTerminalCustomers: vi.fn(),
      realStartTerminalServiceTask: vi.fn(),
      realUpdateTerminalCustomerHealthProfile: vi.fn(),
      realUpdateTerminalReservation: vi.fn(),
      realVerifyTerminalCardUsage: vi.fn(),
      realHeartbeatTerminalDevice: vi.fn(),
      realGetTerminalBootstrap,
      realLoginTerminalDevice,
      realUpdateTerminalDevice,
    }));
    vi.resetModules();

    const api = await import('@/api/terminal');

    await api.getTerminalBootstrap();
    await api.loginTerminalDevice({ deviceCode: 'AURA-1001', activationCode: 'ACT-1001' });
    await api.updateTerminalDevice(1, { name: '新设备名' });

    expect(realGetTerminalBootstrap).toHaveBeenCalledTimes(1);
    expect(realLoginTerminalDevice).toHaveBeenCalledWith({ deviceCode: 'AURA-1001', activationCode: 'ACT-1001' });
    expect(realUpdateTerminalDevice).toHaveBeenCalledWith(1, { name: '新设备名' });
  });

  it('routes AI generation calls to the real implementation', async () => {
    const realSendAiChatMessage = vi.fn(async () => ({ id: 'real-chat', text: 'ok' }));
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
      realSendAiChatMessage,
      realGenerateMarketingCopy,
      realRecommendNextBestAction,
    }));
    vi.resetModules();

    const api = await import('@/api/ai');

    await api.sendAiChatMessage({ messages: [{ role: 'user', content: 'hello' }] });
    await api.generateMarketingCopy({ channel: 'wechat', campaignName: '活动' });
    await api.recommendNextBestAction({ customerId: 1 });

    expect(realSendAiChatMessage).toHaveBeenCalledWith({ messages: [{ role: 'user', content: 'hello' }] });
    expect(realGenerateMarketingCopy).toHaveBeenCalledWith({ channel: 'wechat', campaignName: '活动' });
    expect(realRecommendNextBestAction).toHaveBeenCalledWith({ customerId: 1 });
  });
});
