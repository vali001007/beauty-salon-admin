import apiClient from '../client';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export type CommissionType = 'project' | 'product' | 'card_sale' | 'recharge' | 'new_customer';
export type CommissionTargetType = 'all' | 'category' | 'specific';
export type CommissionStatus = 'active' | 'disabled' | 'archived';
export type CommissionRecordStatus = 'pending' | 'confirmed' | 'settled' | 'cancelled';
export type CommissionSettlementStatus = 'draft' | 'confirmed' | 'paid';
export type CashierShiftStatus = 'open' | 'closed' | 'reconciled';
export type DailySettlementStatus = 'draft' | 'confirmed';
export type AmiBillStatus = 'draft' | 'confirmed' | 'invoiced' | 'paid' | 'voided';

export interface AmiPerformanceRecord {
  id: number;
  storeId: number;
  storeName?: string;
  category: string;
  triggerType: string;
  triggerId?: number;
  customerId?: number;
  customerName?: string;
  orderId?: number;
  orderNo?: string;
  revenueAmount?: number;
  commissionRate?: number;
  commissionAmount?: number;
  workMinutes?: number;
  occurredAt: string;
  settleMonth: string;
  version?: number;
  metadata?: Record<string, unknown>;
}

export interface AmiMonthlyBill {
  id: number;
  storeId: number;
  storeName?: string;
  settleMonth: string;
  baseFee: number;
  commissionFee: number;
  totalFee: number;
  revenueGenerated: number;
  roi?: number;
  breakdown?: {
    items?: Array<{ category: string; count: number; revenueAmount: number; commissionAmount: number; workMinutes: number }>;
    recordCount?: number;
    workMinutes?: number;
    rawCommissionFee?: number;
    commissionCap?: number;
  };
  status: AmiBillStatus;
  confirmedBy?: number;
  confirmedAt?: string;
  invoicedAt?: string;
  paidAt?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt?: string;
}

export interface AmiDashboardSummary {
  settleMonth: string;
  revenueGenerated: number;
  commissionAmount: number;
  workMinutes: number;
  totalFee: number;
  roi: number;
  recordCount: number;
  billCount: number;
  categories: Array<{ category: string; count: number; revenueAmount: number; commissionAmount: number; workMinutes: number }>;
}

export interface PlatformRevenueSummary {
  period: string;
  value?: string;
  months: string[];
  amiSubscription: {
    total: number;
    storeCount: number;
    records?: Array<{ id: number; storeId: number; storeName?: string; settleMonth: string; amount: number }>;
  };
  amiCommission: {
    total: number;
    avgPerStore: number;
    records?: Array<{ id: number; storeId: number; storeName?: string; settleMonth: string; amount: number }>;
  };
  supplyChainRebate: {
    total: number;
    orderCount: number;
    records?: Array<{ id: number; supplierId: number; supplierName?: string; settleMonth: string; amount: number }>;
  };
  supplyChainFee: {
    total: number;
    records?: Array<{ id: number; supplierId: number; supplierName?: string; settleMonth: string; amount: number }>;
  };
  totalRevenue: number;
  estimatedRevenue: number;
  monthOverMonth: number;
  arpu: number;
  ltvEstimate: number;
  annualizedRevenueEstimate: number;
  storeRanking: Array<{ storeId: number; storeName: string; amiSubscription: number; amiCommission: number; totalRevenue: number }>;
  monthTrend: Array<{
    month: string;
    amiSubscription: number;
    amiCommission: number;
    supplyChainRebate: number;
    supplyChainFee: number;
    totalRevenue: number;
  }>;
}

export interface CommissionRule {
  id: number;
  storeId: number;
  storeName?: string;
  name: string;
  type: CommissionType;
  targetType: CommissionTargetType;
  targetId?: number;
  levelId?: number;
  level?: { id: number; name: string };
  userId?: number;
  user?: { id: number; name: string; username?: string };
  rate: number;
  fixedAmount?: number;
  calcBase: string;
  isDesignated: boolean;
  designatedBonus?: number;
  minThreshold?: number;
  status: CommissionStatus;
  priority: number;
  assignments?: Array<{ id: number; status: CommissionStatus }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommissionRuleAssignment {
  id: number;
  storeId: number;
  storeName?: string;
  ruleId: number;
  rule?: CommissionRule;
  ruleName?: string;
  type: CommissionType;
  targetType: CommissionTargetType;
  targetId?: number;
  userId: number;
  user?: { id: number; name: string; username?: string };
  userName?: string;
  status: CommissionStatus;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommissionRecord {
  id: number;
  storeId: number;
  storeName?: string;
  staffUserId?: number;
  staffUserName?: string;
  beauticianId?: number;
  beauticianName?: string;
  orderId?: number;
  orderNo?: string;
  orderItem?: { id: number; name?: string; itemType?: string };
  cardUsageRecord?: { id: number; cardName?: string; projectName?: string };
  ruleName?: string;
  assignmentId?: number;
  assignmentName?: string;
  type: CommissionType;
  sourceAmount: number;
  rate: number;
  amount: number;
  status: CommissionRecordStatus;
  settleMonth?: string;
  remark?: string;
  createdAt?: string;
}

export type UpdateCommissionRecordInput = Partial<{
  staffUserId: number;
  sourceAmount: number;
  rate: number;
  amount: number;
  remark: string;
}>;

export interface CommissionSummary {
  totalAmount: number;
  pendingAmount: number;
  confirmedAmount: number;
  settledAmount: number;
  count: number;
  items: Array<{
    staffUserId?: number;
    staffUserName?: string;
    beauticianId?: number;
    beauticianName?: string;
    totalAmount: number;
    pendingAmount: number;
    confirmedAmount: number;
    settledAmount: number;
    count: number;
  }>;
}

export interface CommissionSettlementRecord {
  id?: number;
  settlementId?: number;
  commissionRecordId: number;
  amountSnapshot: number;
  statusSnapshot?: CommissionRecordStatus;
  createdAt?: string;
  commissionRecord?: CommissionRecord;
}

export interface CommissionSettlement {
  id: number;
  storeId: number;
  storeName?: string;
  staffUserId?: number;
  staffUserName?: string;
  beauticianId?: number;
  beauticianName?: string;
  settleMonth: string;
  projectAmount: number;
  productAmount: number;
  cardSaleAmount: number;
  rechargeAmount: number;
  otherAmount: number;
  totalAmount: number;
  deductions: number;
  netAmount: number;
  status: CommissionSettlementStatus;
  detailCount?: number;
  detailAmount?: number;
  settlementRecords?: CommissionSettlementRecord[];
  needsRegenerate?: boolean;
  regenerateReason?: string;
  regenerateDiffAmount?: number;
  regenerateMissingRecordCount?: number;
  regenerateChangedRecordCount?: number;
  confirmedAt?: string;
  paidAt?: string;
  paidBy?: number;
  paymentBatchNo?: string;
  paymentMethod?: string;
  paymentVoucherNo?: string;
}

export interface CashierShift {
  id: number;
  storeId: number;
  storeName?: string;
  deviceId?: number;
  deviceName?: string;
  operatorId?: number;
  operatorName?: string;
  operatorType: string;
  startedAt: string;
  endedAt?: string;
  status: CashierShiftStatus;
  openingCash: number;
  closingCash?: number;
  systemCash?: number;
  cashDiff?: number;
  summary?: Record<string, number>;
  alertLevel?: 'normal' | 'warning';
}

export interface PaymentRecord {
  id: number;
  orderId: number;
  orderNo?: string;
  checkoutGroupNo?: string;
  orderKind?: string;
  source?: string;
  customerName?: string;
  storeId?: number;
  storeName?: string;
  paymentNo: string;
  method: string;
  amount: number;
  status: string;
  transactionNo?: string;
  paidAt?: string;
  createdAt?: string;
}

export interface RefundRecord {
  id: number;
  orderId: number;
  orderNo?: string;
  orderKind?: string;
  customerName?: string;
  storeId?: number;
  storeName?: string;
  refundNo: string;
  amount: number;
  reason?: string;
  status: string;
  payMethod?: string;
  refundedAt?: string;
  createdAt?: string;
}

export interface ReconciliationException {
  id: string | number;
  storeId?: number;
  date: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  actionTarget: 'daily' | 'payments' | 'refunds' | 'shifts' | string;
  sourceId?: number;
  amountDiff?: number;
  status?: 'open' | 'acknowledged' | 'resolved';
  category?: 'operating_exception' | 'data_integrity' | 'automation_failure';
  actionPath?: string;
}

export interface FinanceReconciliationRun {
  id: number;
  storeId: number;
  dailySettlementId?: number;
  businessDate: string;
  triggerType: 'scheduled' | 'manual' | 'late_fact';
  status: 'running' | 'passed' | 'warning' | 'blocked' | 'failed';
  ruleVersion: string;
  summary?: { autoConfirmed?: boolean; blockingIssueCount?: number; warningCount?: number; issueCount?: number };
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

export interface FinanceReconciliationIssue {
  id: number;
  runId: number;
  storeId: number;
  dailySettlementId?: number;
  businessDate: string;
  code: string;
  category: 'operating_exception' | 'data_integrity' | 'automation_failure';
  severity: 'high' | 'medium' | 'low';
  status: 'open' | 'acknowledged' | 'resolved';
  title: string;
  detail: string;
  amount?: number;
  actionPath: string;
  acknowledgedAt?: string;
  lastDetectedAt: string;
  resolvedAt?: string;
}

export interface DailySettlementAdjustment {
  id: number;
  dailySettlementId: number;
  storeId: number;
  adjustmentType: string;
  effectField: string;
  amount: number;
  reason: string;
  voucherNo?: string;
  status: 'applied' | 'cancelled';
  createdBy: number;
  cancelledBy?: number;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface DailySettlementAdjustmentInput {
  adjustmentType: string;
  effectField: 'totalRevenue' | 'cashRevenue' | 'wechatRevenue' | 'alipayRevenue' | 'cardRevenue' | 'balanceRevenue' | 'rechargeIncome' | 'refundAmount' | 'materialCost' | 'commissionTotal';
  amount: number;
  reason: string;
  voucherNo?: string;
}

export interface DailySettlement {
  id: number;
  storeId: number;
  storeName?: string;
  settleDate: string;
  totalRevenue: number;
  cashRevenue: number;
  wechatRevenue: number;
  alipayRevenue: number;
  cardRevenue: number;
  balanceRevenue: number;
  rechargeIncome: number;
  prepaidIncome?: number;
  cardUsageRevenue?: number;
  refundAmount: number;
  orderCount: number;
  customerCount: number;
  avgTransaction: number;
  materialCost: number;
  grossProfit: number;
  grossMargin: number;
  commissionTotal: number;
  memberBalanceCashDeduct?: number;
  memberBalanceGiftDeduct?: number;
  status: DailySettlementStatus;
  confirmedAt?: string;
  confirmedBy?: number;
  version?: number;
  latestVersion?: number;
  needsRefresh?: boolean;
  reconciliationStatus?: 'pending' | 'running' | 'passed' | 'warning' | 'blocked' | 'failed';
  confirmationMode?: 'auto' | 'manual';
  latestReconciliationRunId?: number;
  systemSummary?: Record<string, number>;
  adjustmentSummary?: Record<string, number>;
  finalSummary?: Record<string, number>;
  summary?: Record<string, any>;
}

export interface DailySettlementSnapshot extends Omit<DailySettlement, 'status' | 'summary'> {
  dailySettlementId: number;
  version: number;
  snapshot: Record<string, unknown>;
  sourceDigest?: string;
  systemSummary?: Record<string, number>;
  adjustmentSummary?: Record<string, number>;
  finalSummary?: Record<string, number>;
  confirmationMode?: 'auto' | 'manual';
  reconciliationRunId?: number;
  ruleVersion?: string;
  confirmedAt: string;
}

export interface CommissionAdjustmentInput {
  type: 'deduction' | 'bonus' | 'refund_recovery' | 'correction';
  amount: number;
  reason: string;
  commissionRecordId?: number;
}

export interface CommissionPaymentInput {
  paymentBatchNo: string;
  paymentMethod: string;
  paymentVoucherNo: string;
}

function normalizePaginated<T>(response: any): PaginatedResponse<T> & { summary?: any } {
  const items = (response?.items ?? response?.data ?? []) as T[];
  return {
    items,
    data: items,
    total: Number(response?.total ?? items.length),
    page: Number(response?.page ?? 1),
    pageSize: Number(response?.pageSize ?? (items.length || 20)),
    summary: response?.summary,
  };
}

export async function realGetCommissionRules(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/rules', { params });
  return normalizePaginated<CommissionRule>(response);
}

export async function realCreateCommissionRule(data: Partial<CommissionRule>) {
  return apiClient.post('/commission/rules', data);
}

export async function realUpdateCommissionRule(id: number, data: Partial<CommissionRule>) {
  return apiClient.put(`/commission/rules/${id}`, data);
}

export async function realDeleteCommissionRule(id: number) {
  return apiClient.delete(`/commission/rules/${id}`);
}

export async function realGetCommissionRuleAssignments(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/rule-assignments', { params });
  return normalizePaginated<CommissionRuleAssignment>(response);
}

export async function realCreateCommissionRuleAssignment(data: Partial<CommissionRuleAssignment>) {
  return apiClient.post('/commission/rule-assignments', data);
}

export async function realUpdateCommissionRuleAssignment(id: number, data: Partial<CommissionRuleAssignment>) {
  return apiClient.put(`/commission/rule-assignments/${id}`, data);
}

export async function realDeleteCommissionRuleAssignment(id: number) {
  return apiClient.delete(`/commission/rule-assignments/${id}`);
}

export async function realBatchCreateCommissionRules(template = 'beauty_standard') {
  return apiClient.post('/commission/rules/batch', { template });
}

export async function realGetCommissionRecords(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/records/paginated', { params });
  return normalizePaginated<CommissionRecord>(response);
}

export async function realGetCommissionSummary(params: Record<string, unknown>) {
  return apiClient.get<unknown, CommissionSummary>('/commission/records/summary', { params });
}

export async function realConfirmCommissionRecord(id: number) {
  return apiClient.put(`/commission/records/${id}/confirm`);
}

export async function realUpdateCommissionRecord(id: number, data: UpdateCommissionRecordInput) {
  return apiClient.put<unknown, CommissionRecord>(`/commission/records/${id}`, data);
}

export async function realBatchConfirmCommissionRecords(data: { ids?: number[]; settleMonth?: string }) {
  return apiClient.put('/commission/records/batch-confirm', data);
}

export async function realGenerateCommissionSettlement(settleMonth: string) {
  return apiClient.post('/commission/settlements/generate', { settleMonth });
}

export async function realGetCommissionSettlements(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/settlements/paginated', { params });
  return normalizePaginated<CommissionSettlement>(response);
}

export async function realGetCommissionSettlement(id: number) {
  return apiClient.get<unknown, CommissionSettlement>(`/commission/settlements/${id}`);
}

export async function realConfirmCommissionSettlement(id: number) {
  return apiClient.put(`/commission/settlements/${id}/confirm`);
}

export async function realMarkCommissionSettlementPaid(id: number, data: CommissionPaymentInput) {
  return apiClient.put(`/commission/settlements/${id}/mark-paid`, data);
}

export async function realCreateCommissionAdjustment(id: number, data: CommissionAdjustmentInput) {
  return apiClient.post(`/commission/settlements/${id}/adjustments`, data);
}

export async function realExportCommissionSettlements(params: Record<string, unknown>) {
  return apiClient.get<unknown, string>('/commission/settlements/export', {
    params,
    responseType: 'text' as any,
  });
}

export async function realGetCurrentCashierShift(params?: Record<string, unknown>) {
  return apiClient.get<unknown, CashierShift | null>('/commission/shifts/current', { params });
}

export async function realGetCashierShiftHistory(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/shifts/history', { params });
  return normalizePaginated<CashierShift>(response);
}

export async function realOpenCashierShift(data: { openingCash?: number; operatorType?: string }) {
  return apiClient.post<unknown, CashierShift>('/commission/shifts/open', data);
}

export async function realCloseCashierShift(data: { shiftId?: number; closingCash: number }) {
  return apiClient.post<unknown, CashierShift>('/commission/shifts/close', data);
}

export async function realGetPaymentRecords(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/payment-records', { params });
  return normalizePaginated<PaymentRecord>(response);
}

export async function realGetRefundRecords(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/refund-records', { params });
  return normalizePaginated<RefundRecord>(response);
}

export async function realGetReconciliationExceptions(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/reconciliation-exceptions', { params });
  return normalizePaginated<ReconciliationException>(response);
}

export async function realGetDailySettlements(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/daily-settlements', { params });
  return normalizePaginated<DailySettlement>(response);
}

export async function realGenerateDailySettlement(date: string) {
  return apiClient.post<unknown, DailySettlement>('/commission/daily-settlements/generate', { date });
}

export async function realConfirmDailySettlement(id: number) {
  return apiClient.put<unknown, DailySettlement>(`/commission/daily-settlements/${id}/confirm`);
}

export async function realRunFinanceReconciliation(date: string) {
  return apiClient.post<unknown, FinanceReconciliationRun>('/commission/reconciliation-runs', { date });
}

export async function realGetFinanceReconciliationRuns(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/reconciliation-runs', { params });
  return normalizePaginated<FinanceReconciliationRun>(response);
}

export async function realGetFinanceReconciliationIssues(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/reconciliation-issues', { params });
  return normalizePaginated<FinanceReconciliationIssue>(response);
}

export async function realAcknowledgeFinanceReconciliationIssue(id: number) {
  return apiClient.put<unknown, FinanceReconciliationIssue>(`/commission/reconciliation-issues/${id}/acknowledge`);
}

export async function realReopenDailySettlement(id: number, reason: string) {
  return apiClient.post<unknown, DailySettlement>(`/commission/daily-settlements/${id}/reopen`, { reason });
}

export async function realGetDailySettlementVersions(id: number) {
  const response = await apiClient.get<unknown, any>(`/commission/daily-settlements/${id}/versions`);
  return (response?.items ?? response?.data ?? response ?? []) as DailySettlementSnapshot[];
}

export async function realCreateDailySettlementAdjustment(id: number, data: DailySettlementAdjustmentInput) {
  return apiClient.post<unknown, { adjustment: DailySettlementAdjustment; settlement: DailySettlement }>(`/commission/daily-settlements/${id}/adjustments`, data);
}

export async function realGetDailySettlementAdjustments(id: number) {
  const response = await apiClient.get<unknown, any>(`/commission/daily-settlements/${id}/adjustments`);
  return (response?.items ?? response?.data ?? response ?? []) as DailySettlementAdjustment[];
}

export async function realCancelDailySettlementAdjustment(id: number, adjustmentId: number, reason: string) {
  return apiClient.put<unknown, { adjustment: DailySettlementAdjustment; settlement: DailySettlement }>(`/commission/daily-settlements/${id}/adjustments/${adjustmentId}/cancel`, { reason });
}

export async function realGetAmiPerformanceRecords(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/ami/performance', { params });
  return normalizePaginated<AmiPerformanceRecord>(response);
}

export async function realGetAmiMonthlyBills(params: PaginationParams & Record<string, unknown>) {
  const response = await apiClient.get('/commission/ami/bills', { params });
  return normalizePaginated<AmiMonthlyBill>(response);
}

export async function realGenerateAmiMonthlyBill(settleMonth: string) {
  return apiClient.post<unknown, AmiMonthlyBill>('/commission/ami/bills/generate', { settleMonth });
}

export async function realTransitionAmiMonthlyBill(id: number, status: Exclude<AmiBillStatus, 'draft'>, reason?: string) {
  return apiClient.put<unknown, AmiMonthlyBill>(`/commission/ami/bills/${id}/status`, { status, reason });
}

export async function realGetAmiDashboard(params: Record<string, unknown>) {
  return apiClient.get<unknown, AmiDashboardSummary>('/commission/ami/dashboard', { params });
}

export async function realGetPlatformRevenue(params: { period?: string; value?: string }) {
  return apiClient.get<unknown, PlatformRevenueSummary>('/commission/platform/revenue', { params });
}
