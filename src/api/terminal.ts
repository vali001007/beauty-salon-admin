import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import type {
  TerminalBehaviorProfile,
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
  TerminalPromotion,
  TerminalQuickCreateCustomerRequest,
  TerminalRechargeOrder,
  TerminalRechargeOrderCreateRequest,
  TerminalRecommendation,
  TerminalRecommendationEventRequest,
  TerminalRoleDashboard,
  TerminalReservation,
  TerminalReservationCreateRequest,
  TerminalReservationUpdateRequest,
  TerminalServiceTask,
  TerminalServiceTaskStatus,
  TerminalSkinTest,
  TerminalCreateSkinTestRequest,
} from '@/types/terminal';
import type { Customer } from '@/types/customer';

import {
  realApproveTerminalDeviceUnbind,
  realBindTerminalSkinTestCustomer,
  realCancelTerminalServiceTask,
  realCancelTerminalReservation,
  realCompleteTerminalServiceTask,
  realCreateTerminalConsumptionRecord,
  realCreateTerminalCashierOrder,
  realCreateTerminalCardOrder,
  realCreateTerminalPrintJob,
  realCreateTerminalRechargeOrder,
  realCreateTerminalReservation,
  realCreateTerminalSkinTest,
  realCheckInTerminalReservation,
  realConfirmTerminalReservation,
  realCompleteTerminalPayment,
  realGetTerminalReservations,
  realDisableTerminalDevice,
  realGetTerminalBehaviorProfile,
  realGetTerminalBom,
  realGetTerminalBootstrap,
  realGetTerminalCardUsageRecordsPaginated,
  realGetTerminalCatalogSync,
  realGetTerminalConfig,
  realGetTerminalCustomerCards,
  realGetTerminalCustomerSummary,
  realGetTerminalCustomerConsumptionRecordsPaginated,
  realGetTerminalCustomerHealthProfile,
  realGetTerminalCustomerRecommendations,
  realGetTerminalDeviceMe,
  realGetTerminalDevicesPaginated,
  realGetTerminalInventoryStock,
  realGetTerminalInventoryAlerts,
  realGetTerminalPromotions,
  realGetTerminalPrintJobStatus,
  realGetTerminalRoleDashboard,
  realGetTerminalServiceTaskById,
  realGetTerminalServiceTasks,
  realGetTerminalSkinTestById,
  realGetTerminalSkinTestRecommendations,
  realGetTerminalSkinTests,
  realLoginTerminalDevice,
  realPreviewTerminalCardUsage,
  realQuickCreateTerminalCustomer,
  realRecordTerminalRecommendationEvent,
  realRequestTerminalDeviceUnbind,
  realSearchTerminalCustomers,
  realStartTerminalServiceTask,
  realUpdateTerminalCustomerHealthProfile,
  realUpdateTerminalDevice,
  realUpdateTerminalReservation,
  realVerifyTerminalCardUsage,
  realHeartbeatTerminalDevice,
} from './real/terminal';

export const loginTerminalDevice: (req: TerminalDeviceLoginRequest) => Promise<TerminalDeviceLoginResponse> =
  realLoginTerminalDevice;

export const getTerminalDeviceMe: () => Promise<TerminalDevice> =
  realGetTerminalDeviceMe;

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

export const updateTerminalReservation: (
  id: number,
  data: TerminalReservationUpdateRequest,
) => Promise<TerminalReservation> = realUpdateTerminalReservation;

export const confirmTerminalReservation: (id: number) => Promise<TerminalReservation> =
  realConfirmTerminalReservation;

export const checkInTerminalReservation: (id: number) => Promise<TerminalReservation> =
  realCheckInTerminalReservation;

export const cancelTerminalReservation: (id: number, reason?: string) => Promise<TerminalReservation> =
  realCancelTerminalReservation;

export const getTerminalCustomerSummary: (customerId: number) => Promise<TerminalCustomerSummary> =
  realGetTerminalCustomerSummary;

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

export const createTerminalPrintJob: (data: TerminalPrintJobCreateRequest) => Promise<TerminalPrintJob> =
  realCreateTerminalPrintJob;

export const getTerminalPrintJobStatus: (id: number) => Promise<TerminalPrintJob | undefined> =
  realGetTerminalPrintJobStatus;

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

export const recordTerminalRecommendationEvent: (data: TerminalRecommendationEventRequest) => Promise<{ id: number; createdAt: string }> =
  realRecordTerminalRecommendationEvent;

export const getTerminalPromotions: (params?: { customerId?: number; projectId?: number }) => Promise<TerminalPromotion[]> =
  realGetTerminalPromotions;
