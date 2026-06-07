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
  TerminalBootstrap,
  TerminalCardUsagePreview,
  TerminalCardUsagePreviewRequest,
  TerminalCardUsageRecord,
  TerminalCardUsageVerifyRequest,
  TerminalCatalogSync,
  TerminalCompleteServiceTaskRequest,
  TerminalConfig,
  TerminalConsumptionRecord,
  TerminalConsumptionRecordCreateRequest,
  TerminalCustomerCard,
  TerminalCustomerSummary,
  TerminalDevice,
  TerminalDeviceHeartbeatRequest,
  TerminalDeviceLoginRequest,
  TerminalDeviceLoginResponse,
  TerminalDeviceStatusOverview,
  TerminalFollowUpTask,
  TerminalFollowUpTaskCompleteRequest,
  TerminalFollowUpTaskCreateRequest,
  TerminalHealthProfile,
  TerminalInventoryAlertsResponse,
  TerminalInventoryStockParams,
  TerminalInventoryStockResponse,
  TerminalCashierOrder,
  TerminalCashierOrderCreateRequest,
  TerminalCardOrder,
  TerminalCardOrderCreateRequest,
  TerminalPaymentCompleteRequest,
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
} from '@/types/terminal';
import type { Customer } from '@/types/customer';

import {
  realApproveTerminalDeviceUnbind,
  realAdjustTerminalBalance,
  realBindTerminalSkinTestCustomer,
  realCancelTerminalServiceTask,
  realCancelTerminalReservation,
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
  realGetTerminalCustomerCards,
  realGetTerminalCustomerBalance,
  realGetTerminalCustomerSummary,
  realGetTerminalCustomerConsumptionRecordsPaginated,
  realGetTerminalCustomerHealthProfile,
  realGetTerminalCustomerRecommendations,
  realGetTerminalCustomerNextBestActions,
  realGetTerminalDeviceMe,
  realGetTerminalDeviceStatus,
  realGetTerminalDevicesPaginated,
  realGetTerminalInventoryStock,
  realGetTerminalInventoryAlerts,
  realGetTerminalPromotions,
  realGetTerminalPrintJobStatus,
  realGetTerminalPrintJobs,
  realGetTerminalReservationAvailability,
  realGetTerminalRoleDashboard,
  realGetTerminalServiceRecord,
  realGetTerminalServiceTaskById,
  realGetTerminalServiceTasks,
  realGetTerminalSkinTestById,
  realGetTerminalSkinTestRecommendations,
  realGetTerminalSkinTests,
  realLoginTerminalDevice,
  realPreviewTerminalCardUsage,
  realQuickCreateTerminalCustomer,
  realRecordTerminalRecommendationEvent,
  realPauseTerminalAutomationStrategy,
  realRequestTerminalDeviceUnbind,
  realRefundTerminalBalance,
  realRescheduleTerminalReservation,
  realRetryTerminalPrintJob,
  realRunTerminalAutomationOnce,
  realRunDueTerminalAutomations,
  realSearchTerminalCustomers,
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

export const heartbeatTerminalDevice: (req: TerminalDeviceHeartbeatRequest) => Promise<TerminalDevice> =
  realHeartbeatTerminalDevice;

export const requestTerminalDeviceUnbind: (reason?: string) => Promise<TerminalDevice> =
  realRequestTerminalDeviceUnbind;

export const getTerminalDevicesPaginated: (
  params: PaginationParams & { keyword?: string; storeId?: number; status?: string },
) => Promise<PaginatedResponse<TerminalDevice>> = realGetTerminalDevicesPaginated;

export const updateTerminalDevice: (id: number, data: Partial<TerminalDevice>) => Promise<TerminalDevice> =
  realUpdateTerminalDevice;

export const disableTerminalDevice: (id: number) => Promise<TerminalDevice> =
  realDisableTerminalDevice;

export const approveTerminalDeviceUnbind: (id: number, approved: boolean) => Promise<TerminalDevice> =
  realApproveTerminalDeviceUnbind;

export const getTerminalBootstrap: () => Promise<TerminalBootstrap> =
  realGetTerminalBootstrap;

export const getTerminalCatalogSync: (params?: { since?: string }) => Promise<TerminalCatalogSync> =
  realGetTerminalCatalogSync;

export const getTerminalConfig: () => Promise<TerminalConfig> =
  realGetTerminalConfig;

export const getTerminalRoleDashboard: () => Promise<TerminalRoleDashboard> =
  realGetTerminalRoleDashboard;

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

export const recordTerminalRecommendationEvent: (data: TerminalRecommendationEventRequest) => Promise<{ id: number; createdAt: string }> =
  realRecordTerminalRecommendationEvent;

export const createTerminalFollowUpTask: (data: TerminalFollowUpTaskCreateRequest) => Promise<TerminalFollowUpTask> =
  realCreateTerminalFollowUpTask;

export const completeTerminalFollowUpTask: (
  id: number,
  data: TerminalFollowUpTaskCompleteRequest,
) => Promise<TerminalFollowUpTask> =
  realCompleteTerminalFollowUpTask;

export const getTerminalPromotions: (params?: { customerId?: number; projectId?: number }) => Promise<TerminalPromotion[]> =
  realGetTerminalPromotions;
