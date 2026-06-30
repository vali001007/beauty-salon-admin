import { describe, expect, it, vi, afterEach } from 'vitest';
import { createPaginatedResponse } from '@/types/pagination';

afterEach(() => {
  vi.doUnmock('@/api/real/order');
  vi.doUnmock('@/api/real/customer');
  vi.doUnmock('@/api/real/inventory');
  vi.doUnmock('@/api/real/marketing');
  vi.doUnmock('@/api/real/terminal');
  vi.doUnmock('@/api/real/ai');
  vi.doUnmock('@/api/real/agent');
  vi.doUnmock('@/api/real/operationProfit');
  vi.doUnmock('@/api/real/supplyPlatform');
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
  it('routes project order profit calls to the real implementation', async () => {
    const realGetProjectOrderProfit = vi.fn(async (id) => ({ orderId: id, totalIncome: 680 }));

    vi.doMock('@/api/real/order', () => ({
      realGetProductOrders: vi.fn(),
      realGetProductOrderById: vi.fn(),
      realCreateProductOrder: vi.fn(),
      realUpdateProductOrder: vi.fn(),
      realDeleteProductOrder: vi.fn(),
      realRefundProductOrder: vi.fn(),
      realGetProductOrderProfit: vi.fn(),
      realGetProjectOrders: vi.fn(),
      realGetProjectOrderById: vi.fn(),
      realGetProjectOrderProfit,
      realCreateProjectOrder: vi.fn(),
      realGetProductOrdersPaginated: vi.fn(),
      realGetProjectOrdersPaginated: vi.fn(),
    }));
    vi.resetModules();

    const api = await import('@/api/order');

    await expect(api.getProjectOrderProfit(501)).resolves.toEqual({ orderId: 501, totalIncome: 680 });
    expect(realGetProjectOrderProfit).toHaveBeenCalledWith(501);
  });

  it('routes operation profit calls to the real implementation', async () => {
    const realGetOperationProfitOverview = vi.fn(async (params) => ({ period: params, summary: {} }));
    const realGetProductMargins = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realGetProjectMargins = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realGetPrepaidLiabilities = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realGetBeauticianPerformance = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realGetOperationCosts = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realCreateOperationCost = vi.fn(async (data) => ({ id: 1, ...data }));
    const realUpdateOperationCost = vi.fn(async (id, data) => ({ id, ...data }));
    const realDeleteOperationCost = vi.fn(async (id) => ({ success: true, id }));
    const realCopyOperationCostsFromPreviousMonth = vi.fn(async (data) => ({ items: [], data: [], total: 0, ...data }));

    vi.doMock('@/api/real/operationProfit', () => ({
      realGetOperationProfitOverview,
      realGetProductMargins,
      realGetProjectMargins,
      realGetPrepaidLiabilities,
      realGetBeauticianPerformance,
      realGetOperationCosts,
      realCreateOperationCost,
      realUpdateOperationCost,
      realDeleteOperationCost,
      realCopyOperationCostsFromPreviousMonth,
    }));
    vi.resetModules();

    const api = await import('@/api/operationProfit');

    await api.getOperationProfitOverview({ from: '2026-06-01', to: '2026-06-30', basis: 'operating' });
    await api.getProductMargins({ page: 1, pageSize: 20, from: '2026-06-01', to: '2026-06-30', sortBy: 'grossProfit' });
    await api.getProjectMargins({ page: 1, pageSize: 20, from: '2026-06-01', to: '2026-06-30' });
    await api.getPrepaidLiabilities({ page: 1, pageSize: 20, riskOnly: true });
    await api.getBeauticianPerformance({ from: '2026-06-01', to: '2026-06-30' });
    await api.getOperationCosts({ page: 1, pageSize: 50, periodMonth: '2026-06' });
    await api.createOperationCost({ periodMonth: '2026-06', costDate: '2026-06-01', category: 'rent', amount: 1000 });
    await api.updateOperationCost(1, { amount: 1200 });
    await api.deleteOperationCost(1);
    await api.copyOperationCostsFromPreviousMonth({ fromPeriodMonth: '2026-05', toPeriodMonth: '2026-06' });

    expect(realGetOperationProfitOverview).toHaveBeenCalledWith({ from: '2026-06-01', to: '2026-06-30', basis: 'operating' });
    expect(realGetProductMargins).toHaveBeenCalledWith({ page: 1, pageSize: 20, from: '2026-06-01', to: '2026-06-30', sortBy: 'grossProfit' });
    expect(realGetProjectMargins).toHaveBeenCalledWith({ page: 1, pageSize: 20, from: '2026-06-01', to: '2026-06-30' });
    expect(realGetPrepaidLiabilities).toHaveBeenCalledWith({ page: 1, pageSize: 20, riskOnly: true });
    expect(realGetBeauticianPerformance).toHaveBeenCalledWith({ from: '2026-06-01', to: '2026-06-30' });
    expect(realGetOperationCosts).toHaveBeenCalledWith({ page: 1, pageSize: 50, periodMonth: '2026-06' });
    expect(realCreateOperationCost).toHaveBeenCalledWith({ periodMonth: '2026-06', costDate: '2026-06-01', category: 'rent', amount: 1000 });
    expect(realUpdateOperationCost).toHaveBeenCalledWith(1, { amount: 1200 });
    expect(realDeleteOperationCost).toHaveBeenCalledWith(1);
    expect(realCopyOperationCostsFromPreviousMonth).toHaveBeenCalledWith({ fromPeriodMonth: '2026-05', toPeriodMonth: '2026-06' });
  });

  it('routes supply platform calls to the real implementation', async () => {
    const realGetSupplySuppliers = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realCreateSupplySupplier = vi.fn(async (data) => ({ id: 1, qualificationStatus: 'pending', status: 'active', ...data }));
    const realUpdateSupplySupplierStatus = vi.fn(async (id, data) => ({ id, name: '供应商', ...data }));
    const realCreateSupplierQualification = vi.fn(async (data) => ({ id: 11, status: 'pending', ...data }));
    const realGetSupplySkus = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realCreateSupplySku = vi.fn(async (data) => ({ id: 2, status: 'draft', auditStatus: 'draft', ...data }));
    const realAuditSupplySku = vi.fn(async (id, data) => ({ id, supplierId: 1, name: 'SKU', ...data }));
    const realGetSupplyQuotes = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realCreateSupplyQuote = vi.fn(async (data) => ({ id: 3, status: 'draft', auditStatus: 'draft', ...data }));
    const realAuditSupplyQuote = vi.fn(async (id, data) => ({ id, supplySkuId: 2, supplierId: 1, ...data }));
    const realGetProcurementOrders = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realGetProcurementOrder = vi.fn(async (id) => ({ id, orderNo: 'SP-1', storeId: 1, supplierId: 1, status: 'shipped', totalAmount: 10, platformFee: 0, rebateAmount: 0, netAmount: 10, sourceType: 'replenishment', items: [], shipments: [] }));
    const realCreateProcurementOrder = vi.fn(async (data) => ({ id: 4, orderNo: 'SP-2', status: 'pending_supplier_confirm', totalAmount: 10, platformFee: 0, rebateAmount: 0, netAmount: 10, items: [], ...data }));
    const realUpdateProcurementOrderStatus = vi.fn(async (id, status) => ({ id, status }));
    const realCreateSupplierShipment = vi.fn(async (id, data) => ({ id: 5, orderId: id, supplierId: 1, shipmentNo: 'SH-1', status: 'shipped', items: [], ...data }));
    const realReceiveProcurementOrder = vi.fn(async (id, data) => ({ id, orderNo: 'SP-1', storeId: 1, supplierId: 1, status: 'received', totalAmount: 10, platformFee: 0, rebateAmount: 0, netAmount: 10, sourceType: 'replenishment', items: [], shipments: [], receipt: data }));
    const realGetSupplySettlements = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realGenerateSupplySettlement = vi.fn(async (data) => ({ id: 6, supplierId: 1, orderCount: 0, totalAmount: 0, rebateAmount: 0, platformFee: 0, adjustmentAmount: 0, netPayable: 0, status: 'draft', ...data }));

    vi.doMock('@/api/real/supplyPlatform', () => ({
      realGetSupplySuppliers,
      realCreateSupplySupplier,
      realUpdateSupplySupplierStatus,
      realCreateSupplierQualification,
      realGetSupplySkus,
      realCreateSupplySku,
      realAuditSupplySku,
      realGetSupplyQuotes,
      realCreateSupplyQuote,
      realAuditSupplyQuote,
      realGetProcurementOrders,
      realGetProcurementOrder,
      realCreateProcurementOrder,
      realUpdateProcurementOrderStatus,
      realCreateSupplierShipment,
      realReceiveProcurementOrder,
      realGetSupplySettlements,
      realGenerateSupplySettlement,
    }));
    vi.resetModules();

    const api = await import('@/api/supplyPlatform');

    await api.getSupplySuppliers({ page: 1, pageSize: 10 });
    await api.createSupplySupplier({ name: 'A 供应商' });
    await api.updateSupplySupplierStatus(1, { status: 'active', qualificationStatus: 'approved' });
    await api.createSupplierQualification({ supplierId: 1, type: '营业执照', fileUrl: 'https://example.com/license.pdf' });
    await api.getSupplySkus({ supplierId: 1 });
    await api.createSupplySku({ supplierId: 1, name: '洁面乳' });
    await api.auditSupplySku(2, { auditStatus: 'approved', status: 'active' });
    await api.getSupplyQuotes({ supplierId: 1, availableOnly: true });
    await api.createSupplyQuote({ supplySkuId: 2, supplierId: 1, price: 88 });
    await api.auditSupplyQuote(3, { auditStatus: 'approved', status: 'active' });
    await api.getProcurementOrders({ page: 1, pageSize: 10, storeId: 1 });
    await api.getProcurementOrder(4);
    await api.createProcurementOrder({ storeId: 1, supplierId: 1, items: [{ supplySkuId: 2, quantity: 1 }] });
    await api.updateProcurementOrderStatus(4, 'accepted');
    await api.createSupplierShipment(4, { items: [{ orderItemId: 1, supplySkuId: 2, shippedQty: 1 }] });
    await api.receiveProcurementOrder(4, { items: [{ shipmentItemId: 1, receivedQty: 1 }] });
    await api.getSupplySettlements({ page: 1, pageSize: 10 });
    await api.generateSupplySettlement({ settleMonth: '2026-06' });

    expect(realGetSupplySuppliers).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(realCreateSupplySupplier).toHaveBeenCalledWith({ name: 'A 供应商' });
    expect(realUpdateSupplySupplierStatus).toHaveBeenCalledWith(1, { status: 'active', qualificationStatus: 'approved' });
    expect(realCreateSupplierQualification).toHaveBeenCalledWith({ supplierId: 1, type: '营业执照', fileUrl: 'https://example.com/license.pdf' });
    expect(realGetSupplySkus).toHaveBeenCalledWith({ supplierId: 1 });
    expect(realCreateSupplySku).toHaveBeenCalledWith({ supplierId: 1, name: '洁面乳' });
    expect(realAuditSupplySku).toHaveBeenCalledWith(2, { auditStatus: 'approved', status: 'active' });
    expect(realGetSupplyQuotes).toHaveBeenCalledWith({ supplierId: 1, availableOnly: true });
    expect(realCreateSupplyQuote).toHaveBeenCalledWith({ supplySkuId: 2, supplierId: 1, price: 88 });
    expect(realAuditSupplyQuote).toHaveBeenCalledWith(3, { auditStatus: 'approved', status: 'active' });
    expect(realGetProcurementOrders).toHaveBeenCalledWith({ page: 1, pageSize: 10, storeId: 1 });
    expect(realGetProcurementOrder).toHaveBeenCalledWith(4);
    expect(realCreateProcurementOrder).toHaveBeenCalledWith({ storeId: 1, supplierId: 1, items: [{ supplySkuId: 2, quantity: 1 }] });
    expect(realUpdateProcurementOrderStatus).toHaveBeenCalledWith(4, 'accepted');
    expect(realCreateSupplierShipment).toHaveBeenCalledWith(4, { items: [{ orderItemId: 1, supplySkuId: 2, shippedQty: 1 }] });
    expect(realReceiveProcurementOrder).toHaveBeenCalledWith(4, { items: [{ shipmentItemId: 1, receivedQty: 1 }] });
    expect(realGetSupplySettlements).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(realGenerateSupplySettlement).toHaveBeenCalledWith({ settleMonth: '2026-06' });
  });

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
    const realGetCustomerCardPortraits = vi.fn(async () => ({ items: [], data: [], total: 0 }));

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
      realGetCustomerCardPortraits,
      realGetCustomerSegmentCount,
    }));
    vi.resetModules();

    const api = await import('@/api/customer');

    await expect(api.getCustomerConsumptionRecords()).resolves.toEqual([{ id: 1, customerId: 1001 }]);
    await expect(api.getCustomerHealthProfiles()).resolves.toEqual([{ id: 2, customerId: 1001, skinType: 'dry' }]);
    await expect(api.getCustomerProfileAnalytics()).resolves.toEqual({ totalCustomers: 0, segmentStats: [] });
    await expect(api.getCustomerCardPortraits({ page: 1, pageSize: 20 })).resolves.toEqual({ items: [], data: [], total: 0 });
    expect(realGetCustomerConsumptionRecords).toHaveBeenCalledTimes(1);
    expect(realGetCustomerHealthProfiles).toHaveBeenCalledTimes(1);
    expect(realGetCustomerProfileAnalytics).toHaveBeenCalledTimes(1);
    expect(realGetCustomerCardPortraits).toHaveBeenCalledTimes(1);
  });

  it('routes inventory transfer pagination to the real implementation', async () => {
    const realGetTransferOrdersPaginated = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const realCreateInventoryAdjustment = vi.fn(async (data) => ({ id: 1, ...data }));
    const realGetExpirySummary = vi.fn(async (params) => ({ period: params.period, expiringBatchCount: 0 }));
    const realGetTransferSuggestions = vi.fn(async () => [{ id: '1-2-SKU', sku: 'SKU' }]);

    vi.stubEnv('VITE_API_MODE', 'mock');
    vi.doMock('@/api/real/inventory', () => ({
      realGetStockItems: vi.fn(),
      realGetBatches: vi.fn(),
      realGetStockMovements: vi.fn(),
      realGetExpiringProducts: vi.fn(),
      realGetExpirySummary,
      realGetReplenishmentSuggestions: vi.fn(),
      realGetPurchaseOrders: vi.fn(),
      realCreateInbound: vi.fn(),
      realCreateInventoryAdjustment,
      realCreatePurchaseOrder: vi.fn(),
      realUpdatePurchaseOrderStatus: vi.fn(),
      realReceivePurchaseOrder: vi.fn(),
      realCreateTransfer: vi.fn(),
      realGetTransferSuggestions,
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
    await api.createInventoryAdjustment({ productId: 10, adjustmentType: 'manual_outbound', quantity: 2 });
    await api.getExpirySummary({ period: '90d' });
    await api.getTransferSuggestions();
    expect(realGetTransferOrdersPaginated).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(realCreateInventoryAdjustment).toHaveBeenCalledWith({ productId: 10, adjustmentType: 'manual_outbound', quantity: 2 });
    expect(realGetExpirySummary).toHaveBeenCalledWith({ period: '90d' });
    expect(realGetTransferSuggestions).toHaveBeenCalledTimes(1);
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
    const realGetTerminalCustomerSelectContext = vi.fn(async () => ({ items: [], scene: 'follow_up' }));
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
      realGetTerminalCustomerSelectContext,
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
    await api.getTerminalCustomerSelectContext({ scene: 'follow_up', operatorId: 9, keyword: '罗' });
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
    expect(realGetTerminalCustomerSelectContext).toHaveBeenCalledWith({ scene: 'follow_up', operatorId: 9, keyword: '罗' });
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

  it('routes Agent Gateway calls to the real implementation', async () => {
    const createAgentRun = vi.fn(async (data) => ({
      runId: 1,
      runNo: 'AG202606160001',
      status: 'completed',
      answer: 'ok',
      toolResults: [],
      actions: [],
      ...data,
    }));
    const getAgentRun = vi.fn(async (id) => ({ runId: id, runNo: 'AG202606160001', status: 'completed' }));
    const appendAgentMessage = vi.fn(async (id, data) => ({ runId: id, answer: data.message }));
    const getAgentTools = vi.fn(async () => [{ name: 'business.query.ask' }]);
    const runDefaultAgentEvals = vi.fn(async () => ({ total: 1, passed: 1, failed: 0, results: [] }));
    const getAgentRunsPaginated = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const getAgentRunDetail = vi.fn(async (id) => ({ run: { id, runNo: 'AG202606160001' }, messages: [], steps: [], toolCalls: [], approvals: [] }));
    const getAgentApprovalsPaginated = vi.fn(async (params) => ({ items: [], data: [], total: 0, ...params }));
    const approveAgentApproval = vi.fn(async (id, data) => ({ runId: 1, approval: { id, status: 'approved' }, ...data }));
    const rejectAgentApproval = vi.fn(async (id, data) => ({ runId: 1, approval: { id, status: 'rejected' }, ...data }));

    vi.doMock('@/api/real/agent', () => ({
      createAgentRun,
      getAgentRun,
      appendAgentMessage,
      getAgentTools,
      runDefaultAgentEvals,
      getAgentRunsPaginated,
      getAgentRunDetail,
      getAgentApprovalsPaginated,
      approveAgentApproval,
      rejectAgentApproval,
    }));
    vi.resetModules();

    const api = await import('@/api/agent');

    await api.createAgentRun({ message: '有哪些商品适合做活动', role: 'manager', entrypoint: 'web_app' });
    await api.getAgentRun(1);
    await api.appendAgentMessage(1, { message: '帮我生成活动草稿' });
    await api.getAgentTools();
    await api.runDefaultAgentEvals();
    await api.getAgentRunsPaginated({ page: 1, pageSize: 10, status: 'completed' });
    await api.getAgentRunDetail(1);
    await api.getAgentApprovalsPaginated({ page: 1, pageSize: 10, status: 'pending' });
    await api.approveAgentApproval(301, { comment: '确认生成草稿' });
    await api.rejectAgentApproval(302, { comment: '暂不执行' });

    expect(createAgentRun).toHaveBeenCalledWith({
      message: '有哪些商品适合做活动',
      role: 'manager',
      entrypoint: 'web_app',
    });
    expect(getAgentRun).toHaveBeenCalledWith(1);
    expect(appendAgentMessage).toHaveBeenCalledWith(1, { message: '帮我生成活动草稿' });
    expect(getAgentTools).toHaveBeenCalledTimes(1);
    expect(runDefaultAgentEvals).toHaveBeenCalledTimes(1);
    expect(getAgentRunsPaginated).toHaveBeenCalledWith({ page: 1, pageSize: 10, status: 'completed' });
    expect(getAgentRunDetail).toHaveBeenCalledWith(1);
    expect(getAgentApprovalsPaginated).toHaveBeenCalledWith({ page: 1, pageSize: 10, status: 'pending' });
    expect(approveAgentApproval).toHaveBeenCalledWith(301, { comment: '确认生成草稿' });
    expect(rejectAgentApproval).toHaveBeenCalledWith(302, { comment: '暂不执行' });
  });
});
