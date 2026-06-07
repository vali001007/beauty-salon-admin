import apiClient from '../client';
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
import { extractArray } from './response';

export async function realLoginTerminalDevice(req: TerminalDeviceLoginRequest): Promise<TerminalDeviceLoginResponse> {
  return apiClient.post('/terminal/devices/login', req);
}

export async function realGetTerminalDeviceMe(): Promise<TerminalDevice> {
  return apiClient.get('/terminal/devices/info');
}

export async function realGetTerminalDeviceStatus(): Promise<TerminalDeviceStatusOverview> {
  return apiClient.get('/terminal/devices/status');
}

export async function realHeartbeatTerminalDevice(req: TerminalDeviceHeartbeatRequest): Promise<TerminalDevice> {
  await apiClient.post('/terminal/devices/heartbeat', req);
  return realGetTerminalDeviceMe();
}

export async function realRequestTerminalDeviceUnbind(reason?: string): Promise<TerminalDevice> {
  return apiClient.post('/terminal/devices/unbind', { reason });
}

export async function realGetTerminalDevicesPaginated(
  params: PaginationParams & { keyword?: string; storeId?: number; status?: string },
): Promise<PaginatedResponse<TerminalDevice>> {
  return apiClient.get('/terminal/devices/paginated', { params });
}

export async function realUpdateTerminalDevice(id: number, data: Partial<TerminalDevice>): Promise<TerminalDevice> {
  return apiClient.put(`/terminal/devices/${id}`, data);
}

export async function realDisableTerminalDevice(id: number): Promise<TerminalDevice> {
  return apiClient.post(`/terminal/devices/${id}/disable`);
}

export async function realApproveTerminalDeviceUnbind(id: number, approved: boolean): Promise<TerminalDevice> {
  return apiClient.post(`/terminal/devices/${id}/unbind/approve`, { approved });
}

export async function realGetTerminalBootstrap(): Promise<TerminalBootstrap> {
  return apiClient.get('/terminal/bootstrap');
}

export async function realGetTerminalCatalogSync(params?: { since?: string }): Promise<TerminalCatalogSync> {
  return apiClient.get('/terminal/sync/catalog', { params });
}

export async function realGetTerminalConfig(): Promise<TerminalConfig> {
  return apiClient.get('/terminal/config');
}

export async function realGetTerminalRoleDashboard(): Promise<TerminalRoleDashboard> {
  return apiClient.get('/terminal/dashboard/role');
}

export async function realGetTerminalAutomations(): Promise<TerminalAutomationStrategy[]> {
  return apiClient.get('/terminal/automations');
}

export async function realGetTerminalAutomationTemplates(): Promise<TerminalAutomationTemplate[]> {
  return apiClient.get('/terminal/automations/templates');
}

export async function realCreateTerminalAutomationStrategy(
  data: TerminalAutomationCreateRequest,
): Promise<TerminalAutomationStrategy> {
  return apiClient.post('/terminal/automations', data);
}

export async function realPreviewTerminalAutomationStrategy(
  data: TerminalAutomationCreateRequest,
): Promise<TerminalAutomationPreview> {
  return apiClient.post('/terminal/automations/preview', data);
}

export async function realEnableTerminalAutomationStrategy(id: number): Promise<TerminalAutomationStrategy> {
  return apiClient.post(`/terminal/automations/${id}/enable`);
}

export async function realPauseTerminalAutomationStrategy(id: number): Promise<TerminalAutomationStrategy> {
  return apiClient.post(`/terminal/automations/${id}/pause`);
}

export async function realRunTerminalAutomationOnce(id: number): Promise<TerminalAutomationExecutionSummary> {
  return apiClient.post(`/terminal/automations/${id}/run-once`);
}

export async function realRunDueTerminalAutomations(): Promise<TerminalAutomationDueRunSummary> {
  return apiClient.post('/terminal/automations/executions/run-due');
}

export async function realGetTerminalAutomationTodaySummary(): Promise<TerminalAutomationTodaySummary> {
  return apiClient.get('/terminal/automations/executions/today');
}

export async function realGetTerminalAutomationExecutionDetail(id: number): Promise<TerminalAutomationExecutionDetail> {
  return apiClient.get(`/terminal/automations/executions/${id}`);
}

export async function realMarkTerminalAutomationTouchFollowedUp(id: number): Promise<TerminalAutomationExecutionTouch> {
  return apiClient.post(`/terminal/automations/touches/${id}/follow-up`);
}

export async function realSearchTerminalCustomers(params: { keyword: string }): Promise<Customer[]> {
  return apiClient.get('/terminal/customers/search', { params });
}

function normalizeOptionalIsoDate(value?: string) {
  const raw = value?.trim();
  if (!raw) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? undefined : raw;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function sanitizeQuickCreateCustomerRequest(data: TerminalQuickCreateCustomerRequest) {
  const { birthday, ...payload } = data;
  delete (payload as Partial<TerminalQuickCreateCustomerRequest>).storeName;
  const normalizedBirthday = normalizeOptionalIsoDate(birthday);
  return normalizedBirthday ? { ...payload, birthday: normalizedBirthday } : payload;
}

export async function realQuickCreateTerminalCustomer(data: TerminalQuickCreateCustomerRequest): Promise<Customer> {
  return apiClient.post('/terminal/customers/quick-create', sanitizeQuickCreateCustomerRequest(data));
}

export async function realCreateTerminalReservation(data: TerminalReservationCreateRequest): Promise<TerminalReservation> {
  return apiClient.post('/terminal/reservations', data);
}

export async function realGetTerminalReservations(params?: {
  date?: string;
  storeName?: string;
  status?: TerminalReservation['status'];
}): Promise<TerminalReservation[]> {
  return apiClient.get('/terminal/reservations/today', { params });
}

export async function realGetTerminalReservationAvailability(
  params?: TerminalReservationAvailabilityParams,
): Promise<TerminalReservationAvailability> {
  return apiClient.get('/terminal/reservations/availability', { params });
}

export async function realUpdateTerminalReservation(
  id: number,
  data: TerminalReservationUpdateRequest,
): Promise<TerminalReservation> {
  return apiClient.put(`/terminal/reservations/${id}`, data);
}

export async function realRescheduleTerminalReservation(
  id: number,
  data: TerminalReservationRescheduleRequest,
): Promise<TerminalReservation> {
  return apiClient.post(`/terminal/reservations/${id}/reschedule`, data);
}

export async function realConfirmTerminalReservation(id: number): Promise<TerminalReservation> {
  return apiClient.patch(`/terminal/reservations/${id}/confirm`);
}

export async function realCheckInTerminalReservation(id: number): Promise<TerminalReservation> {
  return apiClient.patch(`/terminal/reservations/${id}/check-in`);
}

export async function realMarkTerminalReservationNoShow(id: number, reason?: string): Promise<TerminalReservation> {
  return apiClient.post(`/terminal/reservations/${id}/no-show`, { reason });
}

export async function realCreateTerminalTaskFromReservation(id: number): Promise<TerminalServiceTask> {
  return apiClient.post(`/terminal/reservations/${id}/create-task`);
}

export async function realCancelTerminalReservation(id: number, reason?: string): Promise<TerminalReservation> {
  return apiClient.patch(`/terminal/reservations/${id}/cancel`, { reason });
}

export async function realGetTerminalCustomerSummary(customerId: number): Promise<TerminalCustomerSummary> {
  return apiClient.get(`/terminal/customers/${customerId}/summary`);
}

export async function realGetTerminalCustomerBalance(customerId: number): Promise<TerminalBalanceAccount> {
  return apiClient.get(`/terminal/customers/${customerId}/balance`);
}

export async function realGetTerminalCustomerHealthProfile(customerId: number): Promise<TerminalHealthProfile | undefined> {
  return apiClient.get(`/terminal/customers/${customerId}/health-profile`);
}

export async function realUpdateTerminalCustomerHealthProfile(
  customerId: number,
  data: Partial<TerminalHealthProfile>,
): Promise<TerminalHealthProfile> {
  return apiClient.put(`/terminal/customers/${customerId}/health-profile`, data);
}

export async function realGetTerminalCustomerConsumptionRecordsPaginated(
  customerId: number,
  params: PaginationParams,
): Promise<PaginatedResponse<TerminalConsumptionRecord>> {
  return apiClient.get(`/terminal/customers/${customerId}/consumption-records/paginated`, { params });
}

export async function realGetTerminalBehaviorProfile(customerId: number): Promise<TerminalBehaviorProfile | undefined> {
  return apiClient.get(`/terminal/customers/${customerId}/behavior-profile`);
}

export async function realGetTerminalServiceTasks(params?: {
  date?: string;
  status?: TerminalServiceTaskStatus;
}): Promise<TerminalServiceTask[]> {
  return apiClient.get('/terminal/tasks', { params });
}

export async function realGetTerminalServiceTaskById(id: number): Promise<TerminalServiceTask | undefined> {
  return apiClient.get(`/terminal/tasks/${id}`);
}

export async function realStartTerminalServiceTask(id: number): Promise<TerminalServiceTask> {
  return apiClient.patch(`/terminal/tasks/${id}/start`);
}

export async function realCompleteTerminalServiceTask(
  id: number,
  data: TerminalCompleteServiceTaskRequest,
): Promise<TerminalServiceTask> {
  return apiClient.patch(`/terminal/tasks/${id}/complete`, data);
}

export async function realCancelTerminalServiceTask(id: number, reason?: string): Promise<TerminalServiceTask> {
  return apiClient.patch(`/terminal/tasks/${id}/cancel`, { reason });
}

export async function realGetTerminalServiceRecord(taskId: number): Promise<TerminalServiceRecordResponse> {
  return apiClient.get(`/terminal/tasks/${taskId}/service-record`);
}

export async function realTransferTerminalTaskToCashier(
  taskId: number,
  remark?: string,
): Promise<TerminalCashierOrderCreateRequest> {
  return apiClient.post(`/terminal/tasks/${taskId}/transfer-cashier`, { remark });
}

export async function realGetTerminalCustomerCards(customerId: number): Promise<TerminalCustomerCard[]> {
  return apiClient.get(`/terminal/customers/${customerId}/cards`);
}

export async function realPreviewTerminalCardUsage(data: TerminalCardUsagePreviewRequest): Promise<TerminalCardUsagePreview> {
  return apiClient.post('/terminal/cards/verify', data);
}

export async function realVerifyTerminalCardUsage(data: TerminalCardUsageVerifyRequest): Promise<TerminalCardUsageRecord> {
  return apiClient.post('/terminal/cards/consume', data);
}

export async function realCreateTerminalCashierOrder(
  data: TerminalCashierOrderCreateRequest,
): Promise<TerminalCashierOrder> {
  return apiClient.post('/terminal/cashier/checkout', {
    customerId: data.customerId,
    payMethod: data.paymentMethod ?? 'cash',
    discountAmount: data.discountAmount,
    items: extractArray<TerminalCashierOrderCreateRequest['items'][number]>(data.items).map((item) => ({
      itemId: item.itemId ?? 0,
      itemType: item.itemType,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    remark: data.remark,
  });
}

export async function realCompleteTerminalPayment(
  orderId: number,
  data: TerminalPaymentCompleteRequest,
): Promise<TerminalCashierOrder> {
  return apiClient.post(`/terminal/cashier-orders/${orderId}/complete-payment`, data);
}

export async function realCreateTerminalCardOrder(data: TerminalCardOrderCreateRequest): Promise<TerminalCardOrder> {
  return apiClient.post('/terminal/card-orders', data);
}

export async function realCreateTerminalRechargeOrder(
  data: TerminalRechargeOrderCreateRequest,
): Promise<TerminalRechargeOrder> {
  return apiClient.post('/terminal/recharge-orders', data);
}

export async function realConsumeTerminalBalance(data: TerminalBalanceConsumeRequest): Promise<TerminalBalanceAccount> {
  return apiClient.post('/terminal/balance/consume', data);
}

export async function realRefundTerminalBalance(data: TerminalBalanceRefundRequest): Promise<TerminalBalanceAccount> {
  return apiClient.post('/terminal/balance/refund', data);
}

export async function realAdjustTerminalBalance(data: TerminalBalanceAdjustRequest): Promise<TerminalBalanceAccount> {
  return apiClient.post('/terminal/balance/adjust', data);
}

export async function realCreateTerminalPrintJob(data: TerminalPrintJobCreateRequest): Promise<TerminalPrintJob> {
  return apiClient.post('/terminal/print-jobs', data);
}

export async function realGetTerminalPrintJobs(params?: {
  sourceType?: TerminalPrintJobCreateRequest['sourceType'];
  sourceId?: number;
  status?: TerminalPrintJob['status'] | 'pending';
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<TerminalPrintJob>> {
  return apiClient.get('/terminal/print-jobs', { params });
}

export async function realGetTerminalPrintJobStatus(id: number): Promise<TerminalPrintJob | undefined> {
  return apiClient.get(`/terminal/print-jobs/${id}`);
}

export async function realRetryTerminalPrintJob(id: number): Promise<TerminalPrintJob> {
  return apiClient.post(`/terminal/print-jobs/${id}/retry`);
}

export async function realUpdateTerminalPrintJobStatus(
  id: number,
  data: TerminalPrintJobStatusUpdateRequest,
): Promise<TerminalPrintJob> {
  return apiClient.patch(`/terminal/print-jobs/${id}/status`, data);
}

export async function realGetTerminalCardUsageRecordsPaginated(
  params: PaginationParams & { customerId?: number; cardName?: string; projectName?: string },
): Promise<PaginatedResponse<TerminalCardUsageRecord>> {
  return apiClient.get('/terminal/card-usage-records/paginated', { params });
}

export async function realGetTerminalBom(projectId: number): Promise<TerminalBomResponse> {
  return apiClient.get(`/terminal/projects/${projectId}/bom`);
}

export async function realGetTerminalInventoryStock(
  params?: TerminalInventoryStockParams,
): Promise<TerminalInventoryStockResponse> {
  return apiClient.get('/terminal/inventory/stock', { params });
}

export async function realGetTerminalInventoryAlerts(): Promise<TerminalInventoryAlertsResponse> {
  return apiClient.get('/terminal/inventory/alerts');
}

export async function realCreateTerminalConsumptionRecord(
  data: TerminalConsumptionRecordCreateRequest,
): Promise<TerminalConsumptionRecordCreateRequest & { id: number; createdAt: string }> {
  return apiClient.post('/terminal/consumption-records', data);
}

export async function realCreateTerminalServiceRecord(
  data: TerminalServiceRecordCreateRequest,
): Promise<TerminalServiceRecordResponse> {
  return apiClient.post('/terminal/service-records', data);
}

export async function realUpdateTerminalServiceRecord(
  taskId: number,
  data: TerminalServiceRecordCreateRequest,
): Promise<TerminalServiceRecordResponse> {
  return apiClient.put(`/terminal/tasks/${taskId}/service-record`, data);
}

export async function realCreateTerminalSkinTest(data: TerminalCreateSkinTestRequest): Promise<TerminalSkinTest> {
  return apiClient.post('/terminal/skin-tests', data);
}

export async function realGetTerminalSkinTests(params?: { customerId?: number }): Promise<TerminalSkinTest[]> {
  return apiClient.get('/terminal/skin-tests', { params });
}

export async function realGetTerminalSkinTestById(id: number): Promise<TerminalSkinTest | undefined> {
  return apiClient.get(`/terminal/skin-tests/${id}`);
}

export async function realBindTerminalSkinTestCustomer(id: number, customerId: number): Promise<TerminalSkinTest> {
  return apiClient.post(`/terminal/skin-tests/${id}/bind-customer`, { customerId });
}

export async function realGetTerminalSkinTestRecommendations(id: number): Promise<TerminalRecommendation[]> {
  return apiClient.get(`/terminal/skin-tests/${id}/recommendations`);
}

export async function realGetTerminalCustomerRecommendations(customerId: number): Promise<TerminalRecommendation[]> {
  return apiClient.get(`/terminal/customers/${customerId}/recommendations`);
}

export async function realGetTerminalCustomerNextBestActions(customerId: number): Promise<TerminalNextBestActionsResponse> {
  return apiClient.get(`/terminal/customers/${customerId}/next-best-actions`);
}

export async function realRecordTerminalRecommendationEvent(
  data: TerminalRecommendationEventRequest,
): Promise<{ id: number; createdAt: string }> {
  return apiClient.post('/terminal/recommendation-events', data);
}

export async function realCreateTerminalFollowUpTask(data: TerminalFollowUpTaskCreateRequest): Promise<TerminalFollowUpTask> {
  return apiClient.post('/terminal/follow-up-tasks', data);
}

export async function realCompleteTerminalFollowUpTask(
  id: number,
  data: TerminalFollowUpTaskCompleteRequest,
): Promise<TerminalFollowUpTask> {
  return apiClient.patch(`/terminal/follow-up-tasks/${id}/complete`, data);
}

export async function realGetTerminalPromotions(params?: { customerId?: number; projectId?: number }): Promise<TerminalPromotion[]> {
  return apiClient.get('/terminal/promotions/available', { params });
}
