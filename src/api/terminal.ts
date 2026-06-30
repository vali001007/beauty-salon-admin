import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import type {
  TerminalBehaviorProfile,
  TerminalAutomationCreateRequest,
  TerminalAutomationDueRunSummary,
  TerminalAutomationExecutionDetail,
  TerminalAutomationExecutionSummary,
  TerminalAutomationExecutionTouch,
  TerminalAutomationPreview,
  TerminalAutomationStrategy,
  TerminalAutomationTemplate,
  TerminalAutomationTodaySummary,
  TerminalBalanceAccount,
  TerminalBalanceAdjustRequest,
  TerminalBalanceConsumeRequest,
  TerminalBalanceRefundRequest,
  TerminalBomResponse,
  TerminalBeauticianCommissionSummary,
  TerminalBootstrap,
  TerminalBootstrapParams,
  TerminalCardUsagePreview,
  TerminalCardUsagePreviewRequest,
  TerminalCardUsageRecord,
  TerminalCardUsageVerifyRequest,
  TerminalCatalogSync,
  TerminalCompleteServiceTaskRequest,
  TerminalConfig,
  TerminalContextCustomer,
  TerminalConversationHistoryParams,
  TerminalConversationRecord,
  TerminalConsumptionRecord,
  TerminalConsumptionRecordCreateRequest,
  TerminalCustomerCard,
  TerminalCustomerSelectQuery,
  TerminalCustomerSelectResponse,
  TerminalCustomerSummary,
  TerminalDevice,
  TerminalDeviceHeartbeatRequest,
  TerminalDeviceLoginRequest,
  TerminalDeviceLoginResponse,
  TerminalDeviceProvisionRequest,
  TerminalDeviceProvisionResponse,
  TerminalDeviceStatusOverview,
  TerminalFollowUpTask,
  TerminalFollowUpTaskBatchCreateResponse,
  TerminalFollowUpTaskCompleteRequest,
  TerminalFollowUpTaskCreateRequest,
  TerminalFollowUpTaskListResponse,
  TerminalFollowUpTaskQuery,
  TerminalGrowthCandidate,
  TerminalHealthProfile,
  TerminalCardVerificationContext,
  TerminalBeauticianDashboard,
  TerminalBeauticianMe,
  TerminalCashierContext,
  TerminalCashierShift,
  TerminalCustomerGrowthDashboard,
  TerminalInventoryAlertsResponse,
  TerminalInventoryStockParams,
  TerminalInventoryStockResponse,
  TerminalCashierOrder,
  TerminalCashierOrderCreateRequest,
  TerminalCardOrder,
  TerminalCardOrderCreateRequest,
  TerminalPaymentCompleteRequest,
  TerminalPrintableDocumentsResponse,
  TerminalPrintJob,
  TerminalPrintJobCreateRequest,
  TerminalPrintJobStatusUpdateRequest,
  TerminalPromotion,
  TerminalQuickCreateCustomerRequest,
  TerminalRechargeOrder,
  TerminalRechargeOrderCreateRequest,
  TerminalRecommendation,
  TerminalRecommendationEventRequest,
  TerminalNextBestActionsResponse,
  TerminalRoleDashboard,
  TerminalReservation,
  TerminalReservationAvailability,
  TerminalReservationAvailabilityParams,
  TerminalReservationCreateRequest,
  TerminalReservationRescheduleRequest,
  TerminalReservationUpdateRequest,
  TerminalServiceRecordCreateRequest,
  TerminalServiceRecordResponse,
  TerminalServiceTask,
  TerminalServiceTaskStatus,
  TerminalSkinTest,
  TerminalCreateSkinTestRequest,
  SaveTerminalConversationRequest,
} from '@/types/terminal';
import type { Customer } from '@/types/customer';

import {
  realApproveTerminalDeviceUnbind,
  realAdjustTerminalBalance,
  realBindTerminalSkinTestCustomer,
  realCancelTerminalServiceTask,
  realCancelTerminalReservation,
  realBatchCreateRecommendationFollowUpTasks,
  realCompleteTerminalServiceTask,
  realCompleteTerminalFollowUpTask,
  realConsumeTerminalBalance,
  realCreateTerminalConsumptionRecord,
  realCreateTerminalCashierOrder,
  realCreateTerminalCardOrder,
  realCreateTerminalFollowUpTask,
  realCreateTerminalPrintJob,
  realCreateTerminalRechargeOrder,
  realCreateTerminalReservation,
  realCreateTerminalServiceRecord,
  realCreateTerminalSkinTest,
  realCreateTerminalTaskFromReservation,
  realCheckInTerminalReservation,
  realConfirmTerminalReservation,
  realCompleteTerminalPayment,
  realDeleteTerminalDevice,
  realDeleteTerminalConversation,
  realGetTerminalReservations,
  realDisableTerminalDevice,
  realGetTerminalBehaviorProfile,
  realCreateTerminalAutomationStrategy,
  realEnableTerminalAutomationStrategy,
  realGetTerminalAutomations,
  realGetTerminalAutomationExecutionDetail,
  realGetTerminalAutomationTemplates,
  realGetTerminalAutomationTodaySummary,
  realPreviewTerminalAutomationStrategy,
  realGetTerminalBom,
  realGetTerminalBootstrap,
  realGetTerminalCardUsageRecordsPaginated,
  realGetTerminalCatalogSync,
  realGetTerminalConfig,
  realGetTerminalConversationDetail,
  realGetTerminalConversationHistory,
  realGetTerminalCardVerificationContext,
  realGetTerminalCustomerSelectContext,
  realGetTerminalBeauticianCommission,
  realGetCurrentTerminalBeautician,
  realGetCurrentTerminalBeauticianCommission,
  realGetCurrentTerminalBeauticianCustomers,
  realGetCurrentTerminalBeauticianDashboard,
  realGetCurrentTerminalBeauticianTasks,
  realCloseTerminalCashierShift,
  realGetTerminalCashierContext,
  realGetTerminalCurrentCashierShift,
  realGetTerminalCustomerGrowthDashboard,
  realGetTerminalCustomerCards,
  realGetTerminalCustomerBalance,
  realGetTerminalCustomerSummary,
  realGetTerminalCustomerConsumptionRecordsPaginated,
  realGetTerminalCustomerHealthProfile,
  realGetTerminalCustomerRecommendations,
  realGetTerminalCustomerNextBestActions,
  realGetTerminalCustomerGrowthCandidates,
  realGetTerminalFollowUpTasks,
  realGetTerminalDeviceMe,
  realGetTerminalDeviceStatus,
  realGetTerminalDevicesPaginated,
  realGetTerminalInventoryStock,
  realGetTerminalInventoryAlerts,
  realGetTerminalInventoryAlertsDashboard,
  realGetTerminalManagerDashboard,
  realGetTerminalPromotions,
  realGetTerminalPrintableDocumentsToday,
  realGetTerminalPrintJobStatus,
  realGetTerminalPrintJobs,
  realGetTerminalReservationAvailability,
  realGetTerminalRoleDashboard,
  realGetTerminalStaffSchedulesDashboard,
  realGetTerminalTodayReservationsDashboard,
  realGetTerminalServiceRecord,
  realGetTerminalServiceTaskById,
  realGetTerminalServiceTasks,
  realGetTerminalSkinTestById,
  realGetTerminalSkinTestRecommendations,
  realGetTerminalSkinTests,
  realLoginTerminalDevice,
  realOpenTerminalCashierShift,
  realProvisionTerminalDevice,
  realPreviewTerminalCardUsage,
  realQuickCreateTerminalCustomer,
  realRecordTerminalRecommendationEvent,
  realPauseTerminalAutomationStrategy,
  realRequestTerminalDeviceUnbind,
  realRefundTerminalBalance,
  realRescheduleTerminalReservation,
  realRetryTerminalPrintJob,
  realReturnTerminalFollowUpTask,
  realRunTerminalAutomationOnce,
  realRunDueTerminalAutomations,
  realSaveTerminalConversation,
  realSearchTerminalCustomers,
  realStartTerminalFollowUpTask,
  realStartTerminalServiceTask,
  realUpdateTerminalCustomerHealthProfile,
  realUpdateTerminalDevice,
  realUpdateTerminalReservation,
  realUpdateTerminalPrintJobStatus,
  realUpdateTerminalServiceRecord,
  realVerifyTerminalCardUsage,
  realHeartbeatTerminalDevice,
  realMarkTerminalAutomationTouchFollowedUp,
  realMarkTerminalReservationNoShow,
  realTransferTerminalTaskToCashier,
} from './real/terminal';

export const loginTerminalDevice: (req: TerminalDeviceLoginRequest) => Promise<TerminalDeviceLoginResponse> =
  realLoginTerminalDevice;

export const getTerminalDeviceMe: () => Promise<TerminalDevice> =
  realGetTerminalDeviceMe;

export const getTerminalDeviceStatus: () => Promise<TerminalDeviceStatusOverview> =
  realGetTerminalDeviceStatus;

export const getTerminalCurrentCashierShift: () => Promise<TerminalCashierShift | null> =
  realGetTerminalCurrentCashierShift;

export const openTerminalCashierShift: (openingCash: number) => Promise<TerminalCashierShift> =
  realOpenTerminalCashierShift;

export const closeTerminalCashierShift: (shiftId: number | undefined, closingCash: number) => Promise<TerminalCashierShift> =
  realCloseTerminalCashierShift;

export const heartbeatTerminalDevice: (req: TerminalDeviceHeartbeatRequest) => Promise<TerminalDevice> =
  realHeartbeatTerminalDevice;

export const requestTerminalDeviceUnbind: (reason?: string) => Promise<TerminalDevice> =
  realRequestTerminalDeviceUnbind;

export const getTerminalDevicesPaginated: (
  params: PaginationParams & { keyword?: string; storeId?: number; status?: string },
) => Promise<PaginatedResponse<TerminalDevice>> = realGetTerminalDevicesPaginated;

export const provisionTerminalDevice: (
  data: TerminalDeviceProvisionRequest,
) => Promise<TerminalDeviceProvisionResponse> = realProvisionTerminalDevice;

export const updateTerminalDevice: (id: number, data: Partial<TerminalDevice>) => Promise<TerminalDevice> =
  realUpdateTerminalDevice;

export const disableTerminalDevice: (id: number) => Promise<TerminalDevice> =
  realDisableTerminalDevice;

export const approveTerminalDeviceUnbind: (id: number, approved: boolean) => Promise<TerminalDevice> =
  realApproveTerminalDeviceUnbind;

export const deleteTerminalDevice: (id: number) => Promise<{ success: boolean; id: number }> =
  realDeleteTerminalDevice;

export const getTerminalBootstrap: (params?: TerminalBootstrapParams) => Promise<TerminalBootstrap> =
  realGetTerminalBootstrap;

export const getTerminalCatalogSync: (params?: { since?: string }) => Promise<TerminalCatalogSync> =
  realGetTerminalCatalogSync;

export const getTerminalConfig: () => Promise<TerminalConfig> =
  realGetTerminalConfig;

export const saveTerminalConversation: (
  data: SaveTerminalConversationRequest,
) => Promise<TerminalConversationRecord> =
  realSaveTerminalConversation;

export const getTerminalConversationHistory: (
  params?: TerminalConversationHistoryParams,
) => Promise<PaginatedResponse<TerminalConversationRecord>> =
  realGetTerminalConversationHistory;

export const getTerminalConversationDetail: (id: number) => Promise<TerminalConversationRecord> =
  realGetTerminalConversationDetail;

export const deleteTerminalConversation: (id: number) => Promise<{ success: boolean; id: number }> =
  realDeleteTerminalConversation;

export const getTerminalRoleDashboard: () => Promise<TerminalRoleDashboard> =
  realGetTerminalRoleDashboard;

export const getTerminalManagerDashboard: () => Promise<TerminalRoleDashboard['manager']> =
  realGetTerminalManagerDashboard;

export const getTerminalStaffSchedulesDashboard: () => Promise<TerminalRoleDashboard['staff']> =
  realGetTerminalStaffSchedulesDashboard;

export const getTerminalTodayReservationsDashboard: () => Promise<TerminalRoleDashboard['reception']> =
  realGetTerminalTodayReservationsDashboard;

export const getTerminalCustomerGrowthDashboard: () => Promise<TerminalCustomerGrowthDashboard> =
  realGetTerminalCustomerGrowthDashboard;

export const getTerminalInventoryAlertsDashboard: () => Promise<TerminalInventoryAlertsResponse> =
  realGetTerminalInventoryAlertsDashboard;

export const getTerminalCashierContext: () => Promise<TerminalCashierContext> =
  realGetTerminalCashierContext;

export const getTerminalCardVerificationContext: (params?: { keyword?: string }) => Promise<TerminalCardVerificationContext> =
  realGetTerminalCardVerificationContext;

export const getTerminalCustomerSelectContext: (
  params?: TerminalCustomerSelectQuery,
) => Promise<TerminalCustomerSelectResponse> =
  realGetTerminalCustomerSelectContext;

export const getTerminalBeauticianCommission: (
  beauticianId: number,
  period?: 'today' | 'month',
  detailLimit?: number,
) => Promise<TerminalBeauticianCommissionSummary> =
  realGetTerminalBeauticianCommission;

export const getCurrentTerminalBeautician: (params?: { operatorId?: number }) => Promise<TerminalBeauticianMe> =
  realGetCurrentTerminalBeautician;

export const getCurrentTerminalBeauticianDashboard: (params?: {
  date?: string;
  operatorId?: number;
}) => Promise<TerminalBeauticianDashboard> =
  realGetCurrentTerminalBeauticianDashboard;

export const getCurrentTerminalBeauticianTasks: (params?: {
  date?: string;
  status?: TerminalServiceTaskStatus;
  operatorId?: number;
}) => Promise<TerminalServiceTask[]> =
  realGetCurrentTerminalBeauticianTasks;

export const getCurrentTerminalBeauticianCommission: (params?: {
  period?: 'today' | 'month';
  detailLimit?: number;
  operatorId?: number;
}) => Promise<TerminalBeauticianCommissionSummary> =
  realGetCurrentTerminalBeauticianCommission;

export const getCurrentTerminalBeauticianCustomers: (params?: {
  keyword?: string;
  operatorId?: number;
}) => Promise<TerminalContextCustomer[]> =
  realGetCurrentTerminalBeauticianCustomers;

export const getTerminalAutomations: () => Promise<TerminalAutomationStrategy[]> =
  realGetTerminalAutomations;

export const getTerminalAutomationTemplates: () => Promise<TerminalAutomationTemplate[]> =
  realGetTerminalAutomationTemplates;

export const createTerminalAutomationStrategy: (
  data: TerminalAutomationCreateRequest,
) => Promise<TerminalAutomationStrategy> =
  realCreateTerminalAutomationStrategy;

export const previewTerminalAutomationStrategy: (
  data: TerminalAutomationCreateRequest,
) => Promise<TerminalAutomationPreview> =
  realPreviewTerminalAutomationStrategy;

export const enableTerminalAutomationStrategy: (id: number) => Promise<TerminalAutomationStrategy> =
  realEnableTerminalAutomationStrategy;

export const pauseTerminalAutomationStrategy: (id: number) => Promise<TerminalAutomationStrategy> =
  realPauseTerminalAutomationStrategy;

export const runTerminalAutomationOnce: (id: number) => Promise<TerminalAutomationExecutionSummary> =
  realRunTerminalAutomationOnce;

export const runDueTerminalAutomations: () => Promise<TerminalAutomationDueRunSummary> =
  realRunDueTerminalAutomations;

export const getTerminalAutomationTodaySummary: () => Promise<TerminalAutomationTodaySummary> =
  realGetTerminalAutomationTodaySummary;

export const getTerminalAutomationExecutionDetail: (id: number) => Promise<TerminalAutomationExecutionDetail> =
  realGetTerminalAutomationExecutionDetail;

export const markTerminalAutomationTouchFollowedUp: (id: number) => Promise<TerminalAutomationExecutionTouch> =
  realMarkTerminalAutomationTouchFollowedUp;

export const searchTerminalCustomers: (params: { keyword: string }) => Promise<Customer[]> =
  realSearchTerminalCustomers;

export const quickCreateTerminalCustomer: (data: TerminalQuickCreateCustomerRequest) => Promise<Customer> =
  realQuickCreateTerminalCustomer;

export const createTerminalReservation: (data: TerminalReservationCreateRequest) => Promise<TerminalReservation> =
  realCreateTerminalReservation;

export const getTerminalReservations: (params?: {
  date?: string;
  storeName?: string;
  status?: TerminalReservation['status'];
}) => Promise<TerminalReservation[]> = realGetTerminalReservations;

export const getTerminalReservationAvailability: (
  params?: TerminalReservationAvailabilityParams,
) => Promise<TerminalReservationAvailability> =
  realGetTerminalReservationAvailability;

export const updateTerminalReservation: (
  id: number,
  data: TerminalReservationUpdateRequest,
) => Promise<TerminalReservation> = realUpdateTerminalReservation;

export const rescheduleTerminalReservation: (
  id: number,
  data: TerminalReservationRescheduleRequest,
) => Promise<TerminalReservation> = realRescheduleTerminalReservation;

export const confirmTerminalReservation: (id: number) => Promise<TerminalReservation> =
  realConfirmTerminalReservation;

export const checkInTerminalReservation: (id: number) => Promise<TerminalReservation> =
  realCheckInTerminalReservation;

export const markTerminalReservationNoShow: (id: number, reason?: string) => Promise<TerminalReservation> =
  realMarkTerminalReservationNoShow;

export const createTerminalTaskFromReservation: (id: number) => Promise<TerminalServiceTask> =
  realCreateTerminalTaskFromReservation;

export const cancelTerminalReservation: (id: number, reason?: string) => Promise<TerminalReservation> =
  realCancelTerminalReservation;

export const getTerminalCustomerSummary: (customerId: number) => Promise<TerminalCustomerSummary> =
  realGetTerminalCustomerSummary;

export const getTerminalCustomerBalance: (customerId: number) => Promise<TerminalBalanceAccount> =
  realGetTerminalCustomerBalance;

export const getTerminalCustomerHealthProfile: (customerId: number) => Promise<TerminalHealthProfile | undefined> =
  realGetTerminalCustomerHealthProfile;

export const updateTerminalCustomerHealthProfile: (
  customerId: number,
  data: Partial<TerminalHealthProfile>,
) => Promise<TerminalHealthProfile> = realUpdateTerminalCustomerHealthProfile;

export const getTerminalCustomerConsumptionRecordsPaginated: (
  customerId: number,
  params: PaginationParams,
) => Promise<PaginatedResponse<TerminalConsumptionRecord>> =
  realGetTerminalCustomerConsumptionRecordsPaginated;

export const getTerminalBehaviorProfile: (customerId: number) => Promise<TerminalBehaviorProfile | undefined> =
  realGetTerminalBehaviorProfile;

export const getTerminalServiceTasks: (params?: {
  date?: string;
  status?: TerminalServiceTaskStatus;
  beauticianId?: number;
}) => Promise<TerminalServiceTask[]> = realGetTerminalServiceTasks;

export const getTerminalServiceTaskById: (id: number) => Promise<TerminalServiceTask | undefined> =
  realGetTerminalServiceTaskById;

export const startTerminalServiceTask: (id: number) => Promise<TerminalServiceTask> =
  realStartTerminalServiceTask;

export const completeTerminalServiceTask: (
  id: number,
  data: TerminalCompleteServiceTaskRequest,
) => Promise<TerminalServiceTask> = realCompleteTerminalServiceTask;

export const cancelTerminalServiceTask: (id: number, reason?: string) => Promise<TerminalServiceTask> =
  realCancelTerminalServiceTask;

export const getTerminalServiceRecord: (taskId: number) => Promise<TerminalServiceRecordResponse> =
  realGetTerminalServiceRecord;

export const transferTerminalTaskToCashier: (
  taskId: number,
  remark?: string,
) => Promise<TerminalCashierOrderCreateRequest> =
  realTransferTerminalTaskToCashier;

export const getTerminalCustomerCards: (customerId: number) => Promise<TerminalCustomerCard[]> =
  realGetTerminalCustomerCards;

export const previewTerminalCardUsage: (data: TerminalCardUsagePreviewRequest) => Promise<TerminalCardUsagePreview> =
  realPreviewTerminalCardUsage;

export const verifyTerminalCardUsage: (data: TerminalCardUsageVerifyRequest) => Promise<TerminalCardUsageRecord> =
  realVerifyTerminalCardUsage;

export const createTerminalCashierOrder: (data: TerminalCashierOrderCreateRequest) => Promise<TerminalCashierOrder> =
  realCreateTerminalCashierOrder;

export const completeTerminalPayment: (
  orderId: number,
  data: TerminalPaymentCompleteRequest,
) => Promise<TerminalCashierOrder> = realCompleteTerminalPayment;

export const createTerminalCardOrder: (data: TerminalCardOrderCreateRequest) => Promise<TerminalCardOrder> =
  realCreateTerminalCardOrder;

export const createTerminalRechargeOrder: (data: TerminalRechargeOrderCreateRequest) => Promise<TerminalRechargeOrder> =
  realCreateTerminalRechargeOrder;

export const consumeTerminalBalance: (data: TerminalBalanceConsumeRequest) => Promise<TerminalBalanceAccount> =
  realConsumeTerminalBalance;

export const refundTerminalBalance: (data: TerminalBalanceRefundRequest) => Promise<TerminalBalanceAccount> =
  realRefundTerminalBalance;

export const adjustTerminalBalance: (data: TerminalBalanceAdjustRequest) => Promise<TerminalBalanceAccount> =
  realAdjustTerminalBalance;

export const createTerminalPrintJob: (data: TerminalPrintJobCreateRequest) => Promise<TerminalPrintJob> =
  realCreateTerminalPrintJob;

export const getTerminalPrintableDocumentsToday: () => Promise<TerminalPrintableDocumentsResponse> =
  realGetTerminalPrintableDocumentsToday;

export const getTerminalPrintJobs: (params?: {
  sourceType?: TerminalPrintJobCreateRequest['sourceType'];
  sourceId?: number;
  status?: TerminalPrintJob['status'] | 'pending';
  page?: number;
  pageSize?: number;
}) => Promise<PaginatedResponse<TerminalPrintJob>> =
  realGetTerminalPrintJobs;

export const getTerminalPrintJobStatus: (id: number) => Promise<TerminalPrintJob | undefined> =
  realGetTerminalPrintJobStatus;

export const retryTerminalPrintJob: (id: number) => Promise<TerminalPrintJob> =
  realRetryTerminalPrintJob;

export const updateTerminalPrintJobStatus: (
  id: number,
  data: TerminalPrintJobStatusUpdateRequest,
) => Promise<TerminalPrintJob> =
  realUpdateTerminalPrintJobStatus;

export const getTerminalCardUsageRecordsPaginated: (
  params: PaginationParams & { customerId?: number; cardName?: string; projectName?: string },
) => Promise<PaginatedResponse<TerminalCardUsageRecord>> =
  realGetTerminalCardUsageRecordsPaginated;

export const getTerminalBom: (projectId: number) => Promise<TerminalBomResponse> =
  realGetTerminalBom;

export const getTerminalInventoryStock: (params?: TerminalInventoryStockParams) => Promise<TerminalInventoryStockResponse> =
  realGetTerminalInventoryStock;

export const getTerminalInventoryAlerts: () => Promise<TerminalInventoryAlertsResponse> =
  realGetTerminalInventoryAlerts;

export const createTerminalConsumptionRecord: (
  data: TerminalConsumptionRecordCreateRequest,
) => Promise<TerminalConsumptionRecordCreateRequest & { id: number; createdAt: string }> =
  realCreateTerminalConsumptionRecord;

export const createTerminalServiceRecord: (
  data: TerminalServiceRecordCreateRequest,
) => Promise<TerminalServiceRecordResponse> =
  realCreateTerminalServiceRecord;

export const updateTerminalServiceRecord: (
  taskId: number,
  data: TerminalServiceRecordCreateRequest,
) => Promise<TerminalServiceRecordResponse> =
  realUpdateTerminalServiceRecord;

export const createTerminalSkinTest: (data: TerminalCreateSkinTestRequest) => Promise<TerminalSkinTest> =
  realCreateTerminalSkinTest;

export const getTerminalSkinTests: (params?: { customerId?: number }) => Promise<TerminalSkinTest[]> =
  realGetTerminalSkinTests;

export const getTerminalSkinTestById: (id: number) => Promise<TerminalSkinTest | undefined> =
  realGetTerminalSkinTestById;

export const bindTerminalSkinTestCustomer: (id: number, customerId: number) => Promise<TerminalSkinTest> =
  realBindTerminalSkinTestCustomer;

export const getTerminalSkinTestRecommendations: (id: number) => Promise<TerminalRecommendation[]> =
  realGetTerminalSkinTestRecommendations;

export const getTerminalCustomerRecommendations: (customerId: number) => Promise<TerminalRecommendation[]> =
  realGetTerminalCustomerRecommendations;

export const getTerminalCustomerNextBestActions: (customerId: number) => Promise<TerminalNextBestActionsResponse> =
  realGetTerminalCustomerNextBestActions;

export const getTerminalCustomerGrowthCandidates: (limit?: number) => Promise<TerminalGrowthCandidate[]> =
  realGetTerminalCustomerGrowthCandidates;

export const recordTerminalRecommendationEvent: (data: TerminalRecommendationEventRequest) => Promise<{ id: number; createdAt: string }> =
  realRecordTerminalRecommendationEvent;

export const createTerminalFollowUpTask: (data: TerminalFollowUpTaskCreateRequest) => Promise<TerminalFollowUpTask> =
  realCreateTerminalFollowUpTask;

export const getTerminalFollowUpTasks: (params?: TerminalFollowUpTaskQuery) => Promise<TerminalFollowUpTaskListResponse> =
  realGetTerminalFollowUpTasks;

export const batchCreateRecommendationFollowUpTasks: (
  recommendationId: number,
  data: TerminalFollowUpTaskCreateRequest,
) => Promise<TerminalFollowUpTaskBatchCreateResponse> =
  realBatchCreateRecommendationFollowUpTasks;

export const startTerminalFollowUpTask: (id: number) => Promise<TerminalFollowUpTask> =
  realStartTerminalFollowUpTask;

export const completeTerminalFollowUpTask: (
  id: number,
  data: TerminalFollowUpTaskCompleteRequest,
) => Promise<TerminalFollowUpTask> =
  realCompleteTerminalFollowUpTask;

export const returnTerminalFollowUpTask: (id: number, note?: string) => Promise<TerminalFollowUpTask> =
  realReturnTerminalFollowUpTask;

export const getTerminalPromotions: (params?: { customerId?: number; projectId?: number }) => Promise<TerminalPromotion[]> =
  realGetTerminalPromotions;
